#!/usr/bin/env node
/**
 * tools/pipeline-board.js —— 内容管线状态看板（只读为主，可改 Brief 状态）
 * ------------------------------------------------------------------
 * 为什么需要它：
 *   现在 `source/_drafts/` 是个黑洞 —— 稿子进去之后，没人知道它停在哪一步、
 *   停了多久、是被卡住还是被忘了。发布之后也没有回看。这个脚本把「brief →
 *   drafted → reviewed → published → needs-update」变成一条可见的状态线。
 *
 * 状态来源（尽量不改既有文件）：
 *   - briefs/*.md      → 读 front-matter 的 status 字段
 *   - source/_drafts/  → 一律视为 drafted
 *   - source/_posts/   → 一律视为 published（noindex 的标降权）
 *   关联方式：brief 的 target_title / abbrlink 与草稿、正文的 title / abbrlink 对得上。
 *
 * 用法：
 *   node tools/pipeline-board.js                # 看板
 *   node tools/pipeline-board.js --stale=7      # 只看卡住 ≥7 天的
 *   node tools/pipeline-board.js --json         # 机读
 *   node tools/pipeline-board.js --set "slug" reviewed   # 推进 Brief 状态并记时间
 * 退出码：0 正常；1 参数/文件错误
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BRIEF_DIR = path.join(ROOT, 'briefs');
const DRAFT_DIR = path.join(ROOT, 'source', '_drafts');
const POST_DIR = path.join(ROOT, 'source', '_posts');
const STATES = ['brief', 'drafted', 'reviewed', 'published', 'needs-update'];

function parseArgs(argv) {
  const out = { _: [] };
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
    else out._.push(a);
  }
  return out;
}

function splitFM(raw) {
  const m = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  return m ? { fm: m[1], body: raw.slice(m[0].length) } : { fm: '', body: raw };
}
function getScalar(fm, key) {
  const m = fm.match(new RegExp('^' + key + '\\s*:\\s*(.*)$', 'm'));
  if (!m) return '';
  return m[1].trim().replace(/^['"]|['"]$/g, '');
}
function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(dir, f));
}
function daysSince(ts) {
  return Math.floor((Date.now() - ts) / 86400000);
}
function readItem(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const { fm, body } = splitFM(raw);
  const dateStr = getScalar(fm, 'date');
  let pubAge = null;
  if (dateStr) {
    const d = new Date(dateStr.replace(/-/g, '/').replace(/\s.*/, ''));
    if (!isNaN(d)) pubAge = Math.floor((Date.now() - d.getTime()) / 86400000);
  }
  return {
    file,
    pubAge,
    name: path.basename(file, '.md'),
    title: getScalar(fm, 'title').replace(/^Brief · /, ''),
    abbr: getScalar(fm, 'abbrlink'),
    status: getScalar(fm, 'status'),
    keyword: getScalar(fm, 'keyword'),
    targetTitle: getScalar(fm, 'target_title'),
    noindex: /^noindex\s*:\s*true/m.test(fm) || /noindex/.test(getScalar(fm, 'robots')),
    mtime: fs.statSync(file).mtimeMs,
    chars: body.replace(/\s/g, '').length,
  };
}

const args = parseArgs(process.argv.slice(2));

// ---------- --set：推进状态 ----------
if (args.set) {
  const slug = String(args.set);
  const newStatus = String(args._[0] || '').trim();
  if (!STATES.includes(newStatus)) {
    console.error('状态必须是：' + STATES.join(' / '));
    process.exit(1);
  }
  const candidates = listFiles(BRIEF_DIR).filter((f) => path.basename(f).includes(slug));
  if (candidates.length !== 1) {
    console.error(`匹配到 ${candidates.length} 个 Brief，请给更精确的 slug。候选：`);
    candidates.forEach((c) => console.error('  ' + path.basename(c)));
    process.exit(1);
  }
  const f = candidates[0];
  let raw = fs.readFileSync(f, 'utf8');
  if (/^status\s*:/m.test(raw)) {
    raw = raw.replace(/^status\s*:.*$/m, `status: ${newStatus}`);
  } else {
    raw = raw.replace(/^---\r?\n/, `---\nstatus: ${newStatus}\n`);
  }
  const stamp = new Date().toISOString().slice(0, 10);
  if (raw.includes('- 状态记录：')) {
    raw = raw.replace(/- 状态记录：/, `- 状态记录：\n  - ${stamp} → **${newStatus}**`);
  }
  fs.writeFileSync(f, raw, 'utf8');
  console.log(`✅ ${path.basename(f)} 状态 → ${newStatus}`);
  process.exit(0);
}

