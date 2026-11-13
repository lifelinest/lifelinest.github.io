#!/usr/bin/env node
/**
 * tools/deploy-to-pages.js —— 博客部署一键化（红线友好版）
 * ------------------------------------------------------------------
 * 作用：把「同步产物 → git add/commit → (可选) push」串成一步，
 *       省掉每次手敲多行命令。push 这一步**默认不执行**，必须显式
 *       加 --push，等于用户在对话里明确批准部署。
 *
 * 用法：
 *   node tools/deploy-to-pages.js            # 同步 + commit（不推送）
 *   node tools/deploy-to-pages.js --push     # 在上一步基础上再 git push origin main
 *   node tools/deploy-to-pages.js --push --message="deploy: 关于页热榜上线"
 *                                            # 自定义 commit message（默认用时间戳）
 *
 * ⚠️ 红线：本脚本绝不擅自 push。只有带 --push 才推，而 --push 只能由
 *         用户在对话中明确说"部署/推送"后，由我（AI）显式传参触发。
 *         任何自动化调度都不得自动带 --push。
 *
 * 为什么不在 scripts/：hexo 会把 scripts/ 下每个 .js 当插件加载。
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEPLOY = path.join(ROOT, '.deploy_git');
const PUBLIC = path.join(ROOT, 'public');

function die(msg) {
  console.error('[deploy] ' + msg);
  process.exit(1);
}

if (!fs.existsSync(PUBLIC)) die('找不到 public/（请先 hexo generate --force）');
if (!fs.existsSync(DEPLOY)) die('找不到 .deploy_git/（部署产物仓库不存在）');

const doPush = process.argv.includes('--push');

// --message="..." / --message "..." 均支持（本项目 CLI 统一约定）
function getMessage() {
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--message' || a[i] === '-m') return a[i + 1] || null;
    const m = /^(?:--message|-m)=(.*)$/.exec(a[i]);
    if (m) return m[1] || null;
  }
  return null;
}

// ---------------------------------------------------------------- 1) 同步产物
// ⚠️ 不要先全量清空！2026-09-23 实测：fs.rmSync 会被 WorkBuddy 的 safe-delete shim
//    劫持成「移入回收站」，回收站二进制一旦超时（ETIMEDOUT）就会删到一半抛错，
//    把 .deploy_git 留在半残状态（实测被删掉 404.html 等 2 个文件）。
//    改为「增量覆盖 + 按需清理孤儿」：产物稳定时几乎不触发删除，更快也更安全。
console.log('== 1) 同步产物 public/ -> .deploy_git/ ==');
const DST = DEPLOY;
const lock = path.join(DST, '.git', 'index.lock');
if (fs.existsSync(lock)) { fs.rmSync(lock, { force: true }); console.log('   removed stale index.lock'); }

function copyDir(s, d) {
  fs.mkdirSync(d, { recursive: true });
  for (const e of fs.readdirSync(s, { withFileTypes: true })) {
    const sp = path.join(s, e.name);
    const dp = path.join(d, e.name);
    if (e.isDirectory()) copyDir(sp, dp);
    else if (e.isFile()) fs.copyFileSync(sp, dp);
  }
}

// 1a) 覆盖 + 新增（不预先删除任何东西）
copyDir(PUBLIC, DST);
console.log('   已覆盖/新增 public 全部文件');

// 1b) 清理孤儿：产物里已不存在、.deploy_git 里却还留着的文件
//     删除失败（safe-delete 超时）时退化为「改名移走」，保证流程绝不中断
const ORPHAN_DIR = path.join(ROOT, '.tmp', 'deploy-orphans');
let orphans = 0, movedAway = 0;
(function prune(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (d === DST && e.name === '.git') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) { prune(p); continue; }        // 空目录不删（git 本就不跟踪，留着无害）
    if (fs.existsSync(path.join(PUBLIC, path.relative(DST, p)))) continue;   // 仍存在 → 保留
    orphans++;
    try {
      fs.rmSync(p, { force: true });
    } catch (err) {
      try {
        fs.mkdirSync(ORPHAN_DIR, { recursive: true });
        fs.renameSync(p, path.join(ORPHAN_DIR, path.relative(DST, p).replace(/[\\/]/g, '__')));
        movedAway++;
      } catch (_) { console.log('   ⚠️ 无法清理: ' + path.relative(DST, p)); }
    }
  }
})(DST);
console.log('   孤儿文件 ' + orphans + ' 个（删除 ' + (orphans - movedAway) + ' / 改名移走 ' + movedAway + '）');

let n = 0;
(function count(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' && dir === DST) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) count(p);
    else n++;
  }
})(DST);
console.log('   deployed file count (excl .git):', n);

// ---------------------------------------------------------------- 2) git add + commit
console.log('\n== 2) git add -A + commit ==');
execFileSync('git', ['add', '-A'], { stdio: 'inherit', cwd: DEPLOY });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const msg = getMessage() || 'deploy: ' + stamp;
try {
  execFileSync('git', ['commit', '-m', msg], { stdio: 'inherit', cwd: DEPLOY });
} catch (e) {
  console.log('   （无新改动，跳过 commit）');
}

// ---------------------------------------------------------------- 3) push（需显式 --push）
if (doPush) {
  console.log('\n== 3) git push origin main ==');
  execFileSync('git', ['push', 'origin', 'main'], { stdio: 'inherit', cwd: DEPLOY });
  console.log('\n✅ 已推送，部署完成。');
} else {
  console.log('\n== 3) 未推送 ==');
  console.log('   已 commit（未 push）。确认部署请运行：node tools/deploy-to-pages.js --push');
}

module.exports = { ROOT, DEPLOY };
