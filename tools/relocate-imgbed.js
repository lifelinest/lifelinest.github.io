#!/usr/bin/env node
/**
 * 图床路径迁移 / 引用同步工具。
 *
 * 场景：当某张图在图床上被移动（如 posts/legacy/b00 -> 系统/设备/b00），
 *       全站所有引用它的本地文件必须同步改路径，否则线上图片打不开。
 *       本工具一次扫描 repo 内全部图床引用并批量改写，且自动重新百分号编码，
 *       保证 CSS/JS 模板与 markdown 都安全。
 *
 * 用法（默认干跑，安全）：
 *   node tools/relocate-imgbed.js --from=posts/legacy/b00 --to=系统/设备/b00
 *   node tools/relocate-imgbed.js --from=posts/legacy --to=系统/设备 --apply   # 整目录迁移
 *
 * 参数：
 *   --from  旧路径片段（解码后的可读形式，如 posts/legacy 或 系统/MBTI）
 *   --to    新路径片段（解码后的可读形式）
 *   --apply 真正写盘（不加则只打印将改什么）
 *   --root  扫描根（默认 Blog 仓库根）
 *
 * 扫描范围：仓库内 source/ tools/ scripts/ 及根 _config*.yml；
 *           跳过 node_modules/.git/.deploy_git/backup/.tmp/public（产物与备份不在改写范围）。
 * 同时更新 .tmp/imgbed-map.json 中的 URL 映射。
 */
const fs = require('fs');
const path = require('path');
const { extractImgbedUrls, decodeImgPath, normalizeImgUrl, hostOf } = require('./lib/imgbed-util');

const SKIP_DIRS = new Set(['node_modules', '.git', '.deploy_git', 'backup', '.tmp', 'public']);
const TEXT_EXT = new Set(['.md', '.markdown', '.yml', '.yaml', '.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.pug', '.json', '.xml', '.txt', '.ejs', '.styl']);

function parseArgs(argv) {
  const out = { from: null, to: null, apply: false, root: null };
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    const k = m[1], v = m[2];
    if (k === 'from') out.from = v;
    else if (k === 'to') out.to = v;
    else if (k === 'apply') out.apply = true;
    else if (k === 'root') out.root = v;
  }
  return out;
}

function walk(dir, files = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return files; }
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, files);
    } else if (e.isFile()) {
      if (TEXT_EXT.has(path.extname(e.name).toLowerCase())) files.push(full);
    }
  }
  return files;
}

/** 计算单个 URL 迁移后的新 URL；不匹配返回 null。
 *  在「解码路径」上做片段替换，再整体逐段重编码，避免「from 解码 / url 编码」匹配错位。 */
function relocateUrl(url, from, to) {
  const p = decodeImgPath(url); // 解码后的 /file/ 之后路径
  if (p == null || !p.includes(from)) return null;
  const newDecoded = p.replace(from, to);
  return normalizeImgUrl(hostOf(url) + '/file/' + newDecoded);
}

async function main() {
  const o = parseArgs(process.argv);
  if (!o.from || !o.to) { console.error('用法: node tools/relocate-imgbed.js --from=<旧片段> --to=<新片段> [--apply]'); process.exit(2); }
  const from = decodeURIComponent(o.from);
  const to = decodeURIComponent(o.to);
  const root = path.resolve(__dirname, '..', o.root || '');

  const files = walk(root);
  const changes = []; // { file, old, new }
  for (const f of files) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    const urls = [...new Set(extractImgbedUrls(text))];
    if (!urls.length) continue;
    let modified = text;
    for (const u of urls) {
      const nu = relocateUrl(u, from, to);
      if (nu && nu !== u) {
        // 精确替换该 URL 字符串（全词，避免误伤其它）
        modified = modified.split(u).join(nu);
        changes.push({ file: path.relative(root, f), old: u, new: nu });
      }
    }
    if (modified !== text) {
      if (o.apply) fs.writeFileSync(f, modified);
    }
  }

  // 同步更新 imgbed-map.json（值若为图床 URL 且命中）
  const mapPath = path.join(root, '.tmp', 'imgbed-map.json');
  let mapChanged = false;
  if (fs.existsSync(mapPath)) {
    try {
      const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      for (const k of Object.keys(map)) {
        const v = map[k];
        if (typeof v === 'string' && v.includes('cloudflare-img-bzb')) {
          const nu = relocateUrl(v, from, to);
          if (nu && nu !== v) { map[k] = nu; mapChanged = true; changes.push({ file: '.tmp/imgbed-map.json', old: v, new: nu }); }
        }
      }
      if (mapChanged && o.apply) fs.writeFileSync(mapPath, JSON.stringify(map, null, 2));
    } catch (e) {}
  }

  // 报告
  console.log('扫描根: ' + root);
  console.log('迁移: "' + from + '"  ->  "' + to + '"');
  console.log('模式: ' + (o.apply ? '✅ 已写盘' : '🔍 干跑（加 --apply 真正改写）'));
  console.log('涉及引用: ' + changes.length + ' 处' + (mapChanged ? '（含 map）' : ''));
  if (!changes.length) { console.log('无匹配，未改动任何文件。'); process.exit(0); }

  const byFile = {};
  for (const c of changes) (byFile[c.file] = byFile[c.file] || []).push(c);
  for (const [file, items] of Object.entries(byFile)) {
    console.log('\n📄 ' + file + '  (' + items.length + ' 处)');
    for (const it of items) console.log('     ' + it.old + '\n  →  ' + it.new);
  }

  if (!o.apply) {
    console.log('\n[干跑] 未改动文件。确认无误后加 --apply 执行。');
    console.log('执行后务必运行：node tools/check-imgbed-links.js --dir=public 核验新路径全部可达。');
  } else {
    console.log('\n✅ 改写完成。下一步：node tools/check-imgbed-links.js --dir=public 核验新路径全部可达，再部署。');
  }
}

if (require.main === module) main();
module.exports = { parseArgs, walk, relocateUrl };
