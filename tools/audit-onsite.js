#!/usr/bin/env node
/**
 * 站内 SEO 全量审计（只读，不修改任何文件）
 * ------------------------------------------------------------------
 * 用法：
 *   node tools/audit-onsite.js                 # 打印摘要
 *   node tools/audit-onsite.js --json out.json # 额外落盘完整明细
 *   node tools/audit-onsite.js --pub <dir>     # 指定 public 目录（默认 ./public）
 *
 * 审计维度：
 *   A 索引与可发现性   robots / meta robots / canonical / sitemap 覆盖 / 404
 *   B 页面元数据       title / description / H1 / lang / viewport / OG
 *   C 结构化数据       JSON-LD 类型分布 + 必填字段
 *   D 内容质量         字数 / 标题层级 / 外链 / 更新时间
 *   E 内链与站点架构   入链数 / 孤儿页 / 面包屑
 *   F 图片             alt 缺失 / 缺失文件 / 懒加载
 *   G 技术             HTML 体积 / 混内容 / 重复 title
 *   H AI 信源          llms.txt / AI 爬虫 / 语义标签
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const PUB = path.resolve(args.includes('--pub') ? args[args.indexOf('--pub') + 1] : 'public');
const JSON_OUT = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => { try { return fs.existsSync(p); } catch (e) { return false; } };

// ---------------- 收集所有 HTML 页面 ----------------
function walk(dir, out) {
  let es;
  try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of es) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === 'index.html' || e.name === '404.html') out.push(p);
  }
  return out;
}
const htmlFiles = walk(PUB, []).filter((f) => !f.includes(path.sep + 'admin' + path.sep));

// ---------------- 工具函数 ----------------
const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

function countWords(text) {
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latin = (text.match(/[A-Za-z][A-Za-z'-]*/g) || []).length;
  return { cjk, latin, total: cjk + latin };
}

