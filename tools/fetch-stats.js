/**
 * 流量复盘数据源 —— 拉取自建 51.la 安全代理（Cloudflare Worker）
 *
 * 数据链路：51.la OpenAPI → worker/la-stats-proxy.js → 本工具
 * 用途：给「上线后复盘」闭环供数（站点概览 / 热门文章 / 访客地域 / 单篇流量）
 *
 * 为什么走 curl 子进程而不是 fetch：
 *   本机网络走 HTTP 代理，Node 原生 fetch/axios 直连会被拦（socket hang up）；
 *   curl 自动跟随代理，实测可达。与 check-external-links.js / fetch-sources.js 同口径。
 *
 * 为什么带 Origin: http://localhost:4000：
 *   worker 有来源白名单（防滥用），服务端调用没有浏览器自动带的 Origin，
 *   必须显式伪造一个白名单内的来源，否则一律 403 Forbidden Origin。
 *
 * 用法：
 *   node tools/fetch-stats.js                      # 全量复盘报告（概览+热榜+地域）
 *   node tools/fetch-stats.js --hot=20             # 只看热榜 Top20
 *   node tools/fetch-stats.js --check=a0627e97     # 查单篇（abbrlink）流量 —— 复盘核心
 *   node tools/fetch-stats.js --json D:/x.json     # 落盘原始数据
 *   node tools/fetch-stats.js --raw                # 不归并（看新旧域名分列原貌）
 *   node tools/fetch-stats.js --days=365 --scan=300 # 放宽窗口 / 加大抓取量（学习层摸底）
 *   node tools/fetch-stats.js --proxy=<url>        # 临时换代理地址（默认自动探活）
 *
 * 端点：https://stats.mfyresume.dpdns.org（Cloudflare 托管域，国内可达）
 *   ⚠️ 不要再用 workers.dev 子域 —— 国内被 DNS 污染，实测 HTTP 000。
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------------- 配置 ----------------

const DEFAULT_PROXY = 'https://stats.mfyresume.dpdns.org';
// 候选回退：主域不可达时依次探测（例如换域名、或某条链路被污染）。
// ⚠️ 旧 workers.dev 子域仅作历史记录 —— 2026-09-22 实测国内 HTTP 000 完全不可达，
//    且 worker 绑定自定义域后 workers_dev 已被禁用，正常不会再命中。
const LEGACY_PROXIES = [
  'https://blog-la-stats-proxy.2rh50aqpuyunweiloginmh3.workers.dev',
];
// 必须是 worker ALLOWED_DEV_ORIGINS 或 ALLOWED_ORIGIN_PROD 之一
const INTERNAL_ORIGIN = 'http://localhost:4000';
// 本站正式域名（归并 PV 时优先保留这个域名的 URL 作为展示链接）
const SITE_HOST = 'mfy-lifeline.com';

// 本地缓存：worker 有 10 次/分钟 限流，复盘常需连续多次查询，故缓存热榜数据。
// 目录约定与 fetch-sources.js 一致：D:\1\1\.tmp\<name>-state\（不占 C 盘、不入库）
const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.resolve(ROOT, '..', '.tmp', 'stats-state');
// ⚠️ 缓存文件名曾被拆成两个：fetch-stats 写 hot-with404.json，insight-engine 读 hot.json，
//    结果学习层长期读到 12:04 的旧 20 条缓存，把 PV 覆盖率误报成「11 篇」。
//    现在统一：hot.json = 唯一权威缓存；hot-with404.json 保留为兼容别名（内容相同）。
const CACHE_FILE = path.join(CACHE_DIR, 'hot.json');
const CACHE_ALIASES = [path.join(CACHE_DIR, 'hot-with404.json')];
const CACHE_TTL_MS = 5 * 60 * 1000;

// ---------------- 参数解析（支持 --k=v 与 --k v 两种写法） ----------------

const argv = process.argv.slice(2);
function getArg(name, dft) {
  const eq = argv.find((a) => a.startsWith(name + '='));
  if (eq) return eq.slice(name.length + 1);
  const i = argv.indexOf(name);
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  return dft;
}
const has = (n) => argv.includes(n) || argv.some((a) => a.startsWith(n + '='));

const PROXY_ARG = getArg('--proxy', '');
// 抓取条数上限。默认 300 = 摸全站底数（worker 侧上限也是 300）。
// ⚠️ 别调小：worker 返回的条数直接决定「学习层能看见多少篇有流量的文章」。
//    旧版这里写死 20，导致覆盖率被误判成「全站只有十来篇有数据」。
const SCAN_LIMIT = Math.min(Math.max(parseInt(getArg('--scan', '300'), 10) || 300, 1), 300);
// 统计窗口天数（worker 侧上限 365）。默认 90 与前端热榜口径一致。
const DAYS = Math.min(Math.max(parseInt(getArg('--days', '90'), 10) || 90, 1), 365);
const HOT_LIMIT = parseInt(getArg('--hot', '0'), 10) || 0;
const CHECK = getArg('--check', null);
const JSON_OUT = getArg('--json', null);
const RAW = has('--raw');
const NO_CACHE = has('--no-cache');
const ONLY_HOT = HOT_LIMIT > 0 && !has('--all');
// 51.la 官方数据挂件（与网页端 about 页同一数据源）
const WIDGET_BASE = 'https://v6-widget.51.la/v6/';

// 实际使用的代理：main() 开始时解析（探活失败自动回退候选）。
let PROXY = (PROXY_ARG || DEFAULT_PROXY).replace(/\/+$/, '');

/**
 * 解析可用代理：显式 --proxy 优先；否则按 [主域, ...历史域] 依次探活 /health。
 * 目的：域名再变时工具能自己找到活的那条，而不是让整条复盘链静默失败。
 */
