/**
 * 成就墙页面脚本 /life/
 * 两类成就：
 *   1. 站点里程碑 —— 全站真实数据自动点亮（建站天数/文章数实时计算，访问量走 51.la 挂件）
 *   2. 访客成就   —— 记录在本机 localStorage（键 lifeAch.*，由全站脚本与各特色页写入）
 * 进阶玩法：点数与段位（青铜→钻石）、稀有度、NEW 徽章、解锁跳转、全成就彩带庆典。
 * ====== 想调整成就：改 MILESTONES / VISITOR_ACH 两个数组即可 ======
 */
(function () {
  const ROOT_ID = 'page-life';
  const KEY_PREFIX = 'lifeAch.';
  const SEEN_KEY = 'lifeAchSeen.v1';
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * 站点基础数据（真实值，随建站情况手动维护）
   * siteStart / firstPost 是里程碑锚点，勿随意改；
   * posts / wordsWan 在发布新文章后顺手更新一下即可。
   */
  const SITE = {
    siteStart: '2023-04-01',   // 建站日期（侧栏"建站天数"同源）
    firstPost: '2023-11-02',   // 首篇文章发布日期
    posts: 133,                // 文章总数
    wordsWan: 35.2,            // 全站字数（万）
  };

  // ---------- 小工具 ----------
  function $(id) { return document.getElementById(id); }
  function daysSince(dateStr) {
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  }
  function getFlag(key) {
    try { return localStorage.getItem(KEY_PREFIX + key); } catch (e) { return null; }
  }
  let toastTimer = null;
  function toast(msg) {
    let el = $('life-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'life-toast';
      el.style.cssText =
        'position:fixed;left:50%;bottom:8%;transform:translateX(-50%);' +
        'padding:10px 22px;border-radius:999px;z-index:99999;' +
        'background:var(--anzhiyu-theme);color:#fff;font-size:0.9em;' +
        'box-shadow:var(--anzhiyu-shadow-black);transition:opacity .3s;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.opacity = '0'; }, 2200);
  }

  const RARITY_TEXT = { common: '普通', rare: '稀有', epic: '史诗' };

  // ---------- 站点里程碑定义 ----------
  // value() 返回 [当前值, 目标值]；目标达成即点亮。rarity：普通/稀有/史诗
  const MILESTONES = [
    { icon: 'plant-fill', name: '开荒者', rarity: 'common', pts: 10,
      desc: () => '首篇文章发布于 ' + SITE.firstPost, value: () => [1, 1] },
    { icon: 'rocket', name: '破土动工', rarity: 'common', pts: 10,
      desc: () => '网站于 ' + SITE.siteStart + ' 正式上线', value: () => [1, 1] },
    { icon: 'calendar-days', name: '千日坚守', rarity: 'rare', pts: 10,
      desc: () => '建站满 1000 天，初心未改', value: () => [daysSince(SITE.siteStart), 1000] },
    { icon: 'pencil', name: '百篇达人', rarity: 'common', pts: 10,
      desc: () => '文章总数突破 100 篇', value: () => [SITE.posts, 100] },
    { icon: 'file-lines', name: '著作等身', rarity: 'rare', pts: 10,
      desc: () => '全站累计字数突破 10 万字',
      value: () => [Math.round(SITE.wordsWan * 10000), 100000],
      fmt: (v) => (v / 10000).toFixed(1) + '万' },
    { icon: 'eye-outline', name: '高朋满座', rarity: 'common', pts: 10,
      desc: () => '累计访问量突破 500（51.la 实时）', value: (s) => [s ? s.totalPV : null, 500] },
    { icon: 'heartbeat', name: '千次到访', rarity: 'rare', pts: 10,
      desc: () => '累计访问量突破 1000（51.la 实时）', value: (s) => [s ? s.totalPV : null, 1000] },
    { icon: 'stream', name: '月度冲浪', rarity: 'common', pts: 10,
      desc: () => '单月访问量突破 200（51.la 实时）', value: (s) => [s ? s.monthPV : null, 200] },
    // ---- 下一阶段梯度：让墙上永远有进行中的目标 ----
    { icon: 'pencil', name: '两百篇俱乐部', rarity: 'rare', pts: 10,
      desc: () => '文章总数突破 200 篇', value: () => [SITE.posts, 200] },
    { icon: 'chart-line', name: '字数五十万', rarity: 'epic', pts: 10,
      desc: () => '全站累计字数突破 50 万字',
      value: () => [Math.round(SITE.wordsWan * 10000), 500000],
      fmt: (v) => (v / 10000).toFixed(1) + '万' },
    { icon: 'hourglass-start', name: '两千日夜', rarity: 'epic', pts: 10,
      desc: () => '建站满 2000 天', value: () => [daysSince(SITE.siteStart), 2000] },
    { icon: 'heartbeat', name: '访客两千', rarity: 'epic', pts: 10,
      desc: () => '累计访问量突破 2000（51.la 实时）', value: (s) => [s ? s.totalPV : null, 2000] },
    { icon: 'stream', name: '单月五百', rarity: 'rare', pts: 10,
      desc: () => '单月访问量突破 500（51.la 实时）', value: (s) => [s ? s.monthPV : null, 500] },
  ];

  // ---------- 访客成就定义 ----------
  // check() 在页面加载时执行；jump：未解锁时点击卡片直达解锁场景（'@random' = 随机逛一篇文章）
  const VISITOR_ACH = [
    { key: 'night', icon: 'moon', name: '夜猫子', rarity: 'rare',
      desc: '在凌晨 0 - 5 点访问过本站', hint: '深夜再来一次？',
      check: () => { const h = new Date().getHours(); return h >= 0 && h < 5; } },
    { key: 'archives', icon: 'magnifying-glass', name: '考古学家', rarity: 'common',
      desc: '逛过文章隧道（/archives/）', hint: '去文章隧道里翻翻旧文', jump: '/archives/' },
    { key: 'comments', icon: 'comments', name: '会客使者', rarity: 'common',
      desc: '到访过留言板', hint: '去留言板打个招呼吧', jump: '/comments/' },
    { key: 'post', icon: 'book-open', name: '博览群书', rarity: 'common',
      desc: '读过任意一篇文章', hint: '随便点开一篇文章', jump: '@random' },
    { key: 'tools', icon: 'gear', name: '工具体验官', rarity: 'common',
      desc: '在前端工具箱用过任意工具', hint: '到工具箱玩一下', jump: '/frontend/' },
    { key: 'toolmaster', icon: 'dice', name: '工具通', rarity: 'rare',
      desc: '在工具箱用过 5 种不同的工具', hint: '工具箱里还有新玩具', jump: '/frontend/',
      check: function () {
        let n = 0;
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.indexOf('fpToolsUse.') === 0 && Number(localStorage.getItem(k)) > 0) n++;
          }
        } catch (e) { /* ignore */ }
        return n >= 5;
      } },
    { key: 'campus', icon: 'book', name: '校友回访', rarity: 'common',
      desc: '看过大学技能树', hint: '去技能树逛逛', jump: '/campus/' },
    { key: 'wish', icon: 'hand-heart-fill', name: '许愿人', rarity: 'rare',
      desc: '在心愿墙贴出过便签', hint: '去心愿墙写下第一张便签', jump: '/wish/' },
  ];

  // ---------- 段位体系（按访客成就解锁数） ----------
  function levelOf(n) {
    if (n >= 7) return { name: '钻石', color: '#4fc3f7' };
    if (n >= 5) return { name: '黄金', color: '#d4a017' };
    if (n >= 3) return { name: '白银', color: '#9aa5b1' };
    if (n >= 1) return { name: '青铜', color: '#b87333' };
    return { name: '未起步', color: 'var(--anzhiyu-secondtext)' };
  }

  // ---------- 渲染：站点里程碑 ----------
  function renderMilestones(stats) {
    const grid = $('milestone-grid');
    if (!grid) return;
    grid.innerHTML = '';
    MILESTONES.forEach(function (m, i) {
      const pair = m.value(stats);
      const cur = pair[0], goal = pair[1];
      const hasData = typeof cur === 'number' && !isNaN(cur);
      const unlocked = hasData && cur >= goal;
      const fmt = m.fmt || function (v) {
        return typeof v === 'number' ? v.toLocaleString('zh-CN') : '—';
      };

      const card = document.createElement('div');
      card.className = 'ach-card ' + (unlocked ? 'unlocked' : 'locked');
      card.style.animationDelay = (i * 60) + 'ms';
      let statusHtml;
      if (unlocked) {
        statusHtml = '<div class="ach-status"><i class="anzhiyufont anzhiyu-icon-circle-check"></i>已达成' +
          (goal > 1 ? ' · ' + fmt(goal) : '') + '</div>';
      } else if (hasData) {
        const pct = Math.min(100, Math.round((cur / goal) * 100));
        statusHtml =
          '<div class="ach-status">进行中 ' + fmt(cur) + ' / ' + fmt(goal) + '</div>' +
          '<div class="ach-progress"><div class="ach-progress-inner" data-w="' + pct + '%" style="width:0"></div></div>';
      } else {
        statusHtml = '<div class="ach-status">数据暂时取不到，稍后再来看看</div>';
      }
      card.innerHTML =
        '<span class="ach-rarity r-' + m.rarity + '">' + RARITY_TEXT[m.rarity] + '</span>' +
        '<div class="ach-icon"><i class="anzhiyufont anzhiyu-icon-' + m.icon + '"></i></div>' +
        '<div class="ach-name">' + m.name + '</div>' +
        '<div class="ach-desc">' + m.desc() + '</div>' +
        statusHtml;
      card.onclick = function () { openMilestoneModal(m, unlocked, cur, goal, fmt, hasData); };
      grid.appendChild(card);
    });
    // 进度条充能动画（等一帧从 0 长到目标宽度）
    requestAnimationFrame(function () {
      grid.querySelectorAll('.ach-progress-inner').forEach(function (bar) {
        const w = bar.getAttribute('data-w');
        if (w) bar.style.width = w;
      });
    });
  }
  // 组装带进度条的卡时把目标宽度存到 data-w，渲染后再赋值以触发过渡

  // ---------- 里程碑详情弹窗 ----------
  function openMilestoneModal(m, unlocked, cur, goal, fmt, hasData) {
    const modal = $('life-modal');
    const card = $('life-modal-card');
    if (!modal || !card) return;
    const pct = hasData ? Math.min(100, Math.round((cur / goal) * 100)) : 0;
    card.innerHTML =
      '<button class="tree-modal-close" aria-label="关闭"><i class="anzhiyufont anzhiyu-icon-circle-xmark"></i></button>' +
      '<div class="tree-detail-title"><i class="anzhiyufont anzhiyu-icon-' + m.icon + '"></i> ' + m.name + '</div>' +
      '<div style="margin:6px 0 10px" class="fp-hint">稀有度 ' + RARITY_TEXT[m.rarity] +
      ' · 成就点数 +' + m.pts + '</div>' +
      '<p style="margin:0 0 10px;font-size:0.92em;color:var(--anzhiyu-fontcolor)">' + m.desc() + '</p>' +
      (unlocked
        ? '<div class="fp-success-text"><i class="anzhiyufont anzhiyu-icon-circle-check"></i> 已达成（全站共享）</div>'
        : hasData
          ? '<div class="fp-hint">当前进度：' + fmt(cur) + ' / ' + fmt(goal) + '（' + pct + '%）</div>'
          : '<div class="fp-hint">数据暂时取不到</div>');
    modal.classList.add('open');
    card.querySelector('.tree-modal-close').onclick = closeModal;
  }
  function closeModal() {
    const modal = $('life-modal');
    if (modal) modal.classList.remove('open');
  }

  // ---------- 渲染：访客成就 ----------
  function renderVisitorAch(newKeys) {
    const grid = $('visitor-grid');
    const counter = $('ach-counter');
    if (!grid) return;
    grid.innerHTML = '';
    let unlockedCount = 0;

    VISITOR_ACH.forEach(function (a, i) {
      // "此刻是否达成"的成就（夜猫子/工具通）先判定再读
      if (a.check && a.check()) {
        try {
          if (!localStorage.getItem(KEY_PREFIX + a.key)) {
            localStorage.setItem(KEY_PREFIX + a.key, String(Date.now()));
          }
        } catch (e) { /* ignore */ }
      }
      const at = getFlag(a.key);
      const unlocked = !!at;
      if (unlocked) unlockedCount++;
      const isNew = newKeys && newKeys.indexOf(a.key) !== -1;

      const card = document.createElement('div');
      card.className = 'ach-card ' + (unlocked ? 'unlocked' : 'locked') + (isNew ? ' newly' : '');
      card.style.animationDelay = (i * 60) + 'ms';
      let statusHtml;
      if (unlocked) {
        const d = new Date(parseInt(at, 10));
        statusHtml = '<div class="ach-status">已解锁 · ' + d.toLocaleDateString('zh-CN') + '</div>';
      } else {
        statusHtml =
          '<div class="ach-status"><i class="anzhiyufont anzhiyu-icon-hourglass-start"></i> ' +
          (a.hint || '尚未解锁') + '</div>' +
          (a.jump ? '<div class="ach-go"><i class="anzhiyufont anzhiyu-icon-arrow-right"></i>前往解锁</div>' : '');
      }
      card.innerHTML =
        (isNew ? '<span class="ach-new">NEW</span>' : '') +
        '<span class="ach-rarity r-' + a.rarity + '">' + RARITY_TEXT[a.rarity] + '</span>' +
        '<div class="ach-icon"><i class="anzhiyufont anzhiyu-icon-' + a.icon + '"></i></div>' +
        '<div class="ach-name">' + a.name + '</div>' +
        '<div class="ach-desc">' + a.desc + '</div>' +
        statusHtml;
      // 未解锁且有解锁场景的卡片：整卡可点，直达场景
      if (!unlocked && a.jump) {
        card.classList.add('clickable');
        card.title = '点击前往解锁场景';
        card.onclick = function () {
          if (a.jump === '@random' && typeof window.toRandomPost === 'function') {
            window.toRandomPost();
          } else {
            location.href = a.jump;
          }
        };
      }
      grid.appendChild(card);
    });

    if (counter) counter.textContent = '已解锁 ' + unlockedCount + ' / ' + VISITOR_ACH.length;
    return unlockedCount;
  }

  // ---------- 积分与段位 ----------
  function renderScore(unlockedCount) {
    const total = VISITOR_ACH.length * 20;
    const score = unlockedCount * 20;
    const lv = levelOf(unlockedCount);
    const numEl = $('score-num');
    const lvEl = $('score-level');
    const hintEl = $('score-hint');
    const bar = $('score-bar');
    if (numEl) numEl.textContent = score + ' / ' + total;
    if (lvEl) {
      lvEl.textContent = lv.name;
      lvEl.style.background = lv.color;
      lvEl.style.color = '#fff';
    }
    if (hintEl) {
      const nextNeed = { 0: 1, 1: 3, 2: 3, 3: 5, 4: 5, 5: 7, 6: 7, 7: 0 }[unlockedCount] || 0;
      hintEl.textContent = unlockedCount >= VISITOR_ACH.length
        ? '满级段位 · 全站最强收集者'
        : '再解锁 ' + nextNeed + ' 个成就即可晋升下一段位';
    }
    if (bar) setTimeout(function () { bar.style.width = Math.round((unlockedCount / VISITOR_ACH.length) * 100) + '%'; }, 80);
  }

  // ---------- 全成就彩带庆典 ----------
  function confetti() {
    if (prefersReduced) return;
    const canvas = $('confetti-canvas');
    if (!canvas) return;
    canvas.style.display = 'block';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    const colors = ['#425aef', '#f7b500', '#f75252', '#44b567', '#9c6ade', '#4fc3f7'];
    const parts = [];
    for (let i = 0; i < 150; i++) {
      parts.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.5,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        c: colors[Math.floor(Math.random() * colors.length)],
        vy: 2 + Math.random() * 3,
        vx: (Math.random() - 0.5) * 2,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.2,
      });
    }
    const start = performance.now();
    function frame(now) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      parts.forEach(function (p) {
        p.y += p.vy; p.x += p.vx; p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (now - start < 3200) requestAnimationFrame(frame);
      else canvas.style.display = 'none';
    }
    requestAnimationFrame(frame);
  }

  // ---------- 筛选 ----------
  let lifeFilter = 'all';
  function applyFilter() {
    document.querySelectorAll('.ach-card').forEach(function (card) {
      const isLocked = card.classList.contains('locked');
      card.style.display =
        lifeFilter === 'all' ? '' :
        lifeFilter === 'unlocked' ? (isLocked ? 'none' : '') :
        (isLocked ? '' : 'none');
    });
  }

  // ---------- 初始化（兼容 PJAX，防重复） ----------
  function init() {
    const root = $(ROOT_ID);
    if (!root || root.dataset.inited === '1') return;
    root.dataset.inited = '1';

    // 1. 先渲染（夜猫子/工具通在渲染中自检并写入）
    renderMilestones(null);
    const initialCount = renderVisitorAch(null);
    renderScore(initialCount);

    // 2. 访问量数据到达后刷新里程碑
    if (window.anzhiyu && typeof window.anzhiyu.fetchLaStats === 'function') {
      window.anzhiyu.fetchLaStats().then(
        function (stats) { renderMilestones(stats); },
        function () { /* 拿不到 51.la 数据就保持占位提示，不伪造数字 */ }
      );
    }

    // 3. NEW 徽章 + 解锁 toast：对比上次已见集合
    let newKeys = [];
    try {
      const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
      const current = VISITOR_ACH.filter(function (a) { return getFlag(a.key); }).map(function (a) { return a.key; });
      newKeys = current.filter(function (k) { return seen.indexOf(k) === -1; });
      localStorage.setItem(SEEN_KEY, JSON.stringify(current));
      if (newKeys.length) {
        renderVisitorAch(newKeys);
        renderScore(current.length);
        newKeys.slice(0, 3).forEach(function (k, i) {
          const a = VISITOR_ACH.find(function (x) { return x.key === k; });
          setTimeout(function () { toast('成就解锁：' + a.name); }, 500 + i * 900);
        });
        // 全成就庆典（仅在有新解锁的这次访问播放）
        if (current.length === VISITOR_ACH.length) {
          setTimeout(function () {
            toast('全成就达成！你就是本站最强收集者');
            confetti();
          }, 500 + Math.min(newKeys.length, 3) * 900);
        }
      }
    } catch (e) { /* ignore */ }

    // 4. 筛选条
    document.querySelectorAll('#life-filter .fl-chip').forEach(function (chip) {
      chip.onclick = function () {
        lifeFilter = chip.dataset.f;
        document.querySelectorAll('#life-filter .fl-chip').forEach(function (c) {
          c.classList.toggle('active', c === chip);
        });
        applyFilter();
      };
    });

    // 5. 弹窗关闭
    const modal = $('life-modal');
    if (modal && !modal.dataset.bound) {
      modal.dataset.bound = '1';
      modal.addEventListener('click', function (e) {
        if (e.target.classList.contains('tree-modal-mask')) closeModal();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeModal();
      });
    }
  }

  function autoRun() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
    document.addEventListener('pjax:complete', init);
  }
  autoRun();
})();
