/**
 * 51.la 统计公共模块
 * 挂载到 window.anzhiyu 全局对象
 * 供侧边栏（全站）和关于页（/about/）共用同一数据源
 */
(function () {
  if (typeof window.anzhiyu === 'undefined') {
    window.anzhiyu = {};
  }
  const LA = window.anzhiyu;

  // ========= 配置 =========
  // 数据来源：自建 Cloudflare Worker 代理（la-stats-proxy），走 51.la OpenAPI。
  // 原官方挂件 v6-widget.51.la 的阿里云 OSS 端点已停服，故统一改走 Worker。
  // ⚠️ 必须与 worker/wrangler-la.toml 的 routes 域名保持一致。
  const PROXY_BASE = 'https://stats.mfy-lifeline.com';

  // 缓存：同一次页面生命周期内只请求一次
  let cachedPromise = null;

  // ========= 内部：Worker 代理（/stats 返回 51.la 站点统计） =========
  // Worker 返回的 data 字段结构：
  //   { todayUV, todayPV, yesterdayUV, yesterdayPV, monthPV, totalPV }
  function fetchFromWorker() {
    return fetch(PROXY_BASE + '/stats', { credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('Worker HTTP ' + res.status);
        return res.json();
      })
      .then(function (j) {
        if (!j || j.code !== 0 || !j.data) {
          throw new Error('Worker data error: ' + ((j && j.error) || 'unknown'));
        }
        const d = j.data;
        return {
          todayUV: d.todayUV || 0,
          todayPV: d.todayPV || 0,
          yesterdayUV: d.yesterdayUV || 0,
          yesterdayPV: d.yesterdayPV || 0,
          monthPV: d.monthPV || 0,
          totalPV: d.totalPV || 0,
        };
      });
  }

  // ========= 公共：获取全站统计对象（带缓存） =========
  function fetchSiteStats() {
    if (cachedPromise) return cachedPromise;
    cachedPromise = fetchFromWorker().catch(function (e) {
      console.info('[LA Stats] Widget failed:', e && e.message);
      cachedPromise = null; // 失败不缓存，下次可重试
      throw e;
    });
    return cachedPromise;
  }

  // ========= 公共：侧边栏数字格式化 =========
  function formatNumber(n) {
    if (typeof n !== 'number') n = 0;
    return n.toLocaleString ? n.toLocaleString('zh-CN') : String(n);
  }

  // ========= 公共：填充侧边栏（#la-site-month-pv 当月访问量 / #la-site-total-pv 总访问量） =========
  // 重要：严格按 51.la 实际返回的数据显示，不做任何伪造/叠加，确保与后台一致
  function fillSidebar() {
    const monthEl = document.getElementById('la-site-month-pv');
    const totalEl = document.getElementById('la-site-total-pv');
    if (!monthEl && !totalEl) return;

    return fetchSiteStats()
      .then(function (s) {
        // 当月访问量：51.la 提供本月 PV，真实显示（与关于页“本月访问”同源）
        if (monthEl) {
          monthEl.innerHTML = formatNumber(s.monthPV);
        }
        // 总访问量：51.la 提供累计 PV，真实显示
        if (totalEl) {
          totalEl.innerHTML = formatNumber(s.totalPV);
        }
      })
      .catch(function () {
        if (monthEl) monthEl.innerHTML = '<span style="opacity:.6">--</span>';
        if (totalEl) totalEl.innerHTML = '<span style="opacity:.6">--</span>';
      });
  }

  // ========= 公共：给 about.pug 返回与原有 dataArray 兼容的数组 =========
  // [0=最近活跃(占位), 今日UV, 今日PV, 昨日UV, 昨日PV, 本月PV, 总PV]
  function fetchAboutStatsArray() {
    return fetchSiteStats().then(function (s) {
      return [0, s.todayUV, s.todayPV, s.yesterdayUV, s.yesterdayPV, s.monthPV, s.totalPV];
    });
  }

  // ========= 公共：全站访问足迹记录（成就墙「访客成就」的数据源） =========
  // 仅在本机 localStorage 里记录"到访过某类页面"，无任何网络上报。
  // 键名约定：lifeAch.<成就key> = 解锁时间戳(ms)，成就墙页面（/life/）读取展示
  const ACH_KEY_PREFIX = 'lifeAch.';
  const ACH_PATH_RULES = [
    // [成就key, 页面路径特征]
    ['archives', /^\/archives/], // 考古学家：逛过文章隧道
    ['comments', /^\/comments/], // 会客使者：到访过留言板
    ['post', /^\/posts\//],      // 博览群书：读过任意一篇文章
  ];
  function markAchievement(key) {
    try {
      if (!localStorage.getItem(ACH_KEY_PREFIX + key)) {
        localStorage.setItem(ACH_KEY_PREFIX + key, String(Date.now()));
      }
    } catch (e) { /* localStorage 不可用时静默跳过 */ }
  }
  function trackVisitFlags() {
    const path = decodeURIComponent(location.pathname || '/');
    ACH_PATH_RULES.forEach(function (rule) {
      if (rule[1].test(path)) markAchievement(rule[0]);
    });
  }
  // 供其他页面脚本（工具箱/技能树）记录自定义成就
  LA.markAchievement = markAchievement;

  // ========= 暴露到全局 =========
  LA.fetchLaStats = fetchSiteStats;
  LA.fetchLaStatsAboutArray = fetchAboutStatsArray;
  LA.fillLaSidebar = fillSidebar;

  // ========= 自动执行：页面加载 + PJAX 完成 =========
  function autoRun() {
    trackVisitFlags();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fillSidebar);
    } else {
      fillSidebar();
    }
    // PJAX：切页后侧边栏会重新渲染，需要重新填充
    document.addEventListener('pjax:complete', function () {
      cachedPromise = null;
      trackVisitFlags();
      fillSidebar();
    });
  }

  if (
    document.readyState === 'complete' ||
    document.readyState === 'interactive'
  ) {
    autoRun();
  } else {
    document.addEventListener('DOMContentLoaded', autoRun);
  }
})();
