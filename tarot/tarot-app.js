/* 塔罗牌互动逻辑 · 抽牌 / 解读 / 牌库
 * 依赖：tarot-cards.js（window.TAROT_CARDS / TAROT_SUITS）、tarot-img.js（window.TAROT_IMG）
 * 无第三方库，纯原生 JS，适配 anzhiyu 主题的明暗模式。 */
(function () {
  'use strict';

  var CARDS = window.TAROT_CARDS || [];
  var IMG = window.TAROT_IMG || {};
  var SUITS = window.TAROT_SUITS || {};

  /* ---------- 牌阵定义 ---------- */
  var SPREADS = {
    daily: {
      name: '每日指引', n: 1,
      hint: '静心默念今天的状态，抽一张牌看看命运想提醒你什么。',
      pos: [{ label: '今日', icon: '☀', desc: '当下最需要你关注的能量' }]
    },
    timeline: {
      name: '时间之流', n: 3,
      hint: '心中默念你的问题，抽三张牌，看清事情的来龙去脉。',
      pos: [
        { label: '过去', icon: '◈', desc: '揭示导致现状的根源与影响因素' },
        { label: '现在', icon: '◆', desc: '映照当下的核心课题与关键能量' },
        { label: '未来', icon: '◇', desc: '指向事情的自然发展趋势' }
      ]
    },
    decision: {
      name: '十字路口', n: 3,
      hint: '面对一个需要决定的选择时，用三张牌看清局势。',
      pos: [
        { label: '现状', icon: '◆', desc: '你目前所处的真实处境' },
        { label: '阻碍', icon: '✦', desc: '正在牵绊你的力量或心结' },
        { label: '建议', icon: '✧', desc: '值得尝试的方向与行动' }
      ]
    },
    mirror: {
      name: '关系镜像', n: 3,
      hint: '想看清一段关系时，用三张牌照见彼此。',
      pos: [
        { label: '你的状态', icon: '☾', desc: '你在这段关系中的位置与心境' },
        { label: '对方 · 关系', icon: '☽', desc: '对方的状态，或关系当前的样貌' },
        { label: '走向', icon: '✧', desc: '这段关系自然发展的趋势' }
      ]
    }
  };

  /* ---------- 问题分类 ---------- */
  var QCATS = {
    general: { name: '综合', focus: '塔罗显示的是趋势而非定局。你此刻的选择，正在改写「未来」那张牌。' },
    love:    { name: '感情', focus: '感情之问：多留意「现在」这张牌，它往往指向关系中最需要被回应的部分。' },
    career:  { name: '事业', focus: '事业之问：把「未来 / 建议」牌里的关键词，拆成一个当下就能执行的小步骤。' },
    wealth:  { name: '财运', focus: '财运之问：牌面提示的是能量的流向，具体决策仍要回到现实的数字。' }
  };

  /* ---------- 工具 ---------- */
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function imgUrl(id) { return IMG[id] || IMG[id.replace(/_/g, '')] || ''; }

  var state = { spread: 'timeline', qcat: 'general', deck: [], picks: [], phase: 'idle' };

  function newDeck() {
    state.deck = shuffle(CARDS.slice());
    state.picks = [];
  }

  /* ---------- 舞台渲染 ---------- */
  function stageEl() { return document.getElementById('twStage'); }

  function renderIdle() {
    state.phase = 'idle';
    newDeck();
    try { history.replaceState(null, '', location.pathname); } catch (e) { }
    var sp = SPREADS[state.spread];
    stageEl().innerHTML =
      '<div class="tw-idle">' +
        '<div class="tw-fan-deco">' + decoBacks(9) + '</div>' +
        '<p class="tw-idle-hint">' + esc(sp.hint) + '</p>' +
        '<button class="tw-btn tw-btn-primary" id="twStart">开始占卜 · ' + esc(sp.name) + '</button>' +
        '<p class="tw-mini">共 ' + sp.n + ' 张牌 · 建议占卜前静心三次深呼吸</p>' +
      '</div>';
    document.getElementById('twStart').onclick = startShuffle;
  }

  function decoBacks(n) {
    var h = '';
    for (var i = 0; i < n; i++) {
      var rot = (i - (n - 1) / 2) * 7;
      var x = (i - (n - 1) / 2) * 26;
      var y = Math.abs(i - (n - 1) / 2) * 6;
      h += '<span class="tw-deco-back" style="transform:translate(' + x + 'px,' + y + 'px) rotate(' + rot + 'deg)"></span>';
    }
    return h;
  }

  function startShuffle() {
    state.phase = 'shuffling';
    newDeck();
    var backs = '';
    for (var i = 0; i < 12; i++) {
      backs += '<span class="tw-shuffle-back" style="--i:' + i + '"></span>';
    }
    stageEl().innerHTML = '<div class="tw-shuffling"><div class="tw-shuffle-pile">' + backs + '</div><p class="tw-mini">正在洗牌…</p></div>';
    setTimeout(startPicking, 1250);
  }

  function startPicking() {
    state.phase = 'picking';
    var sp = SPREADS[state.spread];
    var total = Math.max(9, sp.n * 4);
    var rc = IMG['card_back'] || '';
    var fan = '';
    var mid = (total - 1) / 2;
    for (var i = 0; i < total; i++) {
      var t = mid ? (i - mid) / mid : 0;                    // -1 .. 1
      var rot = t * 52;                                     // 扇形张角
      var x = t * Math.min(300, total * 20);                // 水平铺开
      var y = Math.abs(t) * 20;                             // 弧线下沉
      var z = total - Math.round(Math.abs(i - mid));        // 中间在上
      fan += '<button class="tw-pick" data-i="' + i + '" aria-label="选择第' + (i + 1) + '张牌" ' +
        'style="transform:translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(' + rot.toFixed(1) + 'deg);z-index:' + z + '">' +
        '<span class="tw-pick-inner"><img src="' + rc + '" alt="" draggable="false"></span></button>';
    }
    stageEl().innerHTML =
      '<div class="tw-picking">' +
        '<p class="tw-pick-title">凭直觉选出 <b>' + sp.n + '</b> 张牌</p>' +
        '<div class="tw-fan" id="twFan">' + fan + '</div>' +
        '<div class="tw-slots" id="twSlots"></div>' +
        '<p class="tw-mini" id="twPickTip">已选 0 / ' + sp.n + '</p>' +
      '</div>';
    renderSlots();
    var picks = document.getElementById('twFan').querySelectorAll('.tw-pick');
    for (var k = 0; k < picks.length; k++) picks[k].onclick = onPick;
  }

  function renderSlots() {
    var sp = SPREADS[state.spread];
    var box = document.getElementById('twSlots');
    if (!box) return;
    var h = '';
    for (var s = 0; s < sp.n; s++) {
      var sel = state.picks[s];
      var filled = !!sel;
      h += '<div class="tw-slot' + (filled ? ' filled' : '') + '">' +
        '<div class="tw-slot-card">' +
          (filled ? '<img src="' + esc(imgUrl(sel.card.id)) + '" alt="' + esc(sel.card.name) + '" class="' + (sel.reversed ? 'is-rev' : '') + '">' : '<span class="tw-q">?</span>') +
        '</div>' +
        '<span class="tw-slot-label">' + esc(sp.pos[s].icon + ' ' + sp.pos[s].label) + '</span>' +
      '</div>';
    }
    box.innerHTML = h;
    var tip = document.getElementById('twPickTip');
    if (tip) tip.textContent = '已选 ' + state.picks.length + ' / ' + sp.n;
  }

  function onPick(e) {
    if (state.phase !== 'picking') return;
    var sp = SPREADS[state.spread];
    if (state.picks.length >= sp.n) return;
    var btn = e.currentTarget;
    if (btn.classList.contains('used')) return;
    btn.classList.add('used');
    var card = state.deck.pop();
    state.picks.push({ card: card, reversed: Math.random() < 0.5, arcIdx: btn.getAttribute('data-i') });
    renderSlots();
    if (state.picks.length >= sp.n) {
      state.phase = 'revealing';
      setTimeout(revealAll, 380);
    }
  }

  function revealAll() {
    state.phase = 'result';
    renderResult(true);
  }

  function renderResult(animate) {
    var sp = SPREADS[state.spread];
    var q = QCATS[state.qcat];
    var h = '<div class="tw-result' + (animate ? ' tw-anim' : '') + '">';
    h += '<p class="tw-result-title">你的塔罗指引</p>';
    h += '<div class="tw-result-cards' + (sp.n === 1 ? ' one' : '') + '">';
    for (var i = 0; i < state.picks.length; i++) {
      var sel = state.picks[i], pos = sp.pos[i], c = sel.card;
      var meaning = sel.reversed ? c.rv : c.up;
      var kws = sel.reversed ? c.kwr : c.kw;
      h += '<div class="tw-rcard">' +
        '<div class="tw-rcard-head"><span class="tw-rpos">' + esc(pos.icon + ' ' + pos.label) + '</span>' +
          '<span class="tw-rtag ' + (sel.reversed ? 'rev' : 'up') + '">' + (sel.reversed ? '逆位' : '正位') + '</span></div>' +
        '<div class="tw-rcard-img"><img src="' + esc(imgUrl(c.id)) + '" alt="' + esc(c.name) + '" class="' + (sel.reversed ? 'is-rev' : '') + '"></div>' +
        '<div class="tw-rcard-name">' + esc(c.name) + '<span>' + esc(c.en) + '</span></div>' +
        '<div class="tw-kw">' + kws.map(function (k) { return '<i>' + esc(k) + '</i>'; }).join('') + '</div>' +
        '<p class="tw-rcard-desc">' + esc(meaning) + '</p>' +
        '<p class="tw-rcard-pos"><b>' + esc(pos.label) + '</b>：' + esc(pos.desc) + '</p>' +
      '</div>';
    }
    h += '</div>';
    h += '<div class="tw-focus">' + esc(q.focus) + '</div>';
    h += '<div class="tw-result-actions">' +
        '<button class="tw-btn" id="twAgain">重新抽牌</button>' +
        '<button class="tw-btn tw-btn-ghost" id="twCopy">复制结果链接</button>' +
      '</div>';
    h += '</div>';
    stageEl().innerHTML = h;
    updateURL();
    document.getElementById('twAgain').onclick = function () { startShuffle(); scrollToOracle(); };
    document.getElementById('twCopy').onclick = copyLink;
    if (animate) animateIn();
    scrollToOracle();
  }

  function animateIn() {
    var items = stageEl().querySelectorAll('.tw-rcard');
    for (var i = 0; i < items.length; i++) {
      (function (it, idx) {
        it.style.opacity = '0';
        it.style.transform = 'translateY(14px)';
        setTimeout(function () { it.style.transition = 'opacity .5s,transform .5s'; it.style.opacity = '1'; it.style.transform = 'none'; }, 120 * idx + 60);
      })(items[i], i);
    }
  }

  function scrollToOracle() {
    var el = document.getElementById('twOracle');
    if (el && el.scrollIntoView) try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { }
  }

  /* ---------- 分享链接 ---------- */
  function resultParam() {
    var c = state.picks.map(function (s) { return s.card.id + (s.reversed ? '-r' : ''); }).join(',');
    return '?sp=' + state.spread + '&q=' + state.qcat + '&c=' + c;
  }
  /* 结果写入地址栏：可回看、可分享（与 taluo.net 同思路） */
  function updateURL() {
    try { history.replaceState(null, '', location.pathname + resultParam()); } catch (e) { }
  }
  function copyLink() {
    var url = location.origin + location.pathname + resultParam();
    var done = function () { toast('结果链接已复制，去分享你的牌面吧'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url, done); });
    } else fallbackCopy(url, done);
  }
  function fallbackCopy(text, cb) {
    var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); cb(); } catch (e) { }
    ta.remove();
  }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'tw-toast'; t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); }, 1800);
    setTimeout(function () { t.remove(); }, 2300);
  }

  /* URL 回放：?sp=timeline&q=love&c=major_0-r,cup_3,... */
  function replayFromURL() {
    var qs = new URLSearchParams(location.search);
    var c = qs.get('c');
    if (!c) return false;
    var sp = qs.get('sp') || 'timeline';
    var q = qs.get('q') || 'general';
    if (!SPREADS[sp]) sp = 'timeline';
    if (!QCATS[q]) q = 'general';
    var parts = c.split(',').filter(Boolean).slice(0, SPREADS[sp].n);
    if (!parts.length) return false;
    var picks = [];
    for (var i = 0; i < parts.length; i++) {
      var rev = /-r$/.test(parts[i]);
      var id = parts[i].replace(/-r$/, '');
      var card = CARDS.filter(function (x) { return x.id === id; })[0];
      if (card) picks.push({ card: card, reversed: rev });
    }
    if (picks.length !== SPREADS[sp].n) return false;
    state.spread = sp; state.qcat = q; state.picks = picks; state.phase = 'result';
    syncControls();
    renderResult(false);
    return true;
  }

  /* ---------- 控件 ---------- */
  function buildControls() {
    var spBox = document.getElementById('twSpreads');
    if (!spBox) return;
    var h = '';
    Object.keys(SPREADS).forEach(function (k) {
      h += '<button class="tw-chip' + (k === state.spread ? ' on' : '') + '" data-sp="' + k + '">' + esc(SPREADS[k].name) + ' · ' + SPREADS[k].n + '张</button>';
    });
    spBox.innerHTML = h;
    var qBox = document.getElementById('twQcats');
    var h2 = '';
    Object.keys(QCATS).forEach(function (k) {
      h2 += '<button class="tw-chip tw-chip-sm' + (k === state.qcat ? ' on' : '') + '" data-q="' + k + '">' + esc(QCATS[k].name) + '</button>';
    });
    qBox.innerHTML = h2;
    spBox.querySelectorAll('[data-sp]').forEach(function (b) {
      b.onclick = function () { state.spread = b.getAttribute('data-sp'); syncControls(); renderIdle(); };
    });
    qBox.querySelectorAll('[data-q]').forEach(function (b) {
      b.onclick = function () { state.qcat = b.getAttribute('data-q'); syncControls(); };
    });
  }
  function syncControls() {
    document.querySelectorAll('#twSpreads [data-sp]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-sp') === state.spread); });
    document.querySelectorAll('#twQcats [data-q]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-q') === state.qcat); });
  }

  /* ---------- 牌库 ---------- */
  var libFilter = 'all', libSearch = '';
  function buildLibrary() {
    var fBox = document.getElementById('twLibFilter');
    if (!fBox) return;
    var groups = [['all', '全部 78']].concat(Object.keys(SUITS).map(function (k) { return [k, SUITS[k].name + ' ' + CARDS.filter(function (c) { return (c.suit || 'major') === k || (k === 'major' && c.arcana === 'major'); }).length]; }));
    var h = '';
    groups.forEach(function (g) { h += '<button class="tw-chip tw-chip-sm' + (g[0] === libFilter ? ' on' : '') + '" data-f="' + g[0] + '">' + esc(g[1]) + '</button>'; });
    h += '<input class="tw-search" id="twSearch" type="search" placeholder="搜索牌名 / 关键词…">';
    fBox.innerHTML = h;
    fBox.querySelectorAll('[data-f]').forEach(function (b) {
      b.onclick = function () { libFilter = b.getAttribute('data-f'); buildLibrary(); renderLib(); };
    });
    var si = document.getElementById('twSearch');
    if (si) { si.value = libSearch; si.oninput = function () { libSearch = si.value.trim(); renderLib(); }; }
    renderLib();
  }
  function suitOf(c) { return c.arcana === 'major' ? 'major' : c.suit; }
  function renderLib() {
    var grid = document.getElementById('twLibGrid');
    if (!grid) return;
    var kw = libSearch.toLowerCase();
    var list = CARDS.filter(function (c) {
      if (libFilter !== 'all' && suitOf(c) !== libFilter) return false;
      if (kw) {
        var hay = (c.name + ' ' + c.en + ' ' + c.kw.join(' ') + ' ' + c.kwr.join(' ')).toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    });
    if (!list.length) { grid.innerHTML = '<p class="tw-empty">没有找到匹配的牌</p>'; return; }
    var h = '';
    list.forEach(function (c) {
      h += '<button class="tw-lcard" data-id="' + c.id + '">' +
        '<span class="tw-lcard-img"><img src="' + esc(imgUrl(c.id)) + '" alt="' + esc(c.name) + '" loading="lazy"></span>' +
        '<span class="tw-lcard-num">' + esc(c.rank) + ' · ' + esc((SUITS[suitOf(c)] || {}).short || '') + '</span>' +
        '<span class="tw-lcard-name">' + esc(c.name) + '</span>' +
      '</button>';
    });
    grid.innerHTML = h;
    grid.querySelectorAll('.tw-lcard').forEach(function (b) {
      b.onclick = function () { openModal(b.getAttribute('data-id')); };
    });
  }

  function openModal(id) {
    var c = CARDS.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var box = document.getElementById('twModalBox');
    box.innerHTML =
      '<button class="tw-modal-x" id="twModalX" aria-label="关闭">×</button>' +
      '<div class="tw-modal-main">' +
        '<img src="' + esc(imgUrl(c.id)) + '" alt="' + esc(c.name) + '">' +
        '<div class="tw-modal-meta"><span class="tw-modal-suit">' + esc((SUITS[suitOf(c)] || {}).name || '') + '</span><h3>' + esc(c.name) + '</h3><p>' + esc(c.en) + ' · ' + esc(c.rank) + '</p></div>' +
      '</div>' +
      '<div class="tw-modal-mean">' +
        '<div class="tw-mm"><h4>正位</h4><div class="tw-kw">' + c.kw.map(function (k) { return '<i>' + esc(k) + '</i>'; }).join('') + '</div><p>' + esc(c.up) + '</p></div>' +
        '<div class="tw-mm"><h4>逆位</h4><div class="tw-kw">' + c.kwr.map(function (k) { return '<i>' + esc(k) + '</i>'; }).join('') + '</div><p>' + esc(c.rv) + '</p></div>' +
      '</div>';
    document.getElementById('twModal').classList.add('open');
    document.getElementById('twModalX').onclick = closeModal;
  }
  function closeModal() { var m = document.getElementById('twModal'); if (m) m.classList.remove('open'); }

  /* ---------- 初始化 ---------- */
  function init() {
    var root = document.getElementById('twRoot');
    if (!root || !CARDS.length) return;
    if (root.getAttribute('data-inited') === '1') { return; }
    root.setAttribute('data-inited', '1');

    state.spread = 'timeline'; state.qcat = 'general'; state.picks = [];
    buildControls();
    if (!replayFromURL()) renderIdle();
    buildLibrary();

    var modal = document.getElementById('twModal');
    if (modal) modal.onclick = function (e) { if (e.target === modal) closeModal(); };
  }

  // Esc 关闭弹窗（全局绑定一次，避免 pjax 反复执行时监听器累积）
  if (!window.__twKeyBound) {
    window.__twKeyBound = true;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('pjax:complete', init);
})();
