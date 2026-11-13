#!/usr/bin/env node
/**
 * tools/dashboard.js —— 本地可视化面板（把整条闭环的状态摊在一页上）
 * ------------------------------------------------------------------
 * 「看不见流程」是这套引擎最大的隐性成本：工具都在跑，但你不知道
 * 它们各自什么状态、哪一环卡住、下一步该动哪篇。
 *
 * 这个工具把所有**已落盘的真实数据**聚合进一个单文件 HTML：
 *   站内画像 + 学习层诊断 + 选题池 + 结构健康 + 缺口待办 + 闭环状态灯
 *
 * 特点：
 *   - 单文件、零服务：生成后用浏览器直接打开（file:// 即可）
 *   - 数据全内嵌，断网也能看（只有图表库走 CDN）
 *   - 不联网、不改文章、不构建、不部署
 *
 * 用法：
 *   node tools/dashboard.js                 # 生成面板
 *   node tools/dashboard.js --out <path>
 *   node tools/dashboard.js --no-gates      # 跳过闸门快检（更快）
 *   node tools/dashboard.js --open          # 生成后尝试用默认浏览器打开
 * 退出码：0 正常
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { buildProfile, COLUMN_PILLAR, PILLAR_COLUMNS } = require('./positioning-profile');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.resolve(ROOT, '..', '.tmp');
const OUT_DEFAULT = path.join(TMP, 'dashboard', 'index.html');

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
const OUT = getArg('--out', OUT_DEFAULT);
const NO_GATES = has('--no-gates');

function readJson(p, dft) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return dft; }
}

// ---------------- 聚合数据 ----------------
function collect() {
  const prof = buildProfile();

  // 学习层
  const insight = readJson(path.join(TMP, 'insight', 'insight.json'), null);
  // 选题：站内缺口（现算，快）
  let gaps = [];
  try {
    const { buildGaps, readCorpus } = require('./topic-radar');
    gaps = buildGaps(readCorpus());
  } catch (e) { gaps = []; }
  // 选题：站外候选（读最近一次采集）
  const all = readJson(path.join(TMP, 'topic-radar', 'sources-all.json'), { items: [] });
  const fresh = readJson(path.join(TMP, 'topic-radar', 'sources-new.json'), { items: [] });
  const outsideAt = (fresh.generatedAt || all.generatedAt || null);
  const outside = (fresh.items && fresh.items.length ? fresh.items : all.items || [])
    .filter((x) => x.decision === 'KEEP' || x.decision === 'REVIEW');

  // 结构健康（用学习层里的统计）
  const rows = (insight && insight.rows) || [];
  // ⚠️ 2026-09-23：「零入链」指标已废弃 —— 它只数 md 源文之间的互链，而站内可爬性实测 100%
  //    （主题自带三层服务端内链 + 190 个列表入口页）。拿它当健康度会长期误报「百余篇有问题」。
  //    改为「待摸底」= 既无 PV 也无搜索数据、表现未知的篇数，语义诚实。
  const unknownCount = (insight && insight.byAction && insight.byAction.UNKNOWN) || 0;
  const totalLinks = rows.reduce((a, r) => a + (r.inbound || 0), 0);
  const pvKnown = rows.filter((r) => r.pvKnown).length;

  // 需求层（tools/search-demand.js 落盘）：有多少「有人搜、站内却没有」的词。
  // 这是「做流量」最该看的数字 —— 它直接回答「还差多少篇能接住搜索需求」。
  const demand = readJson(path.join(TMP, 'demand', 'demand.json'), null);
  const demandGap = (demand && demand.gapCount) || 0;
  const demandWords = (demand && demand.wordCount) || 0;
  const demandEngines = (demand && demand.engines) || [];

  // 发布节奏（按月）
  const byMonth = {};
  for (const r of rows) {
    const m = String(r.date || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(m)) byMonth[m] = (byMonth[m] || 0) + 1;
  }
  const months = Object.keys(byMonth).sort().slice(-18);

  // 闸门快检
  let gates = [];
  if (!NO_GATES) {
    const run = (label, file, args) => {
      try {
        const out = execFileSync(process.execPath, [path.join(__dirname, file), ...args], {
          encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT,
        });
        const tail = out.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || '';
        return { label, ok: true, note: tail.slice(0, 120) };
      } catch (e) {
        const out = (e.stdout || '') + (e.stderr || '');
        const tail = String(out).trim().split(/\r?\n/).filter(Boolean).slice(-2).join(' / ');
        return { label, ok: false, note: tail.slice(0, 160) || 'exit ' + (e.status || '?') };
      }
    };
    gates.push(run('标签体系', 'check-tags.js', []));
  }

  // 部署状态
  let deploy = { ok: false, note: '未检测' };
  try {
    const head = execFileSync('git', ['-C', path.join(ROOT, '.deploy_git'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const remote = execFileSync('git', ['-C', path.join(ROOT, '.deploy_git'), 'ls-remote', 'origin', 'main'], { encoding: 'utf8' }).trim().split(/\s+/)[0];
    deploy = { ok: head === remote, head: head.slice(0, 8), remote: (remote || '').slice(0, 8) };
  } catch (e) { deploy = { ok: false, note: '无法读取 .deploy_git' }; }

  // 数据新鲜度：面板是快照不是实时，必须让「数据多旧」一眼可见，
  // 否则会拿着三天前的 PV 缓存做今天的决策。
  const statFile = (p) => { try { return fs.statSync(p).mtimeMs; } catch (e) { return null; } };
  const hotCache = readJson(path.join(TMP, 'stats-state', 'hot.json'), null)
    || readJson(path.join(TMP, 'stats-state', 'hot-with404.json'), null);
  // refresh.json 带 pvAt / hotStale：能区分「数据老」和「取数失败被降级」两件事。
  const statJson = readJson(path.join(TMP, 'stats-state', 'refresh.json'), null);
  const radarMd = (() => {
    // 取选题雷达目录里最新的一份报告
    try {
      const dir = path.join(TMP, 'topic-radar');
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
      return files.length ? path.join(dir, files[files.length - 1]) : null;
    } catch (e) { return null; }
  })();
  const sources = [
    {
      name: 'PV 缓存（51.la）',
      at: (statJson && statJson.pvAt) || (hotCache && hotCache.t) || null,
      limitH: 6,   // 曾设 24 小时 —— 于是「18 小时前的旧 PV」被判成「新鲜」，面板显示绿灯。
      // ★ 取数失败被降级时，无论缓存看起来多新都必须判过期：
      //   只比 ageH 会漏掉「刚降级、但缓存恰好还不太老」的窗口。
      forceStale: !!(statJson && statJson.hotStale),
      hint: (statJson && statJson.hotStale)
        ? '实时取数失败（' + (statJson.hotStaleReason || '上游错误') + '），已降级用旧缓存 → 多为 51.la OpenAPI 鉴权失效，需联系 51.la 客服'
        : 'npm run refresh 里的 fetch-stats',
    },
    { name: '学习层诊断', at: insight ? new Date(insight.generatedAt).getTime() : null, limitH: 72, hint: 'node tools/insight-engine.js' },
    { name: '选题雷达', at: statFile(radarMd ? radarMd : ''), limitH: 168, hint: 'node tools/topic-radar.js' },
    { name: '站外采集', at: outsideAt ? new Date(outsideAt).getTime() : null, limitH: 168, hint: 'node tools/topic-radar.js --since=14' },
  ].map((s) => {
    const ageH = s.at ? (Date.now() - s.at) / 3600000 : null;
    return Object.assign({}, s, { ageH, stale: s.forceStale || (ageH == null ? true : ageH > s.limitH) });
  });

  return { prof, insight, rows, gaps, outside, outsideAt, unknownCount, totalLinks, pvKnown, demandGap, demandWords, demandEngines, months, byMonth, gates, deploy, sources, radarMd };
}

// ---------------- 待办（人工维护的闭环缺口）----------------
const TODOS = [
  { p: 'P0', t: '51.la OpenAPI 鉴权失效 → 热榜/访客地域取数全断', d: '接口返回 code 5005「鉴权失败，联系客服协助完成鉴权」。后果：fetch-stats 降级用旧 PV（学习层流量结论基于旧快照）、前端 about 页热榜同样 500。处置：登录 51.la 联系客服完成 API 鉴权 → `node tools/fetch-stats.js --no-cache` 复验' },
  { p: 'P0', t: '仍未接搜索意图数据（GSC）', d: '只有 51.la 的 PV/UV。已备好 CSV 导入通道 → 你在 GSC 导出 Performance 即可补上「为什么没人点」' },
  { p: 'P1', t: '发布后无收录回查', d: 'IndexNow/百度推了，但没回查「到底收没收录」' },
  { p: 'P1', t: '147 条存量外链断链', d: '旧资源清单类文章的停运域名，明细 D:/1/1/.tmp/external-links.json 待逐篇处理' },
  { p: 'P1', t: '百度推送 token 未配', d: '站点已验证，只差 token；补上才能「发布即推送」' },
  { p: 'P2', t: 'PV 覆盖只有约 40%', d: '51.la 只返回有访问量的页面 → 学习层能学的是「头部+中部」，长尾只能靠入链数代理判断（口径限制，非工具问题）' },
  { p: 'P2', t: '竞品站 / 趋势源未建', d: '选题缺竞争视角' },
];
// 近期已修（留痕，方便回溯为什么面板上没有这些项了）
const FIXED = [
  { t: '统计端点国内不可达', d: '已迁自定义域 stats.mfyresume.dpdns.org（+ workers.dev 兜底注释），热榜/访客地图恢复' },
  { t: 'PV 覆盖被低估', d: 'worker 抓取上限 2 页/limit 20 → 8 页/limit 300；覆盖 11 → 55 篇' },
  { t: '学习层读错缓存文件', d: 'insight 读 hot.json、fetch-stats 写 hot-with404.json → 已统一为取最新一份' },
  { t: '数据不回流选题', d: 'topic-radar 新增「存量动作」第一节，翻新/扩长尾/换标题自动进选题表' },
  { t: 'ORPHAN（补内链）误判已废除', d: '旧版拿「零 md 互链」推断「没被爬到」→ 误判（站内可爬性实测 100%）。80 条空动作归零、改判待摸底；面板「零入链」KPI 同步废除' },
];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildHtml(D) {
  const { prof, insight, rows, gaps, outside, outsideAt, unknownCount, totalLinks, pvKnown, demandGap, demandWords, demandEngines, months, byMonth, gates, deploy, sources } = D;
  const pillarPct = Math.round((prof.pillarTotal / prof.total) * 100);
  const byAction = (insight && insight.byAction) || {};
  const rules = (insight && insight.rules) || {};
  // ⚠️ 2026-09-23：ORPHAN（补内链）已废弃，见 insight-engine.js 文件头说明。
  const ACTIONABLE = ['LOWCTR', 'RANKUP', 'REFRESH', 'EXPAND', 'RETITLE'];
  const actionCount = rows.filter((r) => ACTIONABLE.includes(r.action)).length;
  // 按动作分级取样：不让单一动作的大基数把其它动作挤出视野
  const PER_ACTION = { LOWCTR: 6, RANKUP: 6, REFRESH: 6, EXPAND: 6, RETITLE: 4, UNKNOWN: 0 };
  const actionable = [];
  for (const act of ACTIONABLE) {
    const list = rows.filter((r) => r.action === act)
      .sort((a, b) => (Number(!!b.pillar) - Number(!!a.pillar)) || (b.pv || 0) - (a.pv || 0) || (b.inbound - a.inbound));
    actionable.push(...list.slice(0, PER_ACTION[act]));
  }

  const colBar = {
    labels: Object.keys(prof.columns).filter((k) => prof.columns[k] > 0),
    values: Object.keys(prof.columns).filter((k) => prof.columns[k] > 0).map((k) => prof.columns[k]),
  };
  const pillarDonut = Object.entries(prof.pillars).map(([k, v]) => ({ name: k, value: v }));
  pillarDonut.push({ name: '非支柱栏目', value: prof.total - prof.pillarTotal });

  const gapCards = gaps.slice(0, 6).map((g) => {
    const words = g.words.filter((w) => w.docs <= 2).slice(0, 10);
    return {
      col: g.column, pillar: g.isPillar,
      words: words.map((w) => w.word + (w.docs ? '(' + w.docs + ')' : '')),
    };
  });

  const DATA = {
    colBar, pillarDonut, months, byMonth,
    stats: { total: prof.total, pillarPct, pillarTotal: prof.pillarTotal, unknownCount, totalLinks, pvKnown },
  };

  // 闭环段（状态灯：ok=自动跑通 / warn=需人工 / stop=缺或必停）
  const loop = [
    { n: '站外源', s: 'ok', d: '12 个 RSS 已接' },
    { n: '定位筛选', s: 'ok', d: '支柱 +3 / off-brand DROP' },
    { n: '矩阵规划', s: 'ok', d: 'P→C→L 工单' },
    { n: '成稿', s: 'warn', d: '需人工把关事实' },
    { n: '校验·构建', s: 'ok', d: '四道闸门' },
    { n: '部署', s: 'stop', d: '必停等你批准' },
    {
      n: '复盘',
      // GSC 已入 ≠ 复盘可信：PV 数据过期时同样是 warn —— 否则这颗灯会在
      // 「搜索数据齐了、但 PV 是昨天的」的情况下显示绿灯，掩盖真实缺口。
      s: (insight && insight.gsc && !insight.pvStale) ? 'ok' : 'warn',
      d: (insight && insight.pvStale)
        ? 'PV 数据已过期，流量结论只作参考'
        : ((insight && insight.gsc) ? '展现/点击/查询词已入' : '有 PV，缺查询词'),
    },
    { n: '学习层', s: 'ok', d: 'insight 已建成' },
    { n: '回流选题', s: 'ok', d: 'topic-radar 第一节' },
  ];

  // 数据新鲜度（面板是快照，过期必须显红）
  const freshHtml = sources.map((s) => {
    const ageTxt = s.ageH == null ? '无数据'
      : s.ageH < 1 ? Math.round(s.ageH * 60) + ' 分钟前'
        : s.ageH < 48 ? s.ageH.toFixed(1) + ' 小时前'
          : (s.ageH / 24).toFixed(1) + ' 天前';
    const at = s.at ? new Date(s.at).toLocaleString('zh-CN') : '—';
    return '<div class="gate ' + (s.stale ? 'gbad' : 'gok') + '"><b>' + esc(s.name) + '</b><span>' +
      (s.stale ? '过期' : '新鲜') + '</span><em>' + esc(ageTxt) + ' ｜ ' + esc(at) +
      (s.stale ? ' ｜ 刷新：' + esc(s.hint) : '') + '</em></div>';
  }).join('');

  const fixedHtml = FIXED.map((t) => '<li><b>' + esc(t.t) + '</b> — ' + esc(t.d) + '</li>').join('');

  // 搜索表现（GSC 导入）—— 没导入就显示操作指引，不装作有数据
  const gsc = (insight && insight.gsc) || null;
  const gscQueries = (gsc && gsc.queries) || [];
  const gscPages = rows.filter((r) => r.gscKnown)
    .sort((a, b) => (b.impressions || 0) - (a.impressions || 0));
  const gscTotals = (gsc && gsc.totals) || { clicks: 0, impressions: 0, count: 0 };
  const gscCtr = gscTotals.impressions ? (gscTotals.clicks / gscTotals.impressions) : 0;
  const lowCtrRows = rows.filter((r) => r.action === 'LOWCTR' || r.action === 'RANKUP')
    .sort((a, b) => (b.impressions || 0) - (a.impressions || 0)).slice(0, 8);

  const gscHtml = !gsc
    ? '<div class="card" style="font-size:13px;line-height:1.9">' +
      '<b>还没导入搜索数据</b>——现在只能回答「有没有人看」，' +
      '答不了「为什么没人点」。补上只需一分钟：<br>' +
      '1. 打开 <code>search.google.com/search-console</code> → 选 mfy-lifeline.com → 左侧「效果」<br>' +
      '2. 日期选「最近 28 天」→ 顶部切「查询」标签 → 右上「导出」→ CSV<br>' +
      '3. 再切「网页」标签 → 同样导出一份 CSV<br>' +
      '4. 回来跑：<code>node tools/import-gsc.js --in "&lt;下载目录&gt;"</code><br>' +
      '之后 <code>npm run refresh</code> 刷新，这里就会出现展现/点击/查询词，' +
      '学习层会多出「换标题（低点击率）」与「提排名」两类动作。</div>'
    : '<div class="kpis" style="grid-template-columns:repeat(4,1fr)">' +
      '<div class="kpi"><b>' + gscTotals.impressions.toLocaleString('en-US') + '</b><span>展现量（' + esc(gsc.days || '?') + ' 天）</span></div>' +
      '<div class="kpi"><b>' + gscTotals.clicks.toLocaleString('en-US') + '</b><span>点击量</span></div>' +
      '<div class="kpi hl"><b>' + (gscCtr * 100).toFixed(2) + '%</b><span>点击率</span></div>' +
      '<div class="kpi"><b>' + gscTotals.count + '</b><span>有展现的页面</span></div>' +
      '</div>';

  const gscTables = !gsc
    ? ''
    : '<h3 style="font-size:13.5px;margin:14px 0 8px">有展现但没人点 / 排名够不到首页</h3>' +
      '<table><tr><th style="width:78px">动作</th><th>标题</th><th style="width:66px">展现</th><th style="width:66px">点击率</th><th style="width:60px">排名</th><th style="width:130px">栏目</th></tr>' +
      (lowCtrRows.length
        ? lowCtrRows.map((r) => '<tr><td><span class="pill p-' + r.action + '">' + esc((rules[r.action] || {}).label || r.action) + '</span></td>' +
          '<td class="t">' + esc(String(r.title).slice(0, 46)) + '</td><td class="n">' + r.impressions + '</td>' +
          '<td class="n">' + (r.ctr * 100).toFixed(1) + '%</td><td class="n">' + (r.position == null ? '—' : r.position) + '</td>' +
          '<td>' + esc(r.col) + '</td></tr>').join('')
        : '<tr><td colspan="6" style="color:#64748b">暂无（或展现量还少，不足以判断）</td></tr>') +
      '</table>' +
      (gscQueries.length
        ? '<h3 style="font-size:13.5px;margin:18px 0 8px">人们到底在搜什么（展现最高）</h3>' +
          '<table><tr><th>查询词</th><th style="width:70px">展现</th><th style="width:60px">点击</th><th style="width:70px">点击率</th><th style="width:70px">排名</th></tr>' +
          gscQueries.slice(0, 12).map((q) => '<tr><td class="t">' + esc(String(q.key).slice(0, 52)) + '</td><td class="n">' + q.impressions + '</td>' +
            '<td class="n">' + q.clicks + '</td><td class="n">' + (q.ctr * 100).toFixed(1) + '%</td><td class="n">' + (q.position == null ? '—' : q.position) + '</td></tr>').join('') +
          '</table>'
        : '')

  // ---- 模板用到的 HTML 片段（曾被误删，2026-09-22 重建）----
  const gateHtml = gates.length
    ? gates.map((g) => '<div class="gate ' + (g.ok ? 'gok' : 'gbad') + '"><b>' + esc(g.label) + '</b><span>' + (g.ok ? '通过' : '未通过') + '</span><em>' + esc(g.note) + '</em></div>').join('')
    : '<div class="gate"><b>闸门</b><span>已跳过（--no-gates）</span></div>';

  const actionCards = ['LOWCTR', 'RANKUP', 'REFRESH', 'EXPAND', 'RETITLE', 'WATCH', 'UNKNOWN']
    .filter((k) => byAction[k])
    .map((k) => '<div class="ac"><span class="acl">' + esc((rules[k] || {}).label || k) + '</span><b>' + byAction[k] + '</b></div>')
    .join('');

  const rowsHtml = actionable.map((r) => {
    const label = (rules[r.action] || {}).label || r.action;
    return '<tr><td><span class="pill p-' + r.action + '">' + esc(label) + '</span></td>' +
      '<td class="t">' + esc(String(r.title).slice(0, 46)) + '</td>' +
      '<td>' + esc(r.col) + '</td>' +
      '<td class="n">' + (r.pvKnown ? r.pv : '—') + '</td>' +
      '<td class="n">' + r.inbound + '</td>' +
      '<td class="m">' + esc(String(r.date || '').slice(0, 10)) + '</td></tr>';
  }).join('');

  const outsideHtml = outside.slice(0, 10).map((x, i) =>
    '<tr><td class="n">' + (i + 1) + '</td><td class="t">' + esc(String(x.title).replace(/\s+via\s+@[\w@,\s]+$/i, '').slice(0, 62)) + '</td>' +
    '<td>' + esc(x.bestCol || '待定') + '</td><td class="n">' + (x.score || 0) + '</td><td class="m">' + esc(x.source || '') + '</td></tr>'
  ).join('');

  const todoHtml = TODOS.map((t) => '<tr><td><span class="pill p-' + t.p + '">' + t.p + '</span></td><td><b>' + esc(t.t) + '</b><div class="d">' + esc(t.d) + '</div></td></tr>').join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>博客内容引擎 · 可视化面板</title>
<link rel="icon" href="data:,">
<script src="https://npm.elemecdn.com/echarts@5.4.3/dist/echarts.min.js"></script>
<style>
:root{--bg:#f5f7fb;--card:#fff;--ink:#0f172a;--sub:#5b6b82;--line:#e4e9f2;
--brand:#2563eb;--ok:#16a34a;--warn:#d97706;--stop:#dc2626;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14.5px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif}
.wrap{max-width:1160px;margin:0 auto;padding:26px 20px 60px}
h1{font-size:22px;margin:0 0 4px}
.sub{color:var(--sub);font-size:12.5px;margin-bottom:20px}
h2{font-size:15.5px;margin:32px 0 12px;padding-left:9px;border-left:3px solid var(--brand)}
.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}
@media(max-width:900px){.kpis{grid-template-columns:repeat(3,1fr)}}
@media(max-width:560px){.kpis{grid-template-columns:repeat(2,1fr)}}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.kpi b{display:block;font-size:23px;line-height:1.25;font-variant-numeric:tabular-nums}
.kpi span{font-size:12px;color:var(--sub)}
.kpi.hl b{color:var(--brand)}
.loop{display:grid;grid-template-columns:repeat(9,1fr);gap:8px}
@media(max-width:900px){.loop{grid-template-columns:repeat(3,1fr)}}
.lp{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:10px;position:relative;border-top-width:3px}
.lp.ok{border-top-color:var(--ok)} .lp.warn{border-top-color:var(--warn)} .lp.stop{border-top-color:var(--stop)}
.lp b{font-size:12.5px;display:block}
.lp span{font-size:11px;color:var(--sub);display:block;margin-top:2px;line-height:1.4}
.lp i{position:absolute;top:8px;right:9px;width:7px;height:7px;border-radius:50%}
.lp.ok i{background:var(--ok)} .lp.warn i{background:var(--warn)} .lp.stop i{background:var(--stop)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:820px){.grid2{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:14px 16px}
.card h3{margin:0 0 8px;font-size:13.5px;color:#334155}
.chart{height:250px}
table{width:100%;border-collapse:collapse;font-size:13px;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{padding:8px 11px;text-align:left;border-bottom:1px solid var(--line);vertical-align:middle}
th{background:#f1f5f9;font-size:12px;color:#334155;font-weight:700}
tr:last-child td{border-bottom:none}
td.n{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
td.t{line-height:1.45}
td.m{color:var(--sub);font-size:12px;white-space:nowrap}
td b{display:block}
td .d{font-size:12px;color:var(--sub);margin-top:1px}
.pill{font-size:11px;font-weight:700;border-radius:20px;padding:1px 8px;white-space:nowrap;display:inline-block}
.p-LOWCTR{background:#ede9fe;color:#6d28d9}
.p-RANKUP{background:#cffafe;color:#0e7490}
.p-REFRESH{background:#fee2e2;color:#b91c1c}
.p-EXPAND{background:#dcfce7;color:#15803d}
.p-RETITLE{background:#e0e7ff;color:#3730a3}
.p-WATCH{background:#f1f5f9;color:#475569}
.p-UNKNOWN{background:#f1f5f9;color:#64748b}
.p-P0{background:#fee2e2;color:#b91c1c}
.p-P1{background:#fef3c7;color:#b45309}
.p-P2{background:#f1f5f9;color:#475569}
.acs{display:grid;grid-template-columns:repeat(8,1fr);gap:9px;margin-bottom:12px}
@media(max-width:820px){.acs{grid-template-columns:repeat(3,1fr)}}
.ac{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:10px 12px;text-align:center}
.ac b{display:block;font-size:20px;font-variant-numeric:tabular-nums}
.acl{font-size:11.5px;color:var(--sub)}
.gaps{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
@media(max-width:820px){.gaps{grid-template-columns:1fr}}
.gp{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:11px 13px}
.gp.pillar{border-color:#bfdbfe;background:#f8fbff}
.gp h4{margin:0 0 7px;font-size:12.5px;display:flex;justify-content:space-between;align-items:center}
.gp h4 em{font-style:normal;font-size:10.5px;font-weight:700;background:#dbeafe;color:#1d4ed8;border-radius:5px;padding:0 6px}
.wm{display:inline-block;font-family:var(--mono);font-size:11.5px;background:#0f172a0d;border-radius:5px;padding:1px 6px;margin:2px 3px 0 0;color:#334155}
.gate{display:flex;gap:10px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:11px;padding:9px 13px;margin-bottom:8px}
.gate b{font-size:13px}
.gate span{font-size:11.5px;font-weight:700;border-radius:20px;padding:1px 8px}
.gate em{font-style:normal;font-size:11.5px;color:var(--sub);font-family:var(--mono)}
.gok span{background:#dcfce7;color:#15803d}
.gbad span{background:#fee2e2;color:#b91c1c}
.foot{margin-top:30px;font-size:12px;color:var(--sub);border-top:1px solid var(--line);padding-top:14px;line-height:1.8}
code{font-family:var(--mono);background:#0f172a0d;border-radius:5px;padding:1px 5px;font-size:12px}
</style>
</head>
<body>
<div class="wrap">
  <h1>博客内容引擎 · 可视化面板</h1>
  <div class="sub">生成于 ${esc(new Date().toLocaleString('zh-CN'))} ｜ 数据源：站内 front-matter + 51.la PV 缓存 + 选题雷达 + 闸门快检 ｜ 单文件，离线可看（图表库走 CDN）</div>

  <div class="kpis">
    <div class="kpi"><b>${prof.total}</b><span>文章总数</span></div>
    <div class="kpi hl"><b>${pillarPct}%</b><span>三支柱占比（${prof.pillarTotal} 篇）</span></div>
    <div class="kpi hl"><b>${demandGap}</b><span>★有人搜·站内没有</span></div>
    <div class="kpi"><b>${unknownCount}</b><span>待摸底文章</span></div>
    <div class="kpi"><b>${totalLinks}</b><span>站内文章链接总数</span></div>
    <div class="kpi"><b>${pvKnown}/${prof.total}</b><span>PV 覆盖（${Math.round((pvKnown / (prof.total || 1)) * 100)}%）</span></div>
    <div class="kpi"><b>${actionCount}</b><span>待动手</span></div>
  </div>

  <h2>闭环状态</h2>
  <div class="loop">
    ${loop.map((x) => '<div class="lp ' + x.s + '"><i></i><b>' + esc(x.n) + '</b><span>' + esc(x.d) + '</span></div>').join('')}
  </div>

  <h2>数据新鲜度</h2>
  ${freshHtml}

  <h2>内容资产</h2>
  <div class="grid2">
    <div class="card"><h3>栏目分布（共 ${prof.total} 篇）</h3><div id="c-col" class="chart"></div></div>
    <div class="card"><h3>三支柱 vs 其他</h3><div id="c-pillar" class="chart"></div></div>
  </div>
  <div class="card" style="margin-top:14px"><h3>发布节奏（近 ${months.length} 个月）</h3><div id="c-month" class="chart" style="height:190px"></div></div>

  <h2>学习层 · 数据变成了什么动作</h2>
  <div class="acs">${actionCards || '<div class="ac"><span class="acl">暂无可诊断数据</span></div>'}</div>
  <div class="card" style="padding:0;border:none">
  <table>
    <tr><th style="width:78px">动作</th><th>标题</th><th style="width:130px">栏目</th><th style="width:62px">PV</th><th style="width:58px">入链</th><th style="width:92px">发布</th></tr>
    ${rowsHtml || '<tr><td colspan="6" style="color:#64748b">先跑 <code>node tools/insight-engine.js</code> 生成诊断</td></tr>'}
  </table>
  </div>
  <div class="sub" style="margin-top:8px">PV 为「—」＝不在流量缓存覆盖范围内，<b>不代表零流量</b>。诊断阈值：高流量 ${(insight && insight.thresholds && insight.thresholds.HIGH_PV) || 100} ｜ 中流量 ${(insight && insight.thresholds && insight.thresholds.MID_PV) || 20} ｜ 老文 ${(insight && insight.thresholds && insight.thresholds.OLD_DAYS) || 90} 天。</div>

  <h2>搜索表现（Google Search Console）</h2>
  ${gscHtml}
  ${gscTables}

  <h2>选题池</h2>
  <div class="gaps">
    ${gapCards.map((g) => '<div class="gp ' + (g.pillar ? 'pillar' : '') + '"><h4>' + esc(g.col) + (g.pillar ? '<em>支柱</em>' : '') + '</h4>' + (g.words.length ? g.words.map((w) => '<span class="wm">' + esc(w) + '</span>').join('') : '<span style="color:#64748b;font-size:12px">该栏目关键词已基本覆盖</span>') + '</div>').join('')}
  </div>
  <div class="sub" style="margin-top:8px">站内缺口＝站内提到该词的<strong>篇数</strong>；无数字＝0 篇（完全空白区，低竞争补位机会）。</div>

  <div style="margin-top:14px">
  <table>
    <tr><th style="width:40px">#</th><th>站外候选（已过定位筛选）</th><th style="width:140px">建议栏目</th><th style="width:52px">分</th><th style="width:150px">来源</th></tr>
    ${outsideHtml || '<tr><td colspan="5" style="color:#64748b">还没有站外候选 —— 跑 <code>node tools/topic-radar.js --since=14</code></td></tr>'}
  </table>
  </div>

  <h2>闸门 · 部署</h2>
  ${gateHtml}
  <div class="gate ${deploy.ok ? 'gok' : ''}"><b>部署</b><span>${deploy.ok ? '本地=线上' : '需核对'}</span><em>${deploy.ok ? 'HEAD ' + deploy.head : esc(deploy.note || (deploy.head ? '本地 ' + deploy.head + ' / 线上 ' + deploy.remote : ''))}</em></div>

  <h2>还差什么（人工维护）</h2>
  <table>
    <tr><th style="width:56px">级别</th><th>缺口</th></tr>
    ${todoHtml}
  </table>

  <h2>近期已修</h2>
  <div class="card" style="font-size:13px"><ul style="margin:0;padding-left:20px;line-height:1.9">${fixedHtml}</ul></div>

  <div class="foot">
    一键刷新（推荐）：<code>npm run refresh</code> —— 依次 取数 → 学习层 → 选题雷达 → 本面板<br>
    单步：<code>node tools/fetch-stats.js</code> ｜ <code>node tools/insight-engine.js</code> ｜ <code>node tools/topic-radar.js</code> ｜ <code>node tools/dashboard.js</code><br>
    这个面板<b>只读</b>：不联网抓取、不改文章、不构建、不部署。数据要新，靠上面那条 refresh。
  </div>
</div>

<script>
var DATA = ${JSON.stringify(DATA).replace(/</g, '\\u003c')};
(function(){
  if (typeof echarts === 'undefined') return;
  var base = { textStyle: { fontFamily: '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif', color: '#334155' } };
  function mk(id){ var el = document.getElementById(id); return el ? echarts.init(el) : null; }

  var c1 = mk('c-col');
  if (c1) c1.setOption(Object.assign({}, base, {
    grid: { left: 122, right: 28, top: 12, bottom: 22 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: '#eef2f7' } } },
    yAxis: { type: 'category', data: DATA.colBar.labels.slice().reverse(), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { fontSize: 12 } },
    series: [{ type: 'bar', data: DATA.colBar.values.slice().reverse(), barWidth: 15, itemStyle: { color: '#2563eb', borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', fontSize: 11, color: '#475569' } }]
  }));

  var c2 = mk('c-pillar');
  if (c2) c2.setOption(Object.assign({}, base, {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 11.5 } },
    color: ['#2563eb', '#16a34a', '#d97706', '#94a3b8'],
    series: [{ type: 'pie', radius: ['52%', '74%'], center: ['50%', '44%'], avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 2 },
      label: { formatter: '{b}\\n{c}篇', fontSize: 11 },
      data: DATA.pillarDonut }]
  }));

  var c3 = mk('c-month');
  if (c3) c3.setOption(Object.assign({}, base, {
    grid: { left: 38, right: 20, top: 14, bottom: 42 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: DATA.months, axisLabel: { fontSize: 11, rotate: 45, margin: 10 }, axisTick: { show: false } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#eef2f7' } } },
    series: [{ type: 'line', smooth: true, symbolSize: 6, data: DATA.months.map(function(m){ return DATA.byMonth[m]; }),
      itemStyle: { color: '#2563eb' }, areaStyle: { color: 'rgba(37,99,235,.12)' } }]
  }));

  window.addEventListener('resize', function(){ [c1,c2,c3].forEach(function(c){ if (c) c.resize(); }); });
})();
</script>
</body>
</html>`;
}

function main() {
  const D = collect();
  const html = buildHtml(D);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html, 'utf8');
  const kb = Math.round(Buffer.byteLength(html, 'utf8') / 1024);
  console.log('✅ 面板已生成：' + OUT + '（' + kb + ' KB）');
  console.log('   文章 ' + D.prof.total + ' 篇 ｜ 三支柱 ' + Math.round((D.prof.pillarTotal / D.prof.total) * 100) + '% ｜ 待摸底 ' + D.unknownCount + ' 篇 ｜ PV 覆盖 ' + D.pvKnown + ' 篇');
  if (D.gates.length) console.log('   闸门：' + D.gates.map((g) => g.label + (g.ok ? ' ✓' : ' ✗')).join(' ｜ '));
  if (has('--open')) {
    try { execFileSync('cmd', ['/c', 'start', '', OUT], { stdio: 'ignore' }); console.log('   已在默认浏览器打开'); } catch (e) { /* ignore */ }
  }
}

if (require.main === module) main();

module.exports = { collect, TODOS };
