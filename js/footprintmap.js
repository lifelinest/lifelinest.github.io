/* =========================================================
   足迹地图 FootprintMap
   交互逻辑对齐示例插件 halo-plugin-footprint：
     圆头像 marker + 全局单例 InfoWindow + 点击飞入并抬升俯仰角 + 聚合 + 比例尺
   额外结合安知鱼主题做了：导航高度自适应、亮/暗主题联动（含高德暗色底图）、响应式行为
   ========================================================= */
(function () {
  'use strict';

  var CONTAINER_ID = 'footprint-map-container';
  var CLUSTER_ZOOM = 6; // 缩放小于该值时聚合，与示例插件一致

  var container, map, layers, globalInfoWindow, currentMarker;
  var allFootprints = [];
  var visibleFootprints = [];
  var markerMap = {}; // id -> marker
  var observer = null;
  var resizeTimer = null;

  /* ---------------- 工具 ---------------- */

  function getFootprints() {
    var d = window.footprintsData || {};
    var list = d.footprints || d;
    return Array.isArray(list) ? list : [];
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function formatDate(input) {
    if (!input) return '';
    var d = new Date(input);
    if (isNaN(d.getTime())) return String(input);
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  function currentMapStyle() {
    var cfg = window.FOOTPRINT_CONFIG || {};
    return isDark() ? (cfg.mapStyleDark || 'amap://styles/dark') : (cfg.mapStyle || 'amap://styles/normal');
  }

  /* 容器高度：嵌入页面内容框，留出顶部导航与底部页脚空间，并设上下限 */
  function syncHeight() {
    if (!container) return;
    var docTop = container.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0);
    var h = window.innerHeight - docTop - 40; // 底部给页脚留 40px 余量
    if (!isFinite(h)) h = 720;
    if (h > 820) h = 820;   // 上限：避免卡片过高
    if (h < 460) h = 460;   // 下限：保证可操作
    container.style.setProperty('--fp-h', Math.round(h) + 'px');
    if (map) setTimeout(function () { map.resize && map.resize(); }, 60);
  }

  /* ---------------- 数据 ---------------- */

  function loadData() {
    allFootprints = getFootprints().filter(function (f) {
      var lng = parseFloat(f.longitude);
      var lat = parseFloat(f.latitude);
      return isFinite(lng) && isFinite(lat);
    });
    allFootprints.forEach(function (f, i) {
      if (!f.id) f.id = 'fp-' + i;
    });
    visibleFootprints = allFootprints.slice();
  }

  function renderTypeFilter() {
    var sel = document.getElementById('footprint-type-filter');
    if (!sel) return;
    var types = [];
    allFootprints.forEach(function (f) {
      if (f.footprintType && types.indexOf(f.footprintType) === -1) types.push(f.footprintType);
    });
    sel.innerHTML = '<option value="all">所有类型</option>' +
      types.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + '</option>'; }).join('');
  }

  function renderStats() {
    var cities = {}, types = {};
    visibleFootprints.forEach(function (f) {
      if (f.address) cities[f.address] = 1;
      if (f.footprintType) types[f.footprintType] = 1;
    });
    var set = function (id, v) {
      var el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    set('total-footprints', visibleFootprints.length);
    set('total-cities', Object.keys(cities).length);
    set('total-types', Object.keys(types).length);
    var c = document.getElementById('fp-count');
    if (c) c.textContent = visibleFootprints.length;
  }

  function renderList() {
    var list = document.getElementById('fp-list');
    if (!list) return;
    if (!visibleFootprints.length) {
      list.innerHTML = '<div class="fp-empty">暂无匹配的足迹</div>';
      return;
    }
    list.innerHTML = visibleFootprints.map(function (f) {
      return '' +
        '<div class="fp-item" data-id="' + esc(f.id) + '">' +
          '<div class="fp-item-top">' +
            '<span class="fp-item-name">' + esc(f.name || '未命名') + '</span>' +
            (f.footprintType ? '<span class="fp-item-type">' + esc(f.footprintType) + '</span>' : '') +
          '</div>' +
          (f.address ? '<div class="fp-item-addr">' + esc(f.address) + '</div>' : '') +
          (f.createTime ? '<div class="fp-item-time">' + esc(formatDate(f.createTime)) + '</div>' : '') +
        '</div>';
    }).join('');

    Array.prototype.forEach.call(list.querySelectorAll('.fp-item'), function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-id');
        var f = findById(id);
        if (f) focusFootprint(f);
      });
    });
  }

  function findById(id) {
    for (var i = 0; i < allFootprints.length; i++) {
      if (allFootprints[i].id === id) return allFootprints[i];
    }
    return null;
  }

  function applyFilter() {
    var kw = (document.getElementById('footprint-search') || {}).value || '';
    var type = (document.getElementById('footprint-type-filter') || {}).value || 'all';
    kw = kw.trim().toLowerCase();
    visibleFootprints = allFootprints.filter(function (f) {
      if (type !== 'all' && f.footprintType !== type) return false;
      if (!kw) return true;
      var hay = [f.name, f.address, f.description, f.footprintType].join(' ').toLowerCase();
      return hay.indexOf(kw) !== -1;
    });
    renderStats();
    renderList();
    renderMarkers();
  }

  /* ---------------- marker ---------------- */

  function createMarkerEl(f) {
    var wrap = document.createElement('div');
    wrap.className = 'fp-marker';
    if (f.image) {
      var img = document.createElement('img');
      img.src = f.image;
      img.alt = f.name || '';
      img.loading = 'lazy';
      wrap.appendChild(img);
    } else {
      var s = document.createElement('span');
      s.textContent = (f.name || '迹').charAt(0);
      wrap.appendChild(s);
    }
    return wrap;
  }

  function createClusterEl(count) {
    var el = document.createElement('div');
    el.className = 'fp-cluster';
    el.textContent = count;
    return el;
  }

  /* 简易网格聚合：与示例插件一致，仅在低缩放级别启用 */
  function clusterize(list) {
    var clusters = [];
    var used = {};
    list.forEach(function (f, i) {
      if (used[i]) return;
      var group = [f];
      used[i] = true;
      for (var j = i + 1; j < list.length; j++) {
        if (used[j]) continue;
        var g = list[j];
        if (Math.abs(g.latitude - f.latitude) < 3 && Math.abs(g.longitude - f.longitude) < 3) {
          group.push(g);
          used[j] = true;
        }
      }
      clusters.push(group);
    });
    return clusters;
  }

  function clearMarkers() {
    if (!map) return;
    Object.keys(markerMap).forEach(function (k) { map.remove(markerMap[k]); });
    markerMap = {};
    if (window.__fpClusterMarkers) {
      window.__fpClusterMarkers.forEach(function (m) { map.remove(m); });
    }
    window.__fpClusterMarkers = [];
  }

  function renderMarkers() {
    if (!map) return;
    clearMarkers();
    if (!visibleFootprints.length) return;

    if (map.getZoom() < CLUSTER_ZOOM) {
      clusterize(visibleFootprints).forEach(function (group) {
        var first = group[0];
        var pos = new AMap.LngLat(parseFloat(first.longitude), parseFloat(first.latitude));
        if (group.length === 1) {
          addPointMarker(first, pos);
        } else {
          var m = new AMap.Marker({
            position: pos,
            content: createClusterEl(group.length),
            anchor: 'bottom-center',
            offset: new AMap.Pixel(0, 0)
          });
          m.on('click', function () {
            map.setZoomAndCenter(Math.min(20, map.getZoom() + 2), pos);
            map.setPitch(0);
            map.setRotation(0);
          });
          map.add(m);
          window.__fpClusterMarkers.push(m);
        }
      });
    } else {
      visibleFootprints.forEach(function (f) {
        addPointMarker(f, new AMap.LngLat(parseFloat(f.longitude), parseFloat(f.latitude)));
      });
    }
  }

  function addPointMarker(f, pos) {
    var marker = new AMap.Marker({
      position: pos,
      content: createMarkerEl(f),
      anchor: 'bottom-center',
      offset: new AMap.Pixel(0, 0),
      title: f.name || ''
    });
    marker.on('click', function () {
      if (currentMarker === marker) {
        closeInfoWindow();
        return;
      }
      focusFootprint(f, marker);
    });
    map.add(marker);
    markerMap[f.id] = marker;
  }

  /* ---------------- InfoWindow ---------------- */

  function buildInfoWindow(f) {
    var imgBlock = f.image
      ? '<img src="' + esc(f.image) + '" alt="' + esc(f.name || '') + '">'
      : '<div class="fp-iw-noimg"><i class="anzhiyufont anzhiyu-icon-location-dot"></i><span>暂无图片</span></div>';

    var meta = '';
    if (f.footprintType) meta += '<span>' + esc(f.footprintType) + '</span>';
    if (f.createTime) meta += '<span>' + esc(formatDate(f.createTime)) + '</span>';
    if (f.address) meta += '<span>' + esc(f.address) + '</span>';

    return '' +
      '<div class="fp-iw">' +
        '<div class="fp-iw-img">' + imgBlock +
          '<div class="fp-iw-info">' +
            '<h3 class="fp-iw-title">' + esc(f.name || '未命名') +
              (f.demo ? '<span class="fp-iw-tag">示例</span>' : '') +
            '</h3>' +
            (meta ? '<div class="fp-iw-meta">' + meta + '</div>' : '') +
            (f.description ? '<p class="fp-iw-desc">' + esc(f.description) + '</p>' : '') +
            (f.article ? '<a class="fp-iw-link" href="' + esc(f.article) + '" target="_blank" rel="noopener" data-fp-link="1">查看关联文章</a>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function openInfoWindow(f, pos, marker) {
    globalInfoWindow.setContent(buildInfoWindow(f));
    globalInfoWindow.open(map, pos);
    currentMarker = marker || null;

    setTimeout(function () {
      map.setPitch(60);
    }, 80);

    setTimeout(function () {
      var el = document.querySelector('.fp-iw');
      if (!el) return;
      el.addEventListener('click', function (e) {
        if (e.target.closest('[data-fp-link]')) return; // 点链接不关闭
        closeInfoWindow();
      });
    }, 120);

    highlightItem(f.id);
  }

  function closeInfoWindow() {
    if (globalInfoWindow) globalInfoWindow.close();
    currentMarker = null;
    if (map) {
      map.setPitch(0, false, 500);
      map.setRotation(0, false, 500);
    }
    highlightItem(null);
  }

  function highlightItem(id) {
    var list = document.getElementById('fp-list');
    if (!list) return;
    Array.prototype.forEach.call(list.querySelectorAll('.fp-item'), function (el) {
      el.classList.toggle('is-active', !!id && el.getAttribute('data-id') === id);
    });
  }

  /* 平滑飞入目标点后打开信息窗（示例插件 moveToLocation 的等效实现） */
  function focusFootprint(f, marker) {
    var pos = new AMap.LngLat(parseFloat(f.longitude), parseFloat(f.latitude));
    var targetZoom = Math.max(map.getZoom(), 11);

    closeInfoWindowSilently();
    map.setZoomAndCenter(targetZoom, pos);
    setTimeout(function () {
      openInfoWindow(f, pos, marker || markerMap[f.id] || null);
    }, 420);
  }

  function closeInfoWindowSilently() {
    if (globalInfoWindow) globalInfoWindow.close();
    currentMarker = null;
  }

  /* ---------------- 比例尺 ---------------- */

  function updateScale() {
    var el = document.getElementById('fp-scale-text');
    if (!el || !map) return;
    var z = map.getZoom();
    var t = '10000 公里';
    if (z >= 15) t = '100 米';
    else if (z >= 12) t = '1 公里';
    else if (z >= 9) t = '10 公里';
    else if (z >= 6) t = '100 公里';
    else if (z >= 3) t = '1000 公里';
    el.textContent = t;
  }

  /* ---------------- 控制栏 ---------------- */

  function bindControls() {
    var layerBtns = document.querySelectorAll('.fp-layer-btn');
    Array.prototype.forEach.call(layerBtns, function (btn) {
      btn.addEventListener('click', function () {
        var type = btn.getAttribute('data-type');
        Array.prototype.forEach.call(layerBtns, function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        if (!layers) return;
        if (type === 'satellite') layers.satellite.show();
        else layers.satellite.hide();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.fp-toggle-item input[type="checkbox"]'), function (cb) {
      cb.addEventListener('change', function () {
        if (!layers) return;
        var type = cb.getAttribute('data-type');
        if (layers[type]) cb.checked ? layers[type].show() : layers[type].hide();
      });
    });

    var zin = document.getElementById('fp-zoom-in');
    var zout = document.getElementById('fp-zoom-out');
    if (zin) zin.addEventListener('click', function () { map && map.setZoom(Math.min(20, map.getZoom() + 1)); });
    if (zout) zout.addEventListener('click', function () { map && map.setZoom(Math.max(3, map.getZoom() - 1)); });

    var toggle = document.getElementById('fp-panel-toggle');
    var panel = document.getElementById('fp-panel');
    if (toggle && panel) {
      toggle.addEventListener('click', function () { panel.classList.toggle('is-collapsed'); });
    }

    var search = document.getElementById('footprint-search');
    if (search) {
      var t;
      search.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(applyFilter, 220);
      });
    }
    var sel = document.getElementById('footprint-type-filter');
    if (sel) sel.addEventListener('change', applyFilter);
  }

  /* ---------------- 主题联动 ---------------- */

  function watchTheme() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(function () {
      if (map) map.setMapStyle(currentMapStyle());
      syncHeight();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* ---------------- 初始化 ---------------- */

  function showError(msg) {
    if (!container) return;
    var box = document.createElement('div');
    box.className = 'fp-error';
    box.innerHTML = '<i class="anzhiyufont anzhiyu-icon-exclamation-circle"></i><p>' + esc(msg) + '</p>';
    container.appendChild(box);
  }

  function boot() {
    if (window.AMap) {
      init();
      return;
    }
    var cfg = window.FOOTPRINT_CONFIG || {};
    if (cfg.securityJsCode) {
      window._AMapSecurityConfig = { securityJsCode: cfg.securityJsCode };
    }
    var s = document.createElement('script');
    s.src = 'https://webapi.amap.com/maps?v=2.0&key=' + encodeURIComponent(cfg.amapKey || '');
    s.onload = init;
    s.onerror = function () { showError('地图脚本加载失败，请检查网络或高德 Key 配置。'); };
    document.head.appendChild(s);
  }

  function init() {
    loadData();
    bindControls();
    renderTypeFilter();
    renderStats();
    renderList();

    if (!allFootprints.length) {
      showError('还没有足迹数据。请在 source/_data/footprints.json 中填入地点、坐标与时间。');
    }

    // pjax 场景：销毁旧地图实例，避免重复叠加
    if (window.__fpMapInstance) {
      try { window.__fpMapInstance.destroy(); } catch (e) {}
      window.__fpMapInstance = null;
    }

    var center = [105, 34];
    if (allFootprints.length) {
      var lng = 0, lat = 0;
      allFootprints.forEach(function (f) { lng += parseFloat(f.longitude); lat += parseFloat(f.latitude); });
      center = [lng / allFootprints.length, lat / allFootprints.length];
    }

    map = new AMap.Map('footprint-map', {
      zoom: allFootprints.length > 3 ? 4 : 6,
      center: center,
      mapStyle: currentMapStyle(),
      viewMode: '3D',
      pitch: 35,
      pitchEnable: true,
      rotateEnable: true,
      showBuildingBlock: true,
      animateEnable: true,
      scrollWheel: true,
      doubleClickZoom: true,
      keyboardEnable: true,
      dragEnable: true,
      zoomEnable: true,
      resizeEnable: true,
      features: ['bg', 'road', 'building', 'point']
    });
    window.__fpMapInstance = map;

    layers = {
      satellite: new AMap.TileLayer.Satellite(),
      road: new AMap.TileLayer.RoadNet(),
      traffic: new AMap.TileLayer.Traffic()
    };
    Object.keys(layers).forEach(function (k) {
      map.add(layers[k]);
      layers[k].hide();
    });

    globalInfoWindow = new AMap.InfoWindow({
      isCustom: true,
      autoMove: false,
      offset: new AMap.Pixel(0, -10)
    });

    map.on('complete', function () {
      syncHeight();
      updateScale();
      var page = document.querySelector('#footprint-map-page');
      var ctr = document.querySelector('.fp-controls');
      if (page) page.classList.add('is-show');
      if (ctr) ctr.classList.add('is-show');
    });

    map.on('click', function () {
      if (currentMarker) closeInfoWindow();
    });

    var reRender = function () {
      if (currentMarker) return; // 有信息窗打开时不重绘，避免打断
      setTimeout(renderMarkers, 120);
    };
    map.on('zoomend', function () { updateScale(); reRender(); });
    map.on('moveend', updateScale);

    renderMarkers();
    watchTheme();

    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(syncHeight, 160);
    });
    syncHeight();
  }

  function start() {
    container = document.getElementById(CONTAINER_ID);
    if (!container) return;
    // 移动端默认收起列表面板，优先保证地图视野
    if (window.innerWidth <= 768) {
      var panel = document.getElementById('fp-panel');
      if (panel) panel.classList.add('is-collapsed');
    }
    boot();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
