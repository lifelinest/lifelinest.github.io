#!/usr/bin/env node
/**
 * tools/import-gsc.js —— 搜索意图数据导入（免 OAuth 的 GSC 通道）
 * ------------------------------------------------------------------
 * 为什么有这个工具：
 *   学习层能回答「这篇有没有人看」（51.la 的 PV），但答不了
 *   「搜索给了多少机会、为什么没人点」—— 那需要 Google Search Console 的
 *   展现量 / 点击量 / 点击率 / 平均排名 / 查询词。
 *   GSC 的 API 要 OAuth 授权（比较重），但 GSC 后台**本来就能一键导出 CSV**。
 *   所以这里不做授权，改成「你把 CSV 丢进来」—— 门槛最低、当天就能用。
 *
 * 用法：
 *   node tools/import-gsc.js --in "C:/Users/xxx/Downloads/Queries.csv"
 *   node tools/import-gsc.js --in <文件或目录>            # 目录则自动收目录下所有 .csv
 *   node tools/import-gsc.js --in a.csv --in b.csv        # 多个文件合并
 *   node tools/import-gsc.js --in x.csv --days=28         # 标注数据对应的天数（默认 28）
 *   node tools/import-gsc.js                              # 不带参数：打印操作指引
 *
 * 从 GSC 导出（一次约 1 分钟）：
 *   1. 打开 https://search.google.com/search-console
 *   2. 选站点 mfy-lifeline.com → 左侧「效果 / Performance」
 *   3. 右上「日期」选「最近 28 天」→ 上方切到「查询 / Queries」标签
 *   4. 右上「导出 / Export」→ 下载 CSV
 *   5. 再切到「网页 / Pages」标签 → 同样导出一份 CSV
 *   6. 两条命令把它喂进来：
 *        node tools/import-gsc.js --in "<Queries.csv 路径>"
 *        node tools/import-gsc.js --in "<Pages.csv 路径>"
 *     （也可以直接 --in <下载目录>，自动把目录下的 CSV 全收进来）
 *
 * 产物（D:\1\1\.tmp\gsc\）：
 *   queries.json  查询词维度（给选题用：有展现无页面 = 该写的新选题）
 *   pages.json    页面维度（给学习层用：有展现无点击 = 标题/描述该改）
 *   summary.json  概览（总量 + 导入时间 + 文件来源）
 *
 * ⚠️ 边界：只读 + 落盘。不改文章、不构建、不部署、不联网。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.resolve(ROOT, '..', '.tmp');
const OUT_DIR = path.join(TMP, 'gsc');

const argv = process.argv.slice(2);
function getArgAll(name) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === name) { if (argv[i + 1] && !argv[i + 1].startsWith('--')) out.push(argv[i + 1]); }
    else if (a.startsWith(name + '=')) out.push(a.slice(name.length + 1));
  }
  return out;
}
const IN = getArgAll('--in');
const DAYS = parseInt((argv.find((a) => a.startsWith('--days=')) || '--days=28').slice(7), 10) || 28;

// ---------------- CSV 解析（支持引号内的逗号/换行、BOM、CRLF）----------------
function parseCsv(text) {
  let s = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c === '\r') { /* 忽略 */ }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

// ---------------- 表头识别（英文 / 中文 / 大小写都认）----------------
const RE = {
  query: /^(top\s*)?queries$|^query$|查询|关键词|搜尋/i,
  page: /^(top\s*)?pages$|^page$|^url$|网页|页面|网址|網頁/i,
  date: /^date$|日期/i,
  // ⚠️ 别名必须同时覆盖 GSC（英文）与百度站长（中文）两套表头 ——
  //    否则同一个解析器遇到「展现量/点击量」会识别成 0 列指标，
  //    表现为「文件读了、行数 0」，极易误判成「后台没数据」。
  clicks: /clicks|点击次数|点击量|点击数|點擊/i,
  impressions: /impressions|展示次数|展现|展现量|展示量|曝光|顯示/i,
  ctr: /^ctr$|click.?through|点击率|點擊率/i,
  position: /position|平均排名|排名/i,
};

function classifyHeader(cols) {
  const idx = {};
  const dims = [];
  cols.forEach((c, i) => {
    const v = String(c).trim();
    for (const k of Object.keys(RE)) {
      if (RE[k].test(v)) {
        // ⚠️ 维度列也要记下标 —— 踩过的坑：只 push 到 dims 不写 idx，
        //    后面按 idx[dim] 取键全取到 undefined，导致「解析成功但 0 行」。
        if (idx[k] == null) idx[k] = i;
        if ((k === 'query' || k === 'page' || k === 'date') && !dims.includes(k)) dims.push(k);
      }
    }
  });
  return { idx, dims };
}

