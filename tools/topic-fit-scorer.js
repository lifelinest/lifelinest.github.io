#!/usr/bin/env node
/**
 * tools/topic-fit-scorer.js —— 选题筛选器（内容矩阵驱动）
 * ------------------------------------------------------------------
 * 核心模型：用户真实内容矩阵 = AI × SEO × GEO × 建站(WordPress)，垂直语境 = 外贸运营网站。
 * 选题要"成矩阵"——单条是个体、又连成整体（可互链、填空白格）。
 *
 * 打分逻辑（透明、权重置顶可改）：
 *   1) 矩阵分类：文本命中哪些主题轴(AI/SEO/GEO/WP) + 是否外贸语境(FT)。
 *   2) 矩阵契合：双轴及以上交叉 +3（这是"矩阵"的核心）；单轴 +1（偏通用）。
 *   3) 垂直对齐：含外贸运营网站语境 +2。
 *   4) 填空白格：命中目标单元格且当前覆盖 0 篇 → +3；≤1 篇 → +2；≤2 → +1。
 *      （用户点名的方向 GEO×建站 / 三轴 / 四轴组合目前全 0 篇，最高优先）
 *   5) 专业度闸门：含操盘手/商业实战信号 → 达标(KEEP)；入门/个人向 → 降 REVIEW；
 *      贴标签但零商业语境 → 降 REVIEW（需拔高到操盘手视角）。
 *   6) 做中学：关联用户正在做的真实项目 → +2。
 *   7) 采用反馈闭环：用户真写过的相似选题 +，长期跳过的类型 -（上限±2）。
 *   8) 搜索意图词 → +1。
 *   红线：命中明显 off-brand（游戏/影视/股票…）→ 直接 DROP。
 *
 * 决策：双轴 + 外贸语境 → 直接 KEEP；其余 score>=5 KEEP；>=2 REVIEW；<2 DROP。
 *
 * 依赖：require('./content-matrix') 取实时矩阵覆盖与派生种子。
 */
'use strict';

const fs = require('fs');
const cm = require('./content-matrix');
const { groundingGate } = require('./blog-grounding');
const { demandFor } = require('./topic-demand');

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.findIndex((a) => a === name || a.startsWith(name + '='));
  if (i === -1) return def;
  const a = args[i];
  if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
  const nx = args[i + 1];
  return nx && !nx.startsWith('--') ? nx : def;
}
const inFile = getArg('--in', null);
const query = getArg('--query', null);
const minScoreRaw = getArg('--min', null);
const minScore = minScoreRaw == null ? -Infinity : parseInt(minScoreRaw, 10);
const jsonOut = getArg('--json', null);

// ---------------- 专业度 / 受众层级信号（治「泛关键词匹配·专业度太低」）----------------
const OPERATOR_SIGNALS = [
  '外贸', 'b2b', '独立站', '工厂', '制造商', '制造', '供应商', '出海', '跨境', '询盘', '采购', 'rfq',
  '买家', '开发信', '获客', '代运营', '谷歌', 'google', 'ads', '广告', 'sem', 'cpc', 'cpa',
  '转化', '着陆页', 'landing', '线索', 'leads', '报价', '供应链', '展会', '广交会', '代理商', 'agency',
  'wholesale', 'manufacturer', 'supplier', 'exporter', 'importer', 'quote', 'procurement', 'roi', 'cac',
  '客单价', '复购', 'shopify', 'woocommerce', '电商', 'ecommerce', '站群', '矩阵', 'crm', '企业', '公司',
  '批量', '工单', 'lead generation', 'lead gen', 'saas', '批发', '外贸独立站', '外贸b2b', '品牌独立站',
  '独立站运营', '独立站 seo', '独立站引流', '谷歌 seo', 'google seo', '谷歌广告', '邮件营销', 'edm', 'cold email',
];
const GENERIC_SIGNALS = [
  '入门', '新手', '小白', '零基础', '副业', '个人博客', '怎么开始', 'how to start', 'beginner',
  '通俗易懂', '科普', '趣味', '涨粉', '自媒体', '学生', '作业', '通俗', '十分钟看懂', '一文搞懂',
  '保姆级', '傻瓜', '手把手教', '图解', '什么是', 'what is',
];

