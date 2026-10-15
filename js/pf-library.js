/* 采集库 + 采集球 + 同步配置位（T5 / T6）—— 三页共享
 *
 * 四类采集库：素材 asset / 灵感 inspiration / 片段 snippet / 物料 material
 * 存储：
 *   pf_lib_v1    { asset:[], inspiration:[], snippet:[], material:[] }
 *   pf_sync_v1   { backendUrl, autoTag, autoDedupe, autoCover, autoSummary, collaboration, lastSync }
 *
 * 采集球：页面右下角常驻按钮 → 唤起「快速采集」弹窗（四类切换）
 * 同步配置位：后端地址 + 自动预处理开关 + 数据导出/导入 + 协作模式占位
 */
(function () {
  'use strict';
  var LIB_KEY = 'pf_lib_v1';
  var CFG_KEY = 'pf_sync_v1';
  var ORDER = ['asset', 'inspiration', 'snippet', 'material'];

  var TYPES = {
    asset: {
      name: '素材', ico: '▦', hint: '图标 / 组件 / 纹理 / 字体 / 模板 —— 统一收纳，记主色与归属',
      titleLabel: '素材名称'
    },
    inspiration: {
      name: '灵感', ico: '✦', hint: '粘个图片或链接就入库，自动记来源网址与采集时间',
      titleLabel: '灵感标题'
    },
    snippet: {
      name: '片段', ico: '{ }', hint: '选中代码存成片段，带语言 / 关联项目 / 行号，一键复制',
      titleLabel: '片段标题'
    },
    material: {
      name: '物料', ico: '⚙', hint: '统一台账：库存 / 单价 / 安全库存，缺料自动提醒',
      titleLabel: '物料名称'
    }
  };
  var LANGS = ['JavaScript', 'TypeScript', 'HTML', 'CSS', 'Python', 'PHP', 'Go', 'Rust', 'Java', 'Shell', 'SQL', 'JSON', 'Pug', '其他'];
  var ASSET_KINDS = ['图标', '组件', '纹理', '字体', '模板', '图片', '音效'];
  var LIB_META = { asset: '素材', inspiration: '灵感', snippet: '片段', material: '物料' };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function nowStr() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function hostOf(url) {
    var m = String(url || '').match(/^https?:\/\/([^\/?#]+)/i);
    return m ? m[1] : '';
  }
  function isImg(url) { return /\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/i.test(String(url || '')); }

  /* ---------- 提示 ---------- */
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'pf-tag-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2200);
  }

  /* ---------- 剪贴板 ---------- */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    return Promise.resolve(ok);
  }
  function download(name, text, mime) {
    try {
      var blob = new Blob([text], { type: mime || 'application/json;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return true;
    } catch (e) { return false; }
  }

  /* ---------- 存储 ---------- */
  function emptyLib() { return { asset: [], inspiration: [], snippet: [], material: [] }; }
  function loadLib() {
    try {
      var o = JSON.parse(localStorage.getItem(LIB_KEY) || 'null');
      if (!o || typeof o !== 'object') return emptyLib();
      ORDER.forEach(function (k) { if (!Array.isArray(o[k])) o[k] = []; });
      return o;
    } catch (e) { return emptyLib(); }
  }
  function saveLib(o) {
    try { localStorage.setItem(LIB_KEY, JSON.stringify(o)); } catch (e) { toast('本地存储写入失败'); }
    updateBadges();
  }
  var DEFAULTS = { backendUrl: '', autoTag: true, autoDedupe: true, autoCover: true, autoSummary: false, collaboration: false, lastSync: '' };
  function loadCfg() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function saveCfg(c) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) {} }

  /* ---------- 自动打标（自动预处理） ---------- */
  function deriveTags(text) {
    var cfg = loadCfg();
    if (!cfg.autoTag) return [];
    var low = String(text || '').toLowerCase();
    if (!low) return [];
    var list = (window.PFTags && window.PFTags.list) ? window.PFTags.list() : [];
    var out = [];
    list.forEach(function (t) {
      if (out.length >= 6) return;
      if (t.name.length < 2) return;
      if (low.indexOf(String(t.name).toLowerCase()) > -1) out.push(t.name);
    });
    return out;
  }

  /* ---------- 主色识别（尽力而为，跨域失败则跳过） ---------- */
  function extractColor(url, cb) {
    if (!url) return cb('');
    var img = new Image();
    img.crossOrigin = 'anonymous';
    var done = false;
    var finish = function (c) { if (!done) { done = true; cb(c); } };
    img.onload = function () {
      try {
        var c = document.createElement('canvas');
        var w = c.width = 24, h = c.height = 24;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        var d = ctx.getImageData(0, 0, w, h).data, r = 0, g = 0, b = 0, n = 0;
        for (var i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue;
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
        if (!n) return finish('');
        finish('#' + [r / n, g / n, b / n].map(function (v) {
          return ('0' + Math.round(v).toString(16)).slice(-2);
        }).join(''));
      } catch (e) { finish(''); }
    };
    img.onerror = function () { finish(''); };
    setTimeout(function () { finish(''); }, 2500);
    img.src = url;
  }

  /* ---------- 表单 ---------- */
  function fieldInput(k, label, val, ph, type) {
    return '<label class="pf-lib-field"><span>' + esc(label) + '</span>' +
      '<input type="' + (type || 'text') + '" data-f="' + k + '" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '"></label>';
  }
  function fieldArea(k, label, val, ph) {
    return '<label class="pf-lib-field pf-lib-field--full"><span>' + esc(label) + '</span>' +
      '<textarea data-f="' + k + '" rows="5" placeholder="' + esc(ph || '') + '">' + esc(val || '') + '</textarea></label>';
  }
  function fieldSelect(k, label, val, opts) {
    return '<label class="pf-lib-field"><span>' + esc(label) + '</span><select data-f="' + k + '">' +
      opts.map(function (o) { return '<option value="' + esc(o) + '"' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') +
      '</select></label>';
  }
  function formHtml(type, d) {
    d = d || {};
    if (type === 'asset') {
      return '<div class="pf-lib-form">' +
        fieldInput('name', '素材名称 *', d.name, '例如：Dashboard 图标组') +
        fieldInput('kind', '素材类型', d.kind || '图标', '图标 / 组件 / 纹理 …') +
        fieldInput('url', '素材链接 / 图片地址', d.url, 'https://…') +
        '<div class="pf-lib-field pf-lib-field--color"><span>主色</span>' +
          '<input type="text" data-f="color" value="' + esc(d.color || '') + '" placeholder="#4f7cff">' +
          '<span class="pf-lib-swatch" data-swatch style="background:' + esc(d.color || '#e5e7eb') + '"></span>' +
          '<button type="button" class="pf-lib-mini" data-act="pick-color">从图取色</button>' +
        '</div>' +
        fieldInput('tags', '标签（逗号分隔）', (d.tags || []).join('、'), '自动打标可留空') +
        fieldArea('note', '备注', d.note, '用在哪、注意什么…') +
        '</div>';
    }
    if (type === 'inspiration') {
      return '<div class="pf-lib-form">' +
        fieldInput('title', '灵感标题 *', d.title, '一句话说清这张图/链接好在哪') +
        fieldInput('url', '来源链接 / 图片地址', d.url, 'https://…  粘贴后自动识别来源') +
        fieldInput('source', '来源', d.source || '', '站点名，可自动填') +
        fieldArea('note', '一句话备注', d.note, '为什么记它？可复用什么？') +
        '</div>';
    }
    if (type === 'snippet') {
      return '<div class="pf-lib-form">' +
        fieldInput('title', '片段标题 *', d.title, '例如：IntersectionObserver 渐入') +
        fieldSelect('lang', '语言', d.lang || 'JavaScript', LANGS) +
        fieldArea('code', '代码 *', d.code, '粘贴代码…') +
        fieldInput('project', '关联项目 / 文件', d.project, '例如：portfolio-core.js') +
        fieldInput('ref', '行号', d.ref, '例如：118-140') +
        fieldInput('note', '说明', d.note, '用途 / 坑点') +
        '</div>';
    }
    return '<div class="pf-lib-form">' +
      fieldInput('name', '物料名称 *', d.name, '例如：M3 内六角螺丝') +
      fieldInput('spec', '规格 / 型号', d.spec, '例如：M3×8 不锈钢') +
      fieldInput('qty', '数量', d.qty, '例如：20') +
      fieldInput('unit', '单位', d.unit || '个', '个 / 米 / 克') +
      fieldInput('price', '单价（元）', d.price, '例如：0.35') +
      fieldInput('stock', '当前库存', d.stock, '留空表示未盘点') +
      fieldInput('minStock', '安全库存', d.minStock, '低于此值提醒补货') +
      fieldArea('note', '备注', d.note, '采购渠道 / 替代型号…') +
      '</div>';
  }
  function readForm(root) {
    var out = {};
    Array.prototype.forEach.call(root.querySelectorAll('[data-f]'), function (el) {
      out[el.getAttribute('data-f')] = el.value.trim();
    });
    return out;
  }

  /* ---------- 物料入库：去重合并 ---------- */
  function num(v) { var n = parseFloat(String(v || '').replace(/[^\d.]/g, '')); return isNaN(n) ? 0 : n; }
  function mergeMaterial(list, rec) {
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      var same = m.name === rec.name && String(m.spec || '') === String(rec.spec || '');
      if (same) {
        if (rec.qty) m.qty = String(num(m.qty) + num(rec.qty));
        if (rec.stock) m.stock = rec.stock;
        if (rec.price) m.price = rec.price;
        if (rec.minStock) m.minStock = rec.minStock;
        if (rec.note) m.note = (m.note ? m.note + ' / ' : '') + rec.note;
        m.updatedAt = nowStr();
        return m;
      }
    }
    return null;
  }

  /* ---------- 卡片 ---------- */
  function stockState(d) {
    var s = d.stock === '' || d.stock == null ? null : num(d.stock);
    var mn = d.minStock === '' || d.minStock == null ? null : num(d.minStock);
    if (s === null || !mn) return '';
    return s <= 0 ? '<span class="pf-lib-badge is-bad">缺料</span>'
      : (s < mn ? '<span class="pf-lib-badge is-warn">需补货</span>' : '<span class="pf-lib-badge is-ok">库存充足</span>');
  }
  function libCard(type, d) {
    var head = '<div class="pf-lib-card-head">';
    var body = '';
    var thumb = '';
    if (type === 'asset' || type === 'inspiration') {
      if (d.url && isImg(d.url)) thumb = '<span class="pf-lib-thumb" style="background-image:url(' + esc(d.url) + ')"></span>';
      else if (d.url) thumb = '<span class="pf-lib-thumb pf-lib-thumb--link">' + esc(hostOf(d.url).charAt(0).toUpperCase() || '↗') + '</span>';
      else thumb = '<span class="pf-lib-thumb pf-lib-thumb--empty">' + TYPES[type].ico + '</span>';
    }
    if (type === 'asset') head += '<h4>' + esc(d.name) + '</h4>' +
      (d.kind ? '<span class="pf-lib-kind">' + esc(d.kind) + '</span>' : '') +
      (d.color ? '<span class="pf-lib-color" style="background:' + esc(d.color) + '" title="主色 ' + esc(d.color) + '"></span>' : '');
    else if (type === 'inspiration') head += '<h4>' + esc(d.title) + '</h4>' +
      (d.source ? '<span class="pf-lib-kind">' + esc(d.source) + '</span>' : '');
    else if (type === 'snippet') head += '<h4>' + esc(d.title) + '</h4>' +
      '<span class="pf-lib-kind">' + esc(d.lang || '') + '</span>';
    else head += '<h4>' + esc(d.name) + '</h4>' + stockState(d);
    head += '</div>';

    if (type === 'asset') {
      body = (d.url ? '<a class="pf-lib-link" href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">' + esc(d.url) + '</a>' : '') +
        (d.note ? '<p class="pf-lib-note">' + esc(d.note) + '</p>' : '');
    } else if (type === 'inspiration') {
      body = (d.url ? '<a class="pf-lib-link" href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">' + esc(d.url) + '</a>' : '') +
        (d.note ? '<p class="pf-lib-note">' + esc(d.note) + '</p>' : '');
    } else if (type === 'snippet') {
      body = '<pre class="pf-lib-code"><code>' + esc(String(d.code || '').slice(0, 600)) + '</code></pre>' +
        ((d.project || d.ref) ? '<p class="pf-lib-ref">' + esc(d.project || '') + (d.ref ? ' · L' + esc(d.ref) : '') + '</p>' : '') +
        (d.note ? '<p class="pf-lib-note">' + esc(d.note) + '</p>' : '');
    } else {
      var meta = [];
      if (d.spec) meta.push('规格 ' + d.spec);
      if (d.qty) meta.push('数量 ' + d.qty + (d.unit || ''));
      if (d.price) meta.push('单价 ¥' + d.price);
      if (d.price && d.qty) meta.push('小计 ¥' + (num(d.price) * num(d.qty)).toFixed(2));
      if (d.stock !== '' && d.stock != null) meta.push('库存 ' + d.stock + (d.unit || ''));
      body = '<p class="pf-lib-meta-row">' + meta.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</p>' +
        (d.note ? '<p class="pf-lib-note">' + esc(d.note) + '</p>' : '');
    }

    var tags = (d.tags || []).map(function (t) {
      return '<button class="pf-lib-tag" type="button" data-act="tag" data-tag="' + esc(t) + '">#' + esc(t) + '</button>';
    }).join('');

    return '<article class="pf-lib-card" data-type="' + type + '" data-id="' + esc(d.id) + '">' +
      head +
      '<div class="pf-lib-card-body">' + thumb + '<div class="pf-lib-card-main">' + body +
        (tags ? '<div class="pf-lib-tags">' + tags + '</div>' : '') +
      '</div></div>' +
      '<div class="pf-lib-card-foot">' +
        '<span class="pf-lib-time">' + esc(d.createdAt || '') + '</span>' +
        '<span class="pf-lib-ops">' +
          (type === 'snippet' ? '<button type="button" data-act="copy">复制代码</button>' : '') +
          (type === 'material' ? '<button type="button" data-act="restock">补货入库</button>' : '') +
          '<button type="button" data-act="edit">编辑</button>' +
          '<button type="button" data-act="del">删除</button>' +
        '</span>' +
      '</div>' +
      '</article>';
  }

  /* ---------- 列表渲染 ---------- */
  var curType = 'asset';
  var kw = '';
  function filtered(type) {
    var q = kw.trim().toLowerCase();
    var list = loadLib()[type] || [];
    if (!q) return list;
    return list.filter(function (d) {
      var hay = [d.name, d.title, d.spec, d.note, d.lang, d.project, d.url, d.source, (d.tags || []).join(' '), d.code].join(' ').toLowerCase();
      return hay.indexOf(q) > -1;
    });
  }
  function renderList() {
    var box = $('pfLibList'), empty = $('pfLibEmpty');
    if (!box) return;
    var list = filtered(curType);
    box.innerHTML = list.map(function (d) { return libCard(curType, d); }).join('');
    if (empty) {
      empty.hidden = list.length > 0;
      empty.textContent = kw ? '没有匹配的' + LIB_META[curType] : '还没有' + LIB_META[curType] + ' —— 点右下角采集球，或用上方「＋ 采集」';
    }
    var hint = $('pfLibHint');
    if (hint) {
      var all = loadLib()[curType] || [];
      hint.textContent = all.length + ' 条' + LIB_META[curType] + (kw ? ' · 匹配 ' + list.length : '');
    }
  }
  function updateBadges() {
    var lib = loadLib();
    ORDER.forEach(function (k) {
      var b = $('pfLibN-' + k);
      if (b) b.textContent = (lib[k] || []).length;
    });
    var tot = ORDER.reduce(function (s, k) { return s + (lib[k] || []).length; }, 0);
    var total = $('pfLibTotal');
    if (total) total.textContent = tot;
    var ball = $('pfBall');
    if (ball) {
      var n = $('pfBallN');
      if (n) n.textContent = tot;
      ball.classList.toggle('has-items', tot > 0);
    }
  }

  /* ---------- 编辑器（新增 / 编辑） ---------- */
  var editing = { type: '', id: '' };
  function openEditor(type, rec) {
    var modal = $('pfLibModal');
    if (!modal) return;
    editing.type = type;
    editing.id = rec ? rec.id : '';
    var t = TYPES[type];
    var body = $('pfLibModalBody');
    body.innerHTML =
      '<div class="pf-lib-modal-head">' +
        '<span class="pf-lib-modal-ico">' + t.ico + '</span>' +
        '<div><h3>' + (rec ? '编辑' : '采集') + t.name + '</h3><p>' + esc(t.hint) + '</p></div>' +
      '</div>' +
      formHtml(type, rec) +
      '<p class="pf-lib-err" id="pfLibErr" hidden></p>' +
      '<div class="pf-lib-modal-foot">' +
        '<button class="pf-btn-primary" type="button" id="pfLibSave">' + (rec ? '保存修改' : '存入' + t.name + '库') + '</button>' +
        '<button class="pf-btn-ghost" type="button" id="pfLibCancel">取消</button>' +
        (rec ? '<button class="pf-btn-ghost pf-lib-danger" type="button" id="pfLibDel">删除</button>' : '') +
      '</div>';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    var first = body.querySelector('input[data-f],textarea[data-f]');
    if (first) setTimeout(function () { first.focus(); }, 40);
    bindEditor(type, rec);
  }
  function closeEditor() {
    var modal = $('pfLibModal');
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  }
  function bindEditor(type, rec) {
    var body = $('pfLibModalBody');
    var err = $('pfLibErr');
    function fail(msg) { if (err) { err.textContent = msg; err.hidden = false; } }
    function clearErr() { if (err) err.hidden = true; }

    // 来源链接 → 自动填标题 / 来源站
    var urlEl = body.querySelector('[data-f="url"]');
    if (urlEl) {
      urlEl.addEventListener('blur', function () {
        var v = urlEl.value.trim();
        if (!v) return;
        var sf = body.querySelector('[data-f="source"]');
        if (sf && !sf.value.trim()) sf.value = hostOf(v);
        var tf = body.querySelector('[data-f="title"]');
        if (tf && !tf.value.trim()) {
          try { tf.value = decodeURIComponent(v.replace(/^https?:\/\//, '').split('?')[0]).slice(0, 60); }
          catch (e) { tf.value = v.slice(0, 60); }
        }
        // 自动补主色（若为图片）
        if (type === 'asset' && isImg(v)) {
          var cf = body.querySelector('[data-f="color"]');
          if (cf && !cf.value.trim()) {
            extractColor(v, function (c) {
              if (c && cf && !cf.value.trim()) { cf.value = c; var sw = body.querySelector('[data-swatch]'); if (sw) sw.style.background = c; }
            });
          }
        }
      });
    }
    var cf2 = body.querySelector('[data-f="color"]');
    if (cf2) cf2.addEventListener('input', function () {
      var sw = body.querySelector('[data-swatch]');
      if (sw) sw.style.background = cf2.value || '#e5e7eb';
    });
    var pick = body.querySelector('[data-act="pick-color"]');
    if (pick) pick.addEventListener('click', function () {
      var u = (body.querySelector('[data-f="url"]') || {}).value || '';
      if (!u) return fail('先填图片地址再取色');
      clearErr();
      extractColor(u, function (c) {
        if (!c) return toast('取色失败（跨域限制），可手动填');
        var el = body.querySelector('[data-f="color"]');
        if (el) el.value = c;
        var sw = body.querySelector('[data-swatch]'); if (sw) sw.style.background = c;
        toast('已取主色 ' + c);
      });
    });

    var cancel = $('pfLibCancel');
    if (cancel) cancel.addEventListener('click', closeEditor);

    var del = $('pfLibDel');
    if (del) del.addEventListener('click', function () {
      if (!rec || !confirm('确定删除这条记录？')) return;
      var lib = loadLib();
      lib[type] = lib[type].filter(function (x) { return x.id !== rec.id; });
      saveLib(lib);
      closeEditor(); renderList(); toast('已删除');
    });

    var save = $('pfLibSave');
    if (save) save.addEventListener('click', function () {
      clearErr();
      var v = readForm(body);
      var cfg = loadCfg();
      if (type === 'asset') {
        if (!v.name) return fail('请填写素材名称');
        v.kind = v.kind || '图标';
        v.tags = String(v.tags || '').split(/[、,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
      } else if (type === 'inspiration') {
        if (!v.title) return fail('请填写灵感标题');
        v.source = v.source || hostOf(v.url);
      } else if (type === 'snippet') {
        if (!v.title) return fail('请填写片段标题');
        if (!v.code) return fail('代码不能为空');
      } else {
        if (!v.name) return fail('请填写物料名称');
        var merged = cfg.autoDedupe ? mergeMaterial(loadLib().material, v) : null;
        if (merged) {
          var libm = loadLib();
          libm.material = libm.material.map(function (x) { return x.id === merged.id ? merged : x; });
          saveLib(libm);
          closeEditor(); renderList();
          return toast('已有同名同规格物料，已合并数量');
        }
      }
      // 自动打标（合并用户手填）
      var auto = deriveTags([v.title, v.name, v.note, v.code, v.spec, v.url].join(' '));
      if (auto.length) v.tags = (v.tags || []).concat(auto).filter(function (x, i, a) { return x && a.indexOf(x) === i; });

      var lib = loadLib();
      if (editing.id) {
        lib[type] = lib[type].map(function (x) {
          return x.id === editing.id ? Object.assign({}, x, v, { updatedAt: nowStr() }) : x;
        });
        toast('已保存修改');
      } else {
        v.id = uid();
        v.createdAt = nowStr();
        lib[type].unshift(v);
        toast('已存入' + LIB_META[type] + '库' + (auto.length ? '（自动打标 ' + auto.length + ' 个）' : ''));
      }
      saveLib(lib);
      closeEditor();
      if (lib[type] && lib[type].length) { /* 保持当前 tab */ }
      renderList();
    });
  }

  /* ---------- 列表交互 ---------- */
  function bindListEvents() {
    var box = $('pfLibList');
    if (!box) return;
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var card = e.target.closest('.pf-lib-card');
      if (!card) return;
      var id = card.getAttribute('data-id');
      var type = card.getAttribute('data-type');
      var rec = (loadLib()[type] || []).filter(function (x) { return x.id === id; })[0];
      if (!rec) return;
      var act = btn.getAttribute('data-act');
      if (act === 'edit') openEditor(type, rec);
      else if (act === 'del') {
        if (!confirm('确定删除这条记录？')) return;
        var lib = loadLib();
        lib[type] = lib[type].filter(function (x) { return x.id !== id; });
        saveLib(lib); renderList(); toast('已删除');
      } else if (act === 'copy') {
        copyText(rec.code || '').then(function (ok) { toast(ok ? '代码已复制' : '复制失败，请手动选中'); });
      } else if (act === 'restock') {
        var add = prompt('补货数量（个/米/克）：', '10');
        if (add === null) return;
        var lib2 = loadLib();
        lib2.material = lib2.material.map(function (x) {
          if (x.id !== id) return x;
          x.stock = String(num(x.stock) + num(add));
          x.updatedAt = nowStr();
          return x;
        });
        saveLib(lib2); renderList(); toast('库存已更新为 ' + (lib2.material.filter(function (x) { return x.id === id; })[0] || {}).stock);
      } else if (act === 'tag') {
        var tg = btn.getAttribute('data-tag');
        if (window.PFTags) window.PFTags.apply(tg);
      }
    });
  }

  /* ---------- 抽屉 ---------- */
  function openLib(type) {
    var d = $('pfLibDrawer');
    if (!d) return;
    if (type) curType = type;
    d.hidden = false;
    document.body.style.overflow = 'hidden';
    switchTab(curType);
    renderList();
  }
  function closeLib() {
    var d = $('pfLibDrawer');
    if (!d) return;
    d.hidden = true;
    document.body.style.overflow = '';
  }
  function switchTab(type) {
    curType = type;
    var d = $('pfLibDrawer');
    if (!d) return;
    Array.prototype.forEach.call(d.querySelectorAll('.pf-lib-tab'), function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-lib') === type);
    });
    renderList();
  }

  /* ---------- 采集球 ---------- */
  function openCap(type) {
    // 统一落到编辑器弹窗（#pfLibModal），不做第二套表单
    openEditor(type || curType, null);
  }

  /* ---------- 同步配置位 ---------- */
  function renderSync() {
    var c = loadCfg();
    var u = $('pfSyncUrl'); if (u) u.value = c.backendUrl || '';
    var last = $('pfSyncLast');
    if (last) last.textContent = c.lastSync ? ('上次同步 ' + c.lastSync) : '尚未同步';
    Array.prototype.forEach.call(document.querySelectorAll('[data-cfg]'), function (el) {
      var k = el.getAttribute('data-cfg');
      if (el.type === 'checkbox') el.checked = !!c[k];
    });
    var size = $('pfSyncSize');
    if (size) {
      var bytes = 0;
      [LIB_KEY, CFG_KEY, 'pf_collection_v1'].forEach(function (k) {
        bytes += ((localStorage.getItem(k) || '').length) * 2;
      });
      size.textContent = (bytes / 1024).toFixed(1) + ' KB';
    }
    var ws = $('pfSyncDrafts');
    if (ws) {
      var n = 0;
      try { n = (JSON.parse(localStorage.getItem('ws_user_projects') || '[]') || []).length; } catch (e) {}
      ws.textContent = n + ' 条草稿';
    }
  }
  function openSync() {
    var d = $('pfSyncDrawer');
    if (!d) return;
    renderSync();
    d.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeSync() {
    var d = $('pfSyncDrawer');
    if (!d) return;
    d.hidden = true;
    document.body.style.overflow = '';
  }
  function collectAll() {
    return {
      exportedAt: nowStr(),
      version: 1,
      config: loadCfg(),
      library: loadLib(),
      collection: (function () { try { return JSON.parse(localStorage.getItem('pf_collection_v1') || '[]'); } catch (e) { return []; } })(),
      drafts: (function () { try { return JSON.parse(localStorage.getItem('ws_user_projects') || '[]'); } catch (e) { return []; } })()
    };
  }
  function importAll(json) {
    if (!json || typeof json !== 'object') throw new Error('格式不正确');
    if (json.library) {
      var lib = loadLib();
      ORDER.forEach(function (k) {
        if (Array.isArray(json.library[k])) {
          var seen = {};
          lib[k].forEach(function (x) { seen[x.id] = 1; });
          json.library[k].forEach(function (x) { if (x && x.id && !seen[x.id]) lib[k].push(x); });
        }
      });
      saveLib(lib);
    }
    if (Array.isArray(json.collection)) {
      var col = [];
      try { col = JSON.parse(localStorage.getItem('pf_collection_v1') || '[]'); } catch (e) {}
      var have = {}; col.forEach(function (x) { have[x.id] = 1; });
      json.collection.forEach(function (x) { if (x && x.id && !have[x.id]) col.push(x); });
      localStorage.setItem('pf_collection_v1', JSON.stringify(col));
      if (window.PF && window.PF.sync) window.PF.sync();
      if (window.PF && window.PF.openCollection) { /* 角标刷新由 PF 内部处理 */ }
    }
    if (Array.isArray(json.drafts)) {
      var dr = [];
      try { dr = JSON.parse(localStorage.getItem('ws_user_projects') || '[]'); } catch (e) {}
      var had = {}; dr.forEach(function (x) { had[x.id] = 1; });
      json.drafts.forEach(function (x) { if (x && x.id && !had[x.id]) dr.push(x); });
      localStorage.setItem('ws_user_projects', JSON.stringify(dr));
    }
    if (json.config) saveCfg(Object.assign(loadCfg(), json.config));
    updateBadges(); renderList(); renderSync();
  }
  function testBackend() {
    var u = ($('pfSyncUrl') || {}).value || '';
    var out = $('pfSyncTestOut');
    if (!u) { if (out) out.textContent = '未填后端地址，当前为纯本地模式'; return; }
    if (out) out.textContent = '测试中…';
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 6000);
    fetch(u, { method: 'GET', signal: ctrl ? ctrl.signal : undefined, headers: { Accept: 'application/json' } })
      .then(function (r) {
        clearTimeout(timer);
        if (out) out.textContent = '连通成功 · HTTP ' + r.status + '（' + (r.ok ? '可用于同步' : '返回异常，请检查路径') + '）';
      })
      .catch(function (e) {
        clearTimeout(timer);
        if (out) out.textContent = '连接失败：' + (e && e.name === 'AbortError' ? '超时（国内网络可能不可达）' : '网络错误或跨域被拦截');
      });
  }

  /* ---------- 初始化 ---------- */
  function init() {
    var root = $('pfLibDrawer');
    if (!root) return;

    // tabs
    Array.prototype.forEach.call(root.querySelectorAll('.pf-lib-tab'), function (b) {
      b.addEventListener('click', function () { switchTab(b.getAttribute('data-lib')); });
    });
    var close = $('pfLibClose'), mask = $('pfLibMask');
    if (close) close.addEventListener('click', closeLib);
    if (mask) mask.addEventListener('click', closeLib);
    var s = $('pfLibSearch');
    if (s) s.addEventListener('input', function () { kw = s.value; renderList(); });
    var add = $('pfLibAdd');
    if (add) add.addEventListener('click', function () { openEditor(curType, null); });
    var expBtn = $('pfLibExport');
    if (expBtn) expBtn.addEventListener('click', function () {
      var lib = loadLib();
      download('pf-library-' + curType + '-' + Date.now() + '.json', JSON.stringify(lib[curType], null, 1));
      toast('已导出' + LIB_META[curType] + ' JSON');
    });
    var impBtn = $('pfLibImport'), impFile = $('pfLibImportFile');
    if (impBtn && impFile) {
      impBtn.addEventListener('click', function () { impFile.click(); });
      impFile.addEventListener('change', function () {
        var f = impFile.files && impFile.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          try {
            var arr = JSON.parse(String(fr.result));
            if (!Array.isArray(arr)) throw new Error('需要数组');
            var lib = loadLib();
            var have = {}; lib[curType].forEach(function (x) { have[x.id] = 1; });
            var n = 0;
            arr.forEach(function (x) { if (x && !have[x.id]) { x.id = x.id || uid(); x.createdAt = x.createdAt || nowStr(); lib[curType].push(x); n++; } });
            saveLib(lib); renderList();
            toast('导入 ' + n + ' 条' + LIB_META[curType]);
          } catch (e) { toast('导入失败：' + e.message); }
          impFile.value = '';
        };
        fr.readAsText(f);
      });
    }
    var bomBtn = $('pfLibBom');
    if (bomBtn) bomBtn.addEventListener('click', function () {
      var list = loadLib().material;
      if (!list.length) return toast('物料库还是空的');
      var lines = ['| 名称 | 规格 | 数量 | 单价 | 小计 | 库存 |', '|---|---|---|---|---|---|'];
      var tot = 0;
      list.forEach(function (m) {
        var sub = num(m.price) * num(m.qty);
        tot += sub;
        lines.push('| ' + (m.name || '') + ' | ' + (m.spec || '') + ' | ' + (m.qty || '') + (m.unit || '') + ' | ' + (m.price ? '¥' + m.price : '') + ' | ' + (sub ? '¥' + sub.toFixed(2) : '') + ' | ' + (m.stock || '') + ' |');
      });
      lines.push('| **合计** |  |  |  | **¥' + tot.toFixed(2) + '** |  |');
      copyText(lines.join('\n')).then(function (ok) { toast(ok ? '物料台账已复制（Markdown）' : '复制失败，请改用导出'); });
    });
    var syncBtn = $('pfLibSync');
    if (syncBtn) syncBtn.addEventListener('click', openSync);

    // 采集球
    var ball = $('pfBall');
    if (ball) {
      ball.addEventListener('click', function (e) {
        var t = e.target.closest('[data-ball]');
        if (!t) return;
        var act = t.getAttribute('data-ball');
        if (act === 'menu') { ball.classList.toggle('is-open'); return; }
        ball.classList.remove('is-open');
        if (act === 'lib') openLib(curType);
        else if (act === 'sync') openSync();
        else openCap(act);
      });
      document.addEventListener('click', function (e) {
        if (!ball.classList.contains('is-open')) return;
        if (!e.target.closest('#pfBall')) ball.classList.remove('is-open');
      });
    }
    // 采集弹窗
    var capClose = $('pfCapClose'), capMask = $('pfCapMask');
    if (capClose) capClose.addEventListener('click', closeEditor);
    if (capMask) capMask.addEventListener('click', closeEditor);
    var edClose = $('pfLibModalClose'), edMask = $('pfLibModalMask');
    if (edClose) edClose.addEventListener('click', closeEditor);
    if (edMask) edMask.addEventListener('click', closeEditor);

    // 同步配置位
    var sClose = $('pfSyncClose'), sMask = $('pfSyncMask');
    if (sClose) sClose.addEventListener('click', closeSync);
    if (sMask) sMask.addEventListener('click', closeSync);
    var urlEl = $('pfSyncUrl');
    if (urlEl) urlEl.addEventListener('change', function () {
      var c = loadCfg(); c.backendUrl = urlEl.value.trim(); saveCfg(c);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-cfg]'), function (el) {
      el.addEventListener('change', function () {
        var c = loadCfg();
        c[el.getAttribute('data-cfg')] = el.type === 'checkbox' ? el.checked : el.value;
        saveCfg(c);
        toast('设置已保存');
      });
    });
    var tst = $('pfSyncTest');
    if (tst) tst.addEventListener('click', testBackend);
    var exAll = $('pfSyncExport');
    if (exAll) exAll.addEventListener('click', function () {
      download('pf-backup-' + Date.now() + '.json', JSON.stringify(collectAll(), null, 1));
      var c = loadCfg(); c.lastSync = nowStr(); saveCfg(c); renderSync();
      toast('已导出全部本地数据');
    });
    var imAll = $('pfSyncImport'), imAllFile = $('pfSyncImportFile');
    if (imAll && imAllFile) {
      imAll.addEventListener('click', function () { imAllFile.click(); });
      imAllFile.addEventListener('change', function () {
        var f = imAllFile.files && imAllFile.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          try { importAll(JSON.parse(String(fr.result))); toast('导入完成'); }
          catch (e) { toast('导入失败：' + e.message); }
          imAllFile.value = '';
        };
        fr.readAsText(f);
      });
    }
    var clr = $('pfSyncClear');
    if (clr) clr.addEventListener('click', function () {
      if (!confirm('清空采集库与同步配置？收藏与项目草稿不受影响。')) return;
      localStorage.removeItem(LIB_KEY);
      localStorage.removeItem(CFG_KEY);
      updateBadges(); renderList(); renderSync();
      toast('已清空采集库');
    });
    var markSync = $('pfSyncMark');
    if (markSync) markSync.addEventListener('click', function () {
      var c = loadCfg(); c.lastSync = nowStr(); saveCfg(c); renderSync(); toast('已记录同步时间');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var lm = $('pfLibModal');
      if (lm && !lm.hidden) return closeEditor();
      var ld = $('pfLibDrawer');
      if (ld && !ld.hidden) return closeLib();
      var sd = $('pfSyncDrawer');
      if (sd && !sd.hidden) return closeSync();
    });

    bindListEvents();
    updateBadges();
    renderList();

    window.PFLib = {
      open: openLib,
      openEditor: openEditor,
      openSync: openSync,
      count: function () { var l = loadLib(); return ORDER.reduce(function (s, k) { return s + (l[k] || []).length; }, 0); },
      add: function (type, rec) {
        var lib = loadLib();
        rec.id = rec.id || uid();
        rec.createdAt = rec.createdAt || nowStr();
        var tags = deriveTags([rec.name, rec.title, rec.note, rec.code, rec.url].join(' '));
        if (tags.length) rec.tags = (rec.tags || []).concat(tags).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
        lib[type].unshift(rec);
        saveLib(lib); renderList();
        return rec;
      },
      list: function (type) { return loadLib()[type] || []; },
      exportAll: collectAll,
      toast: toast
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
