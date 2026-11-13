#!/usr/bin/env node
/**
 * tools/run-matrix.js —— 矩阵批量执行器（让「模式 B」从规划表落到一篇篇成稿）
 * ------------------------------------------------------------------
 * matrix-planner 只产出「规划表」，这个工具负责把它变成「可执行、可追踪、
 * 可续跑」的工单队列，并把矩阵内链拓扑真正兑现：
 *
 *   1. 载入规划 JSON，按依赖拓扑生成有序工单（P 支柱页 → C 集群页 → L 长尾页）
 *   2. 每次 --next 给出一张**完整工单**（栏目/白名单标签/关键词/意图/内链 spec），
 *      其中「要链向的矩阵兄弟」会解析成**真实 URL**（依赖项完工后自动回填 abbrlink）
 *   3. --done 登记完工（自动从新文章 front-matter 抽取 abbrlink），进度落盘可续跑
 *   4. --verify 校验每篇完工文里「矩阵要求的站内链接」是否真的写进了正文
 *
 * 为什么需要它：矩阵最容易死在「规划完就散了」——写了 P 忘了让 C 链回 P，
 * 或者链接到不存在的 abbrlink（构建不报错，上线才 404）。工单队列把这两件事
 * 变成每篇交付时必过的检查。
 *
 * 用法：
 *   node tools/run-matrix.js --plan=D:/1/1/.tmp/matrix1.json            # 初始化 + 看队列
 *   node tools/run-matrix.js --plan=... --next                          # 取出下一张工单
 *   node tools/run-matrix.js --plan=... --done=1 --file=source/_posts/xxx.md
 *   node tools/run-matrix.js --plan=... --status                        # 进度表
 *   node tools/run-matrix.js --plan=... --verify                        # 校验已完成文章的矩阵内链
 *   node tools/run-matrix.js --plan=... --reset                         # 清空进度
 *
 * 状态文件默认落在 <repo>/../.tmp/matrix-state/<seed-slug>.json（不占 C 盘），可用 --state-dir 改。
 * 退出码：0 = 正常；1 = 参数/依赖错误，或 --verify 发现内链缺失
 *
 * 注意：不要把这个文件放进 scripts/ —— hexo 会把 scripts/ 下的每个 .js 当插件加载执行。
 */
'use strict';

const execFileSync = require('child_process').execFileSync;
const fs = require('fs');
const path = require('path');
const { MINORS, CATEGORIES } = require('./check-tags');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'source', '_posts');

const argv = process.argv.slice(2);
// 同时支持 `--x=val` 与 `--x val` 两种写法（曾因只认等号而静默丢参数）
const getArg = (n, d) => {
  const i = argv.findIndex((a) => a === n || a.startsWith(n + '='));
  if (i === -1) return d;
  const a = argv[i];
  if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
  const nx = argv[i + 1];
  return nx && !nx.startsWith('--') ? nx : d;
};
const has = (n) => argv.some((a) => a === n || a.startsWith(n + '='));

const PLAN = getArg('--plan', '');
const STATE_DIR = getArg('--state-dir', path.resolve(ROOT, '..', '.tmp', 'matrix-state'));
const DONE_ID = getArg('--done', '');
const DONE_FILE = getArg('--file', '');
const AS_JSON = has('--json');

if (!PLAN) {
  console.error('用法：node tools/run-matrix.js --plan=<matrix.json> [--next|--status|--done=<id> --file=<md>|--verify|--reset]');
  process.exit(1);
}
if (!fs.existsSync(PLAN)) {
  console.error('规划文件不存在：' + PLAN);
  process.exit(1);
}

// ---------------- 载入规划 ----------------
const plan = JSON.parse(fs.readFileSync(PLAN, 'utf8'));
if (!plan.rows || !plan.rows.length) {
  console.error('规划文件里没有 rows：' + PLAN);
  process.exit(1);
}

const slug = String(plan.seed || 'matrix')
  .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 40);
const stateFile = path.join(STATE_DIR, slug + '.json');

// ---------------- front-matter 小工具 ----------------
function readAbbr(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return '';
  const a = m[1].match(/^abbrlink\s*:\s*["']?([^"'\s]+)["']?/m);
  return a ? a[1] : '';
}
function readScalar(file, key) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return '';
  const v = m[1].match(new RegExp('^' + key + '\\s*:\\s*(.*)$', 'm'));
  return v ? v[1].trim().replace(/^['"]|['"]$/g, '') : '';
}

// ---------------- 依赖拓扑 ----------------
// P(支柱页) 无依赖；C(集群) 依赖 P；L(长尾) 依赖 P + 对应 C。
// 这样 --next 永远先给 P，P 完工后 C 的工单里才能回填 P 的真实 URL。
function buildQueue(rows) {
  const idOf = (i) => i + 1;
  return rows.map((r, i) => {
    const isPillar = /^P/.test(r.role);
    const isCluster = /^C/.test(r.role);
    const isLong = /^L/.test(r.role);
    const deps = isPillar ? [] : isCluster ? [idOf(0)] : isLong ? [idOf(0)] : [];
    return {
      id: idOf(i),
      role: r.role,
      kind: isPillar ? 'P' : isCluster ? 'C' : isLong ? 'L' : 'X',
      title: r.title,
      col: r.col,
      tags: r.tags || [],
      kw: r.kw,
      intent: r.intent,
      linkSpec: r.link,
      deps,
      status: 'pending',
      file: '',
      abbr: '',
      doneAt: '',
    };
  });
}

// ---------------- 状态读写 ----------------
function loadState() {
  if (fs.existsSync(stateFile)) return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const st = {
    seed: plan.seed,
    pillar: plan.pillar,
    column: plan.column,
    planFile: path.resolve(PLAN),
    createdAt: new Date().toISOString(),
    items: buildQueue(plan.rows),
  };
  saveState(st);
  return st;
}
function saveState(st) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(st, null, 2), 'utf8');
}

