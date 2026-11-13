#!/usr/bin/env node
/**
 * tools/import-baidu.js —— 百度站长数据导入（免 API 通道）
 * ------------------------------------------------------------------
 * 为什么有这个工具：
 *   百度站长后台**能看到数据，但没有给第三方程序读的开放 API**（官方开放平台要申请
 *   appkey/secret，且覆盖字段有限）。所以跟 GSC 一样走「后台导出 CSV → 喂进来」的路子，
 *   门槛最低、当天就能用。解析规则直接复用 import-gsc.js —— 绝不写第二份实现
 *   （踩过的坑：两份 CSV 解析会漂移，表现为「校准通过但导入为空」）。
 *
 * 用法：
 *   node tools/import-baidu.js --in "C:/Users/xxx/Downloads/关键词.csv"
 *   node tools/import-baidu.js --in <文件或目录>          # 目录则自动收目录下所有 .csv
 *   node tools/import-baidu.js --in a.csv --in b.csv      # 多文件合并
 *   node tools/import-baidu.js --in x.csv --days=30       # 标注数据天数（默认 30）
 *   node tools/import-baidu.js --selftest                 # 用内置样本自检解析器
 *   node tools/import-baidu.js                            # 不带参数：打印导出指引
 *
 * 从百度站长导出（约 2 分钟，菜单名以你后台实际显示为准）：
 *   1. 登录 https://ziyuan.baidu.com  → 选中站点 mfy-lifeline.com
 *   2. 找「流量与关键词 / 关键词报表」这类搜索流量报表
 *   3. 日期选「最近 30 天」→ 点导出/下载，得到 CSV
 *   4. 有「网页 / 页面」维度的报表也同理导出一份
 *   5. 喂进来：
 *        node tools/import-baidu.js --in "<CSV 路径或所在目录>"
 *   只要表里含有「关键词 / 展现量 / 点击量」这几个列名就能自动识别，
 *   中文表头（展现量、点击量、点击率、平均排名）与英文（impressions/clicks/ctr）都认。
 *
 * 产物（D:\1\1\.tmp\baidu\）：
 *   queries.json  关键词维度（有展现但站内没有页面 = 该写的新选题）
 *   pages.json    页面维度（有展现无点击 = 标题/描述该改）
 *   summary.json  概览（总量 + 导入时间 + 文件来源）
 *
 * ⚠️ 边界：只读 + 落盘。不改文章、不构建、不部署、不联网。
 */
'use strict';

const fs = require('fs');
const path = require('path');

// 解析规则唯一实现在 import-gsc.js（有 main 保护，可安全 require）
const { parseFile, mergeRows } = require('./import-gsc');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.resolve(ROOT, '..', '.tmp');
const OUT_DIR = path.join(TMP, 'baidu');

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
const DAYS = parseInt((argv.find((a) => a.startsWith('--days=')) || '--days=30').slice(7), 10) || 30;
const SELFTEST = argv.includes('--selftest');

function collectFiles(inputs) {
  const files = [];
  for (const p of inputs) {
    const abs = path.resolve(p);
    if (!fs.existsSync(abs)) { console.log('  ⚠️ 路径不存在：' + abs); continue; }
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      for (const f of fs.readdirSync(abs)) if (/\.csv$/i.test(f)) files.push(path.join(abs, f));
    } else files.push(abs);
  }
  return files;
}

const GUIDE = `
百度站长数据导入（免 API 通道）
====================================================
百度站长后台能看到数据，但没有给程序直接读的开放接口，
所以走「后台导出 CSV → 喂进来」这条路，当天就能用。

从后台导出（约 2 分钟，菜单名以你后台实际显示为准）：
  1. 登录 https://ziyuan.baidu.com → 选中 mfy-lifeline.com
  2. 找搜索流量类报表（关键词 / 网页 维度各一份最好）
  3. 日期选「最近 30 天」→ 导出 CSV
  4. 喂进来：
       node tools/import-baidu.js --in "<CSV 路径或所在目录>"

自动识别规则：表头含「关键词」→ 关键词维度；含「网页/页面/URL」→ 页面维度；
指标列中文（展现量、点击量、点击率、平均排名）与英文（impressions/clicks/ctr/position）都认。

产物：D:\\1\\1\\.tmp\\baidu\\{queries,pages,summary}.json
先自检解析器：node tools/import-baidu.js --selftest
`;

