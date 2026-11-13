#!/usr/bin/env node
/**
 * tools/radar-feedback.js —— 采用反馈闭环（让选题雷达越用越懂你的定位）
 * ------------------------------------------------------------------
 * 这是 A·采用反馈闭环的数据层。它记录「你把哪条选题真写成了文章」，
 * topic-fit-scorer 据此给相似选题加权、给长期跳过的类型降权 —— 雷达开始
 * 学你的口味，而不只是按我手写的静态定位画像筛。
 *
 * 记录入口：
 *   1) auto-writer.js 落稿成功后自动调 recordAdoption()（采用事件 = 用户选了这条选题）
 *   2) 你也可手动：node tools/radar-feedback.js --adopt --title "..." [--source S] [--col C] [--keyword K]
 *   3) 明确不写：  node tools/radar-feedback.js --skip --title "..."
 *
 * 衰减：采用/跳过信号带 90 天半衰期（旧偏好自动让位给新方向）。
 *
 * 数据：D:\1\1\.tmp\topic-radar\feedback.json
 * 硬规矩：只读 + 落盘。不改文章、不构建、不部署。
 */
'use strict';

const fs = require('fs');
const path = require('path');
// 单向依赖 scorer（scorer 不要顶层 require 本文件，避免循环依赖）
const { COLUMN_KEYWORDS, scoreCandidate } = require('./topic-fit-scorer');
const { COLUMN_PILLAR } = require('./positioning-profile');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.resolve(ROOT, '..', '.tmp', 'topic-radar');
const FEEDBACK_FILE = path.join(TMP, 'feedback.json');

const HALF_LIFE_DAYS = 90;
const HALF_LIFE_MS = HALF_LIFE_DAYS * 86400000;
const MAX_ADOPTED = 200;

function loadFeedback() {
  if (!fs.existsSync(FEEDBACK_FILE)) return { adopted: [], skipped: [], updatedAt: null };
  try {
    const j = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'));
    return { adopted: j.adopted || [], skipped: j.skipped || [], updatedAt: j.updatedAt || null };
  } catch (e) {
    return { adopted: [], skipped: [], updatedAt: null };
  }
}

function saveFeedback(fb) {
  fs.mkdirSync(TMP, { recursive: true });
  fb.updatedAt = new Date().toISOString();
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(fb, null, 2), 'utf8');
}

/** 从一条标题里抽取命中定位画像的关键词（= 采用信号的特征向量） */
function extractKeywords(text) {
  const lower = String(text || '').toLowerCase();
  const hits = [];
  for (const kws of Object.values(COLUMN_KEYWORDS)) {
    for (const kw of kws) if (lower.includes(kw.toLowerCase())) hits.push(kw);
  }
  return [...new Set(hits)];
}

function pillarOf(col) {
  return COLUMN_PILLAR[col] || null;
}

/**
 * 把反馈转成「关键词 → 权重」，带半衰期衰减。
 * adoptW：采用偏好（相似选题加权，30 天内采纳的更强）
 * skipW：长期跳过的类型（降权）
 */
function buildWeights(fb) {
  const now = Date.now();
  const adoptW = {};
  const skipW = {};
  for (const a of fb.adopted || []) {
    const at = new Date(a.at || now).getTime();
    const age = now - at;
    const decay = Math.pow(0.5, age / HALF_LIFE_MS);
    const base = age < 30 * 86400000 ? 2 : 1; // 近 30 天采纳的偏好更强
    const w = base * decay;
    for (const k of a.keywords || []) adoptW[k] = (adoptW[k] || 0) + w;
  }
  for (const s of fb.skipped || []) {
    const at = new Date(s.at || now).getTime();
    const age = now - at;
    const decay = Math.pow(0.5, age / HALF_LIFE_MS);
    const w = 1 * decay;
    for (const k of s.keywords || []) skipW[k] = (skipW[k] || 0) + w;
  }
  return { adoptW, skipW };
}

/** 记录采用事件（auto-writer 落稿时调用 / CLI）。返回抽到的特征关键词。 */
function recordAdoption({ title, source, col, pillar, keyword }) {
  const fb = loadFeedback();
  const kws = extractKeywords(title);
  if (keyword && !kws.includes(keyword)) kws.push(keyword);
  fb.adopted.push({
    title: String(title || ''),
    source: source || '',
    col: col || '',
    pillar: pillar || pillarOf(col) || '',
    keywords: kws,
    at: new Date().toISOString(),
  });
  if (fb.adopted.length > MAX_ADOPTED) fb.adopted = fb.adopted.slice(-MAX_ADOPTED);
  saveFeedback(fb);
  return { ok: true, keywords: kws };
}

// ---------------- CLI ----------------
if (require.main === module) {
  const argv = process.argv.slice(2);
  const get = (n) => {
    const i = argv.findIndex((a) => a === n || a.startsWith(n + '='));
    if (i < 0) return '';
    const a = argv[i];
    return a.includes('=') ? a.slice(a.indexOf('=') + 1) : (argv[i + 1] || '');
  };
  const title = get('--title');

  if (argv.includes('--adopt')) {
    if (!title) {
      console.error('用法：node tools/radar-feedback.js --adopt --title "..." [--source S] [--col C] [--keyword K]');
      process.exit(1);
    }
    const r = recordAdoption({ title, source: get('--source'), col: get('--col'), keyword: get('--keyword') });
    console.log('✅ 已记录采用：' + title + ' ｜ 特征关键词 ' + (r.keywords.join('、') || '（无命中定位词）'));
  } else if (argv.includes('--skip')) {
    if (!title) {
      console.error('用法：node tools/radar-feedback.js --skip --title "..."');
      process.exit(1);
    }
    const fb = loadFeedback();
    fb.skipped.push({ title, keywords: extractKeywords(title), at: new Date().toISOString() });
    saveFeedback(fb);
    console.log('✅ 已记录跳过：' + title);
  } else if (argv.includes('--show')) {
    const fb = loadFeedback();
    const { adoptW, skipW } = buildWeights(fb);
    const topAdopt = Object.entries(adoptW).sort((a, b) => b[1] - a[1]).slice(0, 15)
      .map(([k, v]) => k + '=' + v.toFixed(1)).join('、') || '（暂无）';
    const topSkip = Object.entries(skipW).sort((a, b) => b[1] - a[1]).slice(0, 15)
      .map(([k, v]) => k + '=' + v.toFixed(1)).join('、') || '（暂无）';
    console.log('采用事件数：' + fb.adopted.length + ' ｜ 跳过事件数：' + fb.skipped.length);
    console.log('采用偏好关键词(Top)：' + topAdopt);
    console.log('跳过降权关键词(Top)：' + topSkip);
  } else {
    console.error('用法：\n' +
      '  node tools/radar-feedback.js --adopt --title "..." [--source S] [--col C] [--keyword K]\n' +
      '  node tools/radar-feedback.js --skip --title "..."\n' +
      '  node tools/radar-feedback.js --show');
    process.exit(1);
  }
}

module.exports = { loadFeedback, saveFeedback, buildWeights, recordAdoption, extractKeywords, FEEDBACK_FILE };
