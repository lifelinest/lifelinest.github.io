#!/usr/bin/env node
/**
 * tools/topic-demand.js —— 真实需求信号层（数据驱动选题的入口）
 * ------------------------------------------------------------------
 * 给 groundingGate / topic-fit-scorer 提供 opts.demand（0..1）。
 * 数据来自 topic-demand.json（51.la 搜索词 / GSC Queries / 必应站长 API 的真实查询词，
 * 由 topic-gate-experiment.js 与日常拉数滚动补充）。
 *
 * 用法：
 *   const { demandFor } = require('./topic-demand');
 *   demandFor('33 个 Google SEO 实用工具');  // -> 0.85（命中 google seo）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, 'topic-demand.json');

let _cache = null;
function load() {
  if (_cache) return _cache;
  try {
    _cache = JSON.parse(fs.readFileSync(DATA, 'utf8')).terms || [];
  } catch (e) {
    _cache = [];
  }
  return _cache;
}

/** 返回 0..1：取所有命中 term 中的最大 weight */
function demandFor(text) {
  const terms = load();
  if (!terms.length) return 0;
  const lower = String(text || '').toLowerCase();
  let best = 0;
  for (const t of terms) {
    if (t.term && lower.includes(t.term.toLowerCase())) {
      if (typeof t.weight === 'number' && t.weight > best) best = t.weight;
    }
  }
  return best;
}

/** 记录某个选题发布后的实际 PV（写入校准日志，供重复实验对比） */
function recordActual(abbrlink, pv) {
  const logPath = path.join(__dirname, '..', '.tmp', 'topic-demand-actual.jsonl');
  try {
    fs.appendFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), abbrlink, pv }) + '\n');
  } catch (e) { /* 非关键 */ }
}

module.exports = { demandFor, recordActual, load };