// ---------------- 写给自己的「做中学」项目种子 ----------------
const SELF_PROJECTS = {
  'LifelineVerve插件': ['lifelineverve', '恒线智讯', '外贸独立站 ai', '独立站 ai 助手', 'wp 插件', 'wordpress 插件', '询盘助手', 'ai 客服'],
  'B2B双站内容管线': ['plasticxperts', 'custommetalpro', '英文文章', '自动发布', '每天发', '内容管线', 'b2b 站', '英文 seo'],
  '瑞诚外贸业务': ['瑞诚', '询盘', '客户开发', '开发信', 'rfq', '买家画像', '外贸业务'],
  '博客SEO与GEO': ['geo 优化', 'ai 引用', '博客 seo', '本站', '技术 seo', 'ai 可见性'],
};

const OFFBRAND = ['游戏', '娱乐', '小说', '影视', '剧', '股票', '基金', '理财', '期货', '彩票', '加密货币', '炒币', '政治', '八卦', '明星', '美妆', '护肤', '穿搭', '美食探店'];
const INTENT_WORDS = ['怎么', '如何', '为什么', '怎样', '教程', '指南', '什么是', '步骤', '入门', '实操', '例子'];

// ---------------- 矩阵覆盖（进程内只扫一次）----------------
let _coverage = null;
function getCoverage() { if (_coverage === null) _coverage = cm.buildCoverage(); return _coverage; }

// 由命中的轴 + 外贸语境推导「建议栏目」
function suggestColumn(ax, ft) {
  if (ax.AI) return 'AI内容增长';
  if (ax.SEO || ax.GEO) return 'SEO与Google Ads';
  if (ax.WP) return '博客建站与前端';
  if (ft) return '外贸B2B独立站';
  return '效率工具与软件';
}

