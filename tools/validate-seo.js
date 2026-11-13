#!/usr/bin/env node
/**
 * tools/validate-seo.js —— 部署前全量校验（只读，不改任何文件）
 *
 * 为什么需要它：本站的 SEO 增强（作者实体 / FAQ / 正文锚文本 / sitemap / llms.txt）
 * 全部是构建期由 scripts/seo-enhancer.js 自动改写的。构建成功 ≠ 产物正确 ——
 * 一次 JSON-LD 语法错误、一条指向 404 的内链，上了线比没有更糟。
 * 所以每次准备部署前，用这个脚本对 public/ 做一次全量体检。
 *
 * 用法：
 *   node tools/validate-seo.js [public目录]        # 默认 ./public
 * 退出码：0 = 全部通过；1 = 存在 ERROR
 *
 * 注意：不要把这个文件放进 scripts/ —— hexo 会把 scripts/ 下的每个 .js 当插件加载执行。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PUB = process.argv[2] || path.join(__dirname, '..', 'public');

// ---------- 工具 ----------
let errors = [];
let warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

function walk(dir, pred, out) {
  out = out || [];
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, pred, out);
    else if (pred(p)) out.push(p);
  }
  return out;
}

const read = (p) => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    // 闸门不能因为「单个文件读不到」就整体崩溃 —— 那样等于没有报告。
    // 记成 ERROR 继续跑完，让其余检查项照常给出结论。
    err('读取失败 ' + path.relative(PUB, p).replace(/\\/g, '/') + '（' + (e.code || e.message) + '）');
    return '';
  }
};

/** 用状态机判断某段 HTML 是否存在 <a> 嵌套 */
function hasNestedAnchor(html) {
  const re = /<(\/?)\s*a\b[^>]*>/gi;
  let depth = 0, m;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) depth = Math.max(0, depth - 1);
    else if (!/\/\s*>$/.test(m[0])) { depth++; if (depth > 1) return true; }
  }
  return false;
}

/** 取出所有 <tag ...>...</tag> 的内容（非嵌套，够用） */
function segmentsOf(html, tag) {
  const re = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'gi');
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

// ---------- 主流程 ----------
if (!fs.existsSync(PUB)) {
  console.error('找不到 public 目录：' + PUB);
  process.exit(1);
}

const htmlFiles = walk(PUB, (p) => p.endsWith(path.sep + 'index.html'));
const articleFiles = htmlFiles.filter((p) => /[\\/]posts[\\/]/.test(p));

// 「独立单页」= 不走主题渲染、因此不应参与「主题页面」类检查的页面：
//   ① docs/ 下自带样式的独立单页（不引主题 CSS 属正常）
//   ② 历史脏 URL 的跳转页（样式内联 + meta refresh，既无主题 CSS 也无 JSON-LD 是设计如此）
const standaloneSet = new Set(
  htmlFiles.filter((f) => {
    const rel = path.relative(PUB, f).replace(/\\/g, '/');
    if (/^docs\//.test(rel)) return true;
    return /http-equiv=["']refresh["']/i.test(read(f));
  })
);
const themedFiles = htmlFiles.filter((f) => !standaloneSet.has(f));

console.log('='.repeat(64));
console.log('部署前全量校验  ' + PUB);
console.log('页面 ' + htmlFiles.length + ' 个（其中文章页 ' + articleFiles.length + ' 个）');
console.log('='.repeat(64));

// --- 1) 结构化数据可解析 + 实体挂接 ---
let ldPages = 0, ldBlocks = 0, ldParseFail = 0;
let personPages = 0, personWithId = 0, blogPostingPages = 0, bpAuthorRef = 0, faqPages = 0, bcPages = 0;
const ldFailSamples = [];

// 只对「走主题渲染」的页面检查 JSON-LD（独立单页/跳转页不参与）
for (const f of themedFiles) {
  const s = read(f);
  const raw = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(s)) !== null) raw.push(m[1]);
  if (!raw.length) continue;
  ldPages++;
  let pageHasPerson = false, pageHasBP = false;
  for (const r of raw) {
    ldBlocks++;
    try {
      const obj = JSON.parse(r);
      const graph = obj && obj['@graph'];
      const arr = Array.isArray(obj) ? obj : (Array.isArray(graph) ? graph : [obj]);
      for (const n of arr) {
        const t = n && n['@type'];
        if (t === 'Person') { pageHasPerson = true; if (n['@id']) personWithId++; }
        if (t === 'BlogPosting') {
          pageHasBP = true;
          const a = n.author;
          if (a && typeof a === 'object' && !Array.isArray(a) && a['@id']) bpAuthorRef++;
        }
        if (t === 'FAQPage') faqPages++;
        if (t === 'BreadcrumbList') bcPages++;
      }
    } catch (e) {
      ldParseFail++;
      if (ldFailSamples.length < 5) ldFailSamples.push(path.relative(PUB, f) + ' → ' + e.message);
    }
  }
  if (pageHasPerson) personPages++;
  if (pageHasBP) blogPostingPages++;
}

