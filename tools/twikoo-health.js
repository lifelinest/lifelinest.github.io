#!/usr/bin/env node
/**
 * Twikoo 评论后端可用性巡检
 * ------------------------------------------------------------------
 * 作用：逐个探测 _config.anzhiyu.yml 里配置的 Twikoo 端点（主 + 备用），
 *       提前发现「后端不可达导致评论全挂」的问题，而不是等访客来反馈。
 *       探测方式与前端一致：POST {"event":"GET_CONFIG"}，非 200 / 非 JSON /
 *       带 code 的错误响应都判定为不可用。
 *
 * 用法：
 *   node tools/twikoo-health.js                    # 巡检配置里的全部端点
 *   node tools/twikoo-health.js --url https://x    # 只测指定端点（可重复传）
 *   node tools/twikoo-health.js --timeout 8000     # 单端点超时（毫秒，默认 8000）
 *
 * 退出码：0 = 至少一个端点可用；1 = 全部不可达（便于挂 CI / 定时任务报警）
 *
 * 放在 tools/ 而不是 scripts/ 的原因同 indexnow-push.js：scripts/ 会被 hexo
 * 当插件加载，带 shebang 的脚本会让每次构建报错。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const THEME_CONFIG = path.join(ROOT, '_config.anzhiyu.yml');
const DEFAULT_TIMEOUT = 8000;

// ---------------------------------------------------------------- 参数解析
const argv = process.argv.slice(2);
const argOf = (flag, def) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const argAll = (flag) => {
  const out = [];
  argv.forEach((a, i) => {
    if (a === flag && argv[i + 1]) out.push(argv[i + 1]);
  });
  return out;
};

const TIMEOUT = Number(argOf('--timeout', DEFAULT_TIMEOUT)) || DEFAULT_TIMEOUT;
const CLI_URLS = argAll('--url');

// ---------------------------------------------------------------- 读取端点
function readEndpoints() {
  if (!fs.existsSync(THEME_CONFIG)) throw new Error('找不到 ' + THEME_CONFIG);
  const lines = fs.readFileSync(THEME_CONFIG, 'utf8').split('\n');

  const start = lines.findIndex((l) => /^twikoo:\s*$/.test(l));
  if (start < 0) throw new Error('_config.anzhiyu.yml 里找不到 twikoo 配置块');

  const block = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() && !/^\s/.test(line)) break; // 下一个顶级键，结束
    block.push(line);
  }

  const clean = (v) => v.replace(/^["']|["']$/g, '').trim();
  const endpoints = [];

  const main = block.join('\n').match(/^\s+envId:\s*(\S+)\s*$/m);
  if (main) endpoints.push(clean(main[1]));

  const backupIdx = block.findIndex((l) => /^\s+envIdBackup:\s*/.test(l));
  if (backupIdx >= 0) {
    const inline = block[backupIdx].split(':').slice(1).join(':').trim();
    if (inline && inline !== '[]') {
      inline
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map(clean)
        .filter(Boolean)
        .forEach((u) => endpoints.push(u));
    }
    for (let i = backupIdx + 1; i < block.length; i++) {
      const item = block[i].match(/^\s*-\s*(\S+)\s*$/);
      if (!item) break;
      endpoints.push(clean(item[1]));
    }
  }

  return endpoints.filter(Boolean);
}

// ---------------------------------------------------------------- 端点探测
async function probe(envId) {
  // 腾讯云 CloudBase 的 envId 不是 URL，需要浏览器侧验证，这里跳过
  if (!/^https?:\/\//i.test(envId)) {
    return { envId, ok: false, skipped: true, reason: '不是 URL（腾讯云 envId 只能在前端验证）' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  const startedAt = Date.now();

  try {
    const res = await fetch(envId.replace(/\/+$/, ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'GET_CONFIG' }),
      signal: controller.signal
    });
    const cost = Date.now() - startedAt;

    if (!res.ok) return { envId, ok: false, cost, reason: 'HTTP ' + res.status };

    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') {
      return { envId, ok: false, cost, reason: '响应不是 JSON（部署可能未完成，或被平台保护页拦截）' };
    }
    if (data.code) {
      return { envId, ok: false, cost, reason: '返回错误码 ' + data.code + (data.message ? '：' + data.message : '') };
    }

    const cfg = data.config || data;
    return { envId, ok: true, cost, version: cfg.VERSION || '', commentCount: cfg.COMMENT_COUNT };
  } catch (e) {
    return {
      envId,
      ok: false,
      cost: Date.now() - startedAt,
      reason: e.name === 'AbortError' ? '超时（>' + TIMEOUT + 'ms）' : e.message
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- 主流程
async function main() {
  const endpoints = CLI_URLS.length ? CLI_URLS : readEndpoints();

  console.log('');
  console.log('Twikoo 评论后端巡检');
  console.log('==================================================');
  console.log('端点数量  : ' + endpoints.length);
  console.log('超时阈值  : ' + TIMEOUT + 'ms');
  console.log('');

  if (!endpoints.length) {
    console.log('❌ 没有读到任何端点，请检查 _config.anzhiyu.yml 的 twikoo.envId');
    process.exit(1);
  }

  const results = [];
  for (const envId of endpoints) {
    const r = await probe(envId);
    results.push(r);
    const status = r.ok ? '✅ 可用' : r.skipped ? '⏭  跳过' : '❌ 不可用';
    console.log(status + '  ' + envId);
    if (r.cost !== undefined) console.log('        耗时 ' + r.cost + 'ms' + (r.version ? '，云函数版本 ' + r.version : ''));
    if (!r.ok && r.reason) console.log('        原因 ' + r.reason);
    console.log('');
  }

  const alive = results.filter((r) => r.ok);
  if (alive.length) {
    console.log('结论：' + alive.length + '/' + endpoints.length + ' 个端点可用，首个可用端点为');
    console.log('      ' + alive[0].envId);
    console.log('');
    process.exit(0);
  }

  console.log('结论：所有端点均不可达，评论系统当前不可用。');
  console.log('      · 若用的是 Vercel 默认域名：*.vercel.app 在中国大陆常不可达，');
  console.log('        建议绑定自有域名，或迁移到 Netlify / 腾讯云 CloudBase 后填入 envIdBackup。');
  console.log('      · 也可在 Vercel 后台检查 Deployment Protection 是否被开启（会导致全部请求 401）。');
  console.log('');
  process.exit(1);
}

main().catch((e) => {
  console.error('巡检失败：' + e.message);
  process.exit(1);
});
