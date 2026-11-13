#!/usr/bin/env node
/**
 * 上传本地图片到 Sanyue ImgHub 图床（https://cloudflare-img-bzb.pages.dev）。
 *
 * 图床 API：POST /upload?authCode=<认证码>
 *   - form-data: file=<文件>
 *   - 可选 query：uploadFolder、uploadNameType、returnFormat、serverCompress、autoRetry
 *   - 返回： [{ "src": "<链接>" }]（returnFormat=full 时为完整 URL）
 *
 * 分类规范见 tools/imgbed-rules.md。本工具内置规范目录预设，确保上传落到标准位置。
 *
 * 用法：
 *   # 列出所有规范分类预设
 *   node tools/upload-to-imgbed.js --list-categories
 *
 *   # 按分类上传（推荐）：自动落到规范目录
 *   node tools/upload-to-imgbed.js --src=D:/1/1/.tmp/upload \
 *       --category article --sub 2025/09/9641524 \
 *       --only=hexo-seo-guide-01.webp --apply
 *
 *   # 直接指定目录（高级）：会校验是否在规范树内，越界警告
 *   node tools/upload-to-imgbed.js --src=... --folder=头像/默认 --apply
 *
 *   凭证：优先 --auth-code=XXXX；未传则回退读项目内 cdn-token.local（不回显内容）。
 *   不加 --apply 为干跑：只列出待上传文件与目标目录，不发起请求。
 *   上传成功后把 { 本地文件名: 图床URL } 写入 --manifest（默认 .tmp/imgbed-map.json，会合并已有内容）。
 */
const fs = require('fs');
const path = require('path');

const HOST = 'https://cloudflare-img-bzb.pages.dev';
const IMG_RE = /\.(webp|png|jpe?g|gif|svg|avif)$/i;

/**
 * 规范目录预设（与 tools/imgbed-rules.md 保持一致）。
 * key -> { path: 规范目录, desc: 用途说明 }
 * 顶层目录：文章图 / 封面图 / 头像 / 主题 / 系统 / 作品集 / 临时
 */
const CATEGORIES = {
  article:        { path: '文章图',     desc: '文章正文配图，需配 --sub <年>/<月>/<slug>' },
  cover:          { path: '封面图',     desc: '文章/页面封面、社交分享 OG 图，需配 --sub <年>/<月>' },
  avatar:         { path: '头像/默认',  desc: '作者/品牌默认头像' },
  'avatar-fest':  { path: '头像/节日',  desc: '节日限定头像变体' },
  'theme-nav':    { path: '主题/导航图标', desc: '返回菜单/侧栏导航图标' },
  'theme-bg':     { path: '主题/背景',   desc: '页面/卡片背景图' },
  'theme-deco':   { path: '主题/装饰',   desc: '装饰性小图' },
  reward:         { path: '系统/打赏',   desc: '微信/支付宝收款码' },
  about:          { path: '系统/关于页', desc: '关于页各模块图（MBTI/旅行/技能/番剧/音乐）' },
  footprint:      { path: '系统/足迹',   desc: '足迹地图相关图' },
  equipment:      { path: '系统/设备',   desc: '装备页图' },
  album:          { path: '系统/相册',   desc: '相册模块图' },
  friend:         { path: '系统/友链',   desc: '友链站点 logo/头像截图' },
  portfolio:      { path: '作品集',      desc: '作品/项目展示图' },
  temp:           { path: '临时',        desc: '临时中转，禁止长期保留' },
};

// 顶层目录白名单（用于 --folder 越界校验）
const TOP_LEVEL = ['文章图', '封面图', '头像', '主题', '系统', '作品集', '临时'];