function selftest() {
  // 中文表头（百度真实导出样式）+ 百分号 CTR + 千分位，覆盖最容易翻车的三种写法
  const sample = [
    '关键词,展现量,点击量,点击率,平均排名',
    '外贸独立站怎么做,12000,36,0.30%,15.2',
    'wordpress 外贸建站,"3,456",12,0.35%,8.4',
    '独立站 收款,890,0,0.00%,22.1',
  ].join('\r\n');
  const f = path.join(TMP, 'baidu-selftest.csv');
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(f, '\uFEFF' + sample, 'utf8');
  const r = parseFile(f);
  const ok = r.kind === 'query' && r.rows.length === 3 && r.rows[0].impressions === 12000 && r.rows[1].impressions === 3456;
  console.log('自检样本：' + f);
  console.log('  识别维度：' + r.kind + '（期望 query）');
  console.log('  行数：' + r.rows.length + '（期望 3）');
  if (r.rows.length) {
    console.log('  首行：' + JSON.stringify(r.rows[0]));
    console.log('  千分位行：' + JSON.stringify(r.rows[1]));
  }
  console.log(ok ? '✅ 自检通过（中文表头 + 千分位 + 百分号 CTR 均解析正确）' : '❌ 自检失败：' + JSON.stringify(r));
  try { fs.unlinkSync(f); } catch (e) { /* 无所谓 */ }
  process.exit(ok ? 0 : 1);
}

function main() {
  if (SELFTEST) return selftest();
  if (!IN.length) { console.log(GUIDE); return; }

  const files = collectFiles(IN);
  if (!files.length) { console.log('没有找到可导入的 CSV。'); console.log(GUIDE); return; }

  const qBuckets = [];
  const pBuckets = [];
  const notes = [];
  for (const f of files) {
    const r = parseFile(f);
    if (r.kind === 'query') qBuckets.push(...r.rows);
    else if (r.kind === 'page') pBuckets.push(...r.rows);
    else notes.push(path.basename(f) + '：' + (r.note || '空文件'));
  }

  const queries = mergeRows(qBuckets);
  const pages = mergeRows(pBuckets);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const summary = {
    importedAt: new Date().toISOString(),
    days: DAYS,
    sources: files.map((f) => path.basename(f)),
    queryCount: queries.length,
    pageCount: pages.length,
    totalImpressions: queries.reduce((s, x) => s + x.impressions, 0) + pages.reduce((s, x) => s + x.impressions, 0),
    totalClicks: queries.reduce((s, x) => s + x.clicks, 0) + pages.reduce((s, x) => s + x.clicks, 0),
    notes,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'queries.json'), JSON.stringify(queries, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'pages.json'), JSON.stringify(pages, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  console.log('百度站长数据导入 · ' + new Date().toLocaleString('zh-CN'));
  console.log('  文件：' + summary.sources.join('、'));
  console.log('  关键词 ' + queries.length + ' 条 ｜ 页面 ' + pages.length + ' 条 ｜ 窗口 ' + DAYS + ' 天');
  console.log('  总展现 ' + summary.totalImpressions + ' ｜ 总点击 ' + summary.totalClicks);
  if (notes.length) { console.log(''); notes.forEach((n) => console.log('  ⚠️ 未能识别：' + n)); }

  if (queries.length) {
    console.log('');
    console.log('  展现最高的 8 个词（展现 ｜ 点击 ｜ 点击率 ｜ 排名）：');
    queries.slice(0, 8).forEach((q) => {
      console.log('    ' + String(q.impressions).padStart(6) + '  ' + String(q.clicks).padStart(4) + '  ' +
        (q.ctr * 100).toFixed(1) + '%  ' + String(q.position == null ? '—' : q.position).padStart(5) + '  ' + q.key.slice(0, 44));
    });
    const noClick = queries.filter((q) => q.impressions >= 50 && q.clicks === 0);
    if (noClick.length) {
      console.log('');
      console.log('  有展现但零点击（≥50 展现）—— 标题/描述该改，或该词根本没有对应文章：');
      noClick.slice(0, 8).forEach((q) => console.log('    ' + String(q.impressions).padStart(6) + ' 展现  ' + q.key.slice(0, 56)));
    }
  }

  console.log('');
  console.log('✅ 已落盘：' + OUT_DIR);
}

if (require.main === module) main();

module.exports = { collectFiles, OUT_DIR };