console.log('\n[1] 结构化数据');
console.log('  含 JSON-LD 页面     : ' + ldPages + ' / ' + themedFiles.length);
console.log('  JSON-LD 块总数      : ' + ldBlocks);
console.log('  含 Person 的页面    : ' + personPages);
console.log('  含 BlogPosting 页面 : ' + blogPostingPages);
console.log('  含 FAQPage 的块     : ' + faqPages);
console.log('  含 BreadcrumbList   : ' + bcPages);
if (ldParseFail) {
  err('JSON-LD 解析失败 ' + ldParseFail + ' 处');
  ldFailSamples.forEach((x) => console.log('    ✗ ' + x));
} else {
  console.log('  JSON 解析           : 全部通过 ✓');
}
if (ldPages < themedFiles.length) warn('有 ' + (themedFiles.length - ldPages) + ' 个主题页面没有 JSON-LD');
const saNoLd = standaloneSet.size;
if (saNoLd) console.log('  （另有 ' + saNoLd + ' 个独立单页不参与此检查：docs 单页 / 跳转页）');

// --- 2) 正文锚文本：结构安全 ---
let ilinkPages = 0, ilinkTotal = 0, nested = 0, inCode = 0, dupUrlInPage = 0;
const badNest = [], badCode = [];
for (const f of articleFiles) {
  const s = read(f);
  const cnt = (s.match(/class="ilink"/g) || []).length;
  if (!cnt) continue;
  ilinkPages++;
  ilinkTotal += cnt;
  if (hasNestedAnchor(s)) { nested++; if (badNest.length < 5) badNest.push(path.relative(PUB, f)); }
  const inPre = segmentsOf(s, 'pre').some((x) => x.indexOf('ilink') !== -1);
  const inCode = segmentsOf(s, 'code').some((x) => x.indexOf('ilink') !== -1);
  if (inPre || inCode) { inCode++; if (badCode.length < 5) badCode.push(path.relative(PUB, f)); }
  const hrefs = (s.match(/class="ilink"\s+href="([^"]+)"/g) || []).map((x) => x.replace(/.*href="([^"]+)".*/, '$1'));
  if (new Set(hrefs).size !== hrefs.length) dupUrlInPage++;
}
console.log('\n[2] 正文锚文本内链');
console.log('  有内链的文章页      : ' + ilinkPages + ' / ' + articleFiles.length);
console.log('  内链总条数          : ' + ilinkTotal);
console.log('  嵌套 <a>            : ' + nested + (nested ? ' ✗' : ' ✓'));
console.log('  注入进 pre/code     : ' + inCode + (inCode ? ' ✗' : ' ✓'));
console.log('  同页重复指向同一URL : ' + dupUrlInPage + (dupUrlInPage ? ' ✗' : ' ✓'));
if (nested) { err('存在嵌套 <a>'); badNest.forEach((x) => console.log('    ✗ ' + x)); }
if (inCode) { err('内链注入进代码块'); badCode.forEach((x) => console.log('    ✗ ' + x)); }

