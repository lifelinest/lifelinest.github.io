#!/usr/bin/env node
/**
 * tools/serp-check.js —— R2 竞品对标（选题逻辑缺的「第三段」）
 * ------------------------------------------------------------------
 * 选题逻辑升级前只有两段：有人搜  ×  站内没写过  →  写。
 * 它缺第三段：**前 10 名我打得过吗**。
 *
 * 真实翻案例（已被本工具验证）：
 *   `外贸B2B独立站` 在需求层是「三引擎共同建议 + 站内 0 篇」= 优先级最高。
 *   但 SERP 一摊开 —— 连连、阿里巴巴、商派、Shopee、百度百科全在占位。
 *   这是**商业词**（用户想找公司做站），不是**内容词**（想读文章）。
 *   写文章进去 = 白写。需求层筛不掉它，SERP 一眼就筛掉了。
 *
 * 本工具做的事：给一个词 → 抓双通道搜索结果 → 前 N 名是谁 → 初判词性。
 *
 * 通道（实测结论，别换）：
 *   **两条通道都必须走本机 Chrome 无头 + CDP 真实渲染。**
 *   百度 ：curl 抓不到（桌面 302 跳验证页 / 移动版 JS 骨架）
 *          ★ 关键提取技巧：百度真实 URL 不在 href（全是 baidu.com/link?url= 加密跳转），
 *            藏在结果卡片的 mu="..." 属性里。抽 href 只能得到一堆 www.baidu.com。
 *   Bing ：**本环境抓不到真结果，已从默认通道移除。**
 *          - curl 直抓：标题正常（"<词> - 搜索"），结果区却返回随机降级页 ——
 *            同一个词连抓三次分别得到「玫瑰百科」「在线词典」「QQ邮箱登录」。
 *          - 无头 Chrome 渲染：同样降级（三次得到 Windows 帮助 / 百度知道 /
 *            资源管理器等与查询毫不相干的内容），换了国际版 www.bing.com、
 *            加了首页预热也无效。
 *          ⇒ Bing 对无账号、无历史、纯自动化会话返回随机内容。这是**静默失败**，
 *            最危险的地方是它「看起来有结果」——第一版就因此得出过错误结论。
 *            要 `--engine=bing` 仍可跑，但结果自行判断可信度。
 *
 * ⚠️ 教训（别再犯）：判断某个 SERP 通道「能不能用」，不能只看 HTTP 200 和
 *    页面有没有结果块，必须**核对结果与查询词是否相关**。标题对、结果错，是
 *    最容易被当真的失败模式。
 *
 * 输出：前 N 名域名/标题 + 域名归类 + 「内容词 / 商业词 / 导航词 / 平台垄断」判定 + 机会度。
 *
 * 用法：
 *   node tools/serp-check.js "外贸B2B独立站"               # 查一个词（默认百度）
 *   node tools/serp-check.js "词1" "词2"                   # 查多个词
 *   node tools/serp-check.js --from=demand --limit=12      # 批量体检需求层高置信缺口词（hits>=2）
 *   node tools/serp-check.js --from=demand --limit=140     # 覆盖全部「双引擎以上」缺口词
 *   node tools/serp-check.js "词" --top=10 --json=out.json
 *
 * 常用开关：
 *   --engine=baidu        走哪个通道（⚠️ 只剩百度可用 —— Bing 在本机是静默失败，别试着开）
 *   --top=10              取前几名（默认 10）
 *   --conc=3              并发标签页数（默认 3；调高会显著增加内存压力）
 *   --recycle=15          每处理 N 个词回收一次标签页（默认 15）
 *   --no-cache            忽略缓存重抓
 *   --timeout=40000       单次导航超时（ms）
 *
 * 硬规矩：
 *   - 只读 + 落盘。绝不改文章、不构建、不部署。
 *   - 只抓**公开搜索结果页**，不绕任何登录态、不模拟点击广告。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TMP = 'D:/1/1/.tmp';
const OUT_DIR = path.join(TMP, 'serp');
const DEMAND_FILE = path.join(TMP, 'demand', 'demand.json');
const CACHE_FILE = path.join(OUT_DIR, 'cache.json');
const CHROME_DIR = path.join(TMP, 'chrome-serp');
// Chrome 的磁盘缓存 / crashpad / %TEMP% 全部重定向到这里（必须在 D 盘，见 spawnChrome 注释）
const CHROME_TMP = path.join(TMP, 'chrome-tmp');
const CDP = 'http://127.0.0.1:9222';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ---------------- 参数 ----------------
function has(n) { return process.argv.includes('--' + n); }
function arg(n, def) {
  const i = process.argv.indexOf('--' + n);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const kv = process.argv.find((a) => a.startsWith('--' + n + '='));
  return kv ? kv.slice(n.length + 3) : def;
}
const ENGINES = String(arg('engine', 'baidu')).split(',').map((s) => s.trim()).filter(Boolean);
const TOP = Math.max(3, Math.min(20, Number(arg('top', '10')) || 10));
const FROM = arg('from', '');
const LIMIT = Number(arg('limit', '12')) || 12;
const DEEP = has('deep');
const NO_CACHE = has('no-cache');
// --cached-only：只读缓存、绝不启浏览器。批量中断后用它把已有结果落盘。
const CACHED_ONLY = has('cached-only');
const TIMEOUT = Number(arg('timeout', '40000')) || 40000;
const CONC = Math.max(1, Math.min(6, Number(arg('conc', '3')) || 3));
// 每处理 N 个词主动换一次标签页；每 3 次换页顺带把整个浏览器重起一次（治内存退化）
const RECYCLE_EVERY = Math.max(5, Number(arg('recycle', '15')) || 15);
const JSON_OUT = arg('json', '');

// ---------------- 域名归类 ----------------
// 顺序即优先级。命中第一个就停。
const HOST_TYPES = [
  { t: '平台', re: /(^|\.)(alibaba|aliexpress|made-in-china|globalsources|1688|hc360|yiwugo|dhgate|tradekey|ec21|ecplaza)\./i },
  { t: '电商', re: /(^|\.)(taobao|tmall|jd|pinduoduo|amazon|ebay|shopee|temu|wish|lazada)\./i },
  { t: '百科', re: /(baike\.baidu|zh\.wikipedia|wikipedia\.org|\/item\/|\/wiki\/)/i },
  { t: '问答', re: /(zhidao\.baidu|wenda\.so|iask\.sina|\/question\/|\/answer\/)/i },
  { t: '内容社区', re: /(^|\.)(zhihu|jianshu|csdn|juejin|cnblogs|segmentfault|bilibili|weibo|douban|xiaohongshu|tieba|51cto|oschina)\./i },
  { t: '视频', re: /(^|\.)(youtube|youku|iqiyi|douyin|kuaishou|v\.qq)\./i },
  { t: '媒体', re: /(^|\.)(sohu|163|sina|toutiao|qq|ifeng|thepaper|people|xinhuanet|chinanews|cet|waimaoribao|36kr|huxiu|tmtpost|stcn|cnstock|yicai|jiemian)\./i },
  { t: '政务', re: /(\.gov\.cn|(^|\.)(miit|mps|customs|chinatax|samr|mofcom)\.)/i },
  // 百度自家产品（百科/知道/经验/文库）—— 真实结果位，但是高权重占位
  { t: '百度系', re: /(^|\.)baidu\.com$/i },
];
// 营销话术（→ 商业词信号）
const MKT_RE = /(点击进入|立即咨询|在线咨询|免费试用|免费领取|免费注册|上门|报价|价格|多少钱|厂家|供应商|定制开发|一站式|解决方案|专业提供|为您提供|欢迎咨询|热线|联系我们|官网|订购|批发|货源)/;
// 内容特征（→ 内容词信号）
const CONTENT_RE = /(是什么|什么是|怎么|如何|教程|指南|区别|对比|入门|方法|技巧|经验|避坑|详解|攻略|全流程|步骤|注意事项|总结|盘点|推荐|案例|分析|原理|入门到精通)/;
// 导航/资源类意图（→ 别写）：用户在找安装包、官网入口、账号页，
// 不是想读文章。且这类内容常牵涉盗版/破解风险，站内不应碰。
// ⚠️ 别加裸 `app`：`/app/` 会匹配 app / apple / happening…，把「笔记软件推荐」这类
//    正常内容词误判成导航词（踩过）。要写就写「app下载」这种带宾语的。
const NAV_RE = /(下载|安装包|官网|登录|登陆|注册|入口|免费版|破解|激活码|序列号|绿色版|手机版|电脑版|客户端|在线使用|官网地址|官方下载)/;
// 词形预筛：**不联网**就能判死的词（含下载/官网/登录/入口类后缀）。
// 需求层下拉词里这类占比很高（「谷歌广告官网」「阿里国际站卖家入口」「ai工具集官网」…），
// 批量体检时先筛掉能省掉大量抓取时间。
const WORD_NAV_RE = /(下载|官网|登陆|登录|注册|入口|安装包|破解|免费版|绿色版|客户端|客服电话|开户|招聘|加盟|代理招商|序列号|激活码)/;
// 高权重占位（这些站占位 = 硬骨头）
const BIG_TYPES = new Set(['平台', '电商', '百科', '问答', '政务', '百度系']);
// 只剔除百度自己的导航/热榜/广告位，**不能**误伤 baike/zhidao/jingyan 这些真实结果位
const HOST_DROP = /^(www|m)?\.?baidu\.com$|^top\.baidu\.com$|nourl\.ubs\.baidu\.com$|^bdstatic\./i;

function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }
function typeOf(host, title) {
  for (const r of HOST_TYPES) if (r.re.test(host)) return r.t;
  if (MKT_RE.test(title || '')) return '服务商';
  return '普通站';
}

// ---------------- Chrome / CDP ----------------
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
function findChrome() {
  for (const p of CHROME_CANDIDATES) if (p && fs.existsSync(p)) return p;
  return '';
}
async function cdpAlive() {
  try {
    const r = await fetch(CDP + '/json/version', { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch { return false; }
}
let chromeProc = null;

// ---------------- 硬重置：把自家 Chrome 连根杀干净 ----------------
// ⚠️ 为什么必须有（2026-09-23 实测事故）：Chrome 崩过一次之后，只要 9222 还有人应答，
//    ensureChrome() 就会认为「实例健康」直接复用（返回 {reused:true}）—— 实际是个残废
//    实例。结果是崩后剩下的 100 多个词 **100% 失败**（133 词那轮：成功 40 / 失败 46 后全灭）。
//    单靠 newSession() 重建标签页救不回来，必须把整个浏览器进程换掉。
// ⚠️ 认领方式：按 `--user-data-dir` 里的目录名匹配命令行 —— **绝不能用
//    `taskkill /IM chrome.exe`**，那会把用户自己开着的浏览器一起干掉。
function killChromeHard() {
  const kills = new Set();
  if (chromeProc && chromeProc.pid) kills.add(String(chromeProc.pid));
  const tag = path.basename(CHROME_DIR); // chrome-serp
  // ① 按命令行认领自家的 headless 实例（含上次运行遗留的孤儿进程）
  try {
    const ps = 'Get-CimInstance Win32_Process -Filter "Name=\'chrome.exe\' OR Name=\'msedge.exe\'" | ' +
      'Where-Object { $_.CommandLine -like \'*' + tag + '*\' } | Select-Object -ExpandProperty ProcessId';
    const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 25000 });
    for (const line of out.split(/\r?\n/)) if (/^\d+$/.test(line.trim())) kills.add(line.trim());
  } catch { /* ignore */ }
  // ② 占着 9222 的（browser 进程可能已读不到命令行，但端口还在它手里）
  try {
    const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8', timeout: 25000 });
    for (const line of out.split(/\r?\n/)) {
      // ⚠️ 只认「本地端口=9222」的行（监听端=Chrome）。
      //    旧写法 `/[:.]9222\s/` 会连**客户端连接行**一起命中（本地 5xxxx → 远程 9222），
      //    而该行的 owner PID 正是 node 自己 → taskkill /F 把自己杀掉，
      //    表现为「跑完最后一条词就 exit 1、latest.json 永不更新、且不打印任何错误」。
      const cols = line.trim().split(/\s+/);
      if (cols.length < 5) continue;
      if (!/[:.]9222$/.test(cols[1])) continue;
      const m = cols[cols.length - 1].match(/^\d+$/);
      if (m && Number(m[1]) !== process.pid) kills.add(m[1]);
    }
  } catch { /* ignore */ }
  for (const pid of kills) {
    // 兜底：任何情况下都不要自杀（历史上曾因 netstat 解析把自身 PID 混进来）
    if (Number(pid) === process.pid) continue;
    try { execFileSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore', timeout: 20000 }); } catch { /* ignore */ }
  }
  chromeProc = null;
  return kills.size;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ⚠️ 并发下只允许一次重启在飞：3 个 worker 的会话共享同一个浏览器，浏览器一崩会**同时**报错。
//    若让它们各自硬杀一遍，后一个会把前一个刚起好的浏览器再杀掉，来回抖死（thrash）。
let restarting = null;

// force=true：先硬杀再重启。端口没真正释放就 spawn 会因 profile/端口占用秒退。
async function ensureChrome(force) {
  if (!force && (await cdpAlive())) return { reused: true };
  if (force) {
    if (restarting) return restarting;      // 有人正在重启 → 等它，别重复杀
    restarting = (async () => {
      killChromeHard();
      for (let i = 0; i < 30 && (await cdpAlive()); i++) await sleep(300);
      return await spawnChrome();
    })();
    try { return await restarting; } finally { restarting = null; }
  }
  return await spawnChrome();
}

// 「先轻后重」的会话恢复 + 升级阶梯：浏览器还活着就只换标签页；真死了才硬重置。
// ⚠️ 这一层很重要 —— 无脑硬重置会在并发下互杀，轻量恢复才是常态路径。
// ⚠️ 但要防「CDP 还答、页面永远加载不出来」的病态浏览器：轻量恢复成功不代表浏览器健康，
//    所以最多连走 2 次轻量，仍报错就升级到硬重置（成功一个词就重置计数）。
let lightRecoveries = 0;
async function recoverSession() {
  if (lightRecoveries < 2 && (await cdpAlive())) {
    try {
      const s = await newSession();
      lightRecoveries++;
      return s;
    } catch { /* 换页都失败 → 落到硬重置 */ }
  }
  lightRecoveries = 0;
  await ensureChrome(true);
  return await newSession();
}

async function spawnChrome() {
  const exe = findChrome();
  if (!exe) throw new Error('找不到 Chrome/Edge，无法走百度通道。');
  fs.mkdirSync(CHROME_DIR, { recursive: true });
  fs.mkdirSync(CHROME_TMP, { recursive: true });
  // ⚠️ 上次被强杀会留下 profile 锁文件，复用同一 user-data-dir 时新进程可能起不来/秒崩
  for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile']) {
    try { fs.rmSync(path.join(CHROME_DIR, f), { force: true }); } catch { /* ignore */ }
  }
  chromeProc = spawn(exe, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--remote-allow-origins=*',
    '--user-data-dir=' + CHROME_DIR,
    // 🔴 关键：只把 user-data-dir 放到 D 盘是不够的。Chrome 还会把磁盘缓存、
    //    crashpad 转储、以及 %TEMP% 下的临时文件写到系统盘。本机 C 盘长期爆满
    //    （实测 2026-09-23 可用 0 字节），renderer 进程一创建就死 —— 现象极具
    //    误导性：主进程活、CDP 9222 应答、`/json/new` 建得出标签，**一导航就
    //    "CDP 会话已关闭"**，看着像并发/内存问题，真凶是磁盘写不进去。
    '--disk-cache-dir=' + CHROME_TMP,
    '--crash-dumps-dir=' + CHROME_TMP,
    '--user-agent=' + UA,
    '--disable-blink-features=AutomationControlled',
    '--window-size=1440,900',
    '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking',
    // 降内存：无头批量抓取时 Chrome 崩过（跑 5 个词就掉线）。
    // 关 GPU/合成器 + 限制 JS 堆 + 关掉用不上的后台服务。
    '--disable-gpu', '--disable-software-rasterizer', '--disable-dev-shm-usage',
    '--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints',
    '--js-flags=--max-old-space-size=1024',
    '--renderer-process-limit=4',
    // 抓百度是国内站：强制直连，避免系统代理把它带沟里
    '--no-proxy-server',
    'about:blank',
  ], {
    detached: true,
    stdio: 'ignore',
    // ★ 把子进程的 TEMP/TMP 也挪到 D 盘，否则 Chrome 仍会往 C 盘写临时文件
    env: Object.assign({}, process.env, {
      TEMP: CHROME_TMP, TMP: CHROME_TMP, TMPDIR: CHROME_TMP,
    }),
  });
  chromeProc.unref();
  for (let i = 0; i < 40; i++) {
    await sleep(400);
    if (await cdpAlive()) return { reused: false, pid: chromeProc.pid };
  }
  throw new Error('Chrome 起了但 CDP 9222 没就绪。');
}
function killOwnChrome() {
  killChromeHard();
}

