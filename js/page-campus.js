/**
 * 大学技能树页面脚本 /campus/
 * ====== 想改内容只需要动 TREE / GOALS 两个数据对象 ======
 *   TREE：节点增删、state 改 done / doing / locked
 *         year：节点属于哪个阶段（y1 大一 / y2 大二 / y3 大三 / after 毕业后）→ 供「回放成长」使用
 *         level：done 节点的熟练度 1 了解 / 2 熟悉 / 3 掌握（仅 done 节点需要）
 *   GOALS：阶段目标条目（勾选进度保存在访客本机 localStorage）
 */
(function () {
  const ROOT_ID = 'page-campus';

  const TREE = {
    branches: [
      {
        name: '专业基础',
        icon: 'book-open',
        desc: '大数据技术专业 · 三年主修',
        nodes: [
          { name: '计算机基础', state: 'done', year: 'y1', level: 3, desc: '入学第一课，认识计算机的世界。' },
          { name: '数据库', state: 'done', year: 'y1', level: 3, desc: 'SQL 与关系型数据库的基本功。' },
          { name: 'Java 程序设计', state: 'done', year: 'y1', level: 3, desc: '面向对象编程的启蒙语言。' },
          { name: 'Python', state: 'done', year: 'y1', level: 2, desc: '脚本与数据处理的好搭档。' },
        ],
      },
      {
        name: '前端方向',
        icon: 'shapes',
        desc: '自学主线 · 本站的皮与骨',
        nodes: [
          { name: 'HTML', state: 'done', year: 'y2', level: 3, desc: '一切网页的骨架。' },
          { name: 'CSS', state: 'done', year: 'y2', level: 3, desc: '安知鱼主题的魔改全靠它。' },
          { name: 'JavaScript', state: 'done', year: 'y2', level: 3, desc: '页面交互的灵魂。' },
          { name: 'Vue 生态', state: 'done', year: 'y3', level: 3, desc: 'Vue / Pinia / Vite / Webpack 全家桶。' },
          { name: 'React', state: 'doing', year: 'y3', desc: '正在点亮中，向双框架开发者进发。' },
          { name: 'TypeScript', state: 'locked', year: 'after', desc: '下一站：类型安全的 JavaScript。' },
        ],
      },
      {
        name: '大数据方向',
        icon: 'chart-line',
        desc: '专业课的延伸',
        nodes: [
          { name: '专业课程体系', state: 'done', year: 'y3', level: 3, desc: '三年主修课程全部修完，顺利毕业。' },
          { name: '数据可视化', state: 'doing', year: 'after', desc: 'ECharts 实践中，让数字开口说话。' },
          { name: 'Hadoop 生态', state: 'locked', year: 'after', desc: '大数据进阶的下一关。' },
        ],
      },
      {
        name: '建站与运维',
        icon: 'gear',
        desc: '实战出真知 · 这个网站就是作业',
        nodes: [
          { name: 'Git / GitHub', state: 'done', year: 'y2', level: 2, desc: '版本管理与开源协作。' },
          { name: 'Hexo + 安知鱼', state: 'done', year: 'y3', level: 3, desc: '你正在看的这个博客。' },
          { name: 'Docker', state: 'done', year: 'y3', level: 2, desc: '容器化部署体验。' },
          { name: 'Cloudflare Workers', state: 'doing', year: 'after', desc: 'Live2D 对话代理 / 热榜 API 都跑在上面。' },
          { name: 'Linux 服务器', state: 'locked', year: 'after', desc: '待解锁：自己的云服务器。' },
        ],
      },
    ],
  };

  const GOALS = [
    { key: 'react', text: '深入 React 生态，完成一个练手项目' },
    { key: 'cert', text: '考取一项专业证书（软考 / 等级考试）' },
    { key: 'ship', text: '独立设计并上线一个完整作品' },
    { key: 'linux', text: '掌握 Linux 服务器与自动化部署' },
    { key: 'write', text: '把学习路线整理成系列文章' },
  ];

  // 回放的阶段顺序与文案
  const STAGES = [
    { key: 'y1', label: '大一 · 打基础' },
    { key: 'y2', label: '大二 · 遇见前端' },
    { key: 'y3', label: '大三 · 全家桶与建站' },
    { key: 'after', label: '毕业后 · 持续生长' },
  ];

  const STATE_TEXT = {
    done: '<i class="anzhiyufont anzhiyu-icon-circle-check"></i>已点亮',
    doing: '<i class="anzhiyufont anzhiyu-icon-stopwatch"></i>点亮中',
    locked: '<i class="anzhiyufont anzhiyu-icon-hourglass-start"></i>待解锁',
  };
  const LEVEL_TEXT = ['了解', '熟悉', '掌握'];
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ================= 技能树渲染 =================
  let nodeIndex = 0;

  function renderTree() {
    const grid = document.getElementById('tree-grid');
    if (!grid) return;

    const counts = { done: 0, doing: 0, locked: 0 };
    const doneNames = [];
    nodeIndex = 0;

    TREE.branches.forEach(function (branch) {
      const card = document.createElement('div');
      card.className = 'tree-branch fp-card';

      const doneInBranch = branch.nodes.filter(function (n) { return n.state === 'done'; }).length;
      const title = document.createElement('div');
      title.className = 'tree-branch-title';
      title.innerHTML =
        '<span class="tree-branch-icon"><i class="anzhiyufont anzhiyu-icon-' + branch.icon + '"></i></span>' +
        branch.name +
        '<span class="tree-branch-mini">' + doneInBranch + '/' + branch.nodes.length + '</span>';
      const desc = document.createElement('div');
      desc.className = 'tree-branch-desc';
      desc.textContent = branch.desc;
      card.appendChild(title);
      card.appendChild(desc);

      const ul = document.createElement('ul');
      ul.className = 'tree-nodes';
      ul.dataset.branch = branch.name;
      branch.nodes.forEach(function (node) {
        counts[node.state]++;
        nodeIndex++;
        if (node.state === 'done') doneNames.push(node.name);

        const li = document.createElement('li');
        li.className = 'tree-node ' + node.state;
        li.dataset.year = node.year || 'after';
        li.tabIndex = 0;
        li.setAttribute('role', 'button');
        li.setAttribute('aria-label', node.name + '，' + STATE_TEXT[node.state].replace(/<[^>]*>/g, ''));
        li.style.animationDelay = (nodeIndex * 70) + 'ms';

        // 熟练度小圆点（仅已点亮节点）
        const lv = node.state === 'done' && node.level
          ? '<span class="lv" title="熟练度：' + LEVEL_TEXT[node.level - 1] + '">' +
            [1, 2, 3].map(function (i) { return '<i class="' + (i <= node.level ? 'on' : '') + '"></i>'; }).join('') +
            '</span>'
          : '';

        li.innerHTML =
          '<div class="tree-node-name">' + node.name + lv +
          '<span class="tree-node-state">' + STATE_TEXT[node.state] + '</span></div>';
        // 入场动画播完即卸载：避免 fill:both 锁死 opacity，导致筛选淡出失效
        // （animationend + setTimeout 双保险：后台标签页可能不派发动画事件）
        li.addEventListener('animationend', function handler() {
          li.style.animation = 'none';
          li.removeEventListener('animationend', handler);
        });
        setTimeout(function () { li.style.animation = 'none'; }, nodeIndex * 70 + 600);
        li.onclick = function () { openModal(branch, node); };
        li.onkeydown = function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(branch, node); }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const all = Array.prototype.slice.call(grid.querySelectorAll('.tree-node'));
            const i = all.indexOf(li) + (e.key === 'ArrowDown' ? 1 : -1);
            if (all[i]) all[i].focus();
          }
        };
        ul.appendChild(li);
      });
      card.appendChild(ul);
      grid.appendChild(card);
    });

    renderProgress(counts, doneNames);
    renderChips();
  }

  // ---------- 进度条（数字滚动）+ 技能速览 ----------
  function renderProgress(counts, doneNames) {
    const total = counts.done + counts.doing + counts.locked;
    const pct = total ? Math.round((counts.done / total) * 100) : 0;
    const bar = document.getElementById('tree-progress-bar');
    const text = document.getElementById('tree-progress-text');
    if (bar) setTimeout(function () { bar.style.width = pct + '%'; }, 60);
    if (text) {
      text.innerHTML = '已点亮 <b class="cnt-done">0</b> / ' + total + '（<b class="cnt-pct">0</b>%）';
      countUp(text.querySelector('.cnt-done'), counts.done, 800);
      countUp(text.querySelector('.cnt-pct'), pct, 800);
    }
    // 毕业技能速览：由已点亮节点自动汇总
    const summary = document.getElementById('skill-summary');
    if (summary && doneNames.length) {
      summary.innerHTML = '<i class="anzhiyufont anzhiyu-icon-lightbulb"></i> 毕业时已掌握（' +
        doneNames.length + ' 项）：' + doneNames.join(' · ');
    }
  }

  function countUp(el, target, duration) {
    if (!el) return;
    if (prefersReduced) { el.textContent = target; return; }
    const start = performance.now();
    function frame(now) {
      const p = Math.min(1, (now - start) / duration);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ---------- 三态彩签（可点击筛选） ----------
  let activeFilter = null;
  function renderChips() {
    const chips = document.getElementById('tree-chips');
    if (!chips) return;
    const counts = { done: 0, doing: 0, locked: 0 };
    TREE.branches.forEach(function (b) {
      b.nodes.forEach(function (n) { counts[n.state]++; });
    });
    const defs = [
      { key: 'done', cls: 'c-done', icon: 'circle-check', label: '已点亮' },
      { key: 'doing', cls: 'c-doing', icon: 'stopwatch', label: '点亮中' },
      { key: 'locked', cls: 'c-locked', icon: 'hourglass-start', label: '待解锁' },
    ];
    chips.innerHTML = '';
    defs.forEach(function (d, i) {
      const btn = document.createElement('button');
      btn.className = 'tree-chip ' + d.cls + (activeFilter === d.key ? ' active' : '');
      btn.style.animationDelay = (600 + i * 90) + 'ms';
      btn.title = '点击筛选' + d.label + '的节点';
      btn.innerHTML =
        '<i class="anzhiyufont anzhiyu-icon-' + d.icon + '"></i>' + d.label + ' ' + counts[d.key];
      btn.onclick = function () {
        activeFilter = activeFilter === d.key ? null : d.key;
        applyFilter();
        renderChips();
      };
      chips.appendChild(btn);
    });
    if (!prefersReduced) chips.classList.add('pop-later');
  }

  function applyFilter() {
    const grid = document.getElementById('tree-grid');
    if (!grid) return;
    grid.classList.remove('filter-done', 'filter-doing', 'filter-locked');
    if (activeFilter) grid.classList.add('filter-' + activeFilter);
  }

  // ---------- 成长回放 ----------
  let replaying = false;
  function replay() {
    if (replaying) return;
    replaying = true;
    const grid = document.getElementById('tree-grid');
    const status = document.getElementById('replay-status');
    const btn = document.getElementById('replay-btn');
    if (btn) btn.disabled = true;
    if (grid) grid.classList.add('replaying');

    const speed = prefersReduced ? 60 : 850;
    let chain = Promise.resolve();
    STAGES.forEach(function (stage) {
      chain = chain.then(function () {
        if (status) status.textContent = '回放中：' + stage.label + '…';
        // 该阶段的连线先生长
        grid.querySelectorAll('.tree-nodes').forEach(function (ul) {
          if (ul.querySelector('.tree-node[data-year="' + stage.key + '"]')) ul.classList.add('growing');
        });
        // 点亮该阶段节点
        grid.querySelectorAll('.tree-node[data-year="' + stage.key + '"]').forEach(function (n) {
          n.classList.add('lit');
        });
        return new Promise(function (r) { setTimeout(r, speed); });
      });
    });
    chain.then(function () {
      // 回放结束：清理过程态，恢复常态
      setTimeout(function () {
        grid.classList.remove('replaying');
        grid.querySelectorAll('.lit').forEach(function (n) { n.classList.remove('lit'); });
        grid.querySelectorAll('.tree-nodes.growing').forEach(function (ul) { ul.classList.remove('growing'); });
        if (status) status.textContent = '';
        if (btn) btn.disabled = false;
        replaying = false;
      }, prefersReduced ? 50 : 600);
    });
  }

  // ---------- 节点详情弹窗 ----------
  function openModal(branch, node) {
    const modal = document.getElementById('tree-modal');
    const card = document.getElementById('tree-modal-card');
    if (!modal || !card) return;
    const lv = node.state === 'done' && node.level
      ? '<div style="margin:2px 0 8px" class="fp-hint">熟练度：' + LEVEL_TEXT[node.level - 1] + '</div>' : '';
    card.innerHTML =
      '<button class="tree-modal-close" aria-label="关闭"><i class="anzhiyufont anzhiyu-icon-circle-xmark"></i></button>' +
      '<div class="tree-detail-title"><i class="anzhiyufont anzhiyu-icon-' + branch.icon + '"></i> ' + node.name + '</div>' +
      '<div style="margin:6px 0 8px"><span class="ts-' + node.state + '">' + STATE_TEXT[node.state] + '</span></div>' +
      lv +
      '<p style="margin:0;font-size:0.92em;color:var(--anzhiyu-fontcolor)">' + node.desc + '</p>';
    modal.classList.add('open');
    card.querySelector('.tree-modal-close').onclick = closeModal;
  }
  function closeModal() {
    const modal = document.getElementById('tree-modal');
    if (modal) modal.classList.remove('open');
  }

  // ---------- 桌面悬停快速预览 ----------
  function bindHoverTip(grid) {
    if (!window.matchMedia('(hover: hover)').matches) return;
    let tip = document.querySelector('.tb-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'tb-tip';
      document.body.appendChild(tip);
    }
    grid.addEventListener('mouseover', function (e) {
      const node = e.target.closest('.tree-node');
      if (!node) { tip.classList.remove('show'); return; }
      const name = node.querySelector('.tree-node-name') || {};
      const state = node.querySelector('.tree-node-state') || {};
      tip.innerHTML =
        '<b>' + (name.firstChild ? name.firstChild.textContent : '') + '</b>' +
        '<span>' + (state.textContent || '') + '</span>';
      const r = node.getBoundingClientRect();
      tip.style.left = Math.min(window.innerWidth - 190, Math.max(8, r.left)) + 'px';
      tip.style.top = Math.max(8, r.top - 40) + 'px';
      tip.classList.add('show');
    });
    grid.addEventListener('mouseleave', function () { tip.classList.remove('show'); });
    grid.addEventListener('mouseout', function (e) {
      if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.tree-node')) {
        tip.classList.remove('show');
      }
    });
  }

  // ---------- 阶段目标清单 ----------
  const GOAL_KEY_PREFIX = 'campusGoal.';
  function goalDone(key) {
    try { return localStorage.getItem(GOAL_KEY_PREFIX + key) === '1'; } catch (e) { return false; }
  }
  function setGoal(key, on) {
    try {
      if (on) localStorage.setItem(GOAL_KEY_PREFIX + key, '1');
      else localStorage.removeItem(GOAL_KEY_PREFIX + key);
    } catch (e) { /* ignore */ }
  }
  function renderGoals() {
    const list = document.getElementById('goal-list');
    const counter = document.getElementById('goal-counter');
    const bar = document.getElementById('goal-bar');
    if (!list) return;
    list.innerHTML = '';
    GOALS.forEach(function (g) {
      const isDone = goalDone(g.key);
      const row = document.createElement('label');
      row.className = 'goal-item' + (isDone ? ' done' : '');
      row.innerHTML =
        '<input type="checkbox"' + (isDone ? ' checked' : '') + '>' +
        '<span>' + g.text + '</span>';
      row.querySelector('input').onchange = function (e) {
        setGoal(g.key, e.target.checked);
        row.classList.toggle('done', e.target.checked);
        updateGoalProgress();
      };
      list.appendChild(row);
    });
    updateGoalProgress();
    function updateGoalProgress() {
      const d = GOALS.filter(function (g) { return goalDone(g.key); }).length;
      if (counter) counter.textContent = '已完成 ' + d + ' / ' + GOALS.length;
      if (bar) bar.style.width = Math.round((d / GOALS.length) * 100) + '%';
    }
  }

  // ---------- 初始化（兼容 PJAX，防重复） ----------
  function init() {
    const root = document.getElementById(ROOT_ID);
    if (!root || root.dataset.inited === '1') return;
    root.dataset.inited = '1';

    renderTree();
    renderGoals();

    const replayBtn = document.getElementById('replay-btn');
    if (replayBtn) replayBtn.onclick = replay;

    const grid = document.getElementById('tree-grid');
    if (grid) bindHoverTip(grid);

    // 弹窗：遮罩点击 / Esc 关闭（全局只绑一次）
    const modal = document.getElementById('tree-modal');
    if (modal && !modal.dataset.bound) {
      modal.dataset.bound = '1';
      modal.addEventListener('click', function (e) {
        if (e.target.classList.contains('tree-modal-mask')) closeModal();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeModal();
      });
    }

    // 访客成就「校友回访」
    if (window.anzhiyu && window.anzhiyu.markAchievement) {
      window.anzhiyu.markAchievement('campus');
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
