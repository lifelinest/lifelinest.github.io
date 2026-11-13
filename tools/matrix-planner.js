#!/usr/bin/env node
/**
 * tools/matrix-planner.js —— 矩阵规划器（让模式 B 真正跑起来）
 * ------------------------------------------------------------------
 * 把「一个种子（链接/关键词）」展开成一套符合定位的内容矩阵规划：
 *   1 支柱页（pillar，承主关键词、接收所有下游内链）
 *   + 2~3 集群页（cluster，子话题）
 *   + 1~2 长尾页（long-tail，具体问题/长尾问句）
 * 并给出每篇的：目标栏目 / 建议标签 / 目标关键词 / 搜索意图 / 内链 spec；
 * 再用 find-related-posts 拉出「可链向的现有文章」，让新内容天然接入站内图谱。
 *
 * 用法：
 *   node tools/matrix-planner.js --seed="外贸B2B独立站 用AI写开发信"
 *   node tools/matrix-planner.js --seed="..." --column="外贸B2B独立站" --pillar="外贸B2B独立站实战"
 *   node tools/matrix-planner.js --seed="..." --clusters=3 --longtails=2
 *   node tools/matrix-planner.js --seed="..." --json out.json --no-related
 *
 * 注意：标题只是「模板候选」，最终措辞由 AI 在模式 A 成稿时定；本工具负责
 * 结构、栏目、标签、关键词、内链拓扑与现有文章对接点。红线：标签必须从白名单取，
 * 这里给的是建议，写文时务必过 check-tags.js 复核。
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { buildProfile, COLUMN_PILLAR, PILLARS } = require('./positioning-profile');
const { MINORS } = require('./check-tags');
const { scoreCandidate } = require('./topic-fit-scorer');

const args = process.argv.slice(2);
// 同时支持 `--x=val` 与 `--x val` 两种写法（曾因只认等号而静默丢参数）
const getA = (n, d) => {
  const i = args.findIndex((a) => a === n || a.startsWith(n + '='));
  if (i === -1) return d;
  const a = args[i];
  if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
  const nx = args[i + 1];
  return nx && !nx.startsWith('--') ? nx : d;
};
const seed = getA('--seed', '');
const forcedCol = getA('--column', '');
const forcedPillar = getA('--pillar', '');
const nClusters = parseInt(getA('--clusters', '3'), 10);
const nLong = parseInt(getA('--longtails', '1'), 10);
const jsonOut = getA('--json', '');
const noRelated = args.includes('--no-related');
const FORCE = args.includes('--force');   // 强制为被判 DROP 的种子出矩阵（默认拒绝，保护定位）

if (!seed) {
  console.error('用法：node tools/matrix-planner.js --seed="<种子关键词或链接>" [--column=...] [--pillar=...] [--clusters=3] [--longtails=1] [--json <path>] [--no-related]');
  process.exit(1);
}

const prof = buildProfile();

// ---------------- 标签建议池（红线区：只能从 80 词白名单取）----------------
// 教训：早先这里硬编码过 `B2B`/`SEO优化`/`客户开发` 等词，全部不在白名单内 ——
// 一旦照此写文就会污染 /tags/ 页。故改为「真实数据驱动 + 白名单断言」：
//   ① 从站内同栏目已发文章的 tags 频次统计（站内真实惯用，且已通过 check-tags 校验）；
//   ② 叠加该支柱的「意图导向」白名单词（因为支柱文章的标签池目前偏工具味）；
//   ③ 任何不在白名单内的词一律剔除并告警，绝不流入建议。
const PILLAR_TAG_HINTS = {
  外贸B2B独立站: ['行业观察', '职场技能', '知识总结', '避坑指南', '效率提升'],
  'AI内容增长': ['人工智能', '知识总结', '行业观察', '避坑指南', '效率提升'],
  'SEO与Google Ads': ['行业观察', '知识总结', '技术踩坑', '认知升级', '深度思考'],
};
const FALLBACK_POOL = {
  效率工具与软件: ['效率软件', '免费工具', '工具教程'],
  博客建站与前端: ['技术踩坑', '工具教程', '开源项目', '前端开发'],
  数字生活: ['生活技巧', '日常点滴', '生活感悟'],
};

function tagPoolFor(column) {
  const freq = {};
  for (const p of prof.perPost) {
    if (p.col !== column) continue;
    for (const t of p.tags) if (MINORS.has(t)) freq[t] = (freq[t] || 0) + 1;
  }
  const fromPosts = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const hints = (PILLAR_TAG_HINTS[column] || []).filter((t) => MINORS.has(t));
  const pool = [];
  // 先 1 个支柱意图词打头，再站内真实高频词，再剩余意图词，最后兜底
  for (const t of [...hints.slice(0, 1), ...fromPosts, ...hints.slice(1), ...(FALLBACK_POOL[column] || [])]) {
    if (t && !pool.includes(t)) pool.push(t);
  }
  const dropped = pool.filter((t) => !MINORS.has(t));
  if (dropped.length) console.warn('⚠️ 已剔除不在白名单内的标签建议：' + dropped.join('、'));
  return pool.filter((t) => MINORS.has(t)).slice(0, 8);
}

// 定栏目 / 支柱：参数优先 → 定位筛选器判种子命中的支柱栏目 → 兜底取最缺支柱。
// ⚠️ 早先直接回退「最缺支柱」，会把 AI 类种子硬塞进 SEO 栏目（栏目与主题不搭）。
let column = forcedCol;
let pillar = forcedPillar;
let colSource = forcedCol ? '命令行指定' : '';
if (!column) {
  const fit = scoreCandidate(seed, prof);
  if (fit.bestCol && COLUMN_PILLAR[fit.bestCol] && fit.decision !== 'DROP') {
    column = fit.bestCol;
    pillar = COLUMN_PILLAR[fit.bestCol];
    colSource = '定位筛选器判定：种子命中支柱栏目「' + fit.bestCol + '」（' + fit.reason + '）';
  } else if (fit.decision === 'DROP' && !FORCE) {
    // 红线：跑偏（off-brand）或已过剩栏目的种子，不该被硬塞进支柱栏目 —— 拒绝出矩阵。
    console.error('✗ 拒绝为「' + seed + '」出矩阵：定位筛选器判为 DROP。');
    console.error('  理由：' + fit.reason);
    console.error('  若确认要写，请显式指定栏目（--column=<6栏目之一>）或加 --force 强制回退到最缺支柱。');
    process.exit(1);
  } else {
    const topShort = prof.shortfall[0];
    const entry = Object.entries(PILLARS).find(([p]) => p === topShort.pillar);
    column = entry ? entry[1][0] : Object.keys(prof.columns)[0];
    pillar = topShort.pillar;
    colSource = '种子未能归类到支柱栏目' + (fit.bestCol ? '（被判为「' + fit.bestCol + '」，' + fit.decision + '）' : '') +
      '，回退到实时最缺支柱「' + pillar + '」';
  }
}
if (!pillar && COLUMN_PILLAR[column]) pillar = COLUMN_PILLAR[column];

const tagPool = tagPoolFor(column);
if (tagPool.length < 2) {
  console.error('✗ 栏目「' + column + '」在 80 词白名单内可用的标签不足 2 个，拒绝给出建议（check-tags 要求 2~5 个）。');
  process.exit(1);
}
const pickTags = (i, n) => {
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = tagPool[(i + k) % tagPool.length];
    if (!out.includes(t)) out.push(t);
  }
  return out;
};

// ---------------- 标题模板 ----------------
const pillarTitle = `《${seed} 完整指南：从 0 到 1 跑通》`;
const clusterTemplates = [
  `《${seed} 的 ${nClusters + 2} 个实战方法（附踩坑）》`,
  `《为什么 ${seed} 总做不好？根因拆解》`,
  `《${seed} 工具 / 流程横向测评》`,
  `《${seed} 团队 / 个人落地 SOP》`,
];
const longtailTemplates = [
  `《${seed} 新手最常见的问题（必看）》`,
  `《${seed} 某一步具体怎么操作？步骤拆解》`,
  `《${seed} 和竞品 / 替代方案怎么选》`,
];

// ---------------- 组装矩阵 ----------------
const rows = [];
rows.push({
  role: 'P 支柱页', title: pillarTitle, col: column, tags: pickTags(0, 3),
  kw: seed, intent: '信息/导航（承主关键词，接收全部下游内链）',
  link: '所有集群页、长尾页都链向本页（锚文本用主关键词）；本页链向 2~3 篇高权重现有文',
});
for (let i = 0; i < nClusters; i++) {
  rows.push({
    role: `C${i + 1} 集群页`, title: clusterTemplates[i % clusterTemplates.length], col: column,
    tags: pickTags(i, 2),
    kw: seed + ' ' + ['方法', '避坑', '工具', '流程'][i % 4], intent: '信息（子话题）',
    link: `链向 P；与同矩阵其他 C 互链；链向 1~2 篇现有相关文`,
  });
}
for (let i = 0; i < nLong; i++) {
  rows.push({
    role: `L${i + 1} 长尾页`, title: longtailTemplates[i % longtailTemplates.length], col: column,
    tags: pickTags(i + 1, 2),
    kw: seed + ' ' + ['常见问题', '操作步骤', '怎么选'][i % 3], intent: '信息（长尾问句）',
    link: `链向对应 C（或 P）；不互链其他长尾`,
  });
}

// ---------------- 拉现有可链文章 ----------------
let related = '';
if (!noRelated) {
  try {
    const out = execFileSync('node', [path.join(__dirname, 'find-related-posts.js'), '--query=' + seed, '--top=5'], {
      cwd: path.resolve(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    related = out.trim();
  } catch (e) {
    related = '（find-related-posts 调用失败：' + (e.message || e).split('\n')[0] + '）';
  }
}

// ---------------- 输出 ----------------
const W = (s, n) => String(s).padEnd(n);
const lines = [];
lines.push('# 内容矩阵规划：' + seed);
lines.push('支柱：**' + pillar + '** ｜ 栏目：**' + column + '** ｜ 实时短板：' + prof.shortfall[0].pillar);
if (colSource) lines.push('栏目来源：' + colSource);
lines.push('内链拓扑：P(支柱页) ← C(集群) + L(长尾)；C 互链；新文全部链向现有高相关文（见下）');
lines.push('建议标签池（已断言在 80 词白名单内）：' + tagPool.join('、'));
lines.push('');

// 合规自检：任何一行出现非白名单标签即报警（红线：不得污染 /tags/ 页）
const illegal = rows.flatMap((r) => r.tags).filter((t) => !MINORS.has(t));
if (illegal.length) {
  console.error('⚠️ 内部错误：以下建议标签不在白名单内，请勿使用 → ' + [...new Set(illegal)].join('、'));
}
lines.push('| ' + ['#', '角色', '标题候选（模板）', '栏目', '建议标签', '目标关键词', '意图', '内链方向'].join(' | ') + ' |');
lines.push('|' + '---|'.repeat(8));
rows.forEach((r, i) => {
  lines.push('| ' + [
    i + 1, r.role, r.title, r.col, r.tags.join('/'), r.kw, r.intent, r.link,
  ].join(' | ') + ' |');
});
lines.push('');
lines.push('## 可链向的现有文章（站内，来自 find-related-posts）');
lines.push(related || '（无）');

console.log(lines.join('\n'));

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify({ seed, pillar, column, rows, related }, null, 2));
  console.log('\n✅ 矩阵规划 JSON 已落盘：' + jsonOut);
}