function pageType(rel) {
  const u = rel.replace(/\\/g, '/');
  if (/^posts\//.test(u)) return 'post';
  if (/^categories\//.test(u)) return 'category';
  if (/^tags\//.test(u)) return 'tag';
  if (/^archives/.test(u)) return 'archive';
  if (/^page\//.test(u)) return 'pagination';
  if (/^404\.html$/.test(u)) return '404';
  return 'portal';
}

// ---------------- 逐页解析 ----------------
const pages = [];
const ldTypesGlobal = {};
const ldErr = [];
const imgMissing = new Map();
const allRefs = [];   // {from, to} 内部链接图

// 本地可服务的图片集合
const availImg = new Set();
for (const d of ['public/images', 'public/img', 'source/images', 'source/img']) {
  const abs = path.join(path.dirname(PUB), d.replace(/^public\//, path.basename(PUB) + '/'));
  const real = fs.existsSync(abs) ? abs : path.join(PUB, d.replace(/^public\//, ''));
  if (!fs.existsSync(real)) continue;
  (function w(p) {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const q = path.join(p, e.name);
      if (e.isDirectory()) w(q); else availImg.add(e.name);
    }
  })(real);
}

for (const f of htmlFiles) {
  const rel = path.relative(PUB, f).replace(/\\/g, '/');
  const html = read(f);
  const type = pageType(rel);

  const pick = (re) => { const m = html.match(re); return m ? m[1].trim() : ''; };
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    || pick(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const canonical = pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
  const metaRobots = pick(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i);
  const lang = pick(/<html[^>]+lang=["']([^"']*)["']/i);
  const viewport = pick(/<meta[^>]+name=["']viewport["'][^>]+content=["']([^"']*)["']/i);
  const ogTitle = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i)
    || pick(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);
  const ogImage = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i)
    || pick(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i);
  const twCard = /name=["']twitter:card["']/i.test(html);

  // 正文范围
  let body = html;
  const am = html.match(/<article[\s\S]*?<\/article>/i);
  if (am) body = am[0];
  else {
    const cm = html.match(/<div[^>]+id=["']article-container["'][\s\S]*?<\/div>\s*<\/div>/i);
    if (cm) body = cm[0];
  }
  // 去掉脚本/样式/导航噪声
  const clean = stripTags(body.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' '));
  const wc = countWords(clean);

  const h1 = (body.match(/<h1[\s>]/gi) || []).length;
  const h2 = (body.match(/<h2[\s>]/gi) || []).length;
  const h3 = (body.match(/<h3[\s>]/gi) || []).length;
  const pcount = (body.match(/<p[\s>]/gi) || []).length;

  // 图片
  const imgs = body.match(/<img[^>]*>/gi) || [];
  let noAlt = 0; let lazy = 0; let missing = 0;
  for (const tag of imgs) {
    const a = tag.match(/\salt=["']([^"']*)["']/i);
    if (!a || !a[1].trim()) noAlt++;
    if (/loading=["']lazy["']/i.test(tag)) lazy++;
    const src = (tag.match(/\ssrc=["']([^"']+)["']/i) || [])[1] || '';
    const dsrc = (tag.match(/\sdata-lazy-src=["']([^"']+)["']/i) || [])[1] || '';
    for (const s of [src, dsrc]) {
      if (/^\/images\//.test(s)) {
        let name = s.replace(/^\/images\//, '').split(/[?#]/)[0];
        try { name = decodeURIComponent(name); } catch (e) {}
        if (!availImg.has(name)) { missing++; imgMissing.set(name, (imgMissing.get(name) || 0) + 1); }
      }
    }
  }

  // 链接
  const hrefs = [...body.matchAll(/<a\b[^>]*\shref=["']([^"']+)["']/gi)].map((m) => m[1]);
  let internal = 0, external = 0, emptyAnchor = 0, genericAnchor = 0;
  const GENERIC = new Set(['点击这里', '这里', '阅读更多', '更多', '详情', 'here', 'read more', 'more', '链接']);
  for (const h of hrefs) {
    if (/^(#|javascript:|mailto:|tel:)/i.test(h)) { if (h === '#') emptyAnchor++; continue; }
    const isInternal = h.startsWith('/') || /^https?:\/\/(www\.)?lifelinest\.github\.io/i.test(h);
    if (isInternal) internal++; else if (/^https?:/i.test(h)) external++;
  }
  for (const m of body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = m[1]; if (/headerlink/.test(attrs)) continue;
    const hr = (attrs.match(/\shref=["']([^"']*)["']/i) || [])[1] || '';
    if (/^#/.test(hr)) continue;                       // 锚点跳转不算空锚
    if (/\stitle=["'][^"']+["']/.test(attrs)) continue; // 有 title 的图标链可接受
    const t = stripTags(m[2]).trim();
    if (!t) emptyAnchor++;
    else if (GENERIC.has(t.toLowerCase())) genericAnchor++;
  }
  // 链接图（只取文章页内部链接）
  if (type === 'post') {
    for (const h of hrefs) {
      const isInternal = h.startsWith('/');
      if (!isInternal) continue;
      const to = h.split(/[?#]/)[0].replace(/\/$/, '');
      if (to && to !== '/' && !/\.(png|jpe?g|webp|gif|svg|css|js|xml|txt|json)$/i.test(to)) {
        allRefs.push({ from: '/' + rel.replace(/\/index\.html$/, ''), to });
      }
    }
  }

  // JSON-LD
  const types = [];
  const ldBlocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  let ldOk = 0;
  for (const m of ldBlocks) {
    let raw = m[1].trim().replace(/^<!--|-->$/g, '').trim();
    try {
      const o = JSON.parse(raw);
      const g = o['@graph'] ? o['@graph'] : [o];
      for (const n of g) {
        const t = n && n['@type'];
        if (t) { types.push(t); ldTypesGlobal[t] = (ldTypesGlobal[t] || 0) + 1; }
      }
      ldOk++;
    } catch (e) {
      ldErr.push(rel + ' :: ' + e.message);
    }
  }

  const dp = pick(/"datePublished"\s*:\s*"([^"]+)"/);
  const dm = pick(/"dateModified"\s*:\s*"([^"]+)"/);
  const authorId = /"author"\s*:\s*\{\s*"@id"/.test(html);
  const hasBreadcrumbLD = types.includes('BreadcrumbList');
  const hasBreadcrumbHTML = /breadcrumb/i.test(html) && /<nav[^>]*breadcrumb|class=["'][^"']*breadcrumb/i.test(html);

  // 混内容
  const mixed = [...html.matchAll(/(?:src|href)=["']http:\/\/[^"']+/gi)].map((m) => m[0]);

  pages.push({
    rel, url: '/' + rel.replace(/\/index\.html$/, '').replace(/^index\.html$/, ''),
    type, bytes: Buffer.byteLength(html),
    title, titleLen: title.length,
    desc, descLen: desc.length,
    canonical, metaRobots, lang, viewport: !!viewport,
    ogTitle: !!ogTitle, ogImage, twCard,
    h1, h2, h3, pcount,
    words: wc.total, cjk: wc.cjk,
    imgCount: imgs.length, imgNoAlt: noAlt, imgLazy: lazy, imgMissing: missing,
    internal, external, emptyAnchor, genericAnchor,
    ldBlocks: ldBlocks.length, ldOk, ldTypes: [...new Set(types)].join(','),
    breadcrumbLD: hasBreadcrumbLD, breadcrumbHTML: hasBreadcrumbHTML,
    datePublished: dp, dateModified: dm,
    dateSame: !!(dp && dm && dp.slice(0, 10) === dm.slice(0, 10)),
    authorRefId: authorId,
    mixedContent: mixed.length,
  });
}

// ---------------- 入链统计 ----------------
const inbound = new Map();
for (const e of allRefs) {
  const key = e.to.replace(/\/$/, '');
  inbound.set(key, (inbound.get(key) || 0) + 1);
}
const posts = pages.filter((p) => p.type === 'post');
const orphans = posts.filter((p) => {
  const u = p.url.replace(/\/$/, '');
  return !inbound.has(u);
});

// ---------------- 站点级文件 ----------------
const siteFiles = {};
const sfList = ['robots.txt', 'sitemap.xml', 'baidusitemap.xml', 'image-sitemap.xml', 'llms.txt',
  'manifest.json', 'atom.xml', 'rss2.xml', '404.html',
  '4699ca8ff8aa68ae46a9c3120ab44d52.txt', 'googleae17ca249fa02438.txt', 'baidu_verify_codeva-dmPP1sPmLD.html'];
for (const n of sfList) {
  const p = path.join(PUB, n);
  siteFiles[n] = exists(p) ? fs.statSync(p).size : -1;
}
const robots = exists(path.join(PUB, 'robots.txt')) ? read(path.join(PUB, 'robots.txt')) : '';
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-Web', 'anthropic-ai',
  'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'Bytespider', 'CCBot', 'cohere-ai', 'meta-externalagent'];
const aiAllowed = AI_BOTS.filter((b) => new RegExp(b, 'i').test(robots));
const robotsDisallow = (robots.match(/^Disallow:\s*(.+)$/gim) || []).map((s) => s.trim());

// sitemap 覆盖
let smLocs = [];
const smPath = path.join(PUB, 'sitemap.xml');
if (exists(smPath)) smLocs = [...read(smPath).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

// ---------------- 汇总统计 ----------------
const byType = {};
for (const p of pages) {
  byType[p.type] = byType[p.type] || { n: 0, bytes: 0, words: 0 };
  byType[p.type].n++; byType[p.type].bytes += p.bytes; byType[p.type].words += p.words;
}
const dupTitle = new Map(); const dupDesc = new Map();
for (const p of pages) {
  if (p.title) dupTitle.set(p.title, (dupTitle.get(p.title) || 0) + 1);
  if (p.desc) dupDesc.set(p.desc, (dupDesc.get(p.desc) || 0) + 1);
}
const sum = (a, k) => a.reduce((s, x) => s + (x[k] || 0), 0);
const avg = (a, k) => (a.length ? sum(a, k) / a.length : 0);

const R = {
  generatedAt: new Date().toISOString(),
  site: { pages: pages.length, posts: posts.length, byType },
  meta: {
    noTitle: pages.filter((p) => !p.title).length,
    titleShort: pages.filter((p) => p.title && p.titleLen < 15).length,
    titleLong: pages.filter((p) => p.titleLen > 60).length,
    titleDup: [...dupTitle.values()].filter((v) => v > 1).length,
    noDesc: pages.filter((p) => !p.desc).length,
    descLong: pages.filter((p) => p.descLen > 160).length,
    descShort: pages.filter((p) => p.desc && p.descLen < 60).length,
    descDup: [...dupDesc.values()].filter((v) => v > 1).length,
    noCanonical: pages.filter((p) => !p.canonical).length,
    noindex: pages.filter((p) => /noindex/i.test(p.metaRobots)).length,
    noLang: pages.filter((p) => !p.lang).length,
    noViewport: pages.filter((p) => !p.viewport).length,
    h1Zero: pages.filter((p) => p.h1 === 0).length,
    h1Multi: pages.filter((p) => p.h1 > 1).length,
    noOgImage: pages.filter((p) => !p.ogImage).length,
    noTwitter: pages.filter((p) => !p.twCard).length,
  },
  structured: {
    types: ldTypesGlobal,
    parseErrors: ldErr,
    pagesNoLD: pages.filter((p) => p.ldBlocks === 0).length,
    authorRefIdPages: pages.filter((p) => p.authorRefId).length,
    breadcrumbPages: pages.filter((p) => p.breadcrumbLD).length,
  },
  content: {
    postWordsAvg: Math.round(avg(posts, 'words')),
    postWordsMin: posts.length ? Math.min(...posts.map((p) => p.words)) : 0,
    postWordsMax: posts.length ? Math.max(...posts.map((p) => p.words)) : 0,
    postWordsUnder800: posts.filter((p) => p.words < 800).length,
    postWordsUnder500: posts.filter((p) => p.words < 500).length,
    dateSameAll: posts.filter((p) => p.dateSame).length,
    postExternalAvg: +(avg(posts, 'external')).toFixed(1),
    postInternalAvg: +(avg(posts, 'internal')).toFixed(1),
    postNoExternal: posts.filter((p) => p.external === 0).length,
  },
  links: {
    edges: allRefs.length,
    orphans: orphans.length,
    orphanSample: orphans.slice(0, 15).map((p) => ({ url: p.url, title: p.title })),
  },
  images: {
    total: sum(pages, 'imgCount'),
    noAlt: sum(pages, 'imgNoAlt'),
    lazy: sum(pages, 'imgLazy'),
    missingRefs: sum(pages, 'imgMissing'),
    missingFiles: imgMissing.size,
    missingList: [...imgMissing.entries()].sort((a, b) => b[1] - a[1]),
  },
  tech: {
    avgHtmlKB: +(avg(pages, 'bytes') / 1024).toFixed(1),
    maxHtmlKB: +(Math.max(...pages.map((p) => p.bytes)) / 1024).toFixed(1),
    mixedContent: sum(pages, 'mixedContent'),
    anyAnchor: sum(pages, 'emptyAnchor'),
  },
  robots: { aiAllowed, aiMissing: AI_BOTS.filter((b) => !aiAllowed.includes(b)), disallow: robotsDisallow },
  sitemap: { locs: smLocs.length },
  siteFiles,
  _pages: pages,
};

// ---------------- 输出 ----------------
console.log('='.repeat(72));
console.log('站内 SEO 全量审计  ' + PUB);
console.log('='.repeat(72));
console.log('\n[A] 站点规模');
console.log('  页面总数 ' + pages.length + '（文章 ' + posts.length + '）');
for (const [k, v] of Object.entries(byType)) console.log('    ' + k.padEnd(10) + v.n + ' 页  平均 ' + Math.round(v.words / v.n) + ' 字  HTML 均 ' + (v.bytes / v.n / 1024).toFixed(1) + 'KB');

console.log('\n[B] 元数据');
for (const [k, v] of Object.entries(R.meta)) console.log('  ' + k.padEnd(14) + v);

console.log('\n[C] 结构化数据');
console.log('  无 JSON-LD 页面 ' + R.structured.pagesNoLD + ' / ' + pages.length);
console.log('  author 用 @id 引用 ' + R.structured.authorRefIdPages + ' 页');
console.log('  BreadcrumbList ' + R.structured.breadcrumbPages + ' 页');
console.log('  解析失败 ' + ldErr.length + (ldErr.length ? ' → ' + ldErr.slice(0, 3).join(' | ') : ''));
console.log('  类型分布: ' + JSON.stringify(ldTypesGlobal));

console.log('\n[D] 内容');
console.log('  文章均 ' + R.content.postWordsAvg + ' 字（' + R.content.postWordsMin + '–' + R.content.postWordsMax + '）');
console.log('  <800 字 ' + R.content.postWordsUnder800 + ' 篇 / <500 字 ' + R.content.postWordsUnder500 + ' 篇');
console.log('  dateModified=datePublished ' + R.content.dateSameAll + ' / ' + posts.length);
console.log('  篇均外链 ' + R.content.postExternalAvg + '，无外链 ' + R.content.postNoExternal + ' 篇');

console.log('\n[E] 内链');
console.log('  内部链接边 ' + R.links.edges + '，孤儿文章 ' + R.links.orphans);

console.log('\n[F] 图片');
console.log('  <img> ' + R.images.total + '，无 alt ' + R.images.noAlt + '，lazy ' + R.images.lazy);
console.log('  缺失引用 ' + R.images.missingRefs + ' 处 / ' + R.images.missingFiles + ' 个文件');

console.log('\n[G] 技术');
console.log('  HTML 均 ' + R.tech.avgHtmlKB + 'KB，最大 ' + R.tech.maxHtmlKB + 'KB');
console.log('  混内容(http://) ' + R.tech.mixedContent + ' 处，空锚文本 ' + R.tech.anyAnchor);

console.log('\n[H] robots / AI 爬虫');
console.log('  已放行 ' + aiAllowed.length + ' 个: ' + aiAllowed.join(', '));
console.log('  未提及 ' + R.robots.aiMissing.length + ' 个: ' + R.robots.aiMissing.join(', '));
console.log('  Disallow: ' + (robotsDisallow.length ? robotsDisallow.join(' | ') : '（无）'));

console.log('\n[I] 站点级文件');
for (const [k, v] of Object.entries(siteFiles)) console.log('  ' + k.padEnd(40) + (v < 0 ? 'MISSING' : v + 'B'));
console.log('  sitemap 条目 ' + R.sitemap.locs);

if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify(R, null, 2));
  console.log('\n明细已写入 ' + JSON_OUT);
}
console.log('');
