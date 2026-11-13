#!/usr/bin/env node
/**
 * tools/search-demand.js —— 需求层：抓「真的有人在搜什么」
 * ------------------------------------------------------------------
 * 闭环此前缺的不是「写」，是「听」：
 *   选题雷达的「缺口词」取自站内已有标签（大模型 / 提示词 / 广交会…），
 *   那是「站内哪块内容少」，不是「有人搜」。没人搜的词，写再多也 0 流量。
 *
 * 本工具补上需求侧输入 —— 抓搜索引擎的**下拉建议词**（真实用户输入）：
 *   百度 suggestion.baidu.com/su      （GBK，加 ie/oe=utf-8 可直出 UTF-8）
 *   必应 api.bing.com/osjson.aspx
 *   360  sug.so.360.cn/suggest
 * 三者都是公开接口、无需账号、无需 key。默认对 6 个栏目各取一组种子词展开。
 *
 * 输出两样东西：
 *   1. 需求词库（含每个词来自哪个栏目、命中几个引擎）
 *   2. **缺口清单**：有人搜 且 站内还没对应标题 的词 —— 这才是该写的题
 *
 * 硬规矩：
 *   - 只读 + 落盘。绝不改文章、不构建、不部署。
 *   - 联网一律走 child_process 调 curl（Node 原生 fetch/axios 在本机会被代理拦）。
 *   - 单点失败不阻断：某个引擎挂了照常出结果，错误记在 errors 里。
 *
 * 用法：
 *   node tools/search-demand.js                        # 全量：6 栏目种子 × 3 引擎
 *   node tools/search-demand.js --seed="AI写作"         # 只跑一个种子
 *   node tools/search-demand.js --engines=baidu,360    # 指定引擎
 *   node tools/search-demand.js --depth=2              # 对命中≥2 的词再抓一层
 *   node tools/search-demand.js --json <path>          # 自定义 JSON 落点
 *   node tools/search-demand.js --quiet                # 只落盘
 * 退出码：0 正常；1 致命错误
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { COLUMNS } = require('./positioning-profile');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.resolve(ROOT, '..', '.tmp');
const OUT_DIR = path.join(TMP, 'demand');

// ---------------- 参数 ----------------
const argv = process.argv.slice(2);
const has = (n) => argv.some((a) => a === n || a.startsWith(n + '='));
const getArg = (name, def) => {
  const i = argv.findIndex((a) => a === name || a.startsWith(name + '='));
  if (i === -1) return def;
  const a = argv[i];
  if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
  const nx = argv[i + 1];
  return nx && !nx.startsWith('--') ? nx : def;
};
const QUIET = has('--quiet');
const JSON_OUT = getArg('--json', '');
const DEPTH = Math.max(1, Math.min(3, parseInt(getArg('--depth', '1'), 10) || 1));
const SEED_ONE = getArg('--seed', '');
const ENGINES = String(getArg('--engines', 'baidu,bing,360'))
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CONCURRENCY = 6;     // 并发请求数（太快会被引擎限流，6 是本机实测的稳态）
const COVER_SIM = 0.72;    // 需求词 vs 站内标题的覆盖率阈值，超过视为"已覆盖"

// 噪声词：影视娱乐 / 学生作业 / 盗版安装 —— 有搜索量但与站点定位无关，写了对流量无益
const DEMAND_BLOCK = /(第一季|第二季|第三季|电视剧|综艺|电影|明星|演员|罗志祥|时间管理局|时间管理大师|有限公司|作文|范文|读后感|手抄报|个人成长档案|破解|绿色版|免安装|注册机|刷单|彩票|客服电话)/;

// ---------------- 种子词（按栏目）----------------
// 每个栏目的"根词"：用户会从这些根词往下打字。
// 抓到的建议词继承种子的栏目归属。
const COLUMN_SEEDS = {
  'AI内容增长': ['AI写作', 'AI工具', '提示词', '大模型', 'AI绘画'],
  '外贸B2B独立站': ['外贸独立站', '外贸获客', '外贸开发信', '阿里国际站', '外贸B2B'],
  'SEO与Google Ads': ['SEO优化', '谷歌SEO', '关键词研究', '谷歌广告', '网站收录'],
  '效率工具与软件': ['效率工具', '笔记软件', 'Obsidian', 'Notion', '时间管理'],
  '博客建站与前端': ['Hexo', '博客搭建', '前端开发', '网站优化'],
  '数字生活': ['副业', '智能家居', '数码好物', '个人成长'],
};

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// ---------------- 网络（一律 curl，异步并发）----------------
function curlGet(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', [
      '-s', '--max-time', '12', '-A', UA,
      '-H', 'Accept-Language: zh-CN,zh;q=0.9', url,
    ], { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout);
    });
  });
}

/** 百度下拉建议。加 ie/oe=utf-8 直出 UTF-8；万一还是乱码，用 iconv-lite 兜底。 */
async function suggestBaidu(word) {
  const url = 'https://suggestion.baidu.com/su?wd=' + encodeURIComponent(word) +
    '&cb=cb&ie=utf-8&oe=utf-8';
  let text = (await curlGet(url)).toString('utf8');
  if (/\uFFFD/.test(text)) {
    try {
      const iconv = require('iconv-lite');
      text = iconv.decode(await curlGet(url), 'gbk');
    } catch (e) { /* 没有 iconv-lite 就只能用上面那份 */ }
  }
  const m = text.match(/s\s*:\s*(\[[\s\S]*?\])/);
  if (!m) return [];
  try { return JSON.parse(m[1]).map(String); } catch (e) { return []; }
}