// --- 3) 内链目标是否存在（死链检查）---
let deadLinks = 0;
const deadSamples = [];
for (const f of articleFiles) {
  const s = read(f);
  const hrefs = (s.match(/class="ilink"\s+href="([^"]+)"/g) || []).map((x) => x.replace(/.*href="([^"]+)".*/, '$1'));
  for (const h of hrefs) {
    const target = h.replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '').replace(/\/$/, '');
    const decoded = (() => { try { return decodeURIComponent(target); } catch (e) { return target; } })();
    const p1 = path.join(PUB, decoded, 'index.html');
    const p2 = path.join(PUB, decoded);
    if (!fs.existsSync(p1) && !fs.existsSync(p2)) {
      deadLinks++;
      if (deadSamples.length < 5) deadSamples.push(path.relative(PUB, f) + ' → ' + h);
    }
  }
}
console.log('\n[3] 内链死链检查');
console.log('  指向不存在的页面    : ' + deadLinks + (deadLinks ? ' ✗' : ' ✓'));
if (deadLinks) { err('内链死链 ' + deadLinks + ' 条'); deadSamples.forEach((x) => console.log('    ✗ ' + x)); }

// --- 4) CSS bundle ---
// 注意：source/docs/ 这类「自带样式的独立单页」不属于主题渲染产物，不引 bundle 是正常的
let bundlePages = 0;
const noBundle = [];
for (const f of themedFiles) {
  const s = read(f);
  if (/href="\/css\/bundle-a\.css/.test(s)) bundlePages++;
  else if (/href="\/css\//.test(s)) noBundle.push(path.relative(PUB, f));
}
console.log('\n[4] CSS 合并');
console.log('  引用 bundle-a 的页  : ' + bundlePages + ' / ' + themedFiles.length + (noBundle.length ? ' （' + noBundle.length + ' 页无本地 CSS）' : ' ✓'));
noBundle.forEach((x) => console.log('    · 独立单页（不引主题 CSS，正常）: ' + x));
if (bundlePages < themedFiles.length - noBundle.length) err('有主题页面未引用 CSS bundle');
if (standaloneSet.size) console.log('    · 已跳过 ' + standaloneSet.size + ' 个独立单页（自带样式，不引主题 CSS 属正常）');
const bundleDir = path.join(PUB, 'css');
for (const b of ['bundle-a.css', 'bundle-b.css', 'bundle-c.css']) {
  const p = path.join(bundleDir, b);
  if (!fs.existsSync(p)) err('缺少 ' + b);
  else if (!fs.statSync(p).size) err(b + ' 是空文件');
}
// 合并的「输入源」必须常留在 public/css —— 这是 2026-09-17 移除自噬 prune 后的预期状态。
// 它们一旦缺失，说明 css-bundle 里「合并完就删源文件」的 prune 又回来了（或有别的流程在删），
// 后果是下一轮合并整组跳过、页面继续挂旧 bundle → 「改 CSS 不生效」，且全程只有 WARN。
const MERGE_SRCS = [
  'index.css', 'privacy.css',
  'custom.css', 'live2d-chat.css', 'calendar-card.css', 'progress-fix.css', 'zhihu.css', 'article-reading.css', 'home.css',
  'heoMainColor.css', 'style.css', 'update.css', 'poem.css'
];
const srcMissing = MERGE_SRCS.filter((f) => !fs.existsSync(path.join(bundleDir, f)));
console.log('  合并输入源常留       : ' + (MERGE_SRCS.length - srcMissing.length) + ' / ' + MERGE_SRCS.length + (srcMissing.length ? ' ✗' : ' ✓'));
if (srcMissing.length) {
  err('合并输入源缺失 ' + srcMissing.length + ' 个（' + srcMissing.join(', ') + '）：css-bundle 的自噬 prune 可能又回来了，会导致以后改 CSS 静默失效');
}
// 主题页面不应再直引这些源（早已被重写为 bundle-*）；仍直引说明合并没跑成功。
const rawRefPages = [];
for (const f of themedFiles) {
  const s = read(f);
  for (const g of MERGE_SRCS) {
    if (s.indexOf('/css/' + g) !== -1) { rawRefPages.push(path.relative(PUB, f).replace(/\\/g, '/') + ' → ' + g); break; }
  }
}
console.log('  主题页直引合并源     : ' + rawRefPages.length + (rawRefPages.length ? ' ✗' : ' ✓'));
if (rawRefPages.length) {
  warn('有 ' + rawRefPages.length + ' 个主题页面仍直引合并源 CSS（本应被重写成 bundle-*）：' + rawRefPages.slice(0, 3).join(' , '));
}

// --- 5) 站点级文件 ---
console.log('\n[5] 站点级文件');
const mustExist = ['robots.txt', 'sitemap.xml', 'baidusitemap.xml', 'image-sitemap.xml', 'llms.txt', 'manifest.json'];
for (const name of mustExist) {
  const p = path.join(PUB, name);
  if (!fs.existsSync(p)) { err('缺少 ' + name); console.log('  ' + name.padEnd(20) + ' ✗ 缺失'); }
  else console.log('  ' + name.padEnd(20) + ' ✓ ' + fs.statSync(p).size + ' bytes');
}

// manifest 可解析
try { JSON.parse(read(path.join(PUB, 'manifest.json'))); console.log('  manifest.json        ✓ JSON 合法'); }
catch (e) { err('manifest.json 不是合法 JSON: ' + e.message); }

// robots AI 爬虫
try {
  const rb = read(path.join(PUB, 'robots.txt'));
  const bots = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'OAI-SearchBot', 'Google-Extended', 'Sitemap'];
  const miss = bots.filter((b) => rb.indexOf(b) === -1);
  console.log('  robots 关键条目      : ' + (miss.length ? '缺 ' + miss.join(',') + ' ✗' : 'GPTBot/ClaudeBot/PerplexityBot/OAI-SearchBot/Google-Extended/Sitemap 全部存在 ✓'));
  if (miss.length) warn('robots.txt 缺少：' + miss.join(','));
} catch (e) { err('robots.txt 读取失败'); }

// --- 6) sitemap URL 与真实页面对照 ---
console.log('\n[6] sitemap 一致性');
try {
  const sm = read(path.join(PUB, 'sitemap.xml'));
  const locs = (sm.match(/<loc>([^<]+)<\/loc>/g) || []).map((x) => x.replace(/<\/?loc>/g, ''));
  let miss = 0;
  const missSamples = [];
  for (const loc of locs) {
    const rel = loc.replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '').replace(/\/$/, '');
    const decoded = (() => { try { return decodeURIComponent(rel); } catch (e) { return rel; } })();
    const p1 = path.join(PUB, decoded, 'index.html');
    const p2 = path.join(PUB, decoded);
    if (rel && !fs.existsSync(p1) && !fs.existsSync(p2)) {
      miss++;
      if (missSamples.length < 8) missSamples.push(loc);
    }
  }
  console.log('  sitemap URL 总数    : ' + locs.length);
  console.log('  本地不存在的 URL    : ' + miss + (miss ? ' ✗' : ' ✓'));
  if (miss) { warn('sitemap 中有 ' + miss + ' 条 URL 本地无对应文件（若为线上才有的页面可忽略）'); missSamples.forEach((x) => console.log('    ! ' + x)); }
} catch (e) { err('sitemap.xml 读取失败: ' + e.message); }

