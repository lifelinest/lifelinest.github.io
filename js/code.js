/* 微码仓库 —— GitHub 生态监控台：热榜监控(含历史) + 我的沉淀库 */
(function () {
  'use strict';
  var trending = window.trendingData || { daily: [], weekly: [], monthly: [] };
  var curated = Array.isArray(window.curatedData) ? window.curatedData : [];
  // Cloudflare Worker 后端地址（在 code.pug 里注入）；为空则退回纯本地模式
  var API = window.GH_API || '';
  var historyData = null; // /history 摘要
  var starred = null;     // /starred 数据（我的星标）
  var starSet = {};       // full_name → true
  var starOnly = false;   // 只看已 star

  /* ---------------- 通用工具（esc / toast 来自 portfolio-util.js） ---------------- */
  var esc = PFUtil.esc;
  var toast = PFUtil.toast;
  function $(id) { return document.getElementById(id); }
  function setBackend(state, detail) {
    var el = $('pfBackend');
    if (!el) return;
    if (state === 'local') {
      el.className = 'pf-backend is-local';
      el.innerHTML = '● 本地模式 · 无需联网' + (detail ? ' <span class="pf-backend-detail">' + esc(detail) + '</span>' : '');
      return;
    }
    if (state === 'ghapi') {
      el.className = 'pf-backend is-ok';
      el.innerHTML = '● 热榜实时 · GitHub 官方 API' + (detail ? ' <span class="pf-backend-detail">' + esc(detail) + '</span>' : '');
      return;
    }
    el.className = 'pf-backend ' + (state ? 'is-ok' : 'is-down');
    el.innerHTML = (state ? '● 后端已连接' : '○ 后端不可达') + (detail ? ' <span class="pf-backend-detail">' + esc(detail) + '</span>' : '');
  }
  function findRepo(fn) {
    for (var p in trending) {
      if (!trending.hasOwnProperty(p)) continue;
      var hit = (trending[p] || []).filter(function (d) { return d.full_name === fn; })[0];
      if (hit) return hit;
    }
    return null;
  }
  /* toast 现由 portfolio-util.js 统一提供 */

  function copy(text) {
    function fb() {
      var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('已复制到剪贴板'); } catch (e) { toast('复制失败，请手动选择'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast('已复制到剪贴板'); }, fb);
    else fb();
  }
  var LANG_COLORS = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Go: '#00ADD8', Rust: '#dea584',
    'C++': '#f34b7d', C: '#555555', 'C#': '#178600', Java: '#b07219', Ruby: '#701516', PHP: '#4F5D95',
    Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883', Swift: '#F05138', Kotlin: '#A97BFF',
    Dart: '#00B4AB', Lua: '#000080', Jupyter: '#DA5B0B', 'Jupyter Notebook': '#DA5B0B'
  };
  function langColor(l) { return LANG_COLORS[l] || '#888'; }
  function fmt(n) { return (n || 0).toLocaleString(); }
  function periodLabel(p) { return p === 'daily' ? '日' : (p === 'weekly' ? '周' : '月'); }
  // 轻量 Markdown（先转义再应用，安全）
  function mdToHtml(text) {
    var s = esc(text || '');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  /* ---------------- Tab 系统 ---------------- */
  function initTabs() {
    var tabs = document.querySelectorAll('.pf-tab');
    var panels = { trending: $('panel-trending'), deposit: $('panel-deposit') };
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var name = tab.getAttribute('data-tab');
        tabs.forEach(function (t) { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
        tab.classList.add('is-active'); tab.setAttribute('aria-selected', 'true');
        Object.keys(panels).forEach(function (k) { if (panels[k]) panels[k].hidden = (k !== name); });
        if (name === 'deposit') {
          renderDeposit();
          if (API) pullFromGitHub().then(renderDeposit);
        }
      });
    });
  }

  /* ---------------- 热榜监控 ---------------- */
  var tState = { period: 'daily', domains: [], langs: [], licenses: [], minStars: 0, keyword: '', selected: '' };
  function langOptions() {
    var seen = {}, out = [];
    ['daily', 'weekly', 'monthly'].forEach(function (p) {
      (trending[p] || []).forEach(function (d) { if (d.language && !seen[d.language]) { seen[d.language] = 1; out.push(d.language); } });
    });
    return out.sort();
  }
  function domainOptions() {
    var seen = {}, out = [];
    ['daily', 'weekly', 'monthly'].forEach(function (p) {
      (trending[p] || []).forEach(function (d) { if (d.domain && !seen[d.domain]) { seen[d.domain] = 1; out.push(d.domain); } });
    });
    return out;
  }
  /* 协议 / 更新时间属后端 API 字段；快照里没有就不渲染该行，不编造数据 */
  function hasField(field) {
    var found = false;
    ['daily', 'weekly', 'monthly'].forEach(function (p) {
      (trending[p] || []).forEach(function (d) { if (d[field]) found = true; });
    });
    return found;
  }
  function togglePick(arr, v) {
    var i = arr.indexOf(v);
    if (i > -1) arr.splice(i, 1); else arr.push(v);
  }
  function trendChipRow(labelText, values, isOn, onPick) {
    var row = document.createElement('div');
    row.className = 'pf-filter-row';
    var lb = document.createElement('span');
    lb.className = 'pf-filter-label';
    lb.textContent = labelText;
    row.appendChild(lb);
    values.forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button';
      var on = isOn(v);
      b.className = 'pf-chip' + (on ? ' pf-chip--on' : '');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.textContent = v;
      b.addEventListener('click', function () { onPick(v); });
      row.appendChild(b);
    });
    return row;
  }
  function renderTrendFilters() {
    var box = $('trendFilters');
    if (!box) return;
    box.innerHTML = '';
    var doms = domainOptions();
    if (doms.length) {
      box.appendChild(trendChipRow('领域', doms,
        function (v) { return tState.domains.indexOf(v) > -1; },
        function (v) { togglePick(tState.domains, v); renderTrendFilters(); renderTrending(); }));
    }
    var langs = langOptions();
    if (langs.length) {
      box.appendChild(trendChipRow('语言', langs,
        function (v) { return tState.langs.indexOf(v) > -1; },
        function (v) { togglePick(tState.langs, v); renderTrendFilters(); renderTrending(); }));
    }
    if (hasField('license')) {
      var lics = {};
      ['daily', 'weekly', 'monthly'].forEach(function (p) {
        (trending[p] || []).forEach(function (d) { if (d.license) lics[d.license] = 1; });
      });
      box.appendChild(trendChipRow('协议', Object.keys(lics),
        function (v) { return tState.licenses.indexOf(v) > -1; },
        function (v) { togglePick(tState.licenses, v); renderTrendFilters(); renderTrending(); }));
    }
    if (tState.domains.length || tState.langs.length || tState.licenses.length) {
      var reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'pf-reset';
      reset.textContent = '清空筛选';
      reset.addEventListener('click', function () {
        tState.domains = []; tState.langs = []; tState.licenses = [];
        renderTrendFilters(); renderTrending();
      });
      var first = box.querySelector('.pf-filter-row');
      if (first) first.appendChild(reset);
    }
  }
  function initTrending() {
    var periodBox = $('trendPeriod'), search = $('trendSearch');
    if (!periodBox) return;
    periodBox.querySelectorAll('.pf-seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        periodBox.querySelectorAll('.pf-seg-btn').forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active');
        tState.period = b.getAttribute('data-period');
        trendPage[tState.period] = 1;
        renderTrending();
        loadTrending(tState.period).then(function () { renderTrendFilters(); renderTrending(); });
      });
    });
    if (search) search.addEventListener('input', function () { tState.keyword = search.value; renderTrending(); });
    var starBtn = $('trendStarOnly');
    if (starBtn) starBtn.addEventListener('click', function () {
      starOnly = !starOnly;
      starBtn.classList.toggle('is-on', starOnly);
      starBtn.setAttribute('aria-pressed', starOnly ? 'true' : 'false');
      renderTrending();
    });

    /* 高级筛选面板：最低 Star（更新时间 / 协议 需后端数据，见 renderTrendFilters） */
    var advBtn = $('trendAdvToggle'), advBox = $('trendAdv');
    if (advBtn && advBox) {
      advBtn.addEventListener('click', function () {
        var open = advBox.hidden;
        advBox.hidden = !open;
        advBtn.classList.toggle('is-on', open);
        advBtn.setAttribute('aria-pressed', open ? 'true' : 'false');
      });
    }
    var minStars = $('trendMinStars'), minHint = $('trendMinStarsHint');
    function applyMinStars() {
      var v = parseInt(minStars && minStars.value, 10);
      tState.minStars = (isNaN(v) || v < 0) ? 0 : v;
      if (minHint) minHint.textContent = tState.minStars ? ('≥ ' + fmt(tState.minStars)) : '不限';
      renderTrending();
    }
    if (minStars) minStars.addEventListener('input', applyMinStars);
    var advReset = $('trendAdvReset');
    if (advReset) advReset.addEventListener('click', function () {
      tState.minStars = 0;
      if (minStars) minStars.value = '0';
      applyMinStars();
    });

    renderTrendFilters();
    renderTrending();
    loadTrending(tState.period).then(function () { renderTrendFilters(); renderTrending(); });
  }
  function trendingFiltered() {
    var kw = tState.keyword.trim().toLowerCase();
    return (trending[tState.period] || []).filter(function (d) {
      if (tState.domains.length && tState.domains.indexOf(d.domain) === -1) return false;
      if (tState.langs.length && tState.langs.indexOf(d.language) === -1) return false;
      if (tState.licenses.length && tState.licenses.indexOf(d.license) === -1) return false;
      if (tState.minStars && (d.stars || 0) < tState.minStars) return false;
      if (starOnly && !starSet[d.full_name]) return false;
      if (!kw) return true;
      return (d.full_name + ' ' + (d.description || '')).toLowerCase().indexOf(kw) > -1;
    });
  }
  function trendBadge(fn) {
    if (!historyData || !historyData.days || historyData.days < 2) return '';
    if (historyData.isNew && historyData.isNew[fn]) return '<span class="pf-badge pf-badge-new">新上榜</span>';
    var s = historyData.streaks && historyData.streaks[fn];
    if (s && s > 1) return '<span class="pf-badge pf-badge-streak">连续 ' + s + ' 天</span>';
    return '';
  }
  function trendingCard(d, big) {
    var dep = isDeposited(d.full_name);
    return '<article class="pf-trend' + (big ? ' pf-trend-big' : '') + '"' +
      ' data-fn="select" data-name="' + esc(d.full_name) + '"' +
      ' data-domain="' + esc(d.domain || '') + '"' +
      ' data-lang="' + esc(d.language || '') + '"' +
      ' data-stars="' + (d.stars || 0) + '">' +
      '<div class="pf-trend-rank">' + d.rank + '</div>' +
      '<div class="pf-trend-main">' +
        '<a class="pf-trend-name" href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(d.full_name) + '</a>' +
          (starSet[d.full_name] ? '<span class="pf-badge pf-badge-star">★ 已 star</span>' : '') + trendBadge(d.full_name) +
        (d.description ? '<p class="pf-trend-desc">' + esc(d.description) + '</p>' : '') +
        '<div class="pf-trend-meta">' +
          (d.language ? '<span class="pf-lang-dot" style="background:' + langColor(d.language) + '"></span><span>' + esc(d.language) + '</span>' : '') +
          '<span title="总 Star">★ ' + fmt(d.stars) + '</span>' +
          '<span title="Fork">⑂ ' + fmt(d.forks) + '</span>' +
          (d.stars_period ? '<span class="pf-grow">▲ ' + fmt(d.stars_period) + ' / ' + periodLabel(d.period) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="pf-trend-actions">' +
        '<button class="pf-chart-btn" data-fn="chart" data-name="' + esc(d.full_name) + '" title="查看上榜趋势">趋势</button>' +
        '<button class="pf-deposit-btn' + (dep ? ' is-on' : '') + '" data-fn="dep" data-name="' + esc(d.full_name) + '" title="沉淀到我的参考库">' + (dep ? '★ 已沉淀' : '☆ 沉淀') + '</button>' +
      '</div>' +
      '</article>';
  }
  function renderTrending() {
    var list = trendingFiltered();
    var top = $('trendTop'), box = $('trendList'), empty = $('trendEmpty');
    if (top) top.innerHTML = list.slice(0, 3).map(function (d) { return trendingCard(d, true); }).join('');
    if (box) box.innerHTML = list.slice(3).map(function (d) { return trendingCard(d, false); }).join('');
    if (empty) empty.hidden = list.length > 0;

    /* 常驻详情侧栏：默认第一条；原选中项被筛掉时回落到第一条 */
    var sel = list.filter(function (d) { return d.full_name === tState.selected; })[0] || list[0] || null;
    tState.selected = sel ? sel.full_name : '';
    if (sel) {
      document.querySelectorAll('#trendTop .pf-trend, #trendList .pf-trend').forEach(function (c) {
        c.classList.toggle('is-selected', c.getAttribute('data-name') === sel.full_name);
      });
    }
    renderSidebar(sel);

    bindTrendButtons();
    renderTrendMore();
  }

  /* 右侧详情侧栏（固定高度内滚动） */
  function renderSidebar(d) {
    var box = $('trendSide');
    if (!box) return;
    if (!d) {
      box.innerHTML = '<p class="pf-side-empty">当前筛选下没有项目。</p>';
      return;
    }
    var gh = 'https://github.com/' + d.full_name;
    var metrics = [
      ['总 Star', fmt(d.stars)],
      [periodLabel(d.period) + '新增', d.stars_period ? '▲ ' + fmt(d.stars_period) : '—'],
      ['Fork', d.forks ? fmt(d.forks) : '—'],
      ['主语言', d.language || '—'],
      ['领域', d.domain || '—'],
      ['榜单排名', '#' + (d.rank || '—')]
    ];
    if (d.license) metrics.push(['开源协议', d.license]);
    if (d.updated_at) metrics.push(['最近更新', d.updated_at.slice(0, 10)]);
    if (d.open_issues) metrics.push(['问题数', fmt(d.open_issues)]);
    box.innerHTML =
      '<div class="pf-side-head">' +
        '<span class="pf-side-rank">#' + (d.rank || '-') + '</span>' +
        '<div class="pf-side-titles">' +
          '<a class="pf-side-name" href="' + esc(d.url || gh) + '" target="_blank" rel="noopener">' + esc(d.full_name) + '</a>' +
          '<span class="pf-side-author">' + esc(d.author || '') + '</span>' +
        '</div>' +
      '</div>' +
      (d.description ? '<p class="pf-side-desc">' + esc(d.description) + '</p>' : '') +
      '<div class="pf-side-metrics">' +
        metrics.map(function (m) {
          return '<div class="pf-side-metric"><span class="pf-side-k">' + esc(m[0]) + '</span><b class="pf-side-v">' + esc(m[1]) + '</b></div>';
        }).join('') +
      '</div>' +
      '<div class="pf-side-trend">' +
        '<div class="pf-side-trend-head"><span>上榜增量</span><span>' + (d.stars_period ? '+' + fmt(d.stars_period) + ' / ' + periodLabel(d.period) : '—') + '</span></div>' +
        sideTrendBar(d) +
      '</div>' +
      '<div class="pf-side-links">' +
        '<a href="' + esc(gh) + '" target="_blank" rel="noopener">仓库</a>' +
        (d.homepage ? '<a href="' + esc(d.homepage) + '" target="_blank" rel="noopener">主页</a>' : '') +
        '<a href="' + esc(gh) + '/issues" target="_blank" rel="noopener">Issues</a>' +
        '<a href="' + esc(gh) + '/stargazers" target="_blank" rel="noopener">Star 列表</a>' +
        '<button type="button" class="pf-side-chart" data-name="' + esc(d.full_name) + '">上榜趋势图</button>' +
      '</div>';
    var chartBtn = box.querySelector('.pf-side-chart');
    if (chartBtn) chartBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      openRepoChart(d.full_name);
    });
  }

  /* 无后端时用"增量占总量比"做可视化，不伪造历史曲线 */
  function sideTrendBar(d) {
    var inc = d.stars_period || 0, total = d.stars || 0;
    if (!inc || !total) {
      return '<p class="pf-side-note">本地快照无历史序列；接入后端后可看趋势曲线。</p>';
    }
    var pct = Math.max(1, Math.min(100, Math.round(inc / total * 100)));
    return '<div class="pf-side-bar"><i style="width:' + pct + '%"></i></div>' +
      '<p class="pf-side-note">增量占总量 ' + pct + '%' + (API ? '' : ' · 本地快照') + '</p>';
  }
  function renderTrendMore() {
    var wrap = $('trendMore');
    if (!wrap) return;
    var list = trendingFiltered();
    var loaded = (trending[tState.period] || []).length;
    var canMore = (trendSource === 'ghapi' || trendSource === 'worker') && loaded >= 30 && list.length >= 30;
    if (!canMore) { wrap.hidden = true; wrap.innerHTML = ''; return; }
    wrap.hidden = false;
    wrap.innerHTML = '<button type="button" class="pf-loadmore" id="trendMoreBtn">加载更多（已拉取 ' + loaded + '）</button>';
    var btn = $('trendMoreBtn');
    if (btn) btn.addEventListener('click', function () {
      btn.disabled = true; btn.textContent = '加载中…';
      var p = tState.period;
      trendPage[p] = (trendPage[p] || 1) + 1;
      loadTrending(p, { page: trendPage[p], append: true }).then(function () {
        renderTrendFilters(); renderTrending();
      }).catch(function () {
        btn.disabled = false; btn.textContent = '加载更多'; trendPage[p] = Math.max(1, trendPage[p] - 1);
      });
    });
  }

  function renderNewThisWeek() {
    var box = $('trendNew'), sub = $('trendNewSub'), listEl = $('trendNewList');
    if (!box || !listEl) return;
    if (!historyData || !historyData.days || historyData.days < 2 || !historyData.newThisWeek || !historyData.newThisWeek.length) {
      box.hidden = true; return;
    }
    box.hidden = false;
    if (sub) sub.textContent = '已记录 ' + historyData.days + ' 天 · 共 ' + historyData.newThisWeek.length + ' 个';
    listEl.innerHTML = historyData.newThisWeek.slice(0, 8).map(function (d) {
      return '<a class="pf-newchip" href="https://github.com/' + esc(d.full_name) + '" target="_blank" rel="noopener">' +
        esc(d.full_name) + (d.stars_period ? ' <b>▲' + fmt(d.stars_period) + '</b>' : '') + '</a>';
    }).join('');
  }
  /* ---------------- 热榜数据源：GitHub 官方 REST API（国内可直连、响应头含 CORS）----------------
   * 背景：github.com/trending 是网页且有 CORS 限制，浏览器取不到，才需要自建后端；
   *       但 api.github.com 国内直连可达（实测 HTTP 200 / 0.8s）且允许跨域，故改为纯前端直取，
   *       零部署、零域名。自建 Worker 仅作海外/代理环境的可选增强，构建快照作最终兜底。       */
  var GH_SEARCH = 'https://api.github.com/search/repositories';
  var TREND_CACHE_KEY = 'pf_gh_trend_v1';
  var TREND_TTL = 30 * 60 * 1000; // 30 分钟缓存，避免触发 GitHub 未授权限流（搜索 10 次/分钟）
  var trendSource = '';           // 'ghapi' | 'worker' | 'snapshot'
  var trendPage = { daily: 1, weekly: 1, monthly: 1 }; // 各周期分页游标
  function trendWindowDays(period) { return period === 'weekly' ? 30 : period === 'monthly' ? 90 : 7; }
  function isoDaysAgo(days) { return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10); }
  function readTrendCache(period) {
    try {
      var all = JSON.parse(localStorage.getItem(TREND_CACHE_KEY) || '{}');
      var e = all[period];
      if (e && e.items && e.items.length && (Date.now() - (e.at || 0)) < TREND_TTL) return e.items;
    } catch (_) {}
    return null;
  }
  function writeTrendCache(period, items) {
    try {
      var all = JSON.parse(localStorage.getItem(TREND_CACHE_KEY) || '{}');
      all[period] = { at: Date.now(), items: items };
      localStorage.setItem(TREND_CACHE_KEY, JSON.stringify(all));
    } catch (_) {}
  }
  // 领域推导：复用 t1_trending_align.js 的规则（按 仓库名/描述/语言 关键词归类）
  var DOMAIN_RULES = [
    ['游戏开发', /game|unity|godot|engine|graphics|render|animation|manim|3d/i],
    ['AI 大模型', /\\bai\\b|llm|gpt|agent|model|prompt|skill|context|embedding|transformer|neural|diffusion|rag|mcp|machine.?learn|mojo|foundation/i],
    ['前端', /react|vue|svelte|css|html|tailwind|frontend|ui\\b|component|next\\.?js|nuxt/i],
    ['后端', /server|api\\b|database|framework|http|grpc|microservice|postgres|redis|kafka|graphql/i],
    ['系统工具', /linux|kernel|os\\b|docker|kubernetes|shell|macos|container|terminal|filesystem|cli tool/i],
    ['开发工具', /cli|tool|editor|build|bundler|linter|formatter|vscode|git\\b|devtool|specification|plugin|utils|notes|awesome|skills?\\b/i]
  ];
  function domainOf(it) {
    var hay = [it.full_name, it.name, it.description || '', it.language || ''].join(' ');
    for (var i = 0; i < DOMAIN_RULES.length; i++) {
      if (DOMAIN_RULES[i][1].test(hay)) return DOMAIN_RULES[i][0];
    }
    return '其他';
  }
  // GitHub 仓库对象 → 卡片数据结构（字段名对齐现有渲染）
  function mapGhRepo(it, idx, period) {
    var stars = it.stargazers_count || 0;
    var lic = (it.license && it.license.spdx_id) ? it.license.spdx_id : '';
    return {
      rank: idx + 1,
      author: (it.owner && it.owner.login) || '',
      repo: it.name || '',
      full_name: it.full_name || '',
      url: it.html_url || ('https://github.com/' + (it.full_name || '')),
      description: it.description || '',
      language: it.language || '',
      stars: stars,
      forks: it.forks_count || 0,
      /* 真实周期增量需后端历史序列，官方 search API 与本地快照都给不出，
         故置 0（UI 已有「无历史序列」占位分支，不会伪造增长数据）。 */
      stars_period: 0,
      period: period,
      domain: domainOf(it),
      license: lic,
      pushed_at: it.pushed_at || '',
      updated_at: it.updated_at || '',
      homepage: it.homepage || '',
      open_issues: it.open_issues_count || 0,
      topics: Array.isArray(it.topics) ? it.topics : []
    };
  }
  async function fetchTrendFromGitHub(period, page) {
    page = page || 1;
    var q = 'created:>' + isoDaysAgo(trendWindowDays(period)) + ' stars:>20';
    var url = GH_SEARCH + '?q=' + encodeURIComponent(q) + '&sort=stars&order=desc&per_page=30&page=' + page;
    var r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('GitHub API HTTP ' + r.status);
    var j = await r.json();
    return (j && Array.isArray(j.items) ? j.items : []).map(function (it, i) { return mapGhRepo(it, i, period); });
  }
  async function loadTrending(period, opts) {
    opts = opts || {};
    var page = opts.page || 1, append = !!opts.append;
    // ① 首页命中本地缓存（30 分钟）
    if (page === 1 && !append) {
      var cached = readTrendCache(period);
      if (cached) { trending[period] = cached; trendSource = 'ghapi'; setBackend('ghapi'); renderStats(); return; }
    }
    // ② GitHub 官方 API（国内直连可达）
    try {
      var items = await fetchTrendFromGitHub(period, page);
      if (items && items.length) {
        if (append) {
          var base = trending[period] || [], seen = {};
          base.forEach(function (d) { seen[d.full_name] = 1; });
          items.forEach(function (it) { if (!seen[it.full_name]) { base.push(it); seen[it.full_name] = 1; } });
          trending[period] = base;
        } else {
          trending[period] = items;
          if (page === 1) writeTrendCache(period, items);
        }
        trendSource = 'ghapi'; setBackend('ghapi'); renderStats();
        return;
      }
      if (append) return; // 加载更多无数据时静默收尾
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) console.warn('[pf-trend] GitHub API 拉取失败：', (e && (e.message || e)) || e);
      if (append) return;
    }
    // ③ 可选：自建 Worker 后端（仅海外 / 代理环境可达）
    if (page === 1 && !append && API) {
      try {
        var r = await fetch(API + '/trending?period=' + period, { headers: { Accept: 'application/json' } });
        if (r.ok) {
          var j = await r.json();
          if (j && Array.isArray(j.items) && j.items.length) {
            trending[period] = j.items; trendSource = 'worker';
            setBackend(true); renderStats();
            return;
          }
        }
      } catch (e) {}
    }
    // ④ 兜底：保留构建时快照（trending 已由 window.trendingData 初始化）
    if (page === 1 && !append) {
      trendSource = 'snapshot';
      if (!API) setBackend('local');
      renderStats();
    }
  }
  async function loadHistory() {
    if (!API) return;
    try {
      var r = await fetch(API + '/history', { headers: { Accept: 'application/json' } });
      if (!r.ok) { setBackend(false, 'HTTP ' + r.status); return; }
      historyData = await r.json();
      setBackend(true);
      renderNewThisWeek();
      renderTrending();
    } catch (e) { setBackend(false, '*.workers.dev 可能在你的网络被屏蔽'); }
  }
  async function loadStarred() {
    if (!API) { renderRadar(); return; }
    try {
      var r = await fetch(API + '/starred', { headers: { Accept: 'application/json' } });
      if (!r.ok) { setBackend(false, 'HTTP ' + r.status); return; }
      var j = await r.json();
      if (j && Array.isArray(j.items)) {
        starred = j; starSet = {};
        j.items.forEach(function (x) { if (x && x.full_name) starSet[x.full_name] = true; });
        setBackend(true);
        renderRadar();
        renderTrending();
      }
    } catch (e) { setBackend(false, '*.workers.dev 可能在你的网络被屏蔽'); }
  }
  function langDistribution(source) {
    var counts = {}, order = [];
    source.forEach(function (x) {
      var l = x.language || '未知';
      if (!counts[l]) { counts[l] = 0; order.push(l); }
      counts[l]++;
    });
    return order.map(function (l) { return [l, counts[l]]; }).sort(function (a, b) { return b[1] - a[1]; });
  }
  function renderRadar() {
    var box = $('trendRadar'), stats = $('trendRadarStats'), langsEl = $('trendRadarLangs'), sub = $('trendRadarSub');
    if (!box) return;
    var src = [], label = '';
    if (starred && starred.items && starred.items.length) {
      src = starred.items; label = '来自你的 GitHub 星标';
    } else {
      var dep = loadDeposit();
      if (dep.length) { src = dep; label = '来自我的沉淀库'; }
      else {
        var snap = [];
        ['daily', 'weekly', 'monthly'].forEach(function (p) { (trending[p] || []).forEach(function (d) { if (d.language) snap.push(d); }); });
        src = snap; label = '来自热榜快照';
      }
    }
    if (!src.length) { box.hidden = true; return; }
    box.hidden = false;
    var topLangs = langDistribution(src);
    var overlap = 0;
    ['daily', 'weekly', 'monthly'].forEach(function (p) {
      (trending[p] || []).forEach(function (d) { if (starSet[d.full_name]) overlap++; });
    });
    if (sub) sub.textContent = label + ' · ' + src.length + ' 个仓库';
    if (stats) {
      stats.innerHTML =
        '<span class="pf-radar-chip">样本 <b>' + src.length + '</b></span>' +
        '<span class="pf-radar-chip">主力语言 <b>' + esc(topLangs[0] ? topLangs[0][0] : '—') + '</b></span>' +
        '<span class="pf-radar-chip">热榜与我重合 <b>' + overlap + '</b></span>';
    }
    if (langsEl) {
      var max = topLangs.length ? topLangs[0][1] : 1;
      langsEl.innerHTML = topLangs.slice(0, 6).map(function (l) {
        return '<div class="pf-langbar"><span class="pf-langbar-name">' + esc(l[0]) + '</span>' +
          '<span class="pf-langbar-track"><i style="width:' + Math.max(4, Math.round(l[1] / max * 100)) + '%;background:' + langColor(l[0]) + '"></i></span>' +
          '<span class="pf-langbar-num">' + l[1] + '</span></div>';
      }).join('');
    }
  }
  function sparkline(timeline) {
    var pts = timeline.filter(function (t) { return t.stars != null; });
    if (pts.length < 2) return '<p class="pf-chart-hint">上榜天数还不够，再积累几天就会出现 star 走势曲线。</p>';
    var w = 560, h = 130, pad = 12;
    var ys = pts.map(function (p) { return p.stars; });
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys), span = (maxY - minY) || 1;
    var d = pts.map(function (p, i) {
      var x = pad + (w - 2 * pad) * (i / (pts.length - 1));
      var y = pad + (h - 2 * pad) * (1 - (p.stars - minY) / span);
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');
    return '<svg class="pf-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
      '</svg><div class="pf-chart-axis"><span>' + esc(pts[pts.length - 1].date) + '</span><span>★ ' + fmt(minY) + ' → ' + fmt(maxY) + '</span><span>' + esc(pts[0].date) + '</span></div>';
  }
  async function openRepoChart(fn) {
    var modal = document.createElement('div'); modal.className = 'pf-overlay';
    modal.innerHTML = '<div class="pf-dialog"><h3>' + esc(fn) + ' 上榜趋势</h3><div class="pf-chart-body">正在加载…</div>' +
      '<div class="pf-modal-actions"><a class="pf-mini" href="https://github.com/' + esc(fn) + '" target="_blank" rel="noopener">打开仓库</a><button class="pf-mini" id="pfChartClose">关闭</button></div></div>';
    document.body.appendChild(modal);
    function close() { document.body.removeChild(modal); }
    modal.querySelector('#pfChartClose').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    var body = modal.querySelector('.pf-chart-body');
    if (!API) { body.innerHTML = '<p class="pf-chart-hint">未连接后端，无法查看历史。</p>'; return; }
    try {
      var r = await fetch(API + '/history?repo=' + encodeURIComponent(fn), { headers: { Accept: 'application/json' } });
      var d = await r.json();
      var stats = '<div class="pf-chart-stats">' +
        '<div><span>上榜次数</span><b>' + (d.appearances || 0) + ' 天</b></div>' +
        '<div><span>连续在榜</span><b>' + (d.streak || 0) + ' 天</b></div>' +
        '<div><span>star 增长</span><b>' + (d.growth == null ? '—' : '+' + fmt(d.growth)) + '</b></div>' +
        '<div><span>记录天数</span><b>' + (d.days || 0) + ' 天</b></div>' +
        '</div>';
      body.innerHTML = stats + sparkline(d.timeline || []);
    } catch (e) {
      var local = findRepo(fn);
      if (local) {
        body.innerHTML =
          '<p class="pf-chart-hint">历史走势需联网后端（当前 Worker 不可达，可能 *.workers.dev 在你的网络被屏蔽）。以下是本地快照：</p>' +
          '<div class="pf-chart-stats">' +
            '<div><span>当前总 Star</span><b>★ ' + fmt(local.stars) + '</b></div>' +
            '<div><span>周期增长</span><b>' + (local.stars_period ? '▲ ' + fmt(local.stars_period) + ' / ' + periodLabel(local.period) : '—') + '</b></div>' +
            '<div><span>语言</span><b>' + esc(local.language || '—') + '</b></div>' +
            '<div><span>排名</span><b># ' + (local.rank || '—') + ' (' + periodLabel(local.period) + ')</b></div>' +
          '</div>' +
          (local.description ? '<p class="pf-chart-desc">' + esc(local.description) + '</p>' : '');
      } else {
        body.innerHTML = '<p class="pf-chart-hint">历史走势需联网后端（当前 Worker 不可达，可能 *.workers.dev 在你的网络被屏蔽）。可直接点下方「打开仓库」查看。</p>';
      }
    }
  }

  /* ---------------- 我的沉淀库 ---------------- */
  var DEP_KEY = 'gh_deposit_v1';
  var STATUS = [
    { k: 'todo', label: '待读' }, { k: 'reading', label: '在读' },
    { k: 'done', label: '已实践' }, { k: 'dropped', label: '已弃用' }
  ];
  function statusLabel(k) { for (var i = 0; i < STATUS.length; i++) if (STATUS[i].k === k) return STATUS[i].label; return '待读'; }
  function statusClass(k) { return k === 'done' ? 'is-done' : k === 'reading' ? 'is-reading' : k === 'dropped' ? 'is-dropped' : 'is-todo'; }
  function statusOrder(k) { for (var i = 0; i < STATUS.length; i++) if (STATUS[i].k === k) return i; return 0; }
  // 按语言 + 描述关键词自动打标
  function autoTag(d) {
    var tags = [];
    if (d.language) tags.push(d.language);
    if (d.period) tags.push(d.period === 'daily' ? '日榜' : d.period === 'weekly' ? '周榜' : '月榜');
    var kwMap = [['ai', 'AI'], ['llm', 'LLM'], ['agent', 'Agent'], ['cli', 'CLI'], ['framework', '框架'], ['library', '库'],
      ['database', '数据库'], ['security', '安全'], ['design', '设计'], ['editor', '编辑器'], ['template', '模板'],
      ['tutorial', '教程'], ['awesome', 'Awesome'], ['skill', 'Skill'], ['mcp', 'MCP']];
    var desc = (d.description || '').toLowerCase();
    kwMap.forEach(function (p) { if (desc.indexOf(p[0]) > -1) tags.push(p[1]); });
    var seen = {}, out = [];
    tags.forEach(function (t) { if (t && !seen[t]) { seen[t] = 1; out.push(t); } });
    return out.slice(0, 4);
  }
  function loadDeposit() { try { return JSON.parse(localStorage.getItem(DEP_KEY) || '[]'); } catch (e) { return []; } }
  function saveDeposit(arr) { localStorage.setItem(DEP_KEY, JSON.stringify(arr)); }
  function isDeposited(name) { return loadDeposit().some(function (d) { return d.full_name === name; }); }
  function addDeposit(d) {
    var arr = loadDeposit();
    if (arr.some(function (x) { return x.full_name === d.full_name; })) return false;
    arr.unshift({
      full_name: d.full_name, url: d.url, description: d.description, language: d.language,
      stars: d.stars, stars_period: d.stars_period, period: d.period,
      tags: autoTag(d), note: '', status: 'todo', featured: false, addedAt: Date.now()
    });
    saveDeposit(arr); return true;
  }
  function patchDeposit(name, patch) {
    var arr = loadDeposit(); var found = null;
    arr = arr.map(function (x) { if (x.full_name === name) { found = Object.assign({}, x, patch); return found; } return x; });
    saveDeposit(arr); return found;
  }
  function removeDeposit(name) { saveDeposit(loadDeposit().filter(function (x) { return x.full_name !== name; })); }

  /* ---- 与 GitHub 同步：经 Cloudflare Worker 代理，token 不落浏览器 ---- */
  async function pullFromGitHub() {
    if (!API) return;
    try {
      var r = await fetch(API + '/deposits', { headers: { Accept: 'application/json' } });
      if (!r.ok) return;
      var j = await r.json();
      if (j && Array.isArray(j.items)) saveDeposit(j.items);
    } catch (e) {}
  }
  async function syncToGitHub(msg) {
    if (!API) return;
    try {
      var r = await fetch(API + '/deposits', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: loadDeposit(), message: msg })
      });
      if (r.ok) { toast('已同步到 GitHub'); setBackend(true); return; }
      var m = ''; try { var j = await r.json(); m = j && j.error ? String(j.error).slice(0, 60) : ''; } catch (e) {}
      toast(m ? '同步失败：' + m : 'GitHub 同步失败 ' + r.status);
      if (!r.ok) setBackend(false, 'HTTP ' + r.status);
    } catch (e) { toast('GitHub 同步失败：网络错误'); setBackend(false, '*.workers.dev 可能在你的网络被屏蔽'); }
  }

  function bindTrendButtons() {
    /* 点击列表 → 右侧侧栏切换详情（不跳转） */
    document.querySelectorAll('#trendTop [data-fn="select"], #trendList [data-fn="select"]').forEach(function (card) {
      card.addEventListener('click', function () {
        var name = card.getAttribute('data-name');
        if (!name || name === tState.selected) return;
        tState.selected = name;
        renderTrending();
      });
    });
    document.querySelectorAll('[data-fn="dep"]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var name = btn.getAttribute('data-name'), found = null;
        ['daily', 'weekly', 'monthly'].forEach(function (p) { (trending[p] || []).forEach(function (d) { if (d.full_name === name) found = d; }); });
        if (!found) return;
        if (isDeposited(name)) {
          removeDeposit(name); btn.textContent = '☆ 沉淀'; btn.classList.remove('is-on');
          toast(API ? '已移出，正在同步…' : '已移出沉淀库'); syncToGitHub('chore(deposit): 移除 ' + name);
        } else {
          addDeposit(found); btn.textContent = '★ 已沉淀'; btn.classList.add('is-on');
          toast(API ? '已沉淀（自动打标），正在同步…' : '已沉淀到我的参考库'); syncToGitHub('chore(deposit): 沉淀 ' + name);
        }
      });
    });
    document.querySelectorAll('[data-fn="chart"]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openRepoChart(btn.getAttribute('data-name'));
      });
    });
  }

  function depTagOptions() {
    var seen = {}, out = [];
    loadDeposit().forEach(function (d) { (d.tags || []).forEach(function (t) { if (!seen[t]) { seen[t] = 1; out.push(t); } }); });
    return out.sort();
  }
  var dState = { keyword: '', status: '', tag: '', sort: 'added' };
  function renderDeposit() {
    var list = $('depList'), feat = $('depFeatured'), empty = $('depEmpty'), search = $('depSearch'), tagSel = $('depTag');
    if (!list) return;
    var arr = loadDeposit().concat(curated.map(function (c) { var x = Object.assign({}, c); x.__seed = true; return x; }));
    var kw = dState.keyword.trim().toLowerCase();
    arr = arr.filter(function (d) {
      var st = d.status || 'todo';
      if (dState.status && st !== dState.status) return false;
      if (dState.tag && (d.tags || []).indexOf(dState.tag) === -1) return false;
      if (!kw) return true;
      return (d.full_name + ' ' + (d.description || '') + ' ' + (d.tags || []).join(' ') + ' ' + (d.note || '')).toLowerCase().indexOf(kw) > -1;
    });
    if (dState.sort === 'growth') arr.sort(function (a, b) { return (b.stars_period || 0) - (a.stars_period || 0); });
    else if (dState.sort === 'status') arr.sort(function (a, b) { return statusOrder(a.status || 'todo') - statusOrder(b.status || 'todo'); });
    else arr.sort(function (a, b) { return (b.addedAt || 0) - (a.addedAt || 0); });

    var featured = arr.filter(function (d) { return d.featured; });
    var featList = $('depFeaturedList');
    /* 只更新列表容器，不要清空 #depFeatured 本身——否则 pug 里写死的「我的精选」标题会被抹掉 */
    if (featList) featList.innerHTML = featured.length ? featured.map(depCard).join('') : '';
    else if (feat) feat.innerHTML = featured.length ? featured.map(depCard).join('') : '';
    if (feat) feat.hidden = featured.length === 0;
    list.innerHTML = arr.map(depCard).join('');
    if (empty) empty.hidden = arr.length > 0;
    if (tagSel) {
      var cur = tagSel.value; tagSel.innerHTML = '<option value="">全部标签</option>';
      depTagOptions().forEach(function (t) { var o = document.createElement('option'); o.value = t; o.textContent = t; tagSel.appendChild(o); });
      tagSel.value = cur;
    }
    bindDepCardEvents();
  }
  function depCard(d) {
    var st = d.status || 'todo';
    var chips = STATUS.map(function (s) {
      return '<button class="pf-status-chip ' + statusClass(s.k) + (s.k === st ? ' is-on' : '') + '" data-act="status" data-status="' + s.k + '">' + s.label + '</button>';
    }).join('');
    return '<article class="pf-dep' + (d.featured ? ' is-featured' : '') + '" data-name="' + esc(d.full_name) + '">' +
      '<div class="pf-dep-head">' +
        '<a class="pf-dep-name" href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(d.full_name) + '</a>' +
        (d.language ? '<span class="pf-lang-dot" style="background:' + langColor(d.language) + '"></span><span class="pf-dep-lang">' + esc(d.language) + '</span>' : '') +
      '</div>' +
      (d.description ? '<p class="pf-dep-desc">' + esc(d.description) + '</p>' : '') +
      (d.stars_period ? '<div class="pf-dep-growth">捕获时 ▲ ' + fmt(d.stars_period) + ' / ' + periodLabel(d.period || 'daily') + ' · 总 ★' + fmt(d.stars) + '</div>' : '') +
      '<div class="pf-dep-statusrow">' + chips + '</div>' +
      '<div class="pf-dep-edit"><input class="pf-dep-tags" data-field="tags" value="' + esc((d.tags || []).join(', ')) + '" placeholder="标签，逗号分隔"></div>' +
      '<div class="pf-dep-noteview" data-act="editnote" title="点击编辑">' + (d.note ? mdToHtml(d.note) : '<span class="pf-dep-noteempty">点击写笔记（支持 **粗体**、`代码`）</span>') + '</div>' +
      '<textarea class="pf-dep-note" data-field="note" hidden placeholder="支持 Markdown：**粗体**、`代码`、[链接](url)">' + esc(d.note || '') + '</textarea>' +
      '<div class="pf-dep-foot">' +
        '<button class="pf-mini" data-act="feat">' + (d.featured ? '★ 取消精选' : '☆ 设为精选') + '</button>' +
        (d.__seed ? '<span class="pf-dep-seed">来自 curated.json</span>' : '<button class="pf-mini pf-mini-danger" data-act="del">移除</button>') +
        (d.addedAt ? '<span class="pf-dep-date">' + new Date(d.addedAt).toLocaleDateString() + ' 沉淀</span>' : '') +
      '</div>' +
      '</article>';
  }
  function bindDepCardEvents() {
    document.querySelectorAll('.pf-dep').forEach(function (card) {
      var name = card.getAttribute('data-name');
      var seed = !!card.querySelector('.pf-dep-seed');
      var tags = card.querySelector('.pf-dep-tags');
      var noteView = card.querySelector('[data-act="editnote"]');
      var note = card.querySelector('.pf-dep-note');
      if (tags) tags.addEventListener('change', function () {
        if (seed) return;
        var t = tags.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        patchDeposit(name, { tags: t }); toast('标签已保存'); syncToGitHub('chore(deposit): 更新标签 ' + name);
      });
      if (noteView && note) {
        noteView.addEventListener('click', function () {
          if (seed) return;
          noteView.hidden = true; note.hidden = false; note.focus();
        });
        note.addEventListener('blur', function () {
          var v = note.value;
          patchDeposit(name, { note: v }); note.hidden = true;
          noteView.innerHTML = v ? mdToHtml(v) : '<span class="pf-dep-noteempty">点击写笔记（支持 **粗体**、`代码`）</span>';
          noteView.hidden = false;
          syncToGitHub('chore(deposit): 更新笔记 ' + name);
        });
      }
      card.querySelectorAll('[data-act="status"]').forEach(function (ch) {
        ch.addEventListener('click', function () {
          if (seed) return;
          var s = ch.getAttribute('data-status');
          patchDeposit(name, { status: s });
          card.querySelectorAll('[data-act="status"]').forEach(function (x) { x.classList.remove('is-on'); });
          ch.classList.add('is-on');
          toast('状态：' + statusLabel(s)); syncToGitHub('chore(deposit): 状态 ' + name + ' → ' + s);
          if (dState.sort === 'status') renderDeposit();
        });
      });
      var feat = card.querySelector('[data-act="feat"]');
      if (feat) feat.addEventListener('click', function () {
        if (seed) return;
        var cur = loadDeposit().filter(function (x) { return x.full_name === name; })[0];
        patchDeposit(name, { featured: !(cur && cur.featured) }); renderDeposit();
        syncToGitHub('chore(deposit): 调整精选 ' + name);
      });
      var del = card.querySelector('[data-act="del"]');
      if (del) del.addEventListener('click', function () {
        removeDeposit(name); renderDeposit(); toast(API ? '已移除，正在同步…' : '已移除');
        syncToGitHub('chore(deposit): 移除 ' + name);
      });
    });
  }
  function initDeposit() {
    var search = $('depSearch'), tagSel = $('depTag'), statusSel = $('depStatus'), sortSel = $('depSort');
    var exp = $('depExport'), imp = $('depImport'), impFile = $('depImportFile');
    if (search) search.addEventListener('input', function () { dState.keyword = search.value; renderDeposit(); });
    if (tagSel) tagSel.addEventListener('change', function () { dState.tag = tagSel.value; renderDeposit(); });
    if (statusSel) statusSel.addEventListener('change', function () { dState.status = statusSel.value; renderDeposit(); });
    if (sortSel) sortSel.addEventListener('change', function () { dState.sort = sortSel.value; renderDeposit(); });
    if (exp) exp.addEventListener('click', exportDeposit);
    if (imp && impFile) {
      imp.addEventListener('click', function () { impFile.click(); });
      impFile.addEventListener('change', function () { if (impFile.files && impFile.files[0]) importDeposits(impFile.files[0]); impFile.value = ''; });
    }
  }
  function exportDeposit() {
    var arr = loadDeposit().map(function (d) { var c = Object.assign({}, d); delete c.__seed; return c; });
    var json = JSON.stringify(arr, null, 2);
    var modal = document.createElement('div'); modal.className = 'pf-overlay';
    modal.innerHTML = '<div class="pf-dialog"><h3>沉淀库导出</h3>' +
      '<p class="pf-modal-tip">' + (API
        ? '复制下面的 JSON 备份；改动也会自动提交到仓库 <code>source/_data/curated.json</code>。'
        : '复制下面的 JSON 备份；本地模式下沉淀保存在浏览器，可在其他设备用「导入 JSON」恢复。') + '</p>' +
      '<textarea readonly class="pf-modal-text">' + esc(json) + '</textarea>' +
      '<div class="pf-modal-actions"><button class="pf-mini" id="pfModalCopy">复制</button><button class="pf-mini" id="pfModalClose">关闭</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('#pfModalClose').addEventListener('click', function () { document.body.removeChild(modal); });
    modal.querySelector('#pfModalCopy').addEventListener('click', function () { copy(json); });
    modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });
  }
  function importDeposits(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error('JSON 顶层需为数组');
        var cur = loadDeposit(), names = {};
        cur.forEach(function (x) { names[x.full_name] = 1; });
        var added = 0;
        data.forEach(function (x) { if (x && x.full_name && !names[x.full_name]) { cur.push(x); names[x.full_name] = 1; added++; } });
        saveDeposit(cur); renderDeposit(); syncToGitHub('chore(deposit): 导入 ' + added + ' 项');
        toast('已导入 ' + added + ' 项（自动同步中）');
      } catch (e) { toast('导入失败：' + (e.message || e)); }
    };
    reader.readAsText(file);
  }

  /* ---------------- 启动 ---------------- */
  async function probeBackend() {
    if (!API) { if (trendSource !== 'ghapi') setBackend('local'); return; }
    try {
      var ctrl = new AbortController();
      var to = setTimeout(function () { ctrl.abort(); }, 5000);
      var r = await fetch(API + '/trending?period=daily', { headers: { Accept: 'application/json' }, signal: ctrl.signal });
      clearTimeout(to);
      if (r.ok) setBackend(true);
      else if (trendSource !== 'ghapi') setBackend(false, 'HTTP ' + r.status);
    } catch (e) { if (trendSource !== 'ghapi') setBackend(false, '后端不可达，热榜仍走 GitHub API'); }
  }
  function renderStats() {
    var s = $('pfStats'); if (!s) return;
    var trendLabel = trendSource === 'worker' ? '热榜 实时(自建后端)'
      : trendSource === 'ghapi' ? '热榜 实时(GitHub API)'
      : '热榜 快照';
    var labels = [
      trendLabel,
      '沉淀库 ' + loadDeposit().length + ' 项',
      trendSource ? '数据源 已连接' : '本地模式'
    ];
    if (historyData && historyData.days) labels.splice(1, 0, '历史 ' + historyData.days + ' 天');
    s.innerHTML = '';
    labels.forEach(function (t) { var e = document.createElement('span'); e.className = 'pf-stat'; e.textContent = t; s.appendChild(e); });
  }
  /* ---------- 统一标签体系（T4）：接收来自标签导航 / URL ?tag= 的筛选 ---------- */
  function trendHay(d) {
    return [d.full_name, d.description || '', d.domain || '', d.language || ''].join(' ').toLowerCase();
  }
  window.PFPageApplyTag = function (tag) {
    var t = (window.PFTags && window.PFTags.normalize) ? window.PFTags.normalize(tag) : String(tag);
    var low = String(t).toLowerCase();
    var doms = domainOptions(), langs = langOptions();
    var inDom = doms.indexOf(t) > -1, inLang = langs.indexOf(t) > -1;
    var all = (trending[tState.period] || []).concat(trending.daily || [], trending.weekly || [], trending.monthly || []);
    var has = inDom || inLang || all.some(function (d) { return trendHay(d).indexOf(low) > -1; });
    if (!has) return false;
    var tab = document.querySelector('.pf-tab[data-tab=trending]');
    if (tab && !tab.classList.contains('is-active')) tab.click();
    if (inDom) { tState.domains = [t]; tState.langs = []; tState.keyword = ''; }
    else if (inLang) { tState.langs = [t]; tState.domains = []; tState.keyword = ''; }
    else { tState.domains = []; tState.langs = []; tState.keyword = t; }
    var si = $('trendSearch');
    if (si) si.value = tState.keyword;
    renderTrendFilters();
    renderTrending();
    return true;
  };

  function init() {
    initTabs();
    setBackend('local');   // 初始占位；loadTrending 命中 GitHub API 后会切到「热榜实时」
    initTrending();
    initDeposit();
    renderStats();
    renderRadar();
    if (API) {
      pullFromGitHub().then(function () { renderDeposit(); renderStats(); });
      loadHistory();
      loadStarred();
      probeBackend();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
