'use strict';
/*
 * i18n-hreflang.js —— 构建后 hreflang 注入器（安全护栏核心）
 *
 * 为什么需要它：hexo-generator-i18n 0.0.10 不输出任何 hreflang/canonical。
 * 没有 hreflang，Google 会把中英文版当孤立页面，甚至疑似重复内容 → 伤权重。
 * 本脚本在 `hexo generate` 之后运行，扫描 source/_posts 里带 i18n_group 的中英文配对，
 * 给每篇的 public HTML <head> 注入：
 *   <link rel="alternate" hreflang="zh-CN" href="...">
 *   <link rel="alternate" hreflang="en"     href="...">
 *   <link rel="alternate" hreflang="x-default" href="中文版">
 *
 * 安全特性：
 *   - 只改 public/（每次构建都重新生成，出错不影响源码）
 *   - 幂等：先清掉自己上次的注入（data-i18n-hreflang 标记），再注入
 *   - 没有任何 i18n_group 配对时 = 完全 no-op，对现有站点零影响
 *
 * 用法：
 *   node tools/i18n-hreflang.js            # 注入（默认）
 *   node tools/i18n-hreflang.js --dry-run  # 只打印将注入的映射，不改文件
 */

const fs = require('fs');
const path = require('path');

const BLOG_ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(BLOG_ROOT, 'source', '_posts');
const PUBLIC_DIR = path.join(BLOG_ROOT, 'public');
const CONFIG_PATH = path.join(BLOG_ROOT, '_config.yml');
const DRY = process.argv.includes('--dry-run');

function getConfigUrl() {
  try {
    const c = fs.readFileSync(CONFIG_PATH, 'utf8');
    const url = (c.match(/^url:\s*(.+)$/m) || [])[1];
    const root = (c.match(/^root:\s*(.+)$/m) || [])[1];
    let base = (url || '').trim().replace(/\/+$/, '');
    const r = (root || '/').trim();
    if (r && r !== '/') base += r.replace(/\/+$/, '');
    return base || '';
  } catch { return ''; }
}

function splitFrontMatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: '', body: raw };
  return { fm: m[1], body: raw.slice(m[0].length) };
}
function fmGet(fm, key) {
  const mt = fm.match(new RegExp('^' + key + ':\\s*(.+)$', 'm'));
  return mt ? mt[1].trim().replace(/^["']|["']$/g, '') : null;
}

function buildGroups() {
  if (!fs.existsSync(POSTS_DIR)) return {};
  const groups = {};
  for (const f of fs.readdirSync(POSTS_DIR)) {
    if (!/\.md$/i.test(f)) continue;
    const raw = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8');
    const { fm } = splitFrontMatter(raw);
    const abbr = fmGet(fm, 'abbrlink');
    if (!abbr) continue;
    const group = fmGet(fm, 'i18n_group');
    if (group) {
      // 英文版（带 i18n_group 即视为译版，避免用 lang:en 触发 Hexo 隐藏）：i18n_group = 中文版 abbrlink 作为配对键
      groups[group] = groups[group] || {};
      groups[group]['en'] = abbr;
    } else {
      // 中文版：其 abbrlink 本身即配对键（不要求任何 i18n 字段）
      groups[abbr] = groups[abbr] || {};
      groups[abbr]['zh-cn'] = abbr;
    }
  }
  return groups;
}

function injectInto(file, tags) {
  let html = fs.readFileSync(file, 'utf8');
  // 幂等：清掉上次注入
  html = html.replace(/<!--i18n-hreflang-start-->[\s\S]*?<!--i18n-hreflang-end-->/g, '');
  const block = '\n<!--i18n-hreflang-start-->\n' + tags.join('\n') + '\n<!--i18n-hreflang-end-->\n';
  html = html.replace(/<\/head>/i, function (m) { return block + m; });
  fs.writeFileSync(file, html, 'utf8');
}

function main() {
  const base = getConfigUrl();
  const groups = buildGroups();
  const paired = Object.entries(groups).filter(([, langs]) => Object.keys(langs).length >= 2);
  if (!paired.length) {
    console.log('[i18n-hreflang] 没有 i18n_group 配对（中英文都齐的篇目）。no-op，现有站点不受影响。');
    return;
  }
  console.log(`[i18n-hreflang] 发现 ${paired.length} 组中英文配对，base=${base || '(未解析)'}`);
  for (const [group, langs] of paired) {
    const altTags = [];
    const urlByLang = {};
    for (const [lang, abbr] of Object.entries(langs)) {
      const href = base + '/posts/' + abbr + '/';
      urlByLang[lang] = href;
      altTags.push(`<link rel="alternate" hreflang="${lang}" href="${href}" />`);
    }
    altTags.push(`<link rel="alternate" hreflang="x-default" href="${urlByLang['zh-cn'] || Object.values(urlByLang)[0]}" />`);

    for (const [lang, abbr] of Object.entries(langs)) {
      const file = path.join(PUBLIC_DIR, 'posts', abbr, 'index.html');
      if (!fs.existsSync(file)) {
        console.log(`  [SKIP] ${group}/${lang}: public 未找到 ${path.relative(BLOG_ROOT, file)}（可能尚未构建）`);
        continue;
      }
      if (DRY) { console.log(`  [DRY] ${group}/${lang}: 注入 ${altTags.length} 条 alternate`); continue; }
      injectInto(file, altTags);
      console.log(`  [OK] ${group}/${lang}: 已注入 hreflang`);
    }
  }
  if (!DRY) console.log('[i18n-hreflang] 完成。可用 curl 核验线上 <head> 是否含 rel="alternate"。');
}

main();
