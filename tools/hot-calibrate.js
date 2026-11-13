#!/usr/bin/env node
/**
 * tools/hot-calibrate.js —— 热榜源双校准（新增/更换热榜源必跑）
 * ------------------------------------------------------------------
 * 为什么要校准：热榜接口是「静默失败」重灾区 —— 服务端可能不管你传什么参数
 * 都返回一份固定模板数据（看着 200、条数正常、标题也像回事，其实是假的）。
 * 本站踩过同类坑（360 下拉词拿输入词套模板、Bing SERP 返回无关降级内容）。
 *
 * 双校准判据：
 *   正校准（必然有）：正常 URL 能取到 ≥5 条，且标题互异（去重率 100%）
 *   负校准（必然无）：calibUrl（一个必然不存在的路径）必须取不到条目；
 *                    如果它也返回 ≥5 条 ⇒ 该接口在给模板数据，判 FAIL 并建议禁用
 *   稳定性：同一 URL 连取 2 次，条数差 ≤2（排除偶发抖动）
 *
 * 用法：
 *   node tools/hot-calibrate.js                       # 校准全部 tier=hot 的启用的源
 *   node tools/hot-calibrate.js --source=百度          # 只校准匹配到的源
 *   node tools/hot-calibrate.js --json D:/1/1/.tmp/hot-calib.json
 * 退出码：0 = 全部 PASS；1 = 存在 FAIL（此时别把源接进流水线）
 *
 * 只读：不写源配置、不写文章、不构建、不部署。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { fetchHot, curl } = require('./hot-parse');

const argv = process.argv.slice(2);
function getArg(name, def) {
  const i = argv.findIndex((a) => a === name || a.startsWith(name + '='));
  if (i === -1) return def;
  const a = argv[i];
  if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
  const nx = argv[i + 1];
  return nx && !nx.startsWith('--') ? nx : def;
}
const ONLY = getArg('--source', '');
const JSON_OUT = getArg('--json', 'D:/1/1/.tmp/hot-calib.json');

const SRC = path.join(__dirname, 'sources.json');
const cfg = JSON.parse(fs.readFileSync(SRC, 'utf8'));
let hot = (cfg.feeds || []).filter((f) => f.tier === 'hot' && !f.disabled);
if (ONLY) hot = hot.filter((f) => f.name.includes(ONLY) || f.url.includes(ONLY));

if (!hot.length) {
  console.error('没有可校准的热榜源（检查 sources.json 的 tier=hot 与 disabled 字段）');
  process.exit(1);
}

const sleep = (ms) => { const t = Date.now(); while (Date.now() - t < ms); };
const results = [];

console.log('=== 热榜源双校准（' + hot.length + ' 个）===');
console.log('正校准：正常 URL ≥5 条且标题互异 ｜ 负校准：calibUrl 必须取不到 ｜ 稳定性：连取 2 次条数差 ≤2');
console.log('');

for (const f of hot) {
  // ---- 正校准 ----
  const a = fetchHot(f);
  const titles = a.items.map((x) => x.title);
  const uniq = new Set(titles);
  // ---- 稳定性：再取一次 ----
  sleep(400);
  const b = fetchHot(f);
  // ---- 负校准 ----
  let neg = { items: [], bytes: 0, error: '' };
  if (f.calibUrl) {
    const txt = curl(f.calibUrl, 20);
    neg.bytes = (txt || '').length;
    if (txt && txt.length >= 60) {
      try {
        const j = JSON.parse(txt);
        const hp = require('./hot-parse');
        neg.items = hp.parseHot(txt, f);
      } catch (e) { neg.items = []; }   // 返回 HTML 错误页 → 解析失败 = 预期
    }
  }

  const n1 = a.items.length, u1 = uniq.size, n2 = b.items.length, nn = neg.items.length;
  const fail = [];
  if (n1 < 5) fail.push('正校准：只取到 ' + n1 + ' 条（<5）');
  if (u1 !== n1) fail.push('正校准：去重后 ' + u1 + '/' + n1 + '，存在重复标题');
  if (!f.calibUrl) fail.push('负校准：配置缺 calibUrl，无法验证');
  else if (nn >= 5) fail.push('负校准：破坏路径仍返回 ' + nn + ' 条 ⇒ 疑似模板/缓存数据');
  if (Math.abs(n1 - n2) > 2) fail.push('稳定性：两次条数 ' + n1 + ' vs ' + n2);

  const verdict = fail.length ? 'FAIL' : 'PASS';
  results.push({
    name: f.name, url: f.url, verdict,
    count: n1, uniq: u1, secondCount: n2, negCount: nn, bytes: a.bytes, negBytes: neg.bytes,
    fail, sample: titles.slice(0, 5),
    hotTop: a.items.slice(0, 3).map((x) => ({ title: x.title, hot: x.hot, link: x.link })),
  });

  console.log('[' + verdict + '] ' + f.name + '   条数 ' + n1 + ' / 唯一 ' + u1 + ' / 复取 ' + n2 + ' / 负校准 ' + nn);
  if (a.error) console.log('     ⚠️ ' + a.error);
  fail.forEach((x) => console.log('     ✗ ' + x));
  console.log('     Top5：' + titles.slice(0, 5).join(' ｜ '));
  console.log('');
}

const pass = results.filter((r) => r.verdict === 'PASS');
console.log('结论：PASS ' + pass.length + ' / ' + results.length);
console.log('');
console.log('⚠️ 数字通过≠内容可用：Top5 请人工扫一眼，确认是真实热点（不是占位/旧闻）。');

fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
fs.writeFileSync(JSON_OUT, JSON.stringify({ calibratedAt: new Date().toISOString(), results }, null, 2), 'utf8');
console.log('✅ 校准结果已落盘：' + JSON_OUT);

process.exit(results.length === pass.length ? 0 : 1);
