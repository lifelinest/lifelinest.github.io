// 内容矩阵锚点：以用户真实"AI / SEO / GEO / 建站(WordPress) × 外贸运营网站"矩阵为选题方向
// 实时扫描 source/_posts 计算各矩阵单元格覆盖，优先填空白/薄弱格，并为每条选题找可互链文章。
const fs = require('fs');
const path = require('path');

const POSTS_DIR = 'D:/1/1/Blog/source/_posts';

// 四主题轴关键词（标题+标签+栏目都算命中）
const AXES = {
  AI: ['ai', '人工智能', 'gpt', '大模型', 'llm', 'chatgpt', '智能体', 'agent', '机器学习', 'prompt', '提示词', 'ai写作', 'aigc', 'copilot', 'cursor'],
  SEO: ['seo', '谷歌', 'google', '搜索', '排名', '关键词', 'sem', 'ads', '广告', '流量', '收录', '外链', 'serp', '索引'],
  GEO: ['geo', '生成式', '生成引擎', 'ai引用', 'ai搜索', 'ai可见', 'ai推荐', '引用', 'schema', '结构化数据', '知识图谱', 'aio', '生成式引擎', 'llms.txt', 'llm.txt'],
  WP: ['wordpress', 'wp', '建站', '博客搭建', 'cms', '主题', '插件', '古腾堡', '页面构建', 'hexo', 'typecho', '模板', '站点', '网站'],
};
// 外贸运营网站语境（垂直约束，不是第5轴）
const FT_CTX = ['外贸', 'b2b', '独立站', '跨境', '询盘', 'rfq', '出海', '出口', '海外', '国际站', 'alibaba', '谷歌广告', 'shopify', '亚马逊', '获客', '转化'];

const AXIS_NAMES = { AI: 'AI', SEO: 'SEO', GEO: 'GEO', WP: '建站/WordPress' };
const AXIS_ORDER = ['AI', 'SEO', 'GEO', 'WP'];

function loadPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md')).map(f => {
    const full = path.join(POSTS_DIR, f);
    const txt = fs.readFileSync(full, 'utf8');
    const m = txt.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
    let title = f, tags = [], cats = [];
    if (m) {
      const fm = m[1];
      const t = fm.match(/title:\s*(.*)/); if (t) title = t[1].trim().replace(/^["']|["']$/g, '');
      const tagBlock = fm.match(/tags:\s*(?:\[(.*)\]|([\s\S]*?)(?:\n\w+:|$))/);
      // 简单：抓所有 `- xxx` 行 与 行内数组
      const inline = fm.match(/tags:\s*\[(.*)\]/);
      if (inline) tags = inline[1].split(',').map(s => s.trim()).filter(Boolean);
      else {
        const lines = fm.split(/\r?\n/);
        let inTags = false;
        for (const ln of lines) {
          if (/^tags:\s*$/.test(ln)) { inTags = true; continue; }
          if (inTags) { if (/^\s*-\s+(.*)/.test(ln)) tags.push(ln.match(/^\s*-\s+(.*)/)[1].trim()); else if (/^\w+:/.test(ln)) break; }
        }
      }
      const cInline = fm.match(/categories:\s*\[(.*)\]/);
      if (cInline) cats = cInline[1].split(',').map(s => s.trim()).filter(Boolean);
    }
    const body = m ? txt.slice(m[0].length) : txt;
    return { file: f, title, tags, cats, raw: (title + ' ' + tags.join(' ') + ' ' + cats.join(' ') + ' ' + body.slice(0, 1200)).toLowerCase() };
  });
}

function hitAxis(text, axis) { return AXES[axis].some(k => text.includes(k)); }
function hitFT(text) { return FT_CTX.some(k => text.includes(k)); }

function classify(text) {
  const lower = text.toLowerCase();
  const ax = {};
  for (const a of AXIS_ORDER) ax[a] = hitAxis(lower, a);
  const ft = hitFT(lower);
  return { ax, ft };
}

function cellKey(ax, ft) {
  const hit = AXIS_ORDER.filter(a => ax[a]);
  if (hit.length === 0) return null;
  return (ft ? 'FT·' : '') + hit.map(a => AXIS_NAMES[a]).join('×');
}

// 超集覆盖：把目标格解析成「需要命中的轴集合」，文章只要每轴都命中即视为覆盖该格
// （修复假空白 C：之前要求每轴精确命中同一精确格才算数，导致标签不全的已写文章被判 0）
function parseCell(cell) {
  const ft = cell.startsWith('FT·');
  const rev = Object.fromEntries(Object.entries(AXIS_NAMES).map(([k, v]) => [v, k]));
  const axes = (ft ? cell.slice(3) : cell).split('×').map(n => rev[n]).filter(Boolean);
  return { ft, axes };
}
function postCovers(post, cell) {
  const c = parseCell(cell);
  if (post.ft !== c.ft) return false;
  return c.axes.every(a => post.ax[a]);
}

