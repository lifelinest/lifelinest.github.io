/* 可交互知识库 · 3D 知识图谱主视图
   34 节 = 34 颗星，631 条 = 631 粒粒子，按「口径」分四个星区。
   搜索 / 多维筛选 / 收藏+已读打卡 / 键盘 + 深链。 */
(function () {
  'use strict';

  var NS = '__mfyKB';
  var root = document.getElementById('kb-root');
  if (!root) return;
  if (window[NS]) { try { window[NS](); } catch (e) { } }
  window[NS] = null;

  var $ = function (id) { return document.getElementById(id); };
  var stage = $('kb-stage'), search = $('kb-search'), countEl = $('kb-count');
  var panel = $('kb-panel'), listEl = $('kb-list'), detail = $('kb-detail');
  var progFill = $('kb-prog-fill'), progTxt = $('kb-prog-txt'), loading = $('kb-loading');
  if (!stage) return;

  var disposed = false, THREE = null, raf = 0;
  var DATA = null, items = [], sections = [], bySec = {};
  var hit = null, hitCount = 0;                 // 当前筛选命中（item index 集合）
  var fav = loadSet('mfy.kb.fav'), read = loadSet('mfy.kb.read');
  var curIdx = -1, listIdx = [], focusSec = -1, query = '';
  var listeners = [];

  var KCOL = { '死亡率': 0xff6b6b, '金钱': 0x2dd4bf, '时间': 0x818cf8, '自由': 0xfbbf24 };
  var GCOL = { A: 0x3ec9b9, B: 0x4a8fe7, C: 0x8b93a7 };

  function loadSet(k) { try { return new Set(JSON.parse(localStorage.getItem(k) || '[]')); } catch (e) { return new Set(); } }
  function saveSet(k, s) { try { localStorage.setItem(k, JSON.stringify(Array.from(s))); } catch (e) { } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function on(t, el, ev, fn) { if (!el) return; el.addEventListener(ev, fn); listeners.push([el, ev, fn]); }

  /* ---------------- 数据 ---------------- */
  function load() {
    if (loading) loading.textContent = '正在载入 631 条…';
    return fetch('/js/lib/kb-data.json', { cache: 'force-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        DATA = d; items = d.items || []; sections = d.sections || [];
        bySec = {};
        items.forEach(function (it, i) { (bySec[it.s] = bySec[it.s] || []).push(i); });
        buildFilters();
        applyFilter();
        if (loading) loading.style.display = 'none';
      })
      .catch(function (e) {
        if (loading) { loading.style.display = ''; loading.textContent = '数据载入失败：' + e.message; }
        throw e;
      });
  }

  /* ---------------- 筛选面板 ---------------- */
  var FILTERS = [
    { key: 'g', label: '证据等级', vals: ['A', 'B', 'C'] },
    { key: 'r', label: '性价比', vals: ['极高', '高', '一般'] },
    { key: 'k', label: '口径', vals: ['死亡率', '金钱', '时间', '自由'] },
    { key: 'm', label: '花钱', vals: ['0', '少', '多'], alias: { '0': '不花钱' } },
    { key: 'tm', label: '花时间', vals: ['少', '中', '多'] },
    { key: 'w', label: '要毅力', vals: ['否', '些', '是'] },
    { key: 'b', label: '收益', vals: ['大', '中', '小'] }
  ];
  var picked = {};

  function buildFilters() {
    if (!panel) return;
    var html = '';
    FILTERS.forEach(function (f) {
      html += '<div class="kb-fgrp"><div class="kb-flabel">' + esc(f.label) + '</div><div class="kb-fvals">';
      f.vals.forEach(function (v) {
        var txt = (f.alias && f.alias[v]) || v;
        html += '<button class="kb-chip" data-f="' + f.key + '" data-v="' + esc(v) + '">' + esc(txt) + '</button>';
      });
      html += '</div></div>';
    });
    html += '<div class="kb-fgrp"><div class="kb-flabel">章节</div><div class="kb-fvals kb-secs">';
    sections.forEach(function (s) {
      html += '<button class="kb-chip kb-sec" data-sec="' + s.id + '">' + s.id + '. ' + esc(s.title) + '</button>';
    });
    html += '</div></div>';
    html += '<div class="kb-fbar"><button id="kb-f-reset" class="kb-mini">清空筛选</button>'
      + '<button id="kb-fav-only" class="kb-mini">只看收藏</button>'
      + '<button id="kb-unread" class="kb-mini">只看未读</button></div>';
    panel.innerHTML = html;

    panel.querySelectorAll('.kb-chip').forEach(function (b) {
      on(0, b, 'click', function () {
        if (b.hasAttribute('data-sec')) {
          var sid = parseInt(b.getAttribute('data-sec'), 10);
          focusSec = (focusSec === sid) ? -1 : sid;
          panel.querySelectorAll('.kb-sec').forEach(function (x) { x.classList.remove('on'); });
          if (focusSec > 0) b.classList.add('on');
        } else {
          var f = b.getAttribute('data-f'), v = b.getAttribute('data-v');
          var arr = picked[f] || (picked[f] = []);
          var i = arr.indexOf(v);
          if (i >= 0) { arr.splice(i, 1); b.classList.remove('on'); }
          else { arr.push(v); b.classList.add('on'); }
        }
        applyFilter();
      });
    });
    on(0, $('kb-f-reset'), 'click', function () {
      picked = {}; focusSec = -1; favOnly = false; unreadOnly = false;
      panel.querySelectorAll('.kb-chip').forEach(function (x) { x.classList.remove('on'); });
      applyFilter();
    });
    on(0, $('kb-fav-only'), 'click', function () { favOnly = !favOnly; this.classList.toggle('on', favOnly); applyFilter(); });
    on(0, $('kb-unread'), 'click', function () { unreadOnly = !unreadOnly; this.classList.toggle('on', unreadOnly); applyFilter(); });
  }
  var favOnly = false, unreadOnly = false;

  function match(it, i) {
    for (var f in picked) {
      var arr = picked[f];
      if (arr.length && arr.indexOf(it[f]) < 0) return false;
    }
    if (focusSec > 0 && it.s !== focusSec) return false;
    if (favOnly && !fav.has(i)) return false;
    if (unreadOnly && read.has(i)) return false;
    if (query) {
      var q = query.toLowerCase();
      var hay = (it.t + ' ' + it.p + ' ' + it.e + ' ' + it.c + ' ' + it.note).toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }

  function applyFilter() {
    hit = new Uint8Array(items.length);
    hitCount = 0;
    items.forEach(function (it, i) { if (match(it, i)) { hit[i] = 1; hitCount++; } });
    if (countEl) countEl.textContent = hitCount + ' / ' + items.length + ' 条';
    tintParticles();
    renderList();
    updateProgress();
  }

  /* ---------------- 列表（右侧抽屉） ---------------- */
  function renderList() {
    if (!listEl) return;
    listIdx = [];
    items.forEach(function (it, i) { if (hit && hit[i]) listIdx.push(i); });
    var show = listIdx.slice(0, 120);
    var h = '<div class="kb-lhead">' + (focusSec > 0 ? '第 ' + focusSec + ' 节 · ' : (query ? '搜索结果 · ' : '全部条目 · '))
      + hitCount + ' 条' + (listIdx.length > 120 ? '（显示前 120）' : '') + '</div>';
    if (!show.length) h += '<div class="kb-empty">没有符合条件的条目</div>';
    show.forEach(function (i) {
      var it = items[i];
      h += '<a class="kb-li" href="#s' + it.s + '-' + it.n + '" data-i="' + i + '">'
        + '<span class="kb-lin">' + it.s + '.' + it.n + '</span>'
        + '<span class="kb-lit">' + hl(it.t) + '</span>'
        + '<span class="kb-lim"><i class="g' + it.g + '">' + it.g + '</i>'
        + (fav.has(i) ? '<i class="fav">★</i>' : '') + (read.has(i) ? '<i class="rd">✓</i>' : '')
        + '</span></a>';
    });
    listEl.innerHTML = h;
    listEl.querySelectorAll('.kb-li').forEach(function (a) {
      on(0, a, 'click', function (e) { e.preventDefault(); openItem(parseInt(a.getAttribute('data-i'), 10)); });
    });
  }

  function hl(s) {
    s = esc(s);
    if (!query) return s;
    try {
      var re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      return s.replace(re, '<mark>$1</mark>');
    } catch (e) { return s; }
  }

  /* ---------------- 详情 ---------------- */
  function openItem(i) {
    if (!detail || !items[i]) return;
    curIdx = i;
    var it = items[i];
    var h = '<div class="kb-dhead">'
      + '<div class="kb-dno">' + it.s + '.' + it.n + ' · ' + esc(secTitle(it.s)) + '</div>'
      + '<h3>' + hl(it.t) + '</h3>'
      + '<div class="kb-chips"><span class="kb-badge g' + it.g + '">' + it.g + ' 级</span>'
      + '<span class="kb-badge">性价比 ' + esc(it.r) + '</span>'
      + '<span class="kb-tag">口径 ' + esc(it.k) + '</span>'
      + '<span class="kb-tag">钱 ' + esc(it.m) + '</span>'
      + '<span class="kb-tag">时间 ' + esc(it.tm) + '</span>'
      + '<span class="kb-tag">毅力 ' + esc(it.w) + '</span>'
      + '<span class="kb-tag">收益 ' + esc(it.b) + '</span></div></div>';
    if (it.p) h += '<div class="kb-plain">' + hl(it.p) + '</div>';
    ['c', 'e', 'note'].forEach(function (k, n) {
      if (!it[k]) return;
      h += '<div class="kb-field' + (k === 'note' ? ' note' : '') + '"><b>' + ['成本', '收益', '备注'][n] + '</b><div>' + hl(it[k]) + '</div></div>';
    });
    if (it.src && it.src.length) {
      h += '<details class="kb-src" open><summary>' + esc(it.sn || ('来源（' + it.src.length + ' 条文献）')) + '</summary><ol>';
      it.src.forEach(function (s) {
        h += '<li>' + esc(s.t) + (s.u ? ' <a href="' + esc(s.u) + '" target="_blank" rel="noopener">原文 ↗</a>' : '') + '</li>';
      });
      h += '</ol></details>';
    }
    h += '<div class="kb-dacts">'
      + '<button id="kb-a-fav" class="kb-mini' + (fav.has(i) ? ' on' : '') + '">' + (fav.has(i) ? '★ 已收藏' : '☆ 收藏') + '</button>'
      + '<button id="kb-a-read" class="kb-mini' + (read.has(i) ? ' on' : '') + '">' + (read.has(i) ? '✓ 已读' : '标记已读') + '</button>'
      + '<button id="kb-a-link" class="kb-mini">复制链接</button>'
      + '<button id="kb-a-close" class="kb-mini">关闭</button></div>'
      + '<div class="kb-disc">内容版权归原作者 <a href="https://cdyforever.github.io/how-to-live-better/" target="_blank" rel="noopener">cdyforever</a> 所有，'
      + '本站为交互增强版。以上均为一般性信息，<b>不构成医疗、用药或法律建议</b>，请以官方文件与执业医师、律师的意见为准。</div>';
    detail.innerHTML = h;
    detail.classList.add('on');

    on(0, $('kb-a-fav'), 'click', function () {
      if (fav.has(i)) fav.delete(i); else fav.add(i);
      saveSet('mfy.kb.fav', fav); openItem(i); renderList(); updateProgress();
    });
    on(0, $('kb-a-read'), 'click', function () {
      if (read.has(i)) read.delete(i); else read.add(i);
      saveSet('mfy.kb.read', read); openItem(i); renderList(); updateProgress();
    });
    on(0, $('kb-a-link'), 'click', function () {
      var u = location.origin + location.pathname + '#s' + it.s + '-' + it.n;
      if (navigator.clipboard) navigator.clipboard.writeText(u);
      this.textContent = '已复制 ✓';
    });
    on(0, $('kb-a-close'), 'click', function () { detail.classList.remove('on'); curIdx = -1; });
    try { history.replaceState(null, '', '#s' + it.s + '-' + it.n); } catch (e) { }
  }

  function secTitle(id) {
    for (var i = 0; i < sections.length; i++) if (sections[i].id === id) return sections[i].title;
    return '';
  }
  function updateProgress() {
    if (!progFill || !progTxt) return;
    var p = items.length ? read.size / items.length : 0;
    progFill.style.width = (p * 100).toFixed(1) + '%';
    progTxt.textContent = '已读 ' + read.size + ' / ' + items.length + '　收藏 ' + fav.size;
  }

  /* ---------------- 3D 图谱 ---------------- */
  var renderer, scene, camera, secMeshes = [], points, pGeo, pMat, edges;
  var labelWrap, labels = [];
  var dragging = false, lx = 0, ly = 0, rotY = 0, rotX = 0.45, tRY = 0, tRX = 0.45, dist = 46;
  var autoSpin = true, raycaster, mouse = { x: 0, y: 0 };
  var itemPos = null, baseCol = null, dimCol = null;

  function buildScene() {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(stage.clientWidth, stage.clientHeight);
    stage.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(52, stage.clientWidth / stage.clientHeight, 0.1, 400);

    var KA = {
      '死亡率': [1, 1, 1], '金钱': [1, -1, -1], '时间': [-1, 1, -1], '自由': [-1, -1, 1]
    };
    var R = 14;
    var anchor = {};
    for (var k in KA) {
      var v = KA[k], L = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
      anchor[k] = new THREE.Vector3(v[0] / L * R, v[1] / L * R, v[2] / L * R);
    }

    // 节节点
    var gSec = {};
    sections.forEach(function (s) { (gSec[s.k] = gSec[s.k] || []).push(s); });
    var nodePos = {};
    for (var kk in gSec) {
      var arr = gSec[kk], a = anchor[kk];
      arr.forEach(function (s, i) {
        var n = arr.length;
        var phi = Math.acos(1 - 2 * (i + 0.5) / n);
        var theta = Math.PI * (1 + Math.sqrt(5)) * i;
        var rad = 4.2 + 0.9 * (n > 8 ? 1 : 0);
        var p = new THREE.Vector3(
          a.x + rad * Math.sin(phi) * Math.cos(theta) * 0.85,
          a.y + rad * Math.cos(phi) * 0.85,
          a.z + rad * Math.sin(phi) * Math.sin(theta) * 0.85
        );
        nodePos[s.id] = p;
        var r = 0.55 + Math.sqrt(s.count) * 0.19;
        var col = KCOL[s.k] || 0x8b93a7;
        var m = new THREE.Mesh(
          new THREE.SphereGeometry(r, 22, 16),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.92 })
        );
        m.position.copy(p);
        m.userData = { sec: s.id, r: r };
        scene.add(m);
        secMeshes.push(m);
        var glow = new THREE.Mesh(
          new THREE.SphereGeometry(r * 1.55, 18, 12),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.13 })
        );
        glow.position.copy(p); scene.add(glow);
      });
    }

    // 同星区内连线（链状，避免乱麻）
    var pts = [];
    for (var g in gSec) {
      var list = gSec[g];
      for (var i2 = 0; i2 + 1 < list.length; i2++) {
        var p1 = nodePos[list[i2].id], p2 = nodePos[list[i2 + 1].id];
        pts.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      }
    }
    var eGeo = new THREE.BufferGeometry();
    eGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    edges = new THREE.LineSegments(eGeo, new THREE.LineBasicMaterial({ color: 0x5b7bb5, transparent: true, opacity: 0.28 }));
    scene.add(edges);

    // 条目粒子
    var N = items.length;
    itemPos = new Float32Array(N * 3);
    baseCol = new Float32Array(N * 3);
    dimCol = new Float32Array(N * 3);
    var sizes = new Float32Array(N);
    var c = new THREE.Color();
    items.forEach(function (it, i) {
      var np = nodePos[it.s] || new THREE.Vector3();
      var arr = bySec[it.s] || [i];
      var j = arr.indexOf(i), n = Math.max(arr.length, 1);
      var phi = Math.acos(1 - 2 * (j + 0.5) / n);
      var theta = Math.PI * (1 + Math.sqrt(5)) * j;
      var rad = 1.55 + 0.5 * Math.sqrt(n) * 0.35 + (j % 3) * 0.28;
      itemPos[i * 3] = np.x + rad * Math.sin(phi) * Math.cos(theta);
      itemPos[i * 3 + 1] = np.y + rad * Math.cos(phi);
      itemPos[i * 3 + 2] = np.z + rad * Math.sin(phi) * Math.sin(theta);
      c.setHex(GCOL[it.g] || 0x8b93a7);
      baseCol[i * 3] = c.r; baseCol[i * 3 + 1] = c.g; baseCol[i * 3 + 2] = c.b;
      dimCol[i * 3] = c.r * 0.16; dimCol[i * 3 + 1] = c.g * 0.16; dimCol[i * 3 + 2] = c.b * 0.16;
      sizes[i] = it.g === 'A' ? 0.42 : (it.g === 'B' ? 0.36 : 0.3);
    });
    pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(itemPos.slice(), 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(baseCol.slice(), 3));
    pMat = new THREE.PointsMaterial({ size: 0.42, vertexColors: true, transparent: true, opacity: 0.95, sizeAttenuation: true });
    points = new THREE.Points(pGeo, pMat);
    scene.add(points);

    // 节标签（HTML 覆盖层）
    labelWrap = document.createElement('div');
    labelWrap.className = 'kb-labels';
    stage.appendChild(labelWrap);
    sections.forEach(function (s) {
      var d = document.createElement('div');
      d.className = 'kb-label';
      d.innerHTML = '<b>' + s.id + '</b> ' + esc(s.title) + '<i>' + s.count + '</i>';
      d.style.color = '#' + (KCOL[s.k] || 0x8b93a7).toString(16).padStart(6, '0');
      labelWrap.appendChild(d);
      labels.push({ el: d, pos: nodePos[s.id].clone(), sec: s.id });
    });

    raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.5;

    camera.position.set(0, 0, dist);
    on(0, renderer.domElement, 'pointerdown', function (e) { dragging = true; lx = e.clientX; ly = e.clientY; autoSpin = false; });
    on(0, window, 'pointerup', function () { dragging = false; });
    on(0, window, 'pointermove', function (e) {
      if (!dragging) return;
      tRY += (e.clientX - lx) * 0.005; tRX += (e.clientY - ly) * 0.005;
      tRX = Math.max(-1.35, Math.min(1.35, tRX));
      lx = e.clientX; ly = e.clientY;
    });
    on(0, renderer.domElement, 'wheel', function (e) {
      e.preventDefault();
      dist = Math.max(16, Math.min(90, dist + e.deltaY * 0.045));
    }, { passive: false });
    on(0, renderer.domElement, 'click', function (e) {
      var r = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      var hs = raycaster.intersectObjects(secMeshes, false);
      if (hs.length) {
        var sid = hs[0].object.userData.sec;
        focusSec = (focusSec === sid) ? -1 : sid;
        panel.querySelectorAll('.kb-sec').forEach(function (x) { x.classList.toggle('on', parseInt(x.getAttribute('data-sec'), 10) === focusSec); });
        applyFilter();
        return;
      }
      var hp = raycaster.intersectObject(points, false);
      if (hp.length && hp[0].index != null) openItem(hp[0].index);
    });
    on(0, window, 'resize', onResize);
    animate();
  }

  function tintParticles() {
    if (!pGeo) return;
    var col = pGeo.getAttribute('color');
    if (!col) return;
    for (var i = 0; i < items.length; i++) {
      var src = (hit && hit[i]) ? baseCol : dimCol;
      col.array[i * 3] = src[i * 3]; col.array[i * 3 + 1] = src[i * 3 + 1]; col.array[i * 3 + 2] = src[i * 3 + 2];
    }
    col.needsUpdate = true;
  }

  function onResize() {
    if (!renderer || !camera) return;
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  var vTmp = null;
  function animate() {
    if (disposed) return;
    raf = requestAnimationFrame(animate);
    if (autoSpin) tRY += 0.0016;
    rotY += (tRY - rotY) * 0.12; rotX += (tRX - rotX) * 0.12;
    camera.position.x = Math.sin(rotY) * Math.cos(rotX) * dist;
    camera.position.y = Math.sin(rotX) * dist;
    camera.position.z = Math.cos(rotY) * Math.cos(rotX) * dist;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);

    // 标签跟随
    if (!vTmp) vTmp = new THREE.Vector3();
    var w = stage.clientWidth, h = stage.clientHeight;
    labels.forEach(function (L) {
      vTmp.copy(L.pos).project(camera);
      var x = (vTmp.x * 0.5 + 0.5) * w, y = (-vTmp.y * 0.5 + 0.5) * h;
      var vis = vTmp.z < 1 && x > -60 && x < w + 60;
      L.el.style.display = vis ? '' : 'none';
      if (vis) {
        L.el.style.transform = 'translate(-50%,-50%) translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
        var d = camera.position.distanceTo(L.pos);
        L.el.style.opacity = (focusSec > 0 && L.sec !== focusSec) ? 0.25 : Math.max(0.35, Math.min(1, 1.5 - d / 70));
      }
    });
  }

  function fail(msg) {
    var d = document.createElement('div');
    d.className = 'kb-fallback'; d.textContent = msg;
    stage.appendChild(d);
  }

  /* ---------------- 顶栏 / 搜索 / 键盘 / 导出 ---------------- */
  function bindUI() {
    var timer = null;
    on(0, search, 'input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { query = (search.value || '').trim(); applyFilter(); }, 140);
    });
    on(0, $('kb-btn-filter'), 'click', function () {
      panel.classList.toggle('on'); this.classList.toggle('on', panel.classList.contains('on'));
    });
    on(0, $('kb-btn-list'), 'click', function () { listEl.classList.toggle('on'); });
    on(0, $('kb-btn-spin'), 'click', function () { autoSpin = !autoSpin; this.classList.toggle('on', autoSpin); this.textContent = autoSpin ? '自动旋转：开' : '自动旋转：关'; });
    on(0, $('kb-btn-export'), 'click', exportMd);
    on(0, $('kb-btn-reset'), 'click', function () {
      if (!confirm('清空本机收藏与已读记录？')) return;
      fav.clear(); read.clear(); saveSet('mfy.kb.fav', fav); saveSet('mfy.kb.read', read);
      applyFilter();
    });

    function onKey(e) {
      var t = e.target && e.target.tagName || '';
      if (/input|textarea/i.test(t)) {
        if (e.key === 'Escape') { search.value = ''; query = ''; applyFilter(); search.blur(); }
        return;
      }
      if (e.key === '/') { e.preventDefault(); search.focus(); }
      else if (e.key === 'Escape') { detail.classList.remove('on'); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        if (curIdx < 0) { if (listIdx.length) openItem(listIdx[0]); return; }
        var at = listIdx.indexOf(curIdx);
        if (at < 0) at = 0;
        var nx = e.key === 'ArrowRight' ? at + 1 : at - 1;
        if (nx >= 0 && nx < listIdx.length) openItem(listIdx[nx]);
      }
      else if (e.key === 'f' || e.key === 'F') { var b = $('kb-a-fav'); if (b) b.click(); }
      else if (e.key === 'r' || e.key === 'R') { var b2 = $('kb-a-read'); if (b2) b2.click(); }
    }
    window.addEventListener('keydown', onKey);
    listeners.push([window, 'keydown', onKey]);

    // 深链 #s1-3
    function fromHash() {
      var m = /^#s(\d+)-(\d+)$/.exec(location.hash || '');
      if (!m || !items.length) return;
      var s = parseInt(m[1], 10), n = parseInt(m[2], 10);
      for (var i = 0; i < items.length; i++) if (items[i].s === s && items[i].n === n) { openItem(i); return; }
    }
    window.addEventListener('hashchange', fromHash);
    listeners.push([window, 'hashchange', fromHash]);
    return fromHash;
  }

  function exportMd() {
    var out = ['# 我的《高性价比人生指南》摘录', '',
      '> 共 ' + fav.size + ' 条收藏 / ' + read.size + ' 条已读 · 导出于 ' + new Date().toLocaleString('zh-CN'), ''];
    var pickedIdx = Array.from(fav).sort(function (a, b) { return a - b; });
    if (!pickedIdx.length) pickedIdx = Array.from(read).sort(function (a, b) { return a - b; });
    if (!pickedIdx.length) { alert('还没有收藏或标记已读的条目'); return; }
    pickedIdx.forEach(function (i) {
      var it = items[i]; if (!it) return;
      out.push('## ' + it.s + '.' + it.n + ' ' + it.t + '　`[ ' + it.g + ' 级 · 性价比 ' + it.r + ' ]`', '');
      if (it.p) out.push(it.p, '');
      if (it.c) out.push('- 成本：' + it.c);
      if (it.e) out.push('- 收益：' + it.e);
      if (it.note) out.push('- 备注：' + it.note);
      if (it.src && it.src.length) { out.push('- 来源：'); it.src.forEach(function (s) { out.push('  - ' + s.t + (s.u ? ' <' + s.u + '>' : '')); }); }
      out.push('');
    });
    out.push('---', '', '内容版权归原作者 cdyforever 所有：https://cdyforever.github.io/how-to-live-better/',
      '本文件为个人摘录，不构成医疗、用药或法律建议。');
    var blob = new Blob([out.join('\n')], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '我的摘录-' + new Date().toISOString().slice(0, 10) + '.md';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }

  /* ---------------- 启动 ---------------- */
  var fromHash = bindUI();

  load().then(function () {
    if (disposed) return;
    return import('/js/lib/three.module.min.js');
  }).then(function (mod) {
    if (disposed) return;
    THREE = mod;
    buildScene();
    tintParticles();
    if (fromHash) fromHash();
  }).catch(function (e) {
    if (!disposed) fail('图谱加载失败：' + (e && e.message ? e.message : e));
  });

  window[NS] = function dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    listeners.forEach(function (l) { try { l[0].removeEventListener(l[1], l[2]); } catch (e) { } });
    listeners = [];
    if (renderer) { try { renderer.dispose(); } catch (e) { } }
    if (pGeo) { try { pGeo.dispose(); } catch (e) { } }
    if (pMat) { try { pMat.dispose(); } catch (e) { } }
    if (renderer && renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    window[NS] = null;
  };
})();