// ---------------- 标签合规自检（红线）----------------
function tagWarn(tags) {
  const illegal = (tags || []).filter((t) => !MINORS.has(t));
  return illegal;
}

// ---------------- 站内相关文章（内链候选）----------------
function relatedFor(kw, top = 4) {
  try {
    const out = execFileSync('node', [path.join(__dirname, 'find-related-posts.js'), '--query=' + kw, '--top=' + top, '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(out).related || [];
  } catch (e) {
    return [];
  }
}

// ---------------- 工单渲染 ----------------
function renderTicket(st, item) {
  const L = [];
  const col = item.col;
  const colOk = CATEGORIES.includes(col);
  L.push('╔══════════════════════════════════════════════════════════════');
  L.push('║ 工单 #' + item.id + ' · ' + item.role);
  L.push('╚══════════════════════════════════════════════════════════════');
  L.push('');
  L.push('【身份】' + (item.kind === 'P' ? '支柱页（承主关键词，接收全部下游内链）' : item.kind === 'C' ? '集群页（子话题，链回支柱页并与其他集群互链）' : '长尾页（具体问句，链向对应集群/支柱页）'));
  L.push('【标题候选】' + item.title);
  L.push('【目标栏目】' + col + (colOk ? '' : '   ⚠️ 不在站内 6 栏目内，务必核对'));
  L.push('【建议标签】' + (item.tags || []).join('、') + '   （须过 check-tags，2~5 个）');
  if (tagWarn(item.tags).length) L.push('   ⚠️ 上列标签含非白名单词：' + tagWarn(item.tags).join('、') + ' —— 必须替换');
  L.push('【目标关键词】' + item.kw);
  L.push('【搜索意图】' + item.intent);
  L.push('');
  L.push('── 内链 spec（矩阵内，必做）' + '─'.repeat(30));
  const sibs = st.items.filter((x) => x.id !== item.id);
  for (const dep of item.deps) {
    const d = st.items.find((x) => x.id === dep);
    if (!d) continue;
    if (d.abbr) {
      L.push('  ✔ 链向 #' + d.id + '（' + d.role + '）→ https://mfy-lifeline.com/posts/' + d.abbr + '/');
      L.push('     锚文本建议：' + d.title.replace(/[《》]/g, ''));
    } else {
      L.push('  ⏳ 链向 #' + d.id + '（' + d.role + '）：该文尚未完工，完工后本工单会自动回填真实 URL');
      L.push('     → 先写「待补：链向 #' + d.id + '」，P 完工后再回来一次性补链');
    }
  }
  if (item.kind === 'C') {
    const others = sibs.filter((x) => x.kind === 'C' && x.abbr);
    if (others.length) others.forEach((o) => L.push('  ↔ 与 #' + o.id + ' 互链 → https://mfy-lifeline.com/posts/' + o.abbr + '/'));
    else L.push('  ↔ 与其他集群页互链（同矩阵，等它们完工后回填）');
  }
  L.push('  规则：' + item.linkSpec);
  L.push('');
  L.push('── 可链向的站内现有文章（推荐 2~3 条）' + '─'.repeat(20));
  const rel = relatedFor(item.kw, 4);
  if (!rel.length) L.push('  （未检索到相关文，可忽略）');
  rel.forEach((r, i) => L.push('  [' + (i + 1) + '] ' + r.title + '\n      ' + r.url + '\n      锚文本：' + (r.anchors || []).join(' 或 ')));
  L.push('');
  L.push('── 硬约束（红线，交付前必过）' + '─'.repeat(26));
  L.push('  □ front-matter 齐全（含 faq: ，FAQPage 只认 front-matter）');
  L.push('  □ tags 2~5 个且全在 80 词白名单；categories 单值取站内 6 栏目');
  L.push('  □ 内链一律用 /posts/<abbrlink>/ 形式，写完用 find-related-posts --file 验死链');
  L.push('  □ 配图 16:9，上传图床后验真，正文无任何可见 SEO/GEO 标记');
  L.push('  □ 标签闸门：node tools/check-tags.js --file="<本文路径>"');
  L.push('');
  L.push('── 完工后登记 ─' + '─'.repeat(40));
  L.push('  node tools/run-matrix.js --plan="' + PLAN + '" --done=' + item.id + ' --file="<新文章 md 路径>"');
  return L.join('\n');
}

// ---------------- 子命令 ----------------
const st = loadState();

if (has('--reset')) {
  fs.rmSync(stateFile, { force: true });
  console.log('已清空进度：' + stateFile);
  process.exit(0);
}

if (DONE_ID) {
  const item = st.items.find((x) => String(x.id) === String(DONE_ID));
  if (!item) {
    console.error('找不到工单 #' + DONE_ID);
    process.exit(1);
  }
  // 依赖未完工不许标记完成（防止内链拓扑断裂）
  const unmet = item.deps.map((d) => st.items.find((x) => x.id === d)).filter((d) => d && d.status !== 'done');
  if (unmet.length) {
    console.error('✗ 依赖未完工，不能标记 #' + item.id + ' 完成：' + unmet.map((u) => '#' + u.id + ' ' + u.role).join('、'));
    process.exit(1);
  }
  let file = DONE_FILE;
  if (file) {
    if (!path.isAbsolute(file)) file = path.join(ROOT, file);
    if (!fs.existsSync(file)) {
      console.error('文件不存在：' + file);
      process.exit(1);
    }
    const abbr = readAbbr(file);
    if (!abbr) {
      console.error('⚠️ 该文件 front-matter 里没有 abbrlink —— 内链将无法回填。请先确认 abbrlink 存在。');
      process.exit(1);
    }
    item.file = path.relative(ROOT, file).replace(/\\/g, '/');
    item.abbr = abbr;
  }
  item.status = 'done';
  item.doneAt = new Date().toISOString();
  saveState(st);
  console.log('✔ 工单 #' + item.id + ' 已标记完成' + (item.abbr ? '（abbrlink ' + item.abbr + '）' : '（未登记文件）'));
  const next = st.items.find((x) => x.status !== 'done');
  console.log(next ? '下一张：#' + next.id + ' ' + next.role + '  →  node tools/run-matrix.js --plan="' + PLAN + '" --next' : '🎉 矩阵全部完工！接着跑内链架构师：node tools/link-architect.js');
  process.exit(0);
}

if (has('--verify')) {
  let bad = 0;
  console.log('=== 矩阵内链校验 ===');
  for (const item of st.items) {
    if (item.status !== 'done') continue;
    if (!item.file) { console.log('  [ 跳过 ] #' + item.id + ' 未登记文件'); continue; }
    const p = path.join(ROOT, item.file);
    if (!fs.existsSync(p)) { console.log('  [ 缺失 ] #' + item.id + ' 文件不存在：' + item.file); bad++; continue; }
    const body = fs.readFileSync(p, 'utf8');
    const required = item.deps.map((d) => st.items.find((x) => x.id === d)).filter((d) => d && d.abbr);
    const missing = required.filter((d) => !body.includes('/posts/' + d.abbr + '/'));
    if (missing.length) {
      bad++;
      console.log('  [ 断链 ] #' + item.id + ' 缺少指向 ' + missing.map((m) => '#' + m.id + '(/' + m.abbr + '/)').join('、') + ' 的内链');
    } else {
      console.log('  [ 通过 ] #' + item.id + ' ' + item.role + (required.length ? '（' + required.length + ' 条矩阵内链在位）' : '（无依赖）'));
    }
  }
  console.log('');
  console.log(bad ? '存在 ' + bad + ' 处矩阵内链缺失（退出码 1）' : '矩阵内链全部在位（退出码 0）');
  process.exit(bad ? 1 : 0);
}

if (has('--next')) {
  const next = st.items.find((x) => x.status !== 'done');
  if (!next) {
    console.log('🎉 矩阵全部完工！');
    process.exit(0);
  }
  console.log(renderTicket(st, next));
  process.exit(0);
}

// 默认 / --status：进度表
if (AS_JSON) {
  console.log(JSON.stringify(st, null, 2));
  process.exit(0);
}
const done = st.items.filter((x) => x.status === 'done').length;
console.log('=== 矩阵执行进度：' + st.seed + ' ===');
console.log('栏目：' + st.column + ' ｜ 支柱：' + st.pillar);
console.log('状态文件：' + stateFile);
console.log('进度：' + done + ' / ' + st.items.length + ' 完工');
console.log('');
console.log('| # | 角色 | 依赖 | 状态 | abbrlink | 标题 |');
console.log('|---|---|---|---|---|---|');
for (const it of st.items) {
  console.log('| ' + it.id + ' | ' + it.role + ' | ' + (it.deps.length ? it.deps.map((d) => '#' + d).join(',') : '—') + ' | ' +
    (it.status === 'done' ? '✔ 完成' : '待写') + ' | ' + (it.abbr ? '`' + it.abbr + '`' : '—') + ' | ' + it.title + ' |');
}
console.log('');
const next = st.items.find((x) => x.status !== 'done');
console.log(next ? '▶ 下一张：node tools/run-matrix.js --plan="' + PLAN + '" --next' : '🎉 全部完工，可跑 --verify 校验内链');
