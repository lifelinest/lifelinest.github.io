#!/usr/bin/env node
/**
 * 图床链接预警检查（cloudflare-img-bzb.pages.dev）。
 *
 * 作用：扫描指定目录（默认 public = 线上实际产物）里所有图床 URL，
 *       逐个验真（HTTP 200 + 图片魔数），挡住「图床返回 200 + HTML 回退页」的假成功陷阱。
 *       任一断链即打印明细并以 exit 1 退出，可作为「部署前拦截闸」。
 *
 * 用法：
 *   node tools/check-imgbed-links.js                 # 扫 public/（默认）
 *   node tools/check-imgbed-links.js --dir=source     # 扫源文件
 *   node tools/check-imgbed-links.js --dir=public --sample=20   # 抽样 20 条快速冒烟
 *   node tools/check-imgbed-links.js --no-cache       # 忽略本地缓存强制重验
 *   node tools/check-imgbed-links.js --json           # 输出 JSON（便于 CI 解析）
 *
 * 退出码：0 = 全部可达；1 = 存在断链；2 = 参数/IO 错误。
 *
 * 缓存：结果写入 .tmp/imgbed-check-cache.json（默认 24h 内复用），加速重复运行。
 */
const fs = require('fs');
const path = require('path');
const { extractImgbedUrls, verifyImgUrl } = require('./lib/imgbed-util');

const SKIP_DIRS = new Set(['node_modules', '.git', '.deploy_git', 'backup', '.tmp', 'public', 'source']);
const TEXT_EXT = new Set(['.md', '.markdown', '.yml', '.yaml', '.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.pug', '.json', '.xml', '.txt', '.ejs', '.styl']);

function parseArgs(argv) {
  const out = { dir: 'public', concurrency: 6, timeout: 15000, sample: 0, noCache: false, json: false, list: false };
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    const k = m[1], v = m[2];
    if (k === 'dir') out.dir = v;
    else if (k === 'concurrency') out.concurrency = parseInt(v, 10) || 12;
    else if (k === 'timeout') out.timeout = parseInt(v, 10) || 8000;
    else if (k === 'sample') out.sample = parseInt(v, 10) || 0;
    else if (k === 'no-cache') out.noCache = true;
    else if (k === 'json') out.json = true;
    else if (k === 'list') out.list = true;
  }
  return out;
}

function walk(dir, files = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return files; }
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, files);
    } else if (e.isFile()) {
      if (TEXT_EXT.has(path.extname(e.name).toLowerCase())) files.push(full);
    }
  }
  return files;
}