function resolveProxy() {
  if (PROXY_ARG) return { proxy: PROXY_ARG.replace(/\/+$/, ''), source: '--proxy 指定', tried: [] };
  const cands = [DEFAULT_PROXY, ...LEGACY_PROXIES];
  const tried = [];
  for (const c of cands) {
    const base = c.replace(/\/+$/, '');
    const r = curlText(base + '/health', 12);
    tried.push({ proxy: base, ok: r.ok && /"status"\s*:\s*"ok"/.test(r.text || ''), note: r.ok ? '' : (r.error || '') });
    if (r.ok && /"status"\s*:\s*"ok"/.test(r.text || '')) return { proxy: base, source: tried.length === 1 ? '主域' : '回退', tried };
  }
  return { proxy: DEFAULT_PROXY, source: '全部候选不可达（用主域硬试）', tried };
}

// ---------------- 本地缓存 ----------------

function readHotCache(ignoreTtl) {
  if (NO_CACHE && !ignoreTtl) return null;
  // 主缓存 + 历史别名里取「最新的那份」，避免旧文件把新数据顶掉
  let best = null;
  for (const f of [CACHE_FILE, ...CACHE_ALIASES]) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (!Array.isArray(j.list)) continue;
      if (!best || (j.t || 0) > (best.t || 0)) best = j;
    } catch (e) { /* 该文件不存在 */ }
  }
  if (!best) return null;
  if (!ignoreTtl && Date.now() - (best.t || 0) >= CACHE_TTL_MS) return null;
  // ⚠️ 返回 { list, t } 而不是裸 list：调用方必须知道这份缓存「是哪一刻的」。
  //    曾经只返回 list，降级使用时无法说出数据日期，于是「用的是昨天的 PV」
  //    这件事在产物里完全不可见 —— 学习层据此算出的结论看起来却像最新的。
  return { list: best.list, t: best.t || 0 };
}

function writeHotCache(list) {
  const payload = JSON.stringify({ t: Date.now(), list }, null, 2);
  for (const f of [CACHE_FILE, ...CACHE_ALIASES]) {
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, payload);
    } catch (e) { /* 缓存失败不影响主流程 */ }
  }
}

// ---------------- 网络层（curl 子进程） ----------------

function curlJson(url, timeoutSec) {
  const r = curlText(url, timeoutSec);
  if (!r.ok) return r;
  const text = r.text;
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: '返回非 JSON：' + text.slice(0, 160) };
  }
  if (json && json.error) return { ok: false, error: json.error, status: json.status };
  return { ok: true, data: json };
}

