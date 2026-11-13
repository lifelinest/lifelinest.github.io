#!/usr/bin/env node
/**
 * tools/retro.js —— 发布后复盘（把「发完就不管」补成闭环）
 * ------------------------------------------------------------------
 * 为什么需要它：
 *   现在文章上线之后没有任何回看机制。闸门保证「不出错」，但没有反馈回路，
 *   就不会出现「越写越准」。这个脚本做三件事：
 *     1) --build   从 source/_posts 生成复盘表骨架（内容侧指标自动算）
 *     2) --fill    把真实数据（必应站长 API / 51.la / 手工导出的 GSC）按 abbrlink 合并进表
 *     3) --report  按固定阈值把文章分桶，输出「这周该动哪几篇」
 *
 * 为什么不直接问 AI 分析：
 *   高曝光低 CTR、排名 4–15、有点击无询盘 —— 这些都是阈值判断，脚本算得又快又准，
 *   而且可复现。AI 只在「具体怎么改标题/补哪一节」时才有增量。
 *
 * 用法：
 *   node tools/retro.js --build                 # 生成/刷新 retro/<YYYY-MM>.csv
 *   node tools/retro.js --build --all           # 全量（默认只含近 18 个月）
 *   node tools/retro.js --fill=../.tmp/bing.json
 *   node tools/retro.js --report                # 分桶报告 + 写出 retro/report-<date>.md
 *
 * --fill 的 JSON 格式（按 abbrlink 索引，字段可缺）：
 *   { "9f2a7c1e": { "impressions": 1200, "clicks": 8, "position": 12.4, "inquiries": 0 } }
 * 退出码：0 正常；1 参数/文件错误
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const POST_DIR = path.join(ROOT, 'source', '_posts');
const RETRO_DIR = path.join(ROOT, 'retro');

const COLS = [
  'abbrlink', 'title', 'category', 'tags', 'publish_date', 'age_days',
  'chars', 'imgs', 'internal_links',
  'pv', 'impressions', 'clicks', 'ctr', 'position', 'inquiries',
  'next_action', 'notes',
];

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}
function splitFM(raw) {
  const m = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  return m ? { fm: m[1], body: raw.slice(m[0].length) } : { fm: '', body: raw };
}
function getScalar(fm, key) {
  const m = fm.match(new RegExp('^' + key + '\\s*:\\s*(.*)$', 'm'));
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
}
function getCats(fm) {
  const lines = fm.split(/\r?\n/);
  const i = lines.findIndex((l) => /^categories\s*:/.test(l));
  if (i < 0) return [];
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    const m = lines[j].match(/^\s+-\s+(.+)$/);
    if (m) out.push(m[1].trim());
    else if (/^[a-zA-Z_]+\s*:/.test(lines[j])) break;
  }
  return out;
}
function getTags(fm) {
  const inline = fm.match(/^tags\s*:\s*\[(.*?)\]/m);
  if (inline) return inline[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  const lines = fm.split(/\r?\n/);
  const i = lines.findIndex((l) => /^tags\s*:/.test(l));
  if (i < 0) return [];
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    const m = lines[j].match(/^\s+-\s+(.+)$/);
    if (m) out.push(m[1].trim());
    else if (/^[a-zA-Z_]+\s*:/.test(lines[j])) break;
  }
  return out;
}
function csvCell(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function loadPosts() {
  if (!fs.existsSync(POST_DIR)) return [];
  return fs
    .readdirSync(POST_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const file = path.join(POST_DIR, f);
      const raw = fs.readFileSync(file, 'utf8');
      const { fm, body } = splitFM(raw);
      const dateStr = getScalar(fm, 'date') || '';
      const d = dateStr ? new Date(dateStr.replace(/-/g, '/').replace(/\s.*/, '')) : fs.statSync(file).mtime;
      const ageDays = isNaN(d) ? 999 : Math.floor((Date.now() - d.getTime()) / 86400000);
      return {
        abbrlink: getScalar(fm, 'abbrlink').replace(/^'|'$/g, ''),
        title: getScalar(fm, 'title'),
        category: getCats(fm).join('/'),
        tags: getTags(fm).join('、'),
        publish_date: dateStr.slice(0, 10),
        age_days: ageDays,
        chars: body.replace(/\s/g, '').length,
        imgs: (body.match(/<img\s|!\[[^\]]*\]\(/g) || []).length,
        internal_links: (body.match(/\]\(\/posts\/|mfy-lifeline\.com\/posts\//g) || []).length,
        noindex: /noindex/.test(fm),
      };
    });
}

const args = parseArgs(process.argv.slice(2));
const now = new Date();
const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const csvPath = path.join(RETRO_DIR, `${ym}.csv`);

