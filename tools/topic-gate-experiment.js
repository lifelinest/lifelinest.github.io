#!/usr/bin/env node
/**
 * tools/topic-gate-experiment.js —— 选题判定标准·可重复实验台
 * ------------------------------------------------------------------
 * 用户要求：「多沉淀用尽可能多的数据去重复实验」。本台把「判断标准」变成可重复实验：
 *   给定一批候选（含用户认可的正例 + 已知反例），统一过 groundingGate + topic-fit-scorer，
 *   输出「预期 vs 实际」对照表，并追加写入校准日志（.tmp/topic-gate-calibration.jsonl）。
 *   随数据积累反复跑，就能看出标准是否稳定、是否和真实 PV 一致。
 *
 * 用法：node tools/topic-gate-experiment.js
 *       node tools/topic-gate-experiment.js --self  仅跑内置校准集
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { groundingGate } = require('./blog-grounding');
const { scoreCandidate } = require('./topic-fit-scorer');
const { demandFor } = require('./topic-demand');

// ------- 内置校准集：用户认可的正例 + 已知反例（判断标准必须稳定区分） -------
const CALIB = [
  {
    id: 'WX-SEO-TOOLS',
    expect: 'ALIGN',
    note: '用户 2026-10-30 指定「合适的选题」：33 个 Google SEO 实用工具清单（面向外贸独立站运营者）',
    text: `做Google SEO这么多年，我发现很多人不是不会优化，而是工具没用对。
从关键词挖掘、竞品分析、技术SEO，到外链建设、网站性能、本地SEO，我整理了33个实用网站。
Google Search Console 监控网站收录、搜索曝光、点击、排名和索引问题；PageSpeed Insights 检测加载速度；
Screaming Frog 全站爬取排查死链；Ahrefs 外链分析；Google Keyword Planner 挖掘关键词；Schema.org 结构化数据；
如果是Google SEO新手，先把 GSC、Google Trends、Screaming Frog、Ahrefs、PageSpeed Insights 用明白。`,
  },
  {
    id: 'YOAST-SHOPIFY',
    expect: 'REFRAME',
    note: '厂商发布 + 你不用平台（Shopify）→ 需转译',
    text: 'Introducing Yoast SEO AI+ for Shopify — 推出全新 AI 写作与优化功能',
  },
  {
    id: 'G-CORE-UPDATE',
    expect: 'REFRAME',
    note: '巨头新闻复述、无一手角度',
    text: 'Google announces March core update affecting search rankings',
  },
  {
    id: 'SHOPIFY-THEMES',
    expect: 'REFRAME',
    note: '只讲你不用/不评测的平台',
    text: '10 best Shopify themes for 2026',
  },
  {
    id: 'CRYPTO',
    expect: 'DROP',
    note: 'off-brand 红线',
    text: '加密货币今日行情分析与抄底策略',
  },
];

const cov = require('./content-matrix').buildCoverage();
const logPath = path.join(__dirname, '..', '.tmp', 'topic-gate-calibration.jsonl');
const W = (s, n) => String(s).padEnd(n);
const lines = [];
lines.push('🔬 选题判定实验台 ｜ 候选数 ' + CALIB.length + ' ｜ 实时覆盖单元格 ' + Object.keys(cov).length);
lines.push('—'.repeat(78));
lines.push(W('ID', 16) + W('预期', 8) + W('闸 verdict', 10) + W('scorer', 8) + '对照');
lines.push('—'.repeat(78));

let ok = 0;
for (const c of CALIB) {
  const d = demandFor(c.text);
  const g = groundingGate(c.text, { demand: d });
  const s = scoreCandidate(c.text, null, { coverage: cov });
  const actual = (g.verdict === c.expect || s.decision === c.expect) ? 'OK' : 'MISMATCH';
  if (actual === 'OK') ok++;
  lines.push(W(c.id, 16) + W(c.expect, 8) + W(g.verdict, 10) + W(s.decision, 8) + actual);
  lines.push('      ' + c.note);
  lines.push('      闸: ' + g.reasons.join('；'));
  try {
    fs.appendFileSync(logPath, JSON.stringify({
      ts: new Date().toISOString(), id: c.id, expect: c.expect,
      gate: g.verdict, scorer: s.decision, demand: d, match: actual,
    }) + '\n');
  } catch (e) { /* 非关键 */ }
}
lines.push('—'.repeat(78));
lines.push('结论：' + ok + '/' + CALIB.length + ' 校准通过');
console.log(lines.join('\n'));
