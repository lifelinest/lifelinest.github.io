/**
 * topic-strategy.js — 「站在博主角度」的意图驱动选题器（v3 · 招牌锚定 + 真实搜索补量）
 * ------------------------------------------------------------------
 * 站在孟凡宇（外贸B2B独立站运营者）角度：
 *   1) 每根支柱先定义「写给谁 / 为什么写 / 你有什么真实经验可答」
 *   2) 【招牌锚定】先列你真能写、贴合定位的招牌选题（你的声音，不被工具词淹没）
 *      每条去 demand.json 验证「有人搜」：命中→标真实搜索词；未命中→标长尾待确认
 *   3) 【真实搜索补量】demand.json 里戳中你经验的词，按读者意图分类、语义去重、核心资产优先，
 *      补在招牌之后，凑足每柱可写量；其余进「待认领」不瞎编
 *   4) 站内审计/运维压到附录
 * 用法：node tools/topic-strategy.js [--top=N]
 */
const fs = require('fs');
const path = require('path');

const TMP_DIR = 'D:/1/1/.tmp/topic-strategy';
fs.mkdirSync(TMP_DIR, { recursive: true });
const demandPath = 'D:/1/1/.tmp/demand/demand.json';

// ───────── 1. 支柱定义 + 招牌锚定选题 ─────────
const PILLARS = {
  '外贸B2B独立站': {
    persona: '想做/刚做外贸独立站的运营者、被阿里国际站压价的工厂老板、想摆脱平台抽成的业务员',
    purpose: '用瑞诚 247 条真实询盘 + 双站实操，帮他们少踩坑、真正拿到询盘',
    hit: ['外贸', '独立站', '询盘', '开发信', 'b2b', '获客', '阿里国际站', '建站', '收款', '支付', '引流', '客户', '工厂', '社媒'],
    // 招牌选题：你真能写、贴合定位；kw 用于在 demand 里找对应真实搜索词
    anchors: [
      { title: 'AI 写的外贸开发信，怎么写出高回复率（瑞诚 247 询盘实证）', intent: 'tpl', angle: '拿瑞诚 247 条询盘里高回复率开发信的真实结构', kw: ['开发信', '回复率'] },
      { title: '外贸独立站从 0 到第一封真实询盘，我踩过的 10 个坑', intent: 'guide', angle: '拿我双站实操踩过的坑当反面教材', kw: ['第一封询盘', '从0到询盘', '独立站 拿询盘', '踩坑 独立站'] },
      { title: '阿里国际站 vs 独立站：被抽成压价后我为什么转独立站', intent: 'vs', angle: '用我被平台压价后转独立站的真实经历', kw: ['阿里国际站', '独立站'] },
      { title: '外贸独立站怎么用 AI 内容拿到真实询盘，而不是泛流量', intent: 'guide', angle: '用我 AI 写外贸 B2B 文章 13 步里的获客打法', kw: ['ai写外贸', '内容 获客', '外贸 ai 询盘', '询盘 内容'] },
      { title: '外贸独立站建站到底要花多少钱？我替新手算过真实一笔账', intent: 'cost', angle: '拿我双站实操踩过的坑当反面教材', kw: ['建站多少钱', '独立站'] },
    ],
  },
  'SEO与Google Ads': {
    persona: '想从谷歌拿免费/付费流量但卡在收录、排名、广告的独立站运营者',
    purpose: '给可落地的 SEO/Ads 排错与搭建流程，解决「收录掉/排名上不去/广告烧钱没询盘」',
    hit: ['谷歌', 'google', 'seo', '收录', '排名', '关键词', '广告', 'ads', '索引', '外链', '网站'],
    anchors: [
      { title: '网站收录了又不见了？我排查谷歌收录掉的 6 个真实原因', intent: 'fix', angle: '用我排查谷歌收录掉的真实步骤', kw: ['收录了又不见了', '收录'] },
      { title: '谷歌把我的文章降权了，怎么救（别乱改）', intent: 'fix', angle: '拿我 SEO 技术体检清单逐项过', kw: ['网站降权', '谷歌降权', '被降权'] },
      { title: '独立站谷歌广告烧钱没询盘？我调整投放的实操', intent: 'guide', angle: '结合我谷歌广告投放实操里烧过的钱', kw: ['广告', '投放'] },
      { title: '外贸独立站 SEO 技术体检清单：速度 / 结构化数据 / 索引', intent: 'guide', angle: '拿我 SEO 技术体检清单里的逐项检查', kw: ['seo 技术体检', '技术体检', '网站 体检', 'seo 体检'] },
      { title: '关键词研究怎么做才不瞎猜？我用的方法', intent: 'guide', angle: '把我 abbrlink 与 SEO 配合的经验讲透', kw: ['关键词研究', '关键词'] },
    ],
  },
  'AI内容增长': {
    persona: '想用 AI 提效、又怕被谷歌惩罚/怕 GEO 失效的独立站内容运营者',
    purpose: '证明 AI 能写，但要守住 SEO/E-E-A-T/GEO，把 AI 变成「可引用、可排名」的内容线',
    hit: ['ai', '人工智能', '写作', '提示词', '大模型', 'llms', 'geo', '内容', 'cherry', 'chatlog', '工作流', '外贸文章'],
    anchors: [
      { title: 'AI 写的外贸文章怎么不被谷歌判 spam？我的 13 步守门法', intent: 'guide', angle: '拿我 AI 写外贸 13 步里的 E-E-A-T 守门动作', kw: ['ai', '写作', '外贸', 'spam', 'e-e-a-t'] },
      { title: 'llms.txt 和 Schema 怎么配，让 AI 引擎推荐你的独立站', intent: 'guide', angle: '用我给博客配 llms.txt + Schema 的实操当例子', kw: ['llms', 'schema'] },
      { title: 'GEO 是什么，独立站怎么让 Perplexity / ChatGPT 引用你', intent: 'concept', angle: '结合 GEO 决策证据里「AI 引用到底来没来」的复盘', kw: ['geo'] },
      { title: '用 ChatLog 把客户聊天记录变成内容选题（我的流水线）', intent: 'guide', angle: '用我 ChatLog 把聊天变选题的流水线', kw: ['chatlog', '选题'] },
      { title: '外贸站一篇 AI 文章怎么同时吃谷歌排名和 AI 引用', intent: 'guide', angle: '用我双站内容生产的一手数据', kw: ['ai', '排名', '引用', 'geo'] },
    ],
  },
};

