#!/usr/bin/env node
/**
 * IndexNow 主动收录脚本
 * ------------------------------------------------------------------
 * 作用：把本站页面的 URL 主动「推」给 IndexNow 端点，由它转达给
 *       Bing / Yandex / Seznam / Naver 等参与引擎，促使它们尽快重新抓取。
 *       这是 SEO 路线里「第 4 阶段：收录」的核心动作 —— 前面的结构化数据、
 *       FAQ、内链只有页面被收录之后才会真正生效。
 *
 * 文档：https://www.indexnow.org/documentation
 *
 * 用法：
 *   node tools/indexnow-push.js                      # 干跑（默认）：只统计与抽样，不发送
 *   node tools/indexnow-push.js --push               # 真实推送（要求站点已部署、key 文件可访问）
 *   node tools/indexnow-push.js --push --since 7     # 只推最近 7 天内有 lastmod 的页面（增量）
 *   node tools/indexnow-push.js --push --urls a.txt  # 推送指定列表（每行一个绝对 URL）
 *   node tools/indexnow-push.js --check-key          # 只检查 key 文件是否已可在线访问
 *   node tools/indexnow-push.js --list               # 只列出将要推送的 URL
 *
 * 前提（重要）：
 *   key 文件 `https://<host>/<key>.txt` 必须能公开访问，否则端点会返回 403/422。
 *   本地未部署时请用默认干跑模式；部署后再加 --push。
 *
 * ⚠ 为什么这个文件放在 tools/ 而不是 scripts/：
 *   hexo 会把 `scripts/` 下的每个文件 `require` 一遍当插件（见 hexo/dist/hexo/load_plugins.js
 *   的 loadScripts）。而 hexo 是用 vm.runInThisContext 包一层函数执行的，**不会像 Node 那样
 *   剥掉文件首行的 shebang**，于是这里的 `#!/usr/bin/env node` 会变成语法错误 ——
 *   日志里每次构建都冒一条吓人的红色 "Script load failed"，而且一旦哪天去掉 shebang，
 *   顶层的 main() 就会真的在构建时执行、并可能用 process.exit(1) 掐死整个构建。
 *   放到 tools/ 里 hexo 完全不碰，从根上消除这个隐患。
 */

'use strict';


const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SITEMAP = path.join(PUBLIC_DIR, 'sitemap.xml');
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const BATCH_MAX = 10000; // 协议上限：单次 10000 条，且必须同 host

// ---------------------------------------------------------------- 参数解析
const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const argOf = (f, def) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};

const MODE = {
  push: hasFlag('--push'),
  checkKey: hasFlag('--check-key'),
  list: hasFlag('--list'),
  since: argOf('--since', null),
  urls: argOf('--urls', null),
};

// ---------------------------------------------------------------- 站点信息
function readSiteInfo() {
  const cfg = fs.readFileSync(path.join(ROOT, '_config.yml'), 'utf8');
  const pick = (k) => {
    const m = cfg.match(new RegExp('^' + k + ':\\s*(.+)$', 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  };
  const url = pick('url');
  if (!url) throw new Error('_config.yml 里读不到 url');
  const u = new URL(url);
  return { siteUrl: url.replace(/\/+$/, ''), host: u.host };
}

// ---------------------------------------------------------------- 读 key
function readKey() {
  // 优先环境变量，其次从 source 根目录里「文件名 === 内容」的那个 txt 找
  if (process.env.INDEXNOW_KEY) return process.env.INDEXNOW_KEY.trim();
  const dirs = [path.join(ROOT, 'source'), PUBLIC_DIR];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (!/\.txt$/.test(f)) continue;
      const name = f.replace(/\.txt$/, '');
      // IndexNow key 规定：8~128 位，仅 [a-zA-Z0-9-]
      if (!/^[a-zA-Z0-9-]{8,128}$/.test(name)) continue;
      const body = fs.readFileSync(path.join(d, f), 'utf8').trim();
      if (body === name) return name;
    }
  }
  throw new Error('未找到 IndexNow key 文件（应为 source/<key>.txt，内容与文件名一致）');
}

// ---------------------------------------------------------------- 读 sitemap
// 过滤掉静态资源（.json/.xml/.txt/.js/.css/图片等），只保留真正的「页面」
const ASSET_RE = /\.(json|xml|txt|js|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|mp4|pdf)$/i;

function readSitemapUrls() {
  if (!fs.existsSync(SITEMAP)) throw new Error('找不到 public/sitemap.xml，请先构建');
  const xml = fs.readFileSync(SITEMAP, 'utf8');
  const out = [];
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
  for (const b of blocks) {
    const loc = (b.match(/<loc>([\s\S]*?)<\/loc>/) || [])[1];
    if (!loc) continue;
    const url = loc.trim();
    if (ASSET_RE.test(new URL(url).pathname)) continue;
    const lastmod = (b.match(/<lastmod>([\s\S]*?)<\/lastmod>/) || [])[1];
    out.push({ url, lastmod: lastmod ? lastmod.trim() : null });
  }
  return out;
}

