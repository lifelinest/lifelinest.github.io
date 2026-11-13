#!/usr/bin/env node
'use strict';
/**
 * tools/fix-abbrlink.js —— abbrlink 一键修复（默认 dry-run）
 *
 * 场景：某篇文章的 front-matter 里 abbrlink 被写成了有害形态
 *       （例如 2026-09-16 的 `abbrlink: 8.601e+30`），
 *       hexo-abbrlink 会原样采用 → permalink 变成畸形 URL。
 *
 * 本工具用【插件同款算法】crc32.str(title) >>> 0 → toString(16) 重算，写回纯 hex。
 * 这样即使将来有人删掉这行让插件重算，结果也完全一致，URL 不会二次变化。
 *
 * 用法：
 *   node tools/fix-abbrlink.js                  # 只预览，不改文件
 *   node tools/fix-abbrlink.js --apply          # 写回（自动备份到 .tmp/backup-abbrlink-<ts>/）
 *   node tools/fix-abbrlink.js --file=xxx.md --apply   # 只处理某一篇
 *
 * 注意：写过之后，该文章的 URL 会变（permalink 由 abbrlink 决定）。
 *       如果旧 URL 已上线/被收录，需要在 source/ 下保留一个跳转页
 *       （参考 source/posts/8.601e+30/index.html），并同步 _config.yml 的 skip_render。
 */
const fs = require('fs');
const path = require('path');
const guard = require('../scripts/lib/abbrlink-guard');

const ROOT = path.join(__dirname, '..');
const postsArg = process.argv.find((a) => a.startsWith('--posts='));
const POSTS = postsArg ? path.resolve(postsArg.split('=')[1]) : path.join(ROOT, 'source', '_posts');
const APPLY = process.argv.includes('--apply');
const onlyArg = process.argv.find((a) => a.startsWith('--file='));
const ONLY = onlyArg ? onlyArg.split('=')[1] : null;

const res = guard.checkPosts(POSTS);
console.log('文章总数 : ' + res.total);
console.log('非法     : ' + res.bad.length);
console.log('重复     : ' + res.dup.length);
console.log('不可读   : ' + res.unreadable.length);
console.log('模式     : ' + (APPLY ? '【执行】' : '【干跑】仅预览') + '\n');

if (!res.bad.length && !res.dup.length) {
  console.log('✓ 没有需要修复的 abbrlink。');
  process.exit(0);
}

// ---------- 计算修复方案 ----------
const plan = [];
for (const b of res.bad) {
  if (ONLY && b.file !== ONLY) continue;
  const next = guard.recompute(b.title);
  plan.push({ file: b.file, from: b.value, to: next, why: b.reasons.join('；') });
}

if (!plan.length) {
  console.log('（--file 过滤后无可修复项）');
  process.exit(0);
}

console.log('=== 修复方案 ===');
plan.forEach((p) => {
  console.log('  ' + p.file);
  console.log('    ' + JSON.stringify(p.from) + '  →  ' + p.to);
  console.log('    原因: ' + p.why);
  console.log('    新 URL: /posts/' + p.to + '/');
});

if (res.dup.length) {
  console.log('\n=== 重复项（需人工决定，本工具不自动改）===');
  res.dup.forEach((d) => console.log('  ' + d.value + ' → ' + d.files.join(' , ')));
}

if (!APPLY) {
  console.log('\n干跑结束。加 --apply 执行写回。');
  process.exit(0);
}

// ---------- 执行 ----------
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const BACKUP = path.join(ROOT, '.tmp', 'backup-abbrlink-' + stamp);
fs.mkdirSync(BACKUP, { recursive: true });

let done = 0, fail = 0;
for (const p of plan) {
  const full = path.join(POSTS, p.file);
  let raw;
  try { raw = fs.readFileSync(full, 'utf8'); } catch (e) { console.log('  ✗ 读取失败 ' + p.file + ': ' + e.message); fail++; continue; }

  const m = /^(---\r?\n)([\s\S]*?)(\r?\n---)/.exec(raw);
  if (!m) { console.log('  ✗ 无 front-matter: ' + p.file); fail++; continue; }

  const fmStart = m.index + m[1].length;
  const newFront = m[2].replace(/^abbrlink:[ \t]*.*$/m, 'abbrlink: ' + p.to);
  if (newFront === m[2]) { console.log('  ✗ 未匹配到 abbrlink 行: ' + p.file); fail++; continue; }
  const newRaw = raw.slice(0, fmStart) + newFront + raw.slice(fmStart + m[2].length);

  try {
    fs.writeFileSync(path.join(BACKUP, p.file), raw, 'utf8');   // 备份原件
    fs.writeFileSync(full, newRaw, 'utf8');
    done++;
    console.log('  ✓ ' + p.file + '  →  ' + p.to);
  } catch (e) { console.log('  ✗ 写回失败 ' + p.file + ': ' + e.message); fail++; }
}

// ---------- 复验 ----------
const after = guard.checkPosts(POSTS);
console.log('\n=== 结果 ===');
console.log('已修复   : ' + done + ' / 失败: ' + fail);
console.log('复验非法 : ' + after.bad.length + (after.bad.length ? ' ✗' : ' ✓'));
console.log('复验重复 : ' + after.dup.length + (after.dup.length ? ' ✗' : ' ✓'));
console.log('备份目录 : ' + path.relative(ROOT, BACKUP));
console.log(done && !after.bad.length ? '\n✅ 修复完成。若旧 URL 已上线，请确认跳转页已就位。' : '\n⚠ 请检查上述输出。');