// 计算覆盖：返回 { exact: cellKey -> 文章列表（精确格，供热力图与 linkTargets）,
//                 posts: [{title, ax, ft}]（每篇的轴命中，供超集覆盖计数） }
function buildCoverage() {
  const posts = loadPosts();
  const exact = {};
  const postList = [];
  for (const p of posts) {
    const { ax, ft } = classify(p.raw);
    const key = cellKey(ax, ft);
    if (key) (exact[key] = exact[key] || []).push(p.title);
    postList.push({ title: p.title, ax, ft });
  }
  return { exact, posts: postList };
}

// 用户关心的目标单元格（按自述矩阵推导，优先填这些）
const TARGET_CELLS = [
  'FT·AI×SEO', 'FT·AI×GEO', 'FT·AI×建站/WordPress', 'FT·SEO×GEO', 'FT·SEO×建站/WordPress', 'FT·GEO×建站/WordPress',
  'FT·AI×SEO×GEO', 'FT·AI×SEO×建站/WordPress', 'FT·AI×GEO×建站/WordPress', 'FT·SEO×GEO×建站/WordPress',
  'FT·AI×SEO×GEO×建站/WordPress',
  'AI×SEO', 'AI×GEO', 'SEO×GEO', 'GEO×建站/WordPress', // 非外贸语境也值得（技术纵深）
];

