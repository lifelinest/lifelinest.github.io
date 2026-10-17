/**
 * 侧边栏「热搜榜」—— 实时拉取（微博 / 抖音 / 知乎 / 百度）
 *
 * 数据源（均为国内可达 + 支持跨域）：
 *   - codelife.cc  → 微博 / 知乎 / 百度
 *   - xxapi.cn     → 抖音 / 微博 / 百度（备用）
 *
 * 策略：主源失败自动切备源 → 本地缓存（10 分钟）→ 失败友好提示。
 * 不再使用任何写死的过时数据。
 *
 * 仅在 #zhihu-container 存在时执行（首页 / 文章页侧边栏）。
 */
(function () {
  'use strict';

  var CACHE_TTL = 10 * 60 * 1000;      // 缓存有效期：10 分钟
  var CACHE_PREFIX = 'pf_hot_';        // localStorage 键前缀
  var MAX_ITEMS = 20;                  // 每榜最多展示条数

  // ---------- 各源字段适配 ----------
  // codelife: { index, title, hotValue, link }
  function pickCodelife(d) {
    return { title: d.title, url: d.link, hot: d.hotValue || '' };
  }
  // xxapi 通用: { index, title, hot, url }
  function pickXxapi(d) {
    return { title: d.title, url: d.url, hot: d.hot || '' };
  }
  // 抖音热点榜: { word, hot_value, group_id, ... }
  function pickDouyin(d) {
    var w = d.word || d.title || '';
    return {
      title: w,
      url: 'https://www.douyin.com/search/' + encodeURIComponent(w),
      hot: fmtHotNum(d.hot_value)
    };
  }
  function fmtHotNum(v) {
    v = parseInt(v, 10) || 0;
    if (v >= 100000000) return (v / 100000000).toFixed(1) + '亿';
    if (v >= 10000) return (v / 10000).toFixed(1) + '万';
    return String(v);
  }

  // ---------- 平台配置（sources 按优先级排列） ----------
  var SOURCES = {
    weibo: {
      name: '微博',
      sources: [
        { url: 'https://api.codelife.cc/api/top/list?lang=cn&id=KqndgxeLl9', pick: pickCodelife },
        { url: 'https://v2.xxapi.cn/api/weibohot', pick: pickXxapi }
      ]
    },
    douyin: {
      name: '抖音',
      sources: [
        { url: 'https://v2.xxapi.cn/api/douyinhot', pick: pickDouyin }
      ]
    },
    zhihu: {
      name: '知乎',
      sources: [
        { url: 'https://api.codelife.cc/api/top/list?lang=cn&id=mproPpoq6O', pick: pickCodelife }
      ]
    },
    baidu: {
      name: '百度',
      sources: [
        { url: 'https://api.codelife.cc/api/top/list?lang=cn&id=Jb0vmloB1G', pick: pickCodelife },
        { url: 'https://v2.xxapi.cn/api/baiduhot', pick: pickXxapi }
      ]
    }
  };

  // ---------- 工具 ----------
  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ================= 入口 =================
  function initHotList() {
    var container = document.getElementById('zhihu-container');
    if (!container) return;

    var currentPlatform = 'weibo';
    var loading = {};

    function readCache(p) {
      try {
        var raw = localStorage.getItem(CACHE_PREFIX + p);
        if (!raw) return null;
        var obj = JSON.parse(raw);
        if (!obj || !obj.list || !obj.list.length) return null;
        return obj; // { t, list }
      } catch (e) { return null; }
    }
    function writeCache(p, list) {
      try { localStorage.setItem(CACHE_PREFIX + p, JSON.stringify({ t: Date.now(), list: list })); } catch (e) {}
    }

    function showMsg(text) {
      container.innerHTML =
        '<div class="zhihu-list">' +
        '<div style="padding:14px 8px;text-align:center;color:#999;font-size:13px;">' + esc(text) + '</div>' +
        '</div>';
    }

    function render(list) {
      if (!list || !list.length) { showMsg('暂时获取不到热搜，请稍后再试'); return; }
      var html = '<div class="zhihu-list">';
      for (var i = 0; i < list.length && i < MAX_ITEMS; i++) {
        var it = list[i];
        html +=
          '<div class="zhihu-list-item">' +
          '<div class="zhihu-hotness">' + (i + 1) + '</div>' +
          '<span class="zhihu-title">' +
          '<a title="' + esc(it.title) + '" href="' + esc(it.url) + '" target="_blank" rel="external nofollow noreferrer">' + esc(it.title) + '</a>' +
          '</span>' +
          '<div class="zhihu-hot"><span>' + esc(it.hot || '') + '</span></div>' +
          '</div>';
      }
      html += '</div>';
      container.innerHTML = html;
    }

    // 顺序尝试各源，任一成功即回调 list；全失败回调 null
    function fetchPlatform(p, cb) {
      var srcs = SOURCES[p].sources.slice();
      (function tryNext(i) {
        if (i >= srcs.length) { cb(null); return; }
        var s = srcs[i];
        fetch(s.url, { cache: 'no-store' })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (j) {
            var arr = j && Array.isArray(j.data) ? j.data : null;
            if (!arr || !arr.length) throw new Error('空数据');
            var list = [];
            for (var k = 0; k < arr.length && list.length < MAX_ITEMS; k++) {
              var item = s.pick(arr[k]);
              if (item && item.title && item.url) list.push(item);
            }
            if (!list.length) throw new Error('解析为空');
            cb(list);
          })
          .catch(function () { tryNext(i + 1); });
      })(0);
    }

    // 刷新（后台静默）：命中即写缓存，且当前仍在该平台才重绘
    function refresh(p) {
      if (loading[p]) return;
      loading[p] = true;
      fetchPlatform(p, function (list) {
        loading[p] = false;
        if (list && list.length) {
          writeCache(p, list);
          if (currentPlatform === p) render(list);
        }
      });
    }

    function load(p) {
      var cached = readCache(p);
      if (cached) {
        if (currentPlatform === p) render(cached.list);
        if (Date.now() - cached.t > CACHE_TTL) refresh(p); // 过期则后台静默刷新
        return;
      }
      if (loading[p]) return;
      loading[p] = true;
      showMsg('加载中…');
      fetchPlatform(p, function (list) {
        loading[p] = false;
        if (list && list.length) {
          writeCache(p, list);
          if (currentPlatform === p) render(list);
        } else if (currentPlatform === p) {
          showMsg('暂时获取不到热搜，请稍后再试');
        }
      });
    }

    // 初始加载
    load(currentPlatform);

    // tab 切换
    var tabs = document.querySelectorAll('.hot-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        var p = this.getAttribute('data-platform');
        if (!SOURCES[p] || p === currentPlatform) return;
        for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
        this.classList.add('active');
        currentPlatform = p;
        load(p);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHotList);
  } else {
    initHotList();
  }
})();
