/**
 * 工具箱核心引擎 /frontend/
 * 职责：分类列表渲染、搜索、hash 路由、选项卡快捷键、面板工厂（变换/换算/查表）、使用计数。
 * 工具本身不写在这里——见 toolbox-custom.js（自定义面板）与 toolbox-tools.js（工具注册表）。
 *
 * ====== 加一个新工具的流程 ======
 *   1. 简单文本变换：在 toolbox-tools.js 的 REGISTRY 里加一条 type:'transform'
 *   2. 单位换算：加一条 type:'unit'（只填单位与换算系数）
 *   3. 查表速查：加一条 type:'lookup'（只填表头与数据行）
 *   4. 复杂交互：在 toolbox-custom.js 里 TB.registerCustom('id', {render, init})
 */
(function () {
  const ROOT_ID = 'page-frontend';
  const LIST_ID = 'tb-list';
  const VIEW_ID = 'tb-view';
  const KEY_PREFIX = 'fpToolsUse.';

  const TB = (window.TB = window.TB || {});

  // ================= 通用小工具 =================
  TB.$ = function (id) { return document.getElementById(id); };
  TB.esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  let toastTimer = null;
  TB.toast = function (msg) {
    let el = TB.$('fp-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fp-toast';
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
    toastTimer = setTimeout(function () { el.style.opacity = '0'; }, 1600);
  };

  // 复制文本；flashEl 可选：复制成功后描边闪烁（第二反馈形态）
  TB.copy = function (text, okMsg, flashEl) {
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); TB.toast(okMsg || '已复制'); } catch (e) { TB.toast('复制失败'); }
      document.body.removeChild(ta);
    }
    function done() {
      TB.toast(okMsg || '已复制');
      if (flashEl) {
        flashEl.classList.add('fp-flash');
        setTimeout(function () { flashEl.classList.remove('fp-flash'); }, 650);
      }
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else { fallback(); }
  };

  TB.highlightJson = function (json) {
    return TB.esc(json).replace(
      /("(?:\\.|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      function (m) {
        let cls;
        if (m[0] === '"') cls = /:\s*$/.test(m) ? 'j-key' : 'j-str';
        else if (m === 'true' || m === 'false') cls = 'j-bool';
        else if (m === 'null') cls = 'j-null';
        else cls = 'j-num';
        return '<span class="' + cls + '">' + TB.esc(m) + '</span>';
      }
    );
  };

  // ================= 分类元信息 =================
  const CATS = [
    { k: 'dev',    name: '开发助手', icon: 'gear' },
    { k: 'encode', name: '编码加密', icon: 'arrows-left-right' },
    { k: 'text',   name: '文本处理', icon: 'font' },
    { k: 'unit',   name: '单位换算', icon: 'shapes' },
    { k: 'calc',   name: '日常计算', icon: 'square-poll-vertical' },
    { k: 'random', name: '随机生成', icon: 'dice-d20' },
    { k: 'design', name: '设计辅助', icon: 'filter-picture' },
    { k: 'lookup', name: '查询参考', icon: 'magnifying-glass' },
  ];
  TB.CATS = CATS;

  let REGISTRY = [];        // 全部工具（toolbox-tools.js 填充）
  let currentId = null;     // 当前激活工具
  let panelCache = {};      // id -> 已构建面板（切换时复用，保留输入状态）
  const customRenderers = {}; // id -> {render(tool)->html, init(panel, tool)}

  // 自定义面板注册（toolbox-custom.js 调用）
  TB.registerCustom = function (id, def) { customRenderers[id] = def; };

  // ================= 列表渲染 + 搜索（分类 → 向右弹出浮层） =================
  function currentTool() {
    return REGISTRY.find(function (t) { return t.id === currentId; }) || null;
  }

  function itemBtnHtml(t, q) {
    let name = TB.esc(t.name);
    if (q) {
      const idx = t.name.toLowerCase().indexOf(q.toLowerCase());
      if (idx > -1 && q.length <= t.name.length) {
        name = TB.esc(t.name.slice(0, idx)) + '<mark class="fp-hit">' +
          TB.esc(t.name.slice(idx, idx + q.length)) + '</mark>' +
          TB.esc(t.name.slice(idx + q.length));
      }
    }
    const active = t.id === currentId;
    return '<button class="tb-item' + (active ? ' active' : '') + '" data-tool="' + t.id + '" role="tab">' +
      '<i class="anzhiyufont anzhiyu-icon-' + (t.icon || 'circle-dot') + '"></i><span>' + name + '</span></button>';
  }

  // 侧栏只渲染 8 个分类行；当前工具所在分类在行下方显示工具名
  function renderList() {
    const listEl = TB.$(LIST_ID);
    const cur = currentTool();
    let html = '';
    CATS.forEach(function (cat) {
      const n = REGISTRY.filter(function (t) { return t.cat === cat.k; }).length;
      const hasActive = cur && cur.cat === cat.k;
      html +=
        '<button class="tb-cat' + (hasActive ? ' has-active' : '') + '" data-cat="' + cat.k + '">' +
        '<i class="anzhiyufont anzhiyu-icon-' + cat.icon + '"></i><span>' + cat.name + '</span>' +
        '<em class="tb-cat-n">' + n + '</em>' +
        '<i class="anzhiyufont anzhiyu-icon-angle-right tb-caret"></i>' +
        (hasActive ? '<span class="tb-cat-cur">' + TB.esc(cur.name) + '</span>' : '') +
        '</button>';
    });
    listEl.innerHTML = html;
    listEl.querySelectorAll('.tb-cat').forEach(function (row) {
      row.onclick = function () {
        openCatFlyout(row.dataset.cat, row);
      };
    });
    const badge = TB.$('tb-count-badge');
    if (badge) badge.textContent = REGISTRY.length + ' 个工具';
  }

  // ---- 向右弹出的工具浮层 ----
  function closeFlyout() {
    const fly = TB.$('tb-flyout');
    if (fly) fly.classList.remove('open');
  }

  function showFlyout(html, anchorTop) {
    const fly = TB.$('tb-flyout');
    fly.innerHTML = html;
    fly.classList.add('open');
    fly.style.top = anchorTop + 'px';
    // 弹层过高时向上收，避免溢出屏幕
    requestAnimationFrame(function () {
      const rect = fly.getBoundingClientRect();
      const maxBottom = window.innerHeight - 14;
      if (rect.bottom > maxBottom) {
        fly.style.top = Math.max(8, anchorTop - (rect.bottom - maxBottom)) + 'px';
      }
    });
  }

  function openCatFlyout(catKey, anchorEl) {
    const cat = CATS.find(function (c) { return c.k === catKey; });
    if (!cat) return;
    const tools = REGISTRY.filter(function (t) { return t.cat === catKey; });
    const html =
      '<div class="tb-flyout-head">' + cat.name + '<em>' + tools.length + '</em></div>' +
      tools.map(function (t) { return itemBtnHtml(t, ''); }).join('');
    showFlyout(html, anchorEl.offsetTop);
    bindFlyoutItems();
  }

  function openSearchFlyout(q) {
    const matched = REGISTRY.filter(function (t) {
      const hay = (t.name + ' ' + (t.keywords || '')).toLowerCase();
      return q.toLowerCase().split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1; });
    });
    const html =
      '<div class="tb-flyout-head">搜索：' + TB.esc(q) + '<em>' + matched.length + '</em></div>' +
      (matched.map(function (t) { return itemBtnHtml(t, q); }).join('') ||
        '<div class="fp-hint" style="padding:10px 12px">没有匹配的工具</div>');
    showFlyout(html, 52);
    bindFlyoutItems();
  }

  function bindFlyoutItems() {
    const fly = TB.$('tb-flyout');
    fly.querySelectorAll('.tb-item').forEach(function (btn) {
      btn.onclick = function () {
        openTool(btn.dataset.tool, true);
        closeFlyout();
      };
    });
  }

  // ================= 面板工厂 =================
  // type:'transform' —— 文本进 → 文本出（可选参数控件）
  function buildTransform(tool) {
    const wrap = document.createElement('div');
    let optHtml = '';
    (tool.options || []).forEach(function (o) {
      if (o.type === 'select') {
        optHtml += '<label class="fp-hint">' + o.label +
          '<select class="fp-select tb-opt" data-key="' + o.key + '" style="width:auto;margin-left:6px">' +
          o.values.map(function (v) { return '<option value="' + v[0] + '">' + v[1] + '</option>'; }).join('') +
          '</select></label>';
      } else if (o.type === 'checkbox') {
        optHtml += '<label class="fp-hint"><input type="checkbox" class="tb-opt" data-key="' + o.key + '"' +
          (o.checked ? ' checked' : '') + '> ' + o.label + '</label>';
      } else if (o.type === 'text') {
        optHtml += '<label class="fp-hint">' + o.label +
          '<input type="text" class="fp-input tb-opt" data-key="' + o.key + '" style="width:auto;margin-left:6px" placeholder="' + (o.placeholder || '') + '"></label>';
      } else if (o.type === 'number') {
        optHtml += '<label class="fp-hint">' + o.label +
          '<input type="number" class="fp-input tb-opt" data-key="' + o.key + '" value="' + o.value + '" style="width:90px;margin-left:6px"></label>';
      }
    });

    wrap.innerHTML =
      '<div class="fp-card">' +
      (optHtml ? '<div class="fp-row" style="margin-bottom:12px">' + optHtml + '</div>' : '') +
      '<div class="ft-split">' +
      '<div class="ft-field"><label>输入' + (tool.inputPlaceholder ? '（' + tool.inputPlaceholder + '）' : '') + '</label>' +
      '<textarea class="fp-textarea tb-in" style="min-height:170px"></textarea></div>' +
      '<div class="ft-field"><label>结果</label><div class="fp-result tb-out" tabindex="0">等待输入…</div></div>' +
      '</div>' +
      '<div class="fp-row" style="margin-top:12px">' +
      '<button class="fp-btn tb-copy" data-primary="1">复制结果</button>' +
      '<button class="fp-btn tb-swap">结果填回输入</button>' +
      '<button class="fp-btn tb-clear">清空</button>' +
      '</div></div>';

    const input = wrap.querySelector('.tb-in');
    const output = wrap.querySelector('.tb-out');
    function readOpts() {
      const opts = {};
      wrap.querySelectorAll('.tb-opt').forEach(function (el) {
        opts[el.dataset.key] = el.type === 'checkbox' ? el.checked : el.value;
      });
      return opts;
    }
    let t = null;
    function run() {
      const raw = input.value;
      if (!raw) { output.textContent = '等待输入…'; return; }
      const res = tool.transform(raw, readOpts(), tool);
      if (res && typeof res.then === 'function') {
        res.then(function (v) { output.textContent = v; }); // 异步变换（如 SHA）
      } else {
        output.textContent = res;
      }
    }
    input.oninput = function () { clearTimeout(t); t = setTimeout(run, 300); };
    wrap.querySelectorAll('.tb-opt').forEach(function (el) {
      el.oninput = run; el.onchange = run;
    });
    wrap.querySelector('.tb-copy').onclick = function () {
      if (output.textContent !== '等待输入…') TB.copy(output.textContent, '已复制', output);
    };
    wrap.querySelector('.tb-swap').onclick = function () {
      if (output.textContent !== '等待输入…') input.value = output.textContent;
    };
    wrap.querySelector('.tb-clear').onclick = function () {
      input.value = ''; output.textContent = '等待输入…';
    };
    return wrap;
  }

  // type:'unit' —— 数值 + 源单位 → 其余全部单位
  function buildUnit(tool) {
    const wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="fp-card">' +
      '<div class="fp-row" style="margin-bottom:14px">' +
      '<input class="fp-input tb-val" type="number" value="1" style="width:140px">' +
      '<select class="fp-select tb-from" style="width:170px">' +
      tool.units.map(function (u, i) { return '<option value="' + i + '"' + (i === 0 ? ' selected' : '') + '>' + u.n + ' (' + u.k + ')</option>'; }).join('') +
      '</select>' +
      '<span class="fp-hint">输入即换算，点击结果行复制</span>' +
      '</div>' +
      '<div class="fp-result tb-out"></div>' +
      (tool.tip ? '<p class="fp-hint" style="margin-bottom:0">' + tool.tip + '</p>' : '') +
      '</div>';

    const valEl = wrap.querySelector('.tb-val');
    const fromEl = wrap.querySelector('.tb-from');
    const outEl = wrap.querySelector('.tb-out');

    function toBase(v, i) {
      const u = tool.units[i];
      return u.toBase ? u.toBase(v) : v * u.f;
    }
    function fromBase(b, i) {
      const u = tool.units[i];
      return u.fromBase ? u.fromBase(b) : b / u.f;
    }
    function run() {
      const v = parseFloat(valEl.value);
      if (isNaN(v)) { outEl.textContent = '请输入数值'; return; }
      const base = toBase(v, parseInt(fromEl.value, 10));
      const lines = tool.units.map(function (u, i) {
        const out = fromBase(base, i);
        const s = Math.abs(out) >= 1e9 || (Math.abs(out) < 1e-6 && out !== 0)
          ? out.toExponential(4) : Number(out.toFixed(6)).toString();
        return s + '  ' + u.k + '（' + u.n + '）';
      });
      outEl.innerHTML = lines.map(function (l) {
        return '<div class="tb-unit-row" style="cursor:pointer">' + TB.esc(l) + '</div>';
      }).join('');
      outEl.querySelectorAll('.tb-unit-row').forEach(function (row) {
        row.onclick = function () { TB.copy(row.textContent.split('  ')[0], '已复制 ' + row.textContent.split('  ')[0], row); };
      });
    }
    valEl.oninput = run;
    fromEl.onchange = run;
    run();
    return wrap;
  }

  // type:'lookup' —— 可搜索速查表
  function buildLookup(tool) {
    const wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="fp-card">' +
      '<div class="fp-row" style="margin-bottom:12px">' +
      '<input class="fp-input tb-q" style="flex:1;min-width:180px" placeholder="在表内筛选…">' +
      '<span class="fp-hint tb-n"></span>' +
      '</div>' +
      '<div class="tb-table-wrap"><table class="tb-table"><thead></thead><tbody></tbody></table></div>' +
      (tool.tip ? '<p class="fp-hint" style="margin:10px 0 0">' + tool.tip + '</p>' : '') +
      '</div>';

    const qEl = wrap.querySelector('.tb-q');
    const nEl = wrap.querySelector('.tb-n');
    const thead = wrap.querySelector('thead');
    const tbody = wrap.querySelector('tbody');

    thead.innerHTML = '<tr>' + tool.cols.map(function (c) { return '<th>' + TB.esc(c) + '</th>'; }).join('') + '</tr>';
    function render(q) {
      const rows = tool.rows.filter(function (r) {
        if (!q) return true;
        return r.some(function (cell) { return String(cell).toLowerCase().indexOf(q) !== -1; });
      });
      nEl.textContent = rows.length + ' 条';
      tbody.innerHTML = rows.map(function (r) {
        return '<tr>' + r.map(function (cell, i) { return '<td>' + TB.esc(cell) + '</td>'; }).join('') + '</tr>';
      }).join('') || '<tr><td colspan="' + tool.cols.length + '" class="fp-hint">无匹配</td></tr>';
      tbody.querySelectorAll('tr').forEach(function (tr) {
        tr.onclick = function () {
          const cells = tr.querySelectorAll('td');
          if (cells.length) TB.copy(cells[0].textContent, '已复制 ' + cells[0].textContent);
        };
      });
    }
    qEl.oninput = function () { render(qEl.value.trim().toLowerCase()); };
    render('');
    return wrap;
  }

  // ================= 面板构建 / 切换 =================
  function buildPanel(tool) {
    if (tool.type === 'transform') return buildTransform(tool);
    if (tool.type === 'unit') return buildUnit(tool);
    if (tool.type === 'lookup') return buildLookup(tool);
    const def = customRenderers[tool.id];
    if (def) {
      const el = document.createElement('div');
      el.innerHTML = def.render(tool);
      if (def.init) def.init(el, tool);
      return el;
    }
    const fallback = document.createElement('div');
    fallback.className = 'fp-card';
    fallback.textContent = '该工具还在建设中';
    return fallback;
  }

  function openTool(id, push) {
    const tool = REGISTRY.find(function (t) { return t.id === id; });
    if (!tool) return false;
    currentId = id;
    renderList();  // 刷新侧栏分类行上的"当前工具"指示

    // 视窗：优先复用已构建面板（保留输入状态）
    const view = TB.$(VIEW_ID);
    let panel = panelCache[id];
    if (!panel) { panel = buildPanel(tool); panelCache[id] = panel; }
    while (view.firstChild) view.removeChild(view.firstChild);
    view.appendChild(panel);

    // 顶栏信息
    TB.$('tb-cur-name').textContent = tool.name;
    TB.$('tb-cur-tip').textContent = tool.tip || '';

    // 列表高亮
    TB.$(LIST_ID).querySelectorAll('.tb-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tool === id);
    });

    try { localStorage.setItem('fpToolsLast', id); } catch (e) { /* ignore */ }
    if (push) {
      try { history.replaceState(null, '', '#' + id); } catch (e) { /* ignore */ }
      // 手机端：点选工具后进入详情态（桌面端双栏常驻，样式不受影响）
      const shell = document.querySelector('.tb-shell');
      if (shell) {
        shell.classList.add('tb-mode-detail');
        shell.classList.remove('tb-mode-list');
      }
    }
    trackUse(id);
    return true;
  }
  TB.openTool = openTool;

  function backToList() {
    const shell = document.querySelector('.tb-shell');
    shell.classList.remove('tb-mode-detail');
    shell.classList.add('tb-mode-list');
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
    const s = TB.$('tb-search');
    if (s) s.focus();
  }

  // ================= 使用计数 =================
  function trackUse(id) {
    try {
      const key = KEY_PREFIX + id;
      localStorage.setItem(key, (parseInt(localStorage.getItem(key) || '0', 10) || 0) + 1);
    } catch (e) { /* ignore */ }
    renderUsage();
    if (window.anzhiyu && window.anzhiyu.markAchievement) {
      window.anzhiyu.markAchievement('tools');
    }
  }
  function renderUsage() {
    const box = TB.$('fp-usage');
    if (!box) return;
    const parts = [];
    REGISTRY.forEach(function (t) {
      try {
        const n = parseInt(localStorage.getItem(KEY_PREFIX + t.id) || '0', 10);
        if (n > 0) parts.push(t.name + ' ×' + n);
      } catch (e) { /* ignore */ }
    });
    if (parts.length) {
      box.textContent = '本机使用记录：' + parts.slice(0, 8).join(' · ') + (parts.length > 8 ? ' …' : '');
      box.style.display = 'block';
    }
  }

  // ================= 初始化 =================
  function bindFramework() {
    const search = TB.$('tb-search');
    let deb = null;
    search.oninput = function () {
      TB.$('tb-search-clear').style.display = search.value ? '' : 'none';
      clearTimeout(deb);
      deb = setTimeout(function () {
        const qv = search.value.trim();
        if (qv) openSearchFlyout(qv);
        else closeFlyout();
      }, 150);
    };
    TB.$('tb-search-clear').onclick = function () {
      search.value = '';
      TB.$('tb-search-clear').style.display = 'none';
      closeFlyout();
      search.focus();
    };
    TB.$('tb-back').onclick = backToList;

    // 点击浮层外部 / Esc → 关闭浮层
    if (!window.__tbOutsideBound) {
      window.__tbOutsideBound = true;
      document.addEventListener('click', function (e) {
        const fly = TB.$('tb-flyout');
        if (!fly || !fly.classList.contains('open')) return;
        if (fly.contains(e.target) || e.target.closest('.tb-cat')) return;
        closeFlyout();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeFlyout();
      });
    }

    // 快捷键（全局只绑一次）
    if (!window.__tbKeysBound) {
      window.__tbKeysBound = true;
      document.addEventListener('keydown', function (e) {
        if (!TB.$(ROOT_ID)) return;
        // Ctrl+K / / 聚焦搜索
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
          e.preventDefault();
          search.focus(); search.select();
          return;
        }
        const inField = /^(input|textarea|select)$/i.test(e.target.tagName);
        if (!inField && e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          search.focus();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          const btn = document.querySelector('#' + VIEW_ID + ' [data-primary]');
          if (btn) { e.preventDefault(); btn.click(); }
          return;
        }
        if (inField || e.ctrlKey || e.metaKey || e.altKey) return;
        // 数字键：搜索浮层打开时取搜索结果第 N 个，否则提示先搜索
        if (/^[1-9]$/.test(e.key)) {
          const items = Array.prototype.slice.call(
            (TB.$('tb-flyout') || {}).querySelectorAll ? TB.$('tb-flyout').querySelectorAll('.tb-item') : []
          );
          const target = items[parseInt(e.key, 10) - 1];
          if (target) {
            openTool(target.dataset.tool, true);
            closeFlyout();
          }
        }
      });
    }

    // hash 路由（用户粘贴/修改地址栏时）
    if (!window.__tbHashBound) {
      window.__tbHashBound = true;
      window.addEventListener('hashchange', function () {
        if (!TB.$(ROOT_ID)) return;
        const id = decodeURIComponent(location.hash.replace(/^#/, ''));
        if (id) openTool(id, false);
      });
    }
  }

  function init() {
    const root = TB.$(ROOT_ID);
    if (!root || root.dataset.inited === '1') return;
    root.dataset.inited = '1';
    bindFramework();

    // 初始工具：hash > 上次使用 > 第一个工具
    let initial = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!REGISTRY.some(function (t) { return t.id === initial; })) {
      let last = null;
      try { last = localStorage.getItem('fpToolsLast'); } catch (e) { /* ignore */ }
      if (!REGISTRY.some(function (t) { return t.id === last; })) last = REGISTRY[0].id;
      initial = last;
    }
    renderList();
    openTool(initial, false);

    // 手机端默认显示列表态（有 hash 时直接进详情）
    const shell = document.querySelector('.tb-shell');
    if (initial && location.hash) {
      shell.classList.remove('tb-mode-list');
      shell.classList.add('tb-mode-detail');
    }
    renderUsage();
  }

  // 由 toolbox-tools.js 调用：传入完整工具注册表并启动
  TB.boot = function (registry) {
    REGISTRY = registry;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
    document.addEventListener('pjax:complete', function () {
      const root = TB.$(ROOT_ID);
      if (root) delete root.dataset.inited;
      panelCache = {};
      init();
    });
  };

  // 主按钮标记（Ctrl+Enter 用）：面板内带 data-primary 的按钮
  TB.primaryBtn = function (el, id) { el.setAttribute('data-primary', id); };
})();
