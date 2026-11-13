#!/usr/bin/env node
/**
 * tools/refresh-all.js —— 一键刷新（把「看数据」这件事从六条命令压成一条）
 * ------------------------------------------------------------------
 * 面板是快照不是实时：数据要新，就得按顺序把上游工具跑一遍。
 * 以前要手打四条命令、还得记住顺序（先取数 → 再诊断 → 再出题 → 最后画图），
 * 漏一步就会拿着旧缓存做决策。这个脚本把那套顺序固定下来。
 *
 * 流水线：
 *   ① fetch-stats     取 PV/UV（联网，失败不阻断 —— 后面会用旧缓存继续）
 *   ② search-demand   抓百度/必应/360 下拉建议 → 「真的有人在搜什么」
 *   ③ insight-engine  数据 → 动作（换标题/提排名/翻新/扩长尾/低优先/待摸底）
 *   ④ topic-radar     动作 + 搜索需求 + 站内缺口 + 站外新料 → 选题表
 *   ⑤ dashboard       全部聚合成可视化面板
 *
 * 用法：
 *   node tools/refresh-all.js                 # 默认：跳过站外 RSS 采集（约 2 分钟）
 *   node tools/refresh-all.js --with-sources  # 连 RSS 一起采（慢，约 3–4 分钟）
 *   node tools/refresh-all.js --no-demand     # 跳过联网抓需求词（回到纯本地，约 15 秒）
 *   node tools/refresh-all.js --no-gates      # 面板跳过闸门快检（再快一点）
 *   node tools/refresh-all.js --strict        # 任一上游步骤失败即 exit 1
 *
 * ⚠️ 边界：只读 + 落盘。**不构建、不部署、不改文章**。
 *    「取数」这一步会访问自建统计代理（联网），其余步骤纯本地。
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.resolve(ROOT, '..', '.tmp');

const argv = process.argv.slice(2);
const has = (n) => argv.some((a) => a === n || a.startsWith(n + '='));
const WITH_SOURCES = has('--with-sources');
const NO_GATES = has('--no-gates');
const NO_DEMAND = has('--no-demand');
const STRICT = has('--strict');

const refresh = path.join(TMP, 'stats-state', 'refresh.json');

const steps = [
  {
    name: '① 取流量数据',
    file: 'fetch-stats.js',
    args: ['--json', refresh],
    optional: true,
    why: 'PV/UV 来自 51.la（自建代理）。失败不阻断：学习层会用上一次的缓存继续。',
  },
  {
    name: '② 搜索需求',
    file: 'search-demand.js',
    args: ['--quiet'],
    optional: true,
    skip: NO_DEMAND,
    why: '抓百度/必应/360 下拉建议 → 「真的有人在搜什么」。失败不阻断：选题雷达会退回只用站内缺口。',
  },
  {
    name: '③ 学习层诊断',
    file: 'insight-engine.js',
    args: ['--quiet'],
    why: 'PV + 发布时间 + 入链数 + 栏目定位 → 每篇一个动作。',
  },
  {
    name: '④ 选题雷达',
    file: 'topic-radar.js',
    args: (WITH_SOURCES ? ['--since=14', '--quiet'] : ['--no-fetch', '--quiet'])
      .concat(['--json', path.join(TMP, 'topic-radar', 'latest.json')]),
    why: WITH_SOURCES
      ? '存量动作 + 搜索需求 + 站内缺口 + 站外 RSS 新料。'
      : '存量动作 + 搜索需求 + 站内缺口（跳过 RSS，想连站外一起跑加 --with-sources）。',
  },
  {
    name: '⑤ 可视化面板',
    file: 'dashboard.js',
    args: NO_GATES ? ['--no-gates'] : [],
    why: '聚合上面全部结果，生成单文件 HTML。',
  },
];

function run(step) {
  const t0 = Date.now();
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, step.file), ...step.args], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: ROOT,
    });
    const lines = String(out).trim().split(/\r?\n/).filter(Boolean);
    const last = lines.slice(-1)[0] || '';
    // ⚠️ 不能只取最后一行：子进程可能「成功退出但内部降级」（fetch-stats 实时取数失败后
    //    改用旧缓存，末行仍是「✅ 已落盘」）。把警告行单独透出来，否则「日志绿、产物旧」
    //    会一直骗过复核 —— 这正是学习层吃了 18 小时旧 PV 却没人发现的直接原因。
    const warns = lines.filter((l) => /⚠️|❌|降级|取数失败|鉴权失败|已过期|非最新/.test(l));
    return { ok: true, ms: Date.now() - t0, note: last.replace(/^✅\s*/, '').slice(0, 110), warns };
  } catch (e) {
    const out = String((e.stdout || '') + (e.stderr || '')).trim();
    const lines = out.split(/\r?\n/).filter(Boolean);
    const tail = lines.slice(-1)[0] || ('exit ' + (e.status == null ? '?' : e.status));
    const warns = lines.filter((l) => /⚠️|❌|降级|取数失败|鉴权失败|已过期|非最新/.test(l));
    return { ok: false, ms: Date.now() - t0, note: tail.slice(0, 140), warns };
  }
}

