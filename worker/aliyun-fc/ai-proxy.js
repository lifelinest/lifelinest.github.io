/**
 * Live2D AI 对话安全代理 —— 阿里云函数计算（FC）Web 函数版
 * 替代原 Cloudflare Worker 版本（workers.dev 在国内被墙，无法访问）
 *
 * 运行形态：FC 3.0「Web 函数 / 自定义运行时 Node.js」
 * 本文件即一个标准 Node.js HTTP Server，FC 网关将请求转发到监听端口。
 *
 * 职责（与原版一致）：
 *   1. 密钥隔离 —— DeepSeek Key 仅存于 FC 环境变量，客户端永不接触
 *   2. CORS 白名单 —— 仅允许博客域名调用
 *   3. 参数锁定 —— 模型固定、消息数量与长度截断
 *   4. SSE 透传 —— 保持流式回复体验
 *
 * ============================================================
 * 部署配置（FC 3.0 控制台）：
 *   - 地域：华东1（杭州）cn-hangzhou 等均可
 *   - 运行环境：自定义运行时 / Node.js 20
 *   - 代码上传：本文件打成 ZIP（ai-proxy-deploy.zip）
 *   - 启动命令：node ai-proxy.js
 *   - 监听端口：9000
 *   - 执行超时时间：建议 120 秒（流式回复需较长超时）
 *   - 环境变量：DEEPSEEK_API_KEY = 你的 DeepSeek 密钥
 *   - 创建后复制「函数 URL」，配置到前端
 *     source/js/live2d-chat.js 的 CONFIG.proxyEndpoint
 * ============================================================
 */
const http = require('node:http');
const { Readable } = require('node:stream');

// ======================== 配置区 ========================

// 生产环境域名（博客线上地址）
const ALLOWED_ORIGIN_PROD = 'https://lifelinest.github.io';
// 本地开发域名（按需增删）
const ALLOWED_DEV_ORIGINS = [
  'http://localhost:4000',
  'http://localhost:4002',
  'http://127.0.0.1:4000',
  'http://127.0.0.1:4002',
];

// 单 IP 每分钟限流次数（内存级，多实例并发时计数可能不精确）
const LIMIT_PER_MINUTE = 6;

// ======================== 限流（内存滑动窗口） ========================
const rateStore = new Map(); // ip -> { windowStart, count }

function checkRateLimit(ip) {
  const now = Date.now();
  const winMs = 60 * 1000;
  const rec = rateStore.get(ip);
  if (!rec || now - rec.windowStart > winMs) {
    rateStore.set(ip, { windowStart: now, count: 1 });
    // 防止 Map 无限膨胀：偶发清理过期条目
    if (rateStore.size > 1000) {
      for (const [k, v] of rateStore) {
        if (now - v.windowStart > winMs) rateStore.delete(k);
      }
    }
    return true;
  }
  rec.count += 1;
  return rec.count <= LIMIT_PER_MINUTE;
}

// ======================== 工具函数 ========================

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_DEV_ORIGINS.includes(origin)) return true;
  return origin === ALLOWED_ORIGIN_PROD;
}

function getAllowedOrigin(req) {
  const origin = req.headers.origin || '';
  return isAllowedOrigin(origin) ? origin : ALLOWED_ORIGIN_PROD;
}

/** 读取请求体（限制大小，防超大 payload） */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  // 限制消息数量，防止超大 payload
  const limited = messages.slice(-16);
  return limited
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'system'))
    .map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content.slice(0, 4000) : '',
    }));
}

function parseUpstreamError(status, body) {
  try {
    const j = JSON.parse(body);
    if (j.error && j.error.message) return j.error.message;
  } catch (_) {}
  if (status === 401) return '上游密钥异常，请联系博主';
  if (status === 429) return '上游额度不足，请稍后再试';
  return `上游错误（${status}）`;
}

function sendJson(res, data, status, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

// ======================== HTTP 服务 ========================

const server = http.createServer(async (req, res) => {
  try {
    const corsHeaders = {
      'Access-Control-Allow-Origin': getAllowedOrigin(req),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    // 1. CORS 预检
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    // 2. 仅允许 POST
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method Not Allowed' }, 405, corsHeaders);
      return;
    }

    // 3. Origin 白名单校验（阻止非博客站点调用）
    const origin = req.headers.origin || '';
    if (!isAllowedOrigin(origin)) {
      sendJson(res, { error: 'Forbidden Origin' }, 403, corsHeaders);
      return;
    }

    // 4. 限流
    const clientIP = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
    if (!checkRateLimit(clientIP)) {
      sendJson(res, { error: '请求过于频繁，请稍后再试', retryAfter: 60 }, 429, corsHeaders);
      return;
    }

    // 5. 解析并校验请求体
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (_) {
      sendJson(res, { error: 'Invalid JSON' }, 400, corsHeaders);
      return;
    }

    // 6. 参数白名单过滤（锁定模型，防篡改）
    const temperature = Math.min(Math.max(Number(body.temperature) || 0.6, 0), 1);
    const sanitizedBody = {
      model: 'deepseek-chat',
      messages: sanitizeMessages(body.messages),
      stream: true,
      temperature,
    };

    // 7. 调用 DeepSeek（密钥仅从环境变量读取，永不下发）
    try {
      const upstream = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + process.env.DEEPSEEK_API_KEY,
        },
        body: JSON.stringify(sanitizedBody),
      });

      // 8. 上游错误处理
      if (!upstream.ok) {
        const errText = await upstream.text();
        console.error('[ai-proxy] DeepSeek error:', upstream.status, errText);
        sendJson(res, { error: parseUpstreamError(upstream.status, errText) }, upstream.status, corsHeaders);
        return;
      }

      // 9. SSE 流式透传（保持流式体验不变）
      res.writeHead(200, {
        ...corsHeaders,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      Readable.fromWeb(upstream.body).pipe(res);
      // 等流式响应结束（res 'finish'/'close'），再返回给运行时
      await new Promise((resolve) => {
        res.on('finish', resolve);
        res.on('close', resolve);
        res.on('error', resolve);
      });
    } catch (err) {
      console.error('[ai-proxy] fetch failed:', err.message);
      if (!res.headersSent) {
        sendJson(res, { error: '上游服务不可用' }, 502, corsHeaders);
      } else {
        res.end();
      }
    }
  } catch (err) {
    console.error('[ai-proxy] handler error:', err.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '内部错误' }));
    } else {
      res.end();
    }
  }
});

// 监听 FC 注入的端口；未注入时回退到 9000（与控制台「监听端口」保持一致）
const port = Number(process.env.FC_SERVER_PORT || process.env.PORT || 9000);
server.listen(port, '0.0.0.0', () => {
  console.log(`[ai-proxy] listening on port ${port}`);
});
