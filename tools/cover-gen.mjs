#!/usr/bin/env node
/**
 * ThisCover 批量封面出图驱动（CDP 无头 Chrome）
 *
 * 前置：
 *   1) 本地 ThisCover 已跑：  D:/1/1/Blog/cover-generator  ->  http://127.0.0.1:3100
 *   2) 无头 Chrome 已开调试口：--headless=new --remote-debugging-port=9222
 *
 * 用法：
 *   node tools/cover-gen.mjs --sample 3        # 出 3 张样例
 *   node tools/cover-gen.mjs --only b63649ea   # 单篇
 *   node tools/cover-gen.mjs --all             # 全部
 *   node tools/cover-gen.mjs --all --palette brand
 *
 * 产出：<out>/<abbrlink>.png（2x 超采样）+ manifest.json
 * 进度日志：D:/1/1/.tmp/cover-gen.log（实时落盘，不依赖 stdout 缓冲）
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const hasFlag = (k) => args.includes(k);
const getArg = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? (args[i + 1] ?? true) : d; };

const CDP_BASE = getArg('--cdp', 'http://127.0.0.1:9222');
const APP_URL = 'http://127.0.0.1:3100/editor';
const POSTS_DIR = 'D:/1/1/Blog/source/_posts';
const OUT_DIR = getArg('--out', 'D:/1/1/.tmp/cover-out');
const LOG_FILE = getArg('--log', 'D:/1/1/.tmp/cover-gen.log');
const CMD_TIMEOUT = Number(getArg('--cmd-timeout', 45000));

const AUTHOR = getArg('--author', 'Lifeline（生命线）');
const ICON_SRC = getArg('--icon', '/logo-mark.webp');
const PALETTE_MODE = getArg('--palette', 'builtin');

const SIZE = { label: '博客封面 710×310（本站 mfy-lifeline.com）', value: 'cover-blog' };
const FONT = { label: '系统默认', value: 'font-default', type: 'ht', typeName: '黑体', url: '' };
const THEME = { label: '背景', value: 'background' };
const PATTERN = { label: '网格', value: 'graph-paper', type: 'basic', typeName: '基础', isOpacity: true };

const PALETTE_BUILTIN = [
  '#A3B3FF', '#80D8CF', '#d972ff', '#a7ff83', '#CB91FE', '#9D2EFE',
  '#88EF69', '#ffa600', '#8078E7', '#B1B3E4', '#CA96DB', '#F9A6A8',
  '#dcd6f7', '#aba9e9', '#ffe9e3', '#efb1ff', '#fee856', '#16db93',
  '#ffc4d6', '#80ed99', '#ffb2e6',
];
const PALETTE_BRAND = [
  '#2F4858', '#33658A', '#35648F', '#24857A', '#264653',
  '#457B9D', '#37795C', '#1D3557', '#3D5A80', '#5C6B73',
];
const PALETTE = PALETTE_MODE === 'brand' ? PALETTE_BRAND : PALETTE_BUILTIN;

fs.writeFileSync(LOG_FILE, '');
const log = (s) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`;
  fs.appendFileSync(LOG_FILE, line + '\n');
  console.log(line);
};

// ───────────────────────── front-matter ─────────────────────────
function parseFrontMatter(txt) {
  const t = txt.replace(/\r\n/g, '\n');
  if (!t.startsWith('---\n')) return {};
  const end = t.indexOf('\n---', 4);
  if (end < 0) return {};
  const out = {};
  for (const line of t.slice(4, end).split('\n')) {
    const m = /^([A-Za-z_][\w-]*):[ \t]*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

function loadPosts() {
  const posts = [];
  for (const f of fs.readdirSync(POSTS_DIR).filter((x) => x.endsWith('.md'))) {
    const p = path.join(POSTS_DIR, f);
    const fm = parseFrontMatter(fs.readFileSync(p, 'utf8'));
    if (!fm.title || !fm.abbrlink) continue;
    const dm = /^(\d{4})-(\d{2})/.exec(fm.date || '');
    posts.push({
      file: p, fileName: f, title: fm.title, abbrlink: fm.abbrlink,
      year: dm ? dm[1] : 'yyyy', month: dm ? dm[2] : 'mm', oldCover: fm.cover || '',
    });
  }
  return posts;
}

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────── CDP ─────────────────────────
async function connect() {
  const list = await (await fetch(CDP_BASE + '/json/list')).json();
  const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('未找到可调试 page target');
  log(`CDP 已连接：${page.url}`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let idc = 0;
  const pending = new Map();
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => {
    const id = ++idc;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); reject(new Error(`CDP 超时(${CMD_TIMEOUT}ms): ${method}`)); }
      }, CMD_TIMEOUT);
      pending.set(id, (m) => { clearTimeout(timer); resolve(m); });
    });
  };
  return { send, close: () => ws.close() };
}

// ───────────────────────── 主流程 ─────────────────────────
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const all = loadPosts();
  let targets;
  const titleOverride = getArg('--title');
  if (titleOverride) {
    targets = [{ file: '', fileName: '', title: titleOverride, abbrlink: getArg('--outname', 'variant'), year: '', month: '', oldCover: '' }];
  } else if (hasFlag('--all')) targets = all;
  else if (getArg('--picks')) {
    const names = String(getArg('--picks')).split(',').map((s) => s.trim()).filter(Boolean);
    const order = new Map(names.map((n, i) => [n, i]));
    targets = all.filter((p) => order.has(p.abbrlink)).sort((a, b) => order.get(a.abbrlink) - order.get(b.abbrlink));
    const miss = names.filter((n) => !targets.some((t) => t.abbrlink === n));
    if (miss.length) log(`⚠️ 未找到: ${miss.join(', ')}`);
  } else if (getArg('--only')) targets = all.filter((p) => p.abbrlink === getArg('--only'));
  else targets = all.slice().sort((a, b) => hashStr(a.abbrlink) - hashStr(b.abbrlink)).slice(0, Number(getArg('--sample', 3)));
  if (!targets.length) { log('没有匹配到文章'); process.exit(1); }

  log(`目标 ${targets.length} 篇 / 共解析 ${all.length} 篇；调色板=${PALETTE_MODE}(${PALETTE.length}色)；输出=${OUT_DIR}`);

  const { send, close } = await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false });
  log('CDP 域已启用，视口 1920x1080 @2x');

  const ev = async (js, tag = 'eval') => {
    const r = await send('Runtime.evaluate', { expression: `(()=>{${js}})()`, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) { log(`  ${tag} ⚠️ JS 异常: ${JSON.stringify(r.result.exceptionDetails).slice(0, 200)}`); return undefined; }
    return r.result?.result?.value;
  };

  log('导航到 /editor …');
  await send('Page.navigate', { url: APP_URL });
  for (let i = 0; i < 400; i++) {
    const rs = await ev('return document.readyState', 'readyState').catch(() => '');
    if (rs === 'complete') { log(`  首次加载完成（轮询 ${i} 次）`); break; }
    await sleep(200);
  }

  const manifest = [];
  let ok = 0;
  for (let idx = 0; idx < targets.length; idx++) {
    const t = targets[idx];
    const color = PALETTE[hashStr(t.abbrlink) % PALETTE.length];
    const bgArg = getArg('--bgvalue');
    const bgType = getArg('--bgtype', 'color');
    const bg = bgArg
      ? (bgType === 'gradient' ? { gradient: bgArg, type: 'gradient' } : { color: bgArg, type: 'color' })
      : { color, type: 'color' };
    const setting = {
      title: t.title, author: AUTHOR, download: 'png', scale: 2,
      icon: { label: '本地图标', value: ICON_SRC }, customIcon: ICON_SRC,
      theme: THEME, font: FONT, bg,
      bgBlur: 0, bgGrayscale: 0, pattern: PATTERN, size: SIZE,
    };
    const tag = `[${idx + 1}/${targets.length}] ${t.abbrlink} ${bgArg || color}`;
    log(`${tag} 开始：${t.title.slice(0, 24)}`);

    await ev(`localStorage.setItem('coverSetting', ${JSON.stringify(JSON.stringify(setting))}); return 1;`, 'setItem');
    log(`${tag} localStorage 已写入，reload …`);
    await send('Page.reload', { ignoreCache: false });

    let ready = 'timeout';
    for (let i = 0; i < 250; i++) {
      ready = await ev(`
        const el = document.querySelector('.cover-blog');
        if (!el) return 'no-el';
        const img = el.querySelector('img');
        if (img && !(img.complete && img.naturalWidth > 0)) return 'img';
        if (document.body && document.body.innerText.indexOf('加载中') !== -1) return 'loading';
        return 'ok';`, 'poll').catch((e) => 'err:' + e.message);
      if (ready === 'ok') break;
      if (i % 20 === 19) log(`${tag}   轮询中… ${ready}`);
      await sleep(150);
    }
    if (ready !== 'ok') { log(`${tag} ❌ 渲染未就绪: ${ready}`); manifest.push({ ...t, color, ok: false, reason: String(ready) }); continue; }
    log(`${tag} 渲染就绪，取 rect …`);

    // 长标题均衡断行：默认换行会把最后一个字挤成孤字，这里按视觉宽度在中间手动断一次
    if (getArg('--balance', '1') !== '0') {
      const bres = await ev(`
        const el = document.querySelector('.cover-blog .text-5xl');
        if (!el) return 'no-title';
        const raw = el.dataset.rawtitle || el.textContent;
        el.dataset.rawtitle = raw;
        el.textContent = raw;
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 34;
        if (Math.round(el.scrollHeight / lh) <= 1) return 'one-line';
        const wOf = (ch) => { const c = ch.codePointAt(0); if (ch === ' ') return 0.30; return c < 0x2E80 ? 0.52 : 1.0; };
        const cs = [...raw];
        const total = cs.reduce((s, c) => s + wOf(c), 0);
        let acc = 0, idx = -1;
        for (let i = 0; i < cs.length; i++) { acc += wOf(cs[i]); if (acc >= total / 2) { idx = i + 1; break; } }
        while (idx > 1 && (cs[idx - 1] === ' ' || cs[idx] === ' ')) { if (cs[idx - 1] === ' ') idx--; else break; }
        if (idx <= 0 || idx >= cs.length) return 'skip';
        const a = cs.slice(0, idx).join('').replace(/\\s+\$/, '');
        const b = cs.slice(idx).join('').replace(/^\\s+/, '');
        el.textContent = '';
        el.appendChild(document.createTextNode(a));
        el.appendChild(document.createElement('br'));
        el.appendChild(document.createTextNode(b));
        return 'balanced(' + a.length + '+' + b.length + ')';`, 'balance');
      if (bres && bres !== 'one-line') log(`${tag}   断行: ${bres}`);
      await sleep(120);
    }

    await ev(`document.querySelector('.cover-blog').scrollIntoView({block:'center'}); return 1;`, 'scroll');
    await sleep(700);
    const rectRaw = await ev(`
      const r = document.querySelector('.cover-blog').getBoundingClientRect();
      return JSON.stringify({x:r.left+window.scrollX, y:r.top+window.scrollY, w:r.width, h:r.height});`, 'rect');
    const { x, y, w, h } = JSON.parse(rectRaw);
    if (Math.round(w) !== 710 || Math.round(h) !== 310) log(`${tag} ⚠️ 尺寸异常 ${Math.round(w)}x${Math.round(h)}（期望 710x310）`);

    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 1 } });
    if (!shot.result?.data) { log(`${tag} ❌ 截图无数据: ${JSON.stringify(shot).slice(0, 200)}`); manifest.push({ ...t, color, ok: false, reason: 'no-shot-data' }); continue; }
    const outFile = path.join(OUT_DIR, `${t.abbrlink}.png`);
    fs.writeFileSync(outFile, Buffer.from(shot.result.data, 'base64'));
    log(`${tag} ✅ ${outFile} (${Math.round(w)}x${Math.round(h)} @2x)`);
    manifest.push({ ...t, color, ok: true, out: outFile, cssSize: `${Math.round(w)}x${Math.round(h)}` });
    ok++;
  }

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify({ palette: PALETTE_MODE, author: AUTHOR, icon: ICON_SRC, pattern: PATTERN, items: manifest }, null, 2));
  log(`完成 ${ok}/${targets.length}；清单 ${path.join(OUT_DIR, 'manifest.json')}`);
  close();
  process.exit(ok === targets.length ? 0 : 1);
}

main().catch((e) => { log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
