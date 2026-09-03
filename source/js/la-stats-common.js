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
  // 数据来源：51.la 官方数据挂件 quote.js（与 51.la 后台口径完全一致）。
  // 挂件托管在阿里云 OSS 且开放 CORS，浏览器可直接读取，不依赖 Worker。
  const WIDGET_BASE = 'https://v6-widget.51.la/v6/';
  // ck 在模板注入后会写到 window.__LA_CK__
  const CK =
    (typeof window.__LA_CK__ !== 'undefined' ? window.__LA_CK__ : '') || '';
  const WIDGET_URL = CK ? WIDGET_BASE + CK + '/quote.js' : '';

  // 缓存：同一次页面生命周期内只请求一次
  let cachedPromise = null;

  // ========= 内部：Widget（官方数据挂件 quote.js） =========
  // 挂件数据块按行内嵌 7 组「索引:数值」：
  //   0=最近活跃, 1=今日UV, 2=今日PV, 3=昨日UV, 4=昨日PV, 5=本月PV, 6=总PV
  function fetchFromWidget() {
    if (!WIDGET_URL) return Promise.reject(new Error('No LA ck'));
    return fetch(WIDGET_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('Widget HTTP ' + res.status);
        return res.text();
      })
      .then(function (data) {
        const rows = data.match(/<span>(\d+)<\/span><span>(\d+)<\/span><\/p>/g);
        if (!rows || rows.length < 7) throw new Error('Widget parse error');
        const values = rows.map(function (row) {
          const m = row.match(/<span>(\d+)<\/span><span>(\d+)<\/span><\/p>/);
          return m ? parseInt(m[2], 10) || 0 : 0;
        });
        return {
          todayUV: values[1] || 0,
          todayPV: values[2] || 0,
          yesterdayUV: values[3] || 0,
          yesterdayPV: values[4] || 0,
          monthPV: values[5] || 0,
          totalPV: values[6] || 0,
        };
      });
  }

  // ========= 公共：获取全站统计对象（带缓存） =========
  function fetchSiteStats() {
    if (cachedPromise) return cachedPromise;
    cachedPromise = fetchFromWidget().catch(function (e) {
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
