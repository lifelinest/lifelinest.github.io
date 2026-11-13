#!/usr/bin/env node
/**
 * tools/check-tags.js —— 标签体系合规闸门（只读，不改任何文件）
 *
 * 为什么需要它：站内标签体系是「定死的红线」，一次手滑写出 `工具分享-效率软件`
 * 或自造一个 `娱乐`，就会污染 /tags/ 页并且很难回滚。构建成功 ≠ 标签正确，
 * 所以在写入文章后、部署之前，用这个脚本对 front-matter 做一次全量体检。
 *
 * 白名单不是硬编码的 —— 它直接从规范源文
 *   source/_posts/个人博客文章标签使用规范.md  （abbrlink ad9cf40f）
 * 的 2.1 条款解析出来（8 大类 + 80 细分小类），规范改了脚本自动跟着变。
 *
 * 用法：
 *   node tools/check-tags.js                 # 扫描 source/_posts 全部 .md
 *   node tools/check-tags.js --file=<路径>    # 只校验单个文件（写新文章后跑）
 *   node tools/check-tags.js --list           # 打印白名单，供写文章时对照
 *   node tools/check-tags.js --quiet          # 只打印汇总
 * 退出码：0 = 全部合规；1 = 存在违规（可当部署闸）
 *
 * 注意：不要把这个文件放进 scripts/ —— hexo 会把 scripts/ 下的每个 .js 当插件加载执行。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'source', '_posts');
// 规范源文 2026-10-13 已移出 source/_posts（避免被 hexo 编译成文章），
// 存档在 Blog/.internal/；旧路径保留优先，找不到再退回 .internal/。
const SPEC_CANDIDATES = [
  path.join(POSTS_DIR, '个人博客文章标签使用规范.md'),
  path.join(ROOT, '.internal', '个人博客文章标签使用规范.md'),
];
const SPEC_FILE = SPEC_CANDIDATES.find((p) => fs.existsSync(p)) || SPEC_CANDIDATES[0];

// 站内 6 个栏目（用户 2026-09-21 定死，一律单值，禁自造）
const CATEGORIES = [
  '效率工具与软件',
  '外贸B2B独立站',
  '博客建站与前端',
  'AI内容增长',
  '数字生活',
  'SEO与Google Ads',
];

const EXCLUDE = new Set(['个人博客文章标签使用规范.md']);

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const hasFlag = (n) => argv.some((a) => a === n || a.startsWith(n + '='));
const getArg = (n, d) => {
  const hit = argv.find((a) => a.startsWith(n + '='));
  return hit ? hit.slice(n.length + 1) : d;
};
const ONLY_FILE = getArg('--file', '');
const SHOW_LIST = hasFlag('--list');
const QUIET = hasFlag('--quiet');

// ---------- 从规范解析白名单 ----------
function loadWhitelist() {
  if (!fs.existsSync(SPEC_FILE)) {
    console.error('找不到规范源文：' + SPEC_FILE);
    process.exit(1);
  }
  const raw = fs.readFileSync(SPEC_FILE, 'utf8');
  const majors = [];
  const minors = new Set();
  const lines = raw.split(/\r?\n/);
  // 形如： 1. **工具分享**（核心内涵：...）：免费工具（...）、效率软件（...）...
  const re = /^\d+\.\s*\*\*(.+?)\*\*（[^）]*）：(.+)$/;
  for (const line of lines) {
    const m = line.trim().match(re);
    if (!m) continue;
    const major = m[1].trim();
    majors.push(major);
    // 必须先剥掉所有「（...）」再按「、」切分 —— 注释里本身含顿号
    // （如「前端开发（HTML、CSS、JavaScript等前端技术的学习与实践）」），
    // 顺序反了会把词切碎，导致整个大类被误判为不在白名单。
    for (const part of m[2].replace(/（[^）]*）/g, '').split('、')) {
      const word = part.trim();
      if (word) minors.add(word);
    }
  }
  return { majors, minors };
}

const { majors: MAJORS, minors: MINORS } = loadWhitelist();
const MAJOR_SET = new Set(MAJORS);

function printWhitelist() {
  console.log('=== 规范定义的 8 大类（仅作概念归类，绝不写进 tags/categories）===');
  console.log('   ' + MAJORS.join('、'));
  console.log('\n=== 标签白名单：' + MINORS.size + ' 个细分小类（tags 只能从这里面取）===');
  const width = Math.max(...[...MINORS].map((s) => s.length));
  let line = '';
  [...MINORS].forEach((w, i) => {
    line += w.padEnd(width + 2, '　');
    if ((i + 1) % 5 === 0) { console.log('   ' + line); line = ''; }
  });
  if (line) console.log('   ' + line);
  console.log('\n=== 站内 6 个栏目（categories 只能取其一）===');
  console.log('   ' + CATEGORIES.join('、'));
  console.log('\n规范源文：' + SPEC_FILE);
}

// ---------- front-matter 解析 ----------
function splitFrontMatter(raw) {
  const m = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}

/** 取某个 key 的列表值，兼容块状列表 `- x` / 行内数组 `[a, b]` / 嵌套 `[[A],[B]]` */
function getList(fm, key) {
  const lines = fm.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const km = lines[i].match(new RegExp('^' + key + '\\s*:(.*)$'));
    if (!km) continue;
    const inline = km[1].trim();
    if (inline.startsWith('[')) {
      return inline
        .replace(/[[\]]/g, ' ')
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    }
    if (inline) return [inline.replace(/^['"]|['"]$/g, '')];
    const out = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s+-\s+/.test(lines[j])) {
        out.push(lines[j].replace(/^\s+-\s+/, '').trim().replace(/^['"]|['"]$/g, ''));
      } else break;
    }
    return out;
  }
  return [];
}

// ---------- 校验单篇 ----------
function validate(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const fm = splitFrontMatter(raw);
  const bad = [];
  if (!fm) return { bad: ['缺少 front-matter'], cats: [], tags: [] };

  const cats = getList(fm, 'categories');
  const tags = getList(fm, 'tags');
  // 英文版（i18n_lang 非 zh/cn）走宽松标签校验：放行英文标签体系，
  // 但仍拦住「中英混写 / 连字符 / 空格 / 超量 / 重复」这类真违规。
  const i18nLang = (getList(fm, 'i18n_lang')[0] || '').trim();
  const isI18nEn = i18nLang && i18nLang !== 'zh' && i18nLang !== 'cn';

  // categories（英文版仍用中文 6 栏目，照常校验）
  if (cats.length === 0) bad.push('categories 为空');
  else if (cats.length > 1) bad.push('categories 有 ' + cats.length + ' 个（站内规范：一律单值）');
  for (const c of cats) {
    if (!CATEGORIES.includes(c)) {
      bad.push('categories 不在站内 6 栏目内：' + JSON.stringify(c));
    }
  }

  // tags
  if (tags.length < 2) bad.push('tags 少于 2 个（当前 ' + tags.length + '）');
  if (tags.length > 5) bad.push('tags 超过 5 个（当前 ' + tags.length + '）');
  const seen = new Set();
  for (const t of tags) {
    if (seen.has(t)) bad.push('tags 重复：' + JSON.stringify(t));
    seen.add(t);
    if (/[-—–]/.test(t)) bad.push('tags 含连字符（勿写「大类-细分」）：' + JSON.stringify(t));
    if (/\s/.test(t)) bad.push('tags 含空格：' + JSON.stringify(t));
    if (isI18nEn) {
      if (/[一-鿿]/.test(t)) bad.push('英文版 tags 混入了中文字符：' + JSON.stringify(t));
      // 英文版：不强制中文 80 词白名单（英文标签体系未纳入），其余红线照拦
      continue;
    }
    if (MAJOR_SET.has(t)) bad.push('tags 用了大类名（跨层级违规）：' + JSON.stringify(t));
    else if (!MINORS.has(t)) bad.push('tags 不在 80 词白名单内：' + JSON.stringify(t));
  }
  return { bad, cats, tags, isI18nEn };
}

// ---------- 供其他工具 require 复用（run-matrix / matrix-planner 等）----------
module.exports = {
  loadWhitelist,
  CATEGORIES,
  splitFrontMatter,
  getList,
  validate,
  printWhitelist,
  MAJORS,
  MINORS,
  MAJOR_SET,
};

// ---------- 主流程（仅 CLI 直接运行时执行；被 require 时不产生副作用）----------
if (require.main === module) {
  if (SHOW_LIST) {
    printWhitelist();
    process.exit(0);
  }
  main();
}

function main() {
let files;
if (ONLY_FILE) {
  const p = path.isAbsolute(ONLY_FILE) ? ONLY_FILE : path.join(ROOT, ONLY_FILE);
  if (!fs.existsSync(p)) {
    console.error('文件不存在：' + p);
    process.exit(1);
  }
  files = [p];
} else {
  files = fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md') && !EXCLUDE.has(f))
    .map((f) => path.join(POSTS_DIR, f));
}

console.log('=== 标签合规校验 ===');
console.log('规范源文 : ' + path.relative(ROOT, SPEC_FILE).replace(/\\/g, '/'));
console.log('白名单   : ' + MAJORS.length + ' 大类 / ' + MINORS.size + ' 细分小类 / ' + CATEGORIES.length + ' 栏目');
console.log('校验范围 : ' + (ONLY_FILE ? path.basename(files[0]) : files.length + ' 篇文章'));
console.log('');

let pass = 0;
const failed = [];
for (const f of files) {
  const { bad, isI18nEn } = validate(f);
  const name = path.basename(f);
  if (bad.length === 0) {
    pass++;
    if (!QUIET && ONLY_FILE) console.log('[ 通过 ] ' + name + (isI18nEn ? '  (i18n-en 宽松校验)' : ''));
  } else {
    failed.push({ name, bad });
    console.log('[ 违规 ] ' + name + (isI18nEn ? '  (i18n-en)' : ''));
    for (const b of bad) console.log('         ✗ ' + b);
  }
}

console.log('');
console.log('共 ' + files.length + ' 篇 → 通过 ' + pass + ' / 违规 ' + failed.length);
if (failed.length) {
  console.log('退出码 1（存在违规，请先修正再部署）');
  process.exit(1);
}
console.log('退出码 0（标签体系合规）');
}
