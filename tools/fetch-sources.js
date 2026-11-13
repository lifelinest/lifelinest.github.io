#!/usr/bin/env node
/**
 * tools/fetch-sources.js —— 站外输入源采集器（给内容引擎「灌料」）
 * ------------------------------------------------------------------
 * 在此之前，流水线唯一的入口是「用户丢一个链接」。这个工具把入口扩成
 * 「配置驱动的一批站外源」，并直接接上定位筛选器：
 *
 *   站外源(RSS/Atom)  →  去重 + 按时间排序  →  定位筛选器打分  →  候选主题清单
 *                                                                   ↓
 *                                                        matrix-planner / 模式 A
 *
 * 特点：
 *   - 零外部依赖、零密钥；网络层走 curl 子进程（本机 HTTP 代理可自动跟随，
 *     Node 原生 fetch 直连会被代理拦截 —— 这是本机已知坑）。
 *   - 已读历史落盘，重复运行只报「新增」（不占 C 盘，默认 D:\1\1\.tmp\sources-state）。
 *   - --score 时在进程内调用 topic-fit-scorer，直接给出 KEEP/REVIEW/DROP。
 *
 * 用法：
 *   node tools/fetch-sources.js                          # 首次：列出所有源的最新条目
 *   node tools/fetch-sources.js --since=7                # 只看近 7 天
 *   node tools/fetch-sources.js --score                  # 附带定位筛选结论
 *   node tools/fetch-sources.js --score --min=1          # 只看 KEEP/REVIEW
 *   node tools/fetch-sources.js --to-candidates=D:/1/1/.tmp/candidates.txt   # 导出候选文件
 *   node tools/fetch-sources.js --source=Ahrefs --limit=5
 *   node tools/fetch-sources.js --all --json D:/1/1/.tmp/sources.json
 * 退出码：0 = 正常；1 = 参数错误或所有源都取不到
 *
 * 注意：不要把这个文件放进 scripts/ —— hexo 会把 scripts/ 下的每个 .js 当插件加载执行。
 */
'use strict';

const execFileSync = require('child_process').execFileSync;
const fs = require('fs');
const path = require('path');
const { scoreCandidate } = require('./topic-fit-scorer');
const cm = require('./content-matrix');
const { buildProfile } = require('./positioning-profile');

const ROOT = path.resolve(__dirname, '..');
const SOURCES_FILE = path.join(__dirname, 'sources.json');
const STATE_DIR = path.resolve(ROOT, '..', '.tmp', 'sources-state');
const STATE_FILE = path.join(STATE_DIR, 'seen.json');
// 用浏览器型 UA：部分站点（Cloudflare 系）会专门拦 UA 里带 bot 的客户端
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const argv = process.argv.slice(2);
function getArg(name, def) {
  const i = argv.findIndex((a) => a === name || a.startsWith(name + '='));
  if (i === -1) return def;
  const a = argv[i];
  if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
  const nx = argv[i + 1];
  return nx && !nx.startsWith('--') ? nx : def;
}
const has = (n) => argv.some((a) => a === n || a.startsWith(n + '='));

const SINCE_DAYS = getArg('--since', null);
const LIMIT = parseInt(getArg('--limit', '8'), 10);
const ONLY_SOURCE = getArg('--source', '');
const JSON_OUT = getArg('--json', '');
const TO_CANDIDATES = getArg('--to-candidates', '');
const MIN_SCORE = getArg('--min', null);
const SHOW_ALL = has('--all');
const HOT_ONLY = has('--hot');   // 只看热榜源（tier=hot）
const DO_SCORE = has('--score') || TO_CANDIDATES !== '' || MIN_SCORE !== null;

// ---------------- 网络：curl 子进程（代理可达）----------------
// C·源质量自淘汰：加指数退避重试，治代理抖动导致的偶发超时丢候选。
function sleepSync(ms) { const end = Date.now() + ms; while (Date.now() < end) { /* busy-wait */ } }
function curl(url) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return execFileSync('curl', ['-sL', '--max-time', '25', '-A', UA, url], {
        encoding: 'utf8',
        maxBuffer: 32 * 1028 * 1028,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch (e) {
      lastErr = e;
      if (attempt < 2) sleepSync(800 * Math.pow(2, attempt)); // 0.8s, 1.6s 退避
    }
  }
  return '';
}