fs.mkdirSync(RETRO_DIR, { recursive: true });

// ---------- --build ----------
if (args.build) {
  const posts = loadPosts().filter((p) => args.all || p.age_days <= 550);
  // 保留表里已填的数据列
  const prev = new Map();
  if (fs.existsSync(csvPath)) {
    const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(Boolean);
    const head = parseCsvLine(lines[0]);
    for (const line of lines.slice(1)) {
      const cells = parseCsvLine(line);
      const row = {};
      head.forEach((h, i) => (row[h] = cells[i] || ''));
      if (row.abbrlink) prev.set(row.abbrlink, row);
    }
  }
  const rows = posts
    .sort((a, b) => b.age_days - a.age_days)
    .map((p) => {
      const old = prev.get(p.abbrlink) || {};
      const row = { ...p };
      for (const k of ['pv', 'impressions', 'clicks', 'position', 'inquiries', 'next_action', 'notes']) {
        row[k] = old[k] || '';
      }
      row.ctr = row.impressions && row.clicks ? ((row.clicks / row.impressions) * 100).toFixed(2) + '%' : '';
      if (p.noindex) row.notes = (row.notes ? row.notes + ' ' : '') + '[noindex]';
      return row;
    });
  const csv = [COLS.join(','), ...rows.map((r) => COLS.map((c) => csvCell(r[c])).join(','))].join('\n');
  fs.writeFileSync(csvPath, csv, 'utf8');
  console.log(`✅ 复盘表已生成：${path.relative(ROOT, csvPath)}（${rows.length} 篇，保留已填数据列）`);
  console.log('   下一步：node tools/retro.js --fill=<数据.json> 或直接在表里手填 PV/曝光/询盘');
  process.exit(0);
}

// ---------- --fill ----------
if (args.fill) {
  const src = path.resolve(ROOT, String(args.fill));
  if (!fs.existsSync(src)) {
    console.error('找不到数据文件：' + src);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(src, 'utf8'));
  if (!fs.existsSync(csvPath)) {
    console.error('还没有复盘表，先跑 --build');
    process.exit(1);
  }
  const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(Boolean);
  const head = parseCsvLine(lines[0]);
  let hit = 0;
  const out = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = {};
    head.forEach((h, i) => (row[h] = cells[i] || ''));
    const d = data[row.abbrlink];
    if (d) {
      hit++;
      for (const k of ['pv', 'impressions', 'clicks', 'position', 'inquiries']) {
        if (d[k] !== undefined && d[k] !== null && d[k] !== '') row[k] = d[k];
      }
      if (row.impressions && row.clicks) row.ctr = ((Number(row.clicks) / Number(row.impressions)) * 100).toFixed(2) + '%';
    }
    return COLS.map((c) => csvCell(row[c])).join(',');
  });
  fs.writeFileSync(csvPath, [lines[0], ...out].join('\n'), 'utf8');
  console.log(`✅ 已合并 ${hit} 条数据到 ${path.relative(ROOT, csvPath)}`);
  process.exit(0);
}

// ---------- --report（默认）----------
if (!fs.existsSync(csvPath)) {
  console.error('还没有复盘表，先跑：node tools/retro.js --build');
  process.exit(1);
}
const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(Boolean);
const head = parseCsvLine(lines[0]);
const rows = lines.slice(1).map((line) => {
  const cells = parseCsvLine(line);
  const o = {};
  head.forEach((h, i) => (o[h] = cells[i] || ''));
  return o;
});

