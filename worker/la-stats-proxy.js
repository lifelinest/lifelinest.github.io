/**
 * 51.la 统计 API 安全代理
 * 部署于 Cloudflare Workers
 *
 * 用途：为关于页「阅读排行」+「访客地图」提供数据，弥补百度统计 API 需 PV>100 的门槛
 *
 * 职责：
 *   1. 密钥隔离 —— 51.la accessKey/secretKey 仅存于 Worker Secret
 *   2. 签名计算 —— 在 Worker 内完成 SHA256 签名，客户端无需感知
 *   3. CORS 白名单 —— 仅允许博客域名调用
 *   4. 频率限流 —— 单 IP 10次/分钟 + 200次/天
 *   5. 数据裁剪 —— 仅返回前端所需字段，过滤非文章页
 *   6. 数据聚合 —— 访客地图通过聚合多日访问明细得到省份分布
 *
 * 路由：
 *   GET /health                       健康检查
 *   GET /hot-articles?limit=10        热门文章排行（按 PV 倒序）
 *   GET /visitor-map                  访客省份分布（用于中国地图渲染）
 *
 * ===========================================================================
 *  部署 / 凭证获取完整流程
 * ===========================================================================
 *
 *  ① 注册 51.la 账号：https://www.51.la/  用手机号/邮箱注册
 *
 *  ② 添加站点：登录后「我的统计 → 添加网站」
 *     - 网站域名：lifelinest.github.io
 *     - 网站首页：https://lifelinest.github.io
 *     - 创建后获取「统计 ID」和跟踪代码（一段 <script>）
 *
 *  ③ 安装跟踪代码：把跟踪代码填入 _config.anzhiyu.yml 的 inject.head
 *     （我会自动帮你加入占位，你只需替换 ID）
 *
 *  ④ 申请 OpenAPI：在「我的统计 → 开放平台 API」页申请开通
 *     - 开通后系统会生成 accessKey（用户标识）和 secretKey（密钥）
 *     - maskId：在站点详情页 URL 中可见，或调用 /open/site/list 获取
 *
 *  ⑤ 部署 Worker：
 *     cd worker
 *     powershell -ExecutionPolicy Bypass -File deploy-la-stats.ps1
 *     # 或手动执行：
 *     npx wrangler kv namespace create LA_STATS_KV        # 把返回的 id 填入 wrangler-la.toml
 *     npx wrangler secret put LA_ACCESS_KEY
 *     npx wrangler secret put LA_SECRET_KEY
 *     npx wrangler secret put LA_MASK_ID
 *     npx wrangler deploy -c wrangler-la.toml
 *
 *  ⑥ 把部署后的 Worker URL 写入 _config.anzhiyu.yml 的 inject.head：
 *     - <script>window.__LA_STATS_PROXY__='https://your-worker.workers.dev';</script>
 *
 *  ⑦ 重启 hexo server，访问 /about/ 滚动到「阅读排行」「访客地图」验证
 *
 *  51.la API 文档：https://v6.51.la/doc/
 *  免费额度：1000 次/天（足够，因为 Worker 缓存 30 分钟）
 */

const LA_API_BASE = 'https://v6-open.51.la/open';

// KV 缓存 30 分钟（减少 51.la API 调用次数）
const DATA_CACHE_TTL = 30 * 60;

