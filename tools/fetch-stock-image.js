#!/usr/bin/env node
/**
 * tools/fetch-stock-image.js —— 真实图库取图（16:9 webp），只下载不改仓库
 *
 * 为什么需要它：博客正文配图要求「网上真实图片 + 16:9 + 上图床」。
 * 手搜图片再本地裁切既慢又容易出比例问题；而 Pexels / Unsplash 的图片 CDN
 * 支持服务端裁切（w/h/fit=crop）与 webp 转码，直接拿到的就是最终尺寸。
 *
 * 本脚本只负责「拿到合规的本地文件」，上传图床仍走 tools/upload-to-imgbed.js。
 *
 * 支持三种输入：
 *   1. Pexels 图片页   https://www.pexels.com/photo/<slug>-<数字id>/
 *   2. Pexels 直链     https://images.pexels.com/photos/<数字id>/...
 *   3. Unsplash 图片页 https://unsplash.com/photos/<slug>-<shortId>
 *      （脚本会 HEAD 一下 /photos/<shortId>/download 拿 302 指向的真 CDN 地址）
 *   4. Unsplash 直链   https://images.unsplash.com/photo-<...>
 *
 * 用法：
 *   node tools/fetch-stock-image.js --in <urls.txt> --out <目录> [--slug <前缀>]
 *   node tools/fetch-stock-image.js --url "<图片页>" --url "<图片页>" --out <目录>
 *   node tools/fetch-stock-image.js --id=pexels:3861969 --out <目录>
 * 选项：
 *   --width 1600 --height 900   目标尺寸（默认即 16:9）
 *   --strict                    任一张失败即 exit 1（默认「全部失败才 1」）
 *   --json                      以 JSON 输出结果（供上游脚本消费）
 * 退出码：0 = 至少成功一张；1 = 全部失败或参数错误
 *
 * 网络层用系统 curl 而不是 node 的 https/axios：
 *   本机（以及很多国内环境）配了 http_proxy/https_proxy 环境变量，
 *   curl 会自动跟随代理，而 node 原生请求会直连并被拦（表现为 400 /
 *   socket hang up / "Parse Error: Expected HTTP/"）。curl 也更省心，
 *   无需 axios 这类依赖。Windows 10+ 自带 curl.exe。
 *
 * 注意：不要把这个文件放进 scripts/ —— hexo 会把 scripts/ 下的每个 .js 当插件加载执行。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// ---------- 参数 ----------
// 同时支持 `--key=value` 与 `--key value` 两种写法（Windows 下路径带反斜杠时
// 空格写法更省事，但 `=` 写法在脚本里更常见，所以两个都认）。
const argv = process.argv.slice(2);
const FLAG_NAMES = new Set(['strict', 'json']);
const _opts = {};
const _flags = new Set();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const body = a.slice(2);
  const eq = body.indexOf('=');
  if (eq >= 0) {
    const k = body.slice(0, eq);
    (_opts[k] = _opts[k] || []).push(body.slice(eq + 1));
  } else if (FLAG_NAMES.has(body)) {
    _flags.add(body);
  } else {
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      i++;
      (_opts[body] = _opts[body] || []).push(next);
    } else {
      _flags.add(body);
    }
  }
}
const getAll = (n) => _opts[n] || [];
const getArg = (n, d) => (_opts[n] && _opts[n].length ? _opts[n][0] : d);
const hasFlag = (n) => _flags.has(n);

const IN_FILE = getArg('in', '');
const OUT_DIR = getArg('out', '');
const SLUG = getArg('slug', 'stock');
const W = parseInt(getArg('width', '1600'), 10);
const H = parseInt(getArg('height', '900'), 10);
const STRICT = hasFlag('strict');
const JSON_OUT = hasFlag('json');

if (!OUT_DIR) {
  console.error('缺少 --out <目录>（本地落盘目录，建议放 D 盘）');
  process.exit(1);
}
if (!Number.isFinite(W) || !Number.isFinite(H) || W < 100 || H < 100) {
  console.error('--width / --height 不合法');
  process.exit(1);
}

let inputs = [...getAll('url')];
if (IN_FILE) {
  if (!fs.existsSync(IN_FILE)) {
    console.error('找不到输入文件：' + IN_FILE);
    process.exit(1);
  }
  inputs.push(
    ...fs
      .readFileSync(IN_FILE, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
  );
}
inputs.push(...getAll('id'));
inputs = inputs.filter(Boolean);

if (inputs.length === 0) {
  console.error('没有输入。用 --url=<图片页> / --in=<列表文件> / --id=pexels:12345');
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------- 图片头解析（魔数 + 宽高）----------
function readImage(buf) {
  // WebP
  if (buf.length > 16 && buf.slice(8, 12).toString() === 'WEBP') {
    const t = buf.slice(12, 16).toString();
    if (t === 'VP8X') return { fmt: 'webp', w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (t === 'VP8 ') return { fmt: 'webp', w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (t === 'VP8L') {
      const n = buf.readUInt32LE(21);
      return { fmt: 'webp', w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 };
    }
    return { fmt: 'webp', w: 0, h: 0 };
  }
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const m = buf[o + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { fmt: 'jpeg', h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) };
      }
      o += 2 + buf.readUInt16BE(o + 2);
    }
    return { fmt: 'jpeg', w: 0, h: 0 };
  }
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { fmt: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  return null;
}

// ---------- URL 归一化：任意输入 → 目标尺寸的 webp CDN 地址 ----------
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const DEV_NULL = os.devNull;

/** node 原生请求在本机走不通代理，统一用 curl（它能自动跟随 http(s)_proxy） */
function curl(args, timeoutSec) {
  return execFileSync('curl', args, {
    encoding: 'utf8',
    timeout: (timeoutSec + 15) * 1000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** 不跟随重定向，只取 Location（用于 Unsplash 图片页 → 真 CDN 地址） */
function curlRedirect(url, timeoutSec = 30) {
  const out = curl(
    ['-sS', '-o', DEV_NULL, '-A', UA, '--max-time', String(timeoutSec),
     '-w', '%{http_code}\t%{redirect_url}', url],
    timeoutSec
  );
  const [code, loc] = out.trim().split('\t');
  return { code: parseInt(code, 10), location: (loc || '').trim() };
}

/** 下载到文件；--fail 保证 HTTP 4xx/5xx 直接算失败，不会存下错误页 */
function curlDownload(url, dest, timeoutSec = 60) {
  curl(['-sS', '--fail', '-L', '-A', UA, '--max-time', String(timeoutSec),
        '-o', dest, url], timeoutSec);
}

function pexelsUrl(id) {
  return (
    `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg` +
    `?auto=compress&cs=tinysrgb&w=${W}&h=${H}&fit=crop&fm=webp`
  );
}

function unsplashUrl(base) {
  const clean = base.split('?')[0];
  return `${clean}?w=${W}&h=${H}&fit=crop&fm=webp&q=82`;
}

/**
 * Pexels CDN 直链：保留原始文件名，只替换尺寸/格式参数。
 * 坑：Pexels 并非所有资源都叫 pexels-photo-<id>.jpeg（例如
 * /photos/39584/censorship-...-39584.jpeg），若统一改写成标准名会 404。
 */
function pexelsDirectUrl(u) {
  const clean = u.split('?')[0].split('#')[0];
  return `${clean}?auto=compress&cs=tinysrgb&w=${W}&h=${H}&fit=crop&fm=webp`;
}

/** 取 URL 最后一个路径段（去掉 query / hash / 末尾斜杠） */
function lastSegment(u) {
  return u.split('?')[0].split('#')[0].replace(/\/+$/, '').split('/').pop() || '';
}

async function normalize(raw) {
  const input = raw.trim();

  // --id=pexels:12345 / --id=unsplash:shortId 形式
  let m = input.match(/^pexels:(\d+)$/i);
  if (m) return { provider: 'pexels', url: pexelsUrl(m[1]), page: input };
  m = input.match(/^unsplash:([A-Za-z0-9_-]+)$/i);
  if (m) {
    const base = await resolveUnsplash(m[1]);
    return { provider: 'unsplash', url: unsplashUrl(base), page: input };
  }

  const host = (input.match(/^https?:\/\/([^/]+)/i) || [, ''])[1].toLowerCase();

  if (host.includes('pexels.com')) {
    // CDN 直链：保留原始路径（非标准文件名改写会 404）
    if (
      host.startsWith('images.') &&
      /\/photos\/\d+\/[^/]+\.(jpe?g|png|webp)$/i.test(input.split('?')[0])
    ) {
      return { provider: 'pexels', url: pexelsDirectUrl(input), page: input };
    }
    // 其余形式（--id / 图片页 / 标准直链）从路径里取 id
    m = input.match(/\/photos\/(\d+)\//);
    if (!m) m = lastSegment(input).match(/(\d{4,})$/); // 图片页：末段结尾的数字
    if (!m) throw new Error('无法从 Pexels 链接里解析出图片 id');
    return { provider: 'pexels', url: pexelsUrl(m[1]), page: input };
  }

  if (host.includes('unsplash.com')) {
    if (/images\.unsplash\.com\/photo-/.test(input)) {
      return { provider: 'unsplash', url: unsplashUrl(input), page: input };
    }
    // 图片页 slug 形如 flat-lay-photography-of-circuit-board-zP7X_B86xOg，
    // 短 id 固定 11 位且在末尾 —— 不能拿 slug 里第一个连字符后的片段当 id
    const shortId = (lastSegment(input).match(/([A-Za-z0-9_-]{11})$/) || [])[1];
    if (!shortId) throw new Error('无法从 Unsplash 链接里解析出短 id（末段需以 11 位 id 结尾）');
    const base = await resolveUnsplash(shortId);
    return { provider: 'unsplash', url: unsplashUrl(base), page: input };
  }

  throw new Error('无法识别图片来源（只支持 Pexels / Unsplash）');
}

/** Unsplash 图片页 → 真 CDN 地址（走 302 重定向，无需 API Key） */
function resolveUnsplash(shortId) {
  const { code, location } = curlRedirect(`https://unsplash.com/photos/${shortId}/download?w=${W}`);
  if (location) return location.split('?')[0];
  throw new Error(`Unsplash 短 id 解析失败（HTTP ${code}，未返回重定向地址）：${shortId}`);
}

// ---------- 下载 + 校验 ----------
function curlErrText(e) {
  if (e && e.status === 22) return 'HTTP 错误（4xx/5xx，图片可能已失效）';
  if (e && e.status === 28) return '请求超时';
  if (e && e.status === 6) return '域名解析失败（网络不可达）';
  const s = e && e.stderr ? String(e.stderr).trim().split(/\r?\n/).filter(Boolean).pop() : '';
  return s || (e && e.message) || 'curl 调用失败';
}

function download(url, dest) {
  const part = dest + '.part';
  try {
    curlDownload(url, part);
  } catch (e) {
    try { if (fs.existsSync(part)) fs.unlinkSync(part); } catch (_) {}
    throw new Error(curlErrText(e));
  }
  try {
    const buf = fs.readFileSync(part);
    const info = readImage(buf);
    if (!info) throw new Error('返回内容不是图片（魔数校验失败），可能被拦截或已失效');
    const ratio = info.h ? info.w / info.h : 0;
    const ok = (info.w === W && info.h === H) || Math.abs(ratio - W / H) < 0.02;
    if (!ok) throw new Error(`尺寸 ${info.w}x${info.h}（比例 ${ratio.toFixed(3)}）不等于目标 ${W}x${H}`);
    fs.renameSync(part, dest);
    return { fmt: info.fmt, w: info.w, h: info.h, ratio, bytes: buf.length };
  } finally {
    try { if (fs.existsSync(part)) fs.unlinkSync(part); } catch (_) {}
  }
}

// ---------- 主流程 ----------
(async () => {
  const results = [];
  const failures = [];
  const total = inputs.length;
  const digits = String(total).length;

  console.log('=== 图库取图（目标 ' + W + 'x' + H + '，webp）===');
  console.log('输出目录：' + OUT_DIR);
  console.log('');

  for (let i = 0; i < total; i++) {
    const raw = inputs[i];
    const idx = String(i + 1).padStart(digits, '0');
    try {
      const { provider, url } = await normalize(raw);
      const dest = path.join(OUT_DIR, `${SLUG}-${idx}-${provider}.webp`);
      const info = await download(url, dest);
      const rec = {
        index: i + 1,
        provider,
        page: raw,
        cdn: url,
        file: dest,
        name: path.basename(dest),
        ...info,
      };
      results.push(rec);
      if (!JSON_OUT) {
        console.log(`[ 成功 ] ${rec.name}`);
        console.log(`         ${provider} · ${info.w}x${info.h} · 比例 ${info.ratio.toFixed(3)} · ${(info.bytes / 1024).toFixed(0)} KB · ${info.fmt}`);
      }
    } catch (e) {
      failures.push({ index: i + 1, page: raw, error: e.message });
      if (!JSON_OUT) console.log(`[ 失败 ] ${raw}\n         ${e.message}`);
    }
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ width: W, height: H, out: OUT_DIR, ok: results, failed: failures }, null, 2));
  } else {
    console.log('');
    console.log(`共 ${total} 张 → 成功 ${results.length} / 失败 ${failures.length}`);
    if (results.length) {
      console.log('');
      console.log('下一步：node tools/upload-to-imgbed.js --src=' + OUT_DIR + ' --category article --sub <年>/<月>/<slug> --only=<文件名> --apply');
    }
  }

  if (results.length === 0 || (STRICT && failures.length > 0)) process.exit(1);
  process.exit(0);
})().catch((e) => {
  console.error('异常：' + (e && e.message ? e.message : e));
  process.exit(1);
});
