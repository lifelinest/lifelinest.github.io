/* 生成统一标签库 source/_data/tags.json（T4）
 * 用法：node tools/generate_tags.js
 *
 * 逻辑：
 *  1. 读注册表 tools/tags.registry.js（规范名 / 别名 / 分组）
 *  2. 扫 designs.json（tags）/ workshop.json（stack+tags）/ trending.json（domain+language）
 *  3. 归一别名后统计每个标签在三页的出现次数
 *  4. 注册表里没登记的新标签，自动收录到 other 组，保证不丢词
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'source', '_data');
const OUT = path.join(DATA, 'tags.json');

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const reg = require('./tags.registry.js');

/* ---------- 建索引：别名 → 规范名 ---------- */
const norm = new Map();      // lowercased -> canonical name
const meta = new Map();      // canonical name -> {key,name,group,alias}
function keyOf(name) {
  return String(name).trim().toLowerCase().replace(/[\s\-_]+/g, '-').replace(/[^\w\u4e00-\u9fa5\-]/g, '');
}
reg.tags.forEach((t) => {
  const k = keyOf(t.name);
  meta.set(t.name, { key: k, name: t.name, group: t.group || 'other', alias: t.alias || [] });
  norm.set(t.name.trim().toLowerCase(), t.name);
  norm.set(k, t.name);
  (t.alias || []).forEach((a) => norm.set(String(a).trim().toLowerCase(), t.name));
});

/* 占位词 / 无信息量词：不进标签库 */
const IGNORE = ['其他', '其它', '未分类', '全部', 'all', 'unknown', 'n/a', '-'];

function canonical(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (IGNORE.indexOf(s.toLowerCase()) > -1) return null;
  if (norm.has(s.toLowerCase())) return norm.get(s.toLowerCase());
  const k = keyOf(s);
  if (norm.has(k)) return norm.get(k);
  if (meta.has(s)) return s;
  // 未登记 → 自动收录
  meta.set(s, { key: k, name: s, group: 'other', alias: [] });
  norm.set(s.toLowerCase(), s);
  norm.set(k, s);
  return s;
}

/* ---------- 统计 ---------- */
const counts = { design: {}, code: {}, workshop: {} };
function bump(page, raw) {
  const name = canonical(raw);
  if (!name) return;
  counts[page][name] = (counts[page][name] || 0) + 1;
}

readJson('designs.json').forEach((d) => (d.tags || []).forEach((t) => bump('design', t)));
readJson('workshop.json').forEach((d) => {
  (d.stack || []).forEach((t) => bump('workshop', t));
  (d.tags || []).forEach((t) => bump('workshop', t));
});
const trending = readJson('trending.json');
(Object.keys(trending)).forEach((p) => {
  (trending[p] || []).forEach((d) => {
    if (d.domain) bump('code', d.domain);
    if (d.language) bump('code', d.language);
  });
});

/* 一条热榜项目可能跨周期重复，按周期归一：取最大值，避免重复计数虚高 */
const periodKeys = Object.keys(trending);
if (periodKeys.length > 1) {
  const perPeriod = {};
  periodKeys.forEach((p) => {
    perPeriod[p] = {};
    (trending[p] || []).forEach((d) => {
      [d.domain, d.language].forEach((raw) => {
        const n = canonical(raw);
        if (n) perPeriod[p][n] = (perPeriod[p][n] || 0) + 1;
      });
    });
  });
  const merged = {};
  Object.keys(perPeriod).forEach((p) => {
    Object.keys(perPeriod[p]).forEach((n) => {
      merged[n] = Math.max(merged[n] || 0, perPeriod[p][n]);
    });
  });
  counts.code = merged;
}

/* ---------- 输出 ---------- */
const tags = [];
meta.forEach((m) => {
  const c = { design: counts.design[m.name] || 0, code: counts.code[m.name] || 0, workshop: counts.workshop[m.name] || 0 };
  const total = c.design + c.code + c.workshop;
  tags.push({ key: m.key, name: m.name, group: m.group, alias: m.alias, counts: c, pages: Object.keys(c).filter((k) => c[k] > 0), total });
});
tags.sort((a, b) => (b.total - a.total) || a.name.localeCompare(b.name, 'zh'));

const out = {
  generated: new Date().toISOString().slice(0, 10),
  groups: reg.groups,
  tags
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n', 'utf8');

/* ---------- 报告 ---------- */
const used = tags.filter((t) => t.total > 0);
const empty = tags.filter((t) => t.total === 0);
console.log('标签库已生成：', OUT);
console.log('  标签总数 ', tags.length, '· 有内容', used.length, '· 暂无内容', empty.length);
console.log('  分组分布：');
reg.groups.forEach((g) => {
  const n = used.filter((t) => t.group === g.key).length;
  console.log('   ', g.name.padEnd(10, ' '), n);
});
console.log('  Top 15（总量）：');
used.slice(0, 15).forEach((t) => console.log('   ', t.name.padEnd(14, ' '), '设计' + t.counts.design, '热榜' + t.counts.code, '工坊' + t.counts.workshop, '=', t.total));
console.log('  跨页标签（≥2 页有内容）：', used.filter((t) => t.pages.length >= 2).map((t) => t.name).join(', ') || '（无）');
