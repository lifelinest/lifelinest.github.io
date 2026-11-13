#!/usr/bin/env node
/**
 * 文章摘要生成器 — 取代付费墨洪AI
 *
 * 思路：在「构建期」用自有 DeepSeek key 为每篇文章生成 ai: 摘要字段，
 *       写进 source/_posts 的 front-matter。AnZhiYu 主题 mode:local 直接静态展示，
 *       浏览器端零请求、密钥不暴露、运行期成本归零。
 *
 * 安全红线：
 *   - key 仅来自 环境变量 DEEPSEEK_API_KEY 或 gitignored 的 ai-summary-key.local
 *   - 脚本绝不把 key 写回 git、绝不写进任何页面/HTML
 *   - 只写 ai: 字段，不碰正文 / tags / 标题 / abbrlink / URL
 *
 * 用法：
 *   node tools/ai-summary.js                 # 全量补（跳过已有 ai:）
 *   node tools/ai-summary.js --force         # 全量重生成（覆盖已有 ai:）
 *   node tools/ai-summary.js --slug=<abbrlink|文件名>   # 单篇
 *   node tools/ai-summary.js --en            # 仅处理英文版(-en.md)
 *   node tools/ai-summary.js --slug=<x> --force
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// DeepSeek 标准定价（¥/token），用于费用报告；缓存命中价更低，此处取保守值
const PRICE_IN = 1 / 1e6;
const PRICE_OUT = 2 / 1e6;

const ROOT = path.join(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'source', '_posts');
const KEY_FILE = path.join(ROOT, 'ai-summary-key.local');
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const API_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1/chat/completions';

function getKey() {
  if (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim()) return process.env.DEEPSEEK_API_KEY.trim();
  if (fs.existsSync(KEY_FILE)) {
    const k = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (k) return k;
  }
  throw new Error('未找到 DeepSeek key：请设置环境变量 DEEPSEEK_API_KEY 或在 ai-summary-key.local 填写');
}

function splitFrontMatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: '', body: raw };
  return { fm: m[1], body: raw.slice(m[0].length) };
}
function fmGet(fm, key) {
  const re = new RegExp('^' + key + '\\s*:\\s*(.*)$', 'm');
  const mm = fm.match(re);
  return mm ? mm[1].trim() : '';
}
function hasAi(fm) { return /^ai\s*:/m.test(fm); }

function toPlain(body) {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/[*_>`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPrompt(title, plain, lang, kw) {
  const clip = plain.slice(0, 4000);
  if (lang === 'en') {
    const kwLine = kw ? '\nKeywords (weave in naturally if relevant): ' + kw + '\n' : '';
    return 'You are a senior B2B industrial-website editor and SEO/GEO specialist. ' +
      'From the TITLE, KEYWORDS and BODY below, write exactly 3 short, independent English sentences ' +
      'that summarize the core takeaways and an actionable conclusion.\n' +
      'Rules:\n' +
      '1. The FIRST sentence states the core conclusion or biggest value — no setup.\n' +
      '2. Weave the keywords in naturally when relevant; do NOT stuff them.\n' +
      '3. Separate the 3 sentences with a single ASCII comma ", ". No other comma inside a sentence.\n' +
      '4. No markdown, no quotes, no numbering. Each sentence 8-30 words.\n' +
      '5. Never start with "This article", "In this post", or "Today".\n\n' +
      'TITLE: ' + title + kwLine + 'BODY: ' + clip;
  }
  const kwLine = kw ? '\n关键词（如相关请自然融入，勿堆砌）：' + kw + '\n' : '';
  return '你是一位资深的中文外贸独立站内容编辑，也是 SEO/GEO 优化专家。根据下面文章的标题、关键词和正文，' +
    '写出恰好 3 句独立、简洁的中文摘要，概括核心要点与可操作的结论。\n要求：\n' +
    '1. 第 1 句直接给出本文核心结论或最大价值，不要铺垫。\n' +
    '2. 如相关，自然融入给出的关键词，不要生硬堆砌。\n' +
    '3. 用半角逗号 "," 分隔这 3 句话，句子内部不要出现其他逗号。\n' +
    '4. 禁止以「本文/这篇文章/该文/今天/随着/在……中」等废话开头。\n' +
    '5. 不要使用任何 Markdown 或引号，不要加编号。每句 15-40 字。\n\n' +
    '标题：' + title + kwLine + '正文：' + clip;
}

function systemFor(lang) {
  return lang === 'en'
    ? 'Output only the requested comma-separated summary. No extra text.'
    : '只输出要求的逗号分隔摘要，不要多余解释。';
}

async function callDeepSeek(key, prompt, lang) {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemFor(lang) },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 400
    })
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error('DeepSeek HTTP ' + resp.status + ': ' + t.slice(0, 200));
  }
  const data = await resp.json();
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('DeepSeek 返回结构异常: ' + JSON.stringify(data).slice(0, 200));
  }
  return {
    text: data.choices[0].message.content.trim(),
    usage: data.usage || {}
  };
}

function sanitizeSummary(s, lang) {
  // 统一所有「句末/分隔」符号后，用半角逗号+空格重连。
  // 必须这么做：主题 ai_abstract.js 是 postAI.split(",") 切多条轮换，
  // 模型若用「。！？；」收句，整段就会变成一个不可轮换的长块。
  // 注意：不拆「、」（顿号是句内列表分隔），也不拆 ASCII 句点（避免误伤 3.5 这类小数）。
  let t = String(s)
    .replace(/\r?\n+/g, '。')
    .replace(/，/g, ',')
    .replace(/[；;]/g, '。')
    .replace(/[！!]/g, '。')
    .replace(/[？?]/g, '。')
    .replace(/。/g, ',');
  if (lang === 'en') t = t.replace(/\.\s+/g, ', ');
  return t.split(',')
    .map(x => x.replace(/^[\s"'"'""''‘’“”,.]+|[\s"'"'""''‘’“”,.]+$/g, '').trim())
    .filter(Boolean).join(', ');
}

function validateSummary(s, title, lang) {
  // 质量护栏：句数/长度/废话开头/与标题重复。返回 null 表示通过，否则返回未过原因。
  if (!s || !s.trim()) return '空';
  const parts = s.split(',').map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return '句数<2';
  const norm = t => String(t).replace(/[\s，。、：:,.!！?？"'\-—]/g, '');
  for (const p of parts) {
    if (lang === 'zh') {
      if (p.length < 8 || p.length > 50) return '单句长度异常:' + p.slice(0, 16);
    } else {
      const w = p.split(/\s+/).filter(Boolean).length;
      if (w < 4 || w > 45) return 'EN句长异常:' + p.slice(0, 24);
    }
  }
  const badZh = /^(本文|这篇文章|该文|今天|随着|在.{1,8}中|近年来)/;
  const badEn = /^(this article|in this (post|article)|today,|recently,)/i;
  if ((lang === 'zh' ? badZh : badEn).test(parts[0])) return '废话开头';
  const nt = norm(title), np0 = norm(parts[0]);
  if (nt && np0 && (np0.includes(nt) || nt.includes(np0))) return '与标题重复';
  return null;
}

function yamlQuote(s) {
  // 双引号包裹，转义反斜杠与双引号，换行压成空格，避免值内 "冒号+空格" 等打断 YAML
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ') + '"';
}

function injectAi(raw, summary, force) {
  const { fm } = splitFrontMatter(raw);
  if (hasAi(fm) && !force) return raw; // 已在 front-matter 内且非强制：不改
  const val = yamlQuote(summary);
  // 清掉任何误置于 front-matter 外（或旧值）的 ai: 行，统一重新插入到 front-matter 内
  const cleaned = raw.replace(/^ai\s*:.*$(\r?\n)?/gm, '');
  return cleaned.replace(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/, (m, fmk) => {
    return '---\n' + fmk + '\nai: ' + val + '\n---\n';
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function processFile(file, key, opts, stats) {
  const raw = fs.readFileSync(file, 'utf8');
  const { fm, body } = splitFrontMatter(raw);
  if (!fm) return { skip: 'no front-matter' };
  if (hasAi(fm) && !opts.force) return { skip: 'has ai' };
  let fmObj = {};
  try { fmObj = yaml.load(fm) || {}; } catch (_) {}
  const title = (fmObj.title || fmGet(fm, 'title') || path.basename(file, '.md')).toString();
  const lang = fmGet(fm, 'i18n_lang') === 'en' ? 'en' : 'zh';
  const tagArr = Array.isArray(fmObj.tags) ? fmObj.tags : (fmObj.tags ? [fmObj.tags] : []);
  const catArr = Array.isArray(fmObj.categories) ? fmObj.categories : (fmObj.categories ? [fmObj.categories] : []);
  const kw = [...tagArr, ...catArr].map(String).filter(Boolean).join(lang === 'en' ? ', ' : '、');
  const plain = toPlain(body);
  if (plain.length < 30) return { skip: 'body too short' };
  const prompt = buildPrompt(title, plain, lang, kw);
  let summary = null, lastReason = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await callDeepSeek(key, prompt, lang);
      stats.in += r.usage.prompt_tokens || 0;
      stats.out += r.usage.completion_tokens || 0;
      const sum = sanitizeSummary(r.text, lang);
      const reason = validateSummary(sum, title, lang);
      if (!reason) { summary = sum; break; }
      lastReason = reason;
      if (attempt === 3) { summary = sum; } // 三次都不过，接受末次避免空框
      else await sleep(800 * attempt);
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(800 * attempt);
    }
  }
  if (!summary) return { skip: 'empty summary' };
  if (lastReason) console.log('  ⚠ 质检未达标(' + lastReason + ')，已接受末次: ' + summary.slice(0, 40));
  const newRaw = injectAi(raw, summary, opts.force);
  fs.writeFileSync(file, newRaw, 'utf8');
  return { ok: true, summary };
}

async function main() {
  const args = process.argv.slice(2);
  const opts = {
    force: args.includes('--force'),
    en: args.includes('--en'),
    slug: null
  };
  for (const a of args) {
    if (a.startsWith('--slug=')) opts.slug = a.slice(7);
  }
  const key = getKey();

  let names = fs.readdirSync(POSTS_DIR).filter(f => /\.md$/i.test(f));
  if (opts.en) names = names.filter(f => /-en\.md$/i.test(f));
  else names = names.filter(f => !/-en\.md$/i.test(f));

  let targets = names.map(f => path.join(POSTS_DIR, f));
  if (opts.slug) {
    targets = targets.filter(p => {
      const base = path.basename(p, '.md');
      if (base === opts.slug) return true;
      const { fm } = splitFrontMatter(fs.readFileSync(p, 'utf8'));
      return fmGet(fm, 'abbrlink') === opts.slug || fmGet(fm, 'i18n_source') === opts.slug;
    });
    if (targets.length === 0) {
      console.error('未找到匹配 --slug=' + opts.slug + ' 的文章');
      process.exit(2);
    }
  }

  let done = 0, skip = 0, err = 0;
  const stats = { in: 0, out: 0 };
  const CONC = opts.slug ? 1 : 2;
  for (let i = 0; i < targets.length; i += CONC) {
    const batch = targets.slice(i, i + CONC);
    const res = await Promise.all(batch.map(p =>
      processFile(p, key, opts, stats).then(r => ({ p, r })).catch(e => ({ p, err: e.message }))
    ));
    for (const { p, r, err: em } of res) {
      if (em) { err++; console.error('ERR ', path.basename(p), '-', em); }
      else if (r.skip) { skip++; console.log('SKIP', path.basename(p), '-', r.skip); }
      else { done++; console.log('OK  ', path.basename(p), '=>', r.summary.slice(0, 70)); }
    }
  }
  const cost = stats.in * PRICE_IN + stats.out * PRICE_OUT;
  console.log('\n完成: 生成 ' + done + ' / 跳过 ' + skip + ' / 失败 ' + err + ' / 共 ' + targets.length);
  console.log('费用预估: 输入 ' + stats.in + ' tok + 输出 ' + stats.out + ' tok ≈ ¥' + cost.toFixed(4) +
    ' (deepseek-chat 标准价；命中缓存更低)');
  console.log('对比: 墨洪AI 按次/按量计费且每次访问都可能花钱；本次为一次性构建成本，运行期 0 请求。');
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
