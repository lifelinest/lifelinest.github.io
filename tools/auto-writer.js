#!/usr/bin/env node
/**
 * tools/auto-writer.js —— 自动成稿器（内容闭环里「写稿」那一环，此前完全缺失）
 * ------------------------------------------------------------------
 * 闭环原本长这样，中间断了一截：
 *   取数(fetch-stats) → 学习(insight) → 选题(topic-radar) → 规划(matrix-planner)
 *   → 工单(run-matrix) → [ ？ ] → 闸门(check-tags/seo) → 构建 → 发布 → 回流
 *                       ^^^^^^ 本工具补的就是这里
 *
 * 它把「选题/工单」变成一篇**可直接进闸门的草稿**，并强制守住站内既有红线：
 *   - tags 必须是规范 80 细分词原词（自动过滤非白名单词）
 *   - categories 必须是站内 6 栏目之一
 *   - 内链只能链向真实存在的站内文章（URL 由 find-related-posts 提供）
 *   - 图片只给占位注释，绝不写假 URL（图必须走图床上传，见 imgbed-rules）
 *   - 正文不出现任何 SEO/GEO 优化标记（读者的可见正文必须是纯内容）
 *   - 草稿落 source/_drafts/，**默认不参与构建**，人工过闸后才 mv 进 _posts
 *
 * 用法：
 *   # 1) 从一个种子自动跑完「规划 → 成稿」（最短路径，推荐）
 *   node tools/auto-writer.js --seed="外贸B2B独立站 客户开发"
 *
 *   # 2) 已有选题，直接成稿
 *   node tools/auto-writer.js --topic="怎么用AI写外贸开发信" --column=外贸B2B独立站 --tags=邮件营销,AI写作
 *
 *   # 3) 从矩阵规划表里取某一篇
 *   node tools/auto-writer.js --plan=D:/1/1/.tmp/matrix1.json --pick=2
 *
 *   # 4) 先看会喂给模型什么（不花钱、不联网）
 *   node tools/auto-writer.js --seed="..." --dry
 *
 * 常用开关：
 *   --lang=zh|en     正文语言（默认 zh；en 用于出海内容）
 *   --words=1500     目标字数（默认 1500 中文 / 1200 英文）
 *   --out=<path>     指定输出文件（默认 source/_drafts/<slug>.md）
 *   --force          覆盖已存在的同名草稿
 *   --no-related     不注入站内相关文内链
 *
 * 出口：草稿文件 + 「闸门 A 事实核对清单」（模型自曝的待核实断言）
 * 红线：本工具**只产出草稿**，不写入 _posts、不构建、不部署。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'source', '_posts');
const DRAFT_DIR = path.join(ROOT, 'source', '_drafts');
const TMP_DIR = 'D:/1/1/.tmp';
const KEY_FILE = path.join(ROOT, 'ai-summary-key.local');
const API_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1/chat/completions';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

// ---------------- 参数 ----------------
function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const kv = process.argv.find((a) => a.startsWith('--' + name + '='));
  return kv ? kv.slice(name.length + 3) : def;
}
function flag(name) { return process.argv.includes('--' + name); }

const OPT = {
  seed: arg('seed', ''),
  topic: arg('topic', ''),
  plan: arg('plan', ''),
  radar: arg('radar', ''),
  pick: Number(arg('pick', '1')),
  column: arg('column', ''),
  tags: arg('tags', '').split(',').map((s) => s.trim()).filter(Boolean),
  lang: arg('lang', 'zh'),
  words: Number(arg('words', '0')) || 0,
  out: arg('out', ''),
  force: flag('force'),
  dry: flag('dry'),
  noRelated: flag('no-related'),
};
// 裸 --radar（不带 =值）也要能被识别
const RADAR_ON = process.argv.some((a) => a === '--radar' || a.startsWith('--radar='));

// ---------------- 站内白名单（唯一权威：check-tags）----------------
const tagTool = require('./check-tags');
const MINORS = new Set(tagTool.MINORS instanceof Set ? [...tagTool.MINORS] : Object.keys(tagTool.MINORS || {}));
const CATEGORIES = tagTool.CATEGORIES.slice();

// ---------------- 已有 abbrlink（避免撞号）----------------
function existingAbbrs() {
  const set = new Set();
  let files = [];
  try { files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md')); } catch (e) { return set; }
  for (const f of files) {
    try {
      const m = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8').match(/^abbrlink:\s*(\S+)/m);
      if (m) set.add(m[1].trim());
    } catch (e) { /* ignore */ }
  }
  return set;
}
function newAbbr(used) {
  for (let i = 0; i < 50; i++) {
    const v = crypto.randomBytes(4).toString('hex');
    if (!used.has(v)) { used.add(v); return v; }
  }
  throw new Error('abbrlink 生成失败');
}

