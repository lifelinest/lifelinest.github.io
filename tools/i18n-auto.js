'use strict';
/*
 * i18n-auto.js —— 中文博文 → 英文意图重写版 自动生成管线（内容层）
 *
 * 安全原则（与「不伤现有站点权重」红线对齐）：
 *   1. 默认 --dry-run：只打印将做什么，绝不写文件。
 *   2. 逐篇显式开启：只有 front-matter 带 `i18n: [en]` 的中文文才会被处理。
 *      绝不整站机翻（整站机翻 = 大量 thin 页 = Google 整站降权）。
 *   3. 输出为「独立英文文章」source/_posts/<slug>.en.md（lang: en + i18n_group），
 *      不依赖 hexo-generator-i18n 的自动复制，避免中文被复制到 /en/ 的坑。
 *   4. 本脚本永不修改 _config.yml、永不删除/覆盖任何已有文件。
 *      （要开启 /en/ 路由请在验证沙箱通过后，再单独处理插件，不在本脚本范围内。）
 *
 * 用法：
 *   node tools/i18n-auto.js --list            # 列出已标记 i18n:[en] 的待处理篇目
 *   node tools/i18n-auto.js --dry-run         # 预览（默认）
 *   node tools/i18n-auto.js --apply           # 实际生成英文版（需 ARK_API_KEY）
 *   node tools/i18n-auto.js --apply --slug xxx # 只处理某一篇
 *   node tools/i18n-auto.js --apply --limit 3  # 每次最多 3 篇（建议小批量，便于人审）
 *
 * 环境变量：
 *   ARK_API_KEY   火山方舟 API Key（必填，--apply 时）
 *   ARK_ENDPOINT  默认 https://ark.cn-volcengine.com/api/v3/chat/completions
 *   ARK_MODEL     默认 doubao-pro-32k（请换成你账号下实际可用的模型 ID）
 */

const fs = require('fs');
const path = require('path');

const BLOG_ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(BLOG_ROOT, 'source', '_posts');
const GLOSSARY_PATH = path.join(__dirname, 'i18n-glossary.json');

const ARK_ENDPOINT = process.env.ARK_ENDPOINT || 'https://ark.cn-volcengine.com/api/v3/chat/completions';
const ARK_MODEL = process.env.ARK_MODEL || 'doubao-pro-32k-240828';

// ---------------- 参数 ----------------
const args = process.argv.slice(2);
const opt = {
  apply: args.includes('--apply'),
  dryRun: args.includes('--dry-run') || !args.includes('--apply'),
  list: args.includes('--list'),
  slug: (() => { const i = args.indexOf('--slug'); return i >= 0 ? args[i + 1] : null; })(),
  limit: (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i + 1], 10) : Infinity; })(),
};
if (!isFinite(opt.limit)) opt.limit = Infinity;

// ---------------- 工具 ----------------
function readGlossary() {
  if (!fs.existsSync(GLOSSARY_PATH)) return { terms: [] };
  try { return JSON.parse(fs.readFileSync(GLOSSARY_PATH, 'utf8')); }
  catch (e) { console.warn('[i18n-auto] 术语表解析失败:', e.message); return { terms: [] }; }
}

function splitFrontMatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: '', body: raw, rawFm: '' };
  return { fm: m[1], body: raw.slice(m[0].length), rawFm: m[1] };
}

function fmGet(fm, key) {
  const re = new RegExp('^' + key + ':\\s*(.+)$', 'm');
  const mt = fm.match(re);
  return mt ? mt[1].trim().replace(/^["']|["']$/g, '') : null;
}

function slugFromFilename(f) {
  return f.replace(/\.md$/i, '');
}

// ---------------- 扫描待处理篇目 ----------------
function scanCandidates() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const files = fs.readdirSync(POSTS_DIR).filter(f => /^[^._].*\.md$/i.test(f) && !f.endsWith('.en.md'));
  const out = [];
  for (const f of files) {
    const slug = slugFromFilename(f);
    if (opt.slug && slug !== opt.slug) continue;
    const raw = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8');
    const { fm } = splitFrontMatter(raw);
    const i18nField = fmGet(fm, 'i18n');
    const opted = i18nField && /en/i.test(i18nField);
    if (!opted) continue;
    const enExists = fs.existsSync(path.join(POSTS_DIR, slug + '-en.md'));
    out.push({
      slug,
      file: f,
      title: fmGet(fm, 'title') || slug,
      abbrlink: fmGet(fm, 'abbrlink') || '',
      enExists,
      raw,
    });
  }
  return out;
}

// ---------------- 构建 prompt ----------------
function buildPrompt(glossary, zhBody, zhTitle) {
  const terms = (glossary.terms || []).map(t => `- ${t.zh} => ${t.en} | 搜索意图: ${t.intent}`).join('\n');
  return [
    { role: 'system', content:
`You are a senior B2B SEO content localizer. Your job: rewrite a Chinese blog post into English for overseas B2B buyers / peers.
RULES:
- DO NOT translate word-by-word. Rewrite for the search intent of overseas English speakers.
- Use the glossary below: when a Chinese term maps to an English search phrase, prefer that phrasing in titles and headings.
- Keep all code blocks, image URLs, and hyperlinks exactly as-is (do not translate URLs).
- Mirror the original H2/H3 outline.
- Output strict JSON only: {"title": "...", "description": "...", "body": "..."}. No markdown fences, no commentary.` },
    { role: 'user', content:
`GLOSSARY (zh => en | search intent):
${terms}

ORIGINAL CHINESE TITLE: ${zhTitle}

ORIGINAL CHINESE BODY:
${zhBody}

Return the English version as JSON.` }
  ];
}

// ---------------- 调 LLM ----------------
async function callLLM(messages) {
  const key = process.env.ARK_API_KEY;
  if (!key) throw new Error('ARK_API_KEY 未设置（--apply 需要）。');
  const resp = await fetch(ARK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model: ARK_MODEL, messages, temperature: 0.3, response_format: { type: 'json_object' } }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error('ARK HTTP ' + resp.status + ': ' + txt.slice(0, 300));
  }
  const data = await resp.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('ARK 返回为空');
  return JSON.parse(content);
}

