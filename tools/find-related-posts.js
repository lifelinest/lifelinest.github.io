#!/usr/bin/env node
/**
 * tools/find-related-posts.js —— 内链候选检索（只读，不改任何文件）
 *
 * 为什么需要它：写文章时「配内链」原本靠人现场翻站内文章，容易漏、也容易
 * 链到只是词面相似但主题不相干的文章。这个脚本把「找相关文章」变成可复现的
 * 打分排序：TF-IDF 文本相似度 + 标签重叠 + 栏目是否相同，输出 Top N 候选
 * 和可用的锚文本建议，人只需要从候选里挑。
 *
 * 顺带做一件事：如果传的是草稿文件，会校验草稿里已经写下的站内链接
 * （/posts/<abbrlink>/）是否真的指向存在的文章 —— 写错 abbrlink 是隐形死链，
 * 构建不会报错，只有上线后读者点开才发现。
 *
 * 用法：
 *   node tools/find-related-posts.js --file=source/_posts/xxx.md
 *   node tools/find-related-posts.js --query="外贸 AI 数据安全" --top=10
 *   node tools/find-related-posts.js --file=xxx.md --json        # 机读输出
 *   node tools/find-related-posts.js --file=xxx.md --min=1.0     # 过滤低分
 * 退出码：0 = 正常；1 = 参数错误 / 草稿内链存在死链
 *
 * 也可被其他工具 require 复用（link-architect 需要一次性对上百篇文章算相似度，
 * 若走子进程会有上百次全语料重建，故这里导出 createIndex/findRelated）：
 *   const { createIndex, findRelated } = require('./find-related-posts');
 *   const idx = createIndex();                     // 全站语料只加载一次
 *   const r = findRelated({ query: '外贸 AI' }, { index: idx, top: 5 });
 *
 * 注意：不要把这个文件放进 scripts/ —— hexo 会把 scripts/ 下的每个 .js 当插件加载执行。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'source', '_posts');
const SITE = 'https://mfy-lifeline.com';
const EXCLUDE = new Set(['个人博客文章标签使用规范.md']);

// ---------- front-matter ----------
function splitFM(raw) {
  const m = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  return m ? { fm: m[1], body: raw.slice(m[0].length) } : { fm: '', body: raw };
}

function getScalar(fm, key) {
  const m = fm.match(new RegExp('^' + key + '\\s*:\\s*(.*)$', 'm'));
  if (!m) return '';
  return m[1].trim().replace(/^['"]|['"]$/g, '');
}

/** 兼容块状列表 / 行内数组 / 嵌套数组 */
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

function cleanBody(body) {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s*/gm, ' ')
    .replace(/[*_>~|]/g, ' ');
}

// ---------- 分词：中文 2/3-gram + 英文词 ----------
const STOP = new Set(
  '的了是在我有和就不人都一这那上也很到说要去你会着没看好自己与及把被让给对从为以之其于而但则如果所可以什么怎么们你我的还更才就是能会下过出个中大小多少'.split('')
);