// ───────── 2. 读者意图标签 ─────────
function intentLabel(intent) {
  return {
    fix: '排错救命 · 读者正遇问题，搜来救火',
    cost: '成本决策 · 读者犹豫花不花钱、花多少',
    tpl: '模板实操 · 读者要能直接抄的结构/话术',
    vs: '对比清单 · 读者在选工具/平台，怕选错',
    concept: '概念扫盲 · 读者被术语绕晕，要落地解释',
    guide: '上手指南 · 读者想从 0 做，要步骤',
  }[intent] || '上手指南 · 读者想从 0 做，要步骤';
}

// 在 demand 里为招牌选题找对应真实搜索词（取最贴合：最长匹配词 + 最高验证强度）
function findDemandWord(gaps, kw) {
  let best = null, bestScore = -1;
  for (const k of kw) {
    for (const g of gaps) {
      if (!g.word.toLowerCase().includes(k.toLowerCase())) continue;
      const s = k.length * 10 + (g.hits || 0); // 匹配词越长、验证引擎越多越优
      if (s > bestScore) { bestScore = s; best = g; }
    }
  }
  return best;
}

// ───────── 3. 真实搜索词补量：分类 / 去重 / 核心优先 ─────────
function classifyIntent(w) {
  if (/不见了|没了|被k|降权|打不开|报错|失败|异常|没收录|不收录|掉排名|封号|跑路|坑了|怎么办|怎么救|出问题/.test(w)) return 'fix';
  if (/多少钱|费用|价格|收费|预算|贵不贵|划算|成本|报价/.test(w)) return 'cost';
  if (/模板|怎么写|标题|主题|范文|话术|脚本|文案|回复率|怎么回复|英文模板/.test(w)) return 'tpl';
  if (/有哪些|哪些平台|哪个好|推荐|排行|一览|对比|区别|vs|还是|平台|渠道|软件|工具|助手|网站|系统|服务商|控制台|生成器|有哪些好/.test(w)) return 'vs';
  if (/是什么意思|是什么|百科|概念|术语|科普|干嘛的|干嘛用|是什么东西/.test(w)) return 'concept';
  return 'guide';
}
function makeTitle(intent, w) {
  const word = w.replace(/[?？]$/, '');
  switch (intent) {
    case 'fix': return `${word}？我按这个顺序排查，八成能救回来（附真实原因）`;
    case 'cost': return `${word}？我替新手算过真实一笔账，别被服务商报价带偏`;
    case 'tpl': return `${word}：我写过/用过的高转化结构，框架直接抄`;
    case 'vs': return `${word}？我筛完主流选项，独立站运营真正用得上的其实就这几类`;
    case 'concept': return `${word}？别背定义，说清楚对你独立站到底有什么用`;
    default: return `${word}：我自己的实操流程，每一步都标了踩坑点`;
  }
}
function isAnswerable(def, w) {
  const lw = w.toLowerCase();
  return def.hit.some((k) => lw.includes(k.toLowerCase()));
}
function score(def, w) {
  const lw = w.toLowerCase();
  let s = def.hit.some((k) => lw.includes(k.toLowerCase())) ? 1 : 0;
  if (def.core && def.core.some((k) => lw.includes(k.toLowerCase()))) s += 2;
  return s;
}
const FILLER = ['有哪些', '哪些平台', '哪些', '有什么', '好用', '免费', '网站', '软件', '工具', '助手',
  '平台', '渠道', '系统', '控制台', '生成器', '排行', '推荐', '一览', '对比', '区别', '哪个好',
  '官网', '入口', '英文', '模板', '怎么做', '怎么写', '大全', '前十', '卖家', '买家',
  '环球资源网', '都有哪些', '官网入口', '卖家入口', '买家入口', '都', '的', '吗', '呢'];