/** 必应下拉建议。返回 ["query",["w1","w2",...]] */
async function suggestBing(word) {
  const url = 'https://api.bing.com/osjson.aspx?query=' + encodeURIComponent(word);
  const arr = JSON.parse((await curlGet(url)).toString('utf8'));
  return Array.isArray(arr) && Array.isArray(arr[1]) ? arr[1].map(String) : [];
}

/** 360 下拉建议。返回 {result:[{word:"..."}]} */
async function suggest360(word) {
  const url = 'https://sug.so.360.cn/suggest?word=' + encodeURIComponent(word) +
    '&encodein=utf-8&encodeout=utf-8';
  const j = JSON.parse((await curlGet(url)).toString('utf8'));
  return (j && Array.isArray(j.result)) ? j.result.map((r) => String(r.word || '')).filter(Boolean) : [];
}

const ENGINE_FN = { baidu: suggestBaidu, bing: suggestBing, '360': suggest360 };

/** 简单并发池：保持顺序，限制同时在跑的任务数 */
async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return out;
}

// ---------------- 站内语料（判断"有人搜"的词站内是否已有）----------------
function readSiteCorpus() {
  const { readPosts } = require('./insight-engine');
  return readPosts().map((p) => ({ title: p.title || '', col: p.col, abbr: p.abbr }));
}

