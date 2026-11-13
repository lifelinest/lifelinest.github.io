#!/usr/bin/env node
/**
 * tools/gen-brief.js —— 生成「写作任务书」（Brief），补齐「选题 → 写作」之间的空档
 * ------------------------------------------------------------------
 * 为什么需要它：
 *   现在的链路是「选题雷达 → 直接写草稿」，中间没有任务书。结果是每次写作都靠
 *   临场回忆规则，写完才发现缺资料、缺内链、缺配图，只能回头补。
 *   Brief 的作用是把「这篇要写什么、写给谁、哪些东西必须查证、内链配哪几篇、
 *   图要几张」在动笔前一次性固定下来，写作时只做填空。
 *
 * 设计原则（与全站闸门一致：可审计 > 聪明）：
 *   1. 不用 LLM。Brief 由确定性规则生成，输出可复现，不会编造。
 *   2. 内链候选来自 find-related-posts.js 的真实打分，不是 AI 想象。
 *   3. 显式产出「禁止编造清单」，用 [待考证] 标记，写完必须清零。
 *
 * 用法：
 *   node tools/gen-brief.js --keyword="独立站询盘页面怎么设计" --intent=信息型 \
 *        --cat=外贸B2B独立站 --tags=行业观察,知识总结
 *   node tools/gen-brief.js --keyword="..." --audience="外贸独立站运营者" --top=8
 *   node tools/gen-brief.js --keyword="..." --force        # 覆盖同名 Brief
 * 退出码：0 = 生成成功；1 = 参数错误 / 已存在且未加 --force
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BRIEF_DIR = path.join(ROOT, 'briefs');
const DEFAULT_AUDIENCE = '外贸独立站运营者 / SEO·GEO 从业者';

// ---------- 参数 ----------
function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.keyword) {
  console.error('缺少 --keyword。示例：node tools/gen-brief.js --keyword="独立站询盘页面怎么设计" --intent=信息型 --cat=外贸B2B独立站');
  process.exit(1);
}

const keyword = String(args.keyword).trim();
const intent = String(args.intent || '信息型').trim();
const audience = String(args.audience || DEFAULT_AUDIENCE).trim();
const category = String(args.cat || '').trim();
const tags = String(args.tags || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const topN = Number(args.top || 6);

// ---------- 意图 → 结构骨架 ----------
// 只给「该回答哪些问题」的骨架，不给句子。写作时按骨架填，避免跑成泛论。
const INTENT_SKELETON = {
  信息型: [
    '这个问题的成因是什么（不是现象罗列，要能解释为什么）',
    '读者现在最可能做错的一步是什么',
    '正确的做法分几步，每步的判定标准是什么',
    '什么情况下这套做法不适用（边界条件）',
    '怎么验证自己做到了（可观测的信号）',
  ],
  商业调研: [
    '市面上的方案有哪几类，各自的取舍是什么',
    '选择时真正决定结果的是哪两三个变量',
    '常见的选择误区（以及误判后会付什么代价）',
    '不同阶段的团队/预算该怎么选',
    '自己验证的最小成本方式',
  ],
  交易型: [
    '读者此刻的决策卡点是什么',
    '需要哪些信息才能往下走（参数/价格/交期/认证）',
    '不同选择的成本结构差异',
    '如何降低对方的决策风险（试单/样品/条款）',
    '下一步动作是什么（明确到一句可执行的）',
  ],
  故障排查: [
    '症状 → 可能原因的排查树（按发生概率排序）',
    '每一条怎么快速验证（30 秒内可判断）',
    '哪些情况要立刻停手（会造成二次损坏）',
    '根因确认后怎么修，修完怎么防复发',
  ],
};

const skeleton = INTENT_SKELETON[intent] || INTENT_SKELETON['信息型'];

// ---------- 内链候选（真实打分，不靠 AI 想象）----------
function findRelated() {
  try {
    const raw = execFileSync(
      process.execPath,
      [path.join(__dirname, 'find-related-posts.js'), `--query=${keyword}`, `--top=${topN}`, '--json'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
    );
    const data = JSON.parse(raw);
    return (data.related || []).filter((r) => r.score >= 0.3);
  } catch (e) {
    console.warn('  [warn] 内链候选获取失败（继续生成 Brief）：' + e.message.split('\n')[0]);
    return [];
  }
}

// ---------- 日期 ----------
function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function slugify(s) {
  return s
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

const now = new Date();
const slug = slugify(keyword);
const outPath = path.join(BRIEF_DIR, `${ymd(now)}-${slug}.md`);

if (fs.existsSync(outPath) && !args.force) {
  console.error(`Brief 已存在：${path.relative(ROOT, outPath)}\n如需覆盖请加 --force`);
  process.exit(1);
}

const related = findRelated();

// ---------- 组装 ----------
const relatedBlock = related.length
  ? related
      .map((r, i) => {
        const anchor = (r.anchors && r.anchors[0]) || r.title;
        return `${i + 1}. [${r.title}](${r.url})　评分 ${r.score}\n   - 建议锚文本：\`${anchor}\`\n   - abbrlink：\`${r.abbr}\`${r.sharedTags && r.sharedTags.length ? `\n   - 共享标签：${r.sharedTags.join('、')}` : ''}`;
      })
      .join('\n')
  : '_（未找到评分 ≥0.3 的相关文章 —— 可能是新集群，可考虑先立一篇支柱页）_';

const fm = [
  '---',
  `title: "Brief · ${keyword}"`,
  `keyword: "${keyword}"`,
  `intent: "${intent}"`,
  `audience: "${audience}"`,
  category ? `category: "${category}"` : 'category: ""',
  tags.length ? `tags: ${JSON.stringify(tags)}` : 'tags: []',
  'status: brief',
  `created: ${ymd(now)}`,
  'target_title: ""',
  'abbrlink: ""',
  '---',
  '',
].join('\n');

const body = `
# 任务书：${keyword}

> 这份文件在**动笔前**填完。空着的字段就是还没想清楚的地方，不要带着空格开始写。

## 1. 一句话任务

- **写给谁**：${audience}
- **他现在卡在哪**：（填：具体到某个动作做不下去，不要写"缺乏认知"）
- **读完应该能做出什么决定**：（填：一个可执行动作，能被验证）
- **搜索意图**：${intent}

## 2. 核心主张

- **我要读者记住的那一句话**：（填，全文只允许有一个）
- **支撑它的三个事实/机制**：
  1. （填）
  2. （填）
  3. （填）

## 3. 结构骨架（按意图生成，可增删但不能少于 4 节）

${skeleton.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## 4. ⚠️ 禁止编造清单（写完必须清零）

写作时凡是写出下面这类内容而**没有真实来源**，一律先标 \`[待考证]\`，不许含糊写过去：

- [ ] 具体数字（百分比、金额、时长、数量、转化率）
- [ ] 平台/算法的机制描述（"Google 会给……加分"这类因果断言）
- [ ] 客户案例、询盘量、成交数据
- [ ] 工具的具体功能、价格、限制
- [ ] 时间点（"2026 年起……"）

**来源记录区**（一条一行，写清出处；没有出处的条目在发布前删掉）：

| 断言 | 来源 | 已核对 |
|---|---|---|
|  |  | ☐ |

完成后自查：\`grep -c "待考证" 本文\` 必须为 0。

## 5. 内链候选（来自 find-related-posts 真实打分，别自己编 URL）

${relatedBlock}

挑 1–2 条写进正文，锚文本要贴合所在段落，不要整句标题当锚文本。

## 6. 配图计划（3 张，按用途分型）

| # | 位置 | 类型 | 文件名 | 短标签 alt |
|---|---|---|---|---|
| 1 | 开头场景 | Real photo |  |  |
| 2 | 核心机制 | Chart / Illustration |  |  |
| 3 | 操作步骤 | Illustration |  |  |

- 类型只用三种：\`Real photo\` / \`Chart\` / \`Illustration\`。**示意图不得冒充实拍**。
- alt 用短标签（3–6 字），描述放在图注 \`> 图N：…\`，图注不得复述相邻正文。
- 封面走 ThisCover 管线，禁止 AI 生图当封面。

## 7. 验收线（发布前逐条打勾）

- [ ] 正文 ≥3000 字符
- [ ] 内链 1–2 条，且目标非 noindex
- [ ] 配图 3 张，图床 URL 全 200
- [ ] 封面：ThisCover 生成 + 上传 \`封面图/YYYY/MM/\`
- [ ] \`npm run tags:check\` 通过（标签只用白名单原词）
- [ ] \`npm run seo:check\` 通过
- [ ] \`npm run imgbed:check\` 无新增断链
- [ ] 无 \`[待考证]\` 残留
- [ ] 渲染产物已目检（截图，不是只看 grep）

## 8. 状态流转

\`\`\`
brief ──► drafted ──► reviewed ──► published ──► needs-update
\`\`\`

- 当前状态：**brief**
- 推进方式：\`node tools/pipeline-board.js --set "${slug}" <状态>\`
- 状态记录：
  - ${ymd(now)} 生成 Brief
`;

fs.mkdirSync(BRIEF_DIR, { recursive: true });
fs.writeFileSync(outPath, fm + body, 'utf8');

console.log('✅ Brief 已生成：' + path.relative(ROOT, outPath));
console.log('   关键词：' + keyword + ' / 意图：' + intent);
console.log('   内链候选：' + related.length + ' 条' + (related.length ? `（最高 ${related[0].score}：${related[0].title.slice(0, 24)}…）` : ''));
console.log('   下一步：填完第 1–4 节，再开始写草稿');
