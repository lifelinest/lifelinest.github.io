#!/usr/bin/env node
/**
 * tools/topic-radar.js —— 选题雷达（选题池自动出题 · 无人值守入口）
 * ------------------------------------------------------------------
 * 回答一个具体问题：「现在该写什么？」
 *
 * 选题雷达的本职：「去网上取最新内容 → 匹配网站定位 → 出选题」。
 *   信号 A · 站外新料（选题主体）—— 复用 fetch-sources（RSS/Atom/热榜）拉取 → 定位筛选器打分。
 *                             这是「向外求」的唯一来源，也是报告的第一节。
 *   信号 A+ · 热点灵感 —— 热榜词级雷达，命中定位词才进池，需人工筛（第二节）。
 *   信号 B · 站内缺口 —— 6 栏目关键词表 × 站内文章，找「支柱下几乎没写过」的子方向。
 *                       属「内容审计 / 候选池」，不是站外选题，报告里明确降级标注（第三节）。
 *   信号 C · 存量动作 —— 读学习层诊断：翻新 / 扩长尾 / 换标题。属「内容运维」，基于现有文章 PV（第四节）。
 *   做中学系列 —— 写死的 SELF_SEEDS（个人正在做的项目），属「个人知识库」，非站外选题（第五节）。
 *   ★ 关键边界：选题 = 第一/二节（站外新料 + 热点）；第三/四/五节是审计/运维/知识库，按需取用，不冒充选题。
 *
 * 与既有工具的分工：
 *   topic-fit-scorer  = 判一条候选「能不能写」（单点判断）
 *   topic-radar      = 从零产出「一批能写的」（批量出题，供人挑）
 *   insight-engine   = 判存量文章「该动哪篇」（诊断）
 *   挑中的再交给 matrix-planner（展开成矩阵）或 run-matrix（落成工单）
 *
 * 用法：
 *   node tools/topic-radar.js                        # 默认：存量动作 + 近 14 天新增 + 站内缺口
 *   node tools/topic-radar.js --since=30 --top=10
 *   node tools/topic-radar.js --no-fetch             # 跳过网络，只看存量动作 + 站内缺口（离线可用）
 *   node tools/topic-radar.js --no-reflow            # 跳过学习层回流
 *   node tools/topic-radar.js --out D:/1/1/.tmp/x.md # 自定义落盘位置
 *   node tools/topic-radar.js --json D:/1/1/.tmp/x.json
 *   node tools/topic-radar.js --quiet                # 只落盘，不打印正文（给定时任务用）
 * 退出码：0 = 出了选题表（哪怕为空也算正常跑完）；1 = 致命错误
 *
 * 退出码约定：定时任务里不要把「没有新选题」当失败。
 * 前置（信号 C 想有内容）：先跑 `node tools/fetch-stats.js` 取 PV，再跑 `node tools/insight-engine.js` 出诊断。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { buildProfile, COLUMN_PILLAR, PILLAR_COLUMNS, COLUMNS, PILLARS } = require('./positioning-profile');
const { COLUMN_KEYWORDS } = require('./topic-fit-scorer');
const { groundingGate } = require('./blog-grounding');
const cm = require('./content-matrix');

// 热点层输出的是「支柱名」（如 外贸B2B独立站实战），需反查成站内栏目名
const HOT_PILLAR_TO_COL = {};
for (const [pillar, cols] of Object.entries(PILLARS)) {
  for (const c of cols) HOT_PILLAR_TO_COL[pillar] = c;
}

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'source', '_posts');
const TMP_DIR = path.resolve(ROOT, '..', '.tmp', 'topic-radar');

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

const SINCE = getArg('--since', '30');
const TOP = parseInt(getArg('--top', '10'), 10);
const NO_FETCH = has('--no-fetch');
const NO_HOT = has('--no-hot');   // 跳过热点层（只想看常青选题时用）
const QUIET = has('--quiet');
const OUT = getArg('--out', '');
// ⚠️ 必须有默认值：下游 tools/auto-writer.js --radar 读的就是这个 latest.json。
// 曾经留空导致「md 是新的、json 是旧的」，成稿器一直吃脏数据（竞争判定全丢）。
const JSON_OUT = getArg('--json', path.join(TMP_DIR, 'latest.json'));

// 这些文件不是文章，会污染「关键词覆盖率」统计
const EXCLUDE = new Set(['个人博客文章标签使用规范.md']);

// 太泛、写了也不说明覆盖率的词，出题时略去
const TOO_GENERIC = new Set(['内容', '增长', '流量', '实战', '工具', '软件', '应用', '生活', '数字', '海外']);

// 下拉建议里的噪声（导航/服务类 + 影视娱乐/学生作业/盗版安装类）。
// ⚠️ 与 tools/search-demand.js 的 DEMAND_BLOCK 保持同口径 —— 改一处要同步另一处。
const DEMAND_NOISE = /(登录|注册|下载|破解|免费观看|官网入口|客服电话|加盟|代理|招聘|官网首页|第一季|第二季|第三季|电视剧|综艺|电影|明星|演员|罗志祥|时间管理局|时间管理大师|有限公司|作文|范文|读后感|手抄报|个人成长档案|绿色版|免安装|注册机|刷单|彩票)/;

// ---------------- 做中学系列种子（写给自己的积累 · 新内容首选来源）----------------
// 这些课题都来自你正在做 / 有真实一手经验的项目。写它们 = 把 tacit 经验 crystallize 成
// 可检索、可复用的知识库，且角度一手、竞品抄不走。长尾流量只是副产品。
// 调参：按你当前真实项目增删；demand 列标注「是否有人搜（长尾）」，✅=有真实下拉需求。
const SELF_SEEDS = [
  { title: '我给外贸独立站做 AI 询盘助手插件时，怎么让 LLM 不胡说（RAG/提示工程/合规擦除实录）',
    project: 'LifelineVerve 插件', learn: '生产级 LLM 应用边界、知识库检索、数据合规擦除',
    asset: '插件开发笔记 → 直接是产品文档 / 知识库（一手）',
    demand: '✅ wordpress ai 客服插件 / 外贸独立站 ai 助手（长尾·竞争小）' },
  { title: '我让 AI 每天自动发 1 篇英文文章到第 N 天，B2B 双站流量/收录发生了什么',
    project: 'B2B 双站内容管线', learn: '内容农场 vs 真实 SEO、英文 SEO 实操、auto-publish 工程',
    asset: '可复用 pipeline + 数据复盘（知识库）',
    demand: '✅ wordpress 自动发布 文章 seo / ai 写英文博客（长尾）' },
  { title: '我把 247 条真实外贸询盘归类后，发现的客户开发 5 个规律',
    project: '瑞诚外贸业务', learn: '真实买家画像、开发信到底什么有效（用数据说话）',
    asset: '客户开发作战手册（已是真实文档，文章是提炼）',
    demand: '⚠️ 外贸开发信 回复率（有需求但竞争大，靠真实数据差异化）' },
  { title: '我给自己的博客做 GEO 优化 3 个月，AI 引用到底有没有来（一手复盘）',
    project: '博客 SEO 与 GEO', learn: 'GEO 实测、AI 可见性到底怎么提升',
    asset: '本站 SEO 复盘知识库',
    demand: '✅ geo 优化 / ai 引用 网站（新兴长尾）' },
  { title: '外贸独立站从 0 到收到第一封真实询盘，我踩过的 10 个坑（建站/支付/流量）',
    project: '多项目综合', learn: '独立站完整获客链路一手经验',
    asset: '独立站操盘知识库',
    demand: '✅ 外贸独立站 怎么引流 / 0基础（长尾）' },
];

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// ---------------- 站内文本语料（title + tags + categories）----------------
function readCorpus() {
  const files = fs.existsSync(POSTS_DIR)
    ? fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md') && !EXCLUDE.has(f))
    : [];
  const rows = [];
  for (const f of files) {
    const raw = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8');
    const m = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) continue;
    const fm = m[1];
    const grab = (key) => {
      const km = fm.match(new RegExp('^' + key + '\\s*:(.*)$', 'm'));
      if (!km) return '';
      let s = km[1].trim();
      // 块状列表：把后续的 `- x` 行也收进来
      const idx = fm.indexOf(km[0]);
      const rest = fm.slice(idx + km[0].length).split(/\r?\n/).slice(0, 8)
        .filter((l) => /^\s+-\s+/.test(l)).join(' ');
      if (!s && rest) s = rest;
      return (s + ' ' + rest).replace(/[[\]'"]/g, ' ');
    };
    rows.push({ file: f, text: (grab('title') + ' ' + grab('tags') + ' ' + grab('categories')).toLowerCase() });
  }
  return rows;
}

// ---------------- 信号 B + D：站内缺口 × 搜索需求 ----------------
// ---------------- 信号 E：SERP 竞争判定（打得过吗）----------------
// 需求层回答「有人搜吗」（信号 D），这里回答「打得过吗」。
// 数据来自 tools/serp-check.js（百度无头抓取）：逐词给出三种判定 ——
//   内容词   → 可写（用户想读文章）
//   商业词   → 别写（用户在找供应商/服务商，写文章进去等于白写）
//   平台垄断 → 难打（前 N 名被百科/平台/知乎/政务等高权重位占满）
// ★ 这是选题从「自洽」走向「向外求」的那一环：只看站内哪里空，会挑出
//   一堆「需求高、但根本打不赢或不该写」的词。加上它才敢立项。
function loadSerp() {
  if (NO_SERP) return { ok: false, reason: '（--no-serp：本次跳过竞争判定）' };
  if (!fs.existsSync(SERP_JSON)) {
    return { ok: false, reason: '还没有 SERP 数据 → 先跑 `npm run serp:seed` 体检需求缺口词' };
  }
  let j;
  try {
    j = JSON.parse(fs.readFileSync(SERP_JSON, 'utf8'));
  } catch (e) {
    return { ok: false, reason: 'serp/latest.json 解析失败：' + e.message };
  }
  const map = new Map();
  for (const r of j.results || []) {
    if (r && r.word && r.judge) map.set(r.word, { verdict: r.judge.verdict, chance: r.judge.chance });
  }
  return { ok: true, at: j.at || null, map, count: map.size };
}

function buildGaps(corpus, demand, serp) {
  const all = corpus.map((r) => r.text).join(' \n ');
  const gaps = [];
  for (const col of COLUMNS) {
    const kws = COLUMN_KEYWORDS[col] || [];
    const isPillar = PILLAR_COLUMNS.has(col);
    const docsOf = (w) => corpus.filter((r) => r.text.includes(String(w).toLowerCase())).length;
    // 附上 SERP 竞争判定（没有就 null —— 必须与「内容词」区分，不能当默认可写）
    const serpOf = (w) => (serp && serp.ok && serp.map.get(w)) || null;
    const rows = kws
      .filter((w) => w.length >= 2 && !TOO_GENERIC.has(w))
      .map((w) => ({ word: w, docs: docsOf(w), serp: serpOf(w) }));
    const seen = new Set(rows.map((r) => r.word));

    // —— 信号 D：并进「真实有人搜」的词 —— 这才是流量的来源。
    //    数据来自 tools/search-demand.js（百度/必应/360 下拉建议），
    //    已剔除站内标题有覆盖的词（covered=true 的不会进来）。
    //    带 demand 字段的词 = 有搜索需求；数值 = 命中几个引擎（越大越可信）。
    const dBag = (demand && demand.ok && demand.byCol[col]) || [];
    for (const d of dBag) {
      const w = String(d.word || '').trim();
      if (!w || w.length < 2 || w.length > 24) continue;
      if (DEMAND_NOISE.test(w)) continue;
      if (seen.has(w)) {
        const hit = rows.find((r) => r.word === w);
        if (hit) { hit.demand = d.hits; hit.serp = hit.serp || serpOf(w); }
        continue;
      }
      rows.push({ word: w, docs: docsOf(w), demand: d.hits, serp: serpOf(w) });
      seen.add(w);
    }
    // 排序：先按「能不能写」分层，再按搜索需求，最后按站内覆盖。
    // 0 = 已体检且确认可写（最该动手）＞ 1 = 未判定（别当默认可写）＞ 2 = 平台垄断（能写但难排）＞ 3 = 商业/导航词（写了也白写）
    const verdictRank = (x) => {
      const v = x.serp && x.serp.verdict;
      if (v === '内容词') return 0;
      if (!v) return 1;
      if (v === '平台垄断') return 2;
      return 3;  // 商业词 / 导航词：找供应商、找安装包 —— 写文章都没用
    };
    rows.sort((a, b) => verdictRank(a) - verdictRank(b) || (b.demand || 0) - (a.demand || 0) || a.docs - b.docs || a.word.localeCompare(b.word));
    gaps.push({
      column: col,
      pillar: COLUMN_PILLAR[col] || null,
      isPillar,
      words: rows,
      demandCount: rows.filter((r) => r.demand).length,
    });
  }
  // 支柱栏目排前面（它们才是该补的）；同为支柱时，需求缺口多的排前面
  gaps.sort((a, b) => (b.isPillar - a.isPillar) || (b.demandCount - a.demandCount) || (a.column > b.column ? 1 : -1));
  return gaps;
}

// ---------------- 信号 D 的数据源：需求层 ----------------
const DEMAND_JSON = path.resolve(ROOT, '..', '.tmp', 'demand', 'demand.json');
const NO_DEMAND = has('--no-demand');
const SERP_JSON = path.resolve(ROOT, '..', '.tmp', 'serp', 'latest.json');
const NO_SERP = has('--no-serp');

function loadDemand() {
  if (!fs.existsSync(DEMAND_JSON)) {
    return { ok: false, reason: '还没有需求层数据 → 先跑 `node tools/search-demand.js` 抓「有人搜的词」' };
  }
  let d;
  try {
    d = JSON.parse(fs.readFileSync(DEMAND_JSON, 'utf8'));
  } catch (e) {
    return { ok: false, reason: 'demand.json 解析失败：' + e.message };
  }
  const byCol = {};
  for (const g of d.gaps || []) {
    const col = g.column;
    if (!col || col === '(自定义)') continue;
    (byCol[col] = byCol[col] || []).push({ word: g.word, hits: g.hits || 1 });
  }
  return {
    ok: true,
    at: d.generatedAt || null,
    engines: d.engines || [],
    wordCount: d.wordCount || 0,
    gapCount: d.gapCount || 0,
    byCol,
  };
}

// ---------------- 信号 A：站外新料（复用 fetch-sources）----------------
/** 源站标题常带尾巴（`... via @sejournal, @MattGSouthern`），清掉更像个标题 */
function cleanTitle(t) {
  return String(t || '')
    .replace(/\s+via\s+@[\w@,\s]+$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function runFetch(all, tag) {
  const tmpJson = path.join(TMP_DIR, 'sources-' + tag + '.json');
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const args = [path.join(__dirname, 'fetch-sources.js'), '--score', '--since=' + SINCE, '--limit=10', '--json', tmpJson];
  if (all) args.push('--all');
  try {
    execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return { ok: false, items: [], errors: ['fetch-sources 执行失败：' + (e.message || e)], sources: 0 };
  }
  let data = null;
  try {
    data = JSON.parse(fs.readFileSync(tmpJson, 'utf8'));
  } catch (e) {
    return { ok: false, items: [], errors: ['采集 JSON 读取失败'], sources: 0 };
  }
  // 热榜条目不走「整条打分」（命中率仅约 1% 且多是噪音），交给词级雷达单独处理，避免重复进池
  const items = (data.items || [])
    .filter((x) => x.tier !== 'hot')
    .filter((x) => x.decision === 'KEEP' || x.decision === 'REVIEW')
    .map((x) => Object.assign({}, x, { title: cleanTitle(x.title) }));
  // P1-A-b 站内相似度比对接入站外新料：命中已写文章(重合≥0.5)的 KEEP 降为 REVIEW，防重复立项
  const posts = cm.loadPosts();
  for (const it of items) {
    if (it.decision !== 'KEEP') continue;
    const dup = cm.findDuplicateSeed(it.title, posts);
    if (dup && dup.score >= 0.5) {
      it.decision = 'REVIEW';
      it.reason = (it.reason ? it.reason + ' ｜ ' : '') +
        '⚠️ 站内相似度比对命中《' + dup.match + '》(重合 ' + dup.score + '，' + dup.reason + ') → 降 REVIEW 防重复';
    }
  }
  return { ok: true, items, errors: data.errors || [], sources: data.sources };
}

/**
 * 信号 A+ · 热点层（复用 hot-topics.js 的词级雷达）
 * 为什么不直接吃 fetch-sources 里的热榜条目：热榜标题走「整条打分」命中率只有约 1%
 * （2026-10-02 实测 181 条 → KEEP 2，且那 2 条本站其实也写不了），直接并进来等于
 * 往池子里灌 20 条噪音。热点必须走它自己的词级雷达：命中定位词才进池。
 */
function fetchHotTopics() {
  const tmpJson = path.join(TMP_DIR, 'hot-topics.json');
  fs.mkdirSync(TMP_DIR, { recursive: true });
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'hot-topics.js'), '--json', tmpJson],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return { items: [], errors: ['热点雷达执行失败：' + String(e.message || '').split('\n')[0]], sources: 0 };
  }
  let data = null;
  try { data = JSON.parse(fs.readFileSync(tmpJson, 'utf8')); }
  catch (e) { return { items: [], errors: ['热点 JSON 读取失败'], sources: 0 }; }
  const items = (data.hits || []).map((h) => {
    const col = HOT_PILLAR_TO_COL[h.pillar] || '待定';
    // 博客语境闸门：热点命中词只说明「沾了定位词」，不代表「能写成你的博客」。
    // 通用 AI/平台新闻（无外贸独立站一手实操角度）→ 降 REVIEW，避免稀释画像。
    const g = groundingGate((h.title || '') + ' ' + (h.angle || ''));
    let decision = 'KEEP';
    let score = 0;
    let reason = '热点雷达命中「' + h.matched.join('、') + '」' +
      (h.onBoardDays ? '（在榜 ' + h.onBoardDays + ' 天）' : '（新上榜）') + ' ｜ ' + h.angle;
    if (g.verdict === 'REFRAME') {
      decision = 'REVIEW';
      score = Math.max(0, score - 2);
      reason += ' ｜ ⚠️ 定位闸门：' + g.reasons.join('；') + '（需你带外贸/独立站实操角度才立项）';
    } else if (g.verdict === 'OFF') {
      decision = 'REVIEW';
      reason += ' ｜ ⚠️ 定位闸门：' + g.reasons.join('；') + '（偏题，建议跳过）';
    } else if (g.verdict === 'ALIGN') {
      reason += ' ｜ ✓ 博客语境闸门：' + (g.reasons[0] || '命中你真实业务/栈');
    }
    return {
      title: h.title,
      link: h.link,
      source: h.source + ' · 热点',
      decision,
      score,
      proTier: 'hot',
      pillar: COLUMN_PILLAR[col] || h.pillar,
      bestCol: col,
      hotFlag: true,           // 标记为热点命中，汇总时不占「优先选题」TOP 位，单独列人工筛区
      hot: h.hot,
      reason,
    };
  });
  return { items, errors: [], sources: 1, scanned: data.scanned || 0 };
}