// ---------------- 评分 ----------------
function scoreCandidate(text, prof, opts) {
  opts = opts || {};
  const lower = text.toLowerCase();
  const cov = opts.coverage || getCoverage();
  const { ax, ft } = cm.classify(lower);
  const axesHit = cm.AXIS_ORDER.filter((a) => ax[a]);
  const axesCount = axesHit.length;
  const cell = cm.cellKey(ax, ft);

  const reason = [];
  let score = 0;

  // 红线
  const off = OFFBRAND.find((w) => text.includes(w));
  if (off) {
    return { text, cell, axes: axesHit, ft, bestCol: suggestColumn(ax, ft), score: -99, decision: 'DROP', reason: '⛔ 命中 off-brand「' + off + '」直接 DROP', proTier: 'off', linkable: [] };
  }

  // 1) 矩阵契合
  if (axesCount >= 2) {
    score += 3; reason.push('命中矩阵 ' + axesHit.map((a) => cm.AXIS_NAMES[a]).join('×') + ' 交叉(双轴+) +3');
  } else if (axesCount === 1) {
    score += 1; reason.push('仅单轴『' + cm.AXIS_NAMES[axesHit[0]] + '』+1（偏通用，需交叉才立项）');
  } else {
    score -= 2; reason.push('未命中任一主题轴 -2');
  }
  // 2) 垂直对齐
  if (ft) { score += 2; reason.push('外贸运营网站语境 +2'); }

  // 3) 填空白格（用户内容矩阵的缺口 → 高优先）
  if (cell && cm.TARGET_CELLS.includes(cell)) {
    const g = cm.gapWeight(cell, cov);
    if (g.count === 0) { score += 3; reason.push('填补空白矩阵格『' + cell + '』(现0篇) +3'); }
    else if (g.count <= 1) { score += 2; reason.push('补薄弱矩阵格『' + cell + '』(' + g.count + '篇) +2'); }
    else if (g.count <= 2) { score += 1; reason.push('补矩阵格『' + cell + '』(' + g.count + '篇) +1'); }
  }

  // 4) 专业度闸门
  let operatorHits = 0, genericHits = 0;
  for (const w of OPERATOR_SIGNALS) if (lower.includes(w.toLowerCase())) operatorHits++;
  for (const w of GENERIC_SIGNALS) if (lower.includes(w.toLowerCase())) genericHits++;
  let proTier = 'generic';
  if (genericHits > 0 && operatorHits === 0) proTier = 'beginner';
  else if (operatorHits >= 1) proTier = 'operator';
  if (proTier === 'beginner') {
    if (score >= 5) score -= 1;
    reason.push('⚠️ 含入门/个人向信号（无操盘手语境）→ 非独立站运营视角');
  } else if (proTier === 'generic') {
    reason.push('贴标签但缺外贸/独立站/商业转化实战信号（operator ' + operatorHits + '）→ 偏通用技法');
  } else {
    if (operatorHits >= 2) { score += 1; reason.push('✓ 含操盘手/商业实战信号(operator ' + operatorHits + ') 专业度 +1'); }
    else reason.push('✓ 含操盘手/商业实战信号(operator 1) 专业度达标');
  }

  // 5) 做中学
  let selfProj = null;
  for (const [proj, kws] of Object.entries(SELF_PROJECTS)) {
    if (kws.some((k) => lower.includes(k.toLowerCase()))) { selfProj = proj; break; }
  }
  if (selfProj) { score += 2; reason.push('关联你在做的『' + selfProj + '』+2（做中学·高积累）'); }

  // 6) 采用反馈闭环
  const fbw = getFeedbackWeights();
  const adoptW = fbw.adoptW || {}, skipW = fbw.skipW || {};
  let adoptSum = 0, skipSum = 0;
  for (const [kw, w] of Object.entries(adoptW)) if (lower.includes(kw.toLowerCase())) adoptSum += w;
  for (const [kw, w] of Object.entries(skipW)) if (lower.includes(kw.toLowerCase())) skipSum += w;
  if (adoptSum > 0) { const b = Math.min(2, Math.round(adoptSum * 10) / 10); score += b; reason.push('采用反馈偏好 +' + b); }
  if (skipSum > 0) { const p = Math.min(2, Math.round(skipSum * 10) / 10); score -= p; reason.push('长期跳过类型 -' + p); }

  // 7) 搜索意图
  if (INTENT_WORDS.some((w) => text.includes(w))) { score += 1; reason.push('信息意图词 +1'); }

  // 决策
  let decision;
  if (axesCount >= 2 && ft) decision = 'KEEP';
  else if (score >= 5) decision = 'KEEP';
  else if (score >= 2) decision = 'REVIEW';
  else decision = 'DROP';
  // 专业度兜底：入门向 / 零商业语境即便分数够也不自动 KEEP
  if ((proTier === 'beginner' || proTier === 'generic') && decision === 'KEEP') {
    decision = 'REVIEW';
    reason.push('→ 降 REVIEW：需你带一手操盘手角度才立项');
  }

  // ★ 博客真实语境闸门（blog-grounding）：矩阵标签匹配 ≠ 贴你的博客。
  //   通用行业资讯/厂商·平台发布/新闻复述/泛 SEO·AI 科普，即便矩阵轴命中也不自动 KEEP，
  //   必须能写成「你（外贸独立站实操）怎么做」才放行。
  const g = groundingGate(text, { demand: demandFor(text) });
  if (g.verdict === 'ALIGN') {
    score += 1; reason.push('✓ 命中博客真实语境（ALIGN '+g.reasons[0]+'）+1');
  } else if (g.reframe) {
    if (decision === 'KEEP') decision = 'REVIEW';
    reason.push('⚠️ 博客语境闸门（REFRAME）：' + g.reasons.join('；') + ' → 降 REVIEW：站外新料需你从外贸独立站实操视角转译才立项');
  }

  const linkable = cm.linkTargets(text, cov, 4);
  return { text, cell, axes: axesHit, ft, bestCol: suggestColumn(ax, ft), score, decision, reason: reason.join('；'), proTier, linkable };
}

