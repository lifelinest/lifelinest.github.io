/**
 * 51.la SDK 安全加载器
 * - 优先 HTTPS，失败回退 HTTP
 * - 防止与主题 main.js 重复初始化
 * - PJAX 兼容：pjax:complete 时重新触发 PV 上报
 */
(function () {
  'use strict';

  var LA_ID = '3QwSZ9Z73TkmWmKS';

  // 如果 LA 已就绪（可能主题已加载），直接返回
  if (window.LA && typeof window.LA.init === 'function') {
    initLA();
    return;
  }

  // 先尝试 HTTPS
  loadSdk('https://sdk.51.la/js-sdk-pro.min.js', function () {
    if (window.LA) {
      initLA();
    } else {
      // HTTPS 成功但 LA 未定义，再尝试一次
      loadSdk('https://sdk.51.la/js-sdk-pro.min.js', function () {
        if (window.LA) initLA();
        else console.warn('[51.la] SDK loaded but LA undefined');
      });
    }
  }, function () {
    // HTTPS 失败，回退 HTTP
    console.warn('[51.la] HTTPS failed, trying HTTP');
    loadSdk('http://sdk.51.la/js-sdk-pro.min.js', function () {
      if (window.LA) initLA();
      else console.warn('[51.la] HTTP loaded but LA undefined');
    }, function () {
      console.warn('[51.la] SDK failed to load via both HTTPS and HTTP');
    });
  });

  function loadSdk(url, onload, onerror) {
    // 如果已存在则不重复加载
    var existing = document.getElementById('LA_COLLECT');
    if (existing && existing.src === url) {
      onload && onload();
      return;
    }
    // 移除旧的
    if (existing) existing.remove();

    var s = document.createElement('script');
    s.charset = 'UTF-8';
    s.async = true;
    s.id = 'LA_COLLECT';
    s.src = url;
    s.onload = onload;
    s.onerror = onerror;
    document.head.appendChild(s);
  }

  function initLA() {
    try {
      // 防止主题 main.js 重复初始化
      if (window.LA._initialized) return;
      window.LA._initialized = true;

      LA.init({ id: LA_ID, ck: LA_ID });
      console.info('[51.la] SDK initialized OK, id=' + LA_ID);

      // PJAX 兼容：页面切换时重新上报 PV
      document.addEventListener('pjax:complete', function () {
        try {
          if (window.LA && typeof window.LA.trackPageview === 'function') {
            LA.trackPageview();
          }
        } catch (e) {}
      });
    } catch (e) {
      console.warn('[51.la] init error:', e.message);
    }
  }
})();