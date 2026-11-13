#!/usr/bin/env node
/**
 * tools/classify-link-report.js —— 外链报告「去伪分类器」（只读，不改任何文件）
 *
 * 为什么需要它：check-external-links.js 批量跑（并发）经本机代理会丢连接，
 * 把一大批本来能通的链接记成「连接失败」。2026-09-24 实测 106 条断链里
 * 17 条串行复测是 200/302；另有 36 条是 csdn/bilibili/sohu 的反爬误报。
 * ⇒ 只信 404。「连接失败」必须串行复测后归类，本脚本负责把两次结果合并分类。
 *
 * 两步用法：
 *   1) 批量跑并落 JSON：
 *      node tools/check-external-links.js --json --concurrency=10 --timeout=15 > .tmp/links-check.json
 *   2) 抽出 code=0/5xx 的逐条串行复测（每行 "code|url"）：
 *      node -e "..."            # 见 SKILL 的 references/ops.md §7
 *      → 得到 .tmp/retest-out.txt
 *   3) 合并分类：
 *      node tools/classify-link-report.js <批量json> <复测txt> <输出md>
 *
 * 复测文件可缺省（不传则只按状态码分类，会把并发误报算进断链，仅供参考）。
 *
 * ⚠️ 别用内联 node -e 写含反引号的脚本 —— Bash 会把反引号当命令替换吃掉。
 */
'use strict';

const fs = require('fs');

const [jsonPath, retestPath, outPath] = process.argv.slice(2);
if (!jsonPath || !outPath) {
  console.error('用法：node tools/classify-link-report.js <批量json> [复测txt] <输出md>');
  process.exit(2);
}
if (!fs.existsSync(jsonPath)) {
  console.error('找不到批量 JSON：' + jsonPath);
  process.exit(2);
}

const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// 串行复测结果：每行 "code|url"
const ret = new Map();
if (retestPath && fs.existsSync(retestPath)) {
  for (const line of fs.readFileSync(retestPath, 'utf8').trim().split('\n')) {
    const i = line.indexOf('|');
    if (i > 0) ret.set(line.slice(i + 1).trim(), Number(line.slice(0, i)));
  }
}

const bad = (j.failures || []).filter((f) => ![401, 403, 429].includes(f.code));

// 正则误报：正文/prose 片段或行内代码示例，根本不是给读者点的链接
const NOT_A_LINK = /^http:\/\/”前缀|^https:\/\/abcd\.jpg$/;

// 稿件畸形 URL：能点、但地址本身写坏了（转义反斜杠 / 模板占位符 / 下划线被转义）
const MALFORMED = /你的网站域名|github\\\.com|\\_[0-9]/;

// 反爬：站点活着，只是拒绝 curl
const ANTI_BOT = new Set([400, 412, 521]);

const cat = { 正则误报: [], 反爬误报: [], 批量误报: [], 硬404: [], 打不开: [], 服务器错误: [] };

for (const f of bad) {
  if (NOT_A_LINK.test(f.url)) { cat.正则误报.push([f.code || 0, f]); continue; }
  const r = ret.has(f.url) ? ret.get(f.url) : null;
  const code = r !== null ? r : f.code || 0;

  if (r !== null && r >= 200 && r < 400) { cat.批量误报.push([r, f]); continue; } // 串行复测可达
  if (code === 404) { cat.硬404.push([404, f]); continue; }
  if (ANTI_BOT.has(f.code) && r === null && !MALFORMED.test(f.url)) { cat.反爬误报.push([f.code, f]); continue; }
  if (code >= 500) { cat.服务器错误.push([code, f]); continue; }
  cat.打不开.push([code, f]);
}

const files = (f) => (f.in || []).join(' / ');
const L = [];
const P = (s = '') => L.push(s);