// ---------------- brief 解析 ----------------
function fromPlan() {
  let planFile = OPT.plan;
  if (!planFile) {
    // 自动找最近的矩阵规划
    try {
      const cands = fs.readdirSync(TMP_DIR).filter((f) => /^matrix.*\.json$/.test(f))
        .map((f) => ({ f: path.join(TMP_DIR, f), t: fs.statSync(path.join(TMP_DIR, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      if (cands.length) planFile = cands[0].f;
    } catch (e) { /* ignore */ }
  }
  if (!planFile || !fs.existsSync(planFile)) return null;
  const j = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const rows = j.rows || [];
  const idx = Math.max(0, Math.min(rows.length - 1, OPT.pick - 1));
  const r = rows[idx];
  if (!r) return null;
  return {
    source: '矩阵规划 ' + path.basename(planFile) + ' 第 ' + (idx + 1) + '/' + rows.length + ' 篇',
    role: r.role,
    title: r.title,
    column: OPT.column || r.col || j.column || '',
    tags: OPT.tags.length ? OPT.tags : (r.tags || []),
    keyword: r.kw || j.seed || '',
    intent: r.intent || '',
    linkSpec: r.link || '',
    seed: j.seed || '',
  };
}

function fromSeed() {
  const planFile = path.join(TMP_DIR, 'matrix-' + Date.now() + '.json');
  // matrix-planner 对无法归类的种子（典型是英文种子）会直接 DROP。
  // 英文稿在本站的归宿就是外贸支柱，所以 --lang=en 时自动补上栏目，免得用户撞到这个坑；
  // 显式给的 --column 永远优先。
  const column = OPT.column || (OPT.lang === 'en' ? '外贸B2B独立站' : '');
  const args = [path.join(__dirname, 'matrix-planner.js'), '--seed=' + OPT.seed, '--json=' + planFile];
  if (column) args.push('--column=' + column);
  process.stderr.write('[auto-writer] 正在用 matrix-planner 展开矩阵…' + (column && !OPT.column ? '（英文稿自动归入「' + column + '」）' : '') + '\n');
  try {
    execFileSync('node', args, {
      cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8', timeout: 120000,
    });
  } catch (e) {
    const detail = String(e.stderr || e.message || '').trim().split('\n')[0];
    throw new Error(
      '矩阵规划被拒：' + detail + '\n'
      + '  处理办法：显式指定栏目后重试，例如 --column=外贸B2B独立站；'
      + '或改用 --topic="完整标题" 直接成稿，跳过矩阵。',
    );
  }
  const j = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const rows = j.rows || [];
  const idx = Math.max(0, Math.min(rows.length - 1, OPT.pick - 1));
  const r = rows[idx] || {};
  return {
    source: '种子「' + OPT.seed + '」→ 矩阵第 ' + (idx + 1) + '/' + rows.length + ' 篇（规划表：' + planFile + '）',
    role: r.role,
    title: r.title,
    column: column || r.col || j.column || '',
    tags: OPT.tags.length ? OPT.tags : (r.tags || []),
    keyword: r.kw || OPT.seed,
    intent: r.intent || '',
    linkSpec: r.link || '',
    seed: OPT.seed,
    matrixRows: rows,
  };
}

function fromTopic() {
  return {
    source: '手动选题',
    role: '独立稿',
    title: OPT.topic,
    column: OPT.column || '',
    tags: OPT.tags,
    keyword: OPT.topic,
    intent: '由选题文本推断',
    linkSpec: '',
    seed: OPT.topic,
  };
}

// 从选题雷达的产物直接取题（把「数据 → 选题 → 成稿」这根线接上）
function radarJsonFile() {
  const dir = path.join(TMP_DIR, 'topic-radar');
  const named = path.join(dir, 'latest.json');
  if (fs.existsSync(named)) return named;
  try {
    // 只认 latest.json 与 YYYY-MM-DD.json，避开同目录的 sources-*.json（那是站外采集缓存）
    const cands = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => ({ f: path.join(dir, f), t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    if (cands.length) return cands[0].f;
  } catch (e) { /* ignore */ }
  return null;
}

function fromRadar() {
  const spec = OPT.radar === '' || OPT.radar === 'true' ? 'gap' : OPT.radar;
  const [kindRaw, nRaw] = spec.split(':');
  const kind = kindRaw === 'pick' ? 'pick' : 'gap';
  const n = Math.max(1, Number(nRaw || '1'));

  const f = radarJsonFile();
  if (!f) {
    throw new Error('找不到选题雷达产物。先跑 `npm run refresh`（或 `npm run topic:radar`）生成，再回来用 --radar。');
  }
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));

  if (kind === 'pick') {
    const picks = j.picks || [];
    if (!picks.length) {
      throw new Error('雷达里没有站外新料（picks 为空）。跑 `npm run refresh:full` 采集站外源后重试，或改用 --radar=gap。');
    }
    const p = picks[Math.min(n - 1, picks.length - 1)];
    const title = p.title || p.name || p.url || String(p);
    return {
      source: '选题雷达·站外新料 #' + n + '（' + path.basename(f) + '）',
      role: '新料成稿',
      title,
      column: OPT.column || p.column || '',
      tags: OPT.tags,
      keyword: p.keyword || title,
      intent: '信息（站外热点切入）',
      linkSpec: '',
      seed: title,
      radarFile: f,
    };
  }

  // gap：按优先级展开缺口词，第 n 个
  const gaps = j.gaps || [];
  const flat = [];
  gaps.forEach((g) => (g.words || []).forEach((w) => flat.push({
    column: g.column, isPillar: !!g.isPillar, word: w.word, docs: w.docs,
    demand: w.demand || 0, serp: w.serp || '',
  })));
  // 排序四段：
  //   ① 竞争判定（serp）分层 —— 与 tools/topic-radar.js 的 verdictRank 保持同一口径：
  //      0 已体检·内容词（最该动手）＞ 1 未判定（别当默认可写）＞ 2 平台垄断（能写但打不动）
  //      ＞ 3 商业/导航词垫底（用户搜它是想找供应商/安装包，写文章进去等于白写）。
  //   ② 有搜索需求（demand = 命中几个搜索引擎，越大越可信）
  //   ③ 支柱栏目  ④ 站内覆盖越少越好
  //   —— 只按 ②③④ 排（没有 ① 时）会挑出「需求高但根本不该写」的词，这是选词口径缺的最后一段。
  const verdictRank = (x) => {
    if (x.serp === '内容词') return 0;
    if (!x.serp) return 1;
    if (x.serp === '平台垄断') return 2;
    return 3;
  };
  const byPriority = (a, b) =>
    (verdictRank(a) - verdictRank(b)) || (b.demand - a.demand) ||
    (Number(b.isPillar) - Number(a.isPillar)) || (a.docs - b.docs);
  const ordered = flat.slice().sort(byPriority);
  if (!ordered.length) throw new Error('雷达里没有站内缺口词（gaps 为空）。');
  const g = ordered[Math.min(n - 1, ordered.length - 1)];
  // 同栏目其余缺口词：只靠一个泛词（如「大模型」）去查相关文会命中「火车模型」这类噪声，
  // 带上栏目名 + 兄弟缺口词才能把语义钉在正确的簇上。
  const siblings = flat.filter((x) => x.column === g.column && x.word !== g.word).slice(0, 6).map((x) => x.word);
  const queryHint = [g.word, g.column, ...siblings].filter(Boolean).join(' ');
  return {
    source: '选题雷达·缺口 #' + n + '（' + path.basename(f) + '｜' + g.column + (g.isPillar ? '·支柱' : '') +
      (g.demand ? '｜★有人在搜·' + g.demand + ' 个引擎命中' : '｜无搜索数据') +
      (g.serp ? '｜竞争判定：' + g.serp : '') + '｜该词现有 ' + g.docs + ' 篇）',
    role: '缺口补位稿',
    // 缺口词只是一个「词」，不是标题。交给模型拟标题，这里只给一个自拟占位，
    // 免得它把一个光秃秃的泛词当标题写。
    title: '（自拟：围绕『' + g.word + '』＋「' + g.column + '」栏目）',
    column: OPT.column || g.column,
    tags: OPT.tags,
    keyword: g.word,
    queryHint,
    siblingWords: siblings,
    intent: g.demand
      ? '搜索需求（这个词来自搜索引擎下拉建议，是真实用户在打的；标题要正对它）'
      : '信息（站内缺口，竞争空白）',
    linkSpec: '本页是该缺口的第一篇，应链向本站已有的同栏目高权重文建立上下文',
    seed: g.word + ' ' + g.column,
    radarFile: f,
  };
}

// ---------------- 站内相关文（真实 URL 内链源）----------------
function relatedPosts(brief) {
  if (OPT.noRelated) return [];
  // 走模块而非 CLI：CLI 只支持 --query（标题语料），拿不到 cats 加权。
  // 直接调 findRelated 才能 ① 用 queryHint 当查询语料 ② 传 cats 拿「同栏目」加分
  // ③ 拿到 score 做噪声过滤。缺口词单独查询时语义太散（「大模型」会命中「火车模型」）。
  const query = [brief.queryHint, brief.keyword, (brief.tags || []).join(' ')].filter(Boolean).join(' ');
  try {
    const { createIndex, findRelated } = require('./find-related-posts');
    const index = createIndex();
    const cats = brief.column ? [brief.column] : [];
    const { related } = findRelated(
      { query, text: query, cats, tags: brief.tags || [] },
      { index, top: 12 },
    );
    if (!related.length) return [];
    // 相关度地板：低于榜首 45% 的一律丢掉。TF-IDF 长尾里混着的 unrelated 文章
    // （如「火车模型」）分数通常只有榜首的零头，这一刀能把它们切掉。
    const top = related[0].score || related[0].cos || 0;
    const floor = top * 0.45;
    return related
      .filter((r) => (r.score || r.cos || 0) >= floor)
      .slice(0, 6)
      .map((r) => ({ title: r.title, url: r.url, anchors: r.anchors || [], sameCat: !!r.catSame }));
  } catch (e) {
    process.stderr.write('[auto-writer] ⚠️ 相关文查询失败，本次不注入内链：' + String(e.message).split('\n')[0] + '\n');
    return [];
  }
}

// ---------------- 提示词 ----------------
const HOUSE_STYLE = `【本站既定文风，必须严格遵守】
1. 段落缩进：每个自然段以四个 &nbsp; 实体开头（写成 &nbsp;&nbsp;&nbsp;&nbsp;），这是本站统一排版。
2. 结构：开头一段导语（讲清"读者为什么该看这篇"，给出真实痛点与本文承诺）；随后 ## 二级标题分节，节内可用 ### 三级标题；结尾用 ## 写在最后 收束并给行动建议。
3. 要点用列表：- **加粗小标题：** 具体说明。步骤类内容用有序列表。
4. 配图：只允许写占位注释 <!-- TODO-IMG: 这张图该画什么 -->，**绝对禁止编造任何图片 URL**。图片由后续流程上传图床后回填。
5. 外链证据：引用权威来源时写成 (Reference: [来源名](URL))，且只允许引用真实存在的官方文档/权威指南（如 Google 官方文档、MDN、厂商官方文档）。不确定的**不要引用**。
6. 内链（重要，必须做）：从【可链向的站内文章】清单里挑 **2~3 篇真正相关的**，把链接自然嵌进对应小节的句子里（例如"这一点在《XXX》里拆得更细"）。一篇都不链会被打回。**只能**用清单里给出的 URL，锚文本要读起来像人话，禁止编造站内 URL、禁止把链接堆在末尾当列表。
7. 红线：正文里**不得出现任何 SEO/GEO 优化标记**（如"高搜索意图""AI精准引用""关键词密度"之类），读者看到的必须是干净的内容。
8. 事实纪律：凡涉及具体数字、价格、配额、版本号、政策条款，若你没有十足把握，就**不要写死**，改为描述性表述；并把该断言记进 factcheck 清单交给人工核实。
9. 不要出现"作为AI""本文将""综上所述"这类套话；不要空话凑字数。`;

function buildPrompt(brief, related) {
  const zh = OPT.lang !== 'en';
  const words = OPT.words || (zh ? 1500 : 1200);
  const whitelist = [...MINORS].join('、');
  // 语言是最容易被模型忽略的指令，单独做一条硬约束放在最前面
  const langRule = zh
    ? '【硬性要求·语言】全文（标题、摘要、FAQ、正文）一律用【简体中文】书写。即使种子或标题候选里夹了英文词，也只保留必要的专有名词。'
    : '【HARD REQUIREMENT · LANGUAGE】Write EVERYTHING in 【English】 — the title, description, FAQ questions and answers, and the entire body. Even though the seed/title candidate below is in Chinese, you MUST translate and rewrite it into natural, native-level English. Do NOT output any Chinese characters except unavoidable proper nouns (e.g. brand names).';
  const relLines = related.length
    ? related.map((r, i) => `  [${i + 1}] ${r.title}\n      ${r.url}`).join('\n')
    : '  （本次无可注入的站内相关文，正文不必写内链）';

  const matrixLines = (brief.matrixRows || []).length
    ? (brief.matrixRows || []).map((r, i) => `  ${i + 1}. [${r.role}] ${r.title}  ← 关键词：${r.kw}`).join('\n')
    : '';

  return [
    {
      role: 'system',
      content: zh
        ? '你是一位资深中文技术博客作者，擅长写"具体、可操作、有第一手经验"的长文。你的文章从不注水，每个小节都给出真正能落地的做法。'
        : 'You are a senior B2B content writer who writes specific, actionable, experience-backed long-form articles for an English-speaking audience in manufacturing and international trade. No fluff, no generic filler.',
    },
    {
      role: 'user',
      content: [
        langRule,
        '',
        '【本篇任务】',
        '  类型：' + (brief.role || '独立稿'),
        '  标题候选：' + (brief.title || '（自行拟定）'),
        /^（自拟/.test(String(brief.title || ''))
          ? '  ⚠️ 上面那个「标题候选」不是真标题，只是一个占位说明。你必须自己拟一个**具体、有人会这样搜**的真标题，不要出现「自拟」「围绕」这类字样。'
          : '',
        (brief.siblingWords || []).length
          ? '  同栏目邻近选题（说明本篇在内容簇里的位置，别跑题）：' + brief.siblingWords.join('、')
          : '',
        '  目标栏目：' + (brief.column || '（请从 6 栏目里选最贴合的一个）'),
        '  目标关键词：' + (brief.keyword || ''),
        '  搜索意图：' + (brief.intent || ''),
        brief.linkSpec ? '  内链拓扑要求：' + brief.linkSpec : '',
        '  正文语言：' + (zh ? '简体中文' : 'English'),
        '  目标字数：约 ' + words + ' 字（可浮动 ±15%）',
        '',
        matrixLines ? '【本篇所属内容矩阵（供理解上下文，不必逐条复述）】\n' + matrixLines : '',
        '',
        '【可链向的站内文章（内链只能用这些 URL）】',
        relLines,
        zh ? '' : '  ⚠️ 上述文章标题是中文。英文稿里**不要**把中文标题原样嵌进句子；请把这些文章的主题用英文概括成 3~6 个词做锚文本，例如 [notes on how Chinese factories really quote](URL)。',
        '',
        '【标签白名单（tags 只能从这 80 个词里选，原词照抄，不得自造、不得改写）】',
        whitelist,
        '  → 请按文章核心内容选 2~4 个最贴切的；宁少勿滥，选不到贴切的就少给。',
        '',
        HOUSE_STYLE,
        zh ? '' : '  ⚠️ 上一条里的「## 写在最后」是中文版叫法。英文稿的收尾小节标题请写成 `## Final Thoughts`（或语义等价的英文），正文里不要出现任何中文字符。',
        '',
        '【输出前逐条自检（不满足就先改，改完再输出）】',
        '  □ 正文里是否已经出现 2~3 个站内链接？必须以 [锚文本](URL) 形式嵌在句子里，URL 逐字取自上面的清单。这是硬指标，一条都没有就是不合格稿。',
        '  □ 是否出现了 6 栏目以外的栏目名、或白名单以外的标签？',
        '  □ 是否写了任何图片 URL？（绝对不可以，只能写 <!-- TODO-IMG: ... -->）',
        '  □ 每个自然段是否都以 &nbsp;&nbsp;&nbsp;&nbsp; 开头？',
        '',
        '【输出格式（严格执行，三个分隔符必须原样出现）】',
        '===META===',
        '{',
        '  "title": "最终标题（自然、有信息量，不要标题党）",',
        '  "description": "80~150字的摘要，用于搜索结果展示",',
        '  "category": "目标栏目名",',
        '  "tags": ["标签1","标签2","标签3"],',
        '  "faq": [{"q":"读者真会搜的问题？","a":"简短回答"}],',
        '  "factcheck": ["本文中需要人工核实的具体事实/数字/引用"],',
        '  "images": ["建议配图1的内容描述","建议配图2的内容描述"]',
        '}',
        '===BODY===',
        '（Markdown 正文，从导语开始，不要重复标题）',
        '===END===',
        '',
        '注意：META 必须是合法 JSON（用双引号），不要加注释、不要用代码块包裹。tags 必须逐字取自上面的白名单。faq 给 3~5 条，factcheck 把所有"没把握的具体断言"都列出来（宁多勿少），images 给 2~4 条。',
      ].filter(Boolean).join('\n'),
    },
  ];
}

// ---------------- 调模型（走 curl，规避本机 Node 代理坑）----------------
function loadKey() {
  if (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim()) return process.env.DEEPSEEK_API_KEY.trim();
  if (fs.existsSync(KEY_FILE)) {
    const k = fs.readFileSync(KEY_FILE, 'utf8').trim().split(/\s+/)[0];
    if (k) return k;
  }
  throw new Error('未找到 DeepSeek key：设 DEEPSEEK_API_KEY 环境变量，或在 ' + KEY_FILE + ' 写入 key');
}

function callModel(messages) {
  const key = loadKey();
  const reqFile = path.join(TMP_DIR, 'auto-writer-req.json');
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(reqFile, JSON.stringify({
    model: MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 8000,
  }), 'utf8');

  const winReq = reqFile.replace(/\//g, '\\');
  const out = execFileSync('curl', [
    '-s', '--max-time', '420',
    API_URL,
    '-H', 'Content-Type: application/json',
    '-H', 'Authorization: Bearer ' + key,
    '--data-binary', '@' + winReq,
  ], { encoding: 'utf8', timeout: 460000, maxBuffer: 32 * 1024 * 1024 });

  let j;
  try { j = JSON.parse(out); }
  catch (e) { throw new Error('模型返回不是 JSON：' + out.slice(0, 300)); }
  if (j.error) throw new Error('模型报错：' + (j.error.message || JSON.stringify(j.error)).slice(0, 300));
  const text = j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '';
  if (!text) throw new Error('模型返回空内容：' + out.slice(0, 300));
  return { text, usage: j.usage || {} };
}

// ---------------- 解析模型输出 ----------------
function parseOutput(text) {
  const t = text.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```\s*$/m, '');
  const mBody = t.split(/===BODY===/);
  let metaRaw = (mBody[0] || '').split(/===META===/).pop().trim();
  let body = (mBody[1] || '').split(/===END===/)[0].trim();
  if (!body) throw new Error('未解析出正文（缺少 ===BODY=== 分隔符）');

  let meta = {};
  try { meta = JSON.parse(metaRaw); }
  catch (e) {
    // 容错：截取第一个 { 到最后一个 }
    const s = metaRaw.indexOf('{'), e2 = metaRaw.lastIndexOf('}');
    if (s !== -1 && e2 > s) {
      try { meta = JSON.parse(metaRaw.slice(s, e2 + 1)); }
      catch (e3) { meta = {}; }
    }
  }
  return { meta, body };
}

// ---------------- 组装 front-matter ----------------
function yamlStr(s) {
  return '"' + String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ').trim() + '"';
}
function clip(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const p = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('. '), cut.lastIndexOf('，'));
  return (p > n * 0.6 ? cut.slice(0, p + 1) : cut).trim();
}

function validateTags(list, brief) {
  const kept = [], dropped = [];
  for (const t of list || []) {
    const v = String(t).trim();
    if (MINORS.has(v)) { if (!kept.includes(v)) kept.push(v); }
    else dropped.push(v);
  }
  // 白名单里一个都没留住 → 回退 brief 的标签
  if (kept.length < 2) {
    for (const t of brief.tags || []) {
      const v = String(t).trim();
      if (MINORS.has(v) && !kept.includes(v)) kept.push(v);
    }
  }
  return { kept: kept.slice(0, 5), dropped };
}

function buildFrontMatter(meta, brief, abbr, warns) {
  const v = validateTags(meta.tags, brief);
  if (v.dropped.length) warns.push('已剔除不在 80 词白名单内的标签：' + v.dropped.join('、'));
  if (v.kept.length < 2) warns.push('有效标签不足 2 个，请人工补（必须取自 80 细分词原词）');

  let cat = String(meta.category || '').trim();
  if (!CATEGORIES.includes(cat)) {
    const fallback = CATEGORIES.includes(brief.column) ? brief.column : '';
    if (fallback) {
      if (cat) warns.push('栏目「' + cat + '」不在 6 栏目内，已回退为「' + fallback + '」');
      cat = fallback;
    } else {
      warns.push('栏目「' + (cat || '空') + '」无效且无回退值 → 请用 --column 指定 6 栏目之一');
      cat = cat || CATEGORIES[0];
    }
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
    ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());

  const L = [];
  L.push('---');
  L.push('title: ' + yamlStr(meta.title || brief.title || '未命名'));
  L.push('description: ' + yamlStr(clip(meta.description, 150)));
  L.push('author: Lifeline');
  L.push('tags:');
  (v.kept.length ? v.kept : ['知识总结']).forEach((t) => L.push('  - ' + t));
  L.push('categories:');
  L.push('  - ' + cat);
  L.push('abbrlink: ' + abbr);
  L.push('date: ' + date);
  if (OPT.lang === 'en') L.push('i18n_lang: en');
  const faq = Array.isArray(meta.faq) ? meta.faq.filter((x) => x && x.q) : [];
  if (faq.length) {
    L.push('faq:');
    faq.forEach((x) => {
      L.push('  - q: ' + yamlStr(x.q));
      L.push('    a: ' + yamlStr(x.a || ''));
    });
  }
  L.push('---');
  return { fm: L.join('\n'), tags: v.kept, category: cat, faqCount: faq.length };
}

// ---------------- 主流程 ----------------
function main() {
  if (!OPT.seed && !OPT.topic && !OPT.plan && !RADAR_ON) {
    console.error('用法：');
    console.error('  node tools/auto-writer.js --radar                # 选题雷达·支柱栏目第 1 个缺口词 → 成稿（最自动）');
    console.error('  node tools/auto-writer.js --radar=gap:3          # 第 3 个缺口词');
    console.error('  node tools/auto-writer.js --radar=pick:1         # 第 1 条站外新料（需先 refresh:full）');
    console.error('  node tools/auto-writer.js --seed="外贸B2B独立站 客户开发"        # 种子→矩阵规划→成稿');
    console.error('  node tools/auto-writer.js --topic="选题标题" --column=外贸B2B独立站 --tags=行业观察');
    console.error('  node tools/auto-writer.js --plan=D:/1/1/.tmp/matrix1.json --pick=2');
    console.error('  node tools/auto-writer.js --seed="..." --dry                      # 只看提示词，不调模型');
    console.error('');
    console.error('  加 --lang=en 出英文出海稿；--words=1300 控字数；--out=路径 改输出位置');
    process.exit(1);
  }

  const brief = RADAR_ON ? fromRadar()
    : OPT.seed ? fromSeed()
      : (OPT.plan ? fromPlan() : fromTopic());
  if (!brief) { console.error('❌ 未能解析出选题 brief'); process.exit(1); }

  console.log('═══ 成稿 brief ═══');
  console.log('  来源　　：' + brief.source);
  console.log('  类型　　：' + (brief.role || '-'));
  console.log('  标题候选：' + (brief.title || '-'));
  console.log('  栏目　　：' + (brief.column || '（待定）'));
  console.log('  关键词　：' + (brief.keyword || '-'));
  console.log('  候选标签：' + ((brief.tags || []).join('、') || '-'));
  console.log('  语言/字数：' + OPT.lang + ' / ' + (OPT.words || (OPT.lang === 'en' ? 1200 : 1500)) + ' 字');

  const related = relatedPosts(brief);
  console.log('  站内内链：' + (related.length ? related.length + ' 篇可链（真实 URL）' : '无可注入'));
  related.forEach((r) => console.log('    · ' + r.title + '  →  ' + r.url));

  const messages = buildPrompt(brief, related);

  if (OPT.dry) {
    const promptFile = path.join(TMP_DIR, 'auto-writer-prompt.txt');
    fs.mkdirSync(TMP_DIR, { recursive: true });
    fs.writeFileSync(promptFile, messages.map((m) => '[' + m.role + ']\n' + m.content).join('\n\n'), 'utf8');
    console.log('\n[--dry] 未调用模型。提示词已落：' + promptFile);
    console.log('  提示词总长：' + messages.reduce((a, m) => a + m.content.length, 0) + ' 字符');
    return;
  }

  console.log('\n[1/3] 调用模型生成中（约 1~3 分钟）…');
  const t0 = Date.now();
  const { text, usage } = callModel(messages);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('      完成，用时 ' + secs + 's，tokens=' + (usage.total_tokens || '?'));

  console.log('[2/3] 解析与合规校验…');
  let { meta, body } = parseOutput(text);

  // 自愈：模型经常「拿到内链清单却一条都不链」。与其把问题丢给人工，
  // 不如自动发起一次纠正重生成（只在首版零内链时触发，最多一次）。
  // AW_FORCE_RELINK=1 可强制走这条分支，用于验证自愈链路本身没坏。
  const hasInner = (b) => /https?:\/\/mfy-lifeline\.com\/posts\/[a-z0-9]+/i.test(b);
  const forceRelink = process.env.AW_FORCE_RELINK === '1';
  if (related.length && !OPT.noRelated && (forceRelink || !hasInner(body))) {
    console.log('      ⚠️ 首版没有站内内链，发起一次纠正重生成…');
    try {
      const { text: t2 } = callModel(messages.concat([
        { role: 'assistant', content: text },
        {
          role: 'user',
          content: '上面这版正文一条站内内链都没有，不合格。请从【可链向的站内文章】清单里挑 2~3 篇最相关的，'
            + '以 [锚文本](URL) 的形式**自然嵌进对应小节的句子里**（不要堆在末尾当列表），然后重新输出完整结果'
            + '（===META=== 与 ===BODY=== 都重出，META 内容可保持不变）。',
        },
      ]));
      const p2 = parseOutput(t2);
      if (hasInner(p2.body)) {
        body = p2.body;
        if (p2.meta && p2.meta.title) meta = p2.meta;
        console.log('      ✅ 纠正成功，内链已补入正文');
      } else {
        console.log('      ⚠️ 纠正后仍无内链，保留首版，交人工处理');
      }
    } catch (e) {
      console.log('      ⚠️ 纠正重生成失败（' + String(e.message).split('\n')[0] + '），保留首版');
    }
  }

  const warns = [];
  const used = existingAbbrs();
  const abbr = newAbbr(used);
  const assembled = buildFrontMatter(meta, brief, abbr, warns);

  // 内链落地校验：模型经常「拿到清单但一条都不链」，也可能自己编 URL。
  // 这里以正文实际出现的链接为准（而非清单条数），编造的链接会被标出来要求删掉。
  const allowed = new Set(related.map((r) => r.url.replace(/\/$/, '')));
  const found = [...new Set((body.match(/https?:\/\/mfy-lifeline\.com\/posts\/[a-z0-9]+\/?/gi) || [])
    .map((u) => u.replace(/\/$/, '')))];
  const bogus = found.filter((u) => !allowed.has(u));
  if (related.length && found.length === 0) {
    warns.push('正文一条站内内链都没写（清单里有 ' + related.length + ' 篇可用）。请人工补 2~3 条，或重跑一次。');
  } else if (related.length && found.length < 2) {
    warns.push('正文只落了 ' + found.length + ' 条站内内链，建议补到 2~3 条。');
  }
  if (bogus.length) {
    warns.push('⛔ 正文出现清单外的站内 URL（疑似编造，必须删除或改正）：' + bogus.join('、'));
  }

  const factcheck = Array.isArray(meta.factcheck) ? meta.factcheck.filter(Boolean) : [];
  const images = Array.isArray(meta.images) ? meta.images.filter(Boolean) : [];

  const footer = [
    '',
    '<!--',
    '  以下为写作流程留下的作者可见信息（读者不可见），发布前请处理：',
    images.length ? '  【建议配图】\n' + images.map((s, i) => '    ' + (i + 1) + '. ' + s).join('\n') : '  【建议配图】（模型未给出）',
    factcheck.length ? '  【闸门A·事实核对】逐条验证后再发布：\n' + factcheck.map((s, i) => '    [ ] ' + (i + 1) + '. ' + s).join('\n') : '  【闸门A·事实核对】模型未标记待核实项（仍需通读一遍）',
    '-->',
  ].join('\n');

  const full = assembled.fm + '\n\n' + body + '\n' + footer + '\n';

  const slug = (meta.title || brief.title || 'draft')
    .replace(/[《》「」【】（）()]/g, '')
    .replace(/[，。！？；：、,.!?;:'"]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  const outFile = OPT.out ? path.resolve(OPT.out) : path.join(DRAFT_DIR, slug + '.md');
  if (fs.existsSync(outFile) && !OPT.force) {
    console.error('❌ 已存在同名草稿：' + outFile + '（加 --force 覆盖，或 --out 换名）');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, full, 'utf8');

  // —— 采用反馈闭环（A）：落稿成功即记录「采用了这条选题」，反向校准雷达偏好 ——
  //    包 try/catch：反馈记录失败绝不影响落稿主流程。
  try {
    const rf = require('./radar-feedback');
    rf.recordAdoption({ title: (meta.title || brief.title || slug), col: assembled.category });
  } catch (e) { /* 反馈层异常吞掉，不阻断 auto-writer */ }

  console.log('[3/3] 已写入草稿');
  console.log('');
  console.log('═══ 产物 ═══');
  console.log('  文件　　：' + outFile);
  console.log('  字数　　：约 ' + body.replace(/\s/g, '').length + ' 字');
  console.log('  标题　　：' + (meta.title || brief.title));
  console.log('  栏目　　：' + assembled.category);
  console.log('  标签　　：' + assembled.tags.join('、') + '（已过 80 词白名单）');
  console.log('  FAQ　　：' + assembled.faqCount + ' 条（JSON-LD 由 seo-enhancer 自动生成）');
  console.log('  abbrlink：' + abbr);
  console.log('  内链　　：正文实落 ' + found.length + ' 条' + (related.length ? '（清单可用 ' + related.length + ' 篇）' : ''));

  if (warns.length) {
    console.log('\n⚠️ 自动校验的提示：');
    warns.forEach((w) => console.log('  · ' + w));
  }
  if (factcheck.length) {
    console.log('\n⛔ 闸门 A（必须人工过）：以下断言模型自曝没把握，逐条核实后才可发布');
    factcheck.forEach((s, i) => console.log('  [ ] ' + (i + 1) + '. ' + s));
  }
  if (images.length) {
    console.log('\n🖼 配图（须上传图床后回填，本地不存大图）：');
    images.forEach((s, i) => console.log('  ' + (i + 1) + '. ' + s));
  }

  console.log('\n═══ 下一步 ═══');
  console.log('  1. 通读草稿，过闸门 A（事实）+ 闸门 B（选题/措辞）');
  console.log('  2. 上传配图到图床：node tools/upload-to-imgbed.js --file=... 然后回填正文与 cover');
  console.log('  3. 人工确认后移入正文目录：mv "' + outFile + '" source/_posts/');
  console.log('  4. 构建并过闸门：node ./node_modules/hexo/bin/hexo generate --force');
  console.log('     npm run tags:check && npm run seo:check');
  console.log('  5. 部署需人工点头（push 永不自动）');
  console.log('\n  草稿默认不进构建（hexo 忽略 source/_drafts），所以现在线上零影响。');
}

try {
  main();
} catch (e) {
  // 任何步骤失败都给人话，不要把 execFileSync 的原始对象 dump 出来吓人。
  console.error('\n❌ 成稿失败：' + String((e && e.message) || e).split('\n')[0]);
  const more = String((e && e.message) || '').split('\n').slice(1).join('\n').trim();
  if (more) console.error(more);
  process.exit(1);
}
