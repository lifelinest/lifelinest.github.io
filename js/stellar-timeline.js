/*
 * StellarTimeline - 星辰相册「时间轴视图」+「相册架视图」渲染模块（普通 script，非 module）
 *
 * 依赖：window.STELLAR_DATA（stellar-data.js 生成的数据）
 * 导出：window.StellarTimeline = { mountTimeline, mountShelf, setTheme }
 *
 * 说明：
 * - 仅从 window.STELLAR_DATA 读数据，不引入外部库、不读写后端。
 * - 所有文本一律用 textContent 写入（天然转义，避免 XSS）；不使用 innerHTML 拼用户数据。
 * - 缩略图以 <img loading="lazy" style="object-fit:cover"> 铺满容器来「充当背景图」，
 *   兼顾原生懒加载与 onerror 占位（真正的 CSS background 无法用 loading="lazy"）。
 * - 所有样式 class 统一 stellar- 前缀；颜色走 CSS 变量 var(--anzhiyu-theme, #425AEF) 兜底。
 * - 注入的 <style> 只提供开箱即用的基础样式，用户后续写同名 class 的 CSS 即可覆盖。
 * - setTheme() 只给根节点切换明暗微调 class，主题色仍由 CSS 变量实际控制。
 *
 * ============ 使用的 class 名清单 ============
 * 时间轴：
 *   stellar-timeline          根节点
 *   stellar-tl-toolbar        顶部工具栏
 *   stellar-tl-search         搜索输入框
 *   stellar-tl-group          分组列表容器
 *   stellar-tl-year           年份大标题
 *   stellar-tl-month          月份小标题行
 *   stellar-tl-month-label    月份文字（如「3 月」）
 *   stellar-tl-month-count    月份「N 个相册」计数
 *   stellar-tl-grid           月份卡片网格
 *   stellar-tl-card           相册卡片（可点击）
 *   stellar-tl-media          卡片图片容器
 *   stellar-tl-body           卡片文字区
 *   stellar-tl-name           相册名
 *   stellar-tl-desc           相册描述
 *   stellar-tl-date           相册日期
 *   stellar-tl-empty          搜索无结果空状态
 * 相册架：
 *   stellar-shelf             根节点
 *   stellar-shelf-group       单个类型分组
 *   stellar-shelf-group-title 分组标题（如「城市」）
 *   stellar-shelf-group-label 分组标题文字
 *   stellar-shelf-count       分组相册数
 *   stellar-shelf-grid        分组卡片网格（3 列，正方形）
 *   stellar-shelf-card        相册卡片（可点击）
 *   stellar-shelf-media       正方形图片容器
 *   stellar-shelf-body        卡片文字区
 *   stellar-shelf-name        相册名
 *   stellar-shelf-desc        相册描述
 * 通用：
 *   stellar-thumb             缩略图 img（两个视图共用）
 *   stellar-thumb-failed      图片加载失败后的状态 class
 *   stellar-theme-dark        深色微调（setTheme(true) 添加）
 *   stellar-theme-light       浅色微调（setTheme(false) 添加）
 * ============================================
 */