/** 先只看新增；若本期无新增，兜底看窗口内全部 —— 避免「到点了却空手」 */
function fetchOutside() {
  const r = runFetch(false, 'new');
  if (r.ok && !r.items.length) {
    const r2 = runFetch(true, 'all');
    if (r2.ok && r2.items.length) { r2.fallback = true; return r2; }
  }
  return r;
}

// ---------------- 信号 C：存量动作（学习层回流）----------------
/**
 * 回流的意义：闭环此前是断的 —— insight-engine 出了动作，topic-radar 根本不知道。
 * 结果「哪篇该翻新 / 该扩长尾」永远靠人记，数据不会自己长成工单。
 * 这里把学习层的动作队列读进来，作为选题表的**附属区块「四、存量动作（内容运维）」**。
 * 它基于现有文章 PV，属于内容运维，不是向外取新鲜内容的选题——不再占据报告第一节。
 */
const INSIGHT_JSON = path.resolve(ROOT, '..', '.tmp', 'insight', 'insight.json');
const NO_REFLOW = has('--no-reflow');

function loadReflow() {
  // ★ 新鲜度守卫：学习层过期（默认 7 天）就先补一次 PV + 重算，别拿旧动作队列当选题依据。
  //   踩过的坑（2026-10-03）：定时任务只跑本工具，insight.json 停更 9 天，
  //   选题表第一节就一直推「翻新一篇已改造完的文」。--no-fetch 可关闭（离线跑）。
  if (!NO_FETCH && !NO_REFLOW) {
    try {
      const guard = require('./ensure-fresh-pv').ensureInsight({ quiet: true });
      if ((guard.pv.refreshed || guard.insight.refreshed) && !argv.includes('--quiet')) {
        process.stderr.write('[topic-radar] 上游已自动补新：' + guard.pv.msg + '；' + guard.insight.msg + '\n');
      } else if (!guard.ok && !argv.includes('--quiet')) {
        process.stderr.write('[topic-radar] ⚠️ 上游补新未成功：' + guard.pv.msg + '；' + guard.insight.msg + '\n');
      }
    } catch (e) {
      if (!argv.includes('--quiet')) {
        process.stderr.write('[topic-radar] ⚠️ 新鲜度守卫异常，沿用当前学习层：' + String(e.message) + '\n');
      }
    }
  }
  if (!fs.existsSync(INSIGHT_JSON)) {
    return { ok: false, reason: '还没有学习层数据 → 先跑 `node tools/insight-engine.js`' };
  }
  let d;
  try {
    d = JSON.parse(fs.readFileSync(INSIGHT_JSON, 'utf8'));
  } catch (e) {
    return { ok: false, reason: 'insight.json 解析失败：' + e.message };
  }
  const rows = Array.isArray(d.rows) ? d.rows : [];
  const ageH = d.generatedAt ? (Date.now() - new Date(d.generatedAt).getTime()) / 3600000 : null;
  const pick = (act, n) => rows
    .filter((r) => r.action === act)
    .sort((a, b) => (Number(!!b.pillar) - Number(!!a.pillar)) || (b.pv || 0) - (a.pv || 0) || (b.inbound - a.inbound))
    .slice(0, n);
  const byAction = d.byAction || {};
  // reflow 最小修复：PV 解析失败（schema 不匹配）会静默显示 0/全 UNKNOWN，需明确标注非真实零流量
  const _pvCov = d.pvCoverage || 0;
  const _total = d.total || rows.length;
  const reflowReason = (_pvCov === 0 && _total > 0) ? 'PV 解析失败(schema 不匹配)，非真实零流量' : null;
  return {
    ok: true,
    at: d.generatedAt || null,
    ageH,
    pvCoverage: _pvCov,
    total: _total,
    reason: reflowReason,
    byAction,
    refresh: pick('REFRESH', 20),
    expand: pick('EXPAND', 8),
    retitle: pick('RETITLE', 8),
    // ⚠️ 2026-09-23：原来的 orphanCount/orphanSample（"补内链"）已废弃。
    //    零 md 互链 ≠ 没被爬到（主题自带三层服务端内链 + 190 个列表入口页，可爬性实测 100%），
    //    该信号恒为空且会误导去跑 link-architect --apply 改文章，故整体移除。
    unknownCount: byAction.UNKNOWN || 0,
  };
}

