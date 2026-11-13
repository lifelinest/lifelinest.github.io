#!/usr/bin/env node
/**
 * tools/check-external-links.js —— 外链可达性校验（只读，不改任何文件）
 *
 * 为什么需要它：站内已有 check-imgbed-links.js 验图床，但「正文里的外链」
 * 一直是盲区 —— 手写一个 URL 打不开、或者站点已经下线，构建不会报错，
 * 只有读者点开才发现。对 SEO 来说，引向 404 的外链比没有外链更糟。
 *
 * 两个必须知道的坑（踩过）：
 *   1. 这台机器挂了 HTTP 代理（127.0.0.1:8845）。curl 会自动跟随代理所以能通，
 *      而 Node 原生 http/https 直连会被拦（症状：400 / socket hang up）。
 *      所以网络层一律走 curl 子进程，不要用 fetch/axios。
 *   2. Windows 下 curl.exe 不认 /dev/null，要用 NUL，否则 body 会灌进 stdout。
 *
 * 用法：
 *   node tools/check-external-links.js                      # 扫 source/_posts
 *   node tools/check-external-links.js --file=<路径>         # 只校验一篇
 *   node tools/check-external-links.js --dir=<目录>
 *   node tools/check-external-links.js --json               # 机读输出
 *   node tools/check-external-links.js --show-ok            # 连通过的也打印
 * 退出码：0 = 全部可达；1 = 存在不可达外链（可当部署闸）
 *
 * 注意：不要把这个文件放进 scripts/ —— hexo 会把 scripts/ 下的每个 .js 当插件加载执行。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const ROOT = path.join(__dirname, '..');
const NULL_DEV = process.platform === 'win32' ? 'NUL' : '/dev/null';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// 自有域名 / 图床：不算「外链」，由各自的检查器负责
const INTERNAL = [
  'mfy-lifeline.com',
  'lifelinest.github.io',
  'cloudflare-img-bzb.pages.dev',
  'localhost',
  '127.0.0.1',
  'github.com/lifelinest',
];

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const getArg = (n, d) => {
  const hit = argv.find((a) => a.startsWith(n + '='));
  return hit ? hit.slice(n.length + 1) : d;
};
const hasFlag = (n) => argv.includes(n);

const FILE = getArg('--file', '');
const DIR = getArg('--dir', 'source/_posts');
const CONCURRENCY = Math.max(1, parseInt(getArg('--concurrency', '6'), 10));
const TIMEOUT = Math.max(5, parseInt(getArg('--timeout', '20'), 10));
const AS_JSON = hasFlag('--json');
const SHOW_OK = hasFlag('--show-ok');

// ---------- 收集文件 ----------
function collect(dir) {
  const p = path.isAbsolute(dir) ? dir : path.join(ROOT, dir);
  if (!fs.existsSync(p)) {
    console.error('目录不存在：' + p);
    process.exit(1);
  }
  const st = fs.statSync(p);
  if (st.isFile()) return [p];
  const out = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const full = path.join(d, f);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (f.endsWith('.md')) out.push(full);
    }
  };
  walk(p);
  return out;
}

const files = FILE ? [path.isAbsolute(FILE) ? FILE : path.join(ROOT, FILE)] : collect(DIR);

// ---------- 提取外链 ----------
function extractLinks(text) {
  const found = new Set();
  // 代码块与行内代码里的 URL 是「示例」而非「引用」（如 API 端点、curl 命令），跳过，
  // 否则会被当成断链误报 —— 它们本来就不是给读者点的。
  const body = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
  const re = /https?:\/\/[^\s)\]"'<>`*|，。；）】]+/g;
  let m;
  while ((m = re.exec(body))) {
    let u = m[0].replace(/[.,;:!?]+$/, '');
    if (!u.includes('://')) continue;
    try {
      const host = new URL(u).hostname;
      if (INTERNAL.some((d) => host === d || host.endsWith('.' + d))) continue;
      found.add(u);
    } catch {
      /* 无法解析的 URL 直接忽略 */
    }
  }
  return [...found];
}

const linkMap = new Map(); // url -> [文件名]
for (const f of files) {
  const raw = fs.readFileSync(f, 'utf8');
  for (const u of extractLinks(raw)) {
    if (!linkMap.has(u)) linkMap.set(u, []);
    linkMap.get(u).push(path.basename(f));
  }
}
const urls = [...linkMap.keys()];

// ---------- 探测 ----------
async function probe(url) {
  const args = [
    '-s',
    '-o',
    NULL_DEV,
    '-w',
    '%{http_code}',
    '-L',
    '--max-time',
    String(TIMEOUT),
    '-A',
    UA,
    url,
  ];
  try {
    const { stdout } = await execFileAsync('curl', args, { timeout: (TIMEOUT + 8) * 1000 });
    const code = parseInt(String(stdout).trim().slice(-3), 10);
    return { url, code: Number.isFinite(code) ? code : 0 };
  } catch {
    return { url, code: 0 };
  }
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runner = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

(async () => {
  if (!urls.length) {
    console.log('没有找到外部链接。');
    process.exit(0);
  }

  const results = await pool(urls, CONCURRENCY, probe);

  // 2xx / 3xx 正常；403/401 是「存在但拒绝机器访问」，算警告不算失败
  const ok = results.filter((r) => r.code >= 200 && r.code < 400);
  const warn = results.filter((r) => r.code === 401 || r.code === 403 || r.code === 429);
  const bad = results.filter((r) => !ok.includes(r) && !warn.includes(r));

  if (AS_JSON) {
    console.log(
      JSON.stringify(
        {
          scanned: files.length,
          found: urls.length,
          ok: ok.length,
          warn: warn.length,
          bad: bad.length,
          failures: [...bad, ...warn].map((r) => ({ code: r.code, url: r.url, in: linkMap.get(r.url) })),
        },
        null,
        2
      )
    );
    process.exit(bad.length ? 1 : 0);
  }

  console.log('=== 外链可达性校验 ===');
  console.log('扫描范围 : ' + files.length + ' 个文件');
  console.log('外链总数 : ' + urls.length + ' 条（已排除自有域名与图床）');
  console.log('并发/超时: ' + CONCURRENCY + ' / ' + TIMEOUT + 's');
  console.log('');

  if (SHOW_OK) {
    for (const r of ok) console.log('[ ' + r.code + ' ] ' + r.url);
    if (ok.length) console.log('');
  }
  for (const r of warn) {
    console.log('[ ' + r.code + ' 警告 ] ' + r.url);
    console.log('           出现于：' + linkMap.get(r.url).slice(0, 3).join('、'));
  }
  for (const r of bad) {
    console.log('[ ' + (r.code || '连接失败') + ' 断链 ] ' + r.url);
    console.log('           出现于：' + linkMap.get(r.url).slice(0, 3).join('、'));
  }
  if (warn.length || bad.length) console.log('');

  console.log('汇总：可达 ' + ok.length + ' / 警告 ' + warn.length + ' / 断链 ' + bad.length);
  if (bad.length) {
    console.log('退出码 1（存在断链，请修复后再发布）');
    process.exit(1);
  }
  console.log('退出码 0（外链全部可达）');
})();