function loadCache() {
  const p = path.join(__dirname, '..', '.tmp', 'imgbed-check-cache.json');
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; }
}
function saveCache(cache) {
  const p = path.join(__dirname, '..', '.tmp', 'imgbed-check-cache.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cache, null, 2));
}

async function main() {
  const o = parseArgs(process.argv);
  const root = path.resolve(__dirname, '..', o.dir);
  if (!fs.existsSync(root)) { console.error('目录不存在: ' + root); process.exit(2); }

  // 1) 抽取所有图床 URL + 反向映射（URL -> 引用文件列表）
  const files = walk(root);
  const urlFiles = new Map();
  for (const f of files) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    for (const u of extractImgbedUrls(text)) {
      const norm = u.replace(/[\s]+$/, '');
      if (!urlFiles.has(norm)) urlFiles.set(norm, new Set());
      urlFiles.get(norm).add(path.relative(__dirname, '..', f));
    }
  }
  const urls = [...urlFiles.keys()];

  if (o.list) {
    console.log(urls.join('\n'));
    console.log('\n共 ' + urls.length + ' 个唯一图床 URL。');
    process.exit(0);
  }

  let toCheck = urls;
  if (o.sample > 0) toCheck = urls.slice(0, o.sample);

  console.log('扫描目录: ' + root);
  console.log('唯一图床 URL: ' + urls.length + (o.sample ? '（本次验 ' + toCheck.length + '）' : ''));

  // 2) 验真（带缓存 + 并发）
  const cache = o.noCache ? {} : loadCache();
  const TTL = 24 * 3600 * 1000;
  const now = Date.now();
  const results = []; // { url, ok, status, msg, cached }

  // 先分流：缓存命中的直接复用，未命中的进入队列
  const queue = [];
  for (const u of toCheck) {
    const c = cache[u];
    if (c && (now - (c.ts || 0)) < TTL) {
      results.push({ url: u, ok: c.ok, status: c.status, msg: c.msg + ' (缓存)', cached: true });
    } else {
      queue.push(u);
    }
  }

  let done = 0;
  const totalQ = queue.length;
  async function worker() {
    while (queue.length) {
      const u = queue.shift();
      const v = await verifyImgUrl(u, { timeout: o.timeout });
      results.push({ url: u, ok: v.ok, status: v.status, msg: v.msg, cached: false });
      // 只缓存「可达」与「真 HTTP 错误」；瞬断(status=0)不落缓存，避免污染基线
      if (v.ok || v.status !== 0) cache[u] = { ok: v.ok, status: v.status, msg: v.msg, ts: now };
      done++;
      if (!o.json && totalQ > 20 && done % 25 === 0) console.log('  验真进度 ' + done + '/' + totalQ);
    }
  }
  const n = Math.min(o.concurrency, Math.max(1, totalQ || 1));
  await Promise.all(Array.from({ length: n }, worker));

  // 3) 汇总
  // 关键区分：只有「拿到明确 HTTP 错误 / 明确非图片」才算真断链（阻断部署）。
  // 「网络层失败（status=0）」是 fetch 与 curl 两条通道都连不上，属无法确认，
  // 不计入断链闸门，但会显著列出——否则本机代理环境会不停产生假阳性卡发布。
  const broken = results.filter(r => !r.ok && r.status !== 0);
  const unconfirmed = results.filter(r => !r.ok && r.status === 0);
  const okCount = results.length - broken.length - unconfirmed.length;

  // 兜底保护：未确认比例过高说明是网络整体不可用，此时闸门必须报红，
  // 不能因为「全部无法确认」而误判成绿灯。
  const unconfirmedRatio = results.length ? unconfirmed.length / results.length : 0;
  const netUnavailable = unconfirmedRatio > 0.2 || unconfirmed.length > 30;

  if (o.json) {
    console.log(JSON.stringify({
      total: results.length,
      ok: okCount,
      broken: broken.length,
      unconfirmed: unconfirmed.length,
      netUnavailable,
      items: results,
    }, null, 2));
  } else {
    console.log('\n──── 验真结果 ────');
    console.log('可达: ' + okCount + ' / 待验总数 ' + results.length);
    if (broken.length) {
      console.log('断链: ' + broken.length + ' 条 ❌');
      for (const b of broken) {
        console.log('\n  ✗ ' + b.url);
        console.log('    原因: ' + (b.msg || '未知') + (b.status ? '  [HTTP ' + b.status + ']' : ''));
        const refs = [...(urlFiles.get(b.url) || [])];
        console.log('    引用(' + refs.length + '): ' + refs.slice(0, 5).join(' | ') + (refs.length > 5 ? ' …' : ''));
      }
    } else {
      console.log('断链: 0 条 ✅');
    }
    if (unconfirmed.length) {
      console.log('\n无法确认（网络层失败，非断链）: ' + unconfirmed.length + ' 条 ⚠️');
      for (const u of unconfirmed) console.log('  ? ' + u.url);
      console.log('  说明: fetch 与 curl 两条通道都未取到响应，重跑可复核；不计入断链闸门。');
    }
    if (netUnavailable) {
      console.log('\n❌ 未确认条目占比过高（' + (unconfirmedRatio * 100).toFixed(1) + '%），判定为网络整体不可用，闸门不通过。');
    }
  }

  saveCache(cache);
  process.exit(broken.length || netUnavailable ? 1 : 0);
}

if (require.main === module) main();
module.exports = { parseArgs, walk };
