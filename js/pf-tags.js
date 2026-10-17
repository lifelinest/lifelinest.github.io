/* 统一标签体系（T4）—— 三页共享的标签导航 + 标签总览抽屉
 *
 * 数据：window.PFTagsData（由 source/_data/tags.json 注入，见 generate_tags.js）
 * 挂载：#pfTagBar（页内标签条） / #pfTagDrawer（全部标签抽屉，可选）
 *
 * 跨页互通的做法：
 *   标签在三页统一归一（UI → UI 设计、高德地图 → 地图），
 *   点标签时若当前页有对应内容 → 就地筛选；否则跳到内容最多的那一页，
 *   并带上 ?tag=xxx，由目标页脚本读取后自动应用筛选。
 */
(function () {
  'use strict';
  var DATA = window.PFTagsData || { groups: [], tags: [] };
  var TAGS = Array.isArray(DATA.tags) ? DATA.tags : [];
  var GROUPS = Array.isArray(DATA.groups) ? DATA.groups : [];
  var PAGE_ORDER = ['design', 'code', 'workshop'];
  var PAGE_NAME = { design: '设计图仓', code: '微码仓库', workshop: '智造工坊' };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function currentPage() {
    var root = $('portfolio-page');
    return root ? (root.getAttribute('data-page') || '') : '';
  }

  /* ---------- 归一：别名 → 规范名 ---------- */
  var normMap = {};
  TAGS.forEach(function (t) {
    normMap[String(t.name).trim().toLowerCase()] = t.name;
    (t.alias || []).forEach(function (a) { normMap[String(a).trim().toLowerCase()] = t.name; });
    normMap[String(t.key || '').trim().toLowerCase()] = t.name;
  });
  function normalize(raw) {
    if (raw == null) return '';
    var s = String(raw).trim();
    if (!s) return '';
    return normMap[s.toLowerCase()] || s;
  }
  function find(name) {
    var n = normalize(name);
    for (var i = 0; i < TAGS.length; i++) if (TAGS[i].name === n) return TAGS[i];
    return null;
  }

  /* ---------- 小提示 ---------- */
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'pf-tag-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2200);
  }

  /* ---------- 跳转 / 应用 ---------- */
  function bestPage(t) {
    var cur = currentPage();
    var order = [cur].concat(PAGE_ORDER.filter(function (p) { return p !== cur; }));
    var best = '', bestN = 0;
    order.forEach(function (p) {
      var n = (t.counts && t.counts[p]) || 0;
      if (n > bestN) { bestN = n; best = p; }
    });
    return { page: best, count: bestN };
  }
  function applyTag(name) {
    var t = find(name);
    var real = t ? t.name : String(name);
    var cur = currentPage();
    var curCount = t ? ((t.counts && t.counts[cur]) || 0) : 0;

    // 当前页有内容 → 就地筛选
    if (curCount > 0 && typeof window.PFPageApplyTag === 'function') {
      if (window.PFPageApplyTag(real) !== false) {
        markActive(real);
        toast('已按「' + real + '」筛选本页');
        return;
      }
    }
    var b = t ? bestPage(t) : { page: '', count: 0 };
    if (b.page && b.count > 0) {
      if (b.page === cur && typeof window.PFPageApplyTag === 'function') {
        window.PFPageApplyTag(real);
        markActive(real);
        return;
      }
      location.href = '/' + b.page + '/?tag=' + encodeURIComponent(real);
      return;
    }
    toast('「' + real + '」暂无对应内容');
  }

  /* ---------- 标签条 ---------- */
  var topCache = [];
  var activeTag = '';
  function hotTags() {
    var cur = currentPage();
    var scored = TAGS.filter(function (t) { return t.total > 0; }).map(function (t) {
      var mine = (t.counts && t.counts[cur]) || 0;
      return { t: t, s: mine * 10 + t.total };
    });
    scored.sort(function (a, b) { return b.s - a.s; });
    return scored.slice(0, 14).map(function (x) { return x.t; });
  }
  function chipHtml(t, active) {
    var cur = currentPage();
    var mine = (t.counts && t.counts[cur]) || 0;
    var extra = mine ? '' : '<span class="pf-tagchip-x" title="本页无内容，点击跨页查看">↗</span>';
    return '<button class="pf-tagchip' + (active ? ' is-active' : '') + '" type="button" data-tag="' + esc(t.name) + '"' +
      ' title="共 ' + t.total + ' 项（设计 ' + t.counts.design + ' / 微码仓库 ' + t.counts.code + ' / 工坊 ' + t.counts.workshop + '）">' +
      '<span class="pf-tagchip-h">#</span>' + esc(t.name) +
      '<span class="pf-tagchip-n">' + t.total + '</span>' + extra + '</button>';
  }
  function renderBar() {
    var bar = $('pfTagBar');
    if (!bar) return;
    topCache = hotTags();
    /* 当前生效的标签若不在热标签里，补进首位，保证用户看得见"现在筛的是哪个" */
    if (activeTag) {
      var has = topCache.some(function (t) { return t.name === activeTag; });
      if (!has) { var at = find(activeTag); if (at) topCache = [at].concat(topCache); }
    }
    if (!topCache.length) { bar.hidden = true; return; }
    bar.innerHTML =
      '<span class="pf-tagbar-label">标签</span>' +
      '<div class="pf-tagbar-chips">' + topCache.map(function (t) { return chipHtml(t, t.name === activeTag); }).join('') + '</div>' +
      '<button class="pf-tagbar-more" type="button" id="pfTagMore">全部 ' + TAGS.filter(function (t) { return t.total > 0; }).length + ' 个 ›</button>';
    bar.hidden = false;
    bindChips(bar);
    var more = $('pfTagMore');
    if (more) more.addEventListener('click', function (e) { e.preventDefault(); openDrawer(); });
  }
  function bindChips(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll('.pf-tagchip'), function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        applyTag(btn.getAttribute('data-tag'));
      });
    });
  }
  function markActive(name) {
    activeTag = name || '';
    var bar = $('pfTagBar');
    if (bar && activeTag) {
      var hasChip = false;
      Array.prototype.forEach.call(bar.querySelectorAll('.pf-tagchip'), function (b) {
        if (b.getAttribute('data-tag') === activeTag) hasChip = true;
      });
      if (!hasChip) renderBar();   // 会把当前标签补到首位并高亮
    }
    [$('pfTagBar'), $('pfTagDrawer')].forEach(function (scope) {
      if (!scope) return;
      Array.prototype.forEach.call(scope.querySelectorAll('.pf-tagchip'), function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-tag') === activeTag);
      });
    });
  }

  /* ---------- 标签总览抽屉 ---------- */
  function drawerInner(kw) {
    var q = String(kw || '').trim().toLowerCase();
    var cur = currentPage();
    var hit = TAGS.filter(function (t) {
      if (!t.total) return false;
      if (!q) return true;
      return (t.name + ' ' + (t.alias || []).join(' ')).toLowerCase().indexOf(q) > -1;
    });
    if (!hit.length) return '<p class="pf-tag-empty">没有匹配的标签</p>';
    var usedGroups = GROUPS.filter(function (g) { return hit.some(function (t) { return t.group === g.key; }); });
    var other = hit.filter(function (t) { return !GROUPS.some(function (g) { return g.key === t.group; }); });
    if (other.length) usedGroups.push({ key: '__other', name: '其他', color: '#8b93a7' });
    return usedGroups.map(function (g) {
      var list = hit.filter(function (x) { return g.key === '__other' ? !GROUPS.some(function (gg) { return gg.key === x.group; }) : x.group === g.key; });
      if (!list.length) return '';
      var sum = { design: 0, code: 0, workshop: 0 };
      list.forEach(function (x) {
        PAGE_ORDER.forEach(function (p) { sum[p] += (x.counts && x.counts[p]) || 0; });
      });
      var hint = PAGE_ORDER.map(function (p) {
        return PAGE_NAME[p] + ' ' + sum[p];
      }).join(' · ');
      return '<div class="pf-taggroup">' +
        '<div class="pf-taggroup-head"><span class="pf-taggroup-dot" style="background:' + esc(g.color || '#8b93a7') + '"></span>' +
        esc(g.name) + '<span class="pf-taggroup-n">' + list.length + '</span></div>' +
        '<div class="pf-taggroup-chips">' + list.map(function (x) { return chipHtml(x, x.name === activeTag); }).join('') + '</div>' +
        '<div class="pf-taggroup-hint">本组内容：' + hint + '</div>' +
        '</div>';
    }).join('');
  }
  function renderDrawer(kw) {
    var body = $('pfTagDrawerBody');
    if (!body) return;
    body.innerHTML = drawerInner(kw);
    bindChips(body);
  }
  function openDrawer() {
    var d = $('pfTagDrawer');
    if (!d) return;
    renderDrawer('');
    d.hidden = false;
    document.body.style.overflow = 'hidden';
    var inp = $('pfTagSearch');
    if (inp) { inp.value = ''; setTimeout(function () { inp.focus(); }, 30); }
  }
  function closeDrawer() {
    var d = $('pfTagDrawer');
    if (!d) return;
    d.hidden = true;
    document.body.style.overflow = '';
  }

  /* ---------- URL ?tag= ---------- */
  function fromUrl() {
    var m = (location.search || '').match(/[?&]tag=([^&#]+)/);
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (e) { return ''; }
  }

  function init() {
    renderBar();
    var d = $('pfTagDrawer');
    if (d) {
      var c = $('pfTagDrawerClose'), m2 = $('pfTagDrawerMask');
      if (c) c.addEventListener('click', closeDrawer);
      if (m2) m2.addEventListener('click', closeDrawer);
      var s = $('pfTagSearch');
      if (s) s.addEventListener('input', function () { renderDrawer(s.value); });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && d && !d.hidden) closeDrawer();
    });

    var t = fromUrl();
    if (t) {
      var real = normalize(t);
      setTimeout(function () {
        if (typeof window.PFPageApplyTag === 'function') window.PFPageApplyTag(real);
        markActive(real);
      }, 60);
    }

    window.PFTags = {
      normalize: normalize,
      find: function (n) { var t = find(n); return t ? JSON.parse(JSON.stringify(t)) : null; },
      list: function () { return TAGS.filter(function (t) { return t.total > 0; }); },
      groups: GROUPS,
      apply: applyTag,
      openDrawer: openDrawer,
      closeDrawer: closeDrawer,
      toast: toast
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