function main() {
  console.log('');
  console.log('一键刷新 · 博客内容引擎数据链');
  console.log('（只读 + 落盘；不构建、不部署、不改文章）');
  console.log('');

  const results = [];
  for (const s of steps) {
    if (s.skip) { console.log('  ' + s.name + ' … ⏭ 已跳过（--no-demand）'); continue; }
    process.stdout.write('  ' + s.name + ' … ');
    const r = run(s);
    results.push(Object.assign({}, s, r));
    if (r.ok) console.log('✅ ' + (r.ms / 1000).toFixed(1) + 's');
    else console.log((s.optional ? '⚠️ 失败（不阻断）' : '❌ 失败') + ' ' + (r.ms / 1000).toFixed(1) + 's');
    if (!r.ok && r.note) console.log('      ' + r.note);
    if (r.ok && r.note) console.log('      ' + r.note);
    // 子进程的警告单独透出（成功退出 ≠ 数据是新的）
    if (r.warns && r.warns.length) {
      for (const w of [...new Set(r.warns)].slice(0, 3)) console.log('      ' + w.trim());
    }
  }

  // 产物清单（如实标注是否真的存在）
  const outputs = [
    { p: path.join(TMP, 'stats-state', 'refresh.json'), what: '流量原始数据' },
    { p: path.join(TMP, 'stats-state', 'hot.json'), what: 'PV 缓存' },
    { p: path.join(TMP, 'insight', 'insight.json'), what: '学习层诊断 JSON' },
    { p: path.join(TMP, 'insight', 'insight-' + new Date().toISOString().slice(0, 10) + '.md'), what: '学习层报告' },
    { p: path.join(TMP, 'demand', 'demand.json'), what: '搜索需求词库' },
    { p: path.join(TMP, 'topic-radar', new Date().toISOString().slice(0, 10) + '.md'), what: '选题表' },
    { p: path.join(TMP, 'dashboard', 'index.html'), what: '可视化面板' },
  ];
  console.log('');
  console.log('产物：');
  for (const o of outputs) {
    const st = (() => { try { return fs.statSync(o.p); } catch (e) { return null; } })();
    console.log('  ' + (st ? '✅' : '· ') + ' ' + o.what + '  ' + o.p +
      (st ? '  (' + new Date(st.mtimeMs).toLocaleString('zh-CN') + ')' : '  （未生成）'));
  }

  const failed = results.filter((r) => !r.ok && !r.optional);
  const optionalFailed = results.filter((r) => !r.ok && r.optional);
  console.log('');
  if (optionalFailed.length) {
    console.log('ℹ️ 有可选步骤失败（' + optionalFailed.map((r) => r.name).join('、') + '），' +
      '通常只是统计代理或网络的问题 —— 学习层会沿用旧缓存，不影响其余结论。');
  }
  if (failed.length) {
    console.log('❌ 关键步骤失败：' + failed.map((r) => r.name).join('、'));
    process.exitCode = 1;
    return;
  }
  console.log('✅ 刷新完成。面板：' + path.join(TMP, 'dashboard', 'index.html'));
  if (STRICT && optionalFailed.length) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { steps };