function curlText(url, timeoutSec, withOrigin) {
  const args = [
    '-s',
    '-m', String(timeoutSec || 25),
    '-H', 'Accept: */*',
  ];
  // 只有自建 Worker 代理需要伪造白名单 Origin；第三方（51.la 挂件）不需要
  if (withOrigin !== false) args.push('-H', 'Origin: ' + INTERNAL_ORIGIN);
  args.push(url);
  let out;
  try {
    out = execFileSync('curl', args, {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    return { ok: false, error: 'curl 调用失败：' + (e.message || e) };
  }
  const text = (out || '').trim();
  if (!text) return { ok: false, error: '空响应（代理是否可达？）' };
  return { ok: true, text };
}

function endpoint(p) {
  return PROXY + p;
}

// ---------------- abbrlink 归并 ----------------
// 51.la 把同一篇文章的旧域名/新域名 URL 当作两个受访页分开计数。
// 归并后热榜才是"文章"维度，而不是"URL"维度。

function abbrFromUrl(url) {
  if (!url) return null;
  let u = String(url);
  try {
    u = decodeURIComponent(u);
  } catch (e) { /* 保留原样 */ }
  const m = u.match(/\/posts\/([0-9a-zA-Z]{6,})(?:\/|$|\?|#)/);
  return m ? m[1].toLowerCase() : null;
}

/**
 * 归并 key：文章页按 abbrlink，其余页面按 pathname（忽略 host）。
 * 目的：迁站后同一页面在旧域名和新域名下会被 51.la 计为两条，需合并。
 */
function mergeKey(url) {
  const abbr = abbrFromUrl(url);
  if (abbr) return { key: 'post:' + abbr, abbr };
  let u = String(url || '');
  let p;
  try {
    p = new URL(u).pathname;
  } catch (e) {
    // 相对路径形式
    p = u.replace(/[?#].*$/, '');
  }
  p = (p || '/').replace(/\/+$/, '') || '/';
  return { key: 'page:' + p, abbr: null };
}

function mergeByAbbr(list) {
  const map = new Map();
  for (const it of list || []) {
    const { key, abbr } = mergeKey(it.url);
    if (!map.has(key)) {
      map.set(key, {
        key,
        abbr,
        title: it.title || '',
        url: it.url || '',
        pv: 0,
        uv: 0,
        sources: [],
      });
    }
    const cur = map.get(key);
    cur.pv += parseInt(it.pv, 10) || 0;
    cur.uv += parseInt(it.uv, 10) || 0;
    cur.sources.push({ url: it.url, pv: parseInt(it.pv, 10) || 0, uv: parseInt(it.uv, 10) || 0 });
    // 展示链接优先用本站正式域名；标题取更完整的一个
    const isSite = String(it.url || '').indexOf(SITE_HOST) !== -1;
    if (isSite || !cur.url) {
      cur.url = it.url;
      if (it.title) cur.title = it.title;
    } else if (!cur.title && it.title) {
      cur.title = it.title;
    }
  }
  return [...map.values()].sort((a, b) => b.pv - a.pv);
}

// ---------------- 数据获取 ----------------

/**
 * 从主题配置读 51.la 的 ck（站点的公开标识，本来就会印在网页源码里）。
 * 用途：拼官方数据挂件 URL https://v6-widget.51.la/v6/<ck>/quote.js
 */
function readLaCk() {
  try {
    const yml = fs.readFileSync(path.join(ROOT, '_config.anzhiyu.yml'), 'utf8');
    const i = yml.search(/^LA:\s*$/m);
    if (i === -1) return null;
    const block = yml.slice(i, i + 400);
    const m = block.match(/^\s*ck:\s*['"]?([A-Za-z0-9_-]{6,})/m);
    return m ? m[1] : null;
  } catch (e) {
    return null;
  }
}

/**
 * 站点流量概况。
 *
 * 数据源优先级：
 *   ① 51.la 官方数据挂件 quote.js —— 与网页端 about 页同一数据源、无需签名、不受 Worker 限流
 *   ② 自建 Worker /stats —— 兜底
 *
 * 为什么以挂件为准：Worker 的 /stats 走 51.la OpenAPI /report/traffic，
 * 2026-09-22 实测该端点返回空数组（各项全 0）。挂件是线上页面正在用、已被验证正确的口径。
 *
 * 挂件数据块形如 <span>0</span><span>值</span>…<span>6</span><span>值</span>（共 7 组）：
 *   0=最近活跃(占位) 1=今日UV 2=今日PV 3=昨日UV 4=昨日PV 5=本月PV 6=总PV
 */
function fetchOverview() {
  const ck = readLaCk();
  if (ck) {
    const r = curlText(WIDGET_BASE + ck + '/quote.js', 30, false);
    if (r.ok) {
      const pairs = [...r.text.matchAll(/<span>(\d+)<\/span><span>(\d+)<\/span><\/p>/g)];
      if (pairs.length >= 7) {
        const v = pairs.map((m) => parseInt(m[2], 10) || 0);
        return {
          ok: true,
          source: 'widget',
          data: {
            todayUV: v[1],
            todayPV: v[2],
            yesterdayUV: v[3],
            yesterdayPV: v[4],
            monthPV: v[5],
            totalPV: v[6],
          },
        };
      }
      return { ok: false, error: '挂件数据块解析失败（格式可能已变）' };
    }
    // 挂件失败再退到 Worker
  }

  const r2 = curlJson(endpoint('/stats'), 40);
  if (!r2.ok) return { ok: false, error: r2.error };
  const d = r2.data && r2.data.data ? r2.data.data : r2.data;
  return { ok: true, source: 'worker', data: d || {} };
}

/**
 * 拉取热榜原始列表（完整，不切片）。
 * 切片必须发生在 mergeByAbbr 之后 —— 否则新旧域名分列的两条会被切散，
 * 导致归并结果偏小（踩过：--hot=5 时首页只算到旧域名的 183，漏了新域名的 45）。
 */
function fetchHot() {
  const cached = readHotCache();
  if (cached && cached.list && cached.list.length) {
    return { ok: true, data: cached.list, fromCache: true, cacheAt: cached.t };
  }
  // 网页端 about 页的热榜不带 include404，故访客看到的是干净的真文章排行。
  // limit 用 SCAN_LIMIT（默认 300）而非 20 —— 覆盖多少篇决定学习层的判断力。
  const r = curlJson(endpoint('/hot-articles?limit=' + SCAN_LIMIT + '&days=' + DAYS + '&include404=1'), 60);
  if (!r.ok) {
    // 限流或网络失败时降级用过期的本地缓存，保证复盘不中断
    const stale = readHotCache(true);
    if (stale && stale.list && stale.list.length) {
      return { ok: true, data: stale.list, fromCache: true, stale: true, note: r.error, cacheAt: stale.t };
    }
    return { ok: false, error: r.error };
  }
  const list = r.data.data || [];
  writeHotCache(list);
  return { ok: true, data: list, cacheAt: Date.now() };
}

function fetchMap() {
  const r = curlJson(endpoint('/visitor-map'), 45);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, data: r.data.data || [] };
}

// ---------------- 输出 ----------------

const W = (s, n) => {
  s = String(s == null ? '' : s);
  // 中文按 2 宽度估算，保证列对齐
  let w = 0;
  for (const ch of s) w += /[\u4e00-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1;
  return s + ' '.repeat(Math.max(0, n - w));
};

const fmt = (n) => (parseInt(n, 10) || 0).toLocaleString('en-US');

function printOverview(o) {
  console.log('【站点概览】' + (o.ok ? (o.source === 'widget' ? '（来源：51.la 官方挂件）' : '（来源：Worker /stats）') : ''));
  if (!o.ok) {
    console.log('  ⚠️ 取数失败：' + o.error);
    return;
  }
  const d = o.data || {};
  const rows = [
    ['今日', d.todayPV, d.todayUV],
    ['昨日', d.yesterdayPV, d.yesterdayUV],
    ['本月', d.monthPV, null],
    ['累计', d.totalPV, null],
  ];
  for (const [label, pv, uv] of rows) {
    const uvTxt = uv == null ? '' : '  访客 ' + fmt(uv);
    console.log('  ' + W(label, 6) + '访问 ' + W(fmt(pv), 12) + uvTxt);
  }
}

function printHot(items, merged) {
  console.log('【热门文章 · 近 ' + DAYS + ' 天】' + (merged ? '（已按 abbrlink 归并新旧域名）' : '（原始 URL 维度）'));
  if (!items || !items.length) {
    console.log('  （无数据）');
    return;
  }
  items.forEach((it, i) => {
    const no = String(i + 1).padStart(2, ' ');
    const pv = W(fmt(it.pv) + ' PV', 12);
    const uv = fmt(it.uv) + ' UV';
    const link = it.abbr ? '/posts/' + it.abbr + '/' : it.url || '';
    const flag = it.notFound ? '  ⚠️ 失效页' : '';
    console.log('  ' + no + '. ' + pv + uv + '  ' + (it.title || '(无标题)') + flag);
    console.log('      ' + link);
    // 归并后如有多个来源，列出明细（复盘时能看出旧域名贡献了多少）
    if (merged && it.sources && it.sources.length > 1) {
      const parts = it.sources.map((s) => {
        let host = s.url;
        try { host = new URL(s.url).host; } catch (e) { /* path 形式 */ }
        return host + ' ' + fmt(s.pv);
      });
      console.log('      ↳ 来源：' + parts.join('  |  '));
    }
  });
  const nf = items.filter((x) => x.notFound);
  if (merged && nf.length) {
    console.log('');
    console.log('  ⚠️ 其中 ' + nf.length + ' 条是「失效页」的访问（URL 已 404，但仍有外链或搜索结果指向它）。');
    console.log('     这不是真热门文章。处理方向：修正指向它的外链/收录，或为它建跳转页。');
  }
}

function printMap(items) {
  console.log('【访客地域 · 近 3 天】');
  if (!items || !items.length) {
    console.log('  （无数据）');
    return;
  }
  items.slice(0, 12).forEach((it) => {
    console.log('  ' + W(it.name, 10) + '访问 ' + fmt(it.value) + '  访客 ' + fmt(it.uv));
  });
}

function printCheck(target, items) {
  const t = String(target).toLowerCase();
  const hit = items.filter((it) => (it.abbr && it.abbr === t) || String(it.url || '').toLowerCase().indexOf(t) !== -1);
  console.log('【单篇流量核对】查询：' + target);
  if (!hit.length) {
    console.log('  未在近 ' + DAYS + ' 天受访页数据中找到该文。');
    console.log('  可能原因：① 刚上线还未被统计；② abbrlink 拼写不对；③ 该文零访问。');
    return;
  }
  for (const it of hit) {
    console.log('  ' + (it.title || '(无标题)'));
    console.log('    abbrlink : ' + (it.abbr || '—'));
    console.log('    访问/PV  : ' + fmt(it.pv));
    console.log('    访客/UV  : ' + fmt(it.uv));
    console.log('    链接     : ' + (it.url || ''));
  }
}

// ---------------- 主流程 ----------------

/**
 * 站内文章总数（source/_posts 里带 abbrlink 的 .md）。
 * 用途：算 PV 覆盖率 —— 让「有多少篇根本没数据」这件事显式可见。
 */
function countSitePosts() {
  try {
    const dir = path.join(ROOT, 'source', '_posts');
    let n = 0;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const head = fs.readFileSync(path.join(dir, f), 'utf8').slice(0, 1200);
      if (/^abbrlink\s*:/m.test(head)) n++;
    }
    return n;
  } catch (e) {
    return 0;
  }
}

function main() {
  const resolved = resolveProxy();
  PROXY = resolved.proxy;

  console.log('');
  console.log('流量复盘数据源 ｜ 代理：' + PROXY + '（' + resolved.source + '）');
  console.log('  数据来源：51.la，经自建 Worker 代理；服务端调用带 Origin ' + INTERNAL_ORIGIN);
  console.log('  抓取口径：最近 ' + DAYS + ' 天受访页，上限 ' + SCAN_LIMIT + ' 条（含失效页）');
  if (resolved.tried && resolved.tried.length > 1) {
    for (const t of resolved.tried) {
      console.log('    · ' + (t.ok ? '✅' : '❌') + ' ' + t.proxy + (t.note ? '  ' + t.note : ''));
    }
  }
  console.log('');

  const out = { fetchedAt: new Date().toISOString(), proxy: PROXY, proxySource: resolved.source, days: DAYS, scanLimit: SCAN_LIMIT };

  let hotRaw = [];
  let hotMerged = [];
  let hotErr = null;

  // 热榜是复盘的核心，先拿；--check 也依赖它
  const hot = fetchHot();
  if (hot.ok) {
    hotRaw = hot.data || [];
    hotMerged = mergeByAbbr(hotRaw);
    // ★ 数据新鲜度必须落进产物。否则「用的是哪天的 PV」在链路下游完全不可见 ——
    //   学习层就会拿旧数据算出看起来最新的结论（实测踩过：pv 数据比结论旧 18 小时）。
    if (hot.cacheAt) out.pvAt = hot.cacheAt;
    if (hot.stale) {
      const when = hot.cacheAt ? new Date(hot.cacheAt).toLocaleString('zh-CN') : '未知时间';
      const ageH = hot.cacheAt ? ((Date.now() - hot.cacheAt) / 3600000).toFixed(1) : '?';
      console.log('⚠️ 实时取数失败（' + hot.note + '）—— 已降级使用本地缓存。');
      console.log('   数据日期：' + when + '（距今 ' + ageH + ' 小时，非最新）');
      console.log('   多半是统计代理上游（51.la OpenAPI）鉴权失效，需联系 51.la 客服完成鉴权。');
      console.log('');
      out.hotStale = true;
      out.hotStaleReason = hot.note;
    } else if (hot.fromCache) {
      console.log('ℹ️ 使用本地缓存（5 分钟内有效）；加 --no-cache 可强制刷新。');
      console.log('');
    }
  } else {
    hotErr = hot.error;
    out.hotStale = true;
    out.hotStaleReason = hotErr;
  }

  // 覆盖率：51.la 只返回「有访问量」的页面，所以覆盖数 < 全站篇数是必然的。
  // 这件事必须显式说出来 —— 否则「没数据」会被误读成「没人看」。
  const sitePosts = countSitePosts();
  if (!hotErr && sitePosts) {
    const cov = hotMerged.filter((x) => x.abbr).length;
    const pct = Math.round((cov / sitePosts) * 100);
    console.log('【PV 覆盖】' + cov + ' / ' + sitePosts + ' 篇（' + pct + '%）｜ 窗口 ' + DAYS + ' 天' +
      '（未覆盖的 ' + (sitePosts - cov) + ' 篇 = 零访问，不参与流量判断）');
    console.log('');
    out.coverage = { covered: cov, total: sitePosts, pct, days: DAYS };
  }

  if (CHECK) {
    if (hotErr) {
      console.log('【单篇流量核对】查询：' + CHECK);
      console.log('  ⚠️ 取数失败：' + hotErr);
    } else {
      printCheck(CHECK, hotMerged);
    }
    console.log('');
    out.hot = hotRaw;
    out.hotMerged = hotMerged;
    writeJson(out);
    if (hotErr) process.exitCode = 1;
    return;
  }

  if (ONLY_HOT) {
    if (hotErr) {
      console.log('【热门文章】⚠️ 取数失败：' + hotErr);
    } else {
      printHot((RAW ? hotRaw : hotMerged).slice(0, HOT_LIMIT), !RAW);
    }
    console.log('');
    out.hot = hotRaw;
    writeJson(out);
    return;
  }

  const ov = fetchOverview();
  printOverview(ov);
  console.log('');

  if (hotErr) {
    console.log('【热门文章 · 近 90 天】⚠️ 取数失败：' + hotErr);
  } else {
    printHot((RAW ? hotRaw : hotMerged).slice(0, 10), !RAW);
  }
  console.log('');

  const map = fetchMap();
  if (map.ok) {
    printMap(map.data);
  } else {
    console.log('【访客地域 · 近 3 天】⚠️ 取数失败：' + map.error);
  }
  console.log('');

  out.overview = ov.ok ? { source: ov.source, ...ov.data } : { error: ov.error };
  out.hot = hotRaw;
  out.hotMerged = hotMerged;
  out.visitorMap = map.ok ? map.data : { error: map.error };
  writeJson(out);

  // 退出码：核心数据（热榜）拿不到才判失败——概览失败通常只是 worker 版本旧
  if (hotErr) {
    console.log('⚠️ 核心数据（热榜）取数失败，退出码 1。');
    process.exitCode = 1;
  }
}

function writeJson(out) {
  if (!JSON_OUT) return;
  const p = path.resolve(JSON_OUT);
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(out, null, 2));
    console.log('✅ 原始数据已落盘：' + p);
  } catch (e) {
    console.log('⚠️ JSON 落盘失败：' + e.message);
  }
}

module.exports = { mergeByAbbr, mergeKey, abbrFromUrl, curlJson, DEFAULT_PROXY };

if (require.main === module) {
  main();
}