(function (global) {
  'use strict';

  var THEME_FALLBACK = '#425AEF';
  var STYLE_ID = 'stellar-timeline-style';

  // 图片失败占位：深空渐变 + 星芒的内联 SVG data URI
  var PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#0b1024"/><stop offset="0.5" stop-color="#1b2450"/><stop offset="1" stop-color="#0b1024"/>' +
    '</linearGradient></defs>' +
    '<rect width="480" height="300" fill="url(#g)"/>' +
    '<path d="M240 112 l7 21 21 7 -21 7 -7 21 -7 -21 -21 -7 21 -7z" fill="#8fd8ff" opacity="0.9"/>' +
    '<text x="240" y="218" fill="#c6d8ff" font-size="18" text-anchor="middle" font-family="sans-serif">NO IMAGE</text>' +
    '</svg>'
  );

  // 同一容器重复 mount 时先销毁旧实例；instances 用于 setTheme 广播
  var registry = new WeakMap();
  var instances = [];
  var currentDark = null;

  /* ---------------- 工具函数 ---------------- */

  function getData() {
    var d = global.STELLAR_DATA || {};
    return {
      albums: Array.isArray(d.albums) ? d.albums : [],
      typeLabel: d.typeLabel || {},
      imgbedFolder: d.imgbedFolder || ''
    };
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text); // textContent 自动转义
    return node;
  }

  // 解析 "YYYY/MM/DD HH:mm:ss"，返回 { year, month, day, ts }
  function parseDate(dateStr) {
    var m = String(dateStr || '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (!m) return { year: null, month: null, day: null, ts: 0 };
    var y = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10);
    var d = parseInt(m[3], 10);
    return {
      year: y,
      month: mo,
      day: d,
      ts: new Date(y, mo - 1, d).getTime() || 0
    };
  }

  // 卡片上显示的日期：YYYY.MM.DD（解析失败则原样返回，始终用 textContent）
  function displayDate(dateStr) {
    var p = parseDate(dateStr);
    if (p.year == null) return dateStr || '';
    return p.year + '.' + pad(p.month) + '.' + pad(p.day);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  // 时间轴：按日期升序，无法解析的排最后
  function byDateAsc(a, b) {
    var ta = parseDate(a.date).ts, tb = parseDate(b.date).ts;
    if (!ta) return 1;
    if (!tb) return -1;
    return ta - tb;
  }

  // 生成缩略图 <img>（懒加载 + onerror 占位），返回 img 节点
  function makeThumb(album, failedClass) {
    var cover = album.cover || '';
    var img = el('img', 'stellar-thumb');
    img.loading = 'lazy';
    img.alt = album.name || '';
    if (cover) {
      img.setAttribute('data-src', cover); // 可选：供后续自定义懒加载读取
      img.src = cover;
    } else {
      img.setAttribute('data-failed', '1');
      img.src = PLACEHOLDER;
      img.classList.add('stellar-thumb-failed');
    }
    img.onerror = function () {
      if (img.getAttribute('data-failed')) return; // 防止占位图再次失败造成死循环
      img.setAttribute('data-failed', '1');
      img.src = PLACEHOLDER;
      img.classList.add('stellar-thumb-failed');
      if (failedClass) img.classList.add(failedClass);
    };
    return img;
  }

  // 根节点应用当前明暗微调 class
  function applyTheme(root) {
    if (currentDark === null) return;
    root.classList.toggle('stellar-theme-dark', currentDark);
    root.classList.toggle('stellar-theme-light', !currentDark);
  }

  // 幂等注入基础样式（仅一次）
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.stellar-timeline,.stellar-shelf{color:var(--anzhiyu-fontcolor,#333);font-family:inherit;}',
      '.stellar-tl-toolbar{display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;}',
      '.stellar-tl-search{flex:1;min-width:180px;box-sizing:border-box;padding:10px 16px;border-radius:999px;',
      '  border:1px solid var(--anzhiyu-theme,' + THEME_FALLBACK + ');',
      '  background:var(--anzhiyu-card-bg,rgba(255,255,255,.08));color:inherit;outline:none;backdrop-filter:blur(8px);}',
      '.stellar-tl-search::placeholder{opacity:.6;}',
      '.stellar-tl-group{margin-bottom:28px;}',
      '.stellar-tl-year{font-size:1.6em;font-weight:700;margin:18px 0 12px;',
      '  color:var(--anzhiyu-theme,' + THEME_FALLBACK + ');letter-spacing:1px;}',
      '.stellar-tl-month{display:flex;align-items:baseline;gap:10px;font-size:1.05em;font-weight:600;margin:14px 0 10px;opacity:.9;}',
      '.stellar-tl-month-count{font-size:.8em;font-weight:400;opacity:.65;}',
      '.stellar-tl-grid,.stellar-shelf-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));}',
      '.stellar-tl-card,.stellar-shelf-card{position:relative;overflow:hidden;cursor:pointer;',
      '  border-radius:14px;border:1px solid transparent;background:var(--anzhiyu-card-bg,rgba(255,255,255,.08));',
      '  backdrop-filter:blur(8px);transition:transform .25s ease,border-color .25s ease,box-shadow .25s ease;}',
      '.stellar-tl-card:hover,.stellar-shelf-card:hover{transform:translateY(-6px);',
      '  border-color:var(--anzhiyu-theme,' + THEME_FALLBACK + ');',
      '  box-shadow:0 12px 30px rgba(66,90,239,.28);}',
      '.stellar-tl-card:focus-visible,.stellar-shelf-card:focus-visible{outline:2px solid var(--anzhiyu-theme,' + THEME_FALLBACK + ');outline-offset:2px;}',
      '.stellar-tl-media,.stellar-shelf-media{position:relative;overflow:hidden;',
      '  background:linear-gradient(135deg,#0b1024 0%,#1b2450 50%,#0b1024 100%);}',
      '.stellar-tl-media{aspect-ratio:16/10;}',
      '.stellar-shelf-media{aspect-ratio:1/1;}',
      '.stellar-thumb{display:block;width:100%;height:100%;object-fit:cover;transition:transform .4s ease;}',
      '.stellar-tl-card:hover .stellar-thumb,.stellar-shelf-card:hover .stellar-thumb{transform:scale(1.06);}',
      '.stellar-thumb-failed{object-fit:contain;opacity:.9;}',
      '.stellar-tl-body,.stellar-shelf-body{padding:12px 14px;}',
      '.stellar-tl-name,.stellar-shelf-name{font-weight:600;font-size:1.02em;margin-bottom:4px;',
      '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.stellar-tl-desc,.stellar-shelf-desc{font-size:.85em;opacity:.72;line-height:1.4;',
      '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.stellar-tl-date{font-size:.75em;opacity:.55;margin-top:6px;letter-spacing:.5px;}',
      '.stellar-tl-empty{padding:56px 20px;text-align:center;opacity:.6;font-size:1.05em;}',
      '.stellar-shelf-group{margin-bottom:34px;}',
      '.stellar-shelf-group-title{display:flex;align-items:baseline;gap:10px;font-size:1.35em;font-weight:700;',
      '  margin:0 0 14px;padding-left:12px;border-left:3px solid var(--anzhiyu-theme,' + THEME_FALLBACK + ');}',
      '.stellar-shelf-count{font-size:.7em;font-weight:400;opacity:.6;}',
      '.stellar-shelf-grid{grid-template-columns:repeat(3,minmax(0,1fr));}',
      '.stellar-theme-dark .stellar-tl-card,.stellar-theme-dark .stellar-shelf-card{background:rgba(255,255,255,.05);}',
      '.stellar-theme-light .stellar-tl-card,.stellar-theme-light .stellar-shelf-card{background:rgba(255,255,255,.55);}',
      '@media(max-width:640px){.stellar-tl-grid{grid-template-columns:repeat(2,minmax(0,1fr));}',
      '  .stellar-shelf-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}',
      '@media(max-width:380px){.stellar-tl-grid,.stellar-shelf-grid{grid-template-columns:1fr;}}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  // 公共：校验并取出 onOpenAlbum 回调
  function getOpener(opts) {
    return opts && typeof opts.onOpenAlbum === 'function' ? opts.onOpenAlbum : null;
  }

  // 公共：注册实例（幂等 + setTheme 广播）
  function register(container, root, destroySelf, extraDestroy) {
    var old = registry.get(container);
    if (old) old.destroy();
    applyTheme(root);
    var inst = {
      root: root,
      destroy: function () {
        extraDestroy();
        if (root.parentNode) root.parentNode.removeChild(root);
        var i = instances.indexOf(inst);
        if (i >= 0) instances.splice(i, 1);
        if (registry.get(container) === inst) registry.delete(container);
      }
    };
    registry.set(container, inst);
    instances.push(inst);
    return inst;
  }

  /* ---------------- 时间轴视图 ---------------- */

  function mountTimeline(container, opts) {
    if (!container) throw new Error('[StellarTimeline] mountTimeline: container is required');
    ensureStyle();
    var opener = getOpener(opts);
    var albums = getData().albums;

    var root = el('div', 'stellar-timeline');

    // 顶部搜索框
    var toolbar = el('div', 'stellar-tl-toolbar');
    var search = el('input', 'stellar-tl-search');
    search.type = 'search';
    search.placeholder = '搜索相册名称 / 描述 / 地点';
    search.setAttribute('aria-label', '搜索相册');
    toolbar.appendChild(search);
    root.appendChild(toolbar);

    var group = el('div', 'stellar-tl-group');
    root.appendChild(group);

    // 卡片点击委托（键盘 Enter / Space 同样触发）
    function handleClick(e) {
      var card = e.target && e.target.closest ? e.target.closest('.stellar-tl-card') : null;
      if (!card || !root.contains(card) || !opener) return;
      var album = findAlbum(albums, card.getAttribute('data-id'));
      if (album) opener(album);
    }
    function handleKey(e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target && e.target.closest ? e.target.closest('.stellar-tl-card') : null;
      if (!card || !opener) return;
      e.preventDefault();
      var album = findAlbum(albums, card.getAttribute('data-id'));
      if (album) opener(album);
    }

    // 搜索输入：即时过滤 name / desc / address
    function handleInput() {
      var q = String(search.value || '').trim().toLowerCase();
      var list = !q ? albums : albums.filter(function (a) {
        return [a.name, a.desc, a.address].some(function (v) {
          return String(v || '').toLowerCase().indexOf(q) >= 0;
        });
      });
      renderTimeline(group, list);
    }

    search.addEventListener('input', handleInput);
    root.addEventListener('click', handleClick);
    root.addEventListener('keydown', handleKey);

    renderTimeline(group, albums);
    container.textContent = ''; // 幂等：清空容器（若有旧实例，register 内已先销毁）
    container.appendChild(root);

    register(container, root, function () {}, function () {
      search.removeEventListener('input', handleInput);
      root.removeEventListener('click', handleClick);
      root.removeEventListener('keydown', handleKey);
    });

    return {
      destroy: function () { registry.get(container) && registry.get(container).destroy(); }
    };
  }

  function renderTimeline(group, albums) {
    group.textContent = '';
    if (!albums.length) {
      group.appendChild(el('div', 'stellar-tl-empty', '没有找到匹配的相册'));
      return;
    }

    // year -> { year, months: { month -> [album] } }
    var years = {};
    albums.slice().sort(byDateAsc).forEach(function (a) {
      var p = parseDate(a.date);
      var y = p.year == null ? '未知' : p.year;
      var mo = p.month == null ? '未知' : p.month;
      if (!years[y]) years[y] = { year: y, months: {} };
      if (!years[y].months[mo]) years[y].months[mo] = [];
      years[y].months[mo].push(a);
    });

    Object.keys(years).sort(function (a, b) {
      if (a === '未知') return 1;
      if (b === '未知') return -1;
      return Number(a) - Number(b);
    }).forEach(function (y) {
      var yearBlock = years[y];
      var yearTitle = el('div', 'stellar-tl-year', y === '未知' ? '未知年份' : y + ' 年');
      group.appendChild(yearTitle);

      Object.keys(yearBlock.months).sort(function (a, b) {
        if (a === '未知') return 1;
        if (b === '未知') return -1;
        return Number(a) - Number(b);
      }).forEach(function (mo) {
        var list = yearBlock.months[mo];
        var monthTitle = el('div', 'stellar-tl-month');
        monthTitle.appendChild(el('span', 'stellar-tl-month-label', (mo === '未知' ? '未知' : mo) + ' 月'));
        monthTitle.appendChild(el('span', 'stellar-tl-month-count', '· ' + list.length + ' 个相册'));
        group.appendChild(monthTitle);

        var grid = el('div', 'stellar-tl-grid');
        list.forEach(function (a) { grid.appendChild(makeTimelineCard(a)); });
        group.appendChild(grid);
      });
    });
  }

  function makeTimelineCard(album) {
    var card = el('div', 'stellar-tl-card');
    card.setAttribute('data-id', String(album.id));
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    var media = el('div', 'stellar-tl-media');
    media.appendChild(makeThumb(album));
    card.appendChild(media);

    var body = el('div', 'stellar-tl-body');
    body.appendChild(el('div', 'stellar-tl-name', album.name));
    body.appendChild(el('div', 'stellar-tl-desc', album.desc));
    body.appendChild(el('time', 'stellar-tl-date', displayDate(album.date)));
    card.appendChild(body);
    return card;
  }

  /* ---------------- 相册架视图 ---------------- */

  function mountShelf(container, opts) {
    if (!container) throw new Error('[StellarTimeline] mountShelf: container is required');
    ensureStyle();
    var opener = getOpener(opts);
    var data = getData();
    var albums = data.albums;
    var typeLabel = data.typeLabel;

    var root = el('div', 'stellar-shelf');

    function handleClick(e) {
      var card = e.target && e.target.closest ? e.target.closest('.stellar-shelf-card') : null;
      if (!card || !root.contains(card) || !opener) return;
      var album = findAlbum(albums, card.getAttribute('data-id'));
      if (album) opener(album);
    }
    function handleKey(e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target && e.target.closest ? e.target.closest('.stellar-shelf-card') : null;
      if (!card || !opener) return;
      e.preventDefault();
      var album = findAlbum(albums, card.getAttribute('data-id'));
      if (album) opener(album);
    }

    root.addEventListener('click', handleClick);
    root.addEventListener('keydown', handleKey);

    // 按 typeLabel 的 key 顺序分四组（城市/自然/人像/静物）
    Object.keys(typeLabel).forEach(function (type) {
      var list = albums.filter(function (a) { return a.type === type; });
      if (!list.length) return;

      var section = el('section', 'stellar-shelf-group');
      var title = el('h3', 'stellar-shelf-group-title');
      title.appendChild(el('span', 'stellar-shelf-group-label', typeLabel[type]));
      title.appendChild(el('span', 'stellar-shelf-count', '(' + list.length + ')'));
      section.appendChild(title);

      var grid = el('div', 'stellar-shelf-grid');
      list.forEach(function (a) { grid.appendChild(makeShelfCard(a)); });
      section.appendChild(grid);
      root.appendChild(section);
    });

    // 类型未标注的相册兜底成一组，避免数据遗漏
    var known = Object.keys(typeLabel);
    var rest = albums.filter(function (a) { return known.indexOf(a.type) < 0; });
    if (rest.length) {
      var section = el('section', 'stellar-shelf-group');
      var title = el('h3', 'stellar-shelf-group-title');
      title.appendChild(el('span', 'stellar-shelf-group-label', '其他'));
      title.appendChild(el('span', 'stellar-shelf-count', '(' + rest.length + ')'));
      section.appendChild(title);
      var grid = el('div', 'stellar-shelf-grid');
      rest.forEach(function (a) { grid.appendChild(makeShelfCard(a)); });
      section.appendChild(grid);
      root.appendChild(section);
    }

    container.textContent = ''; // 幂等
    container.appendChild(root);

    register(container, root, function () {}, function () {
      root.removeEventListener('click', handleClick);
      root.removeEventListener('keydown', handleKey);
    });

    return {
      destroy: function () { registry.get(container) && registry.get(container).destroy(); }
    };
  }

  function makeShelfCard(album) {
    var card = el('div', 'stellar-shelf-card');
    card.setAttribute('data-id', String(album.id));
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    var media = el('div', 'stellar-shelf-media');
    media.appendChild(makeThumb(album));
    card.appendChild(media);

    var body = el('div', 'stellar-shelf-body');
    body.appendChild(el('div', 'stellar-shelf-name', album.name));
    body.appendChild(el('div', 'stellar-shelf-desc', album.desc));
    card.appendChild(body);
    return card;
  }

  /* ---------------- 公共工具 & 导出 ---------------- */

  function findAlbum(albums, id) {
    for (var i = 0; i < albums.length; i++) {
      if (String(albums[i].id) === String(id)) return albums[i];
    }
    return null;
  }

  function setTheme(isDark) {
    currentDark = !!isDark;
    instances.forEach(function (inst) { applyTheme(inst.root); });
  }

  global.StellarTimeline = {
    mountTimeline: mountTimeline,
    mountShelf: mountShelf,
    setTheme: setTheme
  };
})(window);
