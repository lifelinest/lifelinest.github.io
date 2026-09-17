/* 作品集核心：跨页全局搜索 + 统一收藏中心（设计图仓 / 微码仓库 / 智造工坊 共享）
 * 索引：/pf-index.json  （由 source 数据生成，结构见 generate_pf_index.js）
 * 收藏：localStorage 键 pf_collection_v1
 */
(function () {
  'use strict';
  var COL_KEY = 'pf_collection_v1';
  var idx = null;            // 搜索索引
  var idxLoading = false;
  var idxWaiters = [];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- 统一收藏 ---------- */
  function loadCol() {
    try { return JSON.parse(localStorage.getItem(COL_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveCol(a) {
    localStorage.setItem(COL_KEY, JSON.stringify(a));
    updateBadge();
  }
  function updateBadge() {
    var b = $('pfColBadge');
    if (b) b.textContent = loadCol().length;
  }
  function isCollected(id) {
    return loadCol().some(function (x) { return x.id === id; });
  }
  function toggleCollect(item) {
    var a = loadCol();
    var i = -1;
    for (var k = 0; k < a.length; k++) { if (a[k].id === item.id) { i = k; break; } }
    var added;
    if (i >= 0) { a.splice(i, 1); added = false; }
    else { a.unshift(item); added = true; }
    saveCol(a);
    return added;
  }
  function renderCollection() {
    var list = $('pfColList'), empty = $('pfColEmpty');
    if (!list) return;
    var a = loadCol();
    list.innerHTML = '';
    if (!a.length) { if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    a.forEach(function (it) {
      var el = document.createElement('a');
      el.className = 'pf-col-item';
      el.href = it.url || '#';
      var thumb = it.image
        ? '<span class="pf-col-thumb" style="background-image:url(' + esc(it.image) + ')"></span>'
        : '<span class="pf-col-thumb pf-col-thumb--empty">无图</span>';
      el.innerHTML =
        thumb +
        '<span class="pf-col-meta">' +
          '<span class="pf-col-name">' + esc(it.title) + '</span>' +
          '<span class="pf-col-kind">' + esc(it.kind || '') + '</span>' +
        '</span>' +
        '<button class="pf-col-remove" type="button" data-id="' + esc(it.id) + '" aria-label="移除">×</button>';
      list.appendChild(el);
    });
    Array.prototype.forEach.call(list.querySelectorAll('.pf-col-remove'), function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var id = btn.getAttribute('data-id');
        var a2 = loadCol().filter(function (x) { return x.id !== id; });
        saveCol(a2);
        renderCollection();
        syncCollectButtons();
      });
    });
  }
  function openCollection() {
    var d = $('pfColDrawer');
    if (!d) return;
    renderCollection();
    d.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeCollection() {
    var d = $('pfColDrawer');
    if (!d) return;
    d.hidden = true;
    document.body.style.overflow = '';
  }

  /* 供各页脚本调用：在卡片/详情上同步 ★ 状态 */
  function syncCollectButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-collect-id]'), function (btn) {
      var on = isCollected(btn.getAttribute('data-collect-id'));
      btn.classList.toggle('is-on', on);
      var label = btn.querySelector('.pf-col-label');
      if (label) label.textContent = on ? '已收藏' : '收藏';
    });
  }
  function bindCollectButton(btn, item) {
    if (!btn) return;
    btn.setAttribute('data-collect-id', item.id);
    btn.classList.add('pf-collect-btn');
    if (!btn.querySelector('.pf-col-label')) {
      btn.insertAdjacentHTML('beforeend', ' <span class="pf-col-label"></span>');
    }
    var on = isCollected(item.id);
    btn.classList.toggle('is-on', on);
    var label = btn.querySelector('.pf-col-label');
    if (label) label.textContent = on ? '已收藏' : '收藏';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var added = toggleCollect(item);
      btn.classList.toggle('is-on', added);
      var lb = btn.querySelector('.pf-col-label');
      if (lb) lb.textContent = added ? '已收藏' : '收藏';
      updateBadge();
    });
  }

  /* ---------- 全局搜索 ---------- */
  function loadIndex(cb) {
    if (idx) { cb(idx); return; }
    if (idxLoading) { idxWaiters.push(cb); return; }
    idxLoading = true;
    fetch('/pf-index.json', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        idx = Array.isArray(j) ? j : (j.items || []);
        idxLoading = false;
        cb(idx);
        idxWaiters.forEach(function (w) { w(idx); });
        idxWaiters = [];
      })
      .catch(function () {
        idx = [];
        idxLoading = false;
        cb([]);
      });
  }
  function matchItem(it, q) {
    q = q.trim().toLowerCase();
    if (!q) return true;
    var hay = [it.title, it.desc, (it.tags || []).join(' '), it.kind, it.page]
      .join(' ').toLowerCase();
    return hay.indexOf(q) > -1;
  }
  function renderResults(q) {
    var box = $('pfSearchResults'), empty = $('pfSearchEmpty');
    if (!box) return;
    loadIndex(function (items) {
      var hits = items.filter(function (it) { return matchItem(it, q); });
      box.innerHTML = '';
      if (!hits.length) { if (empty) empty.hidden = false; return; }
      if (empty) empty.hidden = true;
      hits.slice(0, 40).forEach(function (it) {
        var a = document.createElement('a');
        a.className = 'pf-search-item';
        a.href = it.url || '#';
        var tags = (it.tags || []).slice(0, 4).map(function (t) {
          return '<span class="pf-search-tag">#' + esc(t) + '</span>';
        }).join('');
        var thumb = it.image
          ? '<span class="pf-search-thumb" style="background-image:url(' + esc(it.image) + ')"></span>'
          : '<span class="pf-search-thumb pf-search-thumb--empty">' + esc((it.kind || '·').charAt(0)) + '</span>';
        a.innerHTML =
          thumb +
          '<span class="pf-search-meta">' +
            '<span class="pf-search-title">' + esc(it.title) + '</span>' +
            '<span class="pf-search-desc">' + esc(it.desc || '') + '</span>' +
            '<span class="pf-search-tags">' + tags + '</span>' +
          '</span>' +
          '<span class="pf-search-page">' + esc(it.kind || '') + '</span>';
        box.appendChild(a);
      });
    });
  }
  function openSearch() {
    var m = $('pfSearchModal'), inp = $('pfSearchInput');
    if (!m) return;
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    if (inp) { inp.value = ''; renderResults(''); setTimeout(function () { inp.focus(); }, 30); }
  }
  function closeSearch() {
    var m = $('pfSearchModal');
    if (!m) return;
    m.hidden = true;
    document.body.style.overflow = '';
  }

  /* ---------- 事件绑定 ---------- */
  function init() {
    updateBadge();
    var sBtn = $('pfGlobalSearchBtn'), cBtn = $('pfColBtn');
    if (sBtn) sBtn.addEventListener('click', openSearch);
    if (cBtn) cBtn.addEventListener('click', openCollection);

    var sClose = $('pfSearchClose'), sMask = $('pfSearchMask');
    if (sClose) sClose.addEventListener('click', closeSearch);
    if (sMask) sMask.addEventListener('click', closeSearch);
    var sInp = $('pfSearchInput');
    if (sInp) sInp.addEventListener('input', function () { renderResults(sInp.value); });

    var cClose = $('pfColClose'), cMask = $('pfColMask'), cClear = $('pfColClear');
    if (cClose) cClose.addEventListener('click', closeCollection);
    if (cMask) cMask.addEventListener('click', closeCollection);
    if (cClear) cClear.addEventListener('click', function () {
      if (!loadCol().length) return;
      if (confirm('确定清空所有收藏？')) { saveCol([]); renderCollection(); syncCollectButtons(); }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if ($('pfSearchModal') && !$('pfSearchModal').hidden) closeSearch();
        else if ($('pfColDrawer') && !$('pfColDrawer').hidden) closeCollection();
      }
    });
    window.PF = {
      collect: function (item) { return toggleCollect(item); },
      isCollected: isCollected,
      bindCollect: bindCollectButton,
      sync: syncCollectButtons,
      openCollection: openCollection,
      openSearch: openSearch
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
