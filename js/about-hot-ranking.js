/**
 * 关于页 - 阅读排行 + 访客地图 渲染逻辑
 *
 * 数据来源：百度统计 → Cloudflare Worker 代理 → 客户端渲染
 * 失败降级：尝试备用 Worker → 显示友好错误提示
 *
 * 仅在 #hot-ranking-list 或 #visitor-map-chart 存在时（关于页）才执行
 */

(function () {
  'use strict';

  // =============== 配置区 ===============
  // 主 Worker 地址（部署后替换为你的自定义域名或 workers.dev 子域名）
  // 推荐做法：不改这里，而是在 _config.anzhiyu.yml 的 inject.head 中加一行：
  //   <script>window.__LA_STATS_PROXY__='https://your-worker.workers.dev';</script>
  // 这样升级主题/JS 文件时不会丢失配置
  // 默认走 51.la 代理（百度统计需 PV>100 才能开通 API，51.la 立即可用）
  var DEFAULT_PROXY = 'https://blog-la-stats-proxy.2rh50aqpuyunweiloginmh3.workers.dev';

  // 备用 Worker（如有多域名容灾可在此填写）
  var FALLBACK_PROXY = '';

  // 是否尚未配置（用于区分「未部署」与「真错误」两种状态，给出更友好的提示）
  var PROXY_CONFIGURED = false;

  // 缓存键名（localStorage 缓存数据，减少 Worker 调用次数）
  var CACHE_KEY_HOT = 'about_hot_articles_cache';
  var CACHE_KEY_MAP = 'about_visitor_map_cache';
  var CACHE_TTL = 30 * 60 * 1000; // 30 分钟

  // =============== 入口 ===============
  function startAboutStats() {
    var isAboutPage =
      document.getElementById('hot-ranking-list') ||
      document.getElementById('visitor-map-chart');
    if (!isAboutPage) return;

    // 仅在关于页执行
    if (!/\/about\/?/i.test(location.pathname) && !/body\[data-type="?about/i.test(document.body.getAttribute('data-type') || '')) {
      // 兼容：body data-type="about" 也算关于页
      if (document.body.getAttribute('data-type') !== 'about') return;
    }

    console.info('[about-stats] init start, hostname=' + location.hostname);

    // 等待 pjax 加载完成
    if (typeof window.anzhiyu !== 'undefined' && anzhiyu.refresh) {
      // 主题已就绪，直接初始化
      initAboutStats();
    }
    // 兜底：1 秒后再尝试一次
    setTimeout(initAboutStats, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startAboutStats);
  } else {
    startAboutStats();
  }

  // pjax 切换回关于页时重新初始化
  document.addEventListener('pjax:complete', function () {
    setTimeout(initAboutStats, 200);
  });

  function getProxy() {
    // localhost 本地开发自动指向 wrangler dev
    var hostname = location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      PROXY_CONFIGURED = true;
      return 'http://127.0.0.1:8787';
    }
    // 优先用 inject.head 中的全局变量（用户可在 _config.anzhiyu.yml 中配置）
    if (window.__LA_STATS_PROXY__ && typeof window.__LA_STATS_PROXY__ === 'string' && window.__LA_STATS_PROXY__.indexOf('your-worker') === -1) {
      PROXY_CONFIGURED = true;
      return window.__LA_STATS_PROXY__;
    }
    // 默认 URL：如果不是占位符，则视为已配置
    if (DEFAULT_PROXY.indexOf('your-worker') === -1) {
      PROXY_CONFIGURED = true;
      return DEFAULT_PROXY;
    }
    PROXY_CONFIGURED = false;
    return DEFAULT_PROXY;
  }

  // 渲染「服务配置中」占位（部署 Worker 前的友好提示，避免显示突兀的「加载失败」）
  function renderHotPending(el) {
    el.innerHTML =
      '<div class="hot-loading">' +
      '<i class="anzhiyufont anzhiyu-icon-spinner"></i>' +
      ' 服务配置中...' +
      '</div>';
  }

  function renderMapPending(el) {
    if (typeof echarts === 'undefined') return;
    var chart = ensureMapChart(el);
    if (!chart) return;
    chart.setOption({
      title: {
        text: '服务配置中',
        subtext: '正在接入 51.la',
        left: 'center',
        top: 'center',
        textStyle: { color: '#999', fontSize: 13, fontWeight: 'normal' },
        subtextStyle: { color: '#bbb', fontSize: 12 },
      },
    });
  }

  // =============== 初始化 ===============
  var initialized = false;
  function initAboutStats() {
    var hotEl = document.getElementById('hot-ranking-list');
    var mapEl = document.getElementById('visitor-map-chart');
    if (!hotEl && !mapEl) return;
    if (initialized) return;
    // 仅在两元素之一在视口附近时初始化一次
    initialized = true;

    // 先解析当前代理状态（同时设置 PROXY_CONFIGURED 标志）
    var proxy = getProxy();

    if (hotEl) {
      // 先读缓存秒开
      tryRenderHotFromCache(hotEl);
      // 若 Worker 未配置，显示「服务配置中」而非真实请求（避免无谓的失败请求）
      if (!PROXY_CONFIGURED) {
        renderHotPending(hotEl);
      } else {
        fetchHotArticles(hotEl);
      }
    }
    if (mapEl) {
      tryRenderMapFromCache(mapEl);
      if (!PROXY_CONFIGURED) {
        renderMapPending(mapEl);
      } else {
        fetchVisitorMap(mapEl);
      }
    }
  }

  // =============== 阅读排行 ===============
  function renderHotLoading(el) {
    el.innerHTML =
      '<div class="hot-loading">' +
      '<i class="anzhiyufont anzhiyu-icon-spinner"></i>' +
      ' 加载中...' +
      '</div>';
  }

  function renderHotError(el, msg) {
    el.innerHTML =
      '<div class="hot-error">' +
      '<i class="anzhiyufont anzhiyu-icon-close-circle"></i>' +
      (msg || '数据加载失败，请稍后再试') +
      '</div>';
  }

  function renderHotEmpty(el) {
    el.innerHTML =
      '<div class="hot-error">' +
      '<i class="anzhiyufont anzhiyu-icon-info-circle"></i>' +
      ' 暂无统计数据' +
      '</div>';
  }

  function renderHotList(el, list) {
    if (!list || !list.length) {
      renderHotEmpty(el);
      return;
    }

    var html = '';
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var idx = i + 1;
      var title = escapeHtml(item.title || '未命名');
      var url = item.url || '#';
      var pv = formatNum(item.pv || 0);
      var safeUrl = encodeURI(url);

      html +=
        '<div class="hot-rank-item">' +
        '<span class="hot-rank-num">' + idx + '</span>' +
        '<span class="hot-rank-title">' +
        '<a href="' + safeUrl + '" target="_blank" rel="noopener" title="' + title + '">' + title + '</a>' +
        '</span>' +
        '<span class="hot-rank-count">' + pv + '</span>' +
        '</div>';
    }
    el.innerHTML = html;
  }

  function tryRenderHotFromCache(el) {
    try {
      var raw = localStorage.getItem(CACHE_KEY_HOT);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (Date.now() - data.t > CACHE_TTL) return;
      renderHotList(el, data.list);
    } catch (e) {
      // ignore
    }
  }

  function fetchHotArticles(el) {
    var proxy = getProxy();
    var url = proxy + '/hot-articles?limit=10&t=' + Date.now();

    fetch(url, { method: 'GET', credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (res) {
        if (res && res.code === 0 && Array.isArray(res.data)) {
          renderHotList(el, res.data);
          // 写缓存
          try {
            localStorage.setItem(CACHE_KEY_HOT, JSON.stringify({ t: Date.now(), list: res.data }));
          } catch (e) {}
          return;
        }
        throw new Error(res && res.error ? res.error : '响应格式异常');
      })
      .catch(function (err) {
        console.info('[about-stats] hot-articles failed:', err.message);
        // 缓存兜底
        try {
          var raw = localStorage.getItem(CACHE_KEY_HOT);
          if (raw) {
            var data = JSON.parse(raw);
            if (data.list && data.list.length) {
              renderHotList(el, data.list);
              return;
            }
          }
        } catch (e) {}

        // 备用 Worker
        if (FALLBACK_PROXY) {
          fetch(FALLBACK_PROXY + '/hot-articles?limit=10&t=' + Date.now())
            .then(function (r) { return r.json(); })
            .then(function (r) {
              if (r && r.code === 0 && Array.isArray(r.data)) {
                renderHotList(el, r.data);
              } else {
                renderHotError(el);
              }
            })
            .catch(function () {
              renderHotError(el);
            });
        } else {
          renderHotError(el);
        }
      });
  }

  // =============== 访客地图 ===============
  var mapChartInstance = null;
  var chinaMapLoaded = false;
  var chinaMapLoading = false;
  var chinaMapCallbacks = [];

  // ECharts 中国地图 GeoJSON 注册数据 URL（与主题已加载的 echarts@4.9.0 配套）
  var CHINA_MAP_URL = 'https://npm.elemecdn.com/echarts@4.9.0/map/js/china.js';

  /**
   * 异步加载 ECharts 中国地图数据（仅首次调用时加载，避免拖累其他页面）
   * 加载完成后会执行所有等待中的回调
   */
  function ensureChinaMapLoaded(callback) {
    if (chinaMapLoaded) {
      callback && callback(true);
      return;
    }
    if (callback) chinaMapCallbacks.push(callback);
    if (chinaMapLoading) return;
    chinaMapLoading = true;

    // 兼容老的 echarts@4 map 数据文件（它会调用 echarts.registerMap('china', {...})）
    var script = document.createElement('script');
    script.src = CHINA_MAP_URL;
    script.onerror = function () {
      console.info('[about-stats] china map load failed');
      chinaMapLoading = false;
      // 失败也执行回调，让上层降级
      var cbs = chinaMapCallbacks.slice();
      chinaMapCallbacks = [];
      cbs.forEach(function (cb) { cb(false); });
    };
    script.onload = function () {
      chinaMapLoaded = true;
      chinaMapLoading = false;
      var cbs = chinaMapCallbacks.slice();
      chinaMapCallbacks = [];
      cbs.forEach(function (cb) { cb(true); });
    };
    document.head.appendChild(script);
  }

  function ensureMapChart(el) {
    if (typeof echarts === 'undefined') {
      console.info('[about-stats] echarts not loaded, skip visitor map');
      return null;
    }
    if (mapChartInstance) {
      // 重新挂载到新元素
      try { mapChartInstance.dispose(); } catch (e) {}
      mapChartInstance = null;
    }
    // 确保容器有高度，否则 ECharts 会以 0px 初始化
    if (el.offsetHeight === 0) {
      el.style.height = '260px';
    }
    mapChartInstance = echarts.init(el);
    // 初始化后立即 resize 确保尺寸正确
    setTimeout(function () { if (mapChartInstance) mapChartInstance.resize(); }, 100);
    return mapChartInstance;
  }

  function renderMapLoading(el) {
    if (typeof echarts === 'undefined') return;
    var chart = ensureMapChart(el);
    if (!chart) return;
    chart.setOption({
      title: {
        text: '加载中...',
        left: 'center',
        top: 'center',
        textStyle: { color: '#999', fontSize: 13, fontWeight: 'normal' },
      },
    });
  }

  function renderMapError(el, msg) {
    if (typeof echarts === 'undefined') return;
    var chart = ensureMapChart(el);
    if (!chart) return;
    chart.setOption({
      title: {
        text: msg || '数据加载失败',
        subtext: '请稍后再试',
        left: 'center',
        top: 'center',
        textStyle: { color: '#ff6b6b', fontSize: 13, fontWeight: 'normal' },
        subtextStyle: { color: '#999', fontSize: 12 },
      },
    });
  }

  function renderMapEmpty(el) {
    if (typeof echarts === 'undefined') return;
    var chart = ensureMapChart(el);
    if (!chart) return;
    chart.setOption({
      title: {
        text: '暂无访客数据',
        left: 'center',
        top: 'center',
        textStyle: { color: '#999', fontSize: 13, fontWeight: 'normal' },
      },
    });
  }

  function renderMapChart(el, list) {
    if (typeof echarts === 'undefined') {
      console.info('[about-stats] echarts not loaded yet, will retry');
      setTimeout(function () { renderMapChart(el, list); }, 800);
      return;
    }

    // 必须先加载中国地图 GeoJSON
    ensureChinaMapLoaded(function (ok) {
      if (!ok) {
        renderMapError(el, '地图数据加载失败');
        return;
      }
      renderMapChartInner(el, list);
    });
  }

  function renderMapChartInner(el, list) {
    var chart = ensureMapChart(el);
    if (!chart) return;

    if (!list || !list.length) {
      renderMapEmpty(el);
      return;
    }

    var maxVal = 0;
    var data = list.map(function (item) {
      var v = parseInt(item.value, 10) || 0;
      if (v > maxVal) maxVal = v;
      return { name: item.name, value: v, uv: item.uv || 0 };
    });

    var option = {
      tooltip: {
        trigger: 'item',
        formatter: function (p) {
          if (!p || !p.data) return p.name;
          var d = p.data;
          return d.name + '<br/>访问量：' + formatNum(d.value) + '<br/>访客数：' + formatNum(d.uv);
        },
      },
      visualMap: {
        min: 0,
        max: maxVal || 100,
        left: 'left',
        top: 'bottom',
        text: ['高', '低'],
        calculable: true,
        inRange: { color: ['#e0ffff', '#0066cc', '#003399'] },
        textStyle: { fontSize: 10 },
      },
      geo: {
        map: 'china',
        roam: false,
        zoom: 1.15,
        itemStyle: {
          areaColor: '#f0f2f5',
          borderColor: '#ccc',
        },
        emphasis: {
          itemStyle: { areaColor: '#ffd700' },
          label: { show: true, fontSize: 11 },
        },
      },
      series: [{
        name: '访客分布',
        type: 'map',
        geoIndex: 0,
        data: data,
      }],
    };

    chart.setOption(option, true);

    // 自适应
    var resize = function () {
      if (mapChartInstance) mapChartInstance.resize();
    };
    window.removeEventListener('resize', resize);
    window.addEventListener('resize', resize);
  }

  function tryRenderMapFromCache(el) {
    try {
      var raw = localStorage.getItem(CACHE_KEY_MAP);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (Date.now() - data.t > CACHE_TTL) return false;
      // 等待 echarts 初始化完成
      var tryCount = 0;
      var tryRender = function () {
        if (typeof echarts !== 'undefined') {
          renderMapChart(el, data.list);
          return;
        }
        tryCount++;
        if (tryCount < 10) setTimeout(tryRender, 300);
      };
      tryRender();
      return true;
    } catch (e) {
      return false;
    }
  }

  function fetchVisitorMap(el) {
    var proxy = getProxy();
    var url = proxy + '/visitor-map?t=' + Date.now();

    // 等待 echarts 就绪后渲染 loading
    if (typeof echarts !== 'undefined') {
      renderMapLoading(el);
    }

    fetch(url, { method: 'GET', credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (res) {
        if (res && res.code === 0 && Array.isArray(res.data)) {
          renderMapChart(el, res.data);
          try {
            localStorage.setItem(CACHE_KEY_MAP, JSON.stringify({ t: Date.now(), list: res.data }));
          } catch (e) {}
          return;
        }
        throw new Error(res && res.error ? res.error : '响应格式异常');
      })
      .catch(function (err) {
        console.info('[about-stats] visitor-map failed:', err.message);
        // 缓存兜底
        try {
          var raw = localStorage.getItem(CACHE_KEY_MAP);
          if (raw) {
            var data = JSON.parse(raw);
            if (data.list && data.list.length) {
              renderMapChart(el, data.list);
              return;
            }
          }
        } catch (e) {}

        // 备用 Worker
        if (FALLBACK_PROXY) {
          fetch(FALLBACK_PROXY + '/visitor-map?t=' + Date.now())
            .then(function (r) { return r.json(); })
            .then(function (r) {
              if (r && r.code === 0 && Array.isArray(r.data)) {
                renderMapChart(el, r.data);
              } else {
                renderMapError(el);
              }
            })
            .catch(function () {
              renderMapError(el);
            });
        } else {
          renderMapError(el);
        }
      });
  }

  // =============== 工具函数 ===============
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatNum(n) {
    n = parseInt(n, 10) || 0;
    if (n >= 10000) {
      return (n / 10000).toFixed(1) + 'w';
    }
    if (n >= 1000) {
      return (n / 1000).toFixed(1) + 'k';
    }
    return String(n);
  }
})();