// ---------------- 组装报告 ----------------
function main() {
  const prof = buildProfile();
  // 内容矩阵覆盖（实时扫描 131 篇，算各矩阵格空白/薄弱情况，驱动选题方向）
  const cov = cm.buildCoverage();
  const allPosts = cm.loadPosts();
  const seeds = cm.matrixSeeds(cov, allPosts);
  const corpus = readCorpus();
  const demand = NO_DEMAND
    ? { ok: false, reason: '（--no-demand：本次跳过需求层）' }
    : loadDemand();
  const serp = loadSerp();
  const gaps = buildGaps(corpus, demand, serp);
  // P1-B 低风险增强：展平需求层词 + 复用 SERP map，给第一节 picks 附「需求/竞争」信号
  const demandByWord = new Map();
  if (demand.ok) {
    for (const colWords of Object.values(demand.byCol || {})) {
      for (const d of (colWords || [])) {
        const w = String(d.word || '').toLowerCase();
        if (!w) continue;
        demandByWord.set(w, (demandByWord.get(w) || 0) + (d.hits || 1));
      }
    }
  }
  const serpMap = serp.ok ? serp.map : new Map();
  const attachSignals = (it) => {
    const t = String(it.title || '').toLowerCase();
    let hits = 0;
    for (const [w, n] of demandByWord) if (t.includes(w)) hits += n;
    it.demandHits = hits;
    const sv = serpMap.get(it.title);
    it.serpVerdict = sv ? sv.verdict : null;
    return it;
  };
  const outside = NO_FETCH
    ? { ok: true, items: [], errors: [], sources: 0, note: '（--no-fetch：本次跳过站外采集）' }
    : fetchOutside();
  // 热点层并入：热榜时效性强，排在站外新料之前
  const hot = (NO_FETCH || NO_HOT)
    ? { items: [], errors: [] }
    : fetchHotTopics();
  if (hot.items.length) {
    outside.items = hot.items.concat(outside.items);
    outside.sources = (outside.sources || 0) + (hot.sources || 0);
    outside.errors = (outside.errors || []).concat(hot.errors || []);
    outside.hot = { count: hot.items.length, scanned: hot.scanned || 0 };
  }
  const reflow = NO_REFLOW ? { ok: false, reason: '（--no-reflow：本次跳过存量动作）' } : loadReflow();

  const pillarPct = Math.round((prof.pillarTotal / prof.total) * 100);
  const worst = prof.shortfall[0];
  // 热点命中不算「优先选题」：它们时效性强、需人工判断是否贴定位，直接进 TOP 会挤掉真实 RSS 选题。
  // 故拆成两份：realPicks 进优先位（只含 RSS/站外新料），hotItems 单独列「人工筛」区。
  const hotItems = outside.items.filter((x) => x.hotFlag);
  // ★ 第一节只放 KEEP（硬匹配定位）；REVIEW 单列「待改写角度」区，不冒充优先选题。
  //   这是「跑偏」复发的最后一道闸：语义闸门把无内容增长正例的 AI 新闻降到 REVIEW，
  //   若连 REVIEW 都进第一节，读者第一眼仍看到跑偏内容。
  const realPicks = outside.items.filter((x) => !x.hotFlag);
  const realKeep = realPicks.filter((x) => x.decision === 'KEEP');
  const realReview = realPicks.filter((x) => x.decision === 'REVIEW');
  // P1-B：附需求/竞争信号；P1-A-c：保鲜度(日期)优先，其次分，再 tiebreaker 用 demandHits
  realKeep.forEach(attachSignals);
  realKeep.sort((a, b) => (b.date || 0) - (a.date || 0) || b.score - a.score || (b.demandHits || 0) - (a.demandHits || 0));
  const picks = realKeep.slice(0, TOP);

  const L = [];
  L.push('# 选题雷达 · ' + today());
  L.push('');
  const emptiest = cm.TARGET_CELLS.map((c) => ({ c, g: cm.gapWeight(c, cov) })).sort((a, b) => b.g.weight - a.g.weight)[0];
  L.push('> 站内画像：**' + prof.total + ' 篇** ｜ 内容矩阵：**AI × SEO × GEO × 独立站技术**，垂直语境 = 外贸运营网站');
  L.push('> 矩阵缺口：最该补的格 = **' + emptiest.c + '**（现 ' + emptiest.g.count + ' 篇，权重 ' + emptiest.g.weight + '）｜ 选题方向由矩阵缺口驱动');
  if (reflow.ok) {
    L.push('> 学习层：PV 覆盖 **' + reflow.pvCoverage + ' / ' + reflow.total + '** 篇' +
      (reflow.ageH != null ? ' ｜ 诊断于 ' + reflow.ageH.toFixed(1) + ' 小时前' : ''));
  }
  if (demand.ok) {
    L.push('> 需求层：**' + (demand.engines || []).join('/') + '** 下拉建议 ｜ 需求词 ' + demand.wordCount +
      ' 个 ｜ 站内未覆盖 **' + demand.gapCount + '** 个（第三节 ★ 标记者）');
  } else {
    L.push('> 需求层：' + demand.reason);
  }
  if (!NO_FETCH) {
    const total = outside.items.length;
    const shown = Math.min(total, TOP);
    // 计数说清楚：KEEP 进第一节、REVIEW 进待改写区、热点单列第二节，避免「说12条只列1条」的困惑
    L.push('> 站外源：' + (outside.sources || 0) + ' 个 ｜ 本期站外过筛 **' + (realKeep.length + realReview.length) +
      '** 条（KEEP ' + realKeep.length + ' 进第一节 ｜ REVIEW ' + realReview.length + ' 进待改写区）' +
      (hotItems.length ? ' ｜ 热点命中 ' + hotItems.length + ' 条（第二节）' : ''));
    if (outside.hot) L.push('> 热点层：扫描 ' + outside.hot.scanned + ' 条热榜 → 命中 **' + outside.hot.count + '** 条');
    else if (!NO_HOT) L.push('> 热点层：本次无命中（通用热榜对垂类站命中率约 1%，属正常，不是故障）');
    if (outside.fallback) L.push('> ⓘ 本期无新增，下表为近 ' + SINCE + ' 天窗口内的全部有效条目');
  }
  L.push('> 生成：`node tools/topic-radar.js --since=' + SINCE + '`');
  L.push('> 选题定义：第一/二节（站外新料 + 热点）＝「去网上取最新内容 → 匹配定位」的选题；第三/四/五节为内容审计/运维/知识库，按需取用，不计入选题。');
  L.push('');

  // —— 一、内容矩阵缺口选题（来自真实矩阵，优先填空白格）——
  L.push('## 一、内容矩阵缺口选题（来自你真实矩阵 · 优先填空白格）');
  L.push('');
  L.push('> 选题方向 = 你的真实内容矩阵：**AI × SEO × GEO × 独立站技术**，垂直语境 = 外贸运营网站。');
  L.push('> 雷达先算你 ' + prof.total + ' 篇落在哪些矩阵格，优先填**空白/薄弱格**（如 GEO×建站、三轴/四轴组合目前全 0 篇）。');
  L.push('> 每条选题都标注「落在哪个格 + 能和哪些现有文章互链」——单篇是个体，成网是整体。');
  L.push('> 饱和矩阵格的种子已移入下方「已覆盖·建议翻新」，不占优先位。');
  L.push('');

  // 1.0 矩阵热力图
  L.push('### 1.0 内容矩阵热力图（单元格覆盖 ｜ 越空越该填）');
  L.push('');
  L.push('| 矩阵格 | 现有 | 状态 | 权重 |');
  L.push('|---|---|---|---|');
  for (const cell of cm.TARGET_CELLS) {
    const g = cm.gapWeight(cell, cov);
    const st = g.count === 0 ? '🔴 空白' : g.count <= 1 ? '🟠 薄弱' : g.count <= 2 ? '🟡 一般' : '🟢 充足';
    L.push('| ' + cell + ' | ' + g.count + ' | ' + st + ' | ' + g.weight + ' |');
  }
  L.push('');

  // 1.1 优先种子选题（矩阵派生）
  L.push('### 1.1 优先种子选题（来自矩阵缺口，可直接立项）');
  L.push('');
  if (!seeds.length) {
    L.push('（当前矩阵缺口均已覆盖，暂无新种子——可放宽 TARGET_CELLS 或看 1.2 站外对齐）');
  } else {
    L.push('| # | 选题（矩阵派生） | 矩阵格 | 权 | 可互链文章（成网） |');
    L.push('|---|---|---|---|---|');
    seeds.slice(0, TOP).forEach((s, i) => {
      const links = cm.linkTargets(s.title, cov, 3).map((t) => '《' + t + '》').join('、') || '（新方向，暂无强互链）';
      L.push('| ' + (i + 1) + ' | ' + s.title.replace(/\|/g, '\\|') + ' | ' + s.cell + ' | ' + s.weight + ' | ' + links + ' |');
    });
    L.push('');
    L.push('明细：');
    seeds.slice(0, TOP).forEach((s, i) => {
      L.push('');
      L.push('**' + (i + 1) + '. ' + s.title + '**');
      L.push('- 矩阵格：' + s.cell + '（现 ' + s.count + ' 篇，权重 ' + s.weight + '）');
      const links = cm.linkTargets(s.title, cov, 4);
      if (links.length) L.push('- 可互链文章：' + links.map((t) => '《' + t + '》').join('、'));
      else L.push('- 可互链文章：（新方向，暂无强互链——正好补矩阵缺口）');
    });
  }
  // 已写过（语义去重命中）的种子：提示翻新而非重复立项
  if (seeds.deduped && seeds.deduped.length) {
    L.push('');
    L.push('> 🔁 已写过（建议翻新，而非新立）：');
    seeds.deduped.forEach((d) => {
      L.push('> - 已写过《' + d.existing + '》← 种子《' + d.title + '》（语义重合 ' + d.score + '，矩阵格 ' + d.cell + '）');
    });
  }
  // 已覆盖·建议翻新（矩阵格已饱和，写法不同也先别新增，优先翻新已有）
  if (seeds.covered && seeds.covered.length) {
    L.push('');
    L.push('> 🟰 已覆盖·建议翻新（矩阵格已较满，写法不同也先别新增，优先翻新已有）：');
    seeds.covered.forEach((c) => {
      L.push('> - 矩阵格 **' + c.cell + '**（现 ' + c.count + ' 篇，权重 ' + c.weight + '）← 待立项《' + c.title + '》');
    });
  }
  L.push('');

  // 1.2 站外新料 · 矩阵对齐（去网上取最新 → 匹配矩阵格）
  L.push('### 1.2 站外新料 · 矩阵对齐（去网上取最新内容 → 匹配你矩阵格）');
  L.push('');
  L.push('> 这部分仍是「向外求」：抓取 RSS/热榜最新内容，但**只留命中你矩阵格的 KEEP**，并标出它能填哪个格、连哪篇。');
  L.push('');
  if (!picks.length) {
    L.push('本期站外无命中矩阵格的过筛新料（可 `--since=30` 放宽；矩阵缺口种子见 1.1）。');
  } else {
    L.push('| # | 选题 | 矩阵格 | 建议栏目 | 分 | 专业度 | 需求/竞争 | 来源 |');
    L.push('|---|---|---|---|---|---|---|---|');
    picks.forEach((it, i) => {
      const col = it.bestCol || '待定';
      const pro = it.proTier === 'operator' ? '操盘手级 ✓' : it.proTier === 'beginner' ? '入门向' : (it.proTier === 'hot' ? '热点·人工筛' : '通用技法');
      const dStar = it.demandHits ? '★'.repeat(Math.min(it.demandHits, 5)) : '—';
      const vIcon = it.serpVerdict === '内容词' ? '✅' : (it.serpVerdict === '商业词' || it.serpVerdict === '导航词') ? '⛔' : (it.serpVerdict === '平台垄断' ? '⚠️' : '—');
      const signal = dStar + ' ' + vIcon;
      L.push('| ' + (i + 1) + ' | ' + it.title.replace(/\|/g, '\\|') + ' | ' + (it.cell || '—') + ' | ' + col + ' | ' + it.score + ' | ' + pro + ' | ' + signal + ' | ' + it.source + ' |');
    });
    L.push('');
    L.push('明细与理由：');
    picks.forEach((it, i) => {
      L.push('');
      L.push('**' + (i + 1) + '. ' + it.title + '**');
      L.push('- 矩阵格：' + (it.cell || '—') + '　栏目：' + (it.bestCol || '待定') + '　决策：' + it.decision + '（' + it.score + ' 分）');
      const dStar = it.demandHits ? '★'.repeat(Math.min(it.demandHits, 5)) : '—';
      const vIcon = it.serpVerdict === '内容词' ? '✅' : (it.serpVerdict === '商业词' || it.serpVerdict === '导航词') ? '⛔' : (it.serpVerdict === '平台垄断' ? '⚠️' : '—');
      L.push('- 需求/竞争：' + dStar + '（hits ' + (it.demandHits || 0) + '）　竞争判定：' + vIcon + (it.serpVerdict ? '（' + it.serpVerdict + '）' : '（无 SERP 数据）'));
      L.push('- 理由：' + (it.reason || '—'));
      if (it.linkable && it.linkable.length) L.push('- 可互链文章：' + it.linkable.map((t) => '《' + t + '》').join('、'));
      if (it.link) L.push('- 原文：' + it.link);
    });
    L.push('');
    L.push('下一步（挑中哪条就换掉 seed）：');
    L.push('');
    L.push('```');
    L.push('node tools/matrix-planner.js --seed="' + (picks[0].title || (seeds[0] && seeds[0].title) || '') + '" --clusters=3 --longtails=1 --json D:/1/1/.tmp/matrix.json');
    L.push('# 或落成矩阵工单');
    L.push('node tools/run-matrix.js --plan D:/1/1/.tmp/matrix.json --next');
    L.push('```');
  }
  L.push('');

  // —— 一·B、待改写角度（REVIEW，不冒充优先选题）——
  if (realReview.length) {
    L.push('### 待改写角度（REVIEW · 非优先选题，需你带真实角度才立项）');
    L.push('');
    L.push('> 以下经定位闸门判定为 REVIEW：它们贴了支柱标签但**缺内容增长正例 / 是复述型商品教程 / 热点需人工落角度**。');
    L.push('> 不能直接当选题写，否则会稀释画像。只有你能补上「外贸/独立站/SEO 实操」一手角度时，才换掉 seed 立项。');
    L.push('');
    for (const it of realReview.slice(0, TOP)) {
      L.push('- **' + it.title.replace(/\|/g, '\\|') + '**　栏目：' + (it.bestCol || '待定') + '　决策：REVIEW（' + it.score + ' 分）');
      L.push('  - 理由：' + (it.reason || '—'));
      if (it.link) L.push('  - 原文：' + it.link);
    }
    L.push('');
  }

  // —— 二、热点灵感（站外热榜命中 · 需人工筛）——
  L.push('## 二、热点灵感（站外热榜命中 · 需人工筛，勿直接喂成稿器）');
  L.push('');
  L.push('> 以下热点命中了定位词，但**需你人工判断是否真贴定位**——直接当选题写会稀释画像。');
  L.push('> 只有能落到「外贸人 / 独立站运营 / SEO 实操」的具体角度，才算可写。');
  L.push('');
  if (hotItems.length) {
    for (const it of hotItems) {
      L.push('- **' + it.title.replace(/\|/g, '\\|') + '**　栏目：' + (it.bestCol || '待定') + '　决策：' + it.decision + '（' + it.score + ' 分）');
      L.push('  - 理由：' + (it.reason || '—'));
    }
  } else {
    L.push('（本次无热点命中定位词——通用热榜对垂类站命中率约 1%，属正常，不是故障。）');
  }
  L.push('');

  // —— 三、站内缺口词（内容审计 · 候选池，非站外选题）——
  L.push('## 三、站内缺口词（内容审计 · 候选池，非站外选题）');
  L.push('');
  L.push('> ⚠️ 本节是「有人搜」的**候选池，不是选题**：它拿「栏目关键词表 × 站内已有文章」找出站内几乎没写过的子方向，属于内容审计。');
  L.push('> 只有「站内 0 篇 + 我有真实一手经历能写」的词才动手；纯商品教程词（seo教程/开发信模板）若你没有自己的真实角度，跳过——写出来对你零收益。');
  L.push('');
  L.push('数字 = 站内**提到该词的篇数**。0 篇＝完全空白区。');
  L.push('★ 标记的词来自搜索引擎下拉建议，是真实用户在打的词 —— 优先写这些。');
  L.push('✅ / ⚠️ / ⛔ 来自 `tools/serp-check.js` 的百度 SERP 抽查：**光看「有人搜 + 站内没有」会挑出不该写的词**，逐词看过前 10 名才算立项。无标记＝还没体检，别当默认可写。');
  L.push('');
  L.push('> 注：非支柱栏目（效率工具与软件 / 博客建站与前端 / 数字生活）本轮**不产出选题**——效率工具已占全站 56%、数字生活偏离定位，出词只会稀释画像。');
  L.push('');
  for (const g of gaps) {
    if (!g.isPillar) continue;   // 非支柱栏目不产出选题，避免稀释定位
    const top = g.words.filter((w) => w.docs <= 2).slice(0, 14);
    if (!top.length) continue;
    const mark = g.isPillar ? '**支柱**' : '非支柱';
    L.push('### ' + g.column + '（' + mark + (g.demandCount ? ' ｜ 含搜索需求 ' + g.demandCount + ' 个' : '') + '）');
    L.push('');
    L.push(top.map((w) => {
      const v = w.serp && w.serp.verdict;
      const flag = v === '内容词' ? '✅' : (v === '商业词' || v === '导航词') ? '⛔' : (v === '平台垄断' ? '⚠️' : '');
      const star = w.demand ? '★' : '';
      return flag + star + '`' + w.word + '`(' + w.docs + ')';
    }).join('　'));
    L.push('');
  }

  // —— 四、存量动作（内容运维 · 基于现有文章 PV，非站外选题）——
  L.push('## 四、存量动作（内容运维 · 基于现有文章 PV，非站外选题）');
  L.push('');
  L.push('> ⚠️ 这一节是**内容运维**，不是向外取新鲜内容的选题：它读学习层诊断，把「翻新 / 扩长尾 / 换标题」回流成工单。');
  L.push('> 数据来自站内已有文章的 PV，与「去网上找新选题」是两码事。按需取用，不计入选题。');
  L.push('');
  if (!reflow.ok) {
    L.push('> ' + reflow.reason);
    L.push('');
  } else {
    if (reflow.ageH != null && reflow.ageH > 168) {
      L.push('> ⚠️ 学习层数据已 ' + (reflow.ageH / 24).toFixed(1) + ' 天未更新，先跑 `node tools/insight-engine.js` 再据此决策。');
      L.push('');
    }
    const tbl = (title, desc, list, extra) => {
      L.push('### ' + title + '（' + list.length + ' 篇' + (extra || '') + '）—— ' + desc);
      L.push('');
      L.push('| abbrlink | 标题 | 栏目 | PV | 入链 | 发布 |');
      L.push('|---|---|---|---|---|---|');
      for (const r of list) {
        L.push('| `' + r.abbr + '` | ' + String(r.title).replace(/\|/g, '\\|').slice(0, 40) + ' | ' + r.col +
          ' | ' + (r.pvKnown ? r.pv : '—') + ' | ' + r.inbound + ' | ' + String(r.date || '—').slice(0, 10) + ' |');
      }
      L.push('');
    };
    if (reflow.refresh.length) {
      tbl('翻新', '高流量老文 → 补 FAQ / GEO 定义块 / 更新数据，保 URL 不变（性价比最高）', reflow.refresh);
    }
    if (reflow.expand.length) {
      tbl('扩长尾', '支柱栏目 + 流量已验证 → 交给 matrix-planner 展开成矩阵', reflow.expand);
    }
    if (reflow.retitle.length) {
      tbl('换标题', '支柱栏目但流量低 → 换措辞/关键词，不换主题', reflow.retitle);
    }
    // ⚠️ 原「补内链（ORPHAN）」段已整体删除，理由见 loadReflow 内注释。
    //    改为诚实汇报「待摸底」规模，不再输出会修改文章的批量动作（原指的 link-architect --apply）。
    if (reflow.unknownCount) {
      L.push('### 待摸底（' + reflow.unknownCount + ' 篇）—— 既无 PV 也无搜索数据，表现未知');
      L.push('');
      L.push('> **这不等于「没被爬到」**：站内可爬性实测 100%（主题自带三层服务端内链 + 190 个列表入口页）。');
      L.push('> 真正缺的是**搜索引擎收录数据**。等 GSC / 百度数据接通后，这批会自动分流到具体动作。');
      L.push('> 在此之前不要试图靠补内链「治」它们 —— 那是空动作。');
      L.push('');
    }
    if (!reflow.refresh.length && !reflow.expand.length && !reflow.retitle.length && !reflow.unknownCount) {
      L.push('（本轮无待办动作 —— 要么表现都好，要么 PV 覆盖还不够。）');
      L.push('');
    }
  }

  // —— 五、个人知识库 · 做中学（可选，非站外选题）——
  L.push('## 五、个人知识库 · 做中学（可选，非站外选题）');
  L.push('');
  L.push('> 这一节是**个人知识库积累**，不是向外取的选题：课题来自你正在做的项目（写死的 SELF_SEEDS），把 tacit 经验 crystallize 成可检索、可复用的知识库。');
  L.push('> 角度一手、竞品抄不走，长尾流量只是副产品。想写就挑，不计入「站外选题」。');
  L.push('');
  L.push('| # | 课题（写给自己的） | 关联真实项目 | 我能学到什么 | 沉淀成什么资产 | 是否有人搜（长尾） |');
  L.push('|---|---|---|---|---|---|');
  SELF_SEEDS.forEach((s, i) => {
    L.push('| ' + (i + 1) + ' | ' + s.title.replace(/\|/g, '\\|') + ' | ' + s.project + ' | ' + s.learn + ' | ' + s.asset + ' | ' + s.demand + ' |');
  });
  L.push('');
  L.push('> 这 5 个课题都是你**正在做的事**——写它们 = 把 tacit 经验 crystallize 成可检索、可复用的知识库，且角度一手、竞品抄不走，长尾流量只是副产品。');
  L.push('');

  // —— 六、收口
  L.push('## 六、怎么用这份表');
  L.push('');
  L.push('1. **选题只看第一/二节**（站外新料 + 热点）—— 那才是「去网上取最新内容 → 匹配定位」的产出。');
  L.push('2. 第三节缺口词是内容审计候选池、第四节存量动作是内容运维、第五节做中学是个人知识库——按需取用，不计入选题。');
  L.push('3. 挑中第一节某条后喂给矩阵规划器展开：`node tools/matrix-planner.js --seed="<选中>"`');
  L.push('4. 按序开写：`node tools/run-matrix.js --plan <json> --next`');
  L.push('5. 全部校验过 → 走「闸门 C」停下等你批准部署。');
  L.push('');
  if (outside.errors && outside.errors.length) {
    L.push('---');
    L.push('');
    L.push('⚠️ 本次未取到的源（不影响其它源）：' + outside.errors.join('；'));
    L.push('');
  }

  // —— 支柱覆盖自检（B·补缺口告警）：某支柱跑空则红字告警 + 补救 ——
  const pillarCounts = {};
  for (const p of Object.keys(PILLARS)) pillarCounts[p] = 0;
  const countPillar = (it) => {
    const pc = it && it.bestCol ? COLUMN_PILLAR[it.bestCol] : null;
    if (pc) pillarCounts[pc]++;
  };
  (picks || []).forEach(countPillar);
  (realReview || []).forEach(countPillar);
  (hotItems || []).forEach(countPillar);
  const emptyPillars = Object.keys(PILLARS).filter((p) => pillarCounts[p] === 0);
  if (emptyPillars.length) {
    L.push('## 支柱覆盖自检（B）');
    L.push('');
    L.push('> ⚠️ 本期过筛选题**未覆盖**以下支柱：' + emptyPillars.join('、') + '。');
    L.push('> 这些恰是你的核心业务 / 最缺支柱，跑空说明对应源近期无新料或抓取失败，不等于「不需要写」。');
    L.push('> 补救：① `--since=60/90` 放宽窗口；② 手动 seed（`matrix-planner --seed="..."`）；③ 看下方「关键源健康度（C）」是否失败。');
    L.push('');
  }

  // —— 精度闸新鲜度（B）：需求层/竞争层数据多久没刷新，决定选题判「可写」的可信度 ——
  const freshDays = (iso) => {
    if (!iso) return null;
    const d = (Date.now() - new Date(iso).getTime()) / 86400000;
    return Math.floor(d);
  };
  const demDays = freshDays(demand.ok ? demand.at : null);
  const serpDays = freshDays(serp.ok ? serp.at : null);
  L.push('## 七、精度闸新鲜度（选题可信度底座）');
  L.push('');
  L.push('> 需求层=「有人真在搜」、竞争层=「打得过的词」。这两层没数据，选题只能凭定位画像粗判，不能判「可写」。');
  L.push('');
  L.push('- 需求层（search-demand）：' + (demand.ok ? `最近刷新 ${demDays} 天前（at ${demDays > 14 ? '⚠️偏旧，建议跑 `npm run demand`' : '✅新鲜'}）` : '⚠️ 本次未取到（--no-demand 或数据缺失）— 选题不判「有人搜」'));
  L.push('- 竞争层（serp-check）：' + (serp.ok ? `最近刷新 ${serpDays} 天前（at ${serpDays > 14 ? '⚠️偏旧，建议跑 `npm run serp:seed`' : '✅新鲜'}）` : '⚠️ 本次未取到 — 选题不判「打得过/该避」'));
  L.push('');

  // —— 源质量自淘汰（C）：累计每个源的 KEEP 率，长期弱源提示降权/停用 ——
  const SQ_FILE = path.join(TMP_DIR, 'source-quality.json');
  let sq = {};
  try { sq = JSON.parse(fs.readFileSync(SQ_FILE, 'utf8')); } catch (e) { sq = {}; }
  const bump = (name, key) => {
    if (!name) return;
    if (!sq[name]) sq[name] = { seen: 0, keep: 0, fail: 0 };
    sq[name][key]++;
  };
  for (const it of picks) bump(it.source, 'keep');
  for (const it of realPicks) bump(it.source, 'seen');
  for (const s of (outside.errors || [])) bump(s, 'fail');
  try { fs.writeFileSync(SQ_FILE, JSON.stringify(sq, null, 2), 'utf8'); } catch (e) { /* 落盘失败不阻断 */ }
  const sqRows = Object.entries(sq)
    .map(([n, v]) => ({ n, ...v, rate: (v.keep + v.fail) > 0 ? Math.round((v.keep / (v.keep + v.fail)) * 100) : null, sample: v.keep + v.fail }))
    .filter((r) => r.sample >= 20 && r.rate !== null && r.rate < 5);
  L.push('## 八、源质量自淘汰');
  L.push('');
  L.push('> 每个源长期 KEEP 率（= 命中选题 ÷ (命中+抓空)）。样本≥20 且 KEEP 率<5% 的弱源，建议 `sources.json` 里标记 `disabled` 或换源。');
  L.push('');
  if (sqRows.length) {
    for (const r of sqRows) L.push('- ⚠️ **' + r.n + '**：KEEP 率 ' + r.rate + '%（样本 ' + r.sample + '）— 长期不产选题，建议降权/停用');
  } else {
    L.push('- 暂无长期弱源（样本≥20 且 KEEP<5% 的源：无）✅');
  }
  if (outside.errors && outside.errors.length) {
    L.push('');
    L.push('> 本期失败源：' + outside.errors.join('、') + '（代理抖动常导致，已对 curl 加退避重试；持续失败再处理）');
  }
  // —— 关键源健康度（C）：外贸/SEO 关键源本期待补，跑空时直接点名 ——
  const CRIT = {
    '外贸B2B独立站实战': ['白鲸出海', 'Ecwid', '36氪', 'HubSpot', 'Neil Patel'],
    'SEO与Google Ads 流量增长': ['Bing Webmaster', 'Google Search Central', 'SEJ', 'Ahrefs', 'SEMrush', 'Backlinko', 'cognitiveSEO', 'Yoast'],
  };
  const failedSet = new Set((outside.errors || []).map((s) => String(s).replace(/（.*$/, '').trim()));
  const allPicks = (picks || []).concat(hotItems || []);
  L.push('');
  L.push('### 关键源健康度（C）');
  L.push('');
  L.push('> 外贸/SEO 是你核心业务与最缺支柱，这些源本期待补。任一失败/无产出，就是对应支柱选题为 0 的直接原因。');
  L.push('');
  for (const [pil, names] of Object.entries(CRIT)) {
    L.push('- **' + pil + '**');
    for (const n of names) {
      const failed = failedSet.has(n);
      const got = allPicks.some((it) => (it.source || '') === n && (it.decision === 'KEEP' || it.decision === 'REVIEW'));
      const st = failed ? '⛔ 抓取失败（本期无产出）' : (got ? '✅ 产出过筛选题' : '○ 取到但本期无过筛项');
      L.push('  - ' + n + '：' + st);
    }
  }
  L.push('');

  // —— 定位漂移监测（D）：比对历史最早快照，发现画像在变就主动提示更新定位文件 ——
  const PH_DIR = path.join(TMP_DIR, 'profile-history');
  fs.mkdirSync(PH_DIR, { recursive: true });
  const todaySnap = { date: today(), pillarPct: prof.pillarPct, columns: prof.columns, topTags: (prof.topTags || []).slice(0, 15) };
  try { fs.writeFileSync(path.join(PH_DIR, today() + '.json'), JSON.stringify(todaySnap, null, 2), 'utf8'); } catch (e) { /* 不阻断 */ }
  const histFiles = fs.readdirSync(PH_DIR).filter((f) => f.endsWith('.json') && f !== today() + '.json').sort();
  L.push('## 九、定位漂移监测');
  L.push('');
  if (!histFiles.length) {
    L.push('> 首次建立基线快照。下一份报告起会对比今天，发现你在往新方向走时主动提示。');
  } else {
    let old;
    try { old = JSON.parse(fs.readFileSync(path.join(PH_DIR, histFiles[0]), 'utf8')); } catch (e) { old = null; }
    if (old) {
      const driftP = [];
      for (const p of Object.keys(prof.pillarPct)) {
        const d = (prof.pillarPct[p] || 0) - (old.pillarPct[p] || 0);
        if (Math.abs(d) >= 8) driftP.push(`${p} ${d > 0 ? '+' : ''}${d}pp`);
      }
      const oldTags = new Set((old.topTags || []).map((t) => Array.isArray(t) ? t[0] : t.tag));
      const newDirs = (prof.topTags || []).filter((t) => (Array.isArray(t) ? t[1] : t.count) >= 3 && !oldTags.has(Array.isArray(t) ? t[0] : t.tag)).map((t) => Array.isArray(t) ? t[0] : t.tag);
      if (driftP.length || newDirs.length) {
        L.push('> 自 ' + old.date + ' 起，你的定位出现可观测变化：');
        if (driftP.length) L.push('- 支柱占比偏移：' + driftP.join('、') + '（>8pp）');
        if (newDirs.length) L.push('- 新出现的主题方向（topTags 新晋）：' + newDirs.join('、'));
        L.push('- ⚠️ 若确认是新战略方向，建议更新 `positioning-profile.js` 的 PILLARS/COLUMN_PILLAR，让雷达按新画像筛。');
      } else {
        L.push('> 对比 ' + old.date + ' 基线：支柱占比与新主题方向均无显著偏移（<8pp，无新晋高权重标签）✅');
      }
    }
  }
  L.push('');

  const text = L.join('\n');
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const outFile = OUT || path.join(TMP_DIR, today() + '.md');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, text, 'utf8');

  // —— 可视化速览页（HTML 卡片，浏览器直接看）——
  const htmlOut = outFile.replace(/\.md$/i, '.html');
  // RSS 标题常自带已实体化字符（如 &#8217; / &amp;），先解码再转义，避免二次转义成 &amp;#8217;
  const decodeEnt = (s) => String(s == null ? '' : s)
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return m; } })
    .replace(/&#(\d+);/g, (m, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch (e) { return m; } })
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const esc = (s) => decodeEnt(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const wk = ['日', '一', '二', '三', '四', '五', '六'][new Date().getDay()];
  let driftShort = '—';
  try {
    const hf = fs.readdirSync(PH_DIR).filter((f) => f.endsWith('.json') && f !== today() + '.json').sort();
    if (!hf.length) driftShort = '首次基线，下份起对比';
    else {
      const old = JSON.parse(fs.readFileSync(path.join(PH_DIR, hf[0]), 'utf8'));
      const dp = Object.keys(prof.pillarPct).filter((p) => Math.abs((prof.pillarPct[p] || 0) - (old.pillarPct[p] || 0)) >= 8)
        .map((p) => `${p} ${(prof.pillarPct[p] || 0) - (old.pillarPct[p] || 0) > 0 ? '+' : ''}${(prof.pillarPct[p] || 0) - (old.pillarPct[p] || 0)}pp`);
      const oldTags = new Set((old.topTags || []).map((t) => Array.isArray(t) ? t[0] : t.tag));
      const nd = (prof.topTags || []).filter((t) => (Array.isArray(t) ? t[1] : t.count) >= 3 && !oldTags.has(Array.isArray(t) ? t[0] : t.tag)).map((t) => Array.isArray(t) ? t[0] : t.tag);
      driftShort = (dp.length || nd.length) ? ('偏移：' + dp.concat(nd).join('、')) : ('对比 ' + old.date + ' 无显著偏移 ✅');
    }
  } catch (e) { /* 不阻断 */ }
  const card = (it, idx) => `
    <div class="card">
      <div class="rank">#${idx}</div>
      <div class="body">
        <div class="title">${esc(it.title)}</div>
        <div class="meta"><span class="badge col">${esc(it.bestCol || '待定')}</span><span class="badge src">${esc(it.source || '—')}</span><span class="badge score">${esc(it.score)}分</span><span class="badge dec">${esc(it.decision)}</span></div>
        <div class="reason">${esc(it.reason || '—')}</div>
        ${it.link ? `<a class="link" href="${esc(it.link)}" target="_blank" rel="noopener">原文 ↗</a>` : ''}
      </div>
    </div>`;
  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>选题雷达速览 ${today()}</title>
<style>
  :root{ --bg:#f7f8fa; --card:#fff; --ink:#1f2430; --sub:#6b7280; --line:#e6e8ec; --accent:#3b6cff; }
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--ink);padding:24px}
  .wrap{max-width:880px;margin:0 auto}
  h1{font-size:20px;margin:0 0 4px}
  .sub{color:var(--sub);font-size:13px;margin-bottom:18px}
  .summary{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;font-size:13px;line-height:1.8;margin-bottom:22px}
  .summary b{color:var(--accent)}
  .section-t{font-size:15px;margin:22px 0 10px;display:flex;align-items:center;gap:8px}
  .section-t .tag{font-size:11px;background:var(--accent);color:#fff;border-radius:6px;padding:2px 7px}
  .card{display:flex;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:10px}
  .rank{font-size:18px;font-weight:700;color:var(--accent);min-width:28px}
  .body{flex:1;min-width:0}
  .title{font-size:15px;font-weight:600;margin-bottom:8px}
  .meta{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
  .badge{font-size:11px;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#334}
  .badge.score{background:#e8f6ec;color:#1a7f37}
  .badge.dec{background:#fff4e5;color:#b45309}
  .badge.src{background:#f1f3f5;color:#555}
  .badge.pro{background:#eaf4ff;color:#1f6feb}
  .reason{font-size:13px;color:var(--sub);line-height:1.6}
  .link{display:inline-block;margin-top:8px;font-size:12px;color:var(--accent);text-decoration:none}
  .empty{color:var(--sub);font-size:13px;padding:8px 0}
</style></head>
<body><div class="wrap">
  <h1>✅ 选题雷达速览 · ${today()}（周${wk}）</h1>
  <div class="sub">第一节=内容矩阵缺口选题（来自你真实矩阵）　第二节=站外对齐　第三节=热点（人工筛）</div>
  <div class="summary">
    <div>🧩 矩阵种子：<b>${seeds.length}</b> 条（来自你真实矩阵空白格）　|　站外对齐：<b>${picks.length}</b> 条</div>
    <div>🥇 矩阵优先选题 Top3：${seeds.slice(0, 3).map((s, i) => `<b>${i + 1}. ${esc(s.title)}</b>`).join('　') || '无'}</div>
    <div>🎯 精度闸：需求层 ${demand.ok ? `${demDays}天前${demDays > 14 ? '⚠️偏旧' : '✅'}` : '跳过'}　|　竞争层 ${serp.ok ? `${serpDays}天前${serpDays > 14 ? '⚠️偏旧' : '✅'}` : '跳过'}</div>
    <div>🔌 源：${outside.errors && outside.errors.length ? `本期失败 ${outside.errors.length} 个（${esc(outside.errors.join('、'))}）` : '全部正常'}</div>
    <div>🧭 定位漂移：${esc(driftShort)}</div>
  </div>
  <div class="section-t"><span class="tag">矩阵</span>内容矩阵缺口选题（来自你真实矩阵 · 优先填空白格）</div>
  ${seeds.length ? seeds.slice(0, TOP).map((s, i) => `
    <div class="card">
      <div class="rank">#${i + 1}</div>
      <div class="body">
        <div class="title">${esc(s.title)}</div>
        <div class="meta"><span class="badge col">${esc(s.cell)}</span><span class="badge pro">权重 ${s.weight}</span><span class="badge dec">矩阵派生</span></div>
        <div class="reason">现 ${s.count} 篇 ｜ ${s.count === 0 ? '空白格，最该补' : '薄弱格'} ｜ 可互链：${(cm.linkTargets(s.title, cov, 3).map((t) => esc(t)).join('、') || '新方向，暂无强互链')}</div>
      </div>
    </div>`).join('') : '<div class="empty">当前矩阵缺口均已覆盖</div>'}
  <div class="section-t"><span class="tag">站外</span>站外新料 · 矩阵对齐（真选题，去网上取最新 → 匹配你矩阵格）</div>
  ${picks.length ? picks.map((it, i) => card(it, i + 1)).join('') : '<div class="empty">本期无命中矩阵格的过筛新料（可放宽 --since）</div>'}
  <div class="section-t"><span class="tag">待改写</span>REVIEW（带一手角度才立项，非优先选题）</div>
  ${realReview.length ? realReview.map((it, i) => card(it, i + 1)).join('') : '<div class="empty">本期无待改写项</div>'}
  <div class="section-t"><span class="tag">第二节</span>热点灵感（人工筛，勿直接喂成稿器）</div>
  ${hotItems.length ? hotItems.map((it, i) => card(it, i + 1)).join('') : '<div class="empty">本期无命中定位词的热点</div>'}
</div></body></html>`;
  try { fs.writeFileSync(htmlOut, html, 'utf8'); } catch (e) { /* 不阻断 */ }

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({
      generatedAt: new Date().toISOString(),
      profile: { total: prof.total, pillarPct, shortfall: prof.shortfall },
      reflow: reflow.ok ? {
        at: reflow.at, pvCoverage: reflow.pvCoverage, total: reflow.total, byAction: reflow.byAction,
        refresh: reflow.refresh, expand: reflow.expand, retitle: reflow.retitle,
        unknownCount: reflow.unknownCount,
      } : { error: reflow.reason },
      demand: demand.ok ? {
        at: demand.at, engines: demand.engines, wordCount: demand.wordCount, gapCount: demand.gapCount,
      } : { error: demand.reason },
      serp: serp.ok ? { at: serp.at, count: serp.count } : { error: serp.reason },
      picks,
      gaps: gaps.map((g) => ({
        column: g.column, pillar: g.pillar, isPillar: g.isPillar, demandCount: g.demandCount,
        words: g.words.filter((w) => w.docs <= 2).map((w) => ({
          word: w.word, docs: w.docs, demand: w.demand || 0,
          serp: w.serp ? w.serp.verdict : '',
        })),
      })),
      sourceErrors: outside.errors,
    }, null, 2), 'utf8');
  }

  if (!QUIET) console.log(text);
  const wkName = ['日', '一', '二', '三', '四', '五', '六'][new Date().getDay()];
  const reflowNote = reflow.ok
    ? '存量动作 ' + (reflow.refresh.length + reflow.expand.length + reflow.retitle.length) + ' 项'
    : '存量动作：跳过';
  const demandNote = demand.ok ? ('需求缺口 ' + demand.gapCount + ' 个') : '需求层：跳过';
  const serpNote = serp.ok ? ('竞争判定 ' + serp.count + ' 词') : '竞争判定：跳过';
  const banner = [
    '',
    '✅ 选题雷达已跑完（' + today() + ' 周' + wkName + ' 09:00）',
    '────────────────────────────',
    '🧩 矩阵种子：' + seeds.length + ' 条（来自你真实矩阵缺口）｜ 站外对齐：' + picks.length + ' 条',
    '🥇 矩阵优先选题 Top3：',
    ...seeds.slice(0, 3).map((s, i) => '   ' + (i + 1) + '. ' + s.title + '（' + s.cell + ' · 权重 ' + s.weight + '）'),
    '🎯 精度闸：需求层 ' + (demand.ok ? (demDays + '天前' + (demDays > 14 ? '⚠️偏旧' : '✅')) : '跳过') + ' ｜ 竞争层 ' + (serp.ok ? (serpDays + '天前' + (serpDays > 14 ? '⚠️偏旧' : '✅')) : '跳过'),
    '🔌 源：' + (outside.errors && outside.errors.length ? ('本期失败 ' + outside.errors.length + ' 个（' + outside.errors.join('、') + '）') : '全部正常'),
    '🧭 定位漂移：' + driftShort,
    '📁 报告：' + outFile,
    '📁 速览页：' + htmlOut,
    '────────────────────────────',
    '（只读，未 push/部署）',
  ];
  console.log(banner.join('\n'));
}

if (require.main === module) main();

module.exports = { buildGaps, readCorpus, COLUMNS, runFetch, fetchOutside };