// 站点过滤：过滤掉非文章页面
const FILTER_PATTERNS = [
  /localhost/i,
  /^\/tags?\/?/i,
  /^\/categories\/?/i,
  /^\/archives\/?/i,
  /^\/about\/?/i,
  /^\/link\/?/i,
  /^\/music\/?/i,
  /^\/albums?\/?/i,
  /^\/essay\/?/i,
  /^\/equipment\/?/i,
  /^\/update\/?/i,
  /^\/todolist\/?/i,
  /^\/privacy\/?/i,
  /^\/docs\/?/i,
  /^\/charts\/?/i,
  /^\/dailyPhoto\/?/i,
  /^\/wordScenery\/?/i,
  /^\/FootprintMap\/?/i,
  /^\/air-conditioner\/?/i,
];

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': getAllowedOrigin(request),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'GET') {
      return json({ error: 'Method Not Allowed' }, 405, corsHeaders);
    }

    const origin = request.headers.get('Origin') || '';
    if (!isAllowedOrigin(origin)) {
      await logAnomaly(env, 'bad_origin', origin, request.headers.get('CF-Connecting-IP') || '');
      return json({ error: 'Forbidden Origin' }, 403, corsHeaders);
    }

    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateLimitResult = await checkRateLimit(env, clientIP, ctx);
    if (!rateLimitResult.allowed) {
      return json(
        { error: '请求过于频繁，请稍后再试', retryAfter: rateLimitResult.retryAfter },
        429,
        { ...corsHeaders, 'Retry-After': String(rateLimitResult.retryAfter) }
      );
    }

    if (!env.LA_ACCESS_KEY || !env.LA_SECRET_KEY || !env.LA_MASK_ID) {
      console.error('[la-stats] missing secrets: LA_ACCESS_KEY/SECRET_KEY/MASK_ID');
      return json({ error: '服务未配置，请联系博主' }, 503, corsHeaders);
    }

    const url = new URL(request.url);
    try {
      switch (url.pathname) {
        case '/health':
          return json({ status: 'ok', time: new Date().toISOString() }, 200, corsHeaders);

        case '/stats': {
          const data = await getStatsOverview(env);
          return json({ code: 0, data }, 200, corsHeaders);
        }

        case '/hot-articles': {
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10) || 10, 20);
          const data = await getHotArticles(env, limit);
          return json({ code: 0, data }, 200, corsHeaders);
        }

        case '/visitor-map': {
          const data = await getVisitorMap(env);
          return json({ code: 0, data }, 200, corsHeaders);
        }

        default:
          return json({ error: 'Not Found' }, 404, corsHeaders);
      }
    } catch (err) {
      console.error('[la-stats] handler error:', err.message, err.stack);
      return json({ error: '服务器内部错误', detail: err.message }, 500, corsHeaders);
    }
  },
};

// ======================== 业务接口 ========================

/**
 * 热门文章排行
 * 调用 51.la 受访页数据接口，按 PV 倒序返回前 limit 条
 * 过滤掉 localhost / 标签 / 分类等非文章页
 */
async function getHotArticles(env, limit) {
  const today = new Date();
  const end = formatDateDash(today);
  const start = formatDateDash(new Date(today.getTime() - 89 * 24 * 60 * 60 * 1000));

  // 优先读 KV 缓存
  const cacheKey = `hot:${start}:${end}:${limit}`;
  const cached = await kvGetJson(env.LA_STATS_KV, cacheKey);
  if (cached) {
    console.info('[la-stats] hot-articles cache hit');
    return cached;
  }

  // 拉取受访页数据（每页 50 条，取前 2 页=100 条足够 top10 过滤后还剩 10 条）
  const allItems = [];
  for (let page = 1; page <= 2; page++) {
    const result = await callLaApi(env, '/content/listInterview', {
      startDay: start,
      endDay: end,
      page,
      size: 50,
    });
    if (!result || !result.data || !result.data.length) break;
    allItems.push(...result.data);
    if (allItems.length >= (result.total || 0)) break;
  }

  // 过滤 + 排序
  const list = [];
  for (const item of allItems) {
    const title = item.title || '';
    const url = item.url || item.path || '';
    if (!title || !url) continue;
    if (FILTER_PATTERNS.some(p => p.test(url))) continue;
    list.push({
      title,
      url,
      pv: parseInt(item.pv, 10) || 0,
      uv: parseInt(item.uv, 10) || 0,
    });
  }

  list.sort((a, b) => b.pv - a.pv);
  const result = list.slice(0, limit);

  // 写缓存
  await kvSetJson(env.LA_STATS_KV, cacheKey, result, DATA_CACHE_TTL);
  return result;
}

/**
 * 访客省份分布（用于中国地图渲染）
 * 51.la 没有独立的地域聚合端点，通过拉取最近 3 天的访问明细并在 Worker 内聚合得到
 *
 * 调用 /visitor/detail/list（基于会话），单日单页 100 条
 * 3 天 × 1 页 = 3 次 API 调用，聚合后省份分布足够准确
 */