const num = (v) => {
  const s = String(v == null ? '' : v).replace(/[%\s,]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

/** GSC 的 CTR 列可能是 "1.23%" 也可能是 0.0123，统一成比率 */
function ctrOf(raw, clicks, impressions) {
  const s = String(raw == null ? '' : raw);
  if (s.includes('%')) return num(s) / 100;
  const n = parseFloat(s);
  if (!isNaN(n) && n > 1) return n / 100;          // 写成 1.23 的百分数形式
  if (!isNaN(n) && n > 0) return n;                 // 已是比率
  return impressions ? clicks / impressions : 0;    // 列缺失时自己算
}

// ---------------- 读取与归类 ----------------
function collectFiles(inputs) {
  const files = [];
  for (const p of inputs) {
    const abs = path.resolve(p);
    if (!fs.existsSync(abs)) { console.log('  ⚠️ 路径不存在：' + abs); continue; }
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      for (const f of fs.readdirSync(abs)) {
        if (/\.csv$/i.test(f)) files.push(path.join(abs, f));
      }
    } else files.push(abs);
  }
  return files;
}

function parseFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const rows = parseCsv(text);
  if (!rows.length) return { file, kind: 'empty', rows: [] };
  const { idx, dims } = classifyHeader(rows[0]);
  const hasMetrics = ['clicks', 'impressions', 'ctr', 'position'].filter((k) => idx[k] != null).length >= 2;
  if (!hasMetrics || !dims.length) {
    return { file, kind: 'unknown', note: '表头无法识别：' + rows[0].join(' | ').slice(0, 120), rows: [] };
  }
  const dim = dims.includes('query') ? 'query' : dims.includes('page') ? 'page' : 'date';
  // 若同时有 date 和 page/query（按日期分组的导出），以 query/page 为主键聚合
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const key = String(r[idx[dim]] == null ? '' : r[idx[dim]]).trim();
    if (!key) continue;
    const clicks = num(r[idx.clicks]);
    const impressions = num(r[idx.impressions]);
    out.push({
      key,
      clicks,
      impressions,
      ctr: ctrOf(idx.ctr != null ? r[idx.ctr] : '', clicks, impressions),
      position: idx.position != null ? num(r[idx.position]) : null,
    });
  }
  return { file, kind: dim, rows: out };
}

/** 同键合并（多文件 / 多日期导出时累加） */
function mergeRows(list) {
  const map = new Map();
  for (const it of list) {
    const cur = map.get(it.key) || { key: it.key, clicks: 0, impressions: 0, position: null, _posW: 0 };
    cur.clicks += it.clicks;
    cur.impressions += it.impressions;
    if (it.position != null && it.impressions > 0) {
      cur._posW += it.position * it.impressions;
    }
    map.set(it.key, cur);
  }
  const out = [...map.values()].map((r) => {
    const position = r._posW > 0 && r.impressions > 0 ? +(r._posW / r.impressions).toFixed(1) : null;
    const ctr = r.impressions ? r.clicks / r.impressions : 0;
    const { _posW, ...rest } = r;
    return Object.assign(rest, { ctr: +ctr.toFixed(4), position });
  });
  out.sort((a, b) => b.impressions - a.impressions);
  return out;
}

// ---------------- 主流程 ----------------
const GUIDE = `
搜索意图数据导入（GSC 免授权通道）
====================================================
学习层现在只知道「有没有人看」，补上这份数据后就能回答
「搜索给了多少机会、为什么没人点」。

导出步骤（约 1 分钟）：
  1. 打开 https://search.google.com/search-console
  2. 选站点 mfy-lifeline.com → 左侧「效果 / Performance」
  3. 日期选「最近 28 天」
  4. 切到「查询 / Queries」标签 → 右上「导出 / Export」→ CSV
  5. 再切到「网页 / Pages」标签 → 同样导出 CSV
  6. 把两个文件喂进来（任选其一）：
       node tools/import-gsc.js --in "<Queries.csv 的完整路径>"
       node tools/import-gsc.js --in "<Pages.csv 的完整路径>"
       node tools/import-gsc.js --in "<下载目录>"        # 自动收目录下所有 csv
  7. 之后跑 node tools/refresh-all.js 刷新面板，就会出现「搜索表现」一节。

导入后可得到什么：
  · 有展现、无点击的页面 → 标题/描述该改（不是内容不行，是没人点）
  · 有查询词、站内没有对应页面 → 真正由需求驱动的新选题
  · 排名 10–30 名且展现高的词 → 值得补内容推上首页的长尾
`;

