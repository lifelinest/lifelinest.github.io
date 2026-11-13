#!/usr/bin/env node
/**
 * tools/hot-topics.js —— 热点雷达：热榜 → 定位过滤 → 可写选题
 * ------------------------------------------------------------------
 * 为什么不直接用 fetch-sources --hot --score 就完事：
 *   2026-10-02 实测：180 条热榜走「整条标题打分」只出 KEEP 2 / REVIEW 20，
 *   且 KEEP 的（比亚迪销量、AI 生成 PPT）对本站其实也写不了。**通用热榜对
 *   垂类站的命中率约 1%** —— 整条标题打分太粗，会漏掉「标题是国庆、但里面
 *   藏着关税/汇率/AI 工具」这类可用信号。
 *
 * 所以本工具做的是**词级雷达**：拿定位词表去扫热榜标题，命中的才是信号，
 * 并给出「热点钩子 + 常青内核」的角度建议，不直接搬运社会新闻。
 *
 * 三层判据（对应「要不要追这个热点」）：
 *   ① 真热吗   → 在榜时长（读 sources-state/seen.json；<1 天 = 刚冒头，≥2 天 = 持续）
 *   ② 有人搜吗 → --verify 调 search-demand.js 验证搜索下拉词（联网，默认关）
 *   ③ 推得动支柱吗 → 命中词归属哪根支柱 / 是否在反品牌黑名单里
 *
 * 用法：
 *   node tools/hot-topics.js                          # 扫全部热榜源
 *   node tools/hot-topics.js --source=知乎            # 只扫一个源
 *   node tools/hot-topics.js --verify                 # 对命中词额外验证搜索需求（慢）
 *   node tools/hot-topics.js --json D:/1/1/.tmp/hot-topics.json
 *   node tools/hot-topics.js --to-candidates=D:/1/1/.tmp/candidates.txt
 * 退出码：0 = 正常（没命中也是 0，属于正常结果）
 *
 * 只读：不改文章、不构建、不部署。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { fetchHot } = require('./hot-parse');

const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.resolve(ROOT, '..', '.tmp', 'sources-state', 'seen.json');

const argv = process.argv.slice(2);
function getArg(name, def) {
  const i = argv.findIndex((a) => a === name || a.startsWith(name + '='));
  if (i === -1) return def;
  const a = argv[i];
  if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
  const nx = argv[i + 1];
  return nx && !nx.startsWith('--') ? nx : def;
}
const ONLY = getArg('--source', '');
const JSON_OUT = getArg('--json', 'D:/1/1/.tmp/hot-topics.json');
const TO_CANDIDATES = getArg('--to-candidates', '');
const DO_VERIFY = argv.includes('--verify');
const DO_SELFTEST = argv.includes('--selftest');   // 词表自检：拿站内标题做正校准 + 生造词做负校准

// ---------------- 定位雷达词表（热点专用，与栏目关键词解耦）----------------
// 说明：这是「热榜里出现什么词才跟本站有关」的判断依据，需随定位调整手工维护。
const RADAR = {
  '外贸B2B独立站实战': ['外贸', '跨境', '出海', '独立站', 'B2B', '亚马逊', 'Amazon', 'TikTok', 'Shopify',
    '阿里巴巴', '国际站', '海关', '报关', '关税', '汇率', '退税', '物流', '货代', '集装箱', 'FOB',
    '询盘', '供应商', '工厂', 'OEM', 'ODM', '验厂', '信用证', '结汇', '收款', '广交会', '展会',
    '海外', '进出口', 'Made-in-China', 'Made in China', 'WhatsApp', 'LinkedIn', 'Facebook'],
  // ⚠️ 故意不收裸词「AI / 人工智能」：热榜里「用 AI 还原寻人」「胖东来现场像 AI」
  // 「AI 牛市英伟达」都含 AI，但全是泛社会/财经新闻，与本站定位零相关。
  // 只留可操作的子类词，命中才可能是真信号（2026-10-12 修：此前裸词 AI 让 7/8 热点误判为选题）。
  'AI内容增长工作流': ['大模型', 'GPT', 'DeepSeek', 'Claude', 'Gemini', '提示词',
    '智能体', 'Agent', 'AIGC', '生成式', 'Copilot', '自动化', '机器人'],
  'SEO与Google Ads 流量增长': ['SEO', '谷歌', 'Google', '必应', 'Bing', '搜索', '收录', '排名', '外链',
    '关键词', 'Ads', '广告', '投放', 'SEM', '流量', '算法', '索引', '站长'],
  '博客建站与前端': ['WordPress', '网站', '域名', '服务器', 'CDN', 'Hexo', '建站', '网页', 'SSL',
    '主机', '备案', '网页速度', '浏览器', '前端'],
};
// 歧义词：中文里多义，单独出现不算命中，必须与同现词一起出现才算
// （实测事故：「某餐厅国庆上座率仅六成…流量暴跌」命中了「流量」→ 那是客流不是网站流量）
const AMBIGUOUS = {
  '流量': ['网站', '搜索', '谷歌', 'Google', '必应', 'Bing', '收录', '排名', 'SEO', '广告', '投放', '自然', '独立站', '页面', '访客'],
  '搜索': ['引擎', '谷歌', 'Google', '必应', 'Bing', '排名', '收录', '关键词'],
  '广告': ['投放', '谷歌', 'Google', 'Ads', '竞价', '转化'],
  '海外': ['客户', '市场', '社媒', '独立站', '推广', '买家', '出海'],
  '工厂': ['外贸', '供应商', '验厂', 'B2B', '制造', '出口'],
  '网站': ['流量', '排名', '收录', 'SEO', '谷歌', '建站', '优化'],
};
// 命中也别碰：社会负面、敏感、纯娱乐（写到本站就是稀释画像）
const BLACKLIST = ['死亡', '去世', '坠亡', '死刑', '杀人', '强奸', '猥亵', '塌房', '出轨', '离婚',
  '判刑', '逮捕', '事故', '地震', '台风', '洪水', '火灾', '疫情', '战争', '枪击', '爆炸', '诈骗'];

const ANGLE = {
  '外贸B2B独立站实战': '写成「该事件对外贸订单/物流/收款的实际影响 + 卖家该怎么应对」，落到操作清单',
  'AI内容增长工作流': '写成「用 AI 把这件事里的某个环节省下来」，给可复制的提示词/流程',
  'SEO与Google Ads 流量增长': '写成「这次变化对网站收录/排名的影响 + 自查步骤」，配自查清单',
  '博客建站与前端': '写成「建站/前端视角怎么落地」，给配置和踩坑点',
};

// ---------------- 词表自检（--selftest）----------------
// 双校准思路：命中率低时，得先证明「是热榜里真没有」而不是「词表坏了」。
//   正校准：站内 138 篇标题必然有一批命中（三支柱约占 1/3）→ 命中率 <20% 说明词表失效
//   负校准：生造乱码/无关词必然 0 命中 → 若也命中，说明匹配逻辑写坏了
function matchRadar(text, blacklist = true) {
  if (blacklist && BLACKLIST.some((k) => text.includes(k))) return { matched: [], pillar: '' };
  const matched = [];
  let pillar = '';
  const lower = String(text || '').toLowerCase();
  for (const [p, words] of Object.entries(RADAR)) {
    const m = words.filter((w) => {
      if (!lower.includes(w.toLowerCase())) return false;
      const need = AMBIGUOUS[w];
      if (!need) return true;                     // 非歧义词直接算
      return need.some((c) => lower.includes(c.toLowerCase()));   // 歧义词要同现才认
    });
    if (m.length) { matched.push(...m); if (!pillar) pillar = p; }
  }
  return { matched: [...new Set(matched)], pillar };
}

if (DO_SELFTEST) {
  const dir = path.join(ROOT, 'source', '_posts');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : [];
  const titles = [];
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const m = raw.match(/^title:\s*(.+)$/m);
    if (m) titles.push(m[1].replace(/^['"]|['"]$/g, '').trim());
  }
  const hitTitles = titles.filter((t) => matchRadar(t).matched.length);
  const negWords = ['㗊㗊㗊乱码词', 'zzqxnotexist', '阿斯顿发斯蒂芬', '量子纠缠早餐机'];
  const negHits = negWords.filter((w) => matchRadar(w).matched.length);
  const rate = titles.length ? Math.round((hitTitles.length / titles.length) * 100) : 0;
  console.log('=== 雷达词表自检 ===');
  console.log('正校准：站内 ' + titles.length + ' 篇标题命中 ' + hitTitles.length + ' 篇 = ' + rate + '%（<20% 判词表失效）');
  console.log('负校准：' + negWords.length + ' 个生造词命中 ' + negHits.length + ' 个（必须 0）');
  if (negHits.length) console.log('  ✗ 误命中：' + negHits.join('、'));
  console.log('判定：' + (rate >= 20 && negHits.length === 0 ? 'PASS 词表有效' : 'FAIL 需修词表'));
  console.log('');
  console.log('命中样例（前 8）：');
  hitTitles.slice(0, 8).forEach((t) => console.log('  [' + matchRadar(t).pillar + '] ' + t));
  console.log('');
}

// ---------------- 取热榜 ----------------
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'sources.json'), 'utf8'));
let hot = (cfg.feeds || []).filter((f) => f.tier === 'hot' && !f.disabled);
if (ONLY) hot = hot.filter((f) => f.name.includes(ONLY) || f.url.includes(ONLY));

const seen = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')).seen || {} : {};
const now = Date.now();

const hits = [];
const scanned = [];
const srcErr = [];

for (const f of hot) {
  const r = fetchHot(f);
  if (!r.items.length) { srcErr.push(f.name + (r.error ? '（' + r.error + '）' : '')); continue; }
  for (const it of r.items) {
    scanned.push({ source: f.name, title: it.title });
    const r = matchRadar(it.title);
    if (!r.matched.length) continue;
    const pillar = r.pillar;
    const matched = r.matched;
    const firstSeen = seen[it.link] || 0;
    hits.push({
      source: f.name,
      title: it.title,
      link: it.link,
      hot: it.hot,
      pillar,
      matched: [...new Set(matched)],
      onBoardDays: firstSeen ? Math.max(0, Math.round((now - firstSeen) / 86400000)) : 0,
      angle: ANGLE[pillar] || '',
    });
  }
}

// 排序：支柱命中优先 → 热度
const pillarOrder = { '外贸B2B独立站实战': 0, 'AI内容增长工作流': 1, 'SEO与Google Ads 流量增长': 2, '博客建站与前端': 3 };
hits.sort((a, b) => (pillarOrder[a.pillar] - pillarOrder[b.pillar]) || (b.hot - a.hot));

// ---------------- 需求验证（可选，联网）----------------
if (DO_VERIFY && hits.length) {
  const { execFileSync } = require('child_process');
  const words = [...new Set(hits.flatMap((h) => h.matched))].slice(0, 12);
  process.stdout.write('正在验证搜索需求（' + words.length + ' 个词，走 search-demand）…');
  for (const w of words) {
    try {
      const out = execFileSync('node', [path.join(__dirname, 'search-demand.js'), '--seed=' + w, '--quiet'],
        { encoding: 'utf8', cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000 });
      const has = /命中|建议|缺口/.test(out) || out.trim().length > 0;
      for (const h of hits) if (h.matched.includes(w)) (h.verified = h.verified || []).push(w);
    } catch (e) { /* 单点失败不阻断 */ }
  }
  process.stdout.write(' 完成\n');
}