async function getVisitorMap(env) {
  const today = new Date();
  const days = [];
  for (let i = 0; i < 3; i++) {
    days.push(formatDateDash(new Date(today.getTime() - i * 24 * 60 * 60 * 1000)));
  }

  const cacheKey = `map:${days.join(',')}`;
  const cached = await kvGetJson(env.LA_STATS_KV, cacheKey);
  if (cached) {
    console.info('[la-stats] visitor-map cache hit');
    return cached;
  }

  // 聚合省份 PV/UV
  const regionMap = new Map();

  for (const day of days) {
    let page = 1;
    let total = Infinity;
    while (page <= 5 && (page - 1) * 100 < total) {
      const result = await callLaApi(env, '/visitor/detail/list', {
        day,
        page,
        size: 100,
      });
      if (!result || !result.data || !result.data.length) break;
      total = result.total || 0;

      for (const v of result.data) {
        const region = normalizeRegion(v.region || v.province || '');
        if (!region) continue;
        const cur = regionMap.get(region) || { name: region, value: 0, uv: 0 };
        cur.value += 1; // 每条记录代表一次会话
        cur.uv += 1;
        regionMap.set(region, cur);
      }

      page++;
      if (page * 100 >= total) break;
    }
  }

  const list = Array.from(regionMap.values());
  list.sort((a, b) => b.value - a.value);

  await kvSetJson(env.LA_STATS_KV, cacheKey, list, DATA_CACHE_TTL);
  return list;
}

/**
 * 站点流量概况（今日/昨日/本月/总访问量）
 * 用于 about 页面「访问统计」卡片
 */
async function getStatsOverview(env) {
  const now = new Date();
  const today = formatDateDash(now);
  const yesterday = formatDateDash(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const monthStart = formatDateDash(new Date(now.getFullYear(), now.getMonth(), 1));

  const cacheKey = `stats:${today}`;
  const cached = await kvGetJson(env.LA_STATS_KV, cacheKey);
  if (cached) {
    console.info('[la-stats] stats cache hit');
    return cached;
  }

  const [todayData, yesterdayData, monthData, totalData] = await Promise.all([
    fetchTraffic(env, today, today),
    fetchTraffic(env, yesterday, yesterday),
    fetchTraffic(env, monthStart, today),
    fetchTraffic(env, '2020-01-01', today),
  ]);

  const result = {
    todayPV: todayData?.pv || 0,
    todayUV: todayData?.uv || 0,
    yesterdayPV: yesterdayData?.pv || 0,
    yesterdayUV: yesterdayData?.uv || 0,
    monthPV: monthData?.pv || 0,
    totalPV: totalData?.pv || 0,
  };

  await kvSetJson(env.LA_STATS_KV, cacheKey, result, 10 * 60);
  return result;
}

async function fetchTraffic(env, startDay, endDay) {
  try {
    const result = await callLaApi(env, '/report/traffic', {
      startDay,
      endDay,
      type: 'day',
    });
    if (result && result.data && result.data.length > 0) {
      let pv = 0, uv = 0;
      for (const item of result.data) {
        pv += parseInt(item.pv || item.visitCount || 0, 10);
        uv += parseInt(item.uv || item.visitorCount || 0, 10);
      }
      return { pv, uv };
    }
    return { pv: 0, uv: 0 };
  } catch (e) {
    console.warn('[la-stats] fetchTraffic failed for', startDay, endDay, e.message);
    return { pv: 0, uv: 0 };
  }
}

// ======================== 51.la API 调用 ========================

/**
 * 调用 51.la v6 OpenAPI
 * 自动完成签名计算
 */
async function callLaApi(env, path, extra = {}) {
  if (!env.LA_ACCESS_KEY || !env.LA_SECRET_KEY) {
    throw new Error('Worker missing LA_ACCESS_KEY/LA_SECRET_KEY');
  }

  const accessKey = env.LA_ACCESS_KEY;
  const secretKey = env.LA_SECRET_KEY;
  const nonce = genNonce();
  const timestamp = String(Date.now());

  // 签名：参数按字典序拼接（accessKey, nonce, secretKey, timestamp）后 SHA256HEX 大写
  const signStr = `accessKey=${accessKey}&nonce=${nonce}&secretKey=${secretKey}&timestamp=${timestamp}`;
  const sign = (await sha256Hex(signStr)).toUpperCase();

  const body = {
    accessKey,
    nonce,
    timestamp,
    sign,
    maskId: env.LA_MASK_ID,
    ...extra,
  };

  const res = await fetch(`${LA_API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error('[la-stats] API error:', res.status, text.slice(0, 300));
    throw new Error(`51.la 接口返回 ${res.status}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    console.error('[la-stats] JSON parse failed:', text.slice(0, 300));
    throw new Error('51.la 返回非 JSON 数据');
  }
}

// ======================== 工具函数 ========================

function formatDateDash(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 规整 51.la 返回的地域字段
 * - "中国 广东" → "广东"
 * - "广东" → "广东"
 * - "中国" → ""（国家级别忽略，不绘制到中国地图上）
 * - "印度" → ""（海外忽略，地图只画中国）
 */
function normalizeRegion(name) {
  if (!name) return '';
  name = String(name).trim();
  if (!name) return '';

  // 去掉国家前缀
  if (name.startsWith('中国')) {
    name = name.slice(2).trim();
  }

  // 海外国家直接忽略（只画中国地图）
  const provinces = ['北京', '天津', '上海', '重庆', '河北', '山西', '辽宁', '吉林',
    '黑龙江', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南',
    '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海', '台湾',
    '内蒙古', '广西', '西藏', '宁夏', '新疆', '香港', '澳门'];
  for (const p of provinces) {
    if (name.startsWith(p) || name === p) {
      return p;
    }
  }

  // 未知或海外
  return '';
}

function genNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function kvGetJson(kv, key) {
  if (!kv) return null;
  const v = await kv.get(key);
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}

async function kvSetJson(kv, key, value, ttl) {
  if (!kv) return;
  await kv.put(key, JSON.stringify(value), { expirationTtl: ttl });
}

// ======================== 安全/限流 ========================

const ALLOWED_ORIGIN_PROD = 'https://lifelinest.github.io';
const ALLOWED_DEV_ORIGINS = [
  'http://localhost:4000',
  'http://localhost:4001',
  'http://localhost:4002',
  'http://127.0.0.1:4000',
  'http://127.0.0.1:4001',
  'http://127.0.0.1:4002',
];

const LIMIT_PER_MINUTE = 10;
const LIMIT_PER_DAY = 200;

function getAllowedOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  return isAllowedOrigin(origin) ? origin : ALLOWED_ORIGIN_PROD;
}

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_DEV_ORIGINS.includes(origin)) return true;
  return origin === ALLOWED_ORIGIN_PROD;
}