// ---------------- 写出英文版 ----------------
function hashAbbrlink(seed) {
  // 生成稳定、唯一的 8 位 hex abbrlink（与 hexo-abbrlink 默认 crc32+hex 格式兼容），
  // 英文版用独立 abbrlink，避免与中文版共用同一 /posts/<abbr>/ 路由而互相覆盖。
  const crypto = require('crypto');
  return crypto.createHash('md5').update(seed, 'utf8').digest('hex').slice(0, 8);
}

function buildEnFrontMatter(origFm, zhAbbrlink, slug, en) {
  // 移除 lang/i18n_group/i18n_source/abbrlink：英文版用独立 abbrlink，避免 URL 冲突
  const lines = origFm.split(/\r?\n/).filter(l => !/^(lang|i18n_group|i18n_source|abbrlink)\s*:/i.test(l.trim()));
  let out = [];
  let insertedTitle = false;
  for (const l of lines) {
    const mt = l.match(/^title\s*:/i);
    if (mt) { out.push('title: ' + en.title); insertedTitle = true; continue; }
    const dm = l.match(/^description\s*:/i);
    if (dm) { out.push('description: ' + (en.description || '').replace(/\n/g, ' ')); continue; }
    out.push(l);
  }
  if (!insertedTitle) out.push('title: ' + en.title);
  out.push('abbrlink: ' + hashAbbrlink(slug + '-en'));
  out.push('i18n_lang: en');
  out.push('i18n_group: ' + (zhAbbrlink || slug));
  out.push('i18n_source: ' + slug);
  return out.join('\n');
}

// ---------------- 主流程 ----------------
async function main() {
  const glossary = readGlossary();
  let candidates = scanCandidates();

  if (opt.list) {
    console.log('[i18n-auto] 已标记 i18n:[en] 的篇目：');
    if (!candidates.length) console.log('  （无。在文章 front-matter 加 `i18n: [en]` 即可加入队列）');
    for (const c of candidates) console.log(`  - ${c.slug}  | ${c.title}  | 英文版已存在:${c.enExists}`);
    return;
  }

  candidates = candidates.filter(c => !c.enExists).slice(0, opt.limit);
  if (!candidates.length) {
    console.log('[i18n-auto] 没有需要生成英文版的篇目（都已有英文版，或没标记 i18n:[en]）。');
    return;
  }

  console.log(`[i18n-auto] 将处理 ${candidates.length} 篇（dry-run=${opt.dryRun}）`);
  for (const c of candidates) {
    const { body: zhBody } = splitFrontMatter(c.raw);
    const prompt = buildPrompt(glossary, zhBody, c.title);

    if (opt.dryRun) {
      console.log(`  [DRY] ${c.slug} :: 将调用 LLM 生成英文版（标题「${c.title}」），写出 source/_posts/${c.slug}.en.md`);
      continue;
    }
    try {
      const en = await callLLM(prompt);
      const enFm = buildEnFrontMatter(splitFrontMatter(c.raw).fm, c.abbrlink, c.slug, en);
      const content = `---\n${enFm}\n---\n\n${en.body.trim()}\n`;
      const outPath = path.join(POSTS_DIR, c.slug + '-en.md');
      fs.writeFileSync(outPath, content, 'utf8');
      console.log(`  [OK] 已写出 ${outPath}`);
    } catch (e) {
      console.error(`  [FAIL] ${c.slug}: ${e.message}`);
    }
  }
  if (!opt.dryRun) {
    console.log('[i18n-auto] 完成。下一步：npm run i18n:hreflang 注入 hreflang（见 i18n-hreflang.js）。');
  }
}

main().catch(e => { console.error('[i18n-auto] 致命错误:', e.message); process.exit(1); });
