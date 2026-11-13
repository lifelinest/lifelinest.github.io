#!/usr/bin/env node
/**
 * tools/blog-grounding.js —— 「以博客真实语境为锚」的选题定位闸门（2026-10-30 重做版）
 * ------------------------------------------------------------------
 * 解决什么：原版有两个致命问题，导致用户觉得「选题和我的博客没半毛钱关系 / 标准不可信」：
 *   1) 不稳定：同一选题喂「标题」给 REFRAME、喂「正文」给 ALIGN（因 SPECIFIC_ANCHORS 是子串硬匹配）。
 *   2) 过窄：强制每条都带「瑞诚/塑料金属/询盘成本」锚点才放行，把用户认可的
 *      「支柱补位 + 受众真正需要的常青内容」（如面向外贸独立站运营者的 SEO 工具清单）误杀成 REVIEW。
 *
 * 新版设计原则（用户 2026-10-30 明确要求：数据驱动 + 可重复实验 + 所有选题必先过闸）：
 *   - ALIGN 主线 = 支柱贴合（你的栈/业务）+ 受众对口（外贸独立站运营者/SEO·GEO 从业者）+ 真实需求信号。
 *     三者满足其一即可 ALIGN；「具体角度锚」（瑞诚/双站/制造业B2B 一手经验）降为【加分 + 编辑建议】，不再拦截。
 *   - 仍保留对「来源/类型」的 REFRAME 红线：厂商·平台发布、巨头新闻复述、只讲你不用平台、泛资讯无需求 —— 这些需你转译才立项。
 *   - 接真实需求数据层：opts.demand（0..1，来自 topic-demand.js / 51.la / GSC）作为 ALIGN 置信加成。
 *   - 同一选题无论喂标题还是正文，结论稳定（不再因片段长度翻转）。
 *
 * 契约不变：groundingGate(text[, opts]) -> {verdict:'ALIGN'|'REFRAME'|'OFF', penalty, reasons[], align, reframe}
 *   - topic-fit-scorer.js 以单参调用，完全向后兼容（opts 缺省 demand=0）。
 */
'use strict';

// ---------------- 博客真实身份（选题必须锚定这些，否则不算「你的博客」）----------------
const BLOG_IDENTITY = {
  who: '瑞诚外贸业务负责人 + 个人博客主（mfy-lifeline.com），做 B2B 外贸独立站运营、Google SEO 与 Ads',
  realBusiness: ['247 条真实询盘', 'plasticxperts.com', 'custommetalpro.com 双站'],
  stack: [
    'WordPress（客户站/英文站）', 'Hexo + AnZhiYu（本博客）', '自建外贸独立站',
    'AI 工作流（Cherry Studio / ChatLog / Napkin）', '51.la / GSC 真实数据',
  ],
  audience: ['外贸独立站运营者', 'SEO·GEO 从业者'],
  voice: '操作级、真实数据、一手经验；不自我举证、不为管线凑内容；SEO/GEO 标记不进可见正文',
  notThis: [
    'Shopify 专门店', 'SaaS 产品评测站', 'Google/百度 新闻博客',
    '纯 AI 科普站', '泛互联网资讯站',
  ],
};

// 你实际会用、能写一手经验的平台/主题（命中 → 放行/加分）
const ALIGN_SIGNALS = [
  'wordpress', 'wp ', 'woocommerce', 'hexo', 'anzhiyu', '自建站', '独立站', '外贸独立站',
  '外贸b2b', '外贸 b2b', 'b2b', '跨境', '询盘', 'rfq', '开发信', '买家', '采购',
  'plasticxperts', 'custommetalpro', '瑞诚', '谷歌 seo', 'google seo', '谷歌广告', 'google ads',
  'geo', 'ai 引用', 'ai 可见性', '内容矩阵', 'e-e-a-t', 'eeat', 'schema', 'llms.txt',
  'cherry studio', 'chatlog', 'napkin', 'ai 写作', 'ai工作流', '内容管线', '英文站', '英文文章',
  '落地页', 'landing page', '转化', '线索', '询盘转化', 'seo', 'sem', 'ads', 'gmc', 'google merchant',
  '收录', '排名', '流量增长', '内容策略', '老内容', '翻新', '内容更新', '文章', '博客',
  '关键词', '外链', '搜索', 'serp',
];