L.push('# 外链体检报告 · ' + new Date().toISOString().slice(0, 10));
P();
P(`> 扫描 source/_posts **${j.scanned}** 篇 ｜ 外链 **${j.found}** 条（已排除自有域名与图床）`);
P(`> 批量口径：可达 ${j.ok} / 警告 ${j.warn} / 断链 ${j.bad} ｜ 断链逐条**串行复测**去伪后归如下`);
P();
P(`## 一句话结论：真正要动的只有 ${cat.硬404.length + cat.打不开.length + cat.服务器错误.length} 条，其余是误报`);
P();
P('| 归类 | 条数 | 要不要动 |');
P('|---|---|---|');
P(`| A 反爬误报（csdn 521 / bilibili 412 / sohu 400） | ${cat.反爬误报.length} | ❌ 不动，站点活着只是拒绝 curl |`);
P(`| B 批量误报（并发跑失败，串行复测 2xx/3xx） | ${cat.批量误报.length} | ❌ 不动，链接本来就是好的 |`);
P(`| C 真·硬 404（服务器明确说没有） | ${cat.硬404.length} | ✅ 替换或删除 |`);
P(`| D 域名/路径打不开（curl 000） | ${cat.打不开.length} | ✅ 替换或删除 |`);
P(`| E 服务器错误（5xx） | ${cat.服务器错误.length} | ✅ 替换 |`);
P(`| F 正则误报（文案片段 / 代码示例，不是链接） | ${cat.正则误报.length} | ❌ 不动 |`);
P(`| **合计** | **${Object.values(cat).reduce((a, b) => a + b.length, 0)}** | = 脚本口径的 ${j.bad} 条 |`);
P();
const mal = bad.filter((f) => MALFORMED.test(f.url));
if (mal.length) {
  P(`> 另：**${mal.length} 条链接地址本身被写坏了**（转义反斜杠 / 模板占位符残留），会点不开，属于稿件 bug，见最后一节。`);
  P();
}

const section = (title, arr, fmt) => {
  if (!arr.length) return;
  P(`## ${title}（${arr.length}）`);
  P();
  for (const [c, f] of arr) {
    P(`- ${fmt(c, f)}  `);
    P(`  ↳ 出现于：${files(f)}`);
  }
  P();
};

section('C 真·硬 404 —— 服务器明确返回「没有这个页面」', cat.硬404, (c, f) => `**${c}** ${f.url}`);
section('E 服务器错误 —— 读者点开看到的是错误页', cat.服务器错误, (c, f) => `**${c}** ${f.url}`);
section(
  'D 打不开（curl 返回 000）—— 域名或整条路径已不可达',
  cat.打不开,
  (c, f) => `${MALFORMED.test(f.url) ? '⚠️ ' : ''}\`${f.url}\``
);
section('F 正则误报 —— 是文案片段或代码示例，不是链接', cat.正则误报, (c, f) => `\`${f.url}\``);

P('## A 反爬误报 —— 不要动');
P();
const ag = new Map();
for (const [c, f] of cat.反爬误报) {
  let h = '（无法解析）';
  try { h = new URL(f.url).hostname; } catch { /* ignore */ }
  if (!ag.has(h)) ag.set(h, { n: 0, codes: new Set() });
  ag.get(h).n++;
  ag.get(h).codes.add(c);
}
for (const [h, v] of [...ag.entries()].sort((a, b) => b[1].n - a[1].n)) {
  P(`- **${h}**：${v.n} 条（状态码 ${[...v.codes].join(' / ')}）`);
}
P();
P('> csdn 的 521、bilibili 的 412、sohu 的 400 都是站点反爬策略：curl 带普通 UA 必被拒，浏览器打开完全正常。');
P();

if (cat.批量误报.length) {
  P('## B 批量误报明细 —— 并发跑误记为失败，串行复测全部可达');
  P();
  for (const [c, f] of cat.批量误报) P(`- **${c}** ${f.url}`);
  P();
  P('> ⚠️ **「连接失败」不等于死链，必须串行复测才算数。**');
  P();
}

if (mal.length) {
  P('## 建议改法 · 第一档：链接地址本身写坏了（零风险，不在可见正文里）');
  P();
  for (const f of mal) {
    const fix = /github/i.test(f.url)
      ? 'URL 里混进了 Markdown 转义反斜杠 → `github\\.com` 改成 `github.com`（反斜杠去掉）'
      : f.url.includes('你的网站域名')
        ? '模板占位符没替换 → 换成真实域名（若位于 JSON-LD 则搜索引擎会读到无效 URL，优先修）'
        : 'Markdown 转义符残留 → 把 `\\_` 改回 `_`';
    P(`- \`${f.url}\`  `);
    P(`  ↳ 出现于：${files(f)}  `);
    P(`  ↳ 改法：${fix}`);
  }
  P();
}

P('> 工具只回答「该不该动」，不回答「换成什么」—— 替换目标需要人工判断。');
P();

fs.writeFileSync(outPath, L.join('\n'), 'utf8');
console.log('已写出：' + outPath);
console.log('分类条数：' + Object.entries(cat).map(([k, v]) => `${k}=${v.length}`).join('  '));
const sum = Object.values(cat).reduce((a, b) => a + b.length, 0);
console.log(`校验合计：${sum} / 应为 ${j.bad}${sum === j.bad ? ' ✅' : ' ❌ 不平，判据有漏！'}`);
