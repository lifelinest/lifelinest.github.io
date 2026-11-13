#!/usr/bin/env node
/**
 * tools/hot-parse.js —— 热榜 JSON 源的解析与取数（fetch-sources.js / hot-calibrate.js 共用）
 * ------------------------------------------------------------------
 * 为什么单独抽一个文件：解析规则必须**单一实现**。校准工具判「可用」、
 * 采集器拿来「取数」，如果两边各写一份，就会出现「校准通过但采集为空」
 * 这类同源不一致事故（本站已踩过几次「日志绿但产物旧」的坑）。
 *
 * 路径语法：`a.b.c`，任何一段取到数组都会自动展平。
 * 例：百度热搜 data.cards.content.content（三层嵌套数组）
 *
 * 网络层走 curl 子进程 —— 本机 HTTP 代理下 Node 原生 fetch 会被拦（已知坑）。
 */
'use strict';

const execFileSync = require('child_process').execFileSync;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function curl(url, maxTime) {
  try {
    return execFileSync('curl', ['-sL', '--max-time', String(maxTime || 25), '-A', UA, url], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) {
    return '';
  }
}

function resolvePath(root, p) {
  let list = [root];
  if (!p) return list;
  for (const seg of String(p).split('.')) {
    if (!seg) continue;
    const next = [];
    for (const it of list) {
      if (it == null) continue;
      const v = it[seg];
      if (v == null) continue;
      if (Array.isArray(v)) { for (const x of v) next.push(x); } else next.push(v);
    }
    list = next;
  }
  return list;
}

function getPath(root, p) {
  if (!p) return '';
  let cur = root;
  for (const seg of String(p).split('.')) {
    if (cur == null) return '';
    cur = cur[seg];
  }
  return cur == null ? '' : cur;
}

/** 按源配置解析热榜 JSON → [{title, link, hot, date}] */
function parseHot(text, f) {
  let j;
  try { j = JSON.parse(text); } catch (e) { return []; }
  const out = [];
  for (const it of resolvePath(j, f.path)) {
    const title = String(getPath(it, f.titleKey || 'title') || '').trim();
    if (!title) continue;
    let raw = f.linkKey ? String(getPath(it, f.linkKey) || '') : '';
    if (raw && f.linkStrip && raw.indexOf(f.linkStrip) === 0) raw = raw.slice(f.linkStrip.length);
    let link = raw;
    if (f.linkTpl) link = f.linkTpl.replace('{v}', raw).replace('{word}', encodeURIComponent(title));
    out.push({
      title: title.replace(/\s+/g, ' '),
      link,
      hot: f.hotKey ? Number(getPath(it, f.hotKey) || 0) : 0,
      date: 0,
    });
  }
  return out;
}

/** 取一个热榜源的条目（返回 {items, bytes, error}） */
function fetchHot(f) {
  const text = curl(f.url);
  if (!text || text.length < 60) return { items: [], bytes: (text || '').length, error: '取回为空/超时' };
  const items = parseHot(text, f);
  return { items, bytes: text.length, error: items.length ? '' : '解析不到条目（JSON 路径可能已变）' };
}

module.exports = { curl, resolvePath, getPath, parseHot, fetchHot, UA };