function parseArgs(argv) {
  const out = { apply: false };
  const args = argv.slice(2);
  const FLAGS = new Set(['apply', 'list-categories']);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    const k = m[1];
    let v = m[2];
    if (v === undefined) {
      // 无 = 时，布尔开关直接置真；其余取下一个非 -- 参数为值
      if (FLAGS.has(k)) { out[k === 'list-categories' ? 'listCategories' : k] = true; continue; }
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) { v = args[i + 1]; i++; }
      else v = '';
    }
    if (k === 'apply') out.apply = true;
    else if (k === 'auth-code') out.authCode = v;
    else if (k === 'src') out.src = v;
    else if (k === 'folder') out.folder = v;
    else if (k === 'category') out.category = v;
    else if (k === 'sub') out.sub = v;
    else if (k === 'manifest') out.manifest = v;
    else if (k === 'only') out.only = v.split(',').map(s => s.trim()).filter(Boolean);
    else if (k === 'list-categories') out.listCategories = true;
  }
  return out;
}

/** 解析最终上传目录：category > folder > 根。 */
function resolveFolder(opts) {
  if (opts.category) {
    const c = CATEGORIES[opts.category];
    if (!c) {
      console.error('未知分类预设: ' + opts.category + '（用 --list-categories 查看）');
      process.exit(1);
    }
    return opts.sub ? c.path + '/' + opts.sub.replace(/^\/+|\/+$/g, '') : c.path;
  }
  if (opts.folder) return opts.folder.replace(/^\/+|\/+$/g, '');
  return '';
}

/** 校验目录是否在规范树内（越界仅警告，不阻断）。 */
function validateFolder(folder) {
  if (!folder) return;
  const top = folder.split('/')[0];
  if (!TOP_LEVEL.includes(top)) {
    console.warn('  ⚠ 目录顶层「' + top + '」不在规范树内（' + TOP_LEVEL.join(' / ') + '）。如需新增分类，先更新 tools/imgbed-rules.md。');
  }
}

/** 未显式传 --auth-code 时，回退读取项目内 cdn-token.local（读取后不回显内容）。 */
function readLocalAuth() {
  const p = path.join(__dirname, '..', 'cdn-token.local');
  if (!fs.existsSync(p)) return null;
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = raw.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^IMG_CDN_(?:AUTH|TOKEN)\s*=\s*(.+)$/);
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, '');
    if (!t.includes('=')) return t;
  }
  return null;
}

/** 校验上传结果：HTTP 200 + 图片魔数 + 字节数与本地一致。
 *  注：本图床返回的 content-type 为 application/octet-stream，不可作为判据；
 *      可靠信号是「状态码 200 + 魔数 + 字节数」，魔数可挡住 HTML 回退页/404。 */
async function verifyUpload(url, localBuf) {
  try {
    const r = await fetch(url);
    if (!r.ok) return { ok: false, msg: 'HTTP ' + r.status };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length !== localBuf.length) return { ok: false, msg: '字节数不一致 本地' + localBuf.length + ' 远端' + buf.length };
    // 魔数校验（前 12 字节足矣）
    const head = buf.subarray(0, 12);
    const isPng = head[0] === 0x89 && head[1] === 0x50;
    const isJpg = head[0] === 0xff && head[1] === 0xd8;
    const isGif = head[0] === 0x47 && head[1] === 0x49;
    const isWebp = head[0] === 0x52 && head[1] === 0x49 && head[8] === 0x57 && head[9] === 0x45;
    const isSvg = /<svg/i.test(buf.subarray(0, 64).toString('utf8'));
    if (!(isPng || isJpg || isGif || isWebp || isSvg)) return { ok: false, msg: '图片魔数不匹配（疑似图床回退页/404）' };
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: '验真请求失败: ' + e.message };
  }
}