// ---------- 采用反馈（A 闭环）----------
let _feedbackWeights = null;
function getFeedbackWeights() {
  if (_feedbackWeights === null) {
    try {
      const rf = require('./radar-feedback');
      _feedbackWeights = rf.buildWeights(rf.loadFeedback());
    } catch (e) { _feedbackWeights = { adoptW: {}, skipW: {} }; }
  }
  return _feedbackWeights;
}

// 列 → 关键词表（供 topic-radar buildGaps 做「站内缺口候选池」信号 B 分析）。
// 与内容矩阵轴（AI/SEO/GEO/WP）+ 外贸语境同源，保证方向一致，不回到泛关键词。
const COLUMN_KEYWORDS = {
  '效率工具与软件': ['工具', '软件', '效率', '自动化', '插件', '笔记', 'notion', 'obsidian', 'workflow', '脚本'],
  '外贸B2B独立站': ['外贸', 'b2b', '独立站', '跨境', '询盘', 'rfq', '出海', '出口', 'alibaba', '国际站', 'shopify', '获客', '转化'],
  '博客建站与前端': ['wordpress', 'wp', '建站', '博客', '前端', '主题', 'hexo', 'cms', '页面构建', '模板', '古腾堡'],
  'AI内容增长': ['ai', '人工智能', 'gpt', '大模型', 'llm', '智能体', 'agent', 'aigc', 'ai写作', '提示词', 'prompt', 'cursor', 'copilot'],
  '数字生活': ['生活', '笔记', '个人', '日常', '记录', '习惯', '阅读'],
  'SEO与Google Ads': ['seo', '谷歌', 'google', '搜索', '排名', '关键词', 'sem', 'ads', '广告', '流量', '外链', '索引', 'serp', '收录'],
};

module.exports = { scoreCandidate, OFFBRAND, INTENT_WORDS, getCoverage, suggestColumn, COLUMN_KEYWORDS };

// ---------------- CLI ----------------
if (require.main === module) main();
function main() {
  let candidates = [];
  if (inFile) candidates = fs.readFileSync(inFile, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  else if (query) candidates = [query];
  else { console.error('用法：node tools/topic-fit-scorer.js --in <候选文件> | --query "..." [--min <n>] [--json <path>]'); process.exit(1); }

  const cov = getCoverage();
  const results = candidates.map((c) => {
    const [kw, note] = c.split('|').map((s) => s.trim());
    const r = scoreCandidate(kw, null, { coverage: cov });
    return { ...r, note: note || '' };
  }).sort((a, b) => b.score - a.score);

  const shown = results.filter((r) => r.score >= minScore);
  const W = (s, n) => String(s).padEnd(n);
  const lines = [];
  lines.push('🔎 选题筛选器（内容矩阵驱动）｜ 实时覆盖单元格数：' + Object.keys(cov).length);
  lines.push('—'.repeat(70));
  lines.push(W('决策', 8) + W('分', 4) + W('矩阵格', 22) + '候选 / 理由');
  lines.push('—'.repeat(70));
  for (const r of shown) {
    lines.push(W(r.decision, 8) + W(r.score, 4) + W(r.cell || '—', 22) + r.text + (r.note ? '  («' + r.note + '»)' : '') + '\n      ↳ ' + r.reason);
  }
  const counts = { KEEP: 0, REVIEW: 0, DROP: 0 };
  results.forEach((r) => counts[r.decision]++);
  lines.push('—'.repeat(70));
  lines.push(`结论：KEEP ${counts.KEEP} ｜ REVIEW ${counts.REVIEW} ｜ DROP ${counts.DROP}`);
  console.log(lines.join('\n'));
  if (jsonOut) { fs.writeFileSync(jsonOut, JSON.stringify(results, null, 2)); console.log('\n✅ 结果 JSON 已落盘：' + jsonOut); }
}
