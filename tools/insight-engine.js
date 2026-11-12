#!/usr/bin/env node
/**
 * tools/insight-engine.js —— 学习层：把「流量数据」变成「下一步动作」
 * ------------------------------------------------------------------
 * 这条闭环此前是断的：复盘能出 PV，但 PV 不会变成判断，判断仍靠人脑补。
 * 这个工具补上最后一跳 ——
 *
 *   PV/UV(51.la) + 发布时间 + 入链数 + 栏目定位
 *        ↓  规则化诊断（不是黑箱打分，规则见 RULES 常量）
 *   每篇一个动作：换标题 / 提排名 / 翻新 / 扩长尾 / 低优先 / 观察 / 待摸底
 *
 * 三条硬规矩：
 *   1. 「无数据」与「0 PV」严格区分 —— 缓存里没有 ≠ 没人看，不许混为一谈。
 *   2. 只读 + 落盘。绝不改文章、不构建、不部署。
 *   3. 结论必须能反推：每条建议都带触发它的具体数字。
 *
 * ⚠️ 已废弃 ORPHAN（补内链）动作 —— 2026-09-23
 *   旧版用「md 源文互链数 = 0」推断「这篇可能压根没被爬到」，进而建议补 2–3 条站内链。
 *   这个前提是错的：主题自带三层服务端渲染内链（正文 ilink + 上下篇 + 「喜欢这篇文章的人也看了」），
 *   另有 190 个列表入口页（首页分页/归档/历年归档/56 标签页/6 分类页）。
 *   实测模拟爬虫：每篇文章平均被 8 个列表页链到，137/138 篇可达，单篇 HTML 内另有 12 条指向其他文章。
 *   ⇒ 站内可爬性本就是 100%，「零 md 互链」不构成任何证据，据此产出的 80 条动作全为空动作。
 *   现在这类文章统一归入 UNKNOWN（诚实的「不知道」），不再伪装成可执行建议。
 *
 * 用法：
 *   node tools/insight-engine.js
 *   node tools/insight-engine.js --top=30            # 表现榜条数
 *   node tools/insight-engine.js --json <path>
 *   node tools/insight-engine.js --quiet             # 只落盘
 * 退出码：0 正常；1 致命错误（如找不到文章目录）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { buildProfile, COLUMN_PILLAR } = require('./positioning-profile');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'source', '_posts');
const TMP = path.resolve(ROOT, '..', '.tmp');
// ⚠️ 这里必须与 fetch-stats.js 的权威缓存一致。
//    踩过的坑：fetch-stats 写 hot-with404.json，而这里读 hot.json（另一个更旧的文件），
//    导致学习层长期拿着 20 条旧缓存算覆盖率，把「PV 覆盖 55 篇」误报成「11 篇」，
//    进而让「数据太薄」这个结论本身失真。现在两处都取「最新的一份」。
const HOT_FILES = [
  path.join(TMP, 'stats-state', 'hot.json'),
  path.join(TMP, 'stats-state', 'hot-with404.json'),
];
const OUT_DIR = path.join(TMP, 'insight');
// 搜索意图数据（可选）：由 tools/import-gsc.js 从 GSC 导出 CSV 导入。
// 有它 → 能回答「搜索给了多少机会、为什么没人点」；没它 → 相关动作自动跳过，不算失败。
const GSC_PAGES = path.join(TMP, 'gsc', 'pages.json');
const GSC_QUERIES = path.join(TMP, 'gsc', 'queries.json');

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
const TOP = parseInt(getArg('--top', '20'), 10);
const QUIET = has('--quiet');
const JSON_OUT = getArg('--json', '');

// ---------------- 阈值（要调就调这里）----------------
const HIGH_PV = 100;   // 高流量线
const MID_PV = 20;     // 中流量线
const OLD_DAYS = 90;   // 「老文」线：超过则翻新收益更大
const LOW_CTR_IMPR = 50;    // 判断「点击率不行」所需的最低展现量
const LOW_CTR_RATE = 0.02;  // 点击率低于 2% = 有展现没人点
const RANK_IMPR = 50;       // 判断「排名太靠后」所需的最低展现量
const RANK_POS = 12;        // 平均排名差于第 12 名 = 够不到首页

const RULES = {
  REFRESH: { label: '翻新', desc: '高流量老文 → 补 FAQ / GEO 定义块 / 更新数据，性价比最高' },
  EXPAND: { label: '扩长尾', desc: '支柱栏目 + 流量已验证 → 展开成矩阵，做厚这个方向' },
  LOWCTR: { label: '换标题', desc: '有展现但没人点（点击率<2%）→ 改标题与描述，别动内容' },
  RANKUP: { label: '提排名', desc: '有展现但排名在 12 名外 → 补内容深度/内链，把它推上首页' },
  ORPHAN: { label: '补内链', desc: '【已废弃】零 md 互链 ≠ 没被爬到；站内可爬性实测 100%，不再产出该动作' },
  RETITLE: { label: '换标题', desc: '支柱栏目但流量低 → 换标题措辞 / 换关键词，别换主题' },
  DEPRIORITIZE: { label: '低优先', desc: '非支柱栏目 + 流量低 → 不必再投入' },
  WATCH: { label: '观察', desc: '已有流量但未到高线 → 保持观察' },
  UNKNOWN: { label: '待摸底', desc: '既无 PV 也无搜索数据 → 表现未知（≠ 没被爬到）；等搜索引擎数据接通后自动分流' },
  OK: { label: '正常', desc: '表现正常' },
};

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function cleanTitle(t) {
  return String(t || '').replace(/\s*[|｜]\s*(孟凡宇|Lifeline|LifelineVerve).*$/i, '').trim();
}

// ---------------- 读 PV（51.la 缓存）----------------
function loadPv() {
  // ★ 新鲜度守卫：数据过期就先补拉一次，别拿旧快照出建议。
  //   踩过的坑（2026-10-03）：insight 停在 9 天前，据此建议「翻新 cd7681cc」，
  //   而那篇早已改造完。根因不是取不到数据，是没有入口会主动补。
  //   --no-fetch 可关闭（离线跑）；补拉失败不阻断，仍走下面的过期横幅。
  if (!argv.includes('--no-fetch')) {
    try {
      const guard = require('./ensure-fresh-pv').ensureFreshPv({ quiet: true });
      if (guard.refreshed && !argv.includes('--quiet')) {
        process.stderr.write('[insight] PV 已自动补新：' + guard.msg + '\n');
      } else if (!guard.ok && !argv.includes('--quiet')) {
        process.stderr.write('[insight] ⚠️ ' + guard.msg + '\n');
      }
    } catch (e) {
      if (!argv.includes('--quiet')) {
        process.stderr.write('[insight] ⚠️ 新鲜度守卫异常，沿用当前缓存：' + String(e.message) + '\n');
      }
    }
  }
  // 取「最新的那一份」缓存（主文件 + 历史别名）
  let best = null;
  let bestFile = null;
  for (const f of HOT_FILES) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (!Array.isArray(j.list)) continue;
      if (!best || (j.t || 0) > (best.t || 0)) { best = j; bestFile = f; }
    } catch (e) { /* 该文件不存在 */ }
  }
  if (!best) return { map: {}, at: null, count: 0, file: null };
  const d = best;
  const map = {};
  for (const it of d.list || []) {
    // 优先从 key 提取 abbrlink；hot.json 新结构 item 无 key 字段时，从 url 兜底提取（与 scanInbound 口径一致）
    let m = String(it.key || '').match(/^post:([0-9a-z]+)$/i);
    if (!m) m = String(it.url || '').match(/\/posts\/([0-9a-z]{4,12})\b/i);
    if (!m) continue;
    const abbr = m[1].toLowerCase();
    map[abbr] = {
      pv: it.pv || 0,
      uv: it.uv || 0,
      title: cleanTitle(it.title),
      url: String(it.url || '').split('#')[0],
    };
  }
  return { map, at: d.t || null, count: Object.keys(map).length, file: path.basename(bestFile || '') };
}