async function uploadOne(filePath, name, opts) {
  const buf = fs.readFileSync(filePath);
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const qs = new URLSearchParams();
  qs.set('authCode', opts.authCode);
  if (opts.folder) qs.set('uploadFolder', opts.folder);
  qs.set('uploadNameType', 'default');   // 前缀_原名，与站内既有命名一致
  qs.set('returnFormat', 'full');
  qs.set('serverCompress', 'false');     // 已本地压好，勿二次压缩
  qs.set('autoRetry', 'true');

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const fd = new FormData();
      fd.append('file', blob, name);
      const res = await fetch(HOST + '/upload?' + qs.toString(), { method: 'POST', body: fd });
      const text = await res.text();
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + text.slice(0, 160));
      let json;
      try { json = JSON.parse(text); } catch (e) { throw new Error('返回非 JSON: ' + text.slice(0, 160)); }
      const item = Array.isArray(json) ? json[0] : (json.data && json.data[0]) || json;
      let src = item && item.src;
      if (!src) throw new Error('返回中无 src: ' + text.slice(0, 160));
      if (!/^https?:\/\//.test(src)) src = HOST + (src.startsWith('/') ? src : '/' + src);
      return src;
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise(r => setTimeout(r, 1200 * attempt));
    }
  }
  throw lastErr;
}

function printCategories() {
  console.log('图床规范分类预设（详见 tools/imgbed-rules.md）：\n');
  console.log('  ' + '预设key'.padEnd(14) + '规范目录'.padEnd(16) + '用途');
  console.log('  ' + '-'.repeat(13) + ' ' + '-'.repeat(15) + ' ' + '-'.repeat(20));
  for (const [k, v] of Object.entries(CATEGORIES)) {
    console.log('  ' + k.padEnd(14) + v.path.padEnd(16) + v.desc);
  }
  console.log('\n顶层目录白名单：' + TOP_LEVEL.join(' / '));
  console.log('用法示例：');
  console.log('  node tools/upload-to-imgbed.js --src=<目录> --category article --sub 2025/09/9641524 --only=x.webp --apply');
}

async function main() {
  const o = parseArgs(process.argv);
  if (o.listCategories) { printCategories(); return; }

  if (!o.src) { console.error('缺少 --src=<目录>'); process.exit(1); }
  const folder = resolveFolder(o);
  if (folder) validateFolder(folder);

  let files = fs.readdirSync(o.src).filter(f => IMG_RE.test(f));
  if (o.only && o.only.length) {
    const idx = new Map(o.only.map((n, i) => [n, i]));
    files = files.filter(f => idx.has(f)).sort((a, b) => idx.get(a) - idx.get(b));
  }
  if (!files.length) { console.error('目录内没有图片:', o.src); process.exit(1); }

  console.log('图床:', HOST);
  console.log('目录:', o.src);
  console.log('上传目录:', folder || '(根)');
  if (o.category) console.log('分类预设:', o.category, '->', CATEGORIES[o.category].path);
  console.log('待上传:', files.length, '张');
  if (!o.apply) {
    files.forEach(f => console.log('   -', f));
    console.log('\n[干跑] 未发起请求。加 --apply 执行上传（上传后自动三重验真）。');
    return;
  }
  if (!o.authCode) o.authCode = readLocalAuth();
  if (!o.authCode) { console.error('缺少 --auth-code（也未在 cdn-token.local 找到凭证）'); process.exit(1); }

  const manifestPath = o.manifest || path.join(__dirname, '..', '.tmp', 'imgbed-map.json');
  let map = {};
  if (fs.existsSync(manifestPath)) {
    try { map = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (e) {}
  }
  for (const k of Object.keys(map)) if (String(map[k]).includes('__DRYRUN__')) delete map[k];

  let ok = 0, fail = 0;
  for (const f of files) {
    try {
      const url = await uploadOne(path.join(o.src, f), f, { ...o, folder });
      const v = await verifyUpload(url, fs.readFileSync(path.join(o.src, f)));
      if (!v.ok) throw new Error('验真失败: ' + v.msg);
      map[f] = url;
      ok++;
      console.log('  ✓ ' + f + '  ->  ' + url);
    } catch (e) {
      fail++;
      console.log('  ✗ ' + f + '  失败: ' + e.message);
    }
  }
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(map, null, 2));
  console.log('\n完成：成功 ' + ok + ' / 失败 ' + fail + '；映射写入 ' + manifestPath);
}

if (require.main === module) main();
module.exports = { HOST, CATEGORIES, TOP_LEVEL, uploadOne, verifyUpload, readLocalAuth, parseArgs, resolveFolder };