function main() {
  if (!IN.length) {
    console.log(GUIDE);
    return;
  }

  const files = collectFiles(IN);
  if (!files.length) {
    console.log('❌ 没有找到可解析的 CSV。用法见下方指引：');
    console.log(GUIDE);
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('Google Search Console 数据导入 ｜ 窗口 ' + DAYS + ' 天');
  console.log('');

  const buckets = { query: [], page: [], date: [] };
  const skipped = [];
  for (const f of files) {
    const r = parseFile(f);
    if (r.kind === 'query' || r.kind === 'page' || r.kind === 'date') {
      buckets[r.kind].push(...r.rows);
      console.log('  ✅ ' + path.basename(f) + ' → ' + r.kind + '（' + r.rows.length + ' 行）');
    } else {
      skipped.push({ file: path.basename(f), note: r.note || r.kind });
      console.log('  ⚠️ ' + path.basename(f) + ' 跳过：' + (r.note || r.kind));
    }
  }

  const queries = mergeRows(buckets.query);
  const pages = mergeRows(buckets.page);

  if (!queries.length && !pages.length) {
    console.log('');
    console.log('❌ 两份维度都没解析出来。请确认导出的是 GSC「效果」页面的 CSV（不是别的表）。');
    console.log('   若表头特殊，把首行贴给我，我加个适配。');
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const summary = {
    importedAt: new Date().toISOString(),
    days: DAYS,
    files: files.map((f) => path.basename(f)),
    skipped,
    queries: queries.length,
    pages: pages.length,
    totals: {
      clicks: pages.reduce((a, x) => a + x.clicks, 0) || queries.reduce((a, x) => a + x.clicks, 0),
      impressions: pages.reduce((a, x) => a + x.impressions, 0) || queries.reduce((a, x) => a + x.impressions, 0),
    },
  };

  fs.writeFileSync(path.join(OUT_DIR, 'queries.json'), JSON.stringify({ generatedAt: summary.importedAt, days: DAYS, rows: queries }, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'pages.json'), JSON.stringify({ generatedAt: summary.importedAt, days: DAYS, rows: pages }, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log('');
  console.log('【导入结果】');
  console.log('  查询词：' + queries.length + ' 条 ｜ 网页：' + pages.length + ' 条');
  console.log('  总展现：' + summary.totals.impressions + ' ｜ 总点击：' + summary.totals.clicks +
    ' ｜ 平均点击率：' + (summary.totals.impressions ? ((summary.totals.clicks / summary.totals.impressions) * 100).toFixed(2) + '%' : '—'));

  if (queries.length) {
    console.log('');
    console.log('  展现最高的查询词：');
    queries.slice(0, 8).forEach((q) => {
      console.log('    ' + String(q.impressions).padStart(6) + ' 展现  ' + String(q.clicks).padStart(4) + ' 点击  ' +
        (q.ctr * 100).toFixed(1) + '%  位置 ' + (q.position == null ? '—' : q.position) + '  ' + q.key.slice(0, 46));
    });
  }

  if (pages.length) {
    const lowCtr = pages.filter((p) => p.impressions >= 30 && p.ctr < 0.02);
    console.log('');
    console.log('  有展现但几乎没人点（展现≥30 且点击率<2%）—— 这类是「标题/描述该改」，不是内容不行：');
    if (!lowCtr.length) console.log('    （暂无）');
    lowCtr.slice(0, 8).forEach((p) => {
      console.log('    ' + String(p.impressions).padStart(6) + ' 展现  ' + String(p.clicks).padStart(4) + ' 点击  ' +
        (p.ctr * 100).toFixed(1) + '%  ' + p.key.slice(0, 58));
    });
  }

  console.log('');
  console.log('✅ 已落盘：' + OUT_DIR);
  console.log('   下一步：node tools/refresh-all.js   （学习层与面板会自动带上搜索维度）');
}

if (require.main === module) main();

module.exports = { parseCsv, parseFile, mergeRows, classifyHeader };