function readUrlFile(file) {
  return fs
    .readFileSync(path.resolve(file), 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((url) => ({ url, lastmod: null }));
}

// ---------------------------------------------------------------- 主流程
async function main() {
  const { siteUrl, host } = readSiteInfo();
  const key = readKey();
  const keyLocation = siteUrl + '/' + key + '.txt';

  console.log('站点      : ' + siteUrl);
  console.log('host      : ' + host);
  console.log('IndexNow key : ' + key);
  console.log('key 文件  : ' + keyLocation);
  console.log('端点      : ' + ENDPOINT);
  console.log('');

  // --check-key：只验证 key 文件是否已可在线访问
  if (MODE.checkKey) {
    try {
      const r = await fetch(keyLocation, { method: 'GET', redirect: 'follow' });
      const body = (await r.text()).trim();
      console.log('HTTP ' + r.status);
      console.log('内容  : ' + (body || '(空)'));
      if (r.ok && body === key) console.log('\n✅ key 文件已就绪，可以执行 --push');
      else console.log('\n❌ key 文件未就绪（部署后才会生效；本地未部署属正常）');
    } catch (e) {
      console.log('请求失败：' + e.message);
      console.log('❌ 无法访问 key 文件（本地未部署属正常）');
    }
    return;
  }

  // 取 URL 列表
  let items = MODE.urls ? readUrlFile(MODE.urls) : readSitemapUrls();

  // 只保留本站 host
  const before = items.length;
  items = items.filter((it) => {
    try {
      return new URL(it.url).host === host;
    } catch {
      return false;
    }
  });
  if (before !== items.length) console.log('过滤掉异域 URL：' + (before - items.length) + ' 条');

  // --since N：只保留最近 N 天内有 lastmod 的
  if (MODE.since) {
    const days = Number(MODE.since);
    if (!Number.isFinite(days) || days <= 0) throw new Error('--since 需要一个正整数天数');
    const cutoff = Date.now() - days * 86400000;
    const b2 = items.length;
    items = items.filter((it) => {
      if (!it.lastmod) return false;
      const t = Date.parse(it.lastmod);
      return Number.isFinite(t) && t >= cutoff;
    });
    console.log('--since ' + days + ' 天：' + b2 + ' → ' + items.length + ' 条');
  }

  const urls = items.map((it) => it.url);
  console.log('');
  console.log('待推送 URL 总数：' + urls.length);

  if (!urls.length) {
    console.log('没有需要推送的 URL，结束。');
    return;
  }

  if (MODE.list || !MODE.push) {
    console.log('\n--- 抽样（前 10 条）---');
    urls.slice(0, 10).forEach((u) => console.log('  ' + u));
    if (urls.length > 10) console.log('  …其余 ' + (urls.length - 10) + ' 条');
    if (!MODE.push) {
      console.log('\n[干跑] 未发送任何请求。');
      console.log('真实推送请加 --push（需先部署，key 文件在线可访问）。');
      console.log('可先用 --check-key 确认 key 文件状态。');
    }
    return;
  }

  // 真实推送：分块
  let ok = 0;
  let fail = 0;
  const logLines = [];
  for (let i = 0; i < urls.length; i += BATCH_MAX) {
    const batch = urls.slice(i, i + BATCH_MAX);
    const payload = { host, key, keyLocation, urlList: batch };
    const stamp = new Date().toISOString();
    try {
      const r = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
      });
      const text = await r.text().catch(() => '');
      const line = stamp + '  batch#' + (i / BATCH_MAX + 1) + '  ' + batch.length + ' 条  HTTP ' + r.status + (text ? '  ' + text.slice(0, 300) : '');
      logLines.push(line);
      console.log(line);
      // 200/202 = 接收成功
      if (r.status === 200 || r.status === 202) ok += batch.length;
      else fail += batch.length;
      if (r.status === 403) console.log('  ↳ 403：key 无效或 key 文件不可访问（确认已部署且 https://<host>/<key>.txt 可打开）');
      if (r.status === 422) console.log('  ↳ 422：URL 不属于该 host 或与 key 不匹配');
      if (r.status === 429) console.log('  ↳ 429：请求过于频繁，请稍后再试（IndexNow 建议一天内不要重复推同一批）');
    } catch (e) {
      const line = stamp + '  batch#' + (i / BATCH_MAX + 1) + '  请求异常: ' + e.message;
      logLines.push(line);
      console.log(line);
      fail += batch.length;
    }
    if (i + BATCH_MAX < urls.length) await new Promise((r) => setTimeout(r, 1500)); // 礼貌间隔
  }

  console.log('\n结果：成功 ' + ok + ' 条，失败 ' + fail + ' 条');
  const logFile = path.join(ROOT, '.tmp', 'indexnow-push.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, '\n===== ' + new Date().toISOString() + ' 推送 ' + urls.length + ' 条 =====\n' + logLines.join('\n') + '\n');
  console.log('日志：' + logFile);
}

// 只在作为 CLI 直接运行时才执行；被 require 时保持零副作用。
if (require.main === module) {
  main().catch((e) => {
    console.error('错误：' + e.message);
    process.exit(1);
  });
}

module.exports = { main, readSitemapUrls, readKey, readSiteInfo };