const num = (v) => (v === '' || v === undefined ? NaN : Number(String(v).replace('%', '')));
// 关键：没有数据 ≠ 表现差。所有涉及曝光/PV/询盘的判据都必须先确认「有数据」，
// 否则空表会被误判成「83 篇未被索引」，这种结论比没有结论更危险。
const hasData = (r) => !isNaN(num(r.impressions)) || !isNaN(num(r.pv));
const buckets = [
  {
    key: '待补数据',
    rule: '该行没有曝光也没有 PV',
    test: (r) => !hasData(r),
    action: '先跑 --fill 或手填数据；没有数据之前不要对这篇文章下任何结论',
  },
  {
    key: '未索引嫌疑',
    rule: '有数据但曝光为 0 且 PV 为 0，发布 >60 天',
    test: (r) => hasData(r) && r.age_days > 60 && !num(r.impressions) && !num(r.pv),
    action: '查是否被收录（site: 或站长后台），别急着改内容',
  },
  {
    key: '高曝光零点击',
    rule: '曝光 ≥100 且点击 = 0',
    test: (r) => num(r.impressions) >= 100 && num(r.clicks) === 0,
    action: '标题/描述与意图错配，或 SERP 被 AI 摘要吃掉',
  },
  {
    key: '高曝光低 CTR',
    rule: '曝光 ≥500 且 CTR <1%',
    test: (r) => num(r.impressions) >= 500 && num(r.ctr) < 1,
    action: '改标题与首段，别动正文主体',
  },
  {
    key: '临门一脚',
    rule: '排名 4–15 且曝光 ≥100',
    test: (r) => num(r.position) >= 4 && num(r.position) <= 15 && num(r.impressions) >= 100,
    action: '补 FAQ/扩写缺口段落，比新写一篇更划算',
  },
  {
    key: '残留索引（noindex 仍有点击）',
    rule: '已设 noindex 但曝光/点击 > 0',
    test: (r) => isNoindexRow(r) && (num(r.impressions) > 0 || num(r.clicks) > 0),
    action: '确认线上 meta 是否真的生效；生效则等搜索引擎自然剔除，别再加内容',
  },
  {
    key: '有流量无询盘',
    rule: '点击 ≥30 且询盘 = 0',
    test: (r) => num(r.clicks) >= 30 && num(r.inquiries) === 0,
    action: '缺决策价值：加参数/成本/对比/CTA，而不是加字数',
  },
  {
    key: '老文待翻新',
    rule: '发布 >180 天且无询盘',
    test: (r) => hasData(r) && num(r.age_days) > 180 && num(r.impressions) >= 20 && (!num(r.inquiries) || num(r.inquiries) === 0),
    action: '按 Brief 重写目标段，检查信息是否过时',
  },
];

// noindex 的文章是主动降权的，不参与「该优化哪篇」的判定，否则会持续污染建议
const isNoindexRow = (r) => /\[noindex\]/.test(r.notes || '');
const isNoindex = isNoindexRow;
const live = rows.filter((r) => !isNoindex(r));
const skipped = rows.length - live.length;
const total = live.length;
const filled = live.filter((r) => num(r.impressions) || num(r.pv)).length;

const md = [];
md.push(`# 内容复盘报告 ${now.toISOString().slice(0, 10)}`);
md.push('');
md.push(`- 纳入文章：${total} 篇（其中 ${filled} 篇已有曝光/PV 数据；另有 ${skipped} 篇 noindex 已排除）`);
md.push(`- 数据口径：曝光/点击/排名来自 GSC 或必应站长；PV 来自 51.la；询盘需手填（站内无自动采集）`);
md.push(`- 判定方式：阈值规则（可复现），AI 只用于「具体怎么改」`);
md.push('');

console.log(`\n=== 内容复盘（${total} 篇，${filled} 篇有数据）===\n`);
for (const b of buckets) {
  const pool = b.key.startsWith('残留索引') ? rows : live;
  const hit = pool.filter(b.test).sort((a, b) => (num(b.impressions) || 0) - (num(a.impressions) || 0));
  console.log(`【${b.key}】${hit.length} 篇　（判据：${b.rule}）`);
  if (hit.length) {
    console.log(`　动作：${b.action}`);
    hit.slice(0, 8).forEach((r) => {
      const t = (r.title || '').slice(0, 34);
      const metric = `曝光${r.impressions || '-'} 点击${r.clicks || '-'} 排名${r.position || '-'}`;
      console.log(`　· ${t.padEnd(36)} ${metric}`);
    });
    if (hit.length > 8) console.log(`　· …还有 ${hit.length - 8} 篇（见报告文件）`);
  }
  console.log('');
  md.push(`## ${b.key}（${hit.length} 篇）`);
  md.push('');
  md.push(`> 判据：${b.rule}　→　${b.action}`);
  md.push('');
  if (hit.length) {
    md.push('| 标题 | 发布 | 曝光 | 点击 | CTR | 排名 | 询盘 |');
    md.push('|---|---|---|---|---|---|---|');
    hit.forEach((r) =>
      md.push(`| ${r.title} | ${r.publish_date} | ${r.impressions || '-'} | ${r.clicks || '-'} | ${r.ctr || '-'} | ${r.position || '-'} | ${r.inquiries || '-'} |`)
    );
  } else {
    md.push('_无_');
  }
  md.push('');
}

if (filled === 0) {
  console.log('⚠️ 目前没有任何数据列被填。先跑 --fill，或在 retro/' + ym + '.csv 里手填 impressions/clicks/inquiries。');
  md.push('> ⚠️ 数据列全空：先 `--fill` 或手填，否则本报告的阈值判断不成立。');
}

const reportPath = path.join(RETRO_DIR, `report-${now.toISOString().slice(0, 10)}.md`);
fs.writeFileSync(reportPath, md.join('\n'), 'utf8');
console.log(`报告已写入：${path.relative(ROOT, reportPath)}\n`);
