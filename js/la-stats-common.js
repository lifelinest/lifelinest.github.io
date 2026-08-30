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
  const IS_LOCAL =
    location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const WORKER_BASE = IS_LOCAL
    ? 'http://127.0.0.1:8787'
    : 'https://blog-la-stats-proxy.2rh50aqpuyunweiloginmh3.workers.dev';
  const WORKER_STATS_URL = WORKER_BASE + '/stats';
  const WIDGET_BASE = 'https://v6-widget.51.la/v6/';
  // ck 在模板注入后会写到 window.__LA_CK__
  const CK =
    (typeof window.__LA_CK__ !== 'undefined' ? window.__LA_CK__ : '') || '';
  const WIDGET_URL = CK ? WIDGET_BASE + CK + '/quote.js' : '';

  // 缓存：同一次页面生命周期内只请求一次
  let cachedPromise = null;

  // ========= 内部：Worker 请求 =========
  function fetchFromWorker() {
    return fetch(WORKER_STATS_URL, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('Worker HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        if (json.code !== 0 || !json.data) throw new Error('Worker no data');
        const d = json.data;
        // 返回顺序：[最近活跃占位, 今日UV, 今日PV, 昨日UV, 昨日PV, 本月PV, 总PV]
        // 注意：51.la /stats 目前没有返回 总UV 字段，这里做映射
        return {
          todayUV: d.todayUV || 0,
          todayPV: d.todayPV || 0,
          yesterdayUV: d.yesterdayUV || 0,
          yesterdayPV: d.yesterdayPV || 0,
          monthPV: d.monthPV || 0,
          totalPV: d.totalPV || 0,
          // Worker 暂未提供 totalUV，用 0 占位（UI 需要的话后续补）
          totalUV: 0,
        };
      });
  }

  // ========= 内部：Widget 降级（quote.js） =========
  function fetchFromWidget() {
    if (!WIDGET_URL) return Promise.reject(new Error('No LA ck'));
    return fetch(WIDGET_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('Widget HTTP ' + res.status);
        return res.text();
      })
      .then(function (data) {
        const matches = data.match(/(<\/span><span>).*?(<\/span><\/p>)/g);
        if (!matches || !matches.length) throw new Error('Widget parse error');
        const nums = matches.map(function (el) {
          return (
            parseInt(
              el.replace(/(<\/span><span>|<\/span><\/p>)/g, ''),
              10
            ) || 0
          );
        });
        // quote.js 顺序：[今日UV, 今日PV, 昨日UV, 昨日PV, 本月PV, 总PV]
        return {
          todayUV: nums[0] || 0,
          todayPV: nums[1] || 0,
          yesterdayUV: nums[2] || 0,
          yesterdayPV: nums[3] || 0,
          monthPV: nums[4] || 0,
          totalPV: nums[5] || 0,
          totalUV: 0,
        };
      });
  }

  // ========= 公共：获取全站统计对象（带缓存） =========
  function fetchSiteStats() {
    if (cachedPromise) return cachedPromise;
    cachedPromise = fetchFromWorker()
      .catch(function (e) {
        console.info('[LA Stats] Worker failed, fallback to widget:', e && e.message);
        return fetchFromWidget();
      })
      .catch(function (e) {
        console.info('[LA Stats] Widget also failed:', e && e.message);
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

  // ========= 公共：填充侧边栏（#la-site-uv / #la-site-pv） =========
  // 重要：严格按 51.la 实际返回的数据显示，不做任何伪造/叠加，确保与后台一致
  function fillSidebar() {
    const uvEl = document.getElementById('la-site-uv');
    const pvEl = document.getElementById('la-site-pv');
    if (!uvEl && !pvEl) return;

    return fetchSiteStats()
      .then(function (s) {
        // 总UV：51.la OpenAPI 与 数据挂件(quote.js)均未提供累计总UV，真实显示为 --
        // 以后若 /stats 接口补齐 totalUV 字段，会自动生效（已在 fetchSiteStats 中预留）
        if (uvEl) {
          if (s.totalUV && s.totalUV > 0) {
            uvEl.innerHTML = formatNumber(s.totalUV);
          } else {
            uvEl.innerHTML = '<span title="51.la暂未开放累计总UV" style="opacity:.6;cursor:help">--</span>';
          }
        }
        // 总PV：51.la 提供 totalPV，真实显示
        if (pvEl) {
          pvEl.innerHTML = formatNumber(s.totalPV);
        }
      })
      .catch(function () {
        if (uvEl) uvEl.innerHTML = '<span style="opacity:.6">--</span>';
        if (pvEl) pvEl.innerHTML = '<span style="opacity:.6">--</span>';
      });
  }

  // ========= 公共：给 about.pug 返回与原有 dataArray 兼容的数组 =========
  // [0=最近活跃(占位), 今日UV, 今日PV, 昨日UV, 昨日PV, 本月PV, 总PV]
  function fetchAboutStatsArray() {
    return fetchSiteStats().then(function (s) {
      return [0, s.todayUV, s.todayPV, s.yesterdayUV, s.yesterdayPV, s.monthPV, s.totalPV];
    });
  }

  // ========= 暴露到全局 =========
  LA.fetchLaStats = fetchSiteStats;
  LA.fetchLaStatsAboutArray = fetchAboutStatsArray;
  LA.fillLaSidebar = fillSidebar;

  // ========= 自动执行：页面加载 + PJAX 完成 =========
  function autoRun() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fillSidebar);
    } else {
      fillSidebar();
    }
    // PJAX：切页后侧边栏会重新渲染，需要重新填充
    document.addEventListener('pjax:complete', function () {
      cachedPromise = null;
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
