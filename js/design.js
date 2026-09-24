/* 设计图仓 —— 瀑布流展示 + 精选 Hero + 灯箱大图 + 微交互 */
(function () {
  var data = Array.isArray(window.designsData) ? window.designsData : [];
  var grid = document.getElementById('pfGrid');
  var filters = document.getElementById('pfFilters');
  var search = document.getElementById('pfSearch');
  var empty = document.getElementById('pfEmpty');
  var stats = document.getElementById('pfStats');
  var skeleton = document.getElementById('pfSkeleton');
  var featuredBox = document.getElementById('pfFeatured');
  var lb = document.getElementById('pfLightbox');
  var lbImg = document.getElementById('pfLbImg');
  var lbCap = document.getElementById('pfLbCap');
  var lbProgress = document.getElementById('pfLbProgress');

  if (!grid) return;

  var state = { category: 'all', tags: [], sort: 'latest', type: 'all', keyword: '' };
  var current = [];
  var shown = [];
  var lbIndex = 0;
  var lbScale = 1;

  /* 分类按规格（豆包文档）：只渲染数据中实际存在的分类 */
  var SPEC_CATS = ['UI设计', '品牌视觉', '插画创作', '3D建模', '平面物料', '工业设计', '交互原型'];
  var SORT_OPTS = [
    { k: 'latest', label: '最新发布' },
    { k: 'views', label: '最多浏览' },
    { k: 'likes', label: '最多点赞' },
    { k: 'featured', label: '推荐优先' }
  ];
  var TYPE_OPTS = [
    { k: 'all', label: '全部' },
    { k: '项目', label: '完整项目' },
    { k: '素材', label: '单张素材' }
  ];

  /* 以下原语实现统一在 portfolio-util.js（已由 pug 在页面脚本前引入） */
  var esc = PFUtil.esc;
  var reveal = PFUtil.reveal;
  var attachTilt = PFUtil.attachTilt;
  var accItem = PFUtil.accItem;
  var filterRow = PFUtil.filterRow;

  function categories() {
    var present = {};
    data.forEach(function (d) { if (d.category) present[d.category] = 1; });
    return SPEC_CATS.filter(function (c) { return present[c]; });
  }

  function allTags() {
    var seen = {}, out = [];
    data.forEach(function (d) {
      (d.tags || []).forEach(function (t) { if (t && !seen[t]) { seen[t] = 1; out.push(t); } });
    });
    return out;
  }

  function hasFilter() {
    return state.category !== 'all' || state.tags.length > 0 || state.type !== 'all' || !!state.keyword.trim();
  }

  function score(d) {
    return (d.views || 0) + (d.likes || 0) * 5;
  }

  function renderStats() {
    if (!stats) return;
    stats.innerHTML = '';
    ['共 ' + data.length + ' 件作品', '分类 ' + categories().length + ' 个'].forEach(function (t) {
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
    var tags = (f.tags || []).map(function (t) { return '<span class="pf-tag">#' + esc(t) + '</span>'; }).join('');
    featuredBox.innerHTML =
      '<button class="pf-feat-card" type="button" aria-label="查看精选作品 ' + esc(f.title) + '">' +
        '<img class="pf-feat-img" loading="lazy" src="' + esc(f.image) + '" alt="' + esc(f.title) + '">' +
        '<span class="pf-feat-scrim"></span>' +
        '<span class="pf-feat-body">' +
          '<span class="pf-feat-flag">精选作品</span>' +
          '<span class="pf-feat-title">' + esc(f.title) + '</span>' +
          '<span class="pf-feat-desc">' + esc(f.desc) + '</span>' +
          (tags ? '<span class="pf-feat-tags">' + tags + '</span>' : '') +
          '<span class="pf-feat-go">点击放大查看 →</span>' +
        '</span>' +
      '</button>';
    var btn = featuredBox.querySelector('.pf-feat-card');
    attachTilt(btn, 4);
    btn.addEventListener('click', function () { openLb(f); });
    reveal(btn, 0);
  }

  /* 一行筛选：标签文字 + 若干 chip（实现见 portfolio-util.js filterRow） */

  function renderFilters() {
    if (!filters) return;
    filters.innerHTML = '';

    /* 分类（单选） */
    filters.appendChild(filterRow(
      '分类',
      [{ k: 'all', label: '全部' }].concat(categories().map(function (c) { return { k: c, label: c }; })),
      function (k) { return state.category === k; },
      function (k) { state.category = k; renderFilters(); renderGrid(); }
    ));

    /* 标签（多选，可切换） */
    filters.appendChild(filterRow(
      '标签',
      [{ k: '__all__', label: '全部' }].concat(allTags().map(function (t) { return { k: t, label: t }; })),
      function (k) { return k === '__all__' ? state.tags.length === 0 : state.tags.indexOf(k) > -1; },
      function (k) {
        if (k === '__all__') {
          state.tags = [];
        } else {
          var i = state.tags.indexOf(k);
          if (i > -1) state.tags.splice(i, 1); else state.tags.push(k);
        }
        renderFilters(); renderGrid();
      }
    ));

    /* 排序（单选） */
    filters.appendChild(filterRow(
      '排序',
      SORT_OPTS,
      function (k) { return state.sort === k; },
      function (k) { state.sort = k; renderFilters(); renderGrid(); }
    ));

    /* 类型（单选） */
    filters.appendChild(filterRow(
      '类型',
      TYPE_OPTS,
      function (k) { return state.type === k; },
      function (k) { state.type = k; renderFilters(); renderGrid(); }
    ));

    /* 一键清空 */
    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'pf-reset';
    reset.textContent = '清空筛选';
    reset.hidden = !hasFilter();
    reset.addEventListener('click', function () {
      state.category = 'all'; state.tags = []; state.sort = 'latest'; state.type = 'all';
      state.keyword = '';
      if (search) search.value = '';
      renderFilters(); renderGrid();
    });
    var firstRow = filters.querySelector('.pf-filter-row');
    if (firstRow) firstRow.appendChild(reset);
  }

  function filtered() {
    var kw = state.keyword.trim().toLowerCase();
    /* 精选独立展示；一旦有筛选条件，精选项也回到列表里，避免被筛选"藏掉" */
    var heroVisible = !hasFilter();
    var items = data.filter(function (d) {
      if (d.featured && heroVisible) return false;
      if (state.category !== 'all' && d.category !== state.category) return false;
      if (state.type !== 'all' && d.type !== state.type) return false;
      if (state.tags.length) {
        var t = d.tags || [];
        for (var i = 0; i < state.tags.length; i++) { if (t.indexOf(state.tags[i]) === -1) return false; }
      }
      if (!kw) return true;
      var hay = [d.title, d.desc, d.category, (d.tags || []).join(' '), (d.tools || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(kw) > -1;
    });
    items.sort(function (a, b) {
      if (state.sort === 'views') return (b.views || 0) - (a.views || 0);
      if (state.sort === 'likes') return (b.likes || 0) - (a.likes || 0);
      if (state.sort === 'featured') {
        if (!!b.featured !== !!a.featured) return b.featured ? 1 : -1;
        return score(b) - score(a);
      }
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
    return items;
  }

  /* 客户端分页：首屏渲染一页，剩余用「加载更多」追加；灯箱翻页始终基于完整筛选结果 */
  var PAGE_SIZE = 24;
  var page = 1;
  var allItems = [];

  function renderGrid(opts) {
    opts = opts || {};
    var items = filtered();
    allItems = items;
    shown = items;
    if (!opts.append) {
      page = 1;
      grid.innerHTML = '';
      if (featuredBox) featuredBox.hidden = hasFilter();
    }

    if (!items.length) {
      if (empty) empty.hidden = false;
      if (featuredBox) featuredBox.hidden = true;
      renderMore();
      return;
    }
    if (empty) empty.hidden = true;

    var start = opts.append ? (page - 1) * PAGE_SIZE : 0;
    var slice = items.slice(start, page * PAGE_SIZE);
    slice.forEach(function (d, j) {
      var card = document.createElement('figure');
      card.className = 'pf-card';
      card.setAttribute('tabindex', '0');
      if (d.category) card.setAttribute('data-cat', d.category);
      if (d.type) card.setAttribute('data-type', d.type);
      var meta = [d.category, (d.tools || []).join(' / ')].filter(Boolean).join(' · ');
      card.innerHTML =
        '<img loading="lazy" src="' + esc(d.image) + '" alt="' + esc(d.title) + '">' +
        '<figcaption class="pf-card-overlay">' +
        '<p class="pf-card-title">' + esc(d.title) + '</p>' +
        '<p class="pf-card-meta">' + esc(meta) + '</p>' +
        '</figcaption>';
      card.addEventListener('click', function () { openLb(d); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLb(d); }
      });
      attachTilt(card, 7);
      grid.appendChild(card);
      reveal(card, start + j);
    });
    renderMore();
  }

  function loadMore() {
    page++;
    renderGrid({ append: true });
  }

  function renderMore() {
    var wrap = document.getElementById('pfMore');
    if (!wrap) return;
    var total = allItems.length;
    var shownCount = Math.min(page * PAGE_SIZE, total);
    var canMore = total > shownCount;
    if (!canMore) { wrap.hidden = true; wrap.innerHTML = ''; return; }
    wrap.hidden = false;
    wrap.innerHTML = '<button type="button" class="pf-loadmore" id="pfMoreBtn">加载更多（已显示 ' + shownCount + ' / ' + total + '）</button>';
    var btn = document.getElementById('pfMoreBtn');
    if (btn) btn.addEventListener('click', loadMore);
  }

  function showLb() {
    var d = current[lbIndex];
    if (!d) return;
    lbImg.src = d.image || '';
    lbImg.alt = d.title || '';
    lbImg.style.transform = '';
    lbScale = 1;
    var tags = (d.tags || []).map(function (t) { return '<span class="pf-tag">#' + esc(t) + '</span>'; }).join('');
    lbCap.innerHTML =
      '<strong>' + esc(d.title) + '</strong>' +
      (d.desc ? '<span class="pf-lb-desc">' + esc(d.desc) + '</span>' : '') +
      (tags ? '<span class="pf-lb-tags">' + tags + '</span>' : '');
    if (lbProgress) lbProgress.textContent = (lbIndex + 1) + ' / ' + current.length;

    renderInfo(d);
    renderActions(d);
    renderDetailBlocks(d);
    renderRelated(d);

    var lbCol = document.getElementById('pfLbCollect');
    if (lbCol && window.PF) {
      var colItem = { id: 'design:' + d.id, title: d.title, desc: d.desc, kind: '设计 · ' + (d.category || ''), url: '/design/', image: d.image };
      lbCol.onclick = function () {
        var added = window.PF.collect(colItem);
        lbCol.classList.toggle('is-on', added);
      };
      lbCol.classList.toggle('is-on', window.PF.isCollected(colItem.id));
    }
  }

  /* 项目信息（发布时间 / 分类 / 工具 / 角色 / 合作方 / 浏览） */
  function renderInfo(d) {
    var box = document.getElementById('pfLbInfo');
    if (!box) return;
    var rows = [
      ['发布时间', d.date],
      ['分类', d.category],
      ['类型', d.type],
      ['使用工具', (d.tools || []).join(' / ')],
      ['角色', d.role],
      ['合作方', d.client],
      ['浏览', d.views ? (d.views + ' 次') : '']
    ].filter(function (r) { return r[1]; });
    box.innerHTML = rows.map(function (r) {
      return '<div class="pf-info-item"><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>';
    }).join('');
  }

  /* 操作栏：点赞（本地记忆）/ 分享（复制链接）/ 获取源文件（三态权限） */
  var LIKE_KEY = 'pf_likes_v1';
  function loadLikes() {
    try { return JSON.parse(localStorage.getItem(LIKE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveLikes(o) {
    try { localStorage.setItem(LIKE_KEY, JSON.stringify(o)); } catch (e) {}
  }

  function renderActions(d) {
    var likeBtn = document.getElementById('pfLbLike');
    var shareBtn = document.getElementById('pfLbShare');
    var srcBtn = document.getElementById('pfLbSource');

    if (likeBtn) {
      var likes = loadLikes();
      var mine = !!likes[d.id];
      var total = (d.likes || 0) + (mine ? 1 : 0);
      likeBtn.classList.toggle('is-on', mine);
      likeBtn.setAttribute('aria-pressed', mine ? 'true' : 'false');
      likeBtn.querySelector('.pf-act-ico').textContent = mine ? '♥' : '♡';
      likeBtn.querySelector('.pf-act-label').textContent = '点赞 ' + total;
      likeBtn.onclick = function () {
        var l = loadLikes();
        if (l[d.id]) delete l[d.id]; else l[d.id] = 1;
        saveLikes(l);
        renderActions(d);
      };
    }

    if (shareBtn) shareBtn.onclick = function () {
      var url = location.origin + '/design/#' + (d.id || '');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(
          function () { lbToast('作品链接已复制'); },
          function () { lbToast('复制失败，请手动复制地址栏链接'); }
        );
      } else {
        lbToast('复制失败，请手动复制地址栏链接');
      }
    };

    if (srcBtn) {
      var map = {
        'public': { label: '下载源文件', tip: '源文件已开放下载（当前为示例占位，未接入真实文件）' },
        'follow': { label: '关注后获取', tip: '需要先关注作者，才能获取源文件' },
        'dm': { label: '私信获取', tip: '源文件需私信作者获取' }
      };
      var acc = d.sourceAccess || 'dm';
      var cfg = map[acc] || map['dm'];
      srcBtn.querySelector('.pf-act-label').textContent = cfg.label;
      srcBtn.setAttribute('data-access', acc);
      srcBtn.onclick = function () { lbToast(cfg.tip); };
    }
  }

  var toastTimer = null;
  function lbToast(msg) {
    var t = document.getElementById('pfLbToast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  /* 相关推荐：同分类优先，不足用其它作品补齐，凑 4 张；点击不关灯箱直接切换 */
  function renderRelated(d) {
    var box = document.getElementById('pfLbRelated');
    if (!box) return;
    var pool = data.filter(function (x) { return x.id !== d.id; });
    var picks = pool.filter(function (x) { return x.category === d.category; })
      .concat(pool.filter(function (x) { return x.category !== d.category; }))
      .slice(0, 4);
    if (!picks.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<div class="pf-related-title">相关推荐</div><div class="pf-related-grid">' +
      picks.map(function (x) {
        return '<button class="pf-related-item" type="button" data-id="' + esc(x.id) + '" aria-label="查看 ' + esc(x.title) + '">' +
          '<img loading="lazy" src="' + esc(x.image) + '" alt="">' +
          '<span class="pf-related-name">' + esc(x.title) + '</span>' +
        '</button>';
      }).join('') + '</div>';
    box.querySelectorAll('.pf-related-item').forEach(function (b) {
      b.addEventListener('click', function () {
        var it = data.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0];
        if (it) gotoRelated(it);
      });
    });
  }

  function gotoRelated(item) {
    current = shown.length ? shown.slice() : data.slice();
    var i = current.indexOf(item);
    if (i < 0) { current = data.slice(); i = data.indexOf(item); }
    if (i < 0) return;
    lbIndex = i;
    showLb();
    var panel = document.getElementById('pfLbPanel');
    if (panel) panel.scrollTop = 0;
  }

  /* 详情面板：版本 / 复盘 / 灵感 三个可折叠区块（复用 .pf-acc-* 样式） */
  function renderDetailBlocks(d) {
    var box = document.getElementById('pfLbDetails');
    if (!box) return;
    var html = '';

    if (d.versions && d.versions.length) {
      var rows = d.versions.map(function (v) {
        return '<div class="pf-ver-row"><span class="pf-ver-tag">' + esc(v.v) + '</span>' +
          '<span class="pf-ver-date">' + esc(v.date || '') + '</span>' +
          '<span class="pf-ver-note">' + esc(v.note || '') + '</span></div>';
      }).join('');
      html += accItem('versions', '版本记录 (' + d.versions.length + ')', rows, false);
    }

    if (d.review) {
      var rev = d.review;
      var pts = (rev.points || []).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('');
      var revHtml = '<p class="pf-rev-sum">' + esc(rev.summary || '') + '</p>' + (pts ? '<ul class="pf-rev-pts">' + pts + '</ul>' : '');
      html += accItem('review', '项目复盘', revHtml, false);
    }

    if (d.inspiration && d.inspiration.length) {
      var ins = d.inspiration.map(function (x) {
        return '<div class="pf-insp-row"><span class="pf-insp-title">' + esc(x.title) + '</span>' +
          '<span class="pf-insp-note">' + esc(x.note || '') + '</span></div>';
      }).join('');
      html += accItem('inspiration', '灵感来源 (' + d.inspiration.length + ')', ins, false);
    }

    box.innerHTML = html || '<p class="pf-lb-nodetail">该作品暂无版本 / 复盘 / 灵感记录。</p>';
    box.querySelectorAll('.pf-acc-head').forEach(function (h) {
      h.addEventListener('click', function () { h.parentElement.classList.toggle('is-open'); });
    });
  }

  function openLb(item) {
    /* 在"当前筛选结果"内切换：← → 只在筛出来的作品之间翻页 */
    current = shown.length ? shown.slice() : data.slice();
    lbIndex = current.indexOf(item);
    if (lbIndex < 0) {
      current = data.slice();
      lbIndex = data.indexOf(item);
    }
    if (lbIndex < 0) return;
    showLb();
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeLb() {
    lb.hidden = true;
    document.body.style.overflow = '';
  }

  function step(n) {
    if (!current.length) return;
    lbIndex = (lbIndex + n + current.length) % current.length;
    showLb();
  }

  if (lb) {
    var byId = function (id) { return document.getElementById(id); };
    var btnClose = byId('pfLbClose'), btnPrev = byId('pfLbPrev'), btnNext = byId('pfLbNext');
    if (btnClose) btnClose.addEventListener('click', closeLb);
    if (btnPrev) btnPrev.addEventListener('click', function () { step(-1); });
    if (btnNext) btnNext.addEventListener('click', function () { step(1); });
    var mask = lb.querySelector('.pf-lb-mask');
    if (mask) mask.addEventListener('click', closeLb);
    lbImg.addEventListener('wheel', function (e) {
      e.preventDefault();
      lbScale += (e.deltaY < 0 ? 0.12 : -0.12);
      lbScale = Math.max(1, Math.min(3, lbScale));
      lbImg.style.transform = 'scale(' + lbScale + ')';
    }, { passive: false });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') closeLb();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    });
  }

  if (search) {
    search.addEventListener('input', function () {
      state.keyword = search.value;
      renderGrid();
    });
  }

  /* ---------- 统一标签体系（T4）：接收来自标签导航 / URL ?tag= 的筛选 ---------- */
  window.PFPageApplyTag = function (tag) {
    var t = (window.PFTags && window.PFTags.normalize) ? window.PFTags.normalize(tag) : tag;
    var has = data.some(function (d) { return (d.tags || []).indexOf(t) > -1; });
    if (!has) return false;
    state.tags = [t];
    state.category = 'all';
    state.type = 'all';
    state.keyword = '';
    if (search) search.value = '';
    renderFilters();
    renderGrid();
    return true;
  };

  renderStats();
  renderFeatured();
  renderFilters();
  renderGrid();
  if (skeleton) skeleton.classList.remove('is-show');
})();