// 受众对口信号：只要主题服务于「外贸独立站运营者 / SEO·GEO 从业者」即算（即便没点名你的业务）
const AUDIENCE_SIGNALS = [
  '外贸', '独立站', 'b2b', '跨境', '出海', '询盘', 'rfq', '买家', '采购', '供应商', '制造商', '工厂',
  '谷歌 seo', 'google seo', 'seo', '搜索排名', '关键词', '外链', 'sem', 'ads', 'google ads', 'gmc',
  'geo', 'ai 引用', 'ai 可见性', 'e-e-a-t', 'schema', '站长', '运营', '获客', '转化', '线索',
  'landing', '落地页', '内容策略', '老内容', '翻新', '外贸独立站运营',
];

// 你不用 / 不评测、且只讲它自己的平台（命中且未落到你实际栈/受众 → 需转译，不能自动 KEEP）
const REFRAME_PLATFORMS = [
  'shopify', 'shopify plus', 'bigcommerce', 'squarespace', 'wix', 'sapo', '有赞', '微店',
  'saas', '订阅制', 'no-code 平台', '低代码平台',
];

// 厂商/平台「发布了 X」的新品复述模式（命中 → REFRAME：无你可执行角度）
const VENDOR_ANNOUNCE = [
  /\b(introduc\w*|launch\w*|releas\w*|unveil\w*|announc\w*|rolls? out|debut\w*|推出|发布|上新)\b/i,
  /\b(new (feature|version|update|model|tool)|新版|新功能|新版本)\b/i,
];

// 平台/巨头「改了 X」的新闻复述（命中 → 视是否命中你支柱决定 ALIGN/REFRAME）
const NEWS_RECAP = [
  /\b(google|谷歌|bing|microsoft|meta|openai|百度|字节|apple)\b.{0,50}\b(update(s|d)?|change(s|d)?|rolls? out|launches?|推出|调整|更新|改版|新政|新算法|core update|核心更新)\b/i,
  /\b(privacy|隐私|algorithm|算法|policy|政策|core update|核心更新|guideline|指南更新)\b/i,
];

// 命中你真实项目/业务 → 直接 ALIGN，覆盖一切
const SELF_PROJECT_KEYS = [
  '瑞诚', '询盘', 'plasticxperts', 'custommetalpro', 'mfy-lifeline', '博客 seo',
  'geo 优化', 'ai 引用', 'lifelineverve', '恒线',
];

// 「具体角度锚」：你的一手资产/niche/读者阶段打法。新版【不再拦截】，命中则加分 + 给「建议补」提示。
const SPECIFIC_ANCHORS = [
  '瑞诚', '双站', 'plasticxperts', 'custommetalpro', '51.la', 'gsc', '搜索控制台',
  '塑料', '金属', '注塑', '机加工', '阀门', '湿巾', '认证', 'sgs', 'tüv', 'tuv', 'oeke', 'oeko',
  'moq', '验厂', '报价', '样品', '交期', '模具', '开发信', '产品页', '询盘成本', 'cpl', 'cpa',
  '收录', '降权', '排名掉了', '0到1', '从 0', '建站', '选品', '客户', '采购', '买家', '翻新', '老内容',
  'schema', 'llms', 'geo', 'chatgpt', 'perplexity', 'ai mode', 'ai 概览', 'ai overview',
  '踩坑', '复盘', '我给', '我让', '我们', '实测', '案例',
];

/**
 * 选题定位闸门：给定一条候选文本（标题或正文皆可，结论稳定），返回是否「贴你的博客」。
 * @param {string} text
 * @param {{demand?:number}} [opts] demand: 0..1 真实需求信号（来自 topic-demand.js / 51.la / GSC）
 * @returns {{verdict:'ALIGN'|'REFRAME'|'OFF', penalty:number, reasons:string[], align:boolean, reframe:boolean}}
 */
