/* 智造工坊 —— 精选项目 Hero + 项目卡 + 详情弹窗 + 数字滚动 + 进度条 */
(function () {
  var baseData = Array.isArray(window.workshopData) ? window.workshopData.slice() : [];
  var DRAFT_KEY = 'ws_user_projects';
  var drafts = loadDrafts();
  var data = drafts.concat(baseData);
  var grid = document.getElementById('pfGrid');
  var filters = document.getElementById('pfFilters');
  var search = document.getElementById('pfSearch');
  var stats = document.getElementById('pfStats');
  var empty = document.getElementById('pfEmpty');
  var featuredBox = document.getElementById('pfFeatured');
  var modal = document.getElementById('pfModal');
  var modalBody = document.getElementById('pfModalBody');
  var modalClose = document.getElementById('pfModalClose');
  var quick = document.getElementById('pfQuick');
  var quickClose = document.getElementById('pfQuickClose');

  if (!grid) return;

  var state = { category: 'all', level: 'all', period: 'all', keyword: '' };

  /* ---------------- 草稿（极速创建）存储 ---------------- */
  function loadDrafts() {
    try {
      var a = JSON.parse(localStorage.getItem(DRAFT_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function saveDrafts(list) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function refreshData() {
    drafts = loadDrafts();
    data = drafts.concat(baseData);
  }
  function renderAll() { renderStats(); renderFeatured(); renderFilters(); renderGrid(); }
  function uid() { return 'user-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function normBom(b) {
    var price = parseFloat(b.unitPrice) || 0;
    var m = String(b.qty || '').match(/约?\s*(\d+(?:\.\d+)?)\s*([^\d\s(]*)/);
    var qtyNum = m ? parseFloat(m[1]) : 1;
    return {
      name: b.name, spec: b.spec || '', qty: b.qty || '', cost: price ? '¥' + price : '',
      note: b.note || '', qtyNum: qtyNum, unit: m ? (m[2] || '') : '',
      subtotal: price ? Math.round(price * qtyNum * 100) / 100 : 0,
      priced: price > 0, unitPrice: price
    };
  }


  /* 规格筛选维度（豆包文档）：分类 / 难度 / 周期 */
  var SPEC_CATS = ['电子DIY', '机械拼装', '3D打印', '手工文创', '工具改造'];
  var SPEC_LEVELS = ['入门', '进阶', '硬核'];
  var SPEC_PERIODS = ['1天内', '1周内', '1月内'];

  /* 以下原语实现统一在 portfolio-util.js（已由 pug 在页面脚本前引入） */
  var esc = PFUtil.esc;
  var reveal = PFUtil.reveal;
  var attachTilt = PFUtil.attachTilt;
  var accItem = PFUtil.accItem;
  var filterRow = PFUtil.filterRow;
  var toast = PFUtil.toast;

  /* 数字滚动：解析 "100% 持久化" → 0 滚到 100，保留前后缀 */
  function parseNum(str) {
    var m = String(str).match(/^(\D*)(\d+)(.*)$/);
    return m ? { prefix: m[1], num: parseInt(m[2], 10), suffix: m[3] } : null;
  }
  function animateCounter(el, str) {
    var p = parseNum(str);
    if (!p) { el.textContent = str; return; }
    var dur = 1100, start = null;
    function tick(t) {
      if (start === null) start = t;
      var k = Math.min(1, (t - start) / dur);
      var eased = 1 - Math.pow(1 - k, 3);
      el.textContent = p.prefix + Math.round(p.num * eased) + p.suffix;
      if (k < 1) requestAnimationFrame(tick);
      else el.textContent = p.prefix + p.num + p.suffix;
    }
    requestAnimationFrame(tick);
  }
  function animateMetricsIn(root) {
    if (!root) return;
    root.querySelectorAll('.pf-metric-value').forEach(function (el) {
      animateCounter(el, el.getAttribute('data-count') || el.textContent);
    });
  }

  function uniq(key) {
    var seen = {}, out = [];
    data.forEach(function (d) {
      (d[key] || []).forEach(function (v) { if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
    });
    return out;
  }

  function statuses() {
    var seen = {}, out = [];
    data.forEach(function (d) { if (d.status && !seen[d.status]) { seen[d.status] = 1; out.push(d.status); } });
    return out;
  }

  function statusClass(s) {
    return 'pf-status' + (s === '已完成' ? ' pf-status--done' : (s === '进行中' ? ' pf-status--doing' : ''));
  }

  function metricsHtml(list, withData) {
    return (list || []).map(function (m) {
      return '<div><div class="pf-metric-label">' + esc(m.label) + '</div>' +
        '<div class="pf-metric-value"' + (withData ? ' data-count="' + esc(m.value) + '"' : '') + '>' + esc(m.value) + '</div></div>';
    }).join('');
  }

  function progressHtml(d) {
    var p = (typeof d.progress === 'number') ? d.progress : (d.status === '已完成' ? 100 : (d.status === '进行中' ? 50 : 20));
    var mod = d.status === '已完成' ? ' is-done' : (d.status === '进行中' ? ' is-doing' : '');
    return '<div class="pf-progress-row">' +
      '<div class="pf-progress"><span class="pf-progress-fill' + mod + '" style="width:' + p + '%"></span></div>' +
      '<span class="pf-progress-num">' + p + '%</span>' +
    '</div>';
  }

  function linksHtml(list) {
    return (list || []).filter(function (l) { return l && l.url; }).map(function (l) {
      return '<a class="pf-link-btn" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label || '链接') + '</a>';
    }).join('');
  }

  function renderStats() {
    if (!stats) return;
    stats.innerHTML = '';
    ['共 ' + data.length + ' 个项目', '技术栈 ' + uniq('stack').length + ' 种'].forEach(function (t) {
      var s = document.createElement('span');
      s.className = 'pf-stat';
      s.textContent = t;
      stats.appendChild(s);
    });
  }

  function renderFeatured() {
    if (!featuredBox) return;
    var f = data.filter(function (d) { return d.featured; })[0];
    if (!f) { featuredBox.hidden = true; return; }
    var stackHtml = (f.stack || []).map(function (s) { return '<span class="pf-tag">' + esc(s) + '</span>'; }).join('');
    featuredBox.innerHTML =
      '<article class="pf-proj-hero">' +
        '<div class="pf-hero-cover-wrap">' +
          (f.cover ? '<img class="pf-hero-cover" loading="lazy" src="' + esc(f.cover) + '" alt="">' : '') +
          '<span class="pf-hero-flag">精选项目</span>' +
        '</div>' +
        '<div class="pf-hero-body">' +
          '<div class="pf-hero-head"><h2 class="pf-proj-name">' + esc(f.name) + '</h2>' +
            (f.status ? '<span class="' + statusClass(f.status) + '">' + esc(f.status) + '</span>' : '') + '</div>' +
          '<p class="pf-proj-tagline">' + esc(f.tagline) + '</p>' +
          progressHtml(f) +
          (stackHtml ? '<div class="pf-proj-stack">' + stackHtml + '</div>' : '') +
          '<div class="pf-metrics">' + metricsHtml(f.metrics, true) + '</div>' +
          (linksHtml(f.links) ? '<div class="pf-modal-links">' + linksHtml(f.links) + '</div>' : '') +
        '</div>' +
      '</article>';
    var hero = featuredBox.querySelector('.pf-proj-hero');
    attachTilt(hero, 4);
    reveal(hero, 0);
    animateMetricsIn(featuredBox);
  }

  function fieldValues(key, specOrder) {
    var present = {};
    data.forEach(function (d) { if (d[key]) present[d[key]] = 1; });
    var out = specOrder.filter(function (v) { return present[v]; });
    /* 数据里有而规格清单外的值，也一并展示，避免"筛不到" */
    Object.keys(present).forEach(function (v) { if (out.indexOf(v) === -1) out.push(v); });
    return out;
  }

  function hasFilter() {
    return state.category !== 'all' || state.level !== 'all' || state.period !== 'all' || !!state.keyword.trim();
  }

  /* 一行筛选 chip 组（实现见 portfolio-util.js filterRow） */

  function renderFilters() {
    if (!filters) return;
    filters.innerHTML = '';

    filters.appendChild(filterRow(
      '分类',
      [{ k: 'all', label: '全部' }].concat(fieldValues('category', SPEC_CATS).map(function (c) { return { k: c, label: c }; })),
      function (k) { return state.category === k; },
      function (k) { state.category = k; renderFilters(); renderGrid(); }
    ));

    filters.appendChild(filterRow(
      '难度',
      [{ k: 'all', label: '全部' }].concat(fieldValues('level', SPEC_LEVELS).map(function (v) { return { k: v, label: v }; })),
      function (k) { return state.level === k; },
      function (k) { state.level = k; renderFilters(); renderGrid(); }
    ));

    filters.appendChild(filterRow(
      '周期',
      [{ k: 'all', label: '全部' }].concat(fieldValues('period', SPEC_PERIODS).map(function (v) { return { k: v, label: v }; })),
      function (k) { return state.period === k; },
      function (k) { state.period = k; renderFilters(); renderGrid(); }
    ));

    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'pf-reset';
    reset.textContent = '清空筛选';
    reset.hidden = !hasFilter();
    reset.addEventListener('click', function () {
      state.category = 'all'; state.level = 'all'; state.period = 'all'; state.keyword = '';
      if (search) search.value = '';
      renderFilters(); renderGrid();
    });
    var firstRow = filters.querySelector('.pf-filter-row');
    if (firstRow) firstRow.appendChild(reset);
  }

  function filtered() {
    var kw = state.keyword.trim().toLowerCase();
    var heroVisible = !hasFilter();
    return data.filter(function (d) {
      if (d.featured && heroVisible) return false;
      if (state.category !== 'all' && d.category !== state.category) return false;
      if (state.level !== 'all' && d.level !== state.level) return false;
      if (state.period !== 'all' && d.period !== state.period) return false;
      if (!kw) return true;
      var hay = [d.name, d.tagline, d.category, d.level, (d.stack || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(kw) > -1;
    });
  }

  function renderGrid() {
    var items = filtered();
    grid.innerHTML = '';
    if (featuredBox) featuredBox.hidden = hasFilter();
    if (!items.length) { if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;

    items.forEach(function (d, i) {
      var card = document.createElement('article');
      card.className = 'pf-proj' + (d.draft ? ' is-draft' : '');
      card.setAttribute('tabindex', '0');
      if (d.category) card.setAttribute('data-cat', d.category);
      if (d.level) card.setAttribute('data-level', d.level);
      if (d.period) card.setAttribute('data-period', d.period);
      var stackHtml = (d.stack || []).map(function (s) { return '<span class="pf-tag">' + esc(s) + '</span>'; }).join('');
      card.innerHTML =
        (!d.cover && d.draft ? '<div class="pf-proj-cover pf-proj-cover--empty">待补成品图</div>' : (d.cover ? '<img class="pf-proj-cover" loading="lazy" src="' + esc(d.cover) + '" alt="">' : '')) +
        '<div class="pf-proj-body">' +
        '<div class="pf-proj-head"><h3 class="pf-proj-name">' + esc(d.name) + '</h3>' +
        (d.draft ? '<span class="pf-draft-flag">草稿 · 待补全</span>' : (d.status ? '<span class="' + statusClass(d.status) + '">' + esc(d.status) + '</span>' : '')) + '</div>' +
        '<p class="pf-proj-tagline">' + esc(d.tagline || '') + '</p>' +
        (d.draft ? '<div class="pf-draft-hint">点击进入可补全步骤与物料清单</div>' : progressHtml(d)) +
        (stackHtml ? '<div class="pf-proj-stack">' + stackHtml + '</div>' : '') +
        '<div class="pf-metrics">' + metricsHtml(d.metrics, true) + '</div>' +
        '<button class="pf-collect-btn pf-proj-collect" type="button"><span class="pf-star">★</span><span class="pf-col-label"></span></button>' +
        '</div>';
      card.addEventListener('click', function () { openModal(d); });
      var colBtn = card.querySelector('.pf-proj-collect');
      if (colBtn && window.PF) {
        window.PF.bindCollect(colBtn, { id: 'workshop:' + d.id, title: d.name, desc: d.tagline, kind: '项目 · ' + (d.status || ''), url: '/workshop/', image: d.cover });
      }
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(d); }
      });
      attachTilt(card, 6);
      grid.appendChild(card);
      reveal(card, i);
    });
  }

  /* ---------------- 成品图轮播 + 视频入口 ---------------- */
  function galleryList(d) {
    var g = (d.gallery && d.gallery.length) ? d.gallery.slice() : (d.cover ? [d.cover] : []);
    return g;
  }
  function videoHtml(d) {
    return '<a class="pf-gal-video" href="' + esc(d.video) + '" target="_blank" rel="noopener">' +
      '<span class="pf-gal-play">▶</span>观看制作过程视频</a>';
  }
  function galleryHtml(d) {
    var g = galleryList(d);
    if (!g.length) return '';
    if (g.length === 1) {
      return '<div class="pf-gal pf-gal-single">' +
        '<div class="pf-gal-stage"><img class="pf-gal-img" src="' + esc(g[0]) + '" alt=""></div>' +
        (d.video ? videoHtml(d) : '') +
        '</div>';
    }
    var thumbs = g.map(function (s, i) {
      return '<button type="button" class="pf-gal-thumb' + (i === 0 ? ' is-on' : '') + '" data-i="' + i + '" aria-label="第 ' + (i + 1) + ' 张">' +
        '<img src="' + esc(s) + '" alt="" loading="lazy"></button>';
    }).join('');
    return '<div class="pf-gal" data-gal tabindex="0">' +
      '<div class="pf-gal-stage">' +
        '<img class="pf-gal-img" src="' + esc(g[0]) + '" alt="">' +
        '<button type="button" class="pf-gal-nav pf-gal-prev" aria-label="上一张">‹</button>' +
        '<button type="button" class="pf-gal-nav pf-gal-next" aria-label="下一张">›</button>' +
        '<span class="pf-gal-count">1 / ' + g.length + '</span>' +
      '</div>' +
      '<div class="pf-gal-thumbs">' + thumbs + '</div>' +
      (d.video ? videoHtml(d) : '') +
      '</div>';
  }
  function bindGallery(root, d) {
    var g = galleryList(d);
    var wrap = root.querySelector('[data-gal]');
    if (!wrap || g.length < 2) return;
    var img = wrap.querySelector('.pf-gal-img');
    var count = wrap.querySelector('.pf-gal-count');
    var thumbs = Array.prototype.slice.call(wrap.querySelectorAll('.pf-gal-thumb'));
    var idx = 0;
    function go(i) {
      idx = (i + g.length) % g.length;
      img.src = g[idx];
      if (count) count.textContent = (idx + 1) + ' / ' + g.length;
      thumbs.forEach(function (t, k) { t.classList.toggle('is-on', k === idx); });
    }
    wrap.querySelector('.pf-gal-prev').addEventListener('click', function (e) { e.stopPropagation(); go(idx - 1); });
    wrap.querySelector('.pf-gal-next').addEventListener('click', function (e) { e.stopPropagation(); go(idx + 1); });
    thumbs.forEach(function (t) {
      t.addEventListener('click', function () { go(parseInt(t.getAttribute('data-i'), 10)); });
    });
    wrap.__galGo = go;
  }

  /* ---------------- 草稿：补全编辑器 ---------------- */
  function opt(list, cur) {
    return list.map(function (v) {
      return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>';
    }).join('');
  }
  function field(label, inner) {
    return '<label class="pf-field"><span>' + esc(label) + '</span>' + inner + '</label>';
  }
  function draftEditorHtml(d) {
    var steps = (d.steps || []).map(function (s, i) {
      return '<li class="pf-edit-row"><span class="pf-edit-txt">' + esc(s.title) + '</span>' +
        '<button type="button" class="pf-edit-del" data-del-step="' + i + '">删除</button></li>';
    }).join('');
    var boms = (d.bom || []).map(function (b, i) {
      return '<li class="pf-edit-row"><span class="pf-edit-txt">' + esc(b.name) +
        (b.spec ? ' · ' + esc(b.spec) : '') + (b.priced ? ' · ¥' + trim2(b.unitPrice) : '') +
        '</span><button type="button" class="pf-edit-del" data-del-bom="' + i + '">删除</button></li>';
    }).join('');
    return accItem('edit', '补全草稿（基础信息 / 步骤 / 物料）',
      '<div class="pf-edit">' +
      '<div class="pf-field-row">' +
        field('名称', '<input type="text" id="pfEdName" value="' + esc(d.name) + '">') +
        field('状态', '<select id="pfEdStatus">' + opt(['草稿', '进行中', '已完成'], d.status) + '</select>') +
      '</div>' +
      field('一句话简介', '<input type="text" id="pfEdTagline" value="' + esc(d.tagline || '') + '" placeholder="一句话说清它是什么">') +
      '<div class="pf-field-row pf-field-row--3">' +
        field('分类', '<select id="pfEdCat">' + opt(SPEC_CATS, d.category) + '</select>') +
        field('难度', '<select id="pfEdLevel">' + opt(SPEC_LEVELS, d.level) + '</select>') +
        field('周期', '<select id="pfEdPeriod">' + opt(SPEC_PERIODS, d.period) + '</select>') +
      '</div>' +
      field('技术栈（逗号或顿号分隔）', '<input type="text" id="pfEdStack" value="' + esc((d.stack || []).join('、')) + '">') +
      '<button type="button" class="pf-mini pf-mini-wide" data-act="save-base">保存基础信息</button>' +

      '<h4 class="pf-edit-h">制作步骤</h4>' +
      (steps ? '<ul class="pf-edit-list">' + steps + '</ul>' : '<p class="pf-edit-empty">还没有步骤</p>') +
      '<div class="pf-field-row">' +
        field('步骤标题', '<input type="text" id="pfStepTitle" placeholder="例如：焊接主控板">') +
        field('说明', '<input type="text" id="pfStepDesc" placeholder="可选">') +
      '</div>' +
      '<button type="button" class="pf-mini" data-act="add-step">添加步骤</button>' +

      '<h4 class="pf-edit-h">物料清单</h4>' +
      (boms ? '<ul class="pf-edit-list">' + boms + '</ul>' : '<p class="pf-edit-empty">还没有物料</p>') +
      '<div class="pf-field-row pf-field-row--3">' +
        field('物料名称', '<input type="text" id="pfBomName" placeholder="例如：N20 电机">') +
        field('规格', '<input type="text" id="pfBomSpec" placeholder="可选">') +
        field('数量', '<input type="text" id="pfBomQty" placeholder="1 个">') +
      '</div>' +
      '<div class="pf-field-row">' +
        field('单价 ¥', '<input type="number" id="pfBomPrice" min="0" step="0.01" placeholder="0.00">') +
        field('备注', '<input type="text" id="pfBomNote" placeholder="可选">') +
      '</div>' +
      '<button type="button" class="pf-mini" data-act="add-bom">添加物料</button>' +

      '<div class="pf-edit-foot">' +
        '<button type="button" class="pf-mini" data-act="export">导出项目 JSON</button>' +
        '<button type="button" class="pf-mini pf-mini-danger" data-act="delete">删除草稿</button>' +
      '</div>' +
      '</div>', true);
  }
  function updateDraft(id, fn) {
    var list = loadDrafts();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { fn(list[i]); list[i].updatedAt = new Date().toISOString(); break; }
    }
    saveDrafts(list);
    refreshData();
    renderAll();
    for (var k = 0; k < data.length; k++) if (data[k].id === id) return data[k];
    return null;
  }
  function val(root, id) { var el = root.querySelector('#' + id); return el ? el.value : ''; }
  function bindDraftEditor(root, d) {
    if (!d.draft) return;
    var saveBase = root.querySelector('[data-act="save-base"]');
    if (saveBase) saveBase.addEventListener('click', function () {
      var stack = val(root, 'pfEdStack').split(/[、,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
      var next = updateDraft(d.id, function (x) {
        x.name = val(root, 'pfEdName').trim() || x.name;
        x.status = val(root, 'pfEdStatus');
        x.tagline = val(root, 'pfEdTagline').trim();
        x.category = val(root, 'pfEdCat');
        x.level = val(root, 'pfEdLevel');
        x.period = val(root, 'pfEdPeriod');
        x.stack = stack;
      });
      if (next) { openModal(next); toast('基础信息已保存'); }
    });
    var addStep = root.querySelector('[data-act="add-step"]');
    if (addStep) addStep.addEventListener('click', function () {
      var title = val(root, 'pfStepTitle').trim();
      if (!title) { toast('请先填写步骤标题'); return; }
      var desc = val(root, 'pfStepDesc').trim();
      var next = updateDraft(d.id, function (x) {
        x.steps = (x.steps || []).concat([{ title: title, desc: desc }]);
      });
      if (next) { openModal(next); toast('步骤已添加'); }
    });
    var addBom = root.querySelector('[data-act="add-bom"]');
    if (addBom) addBom.addEventListener('click', function () {
      var name = val(root, 'pfBomName').trim();
      if (!name) { toast('请先填写物料名称'); return; }
      var item = normBom({
        name: name, spec: val(root, 'pfBomSpec').trim(), qty: val(root, 'pfBomQty').trim(),
        unitPrice: val(root, 'pfBomPrice'), note: val(root, 'pfBomNote').trim()
      });
      var next = updateDraft(d.id, function (x) { x.bom = (x.bom || []).concat([item]); });
      if (next) { openModal(next); toast('物料已添加'); }
    });
    root.querySelectorAll('[data-del-step]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.getAttribute('data-del-step'), 10);
        var next = updateDraft(d.id, function (x) { x.steps.splice(i, 1); });
        if (next) openModal(next);
      });
    });
    root.querySelectorAll('[data-del-bom]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.getAttribute('data-del-bom'), 10);
        var next = updateDraft(d.id, function (x) { x.bom.splice(i, 1); });
        if (next) openModal(next);
      });
    });
    var exp = root.querySelector('[data-act="export"]');
    if (exp) exp.addEventListener('click', function () {
      download((d.name || 'project') + '.json', JSON.stringify(d, null, 2), 'application/json');
      toast('已导出项目 JSON');
    });
    var del = root.querySelector('[data-act="delete"]');
    if (del) del.addEventListener('click', function () {
      if (!window.confirm('删除草稿「' + d.name + '」？此操作不可撤销。')) return;
      saveDrafts(loadDrafts().filter(function (x) { return x.id !== d.id; }));
      refreshData(); renderAll(); closeModal();
      toast('草稿已删除');
    });
  }

  function openModal(d) {
    if (!modal || !modalBody) return;
    var detail = d.detail || {};
    var sections = [['背景', detail.background], ['挑战', detail.challenge], ['方案', detail.solution], ['成果', detail.result]]
      .filter(function (s) { return !!s[1]; })
      .map(function (s) { return '<h3>' + esc(s[0]) + '</h3><p>' + esc(s[1]) + '</p>'; }).join('');
    var stackHtml = (d.stack || []).map(function (s) { return '<span class="pf-tag">' + esc(s) + '</span>'; }).join('');
    modalBody.innerHTML =
      galleryHtml(d) +
      '<div class="pf-modal-head">' +
      (d.draft ? '<span class="pf-draft-flag">草稿</span>' : '') +
      '<h2>' + esc(d.name) + '</h2>' +
      (!d.draft && d.status ? '<span class="' + statusClass(d.status) + '">' + esc(d.status) + '</span>' : '') + '</div>' +
      (d.tagline ? '<p>' + esc(d.tagline) + '</p>' : '') +
      (d.draft ? '' : progressHtml(d)) +
      (stackHtml ? '<div class="pf-proj-stack" style="margin-top:12px">' + stackHtml + '</div>' : '') +
      ((d.metrics && d.metrics.length) ? '<div class="pf-metrics">' + metricsHtml(d.metrics, true) + '</div>' : '') +
      sections +
      (d.draft ? draftEditorHtml(d) : '') +
      renderDetailBlocks(d) +
      (linksHtml(d.links) ? '<div class="pf-modal-links">' + linksHtml(d.links) + '</div>' : '') +
      '<div class="pf-modal-actions"><button class="pf-collect-btn pf-modal-collect" type="button"><span class="pf-star">★</span><span class="pf-col-label"></span></button></div>';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    animateMetricsIn(modalBody);
    var mCol = modalBody.querySelector('.pf-modal-collect');
    if (mCol && window.PF) {
      window.PF.bindCollect(mCol, { id: 'workshop:' + d.id, title: d.name, desc: d.tagline, kind: '项目 · ' + (d.status || ''), url: '/workshop/', image: d.cover });
    }
    bindGallery(modalBody, d);
    bindDetailBlocks(modalBody, d);
    bindDraftEditor(modalBody, d);
  }

  /* ---------------- BOM 成本核算 / 导出 ---------------- */
  function trim2(n) { return (Math.round((n || 0) * 100) / 100).toFixed(2); }
  function bomStorageKey(d) { return 'ws_bom_' + d.id; }
  function bomSaved(d) {
    try { return JSON.parse(localStorage.getItem(bomStorageKey(d)) || '{}'); } catch (e) { return {}; }
  }
  function bomChecked(d, i) { return !!bomSaved(d)[i]; }
  function bomTotals(d) {
    var total = 0, ready = 0, priced = 0;
    (d.bom || []).forEach(function (b, i) {
      if (!b.priced) return;
      priced++;
      total += b.subtotal;
      if (bomChecked(d, i)) ready += b.subtotal;
    });
    return { total: total, ready: ready, priced: priced };
  }
  function bomSumText(t) {
    if (!t.priced) return '合计 —（全部为非采购项）';
    return '合计 ¥' + trim2(t.total) + ' · 已备 ¥' + trim2(t.ready) +
      ' · 待购 ¥' + trim2(t.total - t.ready) + '（' + t.priced + ' 项采购件）';
  }
  function bomCsv(d) {
    var rows = [['序号', '名称', '规格', '数量', '单价', '小计', '备注', '已备']];
    (d.bom || []).forEach(function (b, i) {
      rows.push([
        i + 1, b.name, b.spec || '', b.qty || '',
        b.priced ? trim2(b.unitPrice) : '', b.priced ? trim2(b.subtotal) : '',
        b.note || '', bomChecked(d, i) ? '是' : '否'
      ]);
    });
    var t = bomTotals(d);
    rows.push(['', '', '', '', '合计', trim2(t.total), '', '']);
    rows.push(['', '', '', '', '已备', trim2(t.ready), '', '']);
    return rows.map(function (r) {
      return r.map(function (c) {
        var s = String(c == null ? '' : c);
        return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\r\n');
  }
  function bomMarkdown(d) {
    var out = ['| # | 名称 | 规格 | 数量 | 单价 | 小计 | 备注 | 已备 |', '| --- | --- | --- | --- | --- | --- | --- | --- |'];
    (d.bom || []).forEach(function (b, i) {
      out.push('| ' + [i + 1, b.name, b.spec || '', b.qty || '',
        b.priced ? '¥' + trim2(b.unitPrice) : '—',
        b.priced ? '¥' + trim2(b.subtotal) : '非采购', b.note || '',
        bomChecked(d, i) ? '✅' : ''].join(' | ') + ' |');
    });
    var t = bomTotals(d);
    out.push('');
    out.push('> 合计 ¥' + trim2(t.total) + '，已备 ¥' + trim2(t.ready) + '，待购 ¥' + trim2(t.total - t.ready));
    return out.join('\n');
  }
  function download(filename, text, mime) {
    var blob = new Blob(['\ufeff' + text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1200);
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { ta.setSelectionRange(0, text.length); } catch (e) {}
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return legacyCopy(text); }
      );
    }
    return Promise.resolve(legacyCopy(text));
  }
  /* 轻提示（实现见 portfolio-util.js toast） */

  function renderDetailBlocks(d) {
    var html = '';
    if (d.steps && d.steps.length) {
      var nav = d.steps.map(function (s, i) {
        return '<button type="button" class="pf-steps-nav-item' + (i === 0 ? ' is-on' : '') + '" data-jump="' + i + '">' +
          '<span class="pf-nav-no">' + (i + 1) + '</span><span class="pf-nav-txt">' + esc(s.title) + '</span></button>';
      }).join('');
      var steps = d.steps.map(function (s, i) {
        return '<li class="pf-step" data-step="' + i + '">' +
          '<span class="pf-step-no">' + (i + 1) + '</span>' +
          '<div class="pf-step-body"><h4>' + esc(s.title) + '</h4>' +
          (s.desc ? '<p>' + esc(s.desc) + '</p>' : '') +
          (s.tip ? '<p class="pf-step-tip">提示：' + esc(s.tip) + '</p>' : '') +
          '</div></li>';
      }).join('');
      html += accItem('steps', '制作步骤',
        '<div class="pf-steps-wrap">' +
          '<nav class="pf-steps-nav" aria-label="步骤锚点导航">' + nav + '</nav>' +
          '<ol class="pf-steps">' + steps + '</ol>' +
        '</div>', true);
    }
    if (d.bom && d.bom.length) {
      var rows = d.bom.map(function (b, i) {
        var qtyTxt = b.qty || '';
        var unitTxt = b.priced && b.unitPrice ? '¥' + trim2(b.unitPrice) : '—';
        var subTxt = b.priced ? '¥' + trim2(b.subtotal) : (b.cost ? esc(b.cost) : '非采购');
        return '<tr data-bom="' + i + '"' + (b.priced ? '' : ' class="pf-bom-free"') + '><td>' + (i + 1) + '</td>' +
          '<td class="pf-bom-name">' + esc(b.name) + '</td>' +
          '<td>' + esc(b.spec || '') + '</td>' +
          '<td class="pf-bom-qty">' + esc(qtyTxt) + '</td>' +
          '<td class="pf-bom-price">' + unitTxt + '</td>' +
          '<td class="pf-bom-sub">' + subTxt + '</td>' +
          '<td>' + esc(b.note || '') + '</td>' +
          '<td class="pf-bom-buy">' + (b.buyUrl ? '<a href="' + esc(b.buyUrl) + '" target="_blank" rel="noopener" title="去 1688 搜索同款">找货源</a>' : '—') + '</td>' +
          '<td class="pf-bom-ok"><label><input type="checkbox" class="pf-bom-cb" data-idx="' + i + '"> 已备</label></td></tr>';
      }).join('');
      var t = bomTotals(d);
      var bar = '<div class="pf-bom-bar">' +
        '<span class="pf-bom-sum" data-bom-sum>' + bomSumText(t) + '</span>' +
        '<span class="pf-bom-acts">' +
        '<button type="button" class="pf-mini" data-bom-csv>导出 CSV</button>' +
        '<button type="button" class="pf-mini" data-bom-md>复制清单</button>' +
        '</span></div>';
      var table = '<div class="pf-bom-wrap"><table class="pf-bom"><thead><tr><th>#</th><th>名称</th><th>规格</th><th>数量</th><th>单价</th><th>小计</th><th>备注</th><th>采购</th><th>状态</th></tr></thead><tbody>' + rows + '</tbody><tfoot><tr><td colspan="5">合计</td><td class="pf-bom-total">' + (t.total ? '¥' + trim2(t.total) : '—') + '</td><td colspan="3">' + (t.priced ? t.priced + ' 项采购件 / 共 ' + (d.bom.length) + ' 项' : '全部为非采购项') + '</td></tr></tfoot></table></div>';
      html += accItem('bom', '资源 / 物料清单', bar + table, false);
    }
    if (d.pitfalls && d.pitfalls.length) {
      var pits = d.pitfalls.map(function (p) {
        return '<li class="pf-pit"><p class="pf-pit-q">问题：' + esc(p.q) + '</p>' +
          (p.why ? '<p class="pf-pit-why">原因：' + esc(p.why) + '</p>' : '') +
          '<p class="pf-pit-fix">方案：' + esc(p.fix) + '</p></li>';
      }).join('');
      html += accItem('pitfalls', '避坑指南', '<ul class="pf-pits">' + pits + '</ul>', false);
    }
    return html;
  }
  function bindDetailBlocks(root, d) {
    root.querySelectorAll('.pf-acc-head').forEach(function (h) {
      h.addEventListener('click', function () { h.parentElement.classList.toggle('is-open'); });
    });

    /* 制作步骤：左侧固定锚点导航 + 随滚动高亮当前步骤 */
    var wrap = root.querySelector('.pf-steps-wrap');
    var scroller = modalBody;
    if (wrap && scroller) {
      var navItems = Array.prototype.slice.call(wrap.querySelectorAll('.pf-steps-nav-item'));
      var stepEls = Array.prototype.slice.call(wrap.querySelectorAll('.pf-step'));
      var setActive = function (i) {
        navItems.forEach(function (a, k) { a.classList.toggle('is-on', k === i); });
      };
      navItems.forEach(function (a, i) {
        a.addEventListener('click', function () {
          var el = stepEls[i];
          if (!el) return;
          var delta = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
          scroller.scrollTo({ top: scroller.scrollTop + delta - 14, behavior: 'smooth' });
          setActive(i);
        });
      });
      var onScroll = function () {
        if (!wrap.isConnected) { scroller.removeEventListener('scroll', onScroll); return; }
        var line = scroller.getBoundingClientRect().top + 24;
        var idx = 0;
        stepEls.forEach(function (el, i) { if (el.getBoundingClientRect().top <= line) idx = i; });
        setActive(idx);
      };
      /* 修复：openModal 每次都会进入本函数，而 scroller=modalBody 是常驻节点，
         若直接 addEventListener 会在多次打开弹窗后累积 N 个重复 scroll 监听器（内存泄漏 + 卡顿）。
         先把上一次绑定的处理器解绑，保证最多只挂一个。 */
      if (scroller.__pfStepsScroll) scroller.removeEventListener('scroll', scroller.__pfStepsScroll);
      scroller.__pfStepsScroll = onScroll;
      scroller.addEventListener('scroll', onScroll, { passive: true });
      setActive(0);
    }

    var key = bomStorageKey(d);
    var saved = bomSaved(d);
    var sumEl = root.querySelector('[data-bom-sum]');
    function paintSum() { if (sumEl) sumEl.textContent = bomSumText(bomTotals(d)); }
    root.querySelectorAll('.pf-bom-cb').forEach(function (cb) {
      var idx = cb.getAttribute('data-idx');
      cb.checked = !!saved[idx];
      if (cb.checked) { var r0 = cb.closest('tr'); if (r0) r0.classList.add('is-ready'); }
      cb.addEventListener('change', function () {
        saved[idx] = cb.checked;
        try { localStorage.setItem(key, JSON.stringify(saved)); } catch (e) {}
        var row = cb.closest('tr');
        if (row) row.classList.toggle('is-ready', cb.checked);
        paintSum();
      });
    });
    var csvBtn = root.querySelector('[data-bom-csv]');
    if (csvBtn) csvBtn.addEventListener('click', function () {
      download('BOM-' + (d.name || d.id) + '.csv', bomCsv(d), 'text/csv');
      toast('已导出 CSV（可用 Excel 打开）');
    });
    var mdBtn = root.querySelector('[data-bom-md]');
    if (mdBtn)     mdBtn.addEventListener('click', function () {
      copyText(bomMarkdown(d)).then(function (ok) { toast(ok ? '物料清单已复制' : '清单复制失败，请改用导出 CSV'); });
    });
  }

  function closeModal() {
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
  }
  function closeQuick() {
    if (quick) quick.hidden = true;
    if (!modal || modal.hidden) document.body.style.overflow = '';
  }

  if (modal) {
    if (modalClose) modalClose.addEventListener('click', closeModal);
    var mask = modal.querySelector('.pf-modal-mask');
    if (mask) mask.addEventListener('click', closeModal);
  }

  document.addEventListener('keydown', function (e) {
    var modalOpen = modal && !modal.hidden;
    var quickOpen = quick && !quick.hidden;
    if (e.key === 'Escape') {
      if (quickOpen) { closeQuick(); return; }
      if (modalOpen) { closeModal(); return; }
    }
    if (!modalOpen) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      var gal = modalBody.querySelector('[data-gal]');
      var cnt = modalBody.querySelector('.pf-gal-count');
      if (gal && gal.__galGo && cnt) {
        var m = cnt.textContent.match(/(\d+)\s*\/\s*(\d+)/);
        if (m) {
          var cur = parseInt(m[1], 10);
          var total = parseInt(m[2], 10);
          gal.__galGo(((cur - 1) + (e.key === 'ArrowRight' ? 1 : -1) + total) % total);
        }
      }
    }
  });

  /* ---------------- 极速创建 ---------------- */
  function openQuick() {
    if (!quick) return;
    var err = quick.querySelector('#pfqErr');
    if (err) err.hidden = true;
    ['pfqName', 'pfqTagline'].forEach(function (id) {
      var el = quick.querySelector('#' + id); if (el) el.value = '';
    });
    var cat = quick.querySelector('#pfqCat'); if (cat) cat.value = '';
    var lv = quick.querySelector('#pfqLevel'); if (lv) lv.value = SPEC_LEVELS[0];
    var pd = quick.querySelector('#pfqPeriod'); if (pd) pd.value = SPEC_PERIODS[0];
    quick.hidden = false;
    document.body.style.overflow = 'hidden';
    var nameEl = quick.querySelector('#pfqName');
    if (nameEl) setTimeout(function () { nameEl.focus(); }, 30);
  }
  function submitQuick() {
    var nameEl = quick.querySelector('#pfqName');
    var catEl = quick.querySelector('#pfqCat');
    var err = quick.querySelector('#pfqErr');
    var name = (nameEl.value || '').trim();
    var cat = catEl.value || '';
    if (!name) { err.textContent = '请填写项目名称'; err.hidden = false; nameEl.focus(); return; }
    if (!cat) { err.textContent = '请选择分类'; err.hidden = false; catEl.focus(); return; }
    var draft = {
      id: uid(), draft: true, name: name, tagline: (quick.querySelector('#pfqTagline').value || '').trim(),
      category: cat, level: quick.querySelector('#pfqLevel').value, period: quick.querySelector('#pfqPeriod').value,
      stack: [], status: '草稿', cover: '', metrics: [], detail: {},
      steps: [], bom: [], gallery: [], video: '', createdAt: new Date().toISOString()
    };
    var list = loadDrafts(); list.unshift(draft); saveDrafts(list);
    refreshData(); renderAll();
    closeQuick();
    toast('草稿已创建，点击卡片继续补全');
    openModal(draft);
  }
  if (quick) {
    if (quickClose) quickClose.addEventListener('click', closeQuick);
    var qmask = quick.querySelector('.pf-modal-mask');
    if (qmask) qmask.addEventListener('click', closeQuick);
    var qSave = quick.querySelector('#pfqSave');
    if (qSave) qSave.addEventListener('click', submitQuick);
    var qCancel = quick.querySelector('#pfqCancel');
    if (qCancel) qCancel.addEventListener('click', closeQuick);
    quick.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') submitQuick(); });
    var catSel = quick.querySelector('#pfqCat');
    if (catSel) catSel.innerHTML = '<option value="">请选择分类</option>' + opt(SPEC_CATS, '');
    var lvSel = quick.querySelector('#pfqLevel');
    if (lvSel) lvSel.innerHTML = opt(SPEC_LEVELS, SPEC_LEVELS[0]);
    var pdSel = quick.querySelector('#pfqPeriod');
    if (pdSel) pdSel.innerHTML = opt(SPEC_PERIODS, SPEC_PERIODS[0]);
  }
  var createBtn = document.getElementById('pfCreate');
  if (createBtn) createBtn.addEventListener('click', openQuick);
  var emptyCreate = document.getElementById('pfEmptyCreate');
  if (emptyCreate) emptyCreate.addEventListener('click', openQuick);

  if (search) {
    search.addEventListener('input', function () { state.keyword = search.value; renderGrid(); });
  }

  /* ---------- 统一标签体系（T4）：接收来自标签导航 / URL ?tag= 的筛选 ---------- */
  window.PFPageApplyTag = function (tag) {
    var t = (window.PFTags && window.PFTags.normalize) ? window.PFTags.normalize(tag) : tag;
    var low = String(t).toLowerCase();
    var has = data.some(function (d) {
      return (d.stack || []).concat(d.tags || []).some(function (s) { return String(s).toLowerCase() === low; });
    });
    if (!has) return false;
    state.category = 'all';
    state.level = 'all';
    state.period = 'all';
    state.keyword = t;
    if (search) search.value = t;
    renderFilters();
    renderGrid();
    return true;
  };

  renderAll();
})();
