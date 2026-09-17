/* 精选资源导航（T4）—— 三页各内置一块领域资源面板
 *
 * 数据：window.PFResData（source/_data/resources.json，按 design/code/workshop 分键）
 * 挂载：#pfResNav
 * 特性：分组可折叠、记住折叠状态（localStorage）、外链新窗口打开、关键词过滤
 */
(function () {
  'use strict';
  var ALL = window.PFResData || {};
  var KEY = 'pf_res_collapse_v1';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function page() {
    var r = $('portfolio-page');
    return r ? (r.getAttribute('data-page') || '') : '';
  }
  function host(url) {
    try { return String(url).replace(/^https?:\/\//, '').split('/')[0]; } catch (e) { return ''; }
  }
  function loadCollapse() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function saveCollapse(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }

  var conf = null;

  function itemHtml(it) {
    return '<a class="pf-res-item" href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer">' +
      '<span class="pf-res-ico">' + esc((it.name || '·').charAt(0).toUpperCase()) + '</span>' +
      '<span class="pf-res-meta">' +
        '<span class="pf-res-name">' + esc(it.name) + '</span>' +
        '<span class="pf-res-desc">' + esc(it.desc || '') + '</span>' +
      '</span>' +
      '<span class="pf-res-host">' + esc(host(it.url)) + '</span>' +
      '</a>';
  }

  function bodyHtml(kw) {
    if (!conf) return '';
    var q = String(kw || '').trim().toLowerCase();
    var col = loadCollapse();
    return conf.groups.map(function (g, gi) {
      var list = g.items.filter(function (it) {
        if (!q) return true;
        return (it.name + ' ' + (it.desc || '')).toLowerCase().indexOf(q) > -1;
      });
      if (!list.length) return '';
      var collapsed = !q && col[page() + ':' + g.name];
      return '<section class="pf-res-group' + (collapsed ? ' is-collapsed' : '') + '" data-res-g="' + esc(g.name) + '">' +
        '<button class="pf-res-group-head" type="button" aria-expanded="' + (collapsed ? 'false' : 'true') + '">' +
          '<span class="pf-res-arrow">▾</span>' +
          '<span class="pf-res-group-name">' + esc(g.name) + '</span>' +
          '<span class="pf-res-group-n">' + list.length + '</span>' +
        '</button>' +
        '<div class="pf-res-group-body">' + list.map(itemHtml).join('') + '</div>' +
        '</section>';
    }).join('') || '<p class="pf-res-empty">没有匹配的资源</p>';
  }

  function render(kw) {
    var box = $('pfResNavBody');
    if (!box) return;
    box.innerHTML = bodyHtml(kw);
    Array.prototype.forEach.call(box.querySelectorAll('.pf-res-group-head'), function (btn) {
      btn.addEventListener('click', function () {
        var sec = btn.closest('.pf-res-group');
        var g = sec.getAttribute('data-res-g');
        var collapsed = sec.classList.toggle('is-collapsed');
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        var col = loadCollapse();
        col[page() + ':' + g] = collapsed;
        saveCollapse(col);
      });
    });
  }

  function init() {
    var root = $('pfResNav');
    if (!root) return;
    conf = ALL[page()];
    if (!conf || !conf.groups || !conf.groups.length) { root.hidden = true; return; }
    var title = $('pfResTitle'), sub = $('pfResSub');
    if (title) title.textContent = conf.title || '精选资源';
    if (sub) sub.textContent = conf.sub || '';
    render('');
    var inp = $('pfResSearch');
    if (inp) inp.addEventListener('input', function () { render(inp.value); });
    var toggle = $('pfResToggle');
    if (toggle) toggle.addEventListener('click', function () {
      var collapsed = root.classList.toggle('is-closed');
      toggle.setText && toggle.setText(collapsed ? '展开' : '收起');
      toggle.textContent = collapsed ? '展开' : '收起';
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
    window.PFRes = { render: render, open: function () { root.classList.remove('is-closed'); } };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
