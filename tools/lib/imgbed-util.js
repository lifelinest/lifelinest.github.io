#!/usr/bin/env node
/**
 * 图床共用工具（cloudflare-img-bzb.pages.dev）。
 * 被 check-imgbed-links.js 与 relocate-imgbed.js 复用。
 *
 * 关键能力：
 *  - extractImgbedUrls(text)：抽取文本里所有图床 URL（兼容中文原始 / 百分号编码两种写法）
 *  - normalizeImgUrl(url)：把任意图床 URL 归一成「逐段 encodeURIComponent」形式，
 *    保证 CSS/JS 模板与 markdown 都安全可用（中文路径不再因未编码而失效）
 *  - decodeImgPath(url)：取 /file/ 之后的「已解码路径」，用于路径比对/替换
 *  - verifyImgUrl(url, opts)：HTTP 200 + 图片魔数双重验真（挡住图床「200 + HTML 回退页」假成功陷阱）
 */
const { execFile } = require('child_process');

const IMG_HOST_RE = /https?:\/\/cloudflare-img-bzb\.pages\.dev\/file\/[^\s"'<>)]+/g;

/** 抽取文本中所有图床 URL。返回数组（不去重）。 */
function extractImgbedUrls(text) {
  if (!text) return [];
  return text.match(IMG_HOST_RE) || [];
}

/** 取 URL 的 host 基址（https://cloudflare-img-bzb.pages.dev）。 */
function hostOf(url) {
  const m = url.match(/^https?:\/\/[^/]+/);
  return m ? m[0] : null;
}

/** 取 /file/ 之后（含 /file/）的路径部分；非图床 URL 返回 null。 */
function rawPathOf(url) {
  const i = url.indexOf('/file/');
  if (i < 0) return null;
  return url.slice(i); // /file/系统/MBTI/xxx.png 或 /file/%E7%B3%BB%E7%BB%9F/...
}

/** 解码 /file/ 之后的路径（去掉 /file/ 前缀，做 decodeURIComponent）。 */
function decodeImgPath(url) {
  const p = rawPathOf(url);
  if (p == null) return null;
  return decodeURIComponent(p.replace(/^\/file\//, ''));
}

/** 把图床 URL 归一成「逐段编码」的标准形式。 */
function normalizeImgUrl(url) {
  const host = hostOf(url);
  const raw = rawPathOf(url);
  if (!host || raw == null) return url;
  const decoded = decodeURIComponent(raw); // 先整体解码，容错「已是原始中文」与「已是编码」两种情况
  const segs = decoded.split('/');
  const enc = segs.map(s => encodeURIComponent(s)).join('/');
  return host + enc;
}

/** 判断一段字节缓冲是不是真实图片（挡 HTML 回退页 / 404 文本）。 */
function isImageMagic(buf) {
  if (!buf || buf.length < 4) return false;
  const head = buf.subarray(0, 12);
  const png = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const jpg = head[0] === 0xff && head[1] === 0xd8;
  const gif = head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46;
  const webp = head[0] === 0x52 && head[1] === 0x49 && head[8] === 0x57 && head[9] === 0x45;
  const svg = /<svg/i.test(buf.subarray(0, 64).toString('utf8'));
  return png || jpg || gif || webp || svg;
}

/**
 * curl 子进程探针（兜底通道）。
 * 动机：本机走 HTTP 代理时，Node 原生 fetch 偶发直连被拦 → 「fetch failed」，
 * 这类是网络层瞬断而非真断链；curl 会自动跟随代理，明显更稳。
 * 只取前 16 字节（-r 0-15），用 -w 把状态码附在 stdout 末尾，一并拿回。
 * 返回 { status, body }；解析失败返回 null。
 */
  function curlProbe(url, timeoutMs) {
    const secs = String(Math.max(5, Math.ceil((timeoutMs || 15000) / 1000)));
    return new Promise((resolve) => {
      execFile(
        'curl',
        ['-sS', '-L', '--max-time', secs, '-r', '0-15', '-w', '\n__HTTP__%{http_code}', '--', url],
        { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 },
        (err, stdout) => {
          const buf = stdout || Buffer.alloc(0);
          const idx = buf.lastIndexOf('\n__HTTP__');
          if (idx < 0) return resolve(null);
          const status = parseInt(buf.slice(idx + 9).toString().trim(), 10) || 0;
          resolve({ status, body: buf.slice(0, idx) });
        }
      );
    });
  }

  /**
   * 验真单个图床 URL：
   *  - 用 Range 只取前 16 字节（省流量）
   *  - 判据：HTTP 200/206 + 图片魔数
   *  - 对「网络层失败（status=0，如超时/中断）」自动重试（默认 2 次，1s 退避），
   *    因为这类多为并发打满图床的瞬断，不是真断链；HTTP 错误（404/503 等）不重试。
   *  - fetch 全败时再用 curl 兜底判一次（本机代理环境 fetch 直连不稳）。
   * 返回 { ok, status, msg }
   */
  async function verifyImgUrl(url, opts = {}) {
    const timeout = opts.timeout || 15000;
    const retries = opts.retries != null ? opts.retries : 2;
    let last = { ok: false, status: 0, msg: '未知' };
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const r = await fetch(url, {
          headers: { Range: 'bytes=0-15' },
          redirect: 'follow',
          signal: controller.signal,
        });
        if (!(r.status === 200 || r.status === 206)) {
          return { ok: false, status: r.status, msg: 'HTTP ' + r.status }; // 真错误，不重试
        }
        const buf = Buffer.from(await r.arrayBuffer());
        if (!isImageMagic(buf)) {
          return { ok: false, status: r.status, msg: '非图片（疑似图床回退页/404 文本）' }; // 真错误，不重试
        }
        return { ok: true, status: r.status, msg: 'OK' };
      } catch (e) {
        last = { ok: false, status: 0, msg: '请求失败: ' + e.message };
        if (attempt < retries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      } finally {
        clearTimeout(timer);
      }
    }

    // fetch 全败（status=0）→ 用 curl 兜底再判一次，避免把网络瞬断误报成断链。
    try {
      const p = await curlProbe(url, timeout);
      if (p && p.status !== 0) {
        if (p.status === 200 || p.status === 206) {
          return isImageMagic(p.body)
            ? { ok: true, status: p.status, msg: 'OK (curl 兜底)' }
            : { ok: false, status: p.status, msg: '非图片（疑似图床回退页/404 文本）(curl)' };
        }
        return { ok: false, status: p.status, msg: 'HTTP ' + p.status + ' (curl)' };
      }
    } catch (e) {
      /* curl 也不可用了，保留 status=0 */
    }
    return last;
  }

module.exports = {
  IMG_HOST_RE,
  extractImgbedUrls,
  hostOf,
  rawPathOf,
  decodeImgPath,
  normalizeImgUrl,
  isImageMagic,
  verifyImgUrl,
};
