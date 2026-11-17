// 全站播客台词稿生成器（零 LLM / 零 key / 零费用 / 可复现）
// 台词只取自：文章 title、ai 摘要、faq.q、faq.a、正文 ## 小标题、该节首个纯文本段落。
// 连接词为固定句式，不含任何事实断言。正文一字不改，只读取。
//
// 用法：
//   node tools/podcast/build-scripts.js                 全量 136 篇
//   node tools/podcast/build-scripts.js --limit=2      只做前 2 篇（自检用）
//   node tools/podcast/build-scripts.js --only=a0f90707
//
// 输出：D:/1/1/.tmp/podcast/scripts/<abbrlink>.json
//       D:/1/1/.tmp/podcast/source-manifest.json
'use strict';
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const BLOG = 'D:/1/1/Blog';
const OUT = 'D:/1/1/.tmp/podcast';
const SCRIPTS = path.join(OUT, 'scripts');
const POSTS = path.join(BLOG, 'source/_posts');
const CFG = JSON.parse(fs.readFileSync(path.join(BLOG, 'tools/podcast/config.json'), 'utf8'));

const argv = process.argv.slice(2);
const opt = k => {
  const a = argv.find(x => x.startsWith('--' + k + '='));
  return a ? a.split('=').slice(1).join('=') : null;
};
const LIMIT = opt('limit') ? Number(opt('limit')) : Infinity;
const ONLY = opt('only');

fs.mkdirSync(SCRIPTS, { recursive: true });

// 去掉 Markdown / Hexo 标记，只留可朗读的纯文本
function clean(t) {
  return String(t || '')
    .replace(/\{%[\s\S]*?%\}/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '\"')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]{2,8};/gi, ' ')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/\*\*|__|~~|^\s*[-*>|+]\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 去掉小标题开头的纯格式序号（不改内容）
function headText(t) {
  return clean(t)
    .replace(/^第?[一二三四五六七八九十]+[、.．:：]\s*/, '')
    .replace(/^\d{1,2}[、.．:：|]\s*/, '')
    .replace(/^Step\s*\d+\s*/i, '')
    .trim();
}

// 截到 <=max 字，优先在句末标点断开，避免念半句
function cut(t, max) {
  t = clean(t);
  const marks = ['。', '！', '？', '；', '.', '!', '?'];
  const lastStop = x => {
    let idx = -1;
    marks.forEach(m => { idx = Math.max(idx, x.lastIndexOf(m)); });
    return idx;
  };
  // 收在完整句末；若整段无句末标点（如 ai 摘要式列举），保留原样不硬补
  const finish = x => {
    x = x.trim();
    if (/[。！？!?；;]$/.test(x)) return x;
    const idx = lastStop(x);
    return idx >= 20 ? x.slice(0, idx + 1) : x;
  };
  if (t.length <= max) return finish(t);
  const seg = t.slice(0, max);
  const idx = lastStop(seg);
  return finish(idx >= 25 ? seg.slice(0, idx + 1) : seg);
}

