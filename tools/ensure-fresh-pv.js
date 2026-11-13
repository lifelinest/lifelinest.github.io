#!/usr/bin/env node
/**
 * tools/ensure-fresh-pv.js —— 上游数据新鲜度守卫（幂等，可独立跑）
 * ------------------------------------------------------------------
 * 为什么要有这个模块：
 *   2026-10-03 实测踩到的坑 —— 学习层（insight.json）停在 9-24 整整 9 天，
 *   选题雷达据此建议「翻新 cd7681cc」，而那篇 10-01 已经改造完了。
 *   根因不是取不到数据（`fetch-stats --no-cache` 随时能拿到当天数据），
 *   而是**没有任何入口会在数据过期时主动补一次**。
 *
 *   本模块把「先保证数据是新的」变成默认行为，而不是靠人记得先跑一遍。
 *
 * 设计约束：
 *   · 幂等 —— 数据新鲜时什么都不做（不联网、不写盘）。
 *   · 失败不阻断 —— 拉不到就沿用旧快照，由调用方继续打过期横幅，绝不因此中断主流程。
 *   · 只读 —— 只取流量、只落 .tmp 的诊断产物；不碰文章、不构建、不部署。
 *
 * 用法：
 *   node tools/ensure-fresh-pv.js            # 检查 + 必要时补拉 PV
 *   node tools/ensure-fresh-pv.js --force    # 无条件补拉
 *   node tools/ensure-fresh-pv.js --insight  # 连学习层一起补（PV → insight-engine）
 * 退出码：0 数据可用（新或沿用旧快照都可以跑）；1 连旧快照都没有且补拉失败。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.resolve(ROOT, '..', '.tmp');
// ⚠️ 必须与 fetch-stats.js 的权威缓存一致（insight-engine 读的也是这两个里最新的一份）
const CACHE_FILE = path.join(TMP, 'stats-state', 'hot.json');
const INSIGHT_JSON = path.join(TMP, 'insight', 'insight.json');

const PV_STALE_H = 6;      // PV 超过 6 小时就当旧（与 insight-engine 的过期横幅阈值同源）
const INSIGHT_STALE_D = 7; // 学习层超过 7 天没跑就补一次

function fileAgeHours(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (j && j.t) return (Date.now() - j.t) / 3600000;
    if (j && j.pvAt) return (Date.now() - j.pvAt) / 3600000;
    if (j && j.generatedAt) return (Date.now() - j.generatedAt) / 3600000;
  } catch (e) { /* 落到 mtime */ }
  try {
    return (Date.now() - fs.statSync(file).mtimeMs) / 3600000;
  } catch (e) {
    return null;
  }
}

function runTool(file, args, timeoutMs) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file)].concat(args || []), {
    cwd: ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: timeoutMs || 180000,
  });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/**
 * 保证 PV 缓存是新鲜的。过期（或不存在）就跑一次 fetch-stats --no-cache。
 * @returns {{ok:boolean, ageH:number|null, refreshed:boolean, msg:string}}
 */
function ensureFreshPv(opts) {
  opts = opts || {};
  const staleH = opts.staleHours == null ? PV_STALE_H : opts.staleHours;
  const ageH = fileAgeHours(CACHE_FILE);
  const res = { ok: true, ageH, refreshed: false, msg: '', file: CACHE_FILE };

  const exists = fs.existsSync(CACHE_FILE);
  if (exists && ageH != null && ageH < staleH) {
    res.msg = 'PV 新鲜（' + ageH.toFixed(1) + ' 小时内）';
    return res;
  }
  if (opts.dryRun) {
    res.msg = (exists ? 'PV 已过期 ' + (ageH == null ? '?' : ageH.toFixed(1)) + ' 小时' : 'PV 缓存不存在') + '（--dry-run：未拉取）';
    return res;
  }

  const before = exists && ageH != null ? ageH : null;
  const r = runTool('fetch-stats.js', ['--no-cache'], 180000);
  if (r.status === 0) {
    const age2 = fileAgeHours(CACHE_FILE);
    res.refreshed = true;
    res.ageH = age2;
    res.msg = 'PV 已补拉（原 ' + (before == null ? '无' : before.toFixed(1) + ' 小时前') + ' → 现 ' +
      (age2 == null ? '?' : age2.toFixed(1)) + ' 小时内）';
  } else {
    res.ok = false;
    res.msg = 'PV 补拉失败，沿用旧快照' + (before == null ? '' : '（' + before.toFixed(1) + ' 小时前）') +
      '｜如持续失败多半是 51.la 上游鉴权问题，先跑 `node tools/fetch-stats.js --no-cache` 看报错';
    if (!opts.quiet) process.stderr.write('[ensure-fresh-pv] ⚠️ ' + res.msg + '\n');
  }
  return res;
}

/**
 * 保证学习层（insight.json）不陈旧。会顺带先补 PV。
 * @returns {{ok:boolean, pv:object, insight:{ok:boolean, ageH:number|null, refreshed:boolean, msg:string}}}
 */
function ensureInsight(opts) {
  opts = opts || {};
  const staleD = opts.staleDays == null ? INSIGHT_STALE_D : opts.staleDays;
  const pv = ensureFreshPv(opts);

  const ageH = fileAgeHours(INSIGHT_JSON);
  const out = { ok: true, ageH, refreshed: false, msg: '', file: INSIGHT_JSON };

  if (fs.existsSync(INSIGHT_JSON) && ageH != null && ageH < staleD * 24) {
    out.msg = '学习层新鲜（' + (ageH / 24).toFixed(1) + ' 天内）';
    return { ok: pv.ok, pv, insight: out };
  }
  if (opts.dryRun) {
    out.msg = '学习层已过期 ' + (ageH == null ? '未知' : (ageH / 24).toFixed(1) + ' 天') + '（--dry-run：未重算）';
    return { ok: pv.ok, pv, insight: out };
  }

  const r = runTool('insight-engine.js', ['--quiet'], 180000);
  if (r.status === 0) {
    const age2 = fileAgeHours(INSIGHT_JSON);
    out.refreshed = true;
    out.ageH = age2;
    out.msg = '学习层已重算（现 ' + (age2 == null ? '?' : (age2 / 24).toFixed(1)) + ' 天内）';
  } else {
    out.ok = false;
    out.msg = '学习层重算失败，沿用旧产物' + (ageH == null ? '' : '（' + (ageH / 24).toFixed(1) + ' 天前）');
    if (!opts.quiet) process.stderr.write('[ensure-fresh-pv] ⚠️ ' + out.msg + '\n');
  }
  return { ok: pv.ok && out.ok, pv, insight: out };
}

module.exports = { ensureFreshPv, ensureInsight, fileAgeHours, CACHE_FILE, INSIGHT_JSON, PV_STALE_H, INSIGHT_STALE_D };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const withInsight = argv.includes('--insight');
  const dry = argv.includes('--dry-run');
  const opts = { staleHours: force ? 0 : PV_STALE_H, dryRun: dry };

  if (withInsight) {
    const r = ensureInsight(opts);
    console.log('PV 缓存    :', r.pv.file);
    console.log('  ', r.pv.msg);
    console.log('学习层产物 :', r.insight.file);
    console.log('  ', r.insight.msg);
    process.exit(r.ok ? 0 : 1);
  }

  const r = ensureFreshPv(opts);
  console.log('PV 缓存:', r.file);
  console.log('年龄  :', r.ageH == null ? '未知' : r.ageH.toFixed(1) + ' 小时');
  console.log('结果  :', r.msg);
  process.exit(r.ok ? 0 : 1);
}