// --- 7) 本地图片可达性（部署风险：public 缺图 → 上线即 404）---
console.log('\n[7] 本地图片可达性');
try {
  let imgRefs = 0, imgMissing = 0, pagesAffected = 0;
  const missSet = new Set();
  for (const f of articleFiles) {
    const s = read(f);
    const re = /src="(\/images\/[^"]+)"/g;
    let m, pHit = 0, mm;
    while ((mm = re.exec(s)) !== null) {
      imgRefs++;
      let name = mm[1].slice('/images/'.length);
      try { name = decodeURIComponent(name); } catch (e) { /* 保持原样 */ }
      const p = path.join(PUB, 'images', name);
      if (!fs.existsSync(p)) { imgMissing++; pHit++; missSet.add(name); }
    }
    if (pHit) pagesAffected++;
  }
  console.log('  文章页 /images/ 引用 : ' + imgRefs);
  console.log('  本地取不到           : ' + imgMissing + (imgMissing ? ' ✗' : ' ✓'));
  console.log('  涉及文章页           : ' + pagesAffected + ' / ' + articleFiles.length);
  console.log('  不同缺失文件         : ' + missSet.size);
  if (imgMissing) {
    warn('有 ' + missSet.size + ' 个 /images/ 文件本地不存在（' + pagesAffected + ' 篇文章受影响）。' +
      '若直接构建部署，这些图会从线上消失 —— 需先把图放回 source/images/（或改用图床 URL）。');
    [...missSet].slice(0, 5).forEach((n) => console.log('    ! ' + n));
  }
} catch (e) { warn('图片检查失败: ' + e.message); }