// 跨全站语义去重（修复去重失效 B）：空白格之前永远不触发同格去重，这里改为对全站标题做语义比对
const GLOSSARY = (() => {
  const s = new Set();
  Object.values(AXES).forEach(a => a.forEach(k => s.add(k.toLowerCase())));
  FT_CTX.forEach(k => s.add(k.toLowerCase()));
  ['llms.txt', 'llm.txt', 'schema', '结构化数据', 'e-e-a-t', 'eeat', 'faq', '内链', '外链', '知识库', '迁移', '体检', '双轨', '复盘', '工作流', '可见性', '互链', '长尾', '落地页', '索引', '收录'].forEach(k => s.add(k.toLowerCase()));
  return s;
})();
const STRONG = new Set(['llms.txt', 'llm.txt', 'schema', '结构化数据', 'e-e-a-t', 'eeat', '双轨', '知识库', '迁移', '体检', '复盘', '工作流', '可见性', '互链', '长尾']);
const STOP = new Set(['怎么', '如何', '我们', '你的', '一篇', '一个', '可以', '使用', '配置', '生成', '文章', '阶段', '上线', '前必', '必做', '标准', '化模', '模板', '这些', '那些', '还是', '以及', '关于', '通过', '利用', '外贸', '独立站', '网站']);
function extractKeywords(text) {
  const t = String(text || '').toLowerCase();
  const kw = new Set();
  for (const g of GLOSSARY) if (t.includes(g)) kw.add(g);
  const cn = t.replace(/[a-z0-9\s.\-\/]/g, '');
  for (let i = 0; i < cn.length - 1; i++) {
    const bg = cn.slice(i, i + 2);
    if (!STOP.has(bg)) kw.add(bg);
  }
  return kw;
}
function findDuplicateSeed(seedTitle, allTitles) {
  const seedKw = extractKeywords(seedTitle);
  if (seedKw.size === 0) return null;
  let best = null, bestScore = 0;
  for (const p of allTitles) {
    const pKw = extractKeywords(p);
    if (pKw.size === 0) continue;
    let inter = 0;
    for (const x of seedKw) if (pKw.has(x)) inter++;
    if (inter === 0) continue;
    const overlap = inter / seedKw.size;
    const jaccard = inter / (seedKw.size + pKw.size - inter);
    const seedStrong = [...seedKw].filter(x => STRONG.has(x));
    const pStrong = [...pKw].filter(x => STRONG.has(x));
    const hasStrong = seedStrong.length > 0 && pStrong.length > 0 && seedStrong.some(x => pKw.has(x));
    const score = hasStrong ? Math.max(overlap, jaccard) : jaccard * 0.6;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  if (!best) return null;
  const seedStrongSet = [...seedKw].filter(x => STRONG.has(x));
  const strongHit = seedStrongSet.some(x => extractKeywords(best).has(x) && STRONG.has(x));
  const threshold = strongHit ? 0.5 : 0.6;
  return bestScore >= threshold ? { title: best, score: +bestScore.toFixed(2) } : null;
}

// 单元格优先级权重：越空越值得填（gap 越大权重越高），用户点名的轴组合加权
function gapWeight(cellKeyStr, coverage) {
  const n = (coverage.posts || []).filter(p => postCovers(p, cellKeyStr)).length;
  // 空单元格最高优先
  let w = n === 0 ? 5 : n <= 1 ? 4 : n <= 2 ? 3 : n <= 4 ? 2 : 1;
  // 三轴/四轴组合天然更稀缺 → 加权
  const axisCount = (cellKeyStr.match(/×/g) || []).length + 1;
  if (axisCount >= 3) w += 1;
  if (cellKeyStr.includes('FT·')) w += 1; // 外贸语境优先（用户垂直）
  if (cellKeyStr.includes('GEO')) w += 1;  // GEO 是你最缺也最想打的轴
  return { count: n, weight: w };
}

// 从空白/薄弱单元格生成"自矩阵派生"的种子选题（用户点名方向，不依赖随机网页）
const SEED_TEMPLATES = {
  'FT·GEO×建站/WordPress': [
    '外贸独立站用 WordPress 怎么配置 llms.txt 和 Schema 让 AI 推荐',
    'WordPress 外贸站 GEO 内容结构：让 AI 引擎稳定引用你的产品页',
    '建站阶段就埋 GEO：外贸网站上线前必做的 AI 可见性清单',
  ],
  'FT·AI×SEO': [
    '用 AI 批量写外贸 B2B 文章时，怎么守住谷歌 SEO 的 E-E-A-T',
    'AI 生成外贸落地页：SEO 结构（标题/内链/FAQ）的标准化模板',
    '外贸独立站 AI 写作工作流里，哪些 SEO 环节必须人工盯',
  ],
  'FT·SEO×GEO': [
    '外贸站 SEO 与 GEO 怎么分工：传统搜索与 AI 搜索双轨内容策略',
    '同一篇外贸文章怎么同时吃谷歌排名和 AI 引用',
  ],
  'FT·SEO×建站/WordPress': [
    'WordPress 外贸独立站上线前的 SEO 技术体检清单（速度/结构化数据/索引）',
    '外贸网站改版不丢排名：WordPress 迁移的 SEO 避坑',
  ],
  'FT·AI×GEO×建站/WordPress': [
    '用 AI 给 WordPress 外贸站自动生成可被 AI 引用的知识库页面',
  ],
  'FT·AI×SEO×GEO': [
    '外贸内容矩阵：一篇 AI 写的文章如何同时服务 SEO、GEO 与询盘转化',
  ],
  'FT·AI×SEO×GEO×建站/WordPress': [
    '从 0 搭一个 AI 驱动的外贸 WordPress 站：SEO+GEO+内容生产全链路复盘',
  ],
};

function matrixSeeds(coverage, allTitles) {
  const out = [];
  const deduped = [];
  const titles = (allTitles && allTitles.length)
    ? allTitles.map(p => (typeof p === 'string' ? p : (p.title || '')).toLowerCase())
    : Object.values(coverage.exact || {}).flat().map(x => x.toLowerCase());
  for (const cell of TARGET_CELLS) {
    const g = gapWeight(cell, coverage);
    const tmpl = SEED_TEMPLATES[cell] || [];
    for (const t of tmpl) {
      // 跨全站语义去重：与任一篇已写文章标题语义重合则标为「已写过（建议翻新）」
      const dup = findDuplicateSeed(t, titles);
      if (dup) { deduped.push({ title: t, cell, existing: dup.title, score: dup.score }); continue; }
      out.push({ title: t, cell, weight: g.weight, count: g.count });
    }
  }
  out.sort((a, b) => b.weight - a.weight);
  out.deduped = deduped;
  return out;
}

// 为一条候选找可互链的文章（共享 ≥1 主题轴即算相邻，用于"相辅相成"成网）
function linkTargets(text, coverage, limit = 4) {
  const { ax } = classify(text);
  const hits = AXIS_ORDER.filter(a => ax[a]);
  if (hits.length === 0) return [];
  const found = [];
  for (const [cell, titles] of Object.entries(coverage.exact)) {
    const cellAxes = AXIS_ORDER.filter(a => cell.includes(AXIS_NAMES[a]));
    if (cellAxes.some(a => hits.includes(a))) {
      for (const t of titles) if (!found.includes(t)) found.push(t);
    }
    if (found.length >= limit) break;
  }
  return found.slice(0, limit);
}

module.exports = {
  AXES, FT_CTX, AXIS_ORDER, AXIS_NAMES,
  classify, cellKey, parseCell, postCovers, buildCoverage, gapWeight, TARGET_CELLS,
  matrixSeeds, linkTargets, loadPosts,
  GLOSSARY, STRONG, STOP, extractKeywords, findDuplicateSeed,
};