/** 字符 bigram 集合（中文按字切，英文按字符切） */
function bigrams(s) {
  const t = String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  const chars = Array.from(t);
  const out = new Set();
  for (let i = 0; i < chars.length - 1; i++) out.add(chars[i] + chars[i + 1]);
  if (!out.size && chars.length) out.add(chars[0]);
  return out;
}
/** 覆盖率 = 需求词的 bigram 被标题命中的比例（用需求词做分母，衡量"标题是否讲了这个词"） */
function coverRatio(word, title) {
  const A = bigrams(word);
  const B = bigrams(title);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const g of A) if (B.has(g)) hit++;
  return hit / A.size;
}
function findCover(word, corpus) {
  let best = null;
  let bestScore = 0;
  for (const p of corpus) {
    const s = coverRatio(word, p.title);
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return bestScore >= COVER_SIM ? { score: +bestScore.toFixed(2), title: best.title, abbr: best.abbr } : null;
}

// ---------------- 主流程 ----------------
async function main() {
  const started = Date.now();
  const corpus = readSiteCorpus();

  // 1) 展开任务清单：{seed, column}
  const tasks = [];
  if (SEED_ONE) {
    // 若能认出这个种子属于哪个栏目，就继承它；认不出才标自定义
    let col = '(自定义)';
    for (const [c, seeds] of Object.entries(COLUMN_SEEDS)) {
      if (seeds.some((s) => s.toLowerCase() === SEED_ONE.toLowerCase())) { col = c; break; }
    }
    tasks.push({ seed: SEED_ONE, column: col });
  } else {
    for (const [col, seeds] of Object.entries(COLUMN_SEEDS)) {
      if (COLUMNS && COLUMNS.length && !COLUMNS.includes(col)) {
        console.warn('⚠️ 种子栏目不在规范 6 栏目内：' + col);
      }
      for (const s of seeds) tasks.push({ seed: s, column: col });
    }
  }

  // 2) 抓取（按 seed×engine 铺平后并发）
  const errors = [];
  const bag = new Map();   // word -> { word, column, columns:Set, seeds:Set, engines:Set }
  const addWord = (word, column, engine, seed) => {
    const w = String(word || '').trim();
    if (!w || w.length > 40) return;
    if (DEMAND_BLOCK.test(w)) return;          // 噪声词直接丢
    if (!bag.has(w)) bag.set(w, { word: w, column, columns: new Set(), seeds: new Set(), engines: new Set() });
    const it = bag.get(w);
    it.seeds.add(seed);
    it.engines.add(engine);
    it.columns.add(column);
  };

  const jobs = [];
  for (const t of tasks) for (const eng of ENGINES) jobs.push({ t, eng });
  await pool(jobs, CONCURRENCY, async ({ t, eng }) => {
    const fn = ENGINE_FN[eng];
    if (!fn) { errors.push({ seed: t.seed, engine: eng, error: '未知引擎' }); return; }
    try {
      const list = await fn(t.seed);
      for (const w of list) addWord(w, t.column, eng, t.seed);
    } catch (e) {
      errors.push({ seed: t.seed, engine: eng, error: String(e.message || e).slice(0, 120) });
    }
  });

  // 3) 可选二级展开：对已被 ≥2 个引擎命中的词再抓一层（挖更长的长尾）
  let level2 = 0;
  if (DEPTH >= 2) {
    const hot = [...bag.values()].filter((x) => x.engines.size >= 2).slice(0, 40);
    const jobs2 = [];
    for (const h of hot) for (const eng of ENGINES) jobs2.push({ h, eng });
    await pool(jobs2, CONCURRENCY, async ({ h, eng }) => {
      const fn = ENGINE_FN[eng];
      if (!fn) return;
      try {
        const list = await fn(h.word);
        for (const w of list) { addWord(w, h.column, eng, h.seed); level2++; }
      } catch (e) { /* 二级失败静默 */ }
    });
  }

  // 4) 与站内语料比对 → 标 covered
  const words = [...bag.values()].map((x) => {
    const cov = findCover(x.word, corpus);
    return {
      word: x.word,
      column: x.column,
      columns: [...x.columns],
      engines: [...x.engines],
      hits: x.engines.size,
      seeds: [...x.seeds],
      covered: !!cov,
      coveredBy: cov ? cov.title : null,
      coverScore: cov ? cov.score : null,
    };
  }).sort((a, b) => b.hits - a.hits || b.word.length - a.word.length);

  // 5) 缺口 = 有人搜 且 站内没对应标题（按引擎命中数排序）
  const gaps = words.filter((w) => !w.covered);

  // 6) 按栏目汇总
  const byColumn = {};
  for (const col of Object.keys(COLUMN_SEEDS).concat(['(自定义)'])) {
    const list = words.filter((w) => w.column === col);
    if (!list.length) continue;
    byColumn[col] = {
      total: list.length,
      uncovered: list.filter((w) => !w.covered).length,
      topGaps: list.filter((w) => !w.covered).slice(0, 8).map((w) => w.word),
    };
  }

  const result = {
    generatedAt: new Date().toISOString(),
    engines: ENGINES,
    depth: DEPTH,
    seedCount: tasks.length,
    wordCount: words.length,
    gapCount: gaps.length,
    level2Added: DEPTH >= 2 ? level2 : 0,
    elapsedMs: Date.now() - started,
    errors,
    byColumn,
    gaps,
    words,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonFile = JSON_OUT || path.join(OUT_DIR, 'demand.json');
  fs.writeFileSync(jsonFile, JSON.stringify(result, null, 2), 'utf8');

  // 文本报告
  const L = [];
  L.push('# 搜索需求雷达 · ' + today());
  L.push('');
  L.push('> 来源：' + ENGINES.join(' / ') + ' 下拉建议（真实用户输入）｜ 种子 **' + tasks.length +
    '** 个 ｜ 抓到需求词 **' + words.length + '** 个 ｜ 其中站内未覆盖 **' + gaps.length + '** 个');
  L.push('> 耗时 ' + ((Date.now() - started) / 1000).toFixed(1) + ' 秒' +
    (errors.length ? ' ｜ ⚠️ ' + errors.length + ' 次请求失败（不影响其余结果）' : ''));
  L.push('');
  L.push('## 一、按栏目看缺口（有人搜 · 站内没有）');
  L.push('');
  for (const [col, s] of Object.entries(byColumn)) {
    L.push('### ' + col + '（需求词 ' + s.total + ' 个 ｜ 未覆盖 ' + s.uncovered + ' 个）');
    L.push('');
    if (!s.topGaps.length) { L.push('（该栏目需求词基本都有对应文章）'); L.push(''); continue; }
    for (const w of s.topGaps) L.push('- ' + w);
    L.push('');
  }
  L.push('## 二、跨引擎高置信缺口（≥2 个引擎同时建议 → 搜索量更可信）');
  L.push('');
  const strong = gaps.filter((w) => w.hits >= 2);
  if (!strong.length) {
    L.push('（本轮没有跨引擎的共同建议 —— 正常，不同引擎的下拉词池差异较大）');
  } else {
    L.push('| 需求词 | 栏目 | 命中引擎 |');
    L.push('|---|---|---|');
    for (const w of strong.slice(0, 30)) {
      L.push('| ' + w.word.replace(/\|/g, '\\|') + ' | ' + w.column + ' | ' + w.engines.join(',') + ' |');
    }
  }
  L.push('');
  L.push('## 三、已有覆盖的需求词（供对照：这些词站内已讲过，别重复写）');
  L.push('');
  const covered = words.filter((w) => w.covered).slice(0, 20);
  if (!covered.length) L.push('（暂无）');
  else for (const w of covered) L.push('- `' + w.word + '` → 《' + w.coveredBy + '》（覆盖 ' + w.coverScore + '）');
  L.push('');
  const mdFile = path.join(OUT_DIR, 'demand-' + today() + '.md');
  fs.writeFileSync(mdFile, L.join('\n'), 'utf8');

  if (!QUIET) console.log(L.join('\n'));
  console.log('\n✅ 需求层已落盘：' + mdFile);
  console.log('   JSON：' + jsonFile + '（需求词 ' + words.length + ' ｜ 缺口 ' + gaps.length +
    ' ｜ 耗时 ' + ((Date.now() - started) / 1000).toFixed(1) + 's）');
}

if (require.main === module) {
  main().catch((e) => { console.error('致命错误：' + (e && e.stack || e)); process.exit(1); });
}

module.exports = { COLUMN_SEEDS, coverRatio, findCover, ENGINE_FN, DEMAND_BLOCK };