// ---------- 采集 ----------
const briefs = listFiles(BRIEF_DIR).map(readItem);
const drafts = listFiles(DRAFT_DIR).map(readItem);
const posts = listFiles(POST_DIR).map(readItem);

const items = [];

for (const b of briefs) {
  const linkedPost = posts.find(
    (p) => (b.abbr && p.abbr === b.abbr) || (b.targetTitle && p.title === b.targetTitle)
  );
  const linkedDraft = drafts.find(
    (d) => (b.targetTitle && d.title === b.targetTitle) || (b.keyword && d.title.includes(b.keyword.slice(0, 6)))
  );
  let status = b.status || 'brief';
  if (linkedPost) status = 'published';
  else if (linkedDraft && status === 'brief') status = 'drafted';
  items.push({
    status,
    title: b.targetTitle || b.title,
    src: 'brief',
    file: b.file,
    days: daysSince(b.mtime),
    linked: linkedPost ? `posts/${linkedPost.abbr || linkedPost.name}` : linkedDraft ? 'draft' : '',
    abbr: b.abbr || (linkedPost && linkedPost.abbr) || '',
  });
}

// 未关联 brief 的草稿
for (const d of drafts) {
  const has = items.some((i) => i.linked === 'draft' && i.title && (d.title === i.title || d.title.includes(i.title.slice(0, 6))));
  if (has) continue;
  items.push({ status: 'drafted', title: d.title || d.name, src: 'draft', file: d.file, days: daysSince(d.mtime), linked: '', abbr: d.abbr });
}

// 近 90 天发布的（老文不刷屏）
const recentPosts = posts.filter((p) => (p.pubAge !== null ? p.pubAge <= 90 : daysSince(p.mtime) <= 90));
for (const p of recentPosts) {
  items.push({
    status: 'published',
    title: p.title || p.name,
    src: 'post',
    file: p.file,
    days: p.pubAge !== null ? p.pubAge : daysSince(p.mtime),
    linked: `posts/${p.abbr || p.name}`,
    abbr: p.abbr,
    noindex: p.noindex,
  });
}

// ---------- 输出 ----------
const stale = args.stale ? Number(args.stale) : 0;
const shown = stale ? items.filter((i) => i.days >= stale) : items;

if (args.json) {
  console.log(JSON.stringify({ total: items.length, items: shown }, null, 2));
  process.exit(0);
}

const count = (s) => items.filter((i) => i.status === s).length;
console.log('=== 内容管线看板 ===\n');
console.log(`brief ${count('brief')} ｜ drafted ${count('drafted')} ｜ reviewed ${count('reviewed')} ｜ 近90天发布 ${recentPosts.length}\n`);

const order = { brief: 0, drafted: 1, reviewed: 2, 'needs-update': 3, published: 4 };
const sorted = shown.sort((a, b) => (order[a.status] - order[b.status]) || (b.days - a.days));

const NEXT = {
  brief: '填任务书 → 开写',
  drafted: '过 4 道闸门 → 预览 → 待批准',
  reviewed: '等部署批准',
  published: '90 天后看数据决定是否翻新',
  'needs-update': '按复盘结论翻新',
};

let lastStatus = '';
for (const i of sorted) {
  if (i.status !== lastStatus) {
    console.log(`\n-- ${i.status} --`);
    lastStatus = i.status;
  }
  const flag = i.days >= 14 && i.status !== 'published' ? ' ⚠️停滞' : '';
  const ni = i.noindex ? ' [noindex]' : '';
  console.log(
    `  ${String(i.days).padStart(3)}天  ${i.title.slice(0, 36).padEnd(38)}${ni}${flag}  → ${NEXT[i.status] || ''}`
  );
}

console.log('\n提示：`node tools/pipeline-board.js --set "<slug>" reviewed` 推进状态');
console.log('      `node tools/pipeline-board.js --stale=14` 只看卡住的\n');
