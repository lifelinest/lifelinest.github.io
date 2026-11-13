#!/usr/bin/env node
/**
 * tools/link-architect.js —— 站内互链架构师（全站 hub-and-spoke 决策层）
 * ------------------------------------------------------------------
 * find-related-posts 解决「这篇文章该链向谁」（单篇视角）；
 * 本工具解决「整站链接结构是否健康」（全站视角）：
 *
 *   1. 扫全站建有向链接图：谁链向谁（出链/入链/自链/死链）
 *   2. 找出问题页：孤儿页（零入链，爬虫与权重都到不了）、弱入链页、互链不对等
 *   3. 用 TF-IDF 相似度 + 入链权威度，给出「谁应该补链给谁」的**可执行补链清单**
 *   4. 默认只出报告（dry-run）。--apply 才写入，且只在源文末尾追加一个
 *      被 <!-- link-architect --> 包裹的「相关阅读」块 —— 幂等、可整块替换、
 *      **绝不改动一句原有正文**。
 *
 * 用法：
 *   node tools/link-architect.js                        # 全站报告（只读）
 *   node tools/link-architect.js --json D:/1/1/.tmp/link-report.json
 *   node tools/link-architect.js --top=15               # 补链清单条数
 *   node tools/link-architect.js --apply --abbr=<abbr,...>   # 只对指定源文追加相关阅读块
 *   node tools/link-architect.js --strip --abbr=<abbr,...>   # 撤销本工具追加的块
 *
 * 红线：--apply 会改文件，属于「需用户明确批准」的动作；默认永不自动执行。
 * 退出码：0 = 正常；1 = 参数错误或存在死链（可当部署闸）
 *
 * 注意：不要把这个文件放进 scripts/ —— hexo 会把 scripts/ 下的每个 .js 当插件加载执行。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { getList } = require('./check-tags');
const { createIndex, findRelated, anchors, cleanBody } = require('./find-related-posts');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'source', '_posts');
const SITE = 'https://mfy-lifeline.com';
const EXCLUDE = new Set(['个人博客文章标签使用规范.md']);
const MARK_START = '<!-- link-architect:start -->';
const MARK_END = '<!-- link-architect:end -->';

const argv = process.argv.slice(2);
const getArg = (n, d) => {
  const i = argv.findIndex((a) => a === n || a.startsWith(n + '='));
  if (i === -1) return d;
  const a = argv[i];
  if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
  const nx = argv[i + 1];
  return nx && !nx.startsWith('--') ? nx : d;
};
const has = (n) => argv.some((a) => a === n || a.startsWith(n + '='));

const TOP = parseInt(getArg('--top', '10'), 10);
const JSON_OUT = getArg('--json', '');
const APPLY = has('--apply');
const STRIP = has('--strip');
const ABBR_FILTER = getArg('--abbr', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function scalar(fm, key) {
  const m = fm.match(new RegExp('^' + key + '\\s*:\\s*(.*)$', 'm'));
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
}

// ---------------- 载入站内文章 ----------------
// 只提取「指向本站文章」的链接。
// 踩坑记录：图床图片路径形如 .../file/posts/legacy/1789_c08.jpeg —— 里面的
// /posts/legacy/ 曾被当成文章链接，一次报出 6 条假死链（图床目录名恰叫 posts）。
// 因此必须：先去代码块、去图片、去 HTML 标签，再只认 /posts/<abbr>/ 结构。
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|avif|ico|bmp|tiff?)([?#].*)?$/i;

function extractArticleLinks(body) {
  let t = body
    .replace(/```[\s\S]*?```/g, ' ')      // 代码块里的示例 URL 不算内链
    .replace(/`[^`]*`/g, ' ')             // 行内代码同理
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 图片（图床路径会伪装成 /posts/xx/）
    .replace(/<[^>]+>/g, ' ');            // HTML 标签（含 <img src>）

  const out = new Set();
  const push = (u) => {
    if (!u) return;
    if (/cloudflare-img-bzb\.pages\.dev/i.test(u)) return;
    if (IMG_EXT.test(u)) return;
    const m = u.match(/\/posts\/([0-9a-zA-Z]{3,})\/?/);
    if (m) out.add(m[1]);
  };
  // ① markdown 行内链接，且必须是站内（相对 /posts/... 或本站绝对地址）
  for (const m of t.matchAll(/\]\(([^)\s]+)\)/g)) {
    const u = m[1];
    if (/^\/posts\//.test(u) || /^https?:\/\/mfy-lifeline\.com\/posts\//.test(u)) push(u);
  }
  // ② 正文里裸写的本站绝对地址
  for (const m of t.matchAll(/https?:\/\/mfy-lifeline\.com\/posts\/([0-9a-zA-Z]{3,})\//g)) out.add(m[1]);
  // ③ 正文里裸写的站内相对路径（前面不能紧跟域名类字符，避免重复/误抓）
  for (const m of t.matchAll(/(?<![\/\w.])\/posts\/([0-9a-zA-Z]{3,})\//g)) out.add(m[1]);
  return [...out];
}

const files = fs
  .readdirSync(POSTS_DIR)
  .filter((f) => f.endsWith('.md') && !EXCLUDE.has(f))
  .map((f) => path.join(POSTS_DIR, f));

const posts = files.map((file) => {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  const fm = m ? m[1] : '';
  const body = m ? raw.slice(m[0].length) : raw;
  const outs = extractArticleLinks(body);
  const title = scalar(fm, 'title');
  return {
    file,
    name: path.basename(file),
    abbr: scalar(fm, 'abbrlink'),
    title,
    tags: getList(fm, 'tags'),
    cats: getList(fm, 'categories'),
    kind: getList(fm, 'i18n_lang')[0] ? 'i18n' : 'cn',
    outs,
    // ⚠️ 查询语料必须与 find-related-posts 的文档语料**同构**（标题×3 + 正文 3000 字）。
    // 2026-09-23 修：此前这里只把 title 传给 findRelated，而文档侧是标题×3+正文，
    // 二者语料不对等 → 余弦被人为压低（全站最高仅 0.37）、qTags/qCats 为空导致
    // 同栏目判定恒为 false（268 条建议里 0 条同栏目），补链质量极差。
    qText: (title + ' ').repeat(3) + cleanBody(body).slice(0, 3000),
  };
});

const byAbbr = new Map(posts.filter((p) => p.abbr).map((p) => [p.abbr, p]));

// ---------------- 建图 ----------------
const inLinks = new Map(posts.map((p) => [p.abbr, []])); // abbr -> 来源文章
const deadLinks = [];  // 指向不存在 abbrlink 的链接（隐形 404）
const selfLinks = [];
for (const p of posts) {
  for (const o of p.outs) {
    if (!byAbbr.has(o)) { deadLinks.push({ from: p.abbr, to: o, file: p.name }); continue; }
    if (o === p.abbr) { selfLinks.push({ abbr: p.abbr, file: p.name }); continue; }
    inLinks.get(o).push(p);
  }
}

const nodes = posts.map((p) => ({
  abbr: p.abbr,
  title: p.title,
  name: p.name,
  cat: p.cats[0] || '(无栏目)',
  outDeg: p.outs.filter((o) => byAbbr.has(o) && o !== p.abbr).length,
  inDeg: (inLinks.get(p.abbr) || []).length,
}));

const orphans = nodes.filter((n) => n.inDeg === 0).sort((a, b) => a.title.localeCompare(b.title));
const weak = nodes.filter((n) => n.inDeg === 1).sort((a, b) => a.title.localeCompare(b.title));
const hubs = [...nodes].sort((a, b) => b.outDeg - a.outDeg).slice(0, 10);
const totalLinks = nodes.reduce((a, n) => a + n.outDeg, 0);
const avgIn = nodes.length ? (totalLinks / nodes.length).toFixed(2) : '0';

// ---------------- 补链建议 ----------------
// 对每个零/弱入链页，问 find-related-posts「谁最像它的邻居」，再按来源权威度
// （入链数）加权排序：让有入链的页去链它，比让另一个孤儿链它更有效。
// 注意：全站语料只建一次索引，在进程内循环算相似度 —— 早先每篇 spawn 一个
// 子进程的做法在上百个孤儿页时直接把进程拖死（SIGTERM）。
const index = createIndex();

// 预先算出「文章标题 → 该文正文里已出的链」，避免每条建议重复读盘
const outsByAbbr = new Map(posts.map((p) => [p.abbr, new Set(p.outs)]));

const targets = [...orphans, ...weak];
const suggestions = [];
const MIN_COS = Number(getArg('--min-cos', '0.08')); // 低于此余弦视为噪声，不补
const MAX_PER_SRC = parseInt(getArg('--max-per-src', '5'), 10); // 单源文最多补几条

for (const t of targets) {
  const tp = byAbbr.get(t.abbr);
  const cands = findRelated(
    {
      title: t.title || t.name,
      text: tp ? tp.qText : t.title || t.name, // 与文档语料同构，否则余弦被压低
      tags: tp ? tp.tags : [],
      cats: tp ? tp.cats : [],
    },
    { index, top: 8, selfName: t.name }
  ).related;
  const picks = cands
    .filter((c) => c.abbr !== t.abbr && byAbbr.has(c.abbr))
    .filter((c) => Number(c.cosine) >= MIN_COS)
    // 已经链过的不再建议
    .filter((c) => !(outsByAbbr.get(c.abbr) || new Set()).has(t.abbr))
    .map((c) => {
      const src = nodes.find((n) => n.abbr === c.abbr);
      const authority = 1 + Math.log(1 + (src ? src.inDeg : 0)) * 0.6;
      const catBoost = c.sameCategory ? 1.25 : 1; // 同栏目互链对读者与爬虫都更有意义
      return {
        fromAbbr: c.abbr,
        fromTitle: c.title,
        toAbbr: t.abbr,
        toTitle: t.title,
        // 锚文本要描述「被链向的目标文」，不是来源文（曾写反）
        anchor: anchors(t.title)[0] || t.title,
        similarity: c.cosine,
        fromInDeg: src ? src.inDeg : 0,
        priority: Number((c.cosine * authority * catBoost).toFixed(4)),
        sameCat: !!c.sameCategory,
      };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 2);
  for (const p of picks) suggestions.push(p);
}
suggestions.sort((a, b) => b.priority - a.priority);

// 单源文封顶：避免文末「相关阅读」块堆十几条链接（曾在 Hexo 教程文出现 13 条）
const perSrc = new Map();
const capped = [];
for (const s of suggestions) {
  const n = perSrc.get(s.fromAbbr) || 0;
  if (n >= MAX_PER_SRC) continue;
  perSrc.set(s.fromAbbr, n + 1);
  capped.push(s);
}
suggestions.length = 0;
suggestions.push(...capped);

// ---------------- apply / strip ----------------
function buildBlock(items) {
  const lines = [MARK_START, '', '## 相关阅读', ''];
  for (const it of items) lines.push('- [' + it.anchor + '](' + SITE + '/posts/' + it.toAbbr + '/)');
  lines.push('', MARK_END);
  return lines.join('\n');
}

// 撤销必须**逐字节**还原（否则每次 apply/strip 都在 git 里留下噪声 diff）。
// apply 恒定追加 `\n\n` + block + `\n`，故 strip 用端锚定匹配 `\n{0,2}` 前缀，
// 恰好吃回那 2 个换行，原文件的尾随空白一个都不动。
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RE_BLOCK_AT_END = new RegExp('\\n{0,2}' + esc(MARK_START) + '[\\s\\S]*?' + esc(MARK_END) + '\\n?$');
const RE_BLOCK_ANY = new RegExp('\\n*' + esc(MARK_START) + '[\\s\\S]*?' + esc(MARK_END) + '\\n*', 'g');

function removeBlock(raw) {
  return RE_BLOCK_AT_END.test(raw) ? raw.replace(RE_BLOCK_AT_END, '') : raw.replace(RE_BLOCK_ANY, '\n');
}
function appendBlock(raw, block) {
  return removeBlock(raw) + '\n\n' + block + '\n';
}

if (APPLY || STRIP) {
  if (!ABBR_FILTER.length) {
    console.error('✗ --apply / --strip 必须配合 --abbr=<abbr,...> 指定要改的源文（防止误改全站）。');
    process.exit(1);
  }
  let changed = 0;
  for (const abbr of ABBR_FILTER) {
    const p = byAbbr.get(abbr);
    if (!p) { console.error('  [ 跳过 ] 找不到 abbrlink ' + abbr); continue; }
    let raw = fs.readFileSync(p.file, 'utf8');
    const before = raw;
    if (APPLY) {
      const items = suggestions.filter((s) => s.fromAbbr === abbr);
      if (!items.length) { console.error('  [ 跳过 ] ' + abbr + ' 当前没有待补的补链建议'); continue; }
      raw = appendBlock(raw, buildBlock(items));   // appendBlock 自带幂等（先摘旧块再追加）
    } else {
      raw = removeBlock(raw);
    }
    if (raw === before) { console.error('  [ 无变化 ] ' + p.name); continue; }
    fs.writeFileSync(p.file, raw, 'utf8');
    changed++;
    console.log('  [ ' + (APPLY ? '已写入' : '已移除') + ' ] ' + p.name);
  }
  console.log('');
  console.log((APPLY ? '补链块' : '清理') + '完成，改写 ' + changed + ' 个文件。');
  console.log('提醒：改完记得重跑 node tools/check-external-links.js 与 hexo generate。');
  process.exit(0);
}

// ---------------- 报告 ----------------
const L = [];
L.push('=== 站内互链架构体检 ===');
L.push('文章总数 : ' + nodes.length);
L.push('站内链接 : ' + totalLinks + ' 条，平均每篇入链 ' + avgIn + ' 条');
L.push('孤儿页   : ' + orphans.length + ' 篇（零入链 —— 爬虫与权重都到不了）');
L.push('弱入链页 : ' + weak.length + ' 篇（仅 1 条入链）');
L.push('死链     : ' + deadLinks.length + ' 条' + (deadLinks.length ? '  ← 隐形 404，必须修' : ''));
L.push('自链     : ' + selfLinks.length + ' 条');
L.push('');
L.push('── 出链最多的枢纽页（应该在支柱/聚合文章里）' + '─'.repeat(10));
hubs.forEach((h, i) => L.push('  ' + (i + 1) + '. [' + h.outDeg + ' 出链] ' + h.title + '  (' + h.cat + ')'));
L.push('');
if (orphans.length) {
  L.push('── 孤儿页清单（前 20）' + '─'.repeat(28));
  orphans.slice(0, 20).forEach((o) => L.push('  · ' + o.title + '  (' + o.cat + ', 出链 ' + o.outDeg + ')'));
  if (orphans.length > 20) L.push('  … 其余 ' + (orphans.length - 20) + ' 篇见 JSON');
  L.push('');
}
if (deadLinks.length) {
  L.push('── 死链明细' + '─'.repeat(36));
  deadLinks.forEach((d) => L.push('  ✗ ' + d.file + '  → /posts/' + d.to + '/ 不存在'));
  L.push('');
}
L.push('── 补链清单（Top ' + TOP + '：让 A 文补一条链指向 B 文）' + '─'.repeat(12));
if (!suggestions.length) L.push('  （无需补链，结构健康）');
suggestions.slice(0, TOP).forEach((s, i) => {
  L.push('  ' + (i + 1) + '. [优先 ' + s.priority + '] ' + s.fromTitle);
  L.push('        → 链向：' + s.toTitle);
  L.push('        → URL：' + SITE + '/posts/' + s.toAbbr + '/  ｜ 锚文本：' + s.anchor);
  L.push('        （相似度 ' + Number(s.similarity).toFixed(3) + '，来源入链数 ' + s.fromInDeg + (s.sameCat ? '，同栏目' : '') + '）');
});
L.push('');
L.push('执行方式（需你批准后我才会跑）：');
L.push('  node tools/link-architect.js --apply --abbr=<源文abbr,...>   # 只改指定源文，追加「相关阅读」块');
L.push('  node tools/link-architect.js --strip --abbr=<源文abbr,...>   # 撤销');

console.log(L.join('\n'));

if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: { posts: nodes.length, totalLinks, avgIn: Number(avgIn), orphans: orphans.length, weak: weak.length, dead: deadLinks.length, self: selfLinks.length },
    orphans, weak, hubs,
    deadLinks,
    suggestions,
  }, null, 2));
  console.log('\n✅ 报告 JSON 已落盘：' + JSON_OUT);
}

process.exit(deadLinks.length ? 1 : 0);