function groundingGate(text, opts) {
  opts = opts || {};
  const t = String(text || '');
  const lower = t.toLowerCase();
  const reasons = [];
  const demand = typeof opts.demand === 'number' ? Math.max(0, Math.min(1, opts.demand)) : 0;

  // 0) 命中你真实项目/业务 → 直接 ALIGN（最高优先，覆盖一切）
  if (SELF_PROJECT_KEYS.some((k) => lower.includes(k))) {
    return { verdict: 'ALIGN', penalty: 0, reasons: ['命中你真实项目/业务（瑞诚/双站/本博客技术）→ 直接 ALIGN'], align: true, reframe: false };
  }

  const alignHit = ALIGN_SIGNALS.some((k) => lower.includes(k));
  const audienceHit = AUDIENCE_SIGNALS.some((k) => lower.includes(k));
  const reframePlatform = REFRAME_PLATFORMS.some((k) => lower.includes(k));
  // 「你怎么做」的可执行信号（有这些，说明能写成一手实操，而非复述新闻）
  // 「你怎么做」的可执行信号（有这些，说明能写成一手实操，而非复述新闻/产品发布）。
  // ⚠️ 只用「真教程框架词」，不放 优化/提升/搭建/配置/排查 这类泛词——它们常出现在产品介绍里，会误解除厂商发布的 REFRAME。
  const howToSignal = /(怎么|如何|实操|教程|步骤|复盘|踩坑|我们用|我给|我让|我把|从 0|清单|模板|策略|做好|必备|推荐|盘点|避坑|自查|手把手|一文搞懂|入门到精通)/.test(t);
  const isVendorAnnounce = VENDOR_ANNOUNCE.some((re) => re.test(t)) && !howToSignal;
  const isNewsRecap = NEWS_RECAP.some((re) => re.test(t));

  let verdict = 'ALIGN';

  // 1) 来源/类型红线：厂商发布、巨头新闻、只讲不用平台 → REFRAME（需你转译）
  if (isVendorAnnounce) {
    verdict = 'REFRAME';
    reasons.push('属厂商·平台「发布了 X」的新品复述，无「你怎么做」角度 → 需从一手运营视角转译才立项');
  } else if (isNewsRecap) {
    if (reframePlatform && !howToSignal) {
      verdict = 'REFRAME';
      const p = REFRAME_PLATFORMS.find((k) => lower.includes(k));
      reasons.push('平台「改了 X」新闻且只讲你不用/不评测的平台（' + p + '）→ 需转译成外贸独立站通用打法');
    } else if (alignHit) {
      verdict = 'ALIGN';
      reasons.push('行业大事（谷歌/AI 引擎变化）命中你支柱（外贸独立站/SEO/GEO/Ads），可写「影响 + 自查步骤」→ 放行');
    } else {
      verdict = 'REFRAME';
      reasons.push('平台/巨头「改了 X」新闻复述，你不是新闻博客、也未命中你支柱 → 需带外贸B2B独立站一手角度才立项');
    }
  } else if (reframePlatform && !alignHit && !audienceHit) {
    verdict = 'REFRAME';
    const p = REFRAME_PLATFORMS.find((k) => lower.includes(k));
    reasons.push('只讲你不用/不评测的平台（' + p + '），未落到你实际栈/受众 → 需转译');
  }

  // 2) 核心 ALIGN 判定：贴你的栈 / 业务 / 受众（支柱 + 受众对口即放行）
  //    稳定前提：不论喂标题还是正文，只要主题服务于支柱与受众，结论一致。
  //    ⚠️ 只有「未被来源/类型红线降级」的选题才进入此分支；步骤 1 判定为 REFRAME 的（厂商发布/新闻复述/只讲不用平台）绝不被覆盖回 ALIGN。
  if (verdict === 'ALIGN') {
    if (verdict !== 'ALIGN') {
      verdict = 'ALIGN';
      reasons.push('命中你实际栈/业务且对受众有用 → 放行');
    }
    // 一手角度锚：有则加分，无则给「建议补」而非降级
    const hasAnchor = SPECIFIC_ANCHORS.some((k) => lower.includes(k));
    if (hasAnchor) {
      reasons.push('含一手角度锚（瑞诚/双站/制造业B2B/询盘成本等）→ 一手可信度强，差异化高');
    } else {
      reasons.push('建议补一手瑞诚·双站·制造业B2B 角度（询盘成本/真实踩坑/双站实测），提升一手可信度与差异化（非拦截项）');
    }
    if (demand > 0) {
      reasons.push('真实需求信号命中（demand=' + demand.toFixed(2) + '）→ 受众确实在搜，优先级上调');
    }
  } else if (!alignHit && !audienceHit && !howToSignal && demand <= 0) {
    // 3) 兜底：既不命中栈/受众、又无实操、又无需求 → 泛资讯，REFRAME
    verdict = 'REFRAME';
    reasons.push('未命中你实际栈/业务/受众、无实操信号、也无真实需求数据 → 属泛 SEO·AI/建站资讯，需带外贸B2B独立站一手角度才立项');
  }

  const penalty = verdict === 'REFRAME' ? -4 : 0; // 足够把 KEEP 拉到 REVIEW（scorer 侧再强制 REVIEW，不会误 DROP）
  if (verdict === 'ALIGN' && !reasons.length) reasons.push('命中你实际栈/业务的一手实操角度');
  return { verdict, penalty, reasons, align: verdict === 'ALIGN', reframe: verdict === 'REFRAME' };
}

module.exports = {
  BLOG_IDENTITY, ALIGN_SIGNALS, AUDIENCE_SIGNALS, REFRAME_PLATFORMS, VENDOR_ANNOUNCE, NEWS_RECAP,
  SELF_PROJECT_KEYS, SPECIFIC_ANCHORS, groundingGate,
};