// --- 8) abbrlink 完整性（决定文章 URL；脏值会产出畸形地址）---
console.log('\n[8] abbrlink 完整性');
try {
  const guard = require(path.join(__dirname, '..', 'scripts', 'lib', 'abbrlink-guard'));
  const postsDir = path.join(__dirname, '..', 'source', '_posts');
  const r = guard.checkPosts(postsDir);
  console.log('  front-matter 文章总数 : ' + r.total);
  console.log('  合规                  : ' + r.ok);
  console.log('  有害值                : ' + r.bad.length + (r.bad.length ? ' ✗' : ' ✓'));
  console.log('  重复值                : ' + r.dup.length + (r.dup.length ? ' ✗' : ' ✓'));
  if (r.unreadable.length) console.log('  读取失败(已跳过)      : ' + r.unreadable.length);

  if (r.bad.length) {
    err('有 ' + r.bad.length + ' 篇文章的 abbrlink 形态有害，会生成畸形 URL（如含科学计数法/空白/URL 保留字符）。' +
      ' 修复：node tools/fix-abbrlink.js --apply');
    r.bad.slice(0, 8).forEach((b) => console.log('    ✗ ' + JSON.stringify(b.value) + '  ← ' + b.file + '  (' + b.reasons.join('；') + ')'));
  }
  if (r.dup.length) {
    err('有 ' + r.dup.length + ' 组 abbrlink 重复 —— 文章 URL 会互相覆盖。');
    r.dup.slice(0, 5).forEach((d) => console.log('    ✗ ' + d.value + ' → ' + d.files.join(' , ')));
  }

  // 产物侧：permalink 生成的目录名应只含 URL 安全字符
  // 例外：历史遗留脏 URL 的跳转页（含 meta refresh）属已处理的预期项，不算问题
  const postsOut = path.join(PUB, 'posts');
  const weird = [], unresolved = [];
  try {
    for (const e of fs.readdirSync(postsOut, { withFileTypes: true })) {
      if (!e.isDirectory() || /^[A-Za-z0-9_-]+$/.test(e.name)) continue;
      let isRedirect = false;
      try {
        const idx = fs.readFileSync(path.join(postsOut, e.name, 'index.html'), 'utf8');
        isRedirect = /http-equiv=["']refresh["']/i.test(idx) && /rel=["']canonical["']/i.test(idx);
      } catch (err) { /* 无 index.html */ }
      weird.push(e.name);
      if (!isRedirect) unresolved.push(e.name);
    }
  } catch (e) { /* 无 posts 目录 */ }
  console.log('  产物畸形目录          : ' + weird.length +
    '（跳转页 ' + (weird.length - unresolved.length) + ' / 未处理 ' + unresolved.length + '）' +
    (unresolved.length ? ' ✗' : ' ✓'));
  if (unresolved.length) {
    warn('public/posts/ 下有 ' + unresolved.length + ' 个目录名含非 URL 安全字符且不是跳转页：' +
      unresolved.slice(0, 5).join(', ') + '（检查是否有脏 abbrlink 已被构建进产物）');
  }
} catch (e) { warn('abbrlink 检查失败: ' + e.message); }

// --- 汇总 ---
console.log('\n' + '='.repeat(64));
if (errors.length) {
  console.log('结果：✗ 不通过 —— ' + errors.length + ' 个 ERROR，' + warns.length + ' 个 WARNING');
  errors.forEach((e) => console.log('  ERROR   ' + e));
} else {
  console.log('结果：✓ 全部通过（' + warns.length + ' 个 WARNING）');
}
warns.forEach((w) => console.log('  WARN    ' + w));
console.log('='.repeat(64));
process.exit(errors.length ? 1 : 0);
