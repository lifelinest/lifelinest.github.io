#!/usr/bin/env node
/**
 * 封面落地：① 按 tools/imgbed-rules.md 把 cover-generator 产出的 webp 上传图床
 *           ② 回填各文章 front-matter 的 cover: 字段
 *
 * 目录规范：封面图/<年>/<月>/<abbrlink>.webp   （年/月 取文章自身 date，与 文章图/ 一致）
 * URL 写法：按段百分号编码（与站内既有 cover: 写法一致）
 * 旧封面图**不删除**，只换引用。
 *
 * 用法：
 *   node tools/cover-apply.mjs            # 干跑：列出计划（分组、将要上传的文件、回填示例）
 *   node tools/cover-apply.mjs --apply    # 真上传 + 真回填
 *   node tools/cover-apply.mjs --apply --only-backfill   # 跳过上传，仅用已有映射回填
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// 回填后自检用（hexo 依赖里已有 js-yaml）；取不到就跳过自检，不阻塞主流程
let yaml = null;
try { yaml = (await import('js-yaml')).default; } catch { try { yaml = (await import('D:/1/1/Blog/node_modules/js-yaml/dist/js-yaml.mjs')).default; } catch { yaml = null; } }

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONLY_BACKFILL = args.includes('--only-backfill');

const MANIFEST = 'D:/1/1/.tmp/cover-all/manifest.json';
const WEBP_DIR = 'D:/1/1/.tmp/cover-webp';
const POSTS_DIR = 'D:/1/1/Blog/source/_posts';
const MAP_PATH = 'D:/1/1/Blog/.tmp/imgbed-map.json';
const UPLOADER = 'D:/1/1/Blog/tools/upload-to-imgbed.js';
const CDN_HOST = 'https://cloudflare-img-bzb.pages.dev';

const items = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).items.filter((i) => i.ok);
console.log(`manifest 中可用封面 ${items.length} 张`);

// ── 1. 校验 webp 齐全 ─────────────────────────────────────────
const missing = items.filter((i) => !fs.existsSync(path.join(WEBP_DIR, `${i.abbrlink}.webp`)));
if (missing.length) {
  console.error(`❌ 缺少 ${missing.length} 个 webp：${missing.slice(0, 5).map((m) => m.abbrlink).join(', ')} …`);
  process.exit(1);
}
console.log(`✅ webp 齐全（${WEBP_DIR}）`);

// ── 2. 按 年/月 分组 ──────────────────────────────────────────
const groups = new Map();
for (const it of items) {
  const key = String(it.year) + '/' + String(it.month);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(it);
}
console.log(`共 ${groups.size} 个月份分组`);

// ── 3. 上传（读取已有映射跳过重复）────────────────────────────
let map = {};
try { map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8')); } catch (e) {}

function encodePathSegments(u) {
  const m = /^(https?:\/\/[^/]+)(\/.*)$/.exec(u);
  if (!m) return u;
  const enc = m[2].split('/').map((s) => {
    try { return encodeURIComponent(decodeURIComponent(s)); } catch (e) { return encodeURIComponent(s); }
  }).join('/');
  return m[1] + enc;
}

if (!ONLY_BACKFILL) {
  for (const [key, list] of groups) {
    const todo = list.filter((it) => !map[`${it.abbrlink}.webp`]);
    if (!todo.length) { console.log(`  ${key}: 已全部有映射，跳过`); continue; }
    const only = todo.map((it) => `${it.abbrlink}.webp`).join(',');
    const cmd = [UPLOADER, `--src=${WEBP_DIR}`, '--category', 'cover', '--sub', key, `--only=${only}`];
    if (APPLY) cmd.push('--apply');
    console.log(`  ${key}: ${todo.length} 张 ${APPLY ? '（上传）' : '（干跑）'}`);
    try {
      const out = execFileSync(process.execPath, cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const tail = out.trim().split('\n').slice(-3).join(' | ');
      if (tail) console.log(`     ${tail.slice(0, 200)}`);
    } catch (e) {
      console.error(`     ❌ 上传失败 ${key}: ${String(e.message).slice(0, 300)}`);
      process.exit(1);
    }
    try { map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8')); } catch (e) {}
  }
}

// ── 4. 回填 front-matter ──────────────────────────────────────
function setCover(file, url) {
  let txt = fs.readFileSync(file, 'utf8');
  const crlf = txt.includes('\r\n');
  const norm = txt.replace(/\r\n/g, '\n');
  if (!norm.startsWith('---\n')) throw new Error('无 front-matter: ' + file);
  const end = norm.indexOf('\n---', 4);
  if (end < 0) throw new Error('front-matter 未闭合: ' + file);
  const lines = norm.slice(4, end).split('\n');
  const rest = norm.slice(end);

  const i = lines.findIndex((l) => /^cover:[ \t]/.test(l));
  if (i >= 0) {
    // ⚠️ 先清掉 cover 行后面的 YAML 缩进续行：
    //    `cover: A\n  B` 会被解析成折叠标量 "A B"（两条 URL 拼成一个字符串），
    //    主题拿到非法地址 → 封面渲染失败。必须在 unchanged 判断之前清理，
    //    否则「cover 行已正确、只有尾巴是脏的」会被误判为未变更而跳过。
    let j = i + 1;
    while (j < lines.length && /^[ \t]+\S/.test(lines[j]) && !/^[ \t]+-[ \t]/.test(lines[j])) j++;
    const hadTail = j > i + 1;
    if (lines[i] === 'cover: ' + url && !hadTail) return 'unchanged';
    lines[i] = 'cover: ' + url;
    if (hadTail) lines.splice(i + 1, j - (i + 1));
  } else {
    let ins = lines.findIndex((l) => /^description:[ \t]/.test(l));
    if (ins < 0) ins = lines.findIndex((l) => /^author:[ \t]/.test(l));
    if (ins < 0) ins = lines.findIndex((l) => /^title:[ \t]/.test(l));
    if (ins < 0) throw new Error('找不到插入位置: ' + file);
    lines.splice(ins + 1, 0, 'cover: ' + url);
  }
  let out = '---\n' + lines.join('\n') + rest;
  if (crlf) out = out.replace(/\n/g, '\r\n');
  fs.writeFileSync(file, out, 'utf8');
  return i >= 0 ? 'replaced' : 'inserted';
}

const postFiles = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
const stat = { replaced: 0, inserted: 0, unchanged: 0, skipped: 0 };
const samples = [];

for (const it of items) {
  const url = map[`${it.abbrlink}.webp`];
  if (!url) { console.error(`  ⚠️ 无映射，跳过 ${it.abbrlink}`); stat.skipped++; continue; }
  const finalUrl = encodePathSegments(url);
  if (samples.length < 2) samples.push(finalUrl);
  if (!APPLY) continue;
  const target = path.join(POSTS_DIR, it.fileName);
  if (!fs.existsSync(target)) { console.error(`  ⚠️ 源文件不存在 ${it.fileName}`); stat.skipped++; continue; }
  const r = setCover(target, finalUrl);
  stat[r]++;
  // 回填后自检：front-matter 必须能解析，且 cover 是「单值 URL」（不含空白）。
  // 历史坑：cover 后面接了 YAML 缩进续行 → 被解析成 "A B" 拼接串，页面封面渲染失败。
  if (yaml) {
    try {
      const m = fs.readFileSync(target, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)/);
      const y = yaml.load(m ? m[1] : '');
      const c = y && y.cover;
      if (typeof c !== 'string' || /\s/.test(c) || !/^https?:\/\//.test(c)) {
        console.error(`  ❌ 自检失败(cover 非法) ${it.fileName} -> ${JSON.stringify(c)}`);
        stat.bad = (stat.bad || 0) + 1;
      }
    } catch (e) {
      console.error(`  ❌ 自检失败(YAML 解析) ${it.fileName} -> ${e.message}`);
      stat.bad = (stat.bad || 0) + 1;
    }
  }
}

if (stat.bad) console.error(`\n⚠️ 有 ${stat.bad} 篇自检未通过，请检查后再继续！`);

console.log('\n=== 回填结果 ===');
console.log(JSON.stringify(stat));
console.log('URL 样例：');
for (const s of samples) console.log('  ' + s);
if (!APPLY) console.log('\n（当前为干跑，未改动任何文件；加 --apply 才真正执行）');