function tokenize(text) {
  const out = [];
  for (const w of text.match(/[A-Za-z][A-Za-z0-9.+#-]{2,}/g) || []) out.push('e:' + w.toLowerCase());
  for (const seg of text.replace(/[^\u4e00-\u9fa5]+/g, ' ').split(/\s+/)) {
    if (seg.length < 2) continue;
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= seg.length; i++) {
        const g = seg.slice(i, i + n);
        let ok = true;
        for (const ch of g) if (STOP.has(ch)) { ok = false; break; }
        if (ok) out.push('z:' + g);
      }
    }
  }
  return out;
}

// ---------- 载入站内语料 ----------
function loadPosts() {
  const files = fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md') && !EXCLUDE.has(f))
    .map((f) => path.join(POSTS_DIR, f));

  return files.map((file) => {
    const raw = fs.readFileSync(file, 'utf8');
    const { fm, body } = splitFM(raw);
    const title = getScalar(fm, 'title');
    const clean = cleanBody(body);
    return {
      file,
      name: path.basename(file),
      title,
      abbr: getScalar(fm, 'abbrlink'),
      tags: getList(fm, 'tags'),
      cats: getList(fm, 'categories'),
      // 标题是最强的主题信号，重复计入以抬高其词频权重
      text: (title + ' ').repeat(3) + clean.slice(0, 3000),
    };
  });
}

// ---------- 索引（供复用：全站语料只建一次）----------
function createIndex() {
  const posts = loadPosts();
  const docs = posts.map((p) => tokenize(p.text));

  const df = new Map();
  for (const toks of docs) {
    for (const t of new Set(toks)) df.set(t, (df.get(t) || 0) + 1);
  }
  const N = Math.max(docs.length, 1);
  const idf = (t) => Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 1;

  function vectorize(toks) {
    const tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    const v = new Map();
    const len = toks.length || 1;
    tf.forEach((c, t) => v.set(t, (c / len) * idf(t)));
    return v;
  }

  function cosine(a, b) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    a.forEach((v, t) => {
      na += v * v;
      const w = b.get(t);
      if (w) dot += v * w;
    });
    b.forEach((v) => { nb += v * v; });
    if (!na || !nb) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  const docVecs = docs.map((toks) => vectorize(toks));
  return { posts, docs, docVecs, vectorize, cosine, tokenize };
}

function anchors(title) {
  const out = [title];
  const short = title.split(/[：:｜|—–\-（(]/)[0].trim();
  if (short && short.length >= 4 && short !== title) out.push(short);
  return out;
}

/**
 * 查询相关文章。
 * @param {{query?:string,title?:string,tags?:string[],cats?:string[],text?:string}} q
 * @param {{index?:object,top?:number,min?:number,selfName?:string}} opts
 */
function findRelated(q, opts = {}) {
  const idx = opts.index || createIndex();
  const top = opts.top == null ? 8 : opts.top;
  const min = opts.min == null ? 0 : opts.min;

  const qTitle = q.title || q.query || '';
  const qTags = q.tags || [];
  const qCats = q.cats || [];
  const qText = q.text || qTitle;

  const qVec = idx.vectorize(idx.tokenize(qText));

  const scored = idx.posts
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.name !== opts.selfName)
    .map(({ p, i }) => {
      const cos = idx.cosine(qVec, idx.docVecs[i]);
      let inter = 0;
      const tagSet = new Set(p.tags);
      for (const t of qTags) if (tagSet.has(t)) inter++;
      // 标签用「命中率」而非绝对数，避免标签多的文章被系统性抬高
      const tagHit = qTags.length ? inter / qTags.length : 0;
      const catSame = qCats.length && p.cats.some((c) => qCats.includes(c)) ? 1 : 0;
      const score = 8 * cos + 2.2 * tagHit + 1.0 * catSame;
      const shared = qTags.filter((t) => tagSet.has(t));
      return { ...p, score, cos, shared, catSame };
    })
    .filter((p) => p.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, top);

  return {
    query: { title: qTitle, tags: qTags, cats: qCats, file: opts.selfName || null },
    related: scored.map((p) => ({
      title: p.title,
      abbr: p.abbr,
      url: SITE + '/posts/' + p.abbr + '/',
      score: Number(p.score.toFixed(3)),
      cosine: Number(p.cos.toFixed(3)),
      sharedTags: p.shared,
      sameCategory: !!p.catSame,
      anchors: anchors(p.title),
      file: p.file,
    })),
  };
}

/** 校验草稿里写下的 /posts/<abbr>/ 是否都指向存在的文章 */
function verifyInnerLinks(text, posts) {
  const abbrs = new Set(posts.map((p) => p.abbr).filter(Boolean));
  const hits = text.match(/\/posts\/([0-9a-zA-Z]+)\/?/g) || [];
  const uniq = [...new Set(hits.map((h) => h.replace(/\/posts\//, '').replace(/\/$/, '')))];
  return uniq.map((a) => ({ abbr: a, ok: abbrs.has(a) }));
}

module.exports = { createIndex, findRelated, verifyInnerLinks, anchors, loadPosts, splitFM, getScalar, getList, cleanBody, SITE, ROOT, POSTS_DIR };

// ---------- CLI（仅直接运行时执行）----------
if (require.main === module) {
  const argv = process.argv.slice(2);
  const getArg = (n, d) => {
    const i = argv.findIndex((a) => a === n || a.startsWith(n + '='));
    if (i === -1) return d;
    const a = argv[i];
    if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
    const nx = argv[i + 1];
    return nx && !nx.startsWith('--') ? nx : d;
  };
  const hasFlag = (n) => argv.some((a) => a === n || a.startsWith(n + '='));

  const FILE = getArg('--file', '');
  const QUERY = getArg('--query', '');
  const TOP = parseInt(getArg('--top', '8'), 10);
  const MIN = parseFloat(getArg('--min', '0'));
  const AS_JSON = hasFlag('--json');

  if (!FILE && !QUERY) {
    console.error('用法：--file=<草稿.md> 或 --query="关键词"（至少给一个）');
    process.exit(1);
  }

  const index = createIndex();
  const posts = index.posts;

  let qTitle = '';
  let qTags = [];
  let qCats = [];
  let qText = '';
  let selfName = '';

  if (FILE) {
    const p = path.isAbsolute(FILE) ? FILE : path.join(ROOT, FILE);
    if (!fs.existsSync(p)) {
      console.error('草稿文件不存在：' + p);
      process.exit(1);
    }
    const raw = fs.readFileSync(p, 'utf8');
    const { fm, body } = splitFM(raw);
    qTitle = getScalar(fm, 'title');
    qTags = getList(fm, 'tags');
    qCats = getList(fm, 'categories');
    qText = qTitle + ' ' + cleanBody(body).slice(0, 3000);
    selfName = path.basename(p);
  } else {
    qText = QUERY;
    qTitle = QUERY;
  }

  const result = findRelated({ title: qTitle, tags: qTags, cats: qCats, text: qText }, { index, top: TOP, min: MIN, selfName });

  if (AS_JSON) {
    const payload = { query: result.query, related: result.related };
    if (FILE) payload.innerLinks = verifyInnerLinks(fs.readFileSync(path.isAbsolute(FILE) ? FILE : path.join(ROOT, FILE), 'utf8'), posts);
    console.log(JSON.stringify(payload, null, 2));
    process.exit(0);
  }

  console.log('=== 内链候选检索 ===');
  console.log('语料    : 站内 ' + posts.length + ' 篇');
  console.log('查询    : ' + (FILE ? selfName : QUERY));
  if (qTags.length) console.log('草稿标签: ' + qTags.join('、'));
  if (qCats.length) console.log('草稿栏目: ' + qCats.join('、'));
  console.log('');

  if (!result.related.length) {
    console.log('（没有达到阈值的候选，试试降低 --min）');
  } else {
    result.related.forEach((p, i) => {
      console.log('[' + (i + 1) + '] 得分 ' + p.score.toFixed(2) + '   (文本相似 ' + p.cosine.toFixed(3) + ')');
      console.log('    ' + p.title);
      console.log('    ' + p.url);
      const marks = [];
      if (p.sharedTags.length) marks.push('共同标签: ' + p.sharedTags.join('、'));
      if (p.sameCategory) marks.push('同栏目');
      if (marks.length) console.log('    ' + marks.join('  |  '));
      console.log('    锚文本: ' + p.anchors.join('  或  '));
      console.log('');
    });
  }

  let exitCode = 0;
  if (FILE) {
    const raw = fs.readFileSync(path.isAbsolute(FILE) ? FILE : path.join(ROOT, FILE), 'utf8');
    const links = verifyInnerLinks(raw, posts);
    if (links.length) {
      console.log('=== 草稿内链有效性 ===');
      const bad = links.filter((l) => !l.ok);
      for (const l of links) console.log('   ' + (l.ok ? '[ 有效 ]' : '[ 死链 ]') + ' /posts/' + l.abbr + '/');
      if (bad.length) {
        console.log('');
        console.log('存在 ' + bad.length + ' 条死链（abbrlink 不存在），退出码 1');
        exitCode = 1;
      }
    }
  }

  process.exit(exitCode);
}