/** 取 categories 的第一个值，兼容 `[A, B]` / 块状 `- A` / 单值三种写法 */
function firstCategory(fm) {
  const lines = fm.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const km = lines[i].match(/^categories\s*:(.*)$/);
    if (!km) continue;
    const inline = km[1].trim();
    if (inline.startsWith('[')) {
      const v = inline.replace(/[[\]]/g, ' ').split(',')[0].trim().replace(/^['"]|['"]$/g, '');
      return v || '(无栏目)';
    }
    if (inline) return inline.replace(/^['"]|['"]$/g, '') || '(无栏目)';
    for (let j = i + 1; j < lines.length; j++) {
      const m2 = lines[j].match(/^\s+-\s+(.+)$/);
      if (m2) return m2[1].trim().replace(/^['"]|['"]$/g, '');
      if (lines[j].trim() && !/^\s/.test(lines[j])) break;
    }
  }
  return '(无栏目)';
}

// 这些文件不是文章，统计时要排除（与 positioning-profile 口径一致）
const EXCLUDE = new Set(['个人博客文章标签使用规范.md']);

// ---------------- 读文章（标题/日期/栏目/正文）----------------
function readPosts() {
  const files = fs.existsSync(POSTS_DIR)
    ? fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md') && !EXCLUDE.has(f))
    : [];
  const out = [];
  for (const f of files) {
    const raw = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8');
    const m = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!m) continue;
    const fm = m[1];
    const body = raw.slice(m[0].length);
    const one = (key) => {
      const km = fm.match(new RegExp('^' + key + '\\s*:\\s*(.+)$', 'm'));
      return km ? km[1].trim().replace(/^['"]|['"]$/g, '') : '';
    };
    const abbr = one('abbrlink').toLowerCase();
    if (!abbr || !/^[0-9a-z]+$/.test(abbr)) continue;
    const dateStr = one('date');
    let ts = NaN;
    if (dateStr) {
      const norm = dateStr.replace(/\//g, '-').replace(' ', 'T');
      ts = new Date(norm).getTime();
    }
    out.push({
      file: f,
      abbr,
      title: one('title'),
      date: dateStr,
      ts: isNaN(ts) ? null : ts,
      col: firstCategory(fm),
      body,
    });
  }
  return out;
}

// ---------------- 站内入链统计（只认 /posts/<已知abbr>/）----------------
function scanInbound(posts) {
  const known = new Set(posts.map((p) => p.abbr));
  const inbound = {};
  const sources = {};
  for (const p of posts) inbound[p.abbr] = 0;
  for (const p of posts) {
    const seen = new Set();
    const re = /\/posts\/([0-9a-z]{4,12})\b/gi;
    let m;
    while ((m = re.exec(p.body))) {
      const to = m[1].toLowerCase();
      if (!known.has(to) || to === p.abbr || seen.has(to)) continue;
      seen.add(to);
      inbound[to] = (inbound[to] || 0) + 1;
      (sources[to] = sources[to] || []).push(p.abbr);
    }
  }
  return { inbound, sources };
}

/**
 * 搜索表现（GSC 导入的数据）。
 * 按页面 URL 里的 abbrlink 归到文章上；同时保留查询词维度供选题用。
 * 没导入过就返回空态 —— 相关动作自动消失，不代表任何文章有问题。
 */
function abbrFromUrl(url) {
  const m = decodeURIComponent(String(url || '')).match(/\/posts\/([0-9a-zA-Z]{4,12})(?:\/|$|\?|#)/);
  return m ? m[1].toLowerCase() : null;
}

function loadGsc() {
  const empty = { ok: false, map: {}, queries: [], at: null, days: null, totals: null };
  let d;
  try {
    d = JSON.parse(fs.readFileSync(GSC_PAGES, 'utf8'));
  } catch (e) {
    return empty; // 没导入过：正常状态，不是错误
  }
  const map = {};
  for (const r of d.rows || []) {
    const abbr = abbrFromUrl(r.key);
    if (!abbr) continue;
    const cur = map[abbr] || { clicks: 0, impressions: 0, ctr: 0, position: null, _w: 0 };
    cur.clicks += r.clicks || 0;
    cur.impressions += r.impressions || 0;
    if (r.position != null && r.impressions) cur._w += r.position * r.impressions;
    map[abbr] = cur;
  }
  for (const k of Object.keys(map)) {
    const m = map[k];
    m.ctr = m.impressions ? m.clicks / m.impressions : 0;
    m.position = m._w && m.impressions ? +(m._w / m.impressions).toFixed(1) : null;
    delete m._w;
  }
  let queries = [];
  try {
    const q = JSON.parse(fs.readFileSync(GSC_QUERIES, 'utf8'));
    queries = q.rows || [];
  } catch (e) { /* 允许只导入了页面维度 */ }
  return {
    ok: true,
    map,
    queries,
    at: d.generatedAt || null,
    days: d.days || null,
    totals: {
      count: Object.keys(map).length,
      clicks: Object.values(map).reduce((a, x) => a + x.clicks, 0),
      impressions: Object.values(map).reduce((a, x) => a + x.impressions, 0),
    },
  };
}

// ---------------- 诊断 ----------------
function diagnose(x) {
  // 顺序即优先级，不能乱：
  //   有 GSC 数据时，「Google 给了展现」比「站内自己的 PV」更说明问题 ——
  //   因为它告诉你“人搜到了你，但没点，或者排得太后”。
  //   旧版把 PV 分支放前面，结果 RANKUP 永远被 RETITLE 抢走 → 改成现在这个顺序。
  if (x.gscKnown) {
    // ① 有展现但点击率极低：Google 已在给曝光，先把点击拿到手（改标题/描述，不动正文）
    if (x.impressions >= LOW_CTR_IMPR && x.ctr < LOW_CTR_RATE) return 'LOWCTR';
    // ② 有展现但排名在 12 名外：收录了但够不到首页 → 补深度/内链推上去
    //    （已高流量的文章不走这条，它们走翻新/观察）
    if (x.impressions >= RANK_IMPR && x.position != null && x.position > RANK_POS &&
        !(x.pvKnown && x.pv >= HIGH_PV)) return 'RANKUP';
  }
  if (x.pvKnown) {
    if (x.pv >= HIGH_PV && x.ageDays !== null && x.ageDays >= OLD_DAYS) return 'REFRESH';
    if (x.pv >= MID_PV && x.pillar) return 'EXPAND';
    if (x.pv >= MID_PV) return 'WATCH';
    if (x.pillar) return 'RETITLE';
    return 'DEPRIORITIZE';
  }
  // 既无 PV、也无搜索数据 —— 表现未知。
  // ⚠️ 这里绝不能再拿「零 md 互链」当作「没被爬到」的证据：站内可爬性实测 100%
  //    （主题三层服务端内链 + 190 个列表入口页），见文件头废弃说明。
  //    诚实地返回 UNKNOWN，而不是给一条「去补内链」的空动作。
  return 'UNKNOWN';
}

// ---------------- 主流程 ----------------
function main() {
  if (!fs.existsSync(POSTS_DIR)) {
    console.error('找不到文章目录：' + POSTS_DIR);
    process.exit(1);
  }
  const prof = buildProfile();
  const posts = readPosts();
  const { inbound, sources } = scanInbound(posts);
  const pvState = loadPv();
  const gsc = loadGsc();
  const now = Date.now();

  const rows = posts.map((p) => {
    const rec = pvState.map[p.abbr] || null;
    const s = gsc.map[p.abbr] || null;
    const ageDays = p.ts ? Math.floor((now - p.ts) / 86400000) : null;
    const col = p.col;
    const x = {
      abbr: p.abbr,
      title: p.title || (rec && rec.title) || '(无标题)',
      col,
      pillar: COLUMN_PILLAR[col] || null,
      date: p.date,
      ageDays,
      pv: rec ? rec.pv : null,
      uv: rec ? rec.uv : null,
      pvKnown: !!rec,
      gscKnown: !!s,
      clicks: s ? s.clicks : null,
      impressions: s ? s.impressions : null,
      ctr: s ? s.ctr : null,
      position: s ? s.position : null,
      inbound: inbound[p.abbr] || 0,
      linkedFrom: (sources[p.abbr] || []).slice(0, 5),
    };
    x.action = diagnose(x);
    return x;
  });

  // 汇总
  const byAction = {};
  for (const r of rows) byAction[r.action] = (byAction[r.action] || 0) + 1;

  const pvRows = rows.filter((r) => r.pvKnown).sort((a, b) => b.pv - a.pv);
  const actionable = ['LOWCTR', 'RANKUP', 'REFRESH', 'EXPAND', 'RETITLE'];

  const L = [];
  L.push('# 学习层诊断 · ' + today());
  L.push('');
  // ★ 数据新鲜度横幅：PV 缓存过期时必须在最显眼处说清楚 ——
  //   否则「翻新 1 篇 / 换标题 15 篇」这些结论看起来像刚算出来的。
  //   实测踩过：pv 数据比结论旧 18 小时，报告里只在末尾一行小字提到时间。
  const PV_STALE_H = 6;
  const pvAgeH = pvState.at ? (Date.now() - pvState.at) / 3600000 : null;
  if (pvAgeH != null && pvAgeH >= PV_STALE_H) {
    L.push('> ## ⚠️ PV 数据已过期 ' + pvAgeH.toFixed(1) + ' 小时 —— 下面的流量结论基于旧快照');
    L.push('>');
    L.push('> 缓存形成于 **' + new Date(pvState.at).toLocaleString('zh-CN') + '**，不是最新数据。');
    L.push('> 常见原因：统计代理上游（51.la OpenAPI）鉴权失效，fetch-stats 已降级用旧缓存兜底。');
    L.push('> 处置：联系 51.la 客服完成 API 鉴权 → 重跑 `node tools/fetch-stats.js --no-cache`。');
    L.push('> 在此之前，**PV 相关动作只作参考**；发布时间 / 入链 / 栏目维度不受影响。');
    L.push('');
  }
  const covPct = rows.length ? Math.round((pvState.count / rows.length) * 100) : 0;
  L.push('> 输入：PV 缓存 ' + (pvState.at ? new Date(pvState.at).toLocaleString('zh-CN') : '无') +
    (pvState.file ? '（`' + pvState.file + '`）' : '') +
    ' → 覆盖 **' + pvState.count + ' / ' + rows.length + '** 篇（' + covPct + '%）｜ 入链扫描全站');
  L.push('> 搜索表现：' + (gsc.ok
    ? '**已导入**（' + (gsc.days || '?') + ' 天窗口 ｜ ' + gsc.totals.count + ' 个页面有展现 ｜ 共 ' +
      gsc.totals.impressions + ' 展现 / ' + gsc.totals.clicks + ' 点击）'
    : '**未导入** → 跑 `node tools/import-gsc.js` 补上「为什么没人点」'));
  L.push('> 阈值：高流量 ' + HIGH_PV + ' PV ｜ 中流量 ' + MID_PV + ' PV ｜ 老文 ' + OLD_DAYS + ' 天 ｜ 低点击率 <' +
    (LOW_CTR_RATE * 100) + '%（展现 ≥' + LOW_CTR_IMPR + '）｜ 排名线 ' + RANK_POS + ' 名');
  L.push('> ⚠️ 覆盖率低 ≠ 文章没人看：51.la 只返回「有访问量」的页面，未覆盖部分为真零访问。');
  L.push('');
  L.push('## 一、动作分布');
  L.push('');
  L.push('| 动作 | 篇数 | 含义 |');
  L.push('|---|---|---|');
  for (const k of ['LOWCTR', 'RANKUP', 'REFRESH', 'EXPAND', 'ORPHAN', 'RETITLE', 'WATCH', 'DEPRIORITIZE', 'UNKNOWN']) {
    if (!byAction[k]) continue;
    L.push('| **' + RULES[k].label + '** | ' + byAction[k] + ' | ' + RULES[k].desc + ' |');
  }
  L.push('');

  L.push('## 二、最该动手的（按动作优先级）');
  L.push('');
  for (const act of actionable) {
    const list = rows.filter((r) => r.action === act);
    if (!list.length) continue;
    // 支柱栏目优先（该补的），其次有流量的、再其次入链多的
    list.sort((a, b) => (Number(!!b.pillar) - Number(!!a.pillar)) || (b.pv || 0) - (a.pv || 0) || (b.inbound - a.inbound));
    const withGsc = list.some((r) => r.gscKnown);
    L.push('### ' + RULES[act].label + '（' + list.length + ' 篇）—— ' + RULES[act].desc);
    L.push('');
    L.push('| abbrlink | 标题 | 栏目 | PV | 入链 | 发布 |' + (withGsc ? ' 展现 | 点击率 | 排名 |' : ''));
    L.push('|---|---|---|---|---|---|' + (withGsc ? '---|---|---|' : ''));
    for (const r of list.slice(0, 12)) {
      L.push('| `' + r.abbr + '` | ' + String(r.title).replace(/\|/g, '\\|').slice(0, 42) + ' | ' + r.col +
        ' | ' + (r.pvKnown ? r.pv : '—') + ' | ' + r.inbound + ' | ' + (r.date || '—').slice(0, 10) +
        (withGsc ? ' | ' + (r.impressions == null ? '—' : r.impressions) + ' | ' +
          (r.ctr == null ? '—' : (r.ctr * 100).toFixed(1) + '%') + ' | ' + (r.position == null ? '—' : r.position) + ' |' : ''));
    }
    if (list.length > 12) L.push('| … | 另有 ' + (list.length - 12) + ' 篇 | | | | |' + (withGsc ? ' | | |' : ''));
    L.push('');
  }

  L.push('## 三、流量表现榜（有多少数据看多少）');
  L.push('');
  if (!pvRows.length) {
    L.push('（PV 缓存为空 —— 先跑 `node tools/fetch-stats.js` 取数；本机走自建代理 stats.mfyresume.dpdns.org）');
  } else {
    L.push('| # | 标题 | PV | UV | 栏目 | 动作 |');
    L.push('|---|---|---|---|---|---|');
    pvRows.slice(0, TOP).forEach((r, i) => {
      L.push('| ' + (i + 1) + ' | ' + String(r.title).replace(/\|/g, '\\|').slice(0, 40) + ' | ' + r.pv + ' | ' + r.uv +
        ' | ' + r.col + ' | ' + RULES[r.action].label + ' |');
    });
    L.push('');
  }

  if (gsc.ok && gsc.queries.length) {
    L.push('## 四、搜索查询词（人们到底在搜什么）');
    L.push('');
    L.push('| 查询词 | 展现 | 点击 | 点击率 | 平均排名 |');
    L.push('|---|---|---|---|---|');
    gsc.queries.slice(0, 20).forEach((q) => {
      L.push('| ' + String(q.key).replace(/\\|/g, '\\\\|').slice(0, 44) + ' | ' + q.impressions + ' | ' + q.clicks +
        ' | ' + (q.ctr * 100).toFixed(1) + '% | ' + (q.position == null ? '—' : q.position) + ' |');
    });
    L.push('');
    const noPage = gsc.queries.filter((q) => q.impressions >= 30 && q.ctr < 0.03);
    if (noPage.length) {
      L.push('💡 下面这些词有展现但点击率很低（<3%）—— 可能站内**没有真正对口的页面**，属高意图新选题：');
      L.push('');
      noPage.slice(0, 12).forEach((q) => L.push('- `' + q.key + '`（展现 ' + q.impressions + '，点击率 ' + (q.ctr * 100).toFixed(1) + '%）'));
      L.push('');
    }
  }

  L.push('## ' + (gsc.ok ? '五' : '四') + '、读法');
  L.push('');
  L.push('- **换标题（低点击率）** = Google 已在给曝光，改标题/描述即可，最低成本。**别动正文。**');
  L.push('- **提排名** = 已收录但排在 12 名外；补内容深度 + 加内链，把它推上首页。');
  L.push('- **翻新** ≠ 重写。只补 front-matter `faq:`、GEO 定义块、更新过期数据，保 URL 不变。');
  L.push('- **扩长尾** = 把已验证的主题交给 `matrix-planner.js` 展开成矩阵。');
  L.push('- **待摸底** = 既没 PV 也没搜索数据。**不是**「没被爬到」——站内可爬性实测 100%，' +
    '真正缺的是搜索引擎收录数据；等 GSC / 百度数据接通后这类会自动分流到具体动作。');
  L.push('- `link-architect.js` 只用来**查死链**（退出码 1 = 隐形 404），不用它批量补内链（主题已自带三层内链）。');
  L.push('- 「—」表示该篇不在 PV 缓存覆盖范围内，**不代表零流量**。');
  L.push('');

  const text = L.join('\n');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const mdFile = path.join(OUT_DIR, 'insight-' + today() + '.md');
  fs.writeFileSync(mdFile, text, 'utf8');

  const jsonFile = JSON_OUT || path.join(OUT_DIR, 'insight.json');
  fs.mkdirSync(path.dirname(jsonFile), { recursive: true });
  fs.writeFileSync(jsonFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    pvCoverage: pvState.count,
    pvAt: pvState.at,
    pvFile: pvState.file,
    pvAgeHours: pvAgeH == null ? null : Number(pvAgeH.toFixed(1)),
    pvStale: pvAgeH != null && pvAgeH >= PV_STALE_H,
    gsc: gsc.ok ? { at: gsc.at, days: gsc.days, totals: gsc.totals, queries: gsc.queries.slice(0, 50) } : null,
    total: rows.length,
    thresholds: { HIGH_PV, MID_PV, OLD_DAYS, LOW_CTR_IMPR, LOW_CTR_RATE, RANK_IMPR, RANK_POS },
    byAction,
    rules: RULES,
    rows: rows.sort((a, b) => (b.pv || -1) - (a.pv || -1)),
  }, null, 2), 'utf8');

  if (!QUIET) console.log(text);
  console.log('\n✅ 学习层已落盘：' + mdFile);
  if (pvAgeH != null && pvAgeH >= PV_STALE_H) {
    console.log('⚠️ PV 数据已过期 ' + pvAgeH.toFixed(1) + ' 小时（缓存于 ' +
      new Date(pvState.at).toLocaleString('zh-CN') + '）—— 流量类动作只作参考。');
  }
  console.log('   JSON：' + jsonFile + '（' + rows.length + ' 篇 ｜ PV 覆盖 ' + pvState.count + ' 篇' +
    (gsc.ok ? ' ｜ 搜索已导入 ' + gsc.totals.count + ' 页' : ' ｜ 搜索未导入') + '）');
}

if (require.main === module) main();

module.exports = { diagnose, readPosts, scanInbound, loadPv, RULES };