async function checkRateLimit(env, ip, ctx) {
  if (!env.RATE_LIMIT_KV) return { allowed: true };

  const now = Date.now();
  const minuteKey = `lal:${ip}:m:${Math.floor(now / 60000)}`;
  const dayKey = `lal:${ip}:d:${new Date().toISOString().slice(0, 10)}`;

  const [minuteCount, dayCount] = await Promise.all([
    kvGetInt(env.RATE_LIMIT_KV, minuteKey),
    kvGetInt(env.RATE_LIMIT_KV, dayKey),
  ]);

  if (minuteCount >= LIMIT_PER_MINUTE) {
    return { allowed: false, retryAfter: 60 };
  }
  if (dayCount >= LIMIT_PER_DAY) {
    return { allowed: false, retryAfter: 3600 };
  }

  ctx.waitUntil(Promise.all([
    env.RATE_LIMIT_KV.put(minuteKey, String(minuteCount + 1), { expirationTtl: 120 }),
    env.RATE_LIMIT_KV.put(dayKey, String(dayCount + 1), { expirationTtl: 90000 }),
  ]));

  return { allowed: true };
}

async function kvGetInt(kv, key) {
  const v = await kv.get(key);
  return parseInt(v || '0', 10) || 0;
}

async function logAnomaly(env, type, ipOrOrigin, value) {
  if (!env.RATE_LIMIT_KV) return;
  const key = `anomaly:la:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  await env.RATE_LIMIT_KV.put(key, JSON.stringify({
    type,
    src: ipOrOrigin,
    value,
    time: new Date().toISOString(),
  }), { expirationTtl: 604800 });
  console.warn('[la-stats] ANOMALY:', type, ipOrOrigin, value);
}

function json(data, status, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
