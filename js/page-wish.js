/**
 * 心愿墙 page-wish.js v=20260907b
 * 便签墙（心愿/树洞）· 数据层：Cloudflare Worker API，未部署/不可达时自动降级为本地模式
 * 能力：投稿(颜色/类型/匿名/目标日期)、状态流转、撤回自己的便签、点赞、共鸣留言、
 *       页内搜索、最新/最热排序、本地便签迁移云端、站长审核模式、树洞渐隐揭示
 * 约定：所有用户内容一律用 textContent 写入，杜绝 XSS
 */
(function () {
  'use strict';
  var API = (window.WISH_API || '').replace(/\/+$/, '');
  var root = null;

  var LS_NOTES = 'wishWall.v1';   // 本地模式便签
  var LS_MINE = 'wishMine.v1';    // 我创建的便签 {id: token}
  var LS_LIKED = 'wishLiked.v1';  // 本机已点赞 id 列表
  var SS_ADMIN = 'wishAdmin';     // 站长审核密钥（会话级）
  var COLORS = ['奶油黄', '薄荷绿', '天空蓝', '樱花粉', '薰衣草', '蜜桃橙', '暖灰白', '淡青'];

  /* ===== 站长预置便签（静态种子） =====
   * 这几张随页面内置展示，让墙在没有云端时也有内容；是否上云、访客互动都不影响它们。
   * 内容可自由增删改：改下面的文字即可；type 用 'wish'（不要放树洞，树洞是匿名给访客用的）。
   * seed:true 表示只读展示——不参与点赞/留言/状态修改/撤回。
   */
  var SEED_NOTES = [
    { id: 'seed-blog', seed: true, type: 'wish', nick: 'Lifeline', content: '把这个博客写到第十年——这是和「十年之约」的约定。目前 133 篇，目标 200 篇。', color: 0, status: 'doing', created: new Date('2023-04-01T09:00:00').getTime(), target: null, replies: [] },
    { id: 'seed-data', seed: true, type: 'wish', nick: 'Lifeline', content: '毕业不停学：在大数据这条路上一直走下去，永远怀着一颗学徒的心。', color: 1, status: 'doing', created: new Date('2024-06-30T09:00:00').getTime(), target: null, replies: [] },
    { id: 'seed-welcome', seed: true, type: 'wish', nick: 'Lifeline', content: '愿每一位路过这里的人，都能带走一点有用的东西。', color: 3, status: 'pending', created: new Date('2026-01-01T00:00:00').getTime(), target: null, replies: [] },
  ];

  /* ===== 敏感词首道过滤（发便签/留言前本地拦截） =====
   * 云端模式下 Worker 端还有一份可通过 BAD_WORDS 环境变量配置的词表，两边独立生效。
   * 这里是内置的兜底词表，按需增删。
   */
  var BAD_WORDS = ['代开发票', '刷单', '网赚', '博彩', '赌博', '六合彩', '外挂', '色情', '约炮', '加微信卖', '贷款代办', '办证'];
  function hasBadWord(text) {
    var t = (text || '').toLowerCase();
    return BAD_WORDS.some(function (w) { return t.indexOf(w.toLowerCase()) !== -1; });
  }

  var STATUS = {
    pending: { text: '待实现', icon: 'anzhiyu-icon-hourglass-start', cls: 's-pending' },
    doing: { text: '进行中', icon: 'anzhiyu-icon-stopwatch', cls: 's-doing' },
    done: { text: '已实现', icon: 'anzhiyu-icon-circle-check', cls: 's-done' }
  };
  var NEXT_STATUS = { pending: 'doing', doing: 'done', done: 'pending' };
  var TYPE_TIP = {
    wish: '写下你想实现的事，实现后可以回来点亮它',
    hole: '树洞完全匿名，说说那些没地方说的话（墙上会模糊，点开才看清）'
  };

  var mode = 'local';             // 'online' | 'local'
  var notes = [];
  var mine = readJSON(LS_MINE, {});
  var liked = readJSON(LS_LIKED, []);
  var filter = 'all';
  var query = '';
  var sortKey = 'new';
  var adminMode = false;
  var renderLimit = 60;           // 分页渲染：一次最多画多少张，点「显示更多」继续
  var PAGE_SIZE = 60;
  var curType = 'wish';
  var curColor = 0;
  var sending = false;

  function readJSON(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  function $(sel) { return root.querySelector(sel); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function icon(name) {
    var i = document.createElement('i');
    i.className = 'anzhiyufont anzhiyu-icon-' + name;
    return i;
  }
  function fmtDate(ts) {
    var d = new Date(ts);
    var now = new Date();
    var sameYear = d.getFullYear() === now.getFullYear();
    return (sameYear ? '' : d.getFullYear() + ' 年 ') + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }
  function relTime(ts) {
    var diff = Date.now() - ts;
    if (diff < 60e3) return '刚刚';
    if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
    if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前';
    if (diff < 7 * 86400e3) return Math.floor(diff / 86400e3) + ' 天前';
    return fmtDate(ts);
  }
  function markWishAch() {
    try {
      if (window.anzhiyu && typeof window.anzhiyu.markAchievement === 'function') {
        window.anzhiyu.markAchievement('wish');
      }
    } catch (e) { /* ignore */ }
  }
  function toast(msg, ok) {
    var t = el('div', 'wb-toast' + (ok === false ? ' err' : ''), msg);
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 350); }, 2600);
  }

  /* ---------------- API 层 ---------------- */
  function fetchJSON(url, opts, timeout) {
    opts = opts || {};
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, timeout || 8000);
    opts.signal = ctl.signal;
    return fetch(url, opts).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).catch(function (e) { clearTimeout(timer); throw e; });
  }
  function apiGet(adminKey) {
    if (!API) return Promise.reject(new Error('no-api'));
    return fetchJSON(API + '/wishes', adminKey ? { headers: { 'X-Admin-Key': adminKey } } : {}).then(function (d) {
      if (!d || !d.ok || !Array.isArray(d.wishes)) throw new Error('bad-payload');
      return d.wishes;
    });
  }
  function apiPost(note) {
    return fetchJSON(API + '/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(note)
    }).then(function (d) {
      if (!d || !d.ok || !d.wish) throw new Error('bad-payload');
      return d.wish;
    });
  }
  function apiLike(id) {
    return fetchJSON(API + '/wishes/' + encodeURIComponent(id) + '/like', { method: 'POST' });
  }
  function apiStatus(id, token, status) {
    return fetchJSON(API + '/wishes/' + encodeURIComponent(id) + '/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, status: status })
    });
  }
  function apiDelete(id, token, adminKey) {
    var headers = { 'Content-Type': 'application/json' };
    if (adminKey) headers['X-Admin-Key'] = adminKey;
    return fetchJSON(API + '/wishes/' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: headers,
      body: JSON.stringify(adminKey ? {} : { token: token })
    });
  }
  function apiReply(id, nick, content) {
    return fetchJSON(API + '/wishes/' + encodeURIComponent(id) + '/replies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nick: nick, content: content })
    }).then(function (d) {
      if (!d || !d.ok || !d.reply) throw new Error('bad-payload');
      return d;
    });
  }
  function apiEdit(id, token, content) {
    return fetchJSON(API + '/wishes/' + encodeURIComponent(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, content: content })
    }).then(function (d) {
      if (!d || !d.ok || !d.wish) throw new Error('bad-payload');
      return d.wish;
    });
  }
  function apiApprove(id, adminKey) {
    return fetchJSON(API + '/wishes/' + encodeURIComponent(id) + '/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
      body: JSON.stringify({ approve: true })
    });
  }
  function apiImport(list) {
    return fetchJSON(API + '/wishes/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: list })
    }).then(function (d) {
      if (!d || !d.ok) throw new Error('bad-payload');
      return d;
    });
  }

  /* ---------------- 数据 ---------------- */
  function loadNotes() {
    if (mode === 'online') {
      var key = adminMode ? sessionStorage.getItem(SS_ADMIN) : null;
      return apiGet(key).then(function (list) {
        notes = SEED_NOTES.concat(list);
        return true;
      }).catch(function () { enterLocal('云端暂时联系不上，已切换到本地模式'); return false; });
    }
    notes = SEED_NOTES.concat(readJSON(LS_NOTES, []));
    return Promise.resolve(false);
  }
  function enterLocal(reason) {
    mode = 'local';
    notes = SEED_NOTES.concat(readJSON(LS_NOTES, []));
    renderMode(true);
    if (reason) toast(reason, false);
  }
  function isMine(id) { return Object.prototype.hasOwnProperty.call(mine, id); }
  function saveLocal() { writeJSON(LS_NOTES, notes.filter(function (n) { return !n.seed; })); }
  function replyCount(n) { return (n.replies || []).length; }

  /* ---------------- 筛选 / 排序 / 搜索 ---------------- */
  function visible() {
    var q = query.toLowerCase();
    var list = notes.filter(function (n) {
      if (filter === 'wish' && n.type !== 'wish') return false;
      if (filter === 'hole' && n.type !== 'hole') return false;
      if (filter === 'mine' && !isMine(n.id)) return false;
      if (q && (n.content + ' ' + (n.nick || '')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    if (sortKey === 'hot') {
      list.sort(function (a, b) {
        return ((b.likes || 0) * 2 + replyCount(b)) - ((a.likes || 0) * 2 + replyCount(a)) || b.created - a.created;
      });
    } else {
      list.sort(function (a, b) { return b.created - a.created; });
    }
    return list;
  }

  /* ---------------- 渲染 ---------------- */
  function renderMode(isLocal) {
    var badge = $('#wb-mode');
    if (!badge) return;
    badge.innerHTML = '';
    if (isLocal) {
      badge.appendChild(icon('hourglass-start'));
      badge.appendChild(document.createTextNode('本地模式'));
      if (!$('.wb-banner')) {
        var banner = el('div', 'wb-banner');
        banner.appendChild(icon('hourglass-start'));
        banner.appendChild(document.createTextNode('便签暂存在这台设备的浏览器里；站长部署 wish-api 后，这里会自动变成所有访客共享的云端心愿墙。'));
        var hero = $('.fp-hero');
        if (hero) hero.after(banner);
      }
    } else {
      badge.appendChild(icon('circle-check'));
      badge.appendChild(document.createTextNode('云端已连接'));
      var old = $('.wb-banner'); if (old && !old.querySelector('.wb-migrate')) old.remove();
    }
  }

  function renderAll(animateFirst) {
    renderWall(animateFirst);
    renderStats();
  }

  function renderWall(animateFirst) {
    var wall = $('#wb-wall');
    var empty = $('#wb-empty');
    if (!wall) return;
    wall.innerHTML = '';
    var list = visible();
    var noneAtAll = notes.length === 0;
    if (!list.length && !noneAtAll) {
      // 有便签但被筛选/搜索滤空
      var nohit = el('div', 'wb-nohit');
      nohit.appendChild(icon('magnifying-glass'));
      nohit.appendChild(el('p', '', query ? '没有匹配「' + query + '」的便签' : '这个筛选下还没有便签'));
      wall.appendChild(nohit);
      empty.hidden = true;
      return;
    }
    empty.hidden = list.length !== 0;
    // 分页渲染：超过 renderLimit 的部分点「显示更多」继续画
    var shown = list.slice(0, renderLimit);
    shown.forEach(function (n, i) {
      var card = buildCard(n);
      if (animateFirst) {
        card.style.animationDelay = Math.min(i, 11) * 55 + 'ms';
      } else {
        card.style.animation = 'none';
      }
      wall.appendChild(card);
    });
    if (list.length > renderLimit) {
      var more = el('button', 'wb-more');
      more.type = 'button';
      more.textContent = '显示更多（还有 ' + (list.length - renderLimit) + ' 张）';
      more.addEventListener('click', function () {
        renderLimit += PAGE_SIZE;
        renderWall(false);
      });
      wall.appendChild(more);
    }
    if (animateFirst && shown.length) {
      setTimeout(function () {
        wall.querySelectorAll('.wb-note').forEach(function (c) { c.style.animation = 'none'; });
      }, 1300);
    }
  }

  function buildCard(n) {
    var card = el('article', 'wb-note c' + (n.color || 0));
    card.dataset.id = n.id;

    var head = el('div', 'wb-note-head');
    var tag = el('span', 'wb-tag t-' + n.type);
    tag.appendChild(icon(n.type === 'wish' ? 'plant-fill' : 'moon'));
    tag.appendChild(document.createTextNode(n.type === 'wish' ? '心愿' : '树洞'));
    head.appendChild(tag);
    if (n.seed) head.appendChild(el('span', 'wb-tag t-owner', '站长'));
    if (isMine(n.id)) head.appendChild(el('span', 'wb-tag t-mine', '我的'));
    // 删除/编辑按钮：审核模式删任何便签；普通访客删/改自己的（种子便签只读）
    if (!n.seed && (adminMode || isMine(n.id))) {
      if (isMine(n.id)) {
        var editBtn = el('button', 'wb-del');
        editBtn.type = 'button';
        editBtn.title = '编辑这张便签';
        editBtn.appendChild(icon('pencil'));
        editBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          editMine(card, n);
        });
        head.appendChild(editBtn);
      }
      var del = el('button', 'wb-del' + (adminMode ? ' admin' : ''));
      del.type = 'button';
      del.title = adminMode ? '审核删除' : '撤回这张便签';
      del.appendChild(icon('circle-xmark'));
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        if (adminMode) adminDelete(n.id);
        else removeMine(n.id);
      });
      head.appendChild(del);
    }
    if (n.review === 'pending') {
      head.appendChild(el('span', 'wb-tag t-review', '待审核'));
      if (adminMode) {
        var ok = el('button', 'wb-del admin');
        ok.type = 'button';
        ok.title = '审核通过，公开上墙';
        ok.appendChild(icon('circle-check'));
        ok.addEventListener('click', function (e) { e.stopPropagation(); approveReview(n.id); });
        head.appendChild(ok);
      }
    }
    card.appendChild(head);

    var body = el('div', 'wb-note-content', n.content);
    if (n.type === 'hole' && !isMine(n.id)) {
      body.classList.add('wb-secret');
      body.title = '树洞内容已模糊，点击揭示';
      body.addEventListener('click', function () { body.classList.add('wb-revealed'); });
    }
    card.appendChild(body);

    if (n.type === 'wish') {
      var st = STATUS[n.status] || STATUS.pending;
      var sb = el('button', 'wb-status ' + st.cls);
      sb.type = 'button';
      sb.appendChild(icon(st.icon));
      sb.appendChild(document.createTextNode(st.text));
      if (isMine(n.id)) {
        sb.classList.add('clickable');
        sb.title = '点击切换状态（只有你能改）';
        sb.addEventListener('click', function () { cycleStatus(n.id, sb); });
      }
      card.appendChild(sb);
      var tgt = targetChip(n);
      if (tgt) card.appendChild(tgt);
    }

    var foot = el('div', 'wb-note-foot');
    var meta = el('div', 'wb-note-meta');
    meta.appendChild(el('span', 'wb-note-nick', n.type === 'hole' && !n.nick ? '匿名树洞' : (n.nick || '匿名')));
    meta.appendChild(el('span', '', fmtDate(n.created)));
    foot.appendChild(meta);

    var actions = el('div', '');
    actions.style.display = 'flex';
    actions.style.alignItems = 'center';
    actions.style.gap = '2px';
    if (!n.seed) {
      var rb = el('button', 'wb-reply-btn');
      rb.type = 'button';
      rb.appendChild(icon('comments'));
      rb.appendChild(el('span', 'wb-reply-num', replyCount(n) ? String(replyCount(n)) : '留言'));
      rb.addEventListener('click', function () { toggleReplies(card, n); });
      actions.appendChild(rb);
      if (mode === 'online') {
        var lk = el('button', 'wb-like' + (liked.indexOf(n.id) > -1 ? ' liked' : ''));
        lk.type = 'button';
        lk.appendChild(icon('heartbeat'));
        lk.appendChild(el('span', 'wb-like-num', String(n.likes || 0)));
        lk.addEventListener('click', function () { doLike(n.id, lk); });
        actions.appendChild(lk);
      }
    }
    foot.appendChild(actions);
    card.appendChild(foot);

    // 留言区（隐藏，点开渲染）
    var rp = el('div', 'wb-replies');
    rp.hidden = true;
    card.appendChild(rp);
    return card;
  }

  function targetChip(n) {
    if (!n.target || n.status === 'done') return null;
    var end = new Date(n.target + 'T23:59:59').getTime();
    if (isNaN(end)) return null;
    var days = Math.ceil((end - Date.now()) / 86400e3);
    var chip = el('span', 'wb-target');
    if (days < 0) {
      chip.classList.add('s-over');
      chip.appendChild(icon('hourglass-start'));
      chip.appendChild(document.createTextNode('到期 ' + (-days) + ' 天，实现了吗？'));
    } else if (days <= 7) {
      chip.classList.add('s-hit');
      chip.appendChild(icon('stopwatch'));
      chip.appendChild(document.createTextNode(days === 0 ? '就是今天' : '还剩 ' + days + ' 天'));
    } else {
      chip.classList.add('s-run');
      chip.appendChild(icon('calendar-days'));
      chip.appendChild(document.createTextNode('还剩 ' + days + ' 天'));
    }
    return chip;
  }

  /* ---------------- 留言 ---------------- */
  function toggleReplies(card, n) {
    var box = card.querySelector('.wb-replies');
    if (!box) return;
    var opening = box.hidden;
    box.hidden = !opening;
    if (opening) renderReplies(card, n);
  }
  function renderReplies(card, n) {
    var box = card.querySelector('.wb-replies');
    if (!box) return;
    box.innerHTML = '';
    var list = n.replies || [];
    if (!list.length) box.appendChild(el('div', 'wb-reply-empty', '还没有留言，来说第一句吧'));
    list.forEach(function (r) {
      var item = el('div', 'wb-reply-item');
      var b = el('b', '', (r.nick || '匿名') + '：');
      item.appendChild(b);
      item.appendChild(document.createTextNode(' ' + r.content));
      item.appendChild(el('span', 'wb-reply-time', relTime(r.created)));
      box.appendChild(item);
    });
    var form = el('div', 'wb-reply-form');
    var nick = el('input', 'wb-input wb-reply-nick');
    nick.type = 'text'; nick.maxLength = 12; nick.placeholder = '昵称(可匿名)';
    var text = el('input', 'wb-input wb-reply-text');
    text.type = 'text'; text.maxLength = 100; text.placeholder = '写点鼓励的话…（Ctrl+Enter 发送）';
    var send = el('button', 'wb-reply-send', '送出');
    send.type = 'button';
    function go() {
      var content = text.value.trim();
      if (!content) { text.focus(); return; }
      if (hasBadWord(content) || hasBadWord(nick.value)) { toast('留言包含不允许的词，请修改', false); return; }
      send.disabled = true;
      var apply = function (reply) {
        n.replies = n.replies || [];
        n.replies.push(reply);
        if (mode === 'local') saveLocal();
        text.value = '';
        send.disabled = false;
        renderReplies(card, n);
        var cnt = card.querySelector('.wb-reply-num');
        if (cnt) cnt.textContent = String(replyCount(n));
        toast('留言已送出');
      };
      if (mode === 'online') {
        apiReply(n.id, nick.value.trim(), content).then(function (d) { apply(d.reply); })
          .catch(function () { toast('云端留言失败，稍后再试', false); send.disabled = false; });
      } else {
        apply({ id: 'r' + Date.now().toString(36), nick: nick.value.trim(), content: content, created: Date.now() });
      }
    }
    send.addEventListener('click', go);
    text.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); go(); }
    });
    form.appendChild(nick); form.appendChild(text); form.appendChild(send);
    box.appendChild(form);
  }

  /* ---------------- 统计 ---------------- */
  function renderStats() {
    var wishes = notes.filter(function (n) { return n.type === 'wish'; }).length;
    var holes = notes.length - wishes;
    var likes = notes.reduce(function (s, n) { return s + (n.likes || 0); }, 0);
    $('#wb-count-all').textContent = notes.length;
    $('#wb-count-wish').textContent = wishes;
    $('#wb-count-hole').textContent = holes;
    $('#wb-count-likes').textContent = likes;
  }

  /* ---------------- 点赞 / 状态 / 删除 ---------------- */
  function doLike(id, btn) {
    if (liked.indexOf(id) > -1) { toast('已经点过共鸣啦', false); return; }
    apiLike(id).then(function (d) {
      liked.push(id);
      writeJSON(LS_LIKED, liked);
      btn.classList.add('liked');
      btn.querySelector('.wb-like-num').textContent = String(d.likes);
      var note = notes.find(function (n) { return n.id === id; });
      if (note) note.likes = d.likes;
      renderStats();
    }).catch(function () { toast('网络开小差了，稍后再试', false); });
  }

  function cycleStatus(id, btn) {
    var note = notes.find(function (n) { return n.id === id; });
    if (!note) return;
    var next = NEXT_STATUS[note.status || 'pending'];
    var apply = function () {
      note.status = next;
      paintStatus(btn, next);
      if (mode === 'local') saveLocal();
      // 倒计时徽章随状态刷新（已实现则隐藏）
      var card = btn.closest('.wb-note');
      var old = card && card.querySelector('.wb-target');
      if (old) old.remove();
      var note2 = notes.find(function (x) { return x.id === id; });
      if (card && note2 && next !== 'done') {
        var chip = targetChip(note2);
        if (chip) btn.after(chip);
      }
    };
    if (mode === 'online') {
      apiStatus(id, mine[id] || '', next).then(apply).catch(function () { toast('状态同步失败', false); });
    } else {
      apply();
    }
  }
  function paintStatus(btn, status) {
    var st = STATUS[status] || STATUS.pending;
    btn.className = 'wb-status clickable ' + st.cls;
    btn.innerHTML = '';
    btn.appendChild(icon(st.icon));
    btn.appendChild(document.createTextNode(st.text));
  }

  /* 编辑自己的便签：正文区变输入框，保存时走云端 PUT 或本地直改 */
  function editMine(card, n) {
    var body = card.querySelector('.wb-note-content');
    if (!body || card.querySelector('.wb-edit-box')) return;
    var box = el('div', 'wb-edit-box');
    var ta = el('textarea', 'wb-input wb-textarea');
    ta.maxLength = 200;
    ta.value = n.content;
    ta.rows = 3;
    var bar = el('div', 'wb-edit-bar');
    var save = el('button', 'wb-reply-send', '保存');
    save.type = 'button';
    var cancel = el('button', 'wb-reply-cancel', '取消');
    cancel.type = 'button';
    bar.appendChild(save);
    bar.appendChild(cancel);
    box.appendChild(ta);
    box.appendChild(bar);
    body.style.display = 'none';
    body.after(box);
    ta.focus();
    cancel.addEventListener('click', function () {
      box.remove();
      body.style.display = '';
    });
    function commit() {
      var v = ta.value.trim();
      if (!v) { ta.focus(); return; }
      if (v === n.content) { cancel.click(); return; }
      if (hasBadWord(v)) { toast('内容包含不允许的词，请修改', false); return; }
      save.disabled = true;
      var apply = function () {
        n.content = v;
        if (mode === 'local') saveLocal();
        box.remove();
        body.textContent = v;
        body.style.display = '';
        toast('便签已更新');
      };
      if (mode === 'online') {
        apiEdit(n.id, mine[n.id] || '', v).then(apply).catch(function () {
          save.disabled = false;
          toast('保存失败，稍后再试', false);
        });
      } else {
        apply();
      }
    }
    save.addEventListener('click', commit);
    ta.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); commit(); }
    });
  }

  function approveReview(id) {
    var key = sessionStorage.getItem(SS_ADMIN);
    if (!key) { exitAdmin(); return; }
    apiApprove(id, key).then(function () {
      var note = notes.find(function (x) { return x.id === id; });
      if (note) note.review = 'approved';
      renderWall(false);
      toast('已通过审核，便签上墙');
    }).catch(function () { toast('操作失败', false); });
  }

  function removeMine(id) {
    if (!confirm('确定撤回这张便签吗？撤回后无法恢复。')) return;
    var apply = function () {
      notes = notes.filter(function (n) { return n.id !== id; });
      delete mine[id];
      writeJSON(LS_MINE, mine);
      if (mode === 'local') saveLocal();
      renderAll(false);
      toast('便签已撤回');
    };
    if (mode === 'online') {
      apiDelete(id, mine[id] || '', null).then(apply).catch(function () { toast('撤回失败，稍后再试', false); });
    } else {
      apply();
    }
  }

  function adminDelete(id) {
    var key = sessionStorage.getItem(SS_ADMIN);
    if (!key) { exitAdmin(); return; }
    if (!confirm('审核模式：确定删除这张便签？')) return;
    apiDelete(id, '', key).then(function () {
      notes = notes.filter(function (n) { return n.id !== id; });
      renderAll(false);
      toast('已删除');
    }).catch(function (e) {
      if (String(e.message).indexOf('403') > -1) {
        sessionStorage.removeItem(SS_ADMIN);
        exitAdmin();
        toast('管理密钥不对，已退出审核模式', false);
      } else {
        toast('删除失败', false);
      }
    });
  }

  function exitAdmin() {
    adminMode = false;
    sessionStorage.removeItem(SS_ADMIN);
    paintAdminBtn();
    if (mode === 'online') {
      loadNotes().then(function () { renderAll(false); });
    } else {
      renderWall(false);
    }
  }
  function enterAdmin() {
    var key = prompt('输入管理密钥（ADMIN_KEY）进入审核模式：');
    if (key === null) return;
    if (!key) { toast('密钥不能为空', false); return; }
    sessionStorage.setItem(SS_ADMIN, key);
    adminMode = true;
    paintAdminBtn();
    if (mode === 'online') {
      loadNotes().then(function () { renderAll(false); });
    } else {
      renderWall(false);
    }
    toast('已进入审核模式，再点一次可退出');
  }
  function paintAdminBtn() {
    var b = $('#wb-admin-btn');
    if (!b) return;
    b.classList.toggle('on', adminMode);
    var txt = b.querySelector('.wb-admin-text');
    if (txt) txt.textContent = adminMode ? '退出审核模式' : '站长审核入口';
    var ex = $('#wb-export-btn');
    if (ex) ex.hidden = !adminMode;
  }

  /* ---------------- 迁移 ---------------- */
  function maybeOfferMigrate() {
    if (mode !== 'online') return;
    var localNotes = readJSON(LS_NOTES, []);
    if (!localNotes.length) return;
    if ($('.wb-banner')) return;
    var banner = el('div', 'wb-banner');
    banner.appendChild(icon('circle-check'));
    banner.appendChild(document.createTextNode('检测到本机存有 ' + localNotes.length + ' 张旧便签，可以一键上传到云端墙（保留昵称、状态与你的所有权）。'));
    var btn = el('button', 'wb-migrate', '一键上传');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = '上传中…';
      apiImport(localNotes).then(function () {
        try { localStorage.removeItem(LS_NOTES); } catch (e) {}
        banner.remove();
        toast('迁移完成，旧便签已上墙');
        return apiGet().then(function (list) { notes = list; renderAll(true); });
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = '一键上传';
        toast('上传失败，稍后再试', false);
      });
    });
    banner.appendChild(btn);
    var hero = $('.fp-hero');
    if (hero) hero.after(banner);
  }

  /* ---------------- 投稿 ---------------- */
  function buildColorDots() {
    var box = $('#wb-colors');
    box.innerHTML = '';
    var NOTE_CSS = ['#fff8d6', '#e3f7e8', '#e3f1fd', '#fde9ef', '#efe9fd', '#ffeedd', '#f4f4f0', '#e2f6f4'];
    COLORS.forEach(function (name, i) {
      var d = el('button', 'wb-color' + (i === curColor ? ' active' : ''));
      d.type = 'button';
      d.dataset.i = i;
      d.title = name;
      d.setAttribute('role', 'radio');
      d.setAttribute('aria-label', name);
      d.style.background = NOTE_CSS[i];
      d.addEventListener('click', function () {
        curColor = i;
        box.querySelectorAll('.wb-color').forEach(function (c) { c.classList.toggle('active', +c.dataset.i === i); });
      });
      box.appendChild(d);
    });
  }

  function submitNote() {
    if (sending) return;
    var content = $('#wb-content').value.trim();
    if (!content) { toast('先写点什么吧', false); $('#wb-content').focus(); return; }
    var nick = $('#wb-nick').value.trim().slice(0, 12);
    if (hasBadWord(content) || hasBadWord(nick)) { toast('内容包含不允许的词，请修改后再贴', false); return; }
    var target = null;
    if (curType === 'wish') {
      target = $('#wb-target').value || null;
    }
    sending = true;
    var btn = $('#wb-submit');
    btn.disabled = true;
    btn.classList.add('sending');
    var payload = { type: curType, nick: nick, content: content, color: curColor, target: target };
    var token = (Math.random().toString(36).slice(2) + Date.now().toString(36));

    var finish = function (note) {
      sending = false;
      btn.disabled = false;
      btn.classList.remove('sending');
      $('#wb-content').value = '';
      $('#wb-nick').value = '';
      $('#wb-target').value = '';
      $('#wb-counter').textContent = '0 / 200';
      mine[note.id] = note.token || token;
      writeJSON(LS_MINE, mine);
      var isPending = note.review === 'pending';
      if (!isPending) {
        notes.unshift(note);
        if (mode === 'local') saveLocal();
      }
      query = '';
      $('#wb-search').value = '';
      $('#wb-search-clear').hidden = true;
      if (filter !== 'all') setFilter('all'); else renderAll(false);
      var wall = $('#wb-wall');
      var first = isPending ? null : wall.querySelector('.wb-note[data-id="' + note.id + '"]');
      if (first) {
        first.classList.add('wb-newly');
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      markWishAch();
      if (isPending) {
        toast('已提交！审核通过后就会展示在墙上');
      } else {
        toast(curType === 'wish' ? '愿望已贴上墙，等它实现的那天' : '说给树洞的话已经贴好了');
      }
      $('#wb-form').hidden = true;
    };
    var fail = function () {
      sending = false;
      btn.disabled = false;
      btn.classList.remove('sending');
      if (mode === 'online') { enterLocal('云端暂时联系不上，这张便签先保存在本机'); }
      var note = {
        id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        type: payload.type, nick: payload.nick, content: payload.content,
        color: payload.color, status: 'pending', likes: 0,
        target: payload.target, replies: [],
        created: Date.now(), token: token
      };
      finish(note);
    };

    var p = (mode === 'online') ? apiPost(payload).then(function (w) {
      w.token = token; return w;
    }) : Promise.reject(new Error('local'));
    p.then(finish).catch(fail);
  }

  function setFilter(f) {
    filter = f;
    renderLimit = PAGE_SIZE;
    document.querySelectorAll('.wb-filter').forEach(function (b) {
      b.classList.toggle('active', b.dataset.f === f);
    });
    renderWall(true);
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    root = document.getElementById('page-wish');
    if (!root || root.dataset.inited) return;
    root.dataset.inited = '1';

    buildColorDots();

    $('#wb-compose-btn').addEventListener('click', function () {
      var f = $('#wb-form');
      f.hidden = !f.hidden;
      if (!f.hidden) $('#wb-content').focus();
    });
    document.querySelectorAll('.wb-type').forEach(function (b) {
      b.addEventListener('click', function () {
        curType = b.dataset.type;
        document.querySelectorAll('.wb-type').forEach(function (x) { x.classList.toggle('active', x === b); });
        $('#wb-type-tip').textContent = TYPE_TIP[curType];
        $('#wb-target-row').style.display = curType === 'wish' ? '' : 'none';
      });
    });
    $('#wb-content').addEventListener('input', function () {
      var len = this.value.length;
      var c = $('#wb-counter');
      c.textContent = len + ' / 200';
      c.classList.toggle('over', len > 200);
    });
    $('#wb-content').addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submitNote(); }
    });
    $('#wb-submit').addEventListener('click', submitNote);

    document.querySelectorAll('.wb-filter').forEach(function (b) {
      b.addEventListener('click', function () { setFilter(b.dataset.f); });
    });

    // 搜索（防抖）
    var search = $('#wb-search');
    var deb = null;
    search.addEventListener('input', function () {
      $('#wb-search-clear').hidden = !search.value;
      clearTimeout(deb);
      deb = setTimeout(function () {
        query = search.value.trim();
        renderLimit = PAGE_SIZE;
        renderWall(true);
      }, 200);
    });
    $('#wb-search-clear').addEventListener('click', function () {
      search.value = '';
      query = '';
      this.hidden = true;
      renderLimit = PAGE_SIZE;
      renderWall(true);
      search.focus();
    });
    // 排序
    $('#wb-sort').addEventListener('change', function () {
      sortKey = this.value;
      renderLimit = PAGE_SIZE;
      renderWall(true);
    });
    // 备份导出（审核模式下可见）
    $('#wb-export-btn').addEventListener('click', function () {
      var key = sessionStorage.getItem(SS_ADMIN);
      if (!key) { toast('请先进审核模式', false); return; }
      apiGet(key).then(function (list) {
        var blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'wish-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
        toast('备份已下载（' + list.length + ' 张便签）');
      }).catch(function () { toast('导出失败', false); });
    });
    // 站长审核
    $('#wb-admin-btn').addEventListener('click', function () {
      if (adminMode) exitAdmin();
      else enterAdmin();
    });
    adminMode = !!sessionStorage.getItem(SS_ADMIN);
    paintAdminBtn();
    if (!API) {
      var ab = $('#wb-admin-btn');
      if (ab) ab.parentNode.style.display = 'none';
    }

    if (!API) {
      renderMode(true);
      notes = SEED_NOTES.concat(readJSON(LS_NOTES, []));
      renderAll(true);
    } else {
      mode = 'online';
      renderMode(false);
      renderAll(true);
      loadNotes().then(function (ok) {
        renderAll(true);
        if (ok) maybeOfferMigrate();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('pjax:complete', function () { root = null; init(); });
})();