function rootOf(w) {
  let r = w.toLowerCase().split('-')[0].split('·')[0]; // 去掉「-品牌」「·品牌」后缀
  for (const f of FILLER) r = r.split(f).join('');
  return r.replace(/\s+/g, '');
}
function dedupe(gaps) {
  const map = new Map();
  for (const g of gaps) {
    const r = rootOf(g.word); const prev = map.get(r);
    if (!prev) { map.set(r, g); continue; }
    const sp = g.hits || 0, pp = prev.hits || 0;
    if (sp > pp || (sp === pp && g.word.length > prev.word.length)) map.set(r, g);
  }
  return [...map.values()];
}

// ───────── 4. 主流程 ─────────
function main() {
  const args = process.argv.slice(2);
  const topN = parseInt((args.find((a) => a.startsWith('--top=')) || '--top=12').split('=')[1], 10) || 12;

  if (!fs.existsSync(demandPath)) {
    console.error('[topic-strategy] 找不到 demand.json，先跑 npm run demand 抓取搜索需求');
    process.exit(1);
  }
  const demand = JSON.parse(fs.readFileSync(demandPath, 'utf8'));
  const gaps = (demand.gaps || []).filter((g) => !g.covered);

  const today = new Date().toISOString().slice(0, 10);
  const L = [];
  L.push(`# 意图驱动选题 · ${today}`);
  L.push('');
  L.push('> **逻辑（站在你角度）**：先定每根支柱「写给谁 / 为什么写 / 你有什么真实经验可答」；');
  L.push('> 先列 **你的招牌选题**（贴合定位、你真能写），再去 demand.json 验证「有人搜」；');
  L.push('> 再用真实搜索词补量。站内审计/运维见附录，不抢选题篇幅。');
  L.push('');

  let total = 0;
  for (const [col, def] of Object.entries(PILLARS)) {
    L.push(`## ${col}`);
    L.push('');
    L.push(`- **写给谁**：${def.persona}`);
    L.push(`- **为什么写**：${def.purpose}`);
    L.push('');

    // —— A. 招牌选题（优先）——
    L.push('### A. 你的招牌选题（优先写，贴合定位）');
    L.push('');
    L.push('| # | 读者意图 | 选题（你的声音） | 真实搜索词验证 | 你的角度 |');
    L.push('|---|---|---|---|---|');
    def.anchors.forEach((a, i) => {
      const d = findDemandWord(gaps, a.kw);
      const verified = d ? `${d.word}（${d.engines.join('/')} 验证）` : '长尾 · demand 未直接命中，需你确认有人搜';
      L.push(`| ${i + 1} | ${intentLabel(a.intent)} | ${a.title} | ${verified} | ${a.angle} |`);
    });
    total += def.anchors.length;
    L.push('');

    // —— B. 真实搜索词补量（去重/核心优先，排除与招牌过近的）——
    const anchorWords = def.anchors.flatMap((a) => a.kw.map((k) => k.toLowerCase()));
    const pg = gaps.filter((g) => g.column === col && isAnswerable(def, g.word));
    const deduped = dedupe(pg);
    deduped.sort((a, b) => {
      const sa = score(def, a.word), sb = score(def, b.word);
      if (sb !== sa) return sb - sa;
      return (b.hits || 0) - (a.hits || 0);
    });
    // 排除与招牌 kw 高度重叠的词
    const extra = deduped.filter((g) => !anchorWords.some((k) => g.word.toLowerCase().includes(k))).slice(0, Math.max(0, topN - def.anchors.length));
    if (extra.length) {
      L.push(`### B. 真实搜索词补量（${extra.length} 条 · 戳中你经验、有人搜）`);
      L.push('');
      L.push('| # | 读者意图 | 具体选题 | 真实搜索词 |');
      L.push('|---|---|---|---|');
      extra.forEach((g, i) => {
        const intent = classifyIntent(g.word);
        L.push(`| ${i + 1} | ${intentLabel(intent)} | ${makeTitle(intent, g.word)} | ${g.word}（${g.engines.join('/')} 验证） |`);
      });
      total += extra.length;
      L.push('');
    }
  }

  L.push('---');
  L.push('');
  L.push('## 附录 · 站内缺口词（候选池，非选题）');
  for (const col of Object.keys(PILLARS)) {
    const pg = gaps.filter((g) => g.column === col);
    L.push(`- **${col}**（未覆盖 ${pg.length} 词）`);
  }
  L.push('');
  L.push('> 效率工具/数字生活/建站前端按定位红线不产出选题，仅你主动要求时补充。');
  L.push('');
  L.push(`✅ 意图驱动选题生成完毕 · 共 ${total} 条（每柱：招牌 ${Object.values(PILLARS).map((p) => p.anchors.length).join('+')} + 真实搜索补量）`);
  L.push(`📁 ${path.join(TMP_DIR, today + '.md')}`);

  const out = L.join('\n');
  fs.writeFileSync(path.join(TMP_DIR, today + '.md'), out, 'utf8');
  fs.writeFileSync(path.join(TMP_DIR, 'latest.md'), out, 'utf8');
  console.log(out);
}

main();