// ---------------- 极简 RSS/Atom 解析（不引依赖）----------------
function unescape(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')          // 标题里偶尔带标签
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFeed(xml) {
  const rss = xml.match(/<item[\s>][\s\S]*?<\/item>/g);
  const atom = xml.match(/<entry[\s>][\s\S]*?<\/entry>/g);
  const blocks = rss || atom || [];
  const out = [];
  for (const b of blocks) {
    const t = b.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    let link = '';
    const lTag = b.match(/<link[^>]*>([\s\S]*?)<\/link>/);
    if (lTag) link = lTag[1];
    else {
      const href = b.match(/<link[^>]*href=["']([^"']+)["']/);
      if (href) link = href[1];
    }
    const d = b.match(/<(pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/\1>/);
    out.push({
      // 部分源（dev.to 等）会把话题标签拼进标题，去掉尾部连续的 #tag，避免污染候选
      title: t ? unescape(t[1]).replace(/(\s*#[\w\u4e00-\u9fa5-]+)+\s*$/, '').trim() : '',
      link: String(link).replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
      date: d ? new Date(d[2].trim()).getTime() : 0,
    });
  }
  return out;
}

// ---------------- 热榜 JSON 源：解析规则复用 tools/hot-parse.js ----------------
// 注意：热榜解析必须与校准工具 hot-calibrate.js 同源，否则会出现「校准通过但采集为空」。
const { parseHot } = require('./hot-parse');

// ---------------- 已读历史 ----------------
function loadSeen() {
  if (!fs.existsSync(STATE_FILE)) return { seen: {}, updatedAt: null };
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    return { seen: {}, updatedAt: null };
  }
}
function saveSeen(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const keys = Object.keys(state.seen);
  if (keys.length > 3000) {   // 只保留最近 3000 条，防止文件无限膨胀
    const sorted = keys.sort((a, b) => (state.seen[b] || 0) - (state.seen[a] || 0)).slice(0, 3000);
    const slim = {};
    for (const k of sorted) slim[k] = state.seen[k];
    state.seen = slim;
  }
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// ---------------- 主流程 ----------------
if (!fs.existsSync(SOURCES_FILE)) {
  console.error('找不到源清单：' + SOURCES_FILE);
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf8'));
const disabled = (cfg.feeds || []).filter((f) => f.disabled);
let feeds = (cfg.feeds || []).filter((f) => !f.disabled);   // disabled 源跳过（不删配置，便于找回）
if (HOT_ONLY) {
  feeds = feeds.filter((f) => f.tier === 'hot');
  if (!feeds.length) { console.error('--hot 没匹配到任何热榜源'); process.exit(1); }
}
if (ONLY_SOURCE) {
  feeds = feeds.filter((f) => f.name.toLowerCase().includes(ONLY_SOURCE.toLowerCase()) || f.url.includes(ONLY_SOURCE));
  if (!feeds.length) {
    console.error('--source 没匹配到任何源：' + ONLY_SOURCE);
    process.exit(1);
  }
}

const seenState = loadSeen();
const now = Date.now();
const sinceTs = SINCE_DAYS ? now - parseInt(SINCE_DAYS, 10) * 86400000 : 0;
const MAX_AGE_DAYS = 14;                       // P1-A-c 保鲜期：非热榜条目超过此天数视为过期，直接丢弃
const MAX_AGE_MS = MAX_AGE_DAYS * 86400000;

const all = [];
const errors = [];
for (const f of feeds) {
  const raw = curl(f.url);
  if (!raw || raw.length < 60) { errors.push(f.name + '（取回为空/超时）'); continue; }
  const isHot = f.kind === 'json' || f.tier === 'hot';
  const items = isHot ? parseHot(raw, f) : parseFeed(raw);
  if (!items.length) { errors.push(f.name + '（解析不到条目' + (isHot ? '，JSON 路径可能已变' : '，可能不是标准 RSS/Atom') + '）'); continue; }
  // P1-A-a 噪声源降权：非 --all 模式下，噪声源 LIMIT 降到 2（保留 --all 调试可用）
  const lim = (f.tier === 'noise' && !SHOW_ALL) ? Math.min(LIMIT, 2) : LIMIT;
  for (const it of items.slice(0, lim)) {
    if (!it.title) continue;
    // P1-A-c 保鲜期：非热榜条目发布时间过期(>14天)直接丢弃
    if (!isHot && it.date && (now - it.date) > MAX_AGE_MS) continue;
    all.push({
      title: it.title,
      link: it.link,
      // 热榜不带发布时间 → 记为采集时刻，保证能进「近 N 天」过滤
      date: it.date || (isHot ? now : 0),
      dateStr: it.date ? new Date(it.date).toISOString().slice(0, 10) : (isHot ? new Date(now).toISOString().slice(0, 10) : '—'),
      hot: it.hot || 0,
      tier: f.tier || 'feed',
      source: f.name,
      pillar: f.pillar || '',
      lang: f.lang || '',
      isNew: !seenState.seen[it.link || it.title],
    });
  }
}

if (!all.length) {
  console.error('✗ 所有源都没取到内容：');
  errors.forEach((e) => console.error('   · ' + e));
  process.exit(1);
}

// 过滤：默认只看新增；--all 看全部；两者都尊重 --since
// P1-A-c 保鲜期：去掉「无日期 RSS 条目绕过 since 过滤」的特例（热榜 date=now 自然过筛，不受影响）
let list = all.filter((x) => (SHOW_ALL || x.isNew) && (!sinceTs || x.date >= sinceTs));
list.sort((a, b) => (b.date || 0) - (a.date || 0));

// ---------------- 定位筛选（内容矩阵驱动）----------------
let prof = null;
if (DO_SCORE) {
  const cov = cm.buildCoverage();
  for (const it of list) {
    const r = scoreCandidate(it.title, prof, { coverage: cov, tier: it.tier || 'feed', source: it.source });
    it.decision = r.decision;
    it.score = r.score;
    it.bestCol = r.bestCol;
    it.reason = r.reason;
    it.proTier = r.proTier;
    it.cell = r.cell;
    it.axes = r.axes;
    it.ft = r.ft;
    it.linkable = r.linkable;
  }
  if (MIN_SCORE !== null) list = list.filter((x) => x.score >= parseInt(MIN_SCORE, 10));
  const order = { KEEP: 0, REVIEW: 1, DROP: 2 };
  list.sort((a, b) => (order[a.decision] - order[b.decision]) || (b.score - a.score) || (b.date - a.date));
}

// ---------------- 输出 ----------------
const L = [];
const hotCount = feeds.filter((f) => f.tier === 'hot').length;
L.push('=== 站外输入源采集（' + feeds.length + ' 个源' + (hotCount ? '，其中热榜 ' + hotCount : '') + '）===');
L.push('模式：' + (SHOW_ALL ? '全部条目' : '仅新增（自上次采集以来）') + (SINCE_DAYS ? ' ｜ 近 ' + SINCE_DAYS + ' 天' : ''));
if (DO_SCORE) L.push('定位筛选：已开启（内容矩阵驱动 ｜ 实时覆盖矩阵单元格 ' + Object.keys(cm.buildCoverage()).length + ' 个，优先填空白/薄弱格）');
if (disabled.length) L.push('已停用源：' + disabled.map((f) => f.name).join('、') + '（见 sources.json 的 disabled 字段）');
L.push('历史状态：' + STATE_FILE);
L.push('');

if (!list.length) {
  L.push('（没有符合条件的条目 —— 试试 --all 或 --since=30）');
} else {
  const KEEP = list.filter((x) => x.decision === 'KEEP');
  const REVIEW = list.filter((x) => x.decision === 'REVIEW');
  if (DO_SCORE) L.push('结论：KEEP ' + KEEP.length + ' ｜ REVIEW ' + REVIEW.length + ' ｜ 其余 ' + (list.length - KEEP.length - REVIEW.length) + ' 条不建议写');
  L.push('');
  for (const it of list) {
    const tag = it.decision ? '[' + it.decision + ' ' + it.score + ']' : '[新]';
    const hotStr = it.hot ? '  🔥' + it.hot.toLocaleString('en-US') : '';
    L.push(tag + ' ' + it.dateStr + '  ' + it.source + hotStr + (it.pillar ? ' · ' + it.pillar.split(' ')[0] : ''));
    L.push('    ' + it.title);
    if (it.link) L.push('    ' + it.link);
    if (it.reason) L.push('    ↳ ' + it.reason);
  }
}
if (errors.length) {
  L.push('');
  L.push('⚠️ 以下源本次未取到（不影响其它源）：');
  errors.forEach((e) => L.push('   · ' + e));
}
L.push('');
L.push('下一步：把 KEEP 的条目喂给矩阵规划器，例如');
L.push('  node tools/matrix-planner.js --seed="<选中标题>" --json D:/1/1/.tmp/matrix.json');
L.push('  node tools/run-matrix.js --plan D:/1/1/.tmp/matrix.json --next');

console.log(L.join('\n'));

// ---------------- 落盘 ----------------
if (TO_CANDIDATES) {
  const lines = list.map((x) => x.title + (x.source ? ' | ' + x.source : '')).join('\n');
  fs.mkdirSync(path.dirname(TO_CANDIDATES), { recursive: true });
  fs.writeFileSync(TO_CANDIDATES, lines + '\n', 'utf8');
  console.log('\n✅ 候选清单已导出（可直接喂 topic-fit-scorer）：' + TO_CANDIDATES);
}
if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify({ generatedAt: new Date().toISOString(), sources: feeds.length, errors, items: list }, null, 2));
  console.log('✅ 采集 JSON 已落盘：' + JSON_OUT);
}

// 标记已读（即使 --all 也登记，保证下次只报真新增）
for (const it of all) seenState.seen[it.link || it.title] = it.date || now;
saveSeen(seenState);
