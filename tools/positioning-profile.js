#!/usr/bin/env node
/**
 * tools/positioning-profile.js —— 博客「实时定位画像」（数据底座，无网络）
 * ------------------------------------------------------------------
 * 解析 source/_posts 全部文章的 front-matter，统计：
 *   - 6 个栏目的真实篇数（不再依赖 site-profile.md 的过期快照）
 *   - 3 大支柱的占比（定位与库存是否错位）
 *   - 高频标签 Top N
 *   - 短板排名（哪根支柱/栏目最该补）
 *
 * 输出 JSON（--json <path> 落盘）+ 文本摘要到 stdout。
 *
 * 既能被 CLI 直接跑，也能被 topic-fit-scorer / matrix-planner require：
 *   const { buildProfile, PILLARS, COLUMN_PILLAR } = require('./positioning-profile');
 *
 * 红线：只读，不改任何文件。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'source', '_posts');
const EXCLUDE = new Set(['个人博客文章标签使用规范.md']);

// 站内 6 栏目（必须与 site-profile.md / check-tags.js 白名单一致）
const COLUMNS = [
  '效率工具与软件',
  '外贸B2B独立站',
  '博客建站与前端',
  'AI内容增长',
  '数字生活',
  'SEO与Google Ads',
];

// 三大支柱 → 对应栏目（站点定位，2026-09-19 冻结）
const PILLARS = {
  '外贸B2B独立站实战': ['外贸B2B独立站'],
  'AI内容增长工作流': ['AI内容增长'],
  'SEO与Google Ads 流量增长': ['SEO与Google Ads'],
};
// 反查：栏目 → 支柱（非支柱栏目映射为 null）
const COLUMN_PILLAR = {};
for (const [pillar, cols] of Object.entries(PILLARS)) {
  for (const c of cols) COLUMN_PILLAR[c] = pillar;
}
// 哪些栏目是「定位支柱栏目」（应重点倾斜）
const PILLAR_COLUMNS = new Set(Object.values(PILLARS).flat());

// ---------------- front-matter 解析（与 check-tags.js 一致的逐行实现，已验证 136/136）----------------
function splitFrontMatter(raw) {
  const m = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}

/** 取某个 key 的列表值，兼容块状列表 `- x` / 行内数组 `[a, b]` / 嵌套 `[[A],[B]]` */
function getList(fm, key) {
  if (!fm) return [];
  const lines = fm.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const km = lines[i].match(new RegExp('^' + key + '\\s*:(.*)$'));
    if (!km) continue;
    const inline = km[1].trim();
    if (inline.startsWith('[')) {
      return inline
        .replace(/[[\]]/g, ' ')
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    }
    if (inline) return [inline.replace(/^['"]|['"]$/g, '')];
    const out = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s+-\s+/.test(lines[j])) {
        out.push(lines[j].replace(/^\s+-\s+/, '').trim().replace(/^['"]|['"]$/g, ''));
      } else break;
    }
    return out;
  }
  return [];
}

// ---------------- 构建画像 ----------------
function buildProfile() {
  const files = fs.existsSync(POSTS_DIR)
    ? fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md') && !EXCLUDE.has(f))
    : [];

  const colCount = Object.fromEntries(COLUMNS.map((c) => [c, 0]));
  const tagCount = {};
  const pillarCount = Object.fromEntries(Object.keys(PILLARS).map((p) => [p, 0]));
  const perPost = [];

  for (const f of files) {
    const raw = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8');
    const fm = splitFrontMatter(raw);
    if (!fm) continue;
    const cats = getList(fm, 'categories');
    const tags = getList(fm, 'tags');
    const col = cats[0] || '(无栏目)';
    if (colCount[col] !== undefined) colCount[col]++;
    else colCount[col] = (colCount[col] || 0) + 1;
    if (COLUMN_PILLAR[col]) pillarCount[COLUMN_PILLAR[col]]++;
    for (const t of tags) tagCount[t] = (tagCount[t] || 0) + 1;
    perPost.push({ file: f, col, tags });
  }

  const total = files.length;
  const pillarTotal = Object.values(pillarCount).reduce((a, b) => a + b, 0);
  const pillarPct = {};
  for (const [p, n] of Object.entries(pillarCount)) {
    pillarPct[p] = total ? Math.round((n / total) * 100) : 0;
  }

  // 短板排名：支柱栏目实际占比越低，越该补（按目标均分 1/3 计缺口）
  const targetEach = pillarTotal ? pillarTotal / Object.keys(PILLARS).length : 0;
  const shortfall = Object.entries(pillarCount)
    .map(([p, n]) => ({ pillar: p, count: n, gap: Math.max(0, targetEach - n) }))
    .sort((a, b) => b.gap - a.gap);

  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 15);

  return {
    total,
    columns: colCount,
    pillars: pillarCount,
    pillarPct,
    pillarTotal,
    shortfall,
    topTags,
    perPost,
  };
}

// ---------------- CLI ----------------
if (require.main === module) {
  const args = process.argv.slice(2);
  const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
  const prof = buildProfile();

  const lines = [];
  lines.push(`📊 博客实时定位画像（基于 source/_posts 共 ${prof.total} 篇）`);
  lines.push('—'.repeat(40));
  lines.push('栏目分布：');
  for (const c of COLUMNS) lines.push(`  ${c.padEnd(10)} ${String(prof.columns[c]).padStart(4)} 篇`);
  lines.push('—'.repeat(40));
  lines.push('三大支柱占比：');
  for (const [p, n] of Object.entries(prof.pillars)) {
    lines.push(`  ${p.padEnd(14)} ${String(n).padStart(3)} 篇  (${prof.pillarPct[p]}%)`);
  }
  const pillarShare = prof.total ? Math.round((prof.pillarTotal / prof.total) * 100) : 0;
  lines.push(`  ➜ 三根支柱合计 ${prof.pillarTotal} 篇，占全站 ${pillarShare}%（定位目标应显著高于此）`);
  lines.push('—'.repeat(40));
  lines.push('短板排名（越靠前越该补）：');
  prof.shortfall.forEach((s, i) => lines.push(`  ${i + 1}. ${s.pillar}  现 ${s.count} 篇，缺口 ${s.gap}`));
  lines.push('—'.repeat(40));
  lines.push('高频标签 Top 15：');
  prof.topTags.forEach(([t, n]) => lines.push(`  ${t}  ${n}`));

  console.log(lines.join('\n'));
  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(prof, null, 2));
    console.log('\n✅ profile JSON 已落盘：' + jsonOut);
  }
}

module.exports = { buildProfile, PILLARS, COLUMN_PILLAR, PILLAR_COLUMNS, COLUMNS };
