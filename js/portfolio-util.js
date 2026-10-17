/* 作品集公共工具库：design.js / code.js / workshop.js 三页共用的渲染原语。
 * 目的：消除三份几乎一致的 esc / attachTilt / reveal / accItem / filterRow / toast 实现，
 *       并集中处理两处性能隐患：
 *         1) reveal 的「逐卡 3s 兜底定时器」→ 改为全站单一的文档级 flush（一次渲染 24 张不再挂 24 个计时器）；
 *         2) attachTilt 在触屏设备（无 hover）上仍绑 mousemove → 直接跳过，避免无效绑定与卡顿。
 * 依赖：本文件须在三个页面脚本之前加载（已在各自 pug 中 portfolio-core.js 之后引入）。
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 全站共享一个 IntersectionObserver 实例（原三页各建一个） */
  var io = ('IntersectionObserver' in window)
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
        });
      }, { threshold: 0.12 })
    : null;

  /* 兜底揭示：IntersectionObserver 未触发（快速跳转 / 滚动还原 / 异常）时，
     统一在 3s 后把剩余卡片强制揭示。用单一 timeout 而非逐卡计时器。 */
  var flushScheduled = false;
  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    setTimeout(function () {
      flushScheduled = false;
      var pending = document.querySelectorAll('.pf-reveal:not(.is-in)');
      for (var i = 0; i < pending.length; i++) pending[i].classList.add('is-in');
    }, 3000);
  }

  function reveal(el, i) {
    if (!el) return;
    el.classList.add('pf-reveal');
    if (el.style) el.style.transitionDelay = ((i || 0) % 8) * 60 + 'ms';
    if (io) io.observe(el); else el.classList.add('is-in');
    scheduleFlush();
  }

  /* 3D 悬浮倾斜：触屏设备（无 hover 能力）直接跳过，避免无效 mousemove 绑定 */
  function attachTilt(el, max, perspective) {
    if (!el) return;
    if (window.matchMedia && window.matchMedia('(hover: none)').matches) return;
    max = max || 6;
    perspective = perspective || 800;
    el.classList.add('pf-tilt');
    el.addEventListener('mousemove', function (e) {
      var r = el.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = 'perspective(' + perspective + 'px) rotateY(' + (px * max) + 'deg) rotateX(' + (-py * max) + 'deg)';
    });
    el.addEventListener('mouseleave', function () { el.style.transform = ''; });
  }

  /* 折叠区块：注意参数顺序是 (key, title, body, open)，key 用于 data-acc 锚点，title 为展示标题 */
  function accItem(key, title, body, open) {
    return '<section class="pf-acc-item' + (open ? ' is-open' : '') + '" data-acc="' + key + '">' +
      '<button type="button" class="pf-acc-head"><span>' + esc(title) + '</span><span class="pf-acc-ico">▾</span></button>' +
      '<div class="pf-acc-body">' + body + '</div></section>';
  }

  /* 一行筛选 chip 组 */
  function filterRow(labelText, options, isOn, onPick) {
    var row = document.createElement('div');
    row.className = 'pf-filter-row';
    var lb = document.createElement('span');
    lb.className = 'pf-filter-label';
    lb.textContent = labelText;
    row.appendChild(lb);
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      var on = isOn(o.k);
      b.className = 'pf-chip' + (on ? ' pf-chip--on' : '');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.textContent = o.label;
      b.addEventListener('click', function () { onPick(o.k); });
      row.appendChild(b);
    });
    return row;
  }

  /* 轻提示：优先复用既有 .pf-toast 节点（无 id 也兼容），无则创建。per-element 计时器，可重复调用。 */
  function toast(msg, opts) {
    opts = opts || {};
    var id = opts.id || 'pfToast';
    var el = document.getElementById(id);
    if (!el) el = document.querySelector('.pf-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = id; el.className = 'pf-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(el.__t);
    el.__t = setTimeout(function () { el.classList.remove('is-show'); }, opts.duration || 2200);
    return el;
  }

  window.PFUtil = {
    esc: esc,
    io: io,
    reveal: reveal,
    attachTilt: attachTilt,
    accItem: accItem,
    filterRow: filterRow,
    toast: toast,
    scheduleFlush: scheduleFlush
  };
})();