// ---------------- 输出 ----------------
const L = [];
L.push('=== 热点雷达（' + hot.length + ' 个热榜源，扫描 ' + scanned.length + ' 条）===');
L.push('词级匹配定位词表；已过滤社会负面/敏感词；在榜天数取自采集历史');
L.push('');
if (!hits.length) {
  L.push('本次没有命中定位词表的热点。');
  L.push('');
  L.push('这是正常结果 —— 通用热榜对垂类站的命中率本来就低（实测约 1%）。');
  L.push('别硬蹭：追不相关热点只会稀释画像。建议改看垂直源：');
  L.push('  node tools/fetch-sources.js --score --min=1 --source=白鲸');
  L.push('  node tools/fetch-sources.js --score --min=1 --source=Bing');
} else {
  const byPillar = {};
  for (const h of hits) byPillar[h.pillar] = (byPillar[h.pillar] || 0) + 1;
  L.push('命中 ' + hits.length + ' 条：' + Object.entries(byPillar).map(([k, v]) => k + ' ' + v).join(' ｜ '));
  L.push('');
  for (const h of hits) {
    L.push('[' + h.pillar + '] ' + (h.hot ? '🔥' + h.hot.toLocaleString('en-US') + ' ' : '') + h.source +
      (h.onBoardDays ? ' ｜ 在榜 ' + h.onBoardDays + ' 天' : ' ｜ 新上榜'));
    L.push('    ' + h.title);
    L.push('    ↳ 命中词：' + h.matched.join('、'));
    L.push('    ↳ 角度：' + h.angle);
    if (h.link) L.push('    ' + h.link);
  }
}
if (srcErr.length) { L.push(''); L.push('⚠️ 未取到：' + srcErr.join('；')); }
L.push('');
L.push('下一步：把看中的条目喂成稿器（先落草稿，入库必须人工）');
L.push('  node tools/auto-writer.js --topic="<改造后的标题>"');

console.log(L.join('\n'));

fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
fs.writeFileSync(JSON_OUT, JSON.stringify({ at: new Date().toISOString(), scanned: scanned.length, hits }, null, 2), 'utf8');
console.log('\n✅ 落盘：' + JSON_OUT);

if (TO_CANDIDATES) {
  fs.mkdirSync(path.dirname(TO_CANDIDATES), { recursive: true });
  fs.writeFileSync(TO_CANDIDATES, hits.map((h) => h.title + ' | ' + h.pillar).join('\n') + '\n', 'utf8');
  console.log('✅ 候选已导出：' + TO_CANDIDATES);
}

// 供 topic-radar 复用同一份词表（热点过滤只有一份实现，避免两处漂移）
module.exports = { matchRadar, RADAR, BLACKLIST, ANGLE };