// 取某个 ## 小节下的第一段有效正文（纯文本、>=30 字、非列表/表格/代码）
function sectionParagraph(body, startIdx, endIdx) {
  const block = body.slice(startIdx, endIdx);
  const raw = block.split(/\n\s*\n/);
  for (const p of raw.slice(1)) {
    if (/^\s*\|/.test(p) || /\|\s*-{3,}/.test(p)) continue;  // Markdown 表格整块跳过
    if (/^\s*```/.test(p)) continue;                            // 代码块跳过
    const t = clean(p);
    if (t.length < 30) continue;
    if (/^(https?:|!\[|<div|<!--|\|)/i.test(t)) continue;
    return cut(t, 135);
  }
  return '';
}

function headings(body) {
  const hs = [...body.matchAll(/^##\s+(.+)$/gm)].map(m => ({
    text: headText(m[1]),
    start: m.index,
    end: 0
  }));
  hs.forEach((h, i) => { h.end = i + 1 < hs.length ? hs[i + 1].start : body.length; });
  return hs.filter(h => h.text.length >= 4 && h.text.length <= 40);
}

function buildLines(d, body) {
  const A = 'host_a', B = 'host_b';
  const lines = [];
  const push = (role, text) => {
    const t = String(text || '').trim().replace(/\s+/g, ' ');
    if (t) lines.push({ role, text: t });
  };

  const title = clean(d.title);
  const ai = clean(d.ai);
  const faqs = Array.isArray(d.faq) ? d.faq.filter(f => f && f.q && f.a) : [];

  push(A, `${CFG.intro}这一期，我们聊《${title}》。`);
  push(B, `先说结论：${ai}`);

  if (faqs.length > 0) {
    const bridges = ['嗯，这里有个我挺关心的问题。', '对，那顺着这个再问一个。', '明白，还有最后一个。'];
    faqs.slice(0, 3).forEach((f, i) => {
      push(A, `${bridges[i]}${clean(f.q)}`);
      push(B, cut(f.a, 190));
    });
  } else {
    const hs = headings(body);
    const picked = [];
    for (const h of hs) {
      const para = sectionParagraph(body, h.start, h.end);
      if (para) picked.push({ head: h.text, para });
      if (picked.length === 3) break;
    }
    if (picked.length >= 2) {
      const bare = h => h.replace(/[。！？!?；;：:、，,]\s*$/, '');
      const names = picked.map((p, i) => `${['第一', '第二', '第三'][i]}，${bare(p.head)}`).join('；');
      push(A, '这篇主要分几块讲？');
      push(B, `主要聊 ${picked.length} 块：${names}。`);
      const asks = ['那先展开第一块。', '第二块呢？', '还有最后一块。'];
      picked.forEach((p, i) => {
        const h = p.head;
        push(A, `${asks[i]}${bare(h)}${/^[。！？!?]$/.test(h.slice(-1)) ? h.slice(-1) : '。'}`);
        push(B, p.para);
      });
    } else {
      // 极少数文章没有可用小标题/段落：退回 description，仍不编造
      const desc = cut(d.description, 220);
      push(A, '那这篇具体讲了什么？');
      push(B, desc);
    }
  }

  push(A, CFG.outro_a);
  push(B, CFG.outro_b);
  return lines;
}

// ---- main ----
const files = fs.readdirSync(POSTS).filter(f => f.endsWith('.md')).sort();
const manifest = [];
let ok = 0, bad = 0, fallback = 0;

for (const f of files) {
  if (ONLY && !f.includes(ONLY) && !fs.readFileSync(path.join(POSTS, f), 'utf8').includes(`abbrlink: '${ONLY}'`)) continue;
  if (manifest.length >= LIMIT) break;
  const src = path.join(POSTS, f);
  const s = fs.readFileSync(src, 'utf8');
  const m = s.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) { console.log('SKIP no front-matter: ' + f); bad++; continue; }
  let d;
  try { d = yaml.load(m[1]); } catch (e) { console.log('SKIP yaml error: ' + f + ' -> ' + e.message.slice(0, 60)); bad++; continue; }
  if (!d || !d.title || !d.ai || !d.abbrlink) { console.log('SKIP missing fields: ' + f); bad++; continue; }

  const abbr = String(d.abbrlink).replace(/^['"]|['"]$/g, '');
  const body = s.slice(m[0].length);
  const lines = buildLines(d, body);
  if (lines.length < 6) { console.log('SKIP too few lines: ' + abbr); bad++; continue; }
  if (!Array.isArray(d.faq) || !d.faq.length) fallback++;

  const date = d.date ? new Date(d.date) : new Date();
  const rec = {
    abbrlink: abbr,
    title: String(d.title),
    url: `${CFG.site}/posts/${abbr}/`,
    date: isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
    script: `${CFG.intro}这一期，我们聊《${String(d.title)}》。`,
    voices: CFG.voices,
    lines,
    chars: lines.reduce((n, l) => n + l.text.length, 0)
  };
  fs.writeFileSync(path.join(SCRIPTS, abbr + '.json'), JSON.stringify(rec, null, 2), 'utf8');
  manifest.push({ abbrlink: abbr, title: rec.title, url: rec.url, date: rec.date, lines: lines.length, chars: rec.chars });
  ok++;
}

manifest.sort((a, b) => b.date.localeCompare(a.date));
fs.writeFileSync(path.join(OUT, 'source-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log('DONE ok=%d bad=%d fallback(no-faq)=%d  -> %s', ok, bad, fallback, path.join(OUT, 'source-manifest.json'));
if (LIMIT !== Infinity || ONLY) {
  manifest.slice(0, 3).forEach(r => console.log('  ' + r.abbrlink + ' | ' + r.lines + ' lines | ' + r.chars + ' chars | ' + r.title.slice(0, 30)));
}