// 一个可复用的 CDP 会话（单 tab 串行）
function makeSession(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let idc = 0;
  const pending = new Map();
  let closed = false;
  let closeErr = null;
  const ready = new Promise((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('CDP ws 连接失败')); });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  // ★ 必须处理 ws 关闭：否则 pending 里的 promise 永不 settle，事件循环空转后
  //   Node 会**静默退出（exit 0）**，留下一半结果且不报错。踩过：100 个词只跑了 5 个。
  ws.onclose = () => {
    closed = true;
    closeErr = closeErr || new Error('CDP 会话已关闭（Chrome 被关掉或崩溃了？）');
    for (const settle of pending.values()) settle({ __err: closeErr });
    pending.clear();
  };
  function send(method, params = {}) {
    if (closed) return Promise.reject(closeErr || new Error('CDP 会话已关闭'));
    const id = ++idc;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      const t = setTimeout(() => {
        pending.delete(id);
        rej(new Error('CDP 调用超时 ' + TIMEOUT + 'ms：' + method));
      }, TIMEOUT);
      pending.set(id, (m) => {
        clearTimeout(t);
        if (m && m.__err) rej(m.__err); else res(m);
      });
    });
  }
  async function ev(js) {
    const r = await send('Runtime.evaluate', { expression: `(()=>{${js}})()`, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error('eval 异常: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 160));
    return r.result?.result?.value;
  }
  // ⚠️ 只关 WebSocket 是不够的 —— 标签页会一直留在浏览器里。
  //    2026-09-23 实测：跑 60–70 个词后堆到 29 个 page + 25 个 worker，
  //    内存被拖垮 → 新建的标签页秒死，表现为「CDP 会话已关闭」连片失败（且怎么重试都没用，
  //    因为重试本身也在继续造标签页）。必须显式关掉 target。
  async function close() {
    for (const m of ['PUT', 'GET']) {
      try {
        const r = await fetch(CDP + '/json/close/' + t.id, { method: m });
        if (r.ok) break;
      } catch { /* ignore */ }
    }
    try { ws.close(); } catch { /* ignore */ }
  }
  return { ready, send, ev, close };
}

// 新建一个配好的标签页会话（含 UA / 屏蔽图片字体）
async function newSession() {
  const t = await (await fetch(CDP + '/json/new?' + encodeURIComponent('about:blank'),
    { method: 'PUT' })).json();
  const s = makeSession(t);
  await s.ready;
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  await s.send('Network.enable');
  await s.send('Network.setUserAgentOverride', { userAgent: UA, acceptLanguage: 'zh-CN,zh;q=0.9' });
  // 阻断图片/字体/媒体：SERP 只需要 DOM 与标题文本，加载这些纯属白烧内存
  // （无头模式下 Chrome 跑几个百度页就崩，这是主因之一）
  await s.send('Network.setBlockedURLs', {
    urls: [
      '*.png', '*.jpg', '*.jpeg', '*.gif', '*.webp', '*.bmp', '*.ico', '*.svg',
      '*.woff', '*.woff2', '*.ttf', '*.otf', '*.eot',
      '*.mp4', '*.mp3', '*.webm', '*.flv', '*.avi',
    ],
  });
  return s;
}

// ---------------- 通用：导航 + 等渲染 ----------------
async function navigateAndWait(sess, url, readyExpr) {
  await sess.send('Page.navigate', { url });
  for (let i = 0; i < Math.min(200, Math.ceil(TIMEOUT / 100)); i++) { // 最多 20s
    const s = await sess.ev('return document.readyState').catch(() => '');
    if (s === 'complete') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  // 轮询结果节点出现（别固定 sleep：重站 8–25s 不等）。表达式为真即走。
  for (let i = 0; i < 20; i++) { // 最多 6s
    const ok = await sess.ev('return !!(' + readyExpr + ')').catch(() => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  await new Promise((r) => setTimeout(r, 1000)); // 等前端补渲染
}

// ---------------- 百度通道（CDP 渲染）----------------
async function baiduSearch(sess, word) {
  const t0 = Date.now();
  const url = 'https://www.baidu.com/s?wd=' + encodeURIComponent(word) + '&ie=utf-8&rn=' + TOP;
  await navigateAndWait(sess, url, 'document.querySelectorAll("[mu]").length >= 5');
  const data = await sess.ev(`
    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('[mu]')) {
      const mu = (el.getAttribute('mu') || '').trim();
      if (!/^https?:\\/\\//.test(mu)) continue;
      // 卡片容器：必须在卡片内找标题。上溯找祖先会把全页第一条 h3 复用到每一张卡上
      // （踩过：7 张卡的标题全变成同一条营销文案）。
      const box = el.closest('div.result, div.result-op, div.c-container, div[tpl]') || el;
      const h3 = box.querySelector('h3');
      const title = (h3 ? h3.innerText : '').replace(/\\s+/g, ' ').trim().slice(0, 110);
      if (seen.has(mu)) continue;
      seen.add(mu);
      out.push({ url: mu, title });
    }
    return {
      pageTitle: document.title,
      htmlLen: document.documentElement.outerHTML.length,
      webdriver: navigator.webdriver,
      isVerify: /安全验证|wappass|请输入验证码|网络不给力|系统检测到异常/.test(document.body ? document.body.innerText : ''),
      items: out,
    };
  `);
  return {
    engine: 'baidu', ms: Date.now() - t0,
    blocked: !!data.isVerify, items: data.items || [],
    meta: { pageTitle: data.pageTitle, htmlLen: data.htmlLen, webdriver: data.webdriver },
  };
}

// ---------------- Bing 通道（CDP 渲染 —— curl 实测不可信，见文件头说明）----------------
async function bingSearch(sess, word) {
  const t0 = Date.now();
  const url = 'https://cn.bing.com/search?q=' + encodeURIComponent(word) + '&setlang=zh-CN';
  await navigateAndWait(sess, url, 'document.querySelectorAll("#b_results > li.b_algo").length >= 5');
  const data = await sess.ev(`
    const cards = [...document.querySelectorAll('#b_results > li.b_algo')];
    const out = [];
    const seen = new Set();
    for (const el of cards) {
      const a = el.querySelector('h2 a') || el.querySelector('h2');
      if (!a) continue;
      const u = a.href || '';
      if (!/^https?:\\/\\//.test(u)) continue;
      if (seen.has(u)) continue;
      seen.add(u);
      out.push({
        url: u,
        title: ((a.innerText || a.textContent || el.innerText || '') + '').replace(/\\s+/g, ' ').trim().slice(0, 110),
      });
    }
    return {
      pageTitle: document.title,
      htmlLen: document.documentElement.outerHTML.length,
      isVerify: /安全验证|verify|captcha|人机验证/.test(document.body ? document.body.innerText : '') && out.length === 0,
      items: out,
    };
  `);
  return {
    engine: 'bing', ms: Date.now() - t0,
    blocked: !!data.isVerify, items: data.items || [],
    meta: { pageTitle: data.pageTitle, htmlLen: data.htmlLen },
  };
}

// ---------------- 词性判定 ----------------
function judge(rows, total, word) {
  const n = rows.length || 1;
  const by = (t) => rows.filter((r) => r.type === t).length;
  const big = rows.filter((r) => BIG_TYPES.has(r.type)).length;
  const media = by('媒体') + by('内容社区') + by('视频');
  const mkt = rows.filter((r) => MKT_RE.test(r.title)).length;
  const content = rows.filter((r) => CONTENT_RE.test(r.title)).length;
  const nav = rows.filter((r) => NAV_RE.test(r.title)).length;
  const vendor = by('服务商');
  const plain = by('普通站');
  const w = String(word || '');

  // 商业词分：营销话术 + 平台/电商 + 政务（备案/政策入口）
  const commercial = mkt * 2 + (by('平台') + by('电商')) * 2 + by('政务') * 2 + vendor * 1.5;
  // 内容词分：内容标题 + 内容型站点
  const contentScore = content * 2 + media * 1.2 + plain * 0.4;

  let verdict, why;
  if (commercial >= 6 && commercial > contentScore) {
    verdict = '商业词';
    why = `前 ${n} 名里营销话术 ${mkt} 条、平台/电商 ${by('平台') + by('电商')} 条 —— 用户想找「供应商/服务商」，不是想读文章`;
  } else if (nav >= 3 && nav > content) {
    // 要求「导航类占多数且确实多」——单有 2 条下载页不算（「笔记软件推荐」的结果里
    // 本来就会夹着下载页，但用户意图仍是看推荐）。
    verdict = '导航词';
    why = `前 ${n} 名里有 ${nav} 条导航类标题（下载/官网/登录）且多于内容类 —— 用户想找入口或安装包，不是想读文章`;
  } else if (NAV_RE.test(w) && nav >= 1) {
    verdict = '导航词';
    why = `词形即含「下载/官网/登录/入口」类后缀 —— 用户在找入口或安装包，不是想读文章`;
  } else if (big >= Math.ceil(n * 0.4)) {
    verdict = '平台垄断';
    why = `前 ${n} 名里高权重占位 ${big} 条（平台/百科/问答/政务）—— 新站权重打不过，能写但难排`;
  } else {
    verdict = '内容词';
    why = `内容型站点 ${media} 条、教程类标题 ${content} 条 —— 内容供给有空间`;
  }

  // 机会度：前 10 里内容型占位越少 → 说明内容供给不足 → 越有插入空间
  const contentSlots = media + (rows.filter((r) => CONTENT_RE.test(r.title) && !BIG_TYPES.has(r.type)).length);
  let chance;
  if (verdict !== '内容词') chance = '低';
  else if (contentSlots <= 2) chance = '高';
  else if (contentSlots <= 4) chance = '中';
  else chance = '低';

  return { verdict, why, chance, stats: { big, media, mkt, content, nav, vendor, platform: by('平台') + by('电商'), gov: by('政务') } };
}

// ---------------- 渲染 ----------------
const VERDICT_TAG = { '内容词': '✅ 可写', '商业词': '⛔ 别写', '导航词': '⛔ 别写', '平台垄断': '⚠️ 难打' };

function renderOne(r) {
  const L = [];
  const v = VERDICT_TAG[r.judge.verdict] || r.judge.verdict;
  L.push('');
  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  L.push('  词：' + r.word);
  L.push('  判定：' + v + '　｜　机会度：' + r.judge.chance);
  L.push('  依据：' + r.judge.why);
  if (r.demand) L.push('  需求侧：命中 ' + r.demand + ' 个引擎的下拉建议' + (r.column ? '　｜　栏目 ' + r.column : '') + (r.docs != null ? '　｜　站内已有 ' + r.docs + ' 篇' : ''));
  L.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const eng of r.engines) {
    const name = eng.engine === 'baidu' ? '百度' : 'Bing';
    if (eng.blocked) { L.push('  [' + name + '] ✗ 被拦 / 无结果' + (eng.error ? '（' + eng.error + '）' : '')); continue; }
    L.push('  [' + name + '] ' + eng.items.length + ' 条　' + (eng.ms / 1000).toFixed(1) + 's');
    for (const [i, it] of eng.items.entries()) {
      const host = hostOf(it.url) || '(未知)';
      const ty = typeOf(host, it.title);
      L.push('    ' + String(i + 1).padStart(2) + '. ' + host.padEnd(24) + ' [' + ty + '] ' + (it.title || '').slice(0, 56));
    }
  }
  return L.join('\n');
}

// ---------------- 缓存 ----------------
function loadCache() {
  if (NO_CACHE) return {};
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return {}; }
}
function saveCache(c) { try { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(CACHE_FILE, JSON.stringify(c), 'utf8'); } catch { /* ignore */ } }

// ---------------- 主流程 ----------------
function parseItems(raw) {
  return (raw.items || [])
    .map((it) => ({ url: it.url, title: it.title, host: hostOf(it.url) }))
    .filter((it) => it.host && !HOST_DROP.test(it.host))
    .slice(0, TOP)
    .map((it) => ({ ...it, type: typeOf(it.host, it.title) }));
}

async function checkWord(word, sess, cache) {
  // 词形预筛：这类词连抓都不用抓 —— 用户要的是入口/安装包，不是文章。
  if (WORD_NAV_RE.test(word)) {
    return {
      word, at: new Date().toISOString(), engines: [], prefiltered: true, cached: false,
      judge: {
        verdict: '导航词', chance: '低', stats: {},
        why: '词形即含「下载/官网/登录/入口」类后缀 —— 用户在找入口或安装包，不是想读文章',
      },
    };
  }
  const ck = 'v4:' + word;
  const hit = !NO_CACHE && cache[ck] && Date.now() - cache[ck].at < 24 * 3600 * 1000;
  // ★ --cached-only：只认缓存，没缓存就跳过（不启浏览器、不发请求）。
  //   用途：批量跑到一半 Chrome 崩了，先把已抓到的部分落盘成词表，不必从头再来。
  if (!hit && CACHED_ONLY) return null;
  let engines;
  let at;
  if (hit) {
    engines = cache[ck].engines;
    at = new Date(cache[ck].at).toISOString();
  } else {
    const raw = [];
    if (ENGINES.includes('bing')) raw.push(await bingSearch(sess, word));
    if (ENGINES.includes('baidu')) raw.push(await baiduSearch(sess, word));
    engines = raw.map((e) => ({ ...e, items: parseItems(e) }));
    at = new Date().toISOString();
    // ★ 缓存只存引擎原始结果，judge 每次现算 —— 判定规则改进后不必重新联网抓
    cache[ck] = { at: Date.now(), engines };
  }
  const all = [];
  for (const e of engines) for (const it of e.items) if (!all.some((x) => x.url === it.url)) all.push(it);
  return { word, at, engines, judge: judge(all, all.length, word), cached: hit };
}

async function main() {
  if (typeof WebSocket === 'undefined') throw new Error('需要 Node 18+（内置 WebSocket）。');

  // 收词
  let words = process.argv.slice(2).filter((a) => !a.startsWith('--') && !/^(baidu|bing|baidu,bing|zh|en)$/.test(a) && a.length >= 2);
  // 去掉被 --xxx 消费掉的值（如 --engine=bing 已带 =，--limit 12）
  words = words.filter((w, i) => {
    const prev = process.argv[process.argv.indexOf(w) - 1];
    return !(prev && prev.startsWith('--') && !prev.includes('='));
  });

  const demandMeta = {};
  if (FROM === 'demand') {
    if (!fs.existsSync(DEMAND_FILE)) throw new Error('需求层产物不存在：' + DEMAND_FILE + '（先跑 npm run demand）');
    const d = JSON.parse(fs.readFileSync(DEMAND_FILE, 'utf8'));
    const gaps = (d.gaps || []).filter((g) => (g.hits || 0) >= 2); // 三/双引擎共同建议
    const picked = gaps.slice(0, LIMIT).map((g) => g.word);
    words = words.concat(picked);
    for (const g of gaps.slice(0, LIMIT)) demandMeta[g.word] = { demand: g.hits, column: g.column, docs: g.docs };
    if (!DEEP && ENGINES.length > 1) {
      // 两个引擎都走 CDP，串行 ~30s/词。批量时收敛到单通道（默认百度：中文主战场）
      ENGINES.length = 0; ENGINES.push('baidu');
      console.log('· 批量模式收敛到百度单通道（--deep 才双通道；每词多约 9s）');
    }
  }
  words = [...new Set(words.filter(Boolean))];
  if (!words.length) {
    console.error('用法：node tools/serp-check.js "关键词" [...]  ｜  --from=demand --limit=12');
    process.exit(2);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const cache = loadCache();

  // 全被词形预筛掉时不必起 Chrome；--cached-only 也一律不起
  const needChrome = !CACHED_ONLY && ENGINES.length > 0 && words.some((w) => !WORD_NAV_RE.test(w));
  const sessions = [];
  if (needChrome) {
    // ★ 开跑前先清场：上次运行残留的 headless 实例会和本次一起抢内存，
    //   是「跑着跑着就崩、崩了再也起不来」的主要诱因。
    const leftover = killChromeHard();
    if (leftover) { console.log('· 清掉残留的浏览器进程 ' + leftover + ' 个'); await sleep(600); }
    const st = await ensureChrome();
    console.log('· Chrome ' + (st.reused ? '复用已有实例' : '已启动 (PID ' + st.pid + ')') + ' → CDP 9222 就绪');
    // ★ 并发 N 个 tab：百度单页加载 ~10–30s，串行体检几百个词要一个小时以上。
    //   每个 worker 独占一个 tab / session（同一 session 并发会互相踩导航）。
    for (let i = 0; i < CONC; i++) sessions.push(await newSession());
    console.log('· 并发 ' + sessions.length + ' 个标签页（每 ' + RECYCLE_EVERY + ' 词回收一次）');
  }

  console.log('\n=== SERP 竞品对标 · ' + words.length + ' 个词 · 通道 ' + ENGINES.join('+') + ' ===');
  const results = new Array(words.length);
  let cursor = 0;
  let done = 0;
  try {
    const workers = Math.max(1, Math.min(sessions.length || 1, words.length));
    await Promise.all(Array.from({ length: workers }, async (_, k) => {
      let sess = sessions[k] || null;
      let sinceRecycle = 0;
      for (;;) {
        const i = cursor++;
        if (i >= words.length) break;
        const w = words[i];
        // 单词语句级容错：浏览器崩了就硬重启后重试，不让整轮批量白跑
        let r = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            r = await checkWord(w, sess, cache);
            break;
          } catch (e) {
            const msg = String((e && e.message) || e);
            try { if (sess) await sess.close(); } catch { /* ignore */ }
            if (attempt === 3) { console.error('  ✗ ' + w + ' 失败（已重试 2 次）：' + msg.slice(0, 90)); break; }
            console.error('  ⚠ ' + w + ' 出错（' + msg.slice(0, 60) + '），恢复会话后重试…');
            try {
              // ★ 先轻后重（recoverSession）：浏览器还活着就只换标签页，真死了才硬重置。
              //   原来直接 ensureChrome() 会复用「端口还在答、其实已经残了」的实例 ——
              //   崩后剩下的词会 100% 失败。但反过来无脑硬重置会在并发下互杀，也不行。
              sess = await recoverSession();
              sessions[k] = sess;
            } catch (e2) { console.error('  ✗ 会话重建失败：' + String(e2.message).slice(0, 90)); break; }
          }
        }
        if (!r) continue;
        lightRecoveries = 0; // 抓到词说明浏览器确实健康 → 恢复阶梯归零
        const meta = demandMeta[w] || {};
        r.demand = meta.demand; r.column = meta.column; r.docs = meta.docs;
        results[i] = r;
        done++;
        // 每完成一个就落盘：批量跑上百个词要十几分钟，中途崩了不至于全丢
        saveCache(cache);
        console.log('  [' + done + '/' + words.length + '] ' + w + ' … ' +
          (r.prefiltered ? '词形预筛 ' : (r.cached ? '缓存 ' : '')) + VERDICT_TAG[r.judge.verdict] + ' / 机会' + r.judge.chance);
        // ★ 主动回收标签页（预防优于补救）：无头浏览器跑久了会退化，实测不回收时第 28 个词就崩。
        //   ⚠️ 只换标签页，**不要在这里重起整个浏览器** —— 3 个 worker 共享同一个浏览器，
        //   任一 worker 单方面重起都会把另外两个正在用的标签页一起干掉（自造故障）。
        //   浏览器真出问题时由上面的 recoverSession() 统一按「先轻后重 + 并发共享一次重启」处理。
        if (++sinceRecycle >= RECYCLE_EVERY) {
          sinceRecycle = 0;
          try { if (sess) await sess.close(); } catch { /* ignore */ }
          try {
            sess = await newSession();
            sessions[k] = sess;
          } catch (e) {
            console.error('  ⚠ 定期换页失败（下个词会走错误重试路径）：' + String(e.message).slice(0, 70));
          }
        }
      }
    }));
  } finally {
    for (const s of sessions) await s.close();
    if (needChrome) killOwnChrome(); // 用完就收，不留后台进程
  }
  saveCache(cache);

  // ---- 报告 ----
  const R = results.filter(Boolean); // 失败/跳过的词会是空洞，剔掉
  if (R.length < words.length) {
    console.log('\n⚠ 有 ' + (words.length - R.length) + ' 个词未取到结果（浏览器异常或超时），已在缓存里跳过——重跑会自动补上。');
  }
  const printFull = R.length <= 3;
  if (printFull) {
    for (const r of R) console.log(renderOne(r));
  } else {
    console.log('\n--- 批量结果（详情见 JSON）---');
    for (const r of R) {
      console.log('  ' + (VERDICT_TAG[r.judge.verdict] || r.judge.verdict).padEnd(8) +
        ' 机会' + r.judge.chance + '  ' + r.word +
        (r.demand ? '  ★' + r.demand : ''));
    }
  }

  // 分组小结
  const g = { '内容词': [], '商业词': [], '导航词': [], '平台垄断': [] };
  for (const r of R) (g[r.judge.verdict] || (g[r.judge.verdict] = [])).push(r.word);
  console.log('\n=== 分流小结 ===');
  console.log('  ✅ 可写（内容词）: ' + (g['内容词'].length ? g['内容词'].join(' / ') : '（无）'));
  console.log('  ⛔ 别写（商业词）: ' + (g['商业词'].length ? g['商业词'].join(' / ') : '（无）'));
  console.log('  ⛔ 别写（导航词）: ' + (g['导航词'].length ? g['导航词'].join(' / ') : '（无）'));
  console.log('  ⚠️ 难打（平台垄断）: ' + (g['平台垄断'].length ? g['平台垄断'].join(' / ') : '（无）'));

  const outFile = JSON_OUT || path.join(OUT_DIR, new Date().toISOString().slice(0, 10) + '.json');
  const payload = { at: new Date().toISOString(), engines: ENGINES, top: TOP, results: R };
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'latest.json'), JSON.stringify(payload, null, 2), 'utf8');
  console.log('\n产物：' + outFile);
  console.log('      ' + path.join(OUT_DIR, 'latest.json'));
}

if (require.main === module) {
  main().catch((e) => { console.error('[serp-check] ' + (e.message || e)); process.exit(1); });
}

module.exports = { judge, typeOf, hostOf, parseItems, HOST_TYPES, MKT_RE, CONTENT_RE };
