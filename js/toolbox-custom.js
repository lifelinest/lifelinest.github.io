/**
 * 工具箱——自定义交互面板
 * 这里放"工厂生成不了"的工具：需要按钮、多输入、画布、定时器的复杂交互。
 * 简单工具（文本变换/单位换算/查表）一律写在 toolbox-tools.js 的注册表里。
 *
 * ====== 加一个自定义工具 ======
 *   TB.registerCustom('工具id', {
 *     render: (tool) => '面板HTML字符串',
 *     init:   (root, tool) => { /* 在 root 内绑定事件，用 root.querySelector，不要用全局 id *\/ }
 *   });
 *   然后在 toolbox-tools.js 的 REGISTRY 里登记 { id, cat, name, type:'custom' }
 */
(function () {
  const TB = window.TB;
  const q = function (root, sel) { return root.querySelector(sel); };
  const qa = function (root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };

  /* ============ JSON 格式化 ============ */
  TB.registerCustom('json', {
    render: function () {
      return '<div class="fp-card"><div class="ft-split">' +
        '<div><div class="ft-field"><label>粘贴 JSON 文本（Ctrl+Enter 格式化）</label>' +
        '<textarea class="fp-textarea jf-in" placeholder=\'{"hello": "world"}\'></textarea></div>' +
        '<div class="fp-row" style="margin-bottom:12px">' +
        '<button class="fp-btn primary jf-pretty" data-primary="1">格式化</button>' +
        '<button class="fp-btn jf-min">压缩</button>' +
        '<button class="fp-btn jf-copy">复制结果</button>' +
        '<button class="fp-btn jf-clear">清空</button>' +
        '<button class="fp-btn jf-sample">塞个例子</button></div>' +
        '<div class="fp-error-text jf-err"></div></div>' +
        '<div class="ft-field"><label>结果（带语法高亮）</label>' +
        '<div class="fp-result fp-code jf-out">等待输入…</div></div>' +
        '</div></div>';
    },
    init: function (root) {
      const input = q(root, '.jf-in'), output = q(root, '.jf-out'), err = q(root, '.jf-err');
      function run(minify) {
        const raw = input.value.trim();
        err.textContent = '';
        if (!raw) { output.textContent = '等待输入…'; return; }
        try {
          const obj = JSON.parse(raw);
          output.innerHTML = TB.highlightJson(minify ? JSON.stringify(obj) : JSON.stringify(obj, null, 2));
        } catch (e) {
          err.className = 'fp-error-text';
          const m = String(e.message).match(/position (\d+)/);
          if (!m) { err.textContent = e.message; return; }
          const pos = parseInt(m[1], 10);
          const before = raw.slice(0, pos);
          const line = before.split('\n').length;
          const col = pos - before.lastIndexOf('\n');
          err.textContent = e.message + '（第 ' + line + ' 行，第 ' + col + ' 列附近）';
          const lines = TB.esc(raw).split('\n');
          if (lines[line - 1] !== undefined) lines[line - 1] = '<span class="j-errline">' + lines[line - 1] + '</span>';
          output.innerHTML = lines.join('\n');
        }
      }
      q(root, '.jf-pretty').onclick = function () { run(false); };
      q(root, '.jf-min').onclick = function () { run(true); };
      q(root, '.jf-copy').onclick = function () {
        if (output.textContent !== '等待输入…') TB.copy(output.textContent, '已复制', output);
      };
      q(root, '.jf-clear').onclick = function () { input.value = ''; output.textContent = '等待输入…'; err.textContent = ''; };
      q(root, '.jf-sample').onclick = function () {
        input.value = JSON.stringify({ name: 'Lifeline', site: 'lifelinest.github.io', tags: ['前端', '学生'], nested: { ok: true, count: 2 } });
        run(false);
      };
      let t = null;
      input.oninput = function () { clearTimeout(t); t = setTimeout(function () { run(false); }, 400); };
    },
  });

  /* ============ 正则测试 ============ */
  TB.registerCustom('regex', {
    render: function () {
      const presets = [
        ['手机号', '1[3-9]\\d{9}', '联系电话 13812345678，备用 15987654321。'],
        ['邮箱', '[\\w.+-]+@[\\w-]+\\.[\\w.]+', '邮箱：foo.bar@example.com 与 bad-email#no。'],
        ['URL', 'https?://[^\\s]+', '访问 https://lifelinest.github.io/ 或 http://a.b/c。'],
        ['IPv4', '(\\d{1,3}\\.){3}\\d{1,3}', '服务器 IP：192.168.1.1 和 10.0.0.255。'],
        ['日期', '\\d{4}-\\d{2}-\\d{2}', '截止日期 2026-09-06，发布于 2025-01-01。'],
        ['中文', '[\\u4e00-\\u9fa5]+', 'mix 中文字符 and English words。'],
        ['HTML标签', '<[a-zA-Z]+[^>]*>', '<div class="a"> 与 <p> 是标签。'],
      ];
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:10px">' +
        '<span style="font-family:monospace;color:var(--anzhiyu-secondtext)">/</span>' +
        '<input class="fp-input rx-pat" style="flex:1;min-width:180px" placeholder="正则表达式，如 \\d+">' +
        '<span style="font-family:monospace;color:var(--anzhiyu-secondtext)">/</span>' +
        '<input class="fp-input rx-flags" style="width:80px" value="g">' +
        '</div>' +
        '<div class="fp-row" style="margin-bottom:12px"><span class="fp-hint">常用：</span>' +
        presets.map(function (p) {
          return '<button class="fp-btn rx-chip" data-p="' + TB.esc(p[1]) + '" data-s="' + TB.esc(p[2]) + '">' + p[0] + '</button>';
        }).join('') + '</div>' +
        '<div class="ft-split">' +
        '<div class="ft-field"><label>测试文本</label><textarea class="fp-textarea rx-text" placeholder="在这里输入要匹配的文本…"></textarea></div>' +
        '<div><div class="fp-row" style="margin-bottom:8px"><span class="fp-hint">实时匹配：<b class="rx-count">0</b> 处</span></div>' +
        '<div class="fp-result fp-code rx-out">等待输入…</div></div>' +
        '</div><div class="fp-error-text rx-err" style="margin-top:8px"></div></div>';
    },
    init: function (root) {
      const pat = q(root, '.rx-pat'), flags = q(root, '.rx-flags'), text = q(root, '.rx-text');
      const out = q(root, '.rx-out'), count = q(root, '.rx-count'), err = q(root, '.rx-err');
      function run() {
        err.textContent = '';
        if (!pat.value || !text.value) { out.textContent = '等待输入…'; count.textContent = '0'; return; }
        let re;
        const f = (flags.value || 'g').replace(/[^dgimsuy]/g, '');
        try { re = new RegExp(pat.value, f.includes('g') ? f : f + 'g'); }
        catch (e) { err.textContent = '正则语法错误：' + e.message; return; }
        const ranges = [];
        let m;
        while ((m = re.exec(text.value)) !== null) {
          if (m[0] === '') { re.lastIndex++; continue; }
          ranges.push([m.index, m.index + m[0].length, m[0]]);
          if (ranges.length >= 999) break;
        }
        count.textContent = String(ranges.length);
        if (!ranges.length) { out.textContent = '没有匹配到内容'; return; }
        let html = '', last = 0;
        ranges.forEach(function (r) {
          if (r[0] < last) return;
          html += TB.esc(text.value.slice(last, r[0])) + '<mark class="fp-hit">' + TB.esc(r[2]) + '</mark>';
          last = r[1];
        });
        out.innerHTML = html + TB.esc(text.value.slice(last));
      }
      pat.oninput = run; flags.oninput = run; text.oninput = run;
      qa(root, '.rx-chip').forEach(function (chip) {
        chip.onclick = function () {
          pat.value = chip.dataset.p;
          flags.value = 'g';
          if (!text.value.trim() && chip.dataset.s) text.value = chip.dataset.s;
          run();
        };
      });
    },
  });

  /* ============ JSON → TypeScript ============ */
  TB.registerCustom('json2ts', {
    render: function () {
      return '<div class="fp-card"><div class="ft-split">' +
        '<div><div class="ft-field"><label>粘贴 JSON（Ctrl+Enter 生成类型）</label>' +
        '<textarea class="fp-textarea t2-in" placeholder=\'{"name": "Lifeline"}\'></textarea></div>' +
        '<div class="fp-row" style="margin-bottom:12px">' +
        '<button class="fp-btn primary t2-gen" data-primary="1">生成 TypeScript</button>' +
        '<button class="fp-btn t2-copy">复制类型</button>' +
        '<button class="fp-btn t2-sample">塞个例子</button></div>' +
        '<div class="fp-error-text t2-err"></div></div>' +
        '<div class="ft-field"><label>生成的类型定义</label><div class="fp-result fp-code t2-out">等待输入…</div></div>' +
        '</div></div>';
    },
    init: function (root) {
      const input = q(root, '.t2-in'), output = q(root, '.t2-out'), err = q(root, '.t2-err');
      function toTs(value) {
        const chunks = [], used = { RootT: true };
        function unique(base) { let n = base, i = 2; while (used[n]) n = base + i++; used[n] = true; return n; }
        function pascal(s) {
          const p = String(s).replace(/[^a-zA-Z0-9]+(.)/g, function (m, c) { return c ? c.toUpperCase() : ''; })
            .replace(/^./, function (c) { return c.toUpperCase(); });
          return p || 'Item';
        }
        function typeOf(v, name, depth) {
          if (depth > 6) return 'unknown';
          if (v === null) return 'null';
          if (Array.isArray(v)) {
            if (!v.length) return 'unknown[]';
            const first = v[0];
            if (first !== null && typeof first !== 'object') {
              const set = [];
              v.forEach(function (x) { const t = typeOf(x, name, depth + 1); if (set.indexOf(t) === -1) set.push(t); });
              return (set.length === 1 ? set[0] : '(' + set.join(' | ') + ')') + '[]';
            }
            return typeOf(first, name, depth + 1) + '[]';
          }
          if (typeof v === 'object') {
            const iface = unique(pascal(name) + 'T');
            const lines = Object.keys(v).map(function (k) {
              const key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
              return '  ' + key + ': ' + typeOf(v[k], k, depth + 1) + ';';
            });
            chunks.push('interface ' + iface + ' {\n' + lines.join('\n') + '\n}');
            return iface;
          }
          if (typeof v === 'number') return 'number';
          if (typeof v === 'boolean') return 'boolean';
          return 'string';
        }
        const rootType = typeOf(value, 'root', 0);
        let out = chunks.join('\n\n');
        if (/^(string|number|boolean|null|unknown)/.test(rootType)) {
          out += (out ? '\n\n' : '') + 'type RootT = ' + rootType + ';';
        }
        return out || '// 空输入';
      }
      function colorize(code) {
        return TB.esc(code)
          .replace(/\b(interface|type)\b/g, '<span class="j-key">$1</span>')
          .replace(/\b(string|number|boolean|null|unknown)(\[\])?/g, '<span class="j-num">$1</span>$2')
          .replace(/^(\s*)([\w$]+)(:)/gm, '$1<span class="j-str">$2</span>$3');
      }
      function run() {
        const raw = input.value.trim();
        err.textContent = '';
        if (!raw) { output.textContent = '等待输入…'; return; }
        try { output.innerHTML = colorize(toTs(JSON.parse(raw))); }
        catch (e) { err.textContent = 'JSON 解析失败：' + e.message; output.textContent = '-'; }
      }
      q(root, '.t2-gen').onclick = run;
      q(root, '.t2-copy').onclick = function () {
        if (output.textContent !== '等待输入…') TB.copy(output.textContent, '类型已复制', output);
      };
      q(root, '.t2-sample').onclick = function () {
        input.value = JSON.stringify({
          id: 7, name: 'Lifeline', tags: ['前端', '学生'],
          profile: { city: '新乡', student: true, score: 95.5, avatar: null },
          posts: [{ title: '文章一', pv: 12 }, { title: '文章二', pv: 30 }],
        });
        run();
      };
      let t = null;
      input.oninput = function () { clearTimeout(t); t = setTimeout(run, 400); };
    },
  });

  /* ============ JWT 解析 ============ */
  TB.registerCustom('jwt', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="ft-field"><label>粘贴 JWT（header.payload.signature）</label>' +
        '<textarea class="fp-textarea jw-in" style="min-height:90px" placeholder="eyJhbGciOi..."></textarea></div>' +
        '<div class="fp-row" style="margin-bottom:12px">' +
        '<button class="fp-btn primary jw-parse" data-primary="1">解析</button>' +
        '<button class="fp-btn jw-sample">塞个例子</button>' +
        '<button class="fp-btn jw-clear">清空</button></div>' +
        '<div class="fp-error-text jw-err" style="margin-bottom:10px"></div>' +
        '<div class="ft-split">' +
        '<div class="ft-field"><label>Header</label><div class="fp-result fp-code jw-head">-</div></div>' +
        '<div class="ft-field"><label>Payload</label><div class="fp-result fp-code jw-payload">-</div></div>' +
        '</div><div class="fp-result jw-meta" style="margin-top:2px">-</div></div>';
    },
    init: function (root) {
      const input = q(root, '.jw-in');
      function b64u(s) {
        s = String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
        while (s.length % 4) s += '=';
        const bin = atob(s);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
      }
      function human(ms) {
        const h = Math.floor(ms / 3600000);
        return h < 48 ? h + ' 小时' : Math.floor(h / 24) + ' 天';
      }
      function run() {
        const token = input.value.trim();
        const err = q(root, '.jw-err'), meta = q(root, '.jw-meta');
        const head = q(root, '.jw-head'), payload = q(root, '.jw-payload');
        err.textContent = ''; meta.textContent = '-';
        if (!token) { head.textContent = '-'; payload.textContent = '-'; return; }
        const parts = token.split('.');
        if (parts.length !== 3 || !parts[0] || !parts[1]) {
          err.textContent = '不是合法的 JWT：应为 header.payload.signature 三段式';
          return;
        }
        try {
          const h = JSON.parse(b64u(parts[0])), p = JSON.parse(b64u(parts[1]));
          head.innerHTML = TB.highlightJson(JSON.stringify(h, null, 2));
          payload.innerHTML = TB.highlightJson(JSON.stringify(p, null, 2));
          const m = ['alg：' + (h.alg || '未声明'),
            parts[2] ? 'signature：有（本工具不做签名校验）' : 'signature：无（alg=none，不安全）'];
          if (typeof p.exp === 'number') {
            const remain = p.exp * 1000 - Date.now();
            m.push(remain > 0 ? '状态：有效中，剩余 ' + human(remain) : '状态：已于 ' + human(-remain) + '前过期');
          }
          if (typeof p.iat === 'number') m.push('签发于：' + new Date(p.iat * 1000).toLocaleString('zh-CN', { hour12: false }));
          meta.textContent = m.join('\n');
        } catch (e) {
          err.textContent = '解码失败：' + e.message;
        }
      }
      q(root, '.jw-parse').onclick = run;
      q(root, '.jw-sample').onclick = function () {
        function enc(o) {
          return btoa(unescape(encodeURIComponent(JSON.stringify(o))))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        }
        const now = Math.floor(Date.now() / 1000);
        input.value = enc({ alg: 'HS256', typ: 'JWT' }) + '.' +
          enc({ sub: '1001', name: 'lifeline', role: 'student', iat: now - 3600, exp: now + 86400 }) +
          '.signature-demo-value';
        run();
      };
      q(root, '.jw-clear').onclick = function () {
        input.value = ''; q(root, '.jw-head').textContent = '-';
        q(root, '.jw-payload').textContent = '-'; q(root, '.jw-meta').textContent = '-';
        q(root, '.jw-err').textContent = '';
      };
      input.onkeydown = function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(); };
    },
  });

  /* ============ 时间戳 ============ */
  TB.registerCustom('timestamp', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="ft-field"><label>当前时间（自动刷新）</label><div class="fp-result ts-now">…</div></div>' +
        '<div class="ft-field"><label>时间戳 → 日期（秒级 10 位 / 毫秒级 13 位自动识别）</label>' +
        '<div class="fp-row"><input class="fp-input ts-in" style="flex:1;min-width:200px" placeholder="例如 1757000000">' +
        '<button class="fp-btn primary ts-conv" data-primary="1">转换</button></div>' +
        '<div class="fp-result ts-out" style="margin-top:10px">等待输入…</div></div>' +
        '<div class="ft-field"><label>日期 → 时间戳</label>' +
        '<div class="fp-row"><input class="fp-input ts-date" type="datetime-local" style="flex:1;min-width:200px">' +
        '<button class="fp-btn primary ts-rev">转换</button></div>' +
        '<div class="fp-result ts-rout" style="margin-top:10px">等待输入…</div></div></div>';
    },
    init: function (root) {
      const nowEl = q(root, '.ts-now'), input = q(root, '.ts-in'), output = q(root, '.ts-out');
      const dateEl = q(root, '.ts-date'), revOut = q(root, '.ts-rout');
      function fmt(ms) {
        const d = new Date(ms);
        const week = '日一二三四五六'[d.getDay()];
        const pad = function (n) { return String(n).padStart(2, '0'); };
        return {
          local: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
            pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '（周' + week + '）',
          iso: d.toISOString(),
        };
      }
      function tick() {
        const s = Math.floor(Date.now() / 1000);
        nowEl.textContent = '秒级 ' + s + ' ｜ 毫秒级 ' + s * 1000 + '\n' + fmt(Date.now()).local;
        if (!dateEl.value) {
          dateEl.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        }
      }
      tick();
      const timer = setInterval(tick, 1000);
      document.addEventListener('pjax:send', function () { clearInterval(timer); });
      q(root, '.ts-conv').onclick = function () {
        const raw = (input.value || '').trim();
        if (!/^\d{10}$|^\d{13}$/.test(raw)) { output.textContent = '请输入 10 位（秒）或 13 位（毫秒）数字时间戳'; return; }
        const ms = raw.length === 10 ? parseInt(raw, 10) * 1000 : parseInt(raw, 10);
        output.textContent = fmt(ms).local + '\nISO(UTC)：' + fmt(ms).iso;
      };
      input.onkeydown = function (e) { if (e.key === 'Enter') q(root, '.ts-conv').click(); };
      q(root, '.ts-rev').onclick = function () {
        if (!dateEl.value) { revOut.textContent = '请先选择日期时间'; return; }
        const ms = new Date(dateEl.value).getTime();
        if (isNaN(ms)) { revOut.textContent = '日期解析失败'; return; }
        revOut.textContent = '秒级 ' + Math.floor(ms / 1000) + '\n毫秒级 ' + ms;
      };
    },
  });

  /* ============ Base64 / URL ============ */
  TB.registerCustom('base64', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:12px">' +
        '<button class="fp-btn primary b64-enc" data-primary="1">Base64 编码</button>' +
        '<button class="fp-btn b64-dec">Base64 解码</button>' +
        '<button class="fp-btn url-enc">URL 编码</button>' +
        '<button class="fp-btn url-dec">URL 解码</button>' +
        '<button class="fp-btn b64-swap">结果填回输入</button>' +
        '<button class="fp-btn b64-copy">复制结果</button>' +
        '<button class="fp-btn b64-clear">清空</button></div>' +
        '<div class="ft-split">' +
        '<div class="ft-field"><label>输入（支持所有 UTF-8 字符）</label><textarea class="fp-textarea b64-in" placeholder="Hello, 世界！"></textarea></div>' +
        '<div class="ft-field"><label>结果</label><div class="fp-result fp-code b64-out">等待输入…</div></div>' +
        '</div><div class="fp-error-text b64-err"></div></div>';
    },
    init: function (root) {
      const input = q(root, '.b64-in'), output = q(root, '.b64-out'), err = q(root, '.b64-err');
      function enc(str) {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
      }
      function dec(s) {
        const bin = atob(String(s).replace(/\s+/g, ''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
      }
      function run(fn, label) {
        err.textContent = '';
        if (!input.value) { output.textContent = '等待输入…'; return; }
        try { output.textContent = fn(input.value); }
        catch (e) { err.textContent = label + '失败：输入可能不是合法的编码内容'; output.textContent = '-'; }
      }
      q(root, '.b64-enc').onclick = function () { run(enc, 'Base64 编码'); };
      q(root, '.b64-dec').onclick = function () { run(dec, 'Base64 解码'); };
      q(root, '.url-enc').onclick = function () { run(encodeURIComponent, 'URL 编码'); };
      q(root, '.url-dec').onclick = function () { run(decodeURIComponent, 'URL 解码'); };
      q(root, '.b64-swap').onclick = function () {
        if (output.textContent !== '等待输入…' && output.textContent !== '-') input.value = output.textContent;
      };
      q(root, '.b64-copy').onclick = function () {
        if (output.textContent !== '等待输入…' && output.textContent !== '-') TB.copy(output.textContent, '已复制', output);
      };
      q(root, '.b64-clear').onclick = function () { input.value = ''; output.textContent = '等待输入…'; err.textContent = ''; };
    },
  });

  /* ============ CSS 单位换算 ============ */
  TB.registerCustom('cssunit', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:14px">' +
        '<input class="fp-input cu-v" type="number" value="32" style="width:130px">' +
        '<select class="fp-select cu-u" style="width:110px"><option>px</option><option>rem</option><option>vw</option><option>vh</option></select>' +
        '<span class="fp-hint">根字号 <input class="fp-input cu-root" type="number" value="16" style="width:70px"> px</span>' +
        '<span class="fp-hint">视口宽 <input class="fp-input cu-w" type="number" value="1920" style="width:80px"> px</span>' +
        '<span class="fp-hint">视口高 <input class="fp-input cu-h" type="number" value="1080" style="width:80px"> px</span></div>' +
        '<div class="fp-hint" style="margin-bottom:8px">输入即换算（em 按父级字号 = 根字号估算）</div>' +
        '<div class="fp-result cu-out">…</div></div>';
    },
    init: function (root) {
      const v = q(root, '.cu-v'), u = q(root, '.cu-u'), rootEl = q(root, '.cu-root');
      const wEl = q(root, '.cu-w'), hEl = q(root, '.cu-h'), out = q(root, '.cu-out');
      function toPx(x, unit, r, w, h) {
        if (unit === 'px') return x;
        if (unit === 'rem') return x * r;
        if (unit === 'vw') return (x / 100) * w;
        return (x / 100) * h;
      }
      function run() {
        const x = parseFloat(v.value), r = parseFloat(rootEl.value) || 16;
        const w = parseFloat(wEl.value) || 1920, h = parseFloat(hEl.value) || 1080;
        if (isNaN(x)) { out.textContent = '请输入数值'; return; }
        const px = toPx(x, u.value, r, w, h);
        out.textContent = '以 ' + x + u.value + ' 换算：\n' +
          'px  ' + Number(px.toFixed(3)) + '\n' +
          'rem ' + Number((px / r).toFixed(3)) + '   （根字号 ' + r + 'px）\n' +
          'vw  ' + Number(((px / w) * 100).toFixed(3)) + '   （视口宽 ' + w + 'px）\n' +
          'vh  ' + Number(((px / h) * 100).toFixed(3)) + '   （视口高 ' + h + 'px）';
      }
      [v, rootEl, wEl, hEl].forEach(function (el) { el.oninput = run; });
      u.onchange = run;
      run();
    },
  });

  /* ============ 二维码（库已在页面 defer 加载，仍做兜底） ============ */
  TB.registerCustom('qrcode', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="ft-field"><label>二维码内容（文字或链接）</label>' +
        '<textarea class="fp-textarea qr-text" style="min-height:80px" placeholder="https://lifelinest.github.io/"></textarea></div>' +
        '<div class="fp-row" style="margin-bottom:12px">' +
        '<select class="fp-select qr-size" style="width:130px"><option value="200">尺寸 200</option><option value="300" selected>尺寸 300</option><option value="400">尺寸 400</option></select>' +
        '<select class="fp-select qr-level" style="width:150px"><option value="L">容错 L (7%)</option><option value="M" selected>容错 M (15%)</option><option value="Q">容错 Q (25%)</option><option value="H">容错 H (30%)</option></select>' +
        '<button class="fp-btn primary qr-gen" data-primary="1">生成二维码</button>' +
        '<button class="fp-btn qr-dl" disabled>下载 PNG</button></div>' +
        '<div class="fp-hint qr-hint" style="margin-bottom:10px">输入内容后点击生成</div>' +
        '<div style="text-align:center"><canvas class="qr-canvas" width="300" height="300" style="display:none;border-radius:8px;max-width:100%"></canvas></div></div>';
    },
    init: function (root) {
      const text = q(root, '.qr-text'), canvas = q(root, '.qr-canvas');
      const hint = q(root, '.qr-hint'), dl = q(root, '.qr-dl');
      function loadLib() {
        if (window.qrcode) return Promise.resolve();
        return new Promise(function (res, rej) {
          const s = document.createElement('script');
          s.src = '/js/lib/qrcode.js';
          s.onload = res;
          s.onerror = function () { rej(new Error('库加载失败')); };
          document.head.appendChild(s);
        });
      }
      function draw() {
        const t = text.value.trim();
        if (!t) { hint.textContent = '请先输入内容'; hint.className = 'fp-hint'; canvas.style.display = 'none'; dl.disabled = true; return; }
        try {
          const size = parseInt(q(root, '.qr-size').value, 10);
          const qr = window.qrcode(0, q(root, '.qr-level').value);
          qr.addData(t); qr.make();
          const n = qr.getModuleCount(), margin = 2;
          const scale = Math.max(2, Math.floor(size / (n + margin * 2)));
          const px = (n + margin * 2) * scale;
          canvas.width = px; canvas.height = px;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, px, px);
          ctx.fillStyle = '#1f2430';
          for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
            if (qr.isDark(r, c)) ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
          }
          canvas.style.display = 'inline-block';
          hint.textContent = '生成成功（' + n + '×' + n + ' 模块）';
          hint.className = 'fp-success-text';
          dl.disabled = false;
        } catch (e) {
          hint.textContent = '生成失败：' + e.message;
          hint.className = 'fp-error-text';
        }
      }
      function generate() {
        hint.textContent = window.qrcode ? '生成中…' : '正在加载二维码库…';
        hint.className = 'fp-hint';
        loadLib().then(draw, function () {
          hint.textContent = '二维码库加载失败，请检查网络后重试';
          hint.className = 'fp-error-text';
        });
      }
      q(root, '.qr-gen').onclick = generate;
      dl.onclick = function () {
        const a = document.createElement('a');
        a.download = 'qrcode-' + Date.now() + '.png';
        a.href = canvas.toDataURL('image/png');
        a.click();
        TB.toast('已开始下载');
      };
      text.onkeydown = function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generate(); };
    },
  });

  /* ============ 颜色工具 + 对比度 ============ */
  TB.registerCustom('color', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:14px">' +
        '<input type="color" class="cl-picker" value="#425aef" style="width:52px;height:40px;border:none;background:none;cursor:pointer">' +
        '<input class="fp-input cl-hex" style="width:150px" value="#425AEF" placeholder="#RRGGBB">' +
        '<span class="fp-hint">输入 HEX 或点击取色</span></div>' +
        '<div class="cl-preview" style="height:64px;border-radius:8px;margin-bottom:14px;border:1px solid var(--anzhiyu-card-border)"></div>' +
        '<div class="ft-field"><label>各格式一览（点击复制）</label><div class="fp-result cl-out">…</div></div>' +
        '<div class="ft-field"><label>同色系色阶（点击色块复制）</label><div class="fp-row cl-shades"></div></div></div>' +
        '<div class="fp-card" style="margin-top:16px">' +
        '<div class="fp-section-title" style="margin-top:0">对比度检查 <span class="fp-section-tip">WCAG 2.1 无障碍标准</span></div>' +
        '<div class="fp-row" style="margin-bottom:14px">' +
        '<label class="fp-hint">前景 <input type="color" class="ct-fg" value="#ffffff" style="width:44px;height:36px;border:none;background:none;cursor:pointer;vertical-align:middle"></label>' +
        '<label class="fp-hint">背景 <input type="color" class="ct-bg" value="#425aef" style="width:44px;height:36px;border:none;background:none;cursor:pointer;vertical-align:middle"></label>' +
        '<button class="fp-btn ct-swap">交换</button></div>' +
        '<div class="ct-preview fp-result" style="font-size:1.05em;text-align:center">Aa 文字预览 Sample 123</div>' +
        '<div class="fp-row" style="margin-top:12px;align-items:center">' +
        '<b style="font-size:1.5em;font-family:monospace" class="ct-ratio">—</b><span class="fp-hint">对比度</span></div>' +
        '<div class="fp-row" style="margin-top:10px" class="ct-badges ct-badges"></div></div>';
    },
    init: function (root) {
      function hex2rgb(hex) {
        const m = String(hex).replace('#', '');
        if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
        return { r: parseInt(m.slice(0, 2), 16), g: parseInt(m.slice(2, 4), 16), b: parseInt(m.slice(4, 6), 16) };
      }
      function rgb2hsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0;
        const l = (max + min) / 2;
        if (max !== min) {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
          else if (max === g) h = (b - r) / d + 2;
          else h = (r - g) / d + 4;
          h *= 60;
        }
        return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
      }
      // --- 颜色转换 ---
      const picker = q(root, '.cl-picker'), hexIn = q(root, '.cl-hex');
      const preview = q(root, '.cl-preview'), out = q(root, '.cl-out'), shades = q(root, '.cl-shades');
      let cur = '#425AEF';
      function render() {
        const rgb = hex2rgb(cur);
        if (!rgb) { out.textContent = 'HEX 格式不正确（需要 #RRGGBB）'; return; }
        const hsl = rgb2hsl(rgb.r, rgb.g, rgb.b);
        preview.style.background = cur;
        out.textContent = 'HEX  ' + cur.toUpperCase() + '\nRGB  rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')\nHSL  hsl(' + hsl.h + ', ' + hsl.s + '%, ' + hsl.l + '%)';
        shades.innerHTML = '';
        [88, 72, 56, 42, 28].forEach(function (l) {
          const chip = document.createElement('div');
          const c = 'hsl(' + hsl.h + ', ' + hsl.s + '%, ' + l + '%)';
          chip.style.cssText = 'width:52px;height:36px;border-radius:8px;cursor:pointer;background:' + c + ';border:1px solid var(--anzhiyu-card-border)';
          chip.title = c + '（点击复制）';
          chip.onclick = function () { TB.copy(c, '已复制 ' + c); };
          shades.appendChild(chip);
        });
      }
      picker.oninput = function () { cur = picker.value.toUpperCase(); hexIn.value = cur; render(); };
      hexIn.oninput = function () {
        let v = hexIn.value.trim();
        if (v && v[0] !== '#') v = '#' + v;
        if (hex2rgb(v)) { cur = v.toUpperCase(); picker.value = cur; render(); }
      };
      render();
      // --- 对比度 ---
      const fg = q(root, '.ct-fg'), bg = q(root, '.ct-bg');
      const pEl = q(root, '.ct-preview'), ratioEl = q(root, '.ct-ratio'), badges = root.querySelector('.ct-badges');
      function lum(r, g, b) {
        function ch(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
        return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
      }
      function runCt() {
        const a = hex2rgb(fg.value), b = hex2rgb(bg.value);
        if (!a || !b) return;
        const l1 = lum(a.r, a.g, a.b), l2 = lum(b.r, b.g, b.b);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        ratioEl.textContent = ratio.toFixed(2) + ' : 1';
        pEl.style.color = fg.value;
        pEl.style.background = bg.value;
        badges.innerHTML = '';
        [{ n: 'AA 正文（≥4.5）', p: ratio >= 4.5 }, { n: 'AA 大字（≥3）', p: ratio >= 3 },
         { n: 'AAA 正文（≥7）', p: ratio >= 7 }, { n: 'AAA 大字（≥4.5）', p: ratio >= 4.5 }].forEach(function (r) {
          const chip = document.createElement('span');
          chip.className = 'ct-badge ' + (r.p ? 'pass' : 'fail');
          chip.innerHTML = '<i class="anzhiyufont anzhiyu-icon-' + (r.p ? 'circle-check' : 'circle-xmark') + '"></i>' + r.n;
          badges.appendChild(chip);
        });
      }
      fg.oninput = runCt; bg.oninput = runCt;
      q(root, '.ct-swap').onclick = function () {
        const t = fg.value; fg.value = bg.value; bg.value = t; runCt();
      };
      runCt();
    },
  });

  /* ============ 密码生成 ============ */
  TB.registerCustom('password', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="ft-field"><label>密码长度：<b class="pw-len-label">16</b> 位</label>' +
        '<input type="range" class="pw-len" min="8" max="64" value="16" style="width:100%"></div>' +
        '<div class="fp-row" style="margin-bottom:12px">' +
        '<label class="fp-hint"><input type="checkbox" class="pw-lower" checked> 小写 a-z</label>' +
        '<label class="fp-hint"><input type="checkbox" class="pw-upper" checked> 大写 A-Z</label>' +
        '<label class="fp-hint"><input type="checkbox" class="pw-digit" checked> 数字 0-9</label>' +
        '<label class="fp-hint"><input type="checkbox" class="pw-symbol"> 符号 !@#$</label>' +
        '<label class="fp-hint"><input type="checkbox" class="pw-noconfuse"> 排除易混淆 (il1Lo0O)</label></div>' +
        '<div class="fp-row" style="margin-bottom:12px">' +
        '<input class="fp-input pw-out" readonly style="flex:1;min-width:200px;font-family:monospace;letter-spacing:1px">' +
        '<button class="fp-btn primary pw-gen" data-primary="1"><i class="anzhiyufont anzhiyu-icon-dice"></i>重新生成</button>' +
        '<button class="fp-btn pw-copy">复制</button></div>' +
        '<div class="fp-row"><span class="fp-hint">强度：</span>' +
        '<div class="ach-progress" style="flex:1;min-width:120px"><div class="ach-progress-inner pw-bar" style="width:0"></div></div>' +
        '<b class="fp-hint pw-strength">—</b></div>' +
        '<p class="fp-hint" style="margin-bottom:0">浏览器原生加密随机数（无偏采样），仅存在于本页内存中。</p></div>';
    },
    init: function (root) {
      const len = q(root, '.pw-len'), label = q(root, '.pw-len-label'), output = q(root, '.pw-out');
      const bar = q(root, '.pw-bar'), strength = q(root, '.pw-strength');
      function randInt(max) {
        const limit = Math.floor(4294967296 / max) * max;
        const buf = new Uint32Array(1);
        let v;
        do { crypto.getRandomValues(buf); v = buf[0]; } while (v >= limit);
        return v % max;
      }
      function generate() {
        let pool = '';
        if (q(root, '.pw-lower').checked) pool += 'abcdefghijklmnopqrstuvwxyz';
        if (q(root, '.pw-upper').checked) pool += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (q(root, '.pw-digit').checked) pool += '0123456789';
        if (q(root, '.pw-symbol').checked) pool += '!@#$%^&*()-_=+[]{};:,.<>?';
        if (!pool) { output.value = ''; strength.textContent = '请至少勾选一种字符'; bar.style.width = '0'; return; }
        if (q(root, '.pw-noconfuse').checked) pool = pool.replace(/[il1Lo0O]/g, '');
        const n = parseInt(len.value, 10);
        let pwd = '';
        for (let i = 0; i < n; i++) pwd += pool[randInt(pool.length)];
        output.value = pwd;
        const entropy = n * Math.log2(pool.length);
        let pct, lab, color;
        if (entropy < 50) { pct = 30; lab = '弱'; color = 'var(--anzhiyu-red)'; }
        else if (entropy < 70) { pct = 55; lab = '中'; color = 'var(--anzhiyu-orange)'; }
        else if (entropy < 90) { pct = 78; lab = '强'; color = 'var(--anzhiyu-blue)'; }
        else { pct = 100; lab = '极强'; color = 'var(--anzhiyu-green)'; }
        bar.style.width = pct + '%';
        bar.style.background = color;
        strength.textContent = lab + '（约 ' + Math.round(entropy) + ' bit）';
      }
      len.oninput = function () { label.textContent = len.value; generate(); };
      ['.pw-lower', '.pw-upper', '.pw-digit', '.pw-symbol', '.pw-noconfuse'].forEach(function (s) {
        q(root, s).onchange = generate;
      });
      q(root, '.pw-gen').onclick = generate;
      q(root, '.pw-copy').onclick = function () { if (output.value) TB.copy(output.value, '密码已复制', output); };
      generate();
    },
  });

  /* ============ UUID ============ */
  TB.registerCustom('uuid', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:12px">' +
        '<select class="fp-select uu-count" style="width:110px"><option value="1">1 个</option><option value="5" selected>5 个</option><option value="10">10 个</option><option value="50">50 个</option></select>' +
        '<label class="fp-hint"><input type="checkbox" class="uu-upper"> 大写</label>' +
        '<label class="fp-hint"><input type="checkbox" class="uu-nohy"> 去掉连字符</label>' +
        '<button class="fp-btn primary uu-gen" data-primary="1">生成</button>' +
        '<button class="fp-btn uu-copy">复制全部</button></div>' +
        '<div class="fp-result fp-code uu-out">等待生成…</div>' +
        '<p class="fp-hint" style="margin-bottom:0">RFC 4122 v4，crypto.getRandomValues 随机数。</p></div>';
    },
    init: function (root) {
      const out = q(root, '.uu-out');
      function v4() {
        if (crypto.randomUUID) return crypto.randomUUID();
        const b = new Uint8Array(16);
        crypto.getRandomValues(b);
        b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
        const hex = Array.from(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
        return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
      }
      function gen() {
        const n = parseInt(q(root, '.uu-count').value, 10);
        const list = [];
        for (let i = 0; i < n; i++) {
          let u = v4();
          if (q(root, '.uu-nohy').checked) u = u.replace(/-/g, '');
          if (q(root, '.uu-upper').checked) u = u.toUpperCase();
          list.push(u);
        }
        out.textContent = list.join('\n');
      }
      q(root, '.uu-gen').onclick = gen;
      q(root, '.uu-copy').onclick = function () {
        if (out.textContent !== '等待生成…') TB.copy(out.textContent, '已复制全部', out);
      };
      ['.uu-count', '.uu-upper', '.uu-nohy'].forEach(function (s) { q(root, s).onchange = gen; });
      gen();
    },
  });

  /* ============ 图片转 Base64 ============ */
  TB.registerCustom('img2b64', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:12px">' +
        '<label class="fp-btn primary" style="cursor:pointer">选择图片<input type="file" class="im-file" accept="image/*" style="display:none"></label>' +
        '<button class="fp-btn im-copy" disabled>复制 DataURL</button>' +
        '<button class="fp-btn im-clear">清空</button>' +
        '<span class="fp-hint im-info">图片仅在本地转换，不会上传</span></div>' +
        '<div class="fp-result fp-code im-out" style="max-height:140px">等待选择图片…</div>' +
        '<div style="text-align:center;margin-top:12px"><img class="im-preview" style="display:none;max-width:100%;max-height:260px;border-radius:8px;border:1px solid var(--anzhiyu-card-border)"></div></div>';
    },
    init: function (root) {
      const file = q(root, '.im-file'), out = q(root, '.im-out');
      const preview = q(root, '.im-preview'), copy = q(root, '.im-copy'), info = q(root, '.im-info');
      let dataUrl = '';
      file.onchange = function () {
        const f = file.files && file.files[0];
        if (!f) return;
        if (f.size > 3 * 1024 * 1024) { TB.toast('图片超过 3MB，DataURL 会非常长，建议先压缩'); }
        const reader = new FileReader();
        reader.onload = function () {
          dataUrl = String(reader.result);
          out.textContent = dataUrl;
          preview.src = dataUrl;
          preview.style.display = 'inline-block';
          copy.disabled = false;
          info.textContent = f.name + ' · ' + (f.size / 1024).toFixed(1) + 'KB → DataURL ' + (dataUrl.length / 1024).toFixed(1) + 'KB';
        };
        reader.readAsDataURL(f);
      };
      copy.onclick = function () { if (dataUrl) TB.copy(dataUrl, 'DataURL 已复制', out); };
      q(root, '.im-clear').onclick = function () {
        dataUrl = ''; file.value = '';
        out.textContent = '等待选择图片…';
        preview.style.display = 'none';
        copy.disabled = true;
        info.textContent = '图片仅在本地转换，不会上传';
      };
    },
  });

  /* ============ WiFi 二维码 ============ */
  TB.registerCustom('wifiqr', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:12px">' +
        '<input class="fp-input wq-ssid" style="flex:1;min-width:160px" placeholder="WiFi 名称 (SSID)">' +
        '<input class="fp-input wq-pass" style="flex:1;min-width:160px" placeholder="WiFi 密码">' +
        '<select class="fp-select wq-enc" style="width:120px"><option value="WPA">WPA/WPA2</option><option value="WEP">WEP</option><option value="nopass">开放</option></select>' +
        '<button class="fp-btn primary wq-gen" data-primary="1">生成二维码</button></div>' +
        '<div class="fp-hint wq-hint" style="margin-bottom:10px">手机扫码即可自动连接 WiFi（密码只在本页使用）</div>' +
        '<div style="text-align:center"><canvas class="wq-canvas" width="280" height="280" style="display:none;border-radius:8px;max-width:100%"></canvas></div></div>';
    },
    init: function (root) {
      const ssid = q(root, '.wq-ssid'), pass = q(root, '.wq-pass'), enc = q(root, '.wq-enc');
      const canvas = q(root, '.wq-canvas'), hint = q(root, '.wq-hint');
      function loadLib() {
        if (window.qrcode) return Promise.resolve();
        return new Promise(function (res, rej) {
          const s = document.createElement('script');
          s.src = '/js/lib/qrcode.js';
          s.onload = res; s.onerror = function () { rej(new Error('库加载失败')); };
          document.head.appendChild(s);
        });
      }
      function esc_wifi(s) { return s.replace(/([\\;,:"])/g, '\\$1'); }
      function draw(payload) {
        const qr = window.qrcode(0, 'M');
        qr.addData(payload); qr.make();
        const n = qr.getModuleCount(), margin = 2, scale = 6;
        const px = (n + margin * 2) * scale;
        canvas.width = px; canvas.height = px;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, px, px);
        ctx.fillStyle = '#1f2430';
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
          if (qr.isDark(r, c)) ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
        }
        canvas.style.display = 'inline-block';
      }
      q(root, '.wq-gen').onclick = function () {
        const s = ssid.value.trim(), p = pass.value, e = enc.value;
        if (!s) { hint.textContent = '请输入 WiFi 名称'; hint.className = 'fp-error-text'; return; }
        if (e !== 'nopass' && !p) { hint.textContent = '请输入 WiFi 密码'; hint.className = 'fp-error-text'; return; }
        const payload = 'WIFI:T:' + e + ';S:' + esc_wifi(s) + ';' + (e === 'nopass' ? '' : 'P:' + esc_wifi(p) + ';') + 'H:false;';
        hint.textContent = '生成中…';
        loadLib().then(function () {
          draw(payload);
          hint.textContent = '生成成功，手机扫码即可连接';
          hint.className = 'fp-success-text';
        }, function () {
          hint.textContent = '二维码库加载失败，请检查网络';
          hint.className = 'fp-error-text';
        });
      };
    },
  });

  /* ============ 日期计算 ============ */
  TB.registerCustom('datecalc', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-section-title" style="margin-top:0">两个日期相差</div>' +
        '<div class="fp-row" style="margin-bottom:10px">' +
        '<input class="fp-input dc-a" type="date" style="width:170px"><span class="fp-hint">至</span>' +
        '<input class="fp-input dc-b" type="date" style="width:170px">' +
        '<button class="fp-btn primary dc-diff" data-primary="1">计算</button></div>' +
        '<div class="fp-result dc-dout">…</div>' +
        '<div class="fp-section-title">日期加减 N 天</div>' +
        '<div class="fp-row" style="margin-bottom:10px">' +
        '<input class="fp-input dc-base" type="date" style="width:170px">' +
        '<input class="fp-input dc-n" type="number" value="30" style="width:100px">' +
        '<select class="fp-select dc-dir" style="width:90px"><option value="1">之后</option><option value="-1">之前</option></select>' +
        '<button class="fp-btn primary dc-add">计算</button></div>' +
        '<div class="fp-result dc-aout">…</div></div>';
    },
    init: function (root) {
      const a = q(root, '.dc-a'), b = q(root, '.dc-b');
      const today = new Date();
      const pad = function (n) { return String(n).padStart(2, '0'); };
      const iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
      a.value = iso(today);
      b.value = iso(new Date(today.getTime() + 30 * 86400000));
      q(root, '.dc-base').value = iso(today);
      function parseD(el) { const t = (el.value || '').split('-'); return new Date(+t[0], +t[1] - 1, +t[2]); }
      q(root, '.dc-diff').onclick = function () {
        const d1 = parseD(a), d2 = parseD(b);
        if (isNaN(d1) || isNaN(d2)) { q(root, '.dc-dout').textContent = '请选择两个日期'; return; }
        let diff = Math.round((d2 - d1) / 86400000);
        const abs = Math.abs(diff);
        const weeks = Math.floor(abs / 7), days = abs % 7;
        q(root, '.dc-dout').textContent =
          (diff >= 0 ? '相差 ' : '反向相差 ') + abs + ' 天' +
          (weeks > 0 ? '（' + weeks + ' 周' + (days ? ' + ' + days + ' 天' : '') + '）' : '') +
          '\n合计 ' + (abs / 365.25).toFixed(2) + ' 年，或 ' + (abs * 24).toLocaleString('zh-CN') + ' 小时';
      };
      q(root, '.dc-add').onclick = function () {
        const base = parseD(q(root, '.dc-base'));
        const n = parseInt(q(root, '.dc-n').value, 10) || 0;
        const dir = parseInt(q(root, '.dc-dir').value, 10);
        if (isNaN(base)) { q(root, '.dc-aout').textContent = '请选择日期'; return; }
        const r = new Date(base.getTime() + n * dir * 86400000);
        const week = '日一二三四五六'[r.getDay()];
        q(root, '.dc-aout').textContent = iso(base) + (dir > 0 ? ' + ' : ' - ') + n + ' 天 = ' +
          iso(r) + '（周' + week + '）';
      };
    },
  });

  /* ============ 年龄计算 ============ */
  TB.registerCustom('age', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:12px">' +
        '<span class="fp-hint">出生日期</span><input class="fp-input ag-birth" type="date" style="width:170px">' +
        '<button class="fp-btn primary ag-go" data-primary="1">计算</button></div>' +
        '<div class="fp-result ag-out">…</div></div>';
    },
    init: function (root) {
      function run() {
        const v = q(root, '.ag-birth').value;
        const out = q(root, '.ag-out');
        if (!v) { out.textContent = '请选择出生日期'; return; }
        const t = v.split('-');
        const birth = new Date(+t[0], +t[1] - 1, +t[2]);
        const now = new Date();
        if (birth > now) { out.textContent = '出生日期在未来？'; return; }
        let y = now.getFullYear() - birth.getFullYear();
        let m = now.getMonth() - birth.getMonth();
        let d = now.getDate() - birth.getDate();
        if (d < 0) { m--; d += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
        if (m < 0) { y--; m += 12; }
        const days = Math.floor((now - birth) / 86400000);
        // 下一个生日
        let next = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
        if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
          next = new Date(now.getFullYear() + 1, birth.getMonth(), birth.getDate());
        }
        const toGo = Math.ceil((next - now) / 86400000);
        out.textContent = '年龄：' + y + ' 岁 ' + m + ' 个月 ' + d + ' 天' +
          '\n一共活了 ' + days.toLocaleString('zh-CN') + ' 天（约 ' + (days / 365.25).toFixed(1) + ' 年）' +
          '\n下次生日：' + toGo + ' 天后';
      }
      q(root, '.ag-go').onclick = run;
    },
  });

  /* ============ BMI ============ */
  TB.registerCustom('bmi', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:12px">' +
        '<span class="fp-hint">身高 <input class="fp-input bm-h" type="number" value="170" style="width:90px"> cm</span>' +
        '<span class="fp-hint">体重 <input class="fp-input bm-w" type="number" value="60" style="width:90px"> kg</span>' +
        '<button class="fp-btn primary bm-go" data-primary="1">计算</button></div>' +
        '<div class="fp-result bm-out">…</div></div>';
    },
    init: function (root) {
      q(root, '.bm-go').onclick = function () {
        const h = parseFloat(q(root, '.bm-h').value) / 100;
        const w = parseFloat(q(root, '.bm-w').value);
        const out = q(root, '.bm-out');
        if (!h || !w) { out.textContent = '请输入身高体重'; return; }
        const bmi = w / (h * h);
        let label;
        if (bmi < 18.5) label = '偏瘦';
        else if (bmi < 24) label = '正常（中国标准）';
        else if (bmi < 28) label = '超重';
        else label = '肥胖';
        const ideal = (18.5 * h * h).toFixed(1) + ' ~ ' + (24 * h * h).toFixed(1);
        out.textContent = 'BMI：' + bmi.toFixed(1) + '（' + label + '）' +
          '\n对应身高的正常体重范围：' + ideal + ' kg' +
          '\nWHO 标准：<18.5 偏瘦 · 18.5~25 正常 · 25~30 超重 · ≥30 肥胖';
      };
    },
  });

  /* ============ 百分比计算 ============ */
  TB.registerCustom('percent', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:12px">' +
        '<select class="fp-select pc-mode" style="width:230px">' +
        '<option value="a">A 是 B 的百分之几</option>' +
        '<option value="b">B 的 P% 是多少</option>' +
        '<option value="c">A 增加/减少 P% 后是多少</option></select></div>' +
        '<div class="fp-row" style="margin-bottom:12px">' +
        '<input class="fp-input pc-a" type="number" placeholder="A" style="width:130px">' +
        '<input class="fp-input pc-b" type="number" placeholder="B 或 P(%)" style="width:130px">' +
        '<button class="fp-btn primary pc-go" data-primary="1">计算</button></div>' +
        '<div class="fp-result pc-out">…</div></div>';
    },
    init: function (root) {
      q(root, '.pc-go').onclick = function () {
        const mode = q(root, '.pc-mode').value;
        const a = parseFloat(q(root, '.pc-a').value);
        const b = parseFloat(q(root, '.pc-b').value);
        const out = q(root, '.pc-out');
        if (isNaN(a) || isNaN(b)) { out.textContent = '请填写两个数'; return; }
        if (mode === 'a') {
          out.textContent = b === 0 ? 'B 不能为 0' : a + ' 是 ' + b + ' 的 ' + ((a / b) * 100).toFixed(2) + '%';
        } else if (mode === 'b') {
          out.textContent = b + '% 的 ' + a + ' = ' + Number((a * b / 100).toFixed(4));
        } else {
          out.textContent = a + (b >= 0 ? ' 增加 ' : ' 减少 ') + Math.abs(b) + '% = ' + Number((a * (1 + b / 100)).toFixed(4));
        }
      };
    },
  });

  /* ============ 倒计时 ============ */
  TB.registerCustom('countdown', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:12px">' +
        '<span class="fp-hint">目标时间</span>' +
        '<input class="fp-input cd-target" type="datetime-local" style="width:230px">' +
        '<input class="fp-input cd-name" placeholder="事项名（可选）" style="width:160px"></div>' +
        '<div class="fp-result cd-out" style="font-size:1.1em;text-align:center">…</div></div>';
    },
    init: function (root) {
      const target = q(root, '.cd-target'), nameEl = q(root, '.cd-name'), out = q(root, '.cd-out');
      const pad = function (n) { return String(n).padStart(2, '0'); };
      target.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
        .toISOString().slice(0, 16);
      function tick() {
        const t = new Date(target.value).getTime();
        if (isNaN(t)) { out.textContent = '请选择目标时间'; return; }
        let diff = t - Date.now();
        const past = diff < 0;
        diff = Math.abs(diff);
        const d = Math.floor(diff / 86400000);
        const h = Math.floor(diff % 86400000 / 3600000);
        const m = Math.floor(diff % 3600000 / 60000);
        const s = Math.floor(diff % 60000 / 1000);
        const name = nameEl.value ? '「' + nameEl.value + '」' : '';
        out.textContent = name + (past ? '已经过去 ' : '还剩 ') +
          d + ' 天 ' + pad(h) + ' 时 ' + pad(m) + ' 分 ' + pad(s) + ' 秒';
      }
      tick();
      const timer = setInterval(tick, 1000);
      document.addEventListener('pjax:send', function () { clearInterval(timer); });
    },
  });

  /* ============ 随机数 ============ */
  TB.registerCustom('randnum', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:12px">' +
        '<span class="fp-hint">范围 <input class="fp-input rn-min" type="number" value="1" style="width:100px"> ~ ' +
        '<input class="fp-input rn-max" type="number" value="100" style="width:100px"></span>' +
        '<span class="fp-hint">数量 <input class="fp-input rn-n" type="number" value="5" min="1" max="1000" style="width:80px"></span>' +
        '<label class="fp-hint"><input type="checkbox" class="rn-unique"> 互不重复</label>' +
        '<label class="fp-hint"><input type="checkbox" class="rn-sort" checked> 排序</label>' +
        '<button class="fp-btn primary rn-go" data-primary="1">生成</button></div>' +
        '<div class="fp-result rn-out">…</div></div>';
    },
    init: function (root) {
      q(root, '.rn-go').onclick = function () {
        const min = parseInt(q(root, '.rn-min').value, 10);
        const max = parseInt(q(root, '.rn-max').value, 10);
        const n = parseInt(q(root, '.rn-n').value, 10);
        const unique = q(root, '.rn-unique').checked;
        const sort = q(root, '.rn-sort').checked;
        const out = q(root, '.rn-out');
        if (isNaN(min) || isNaN(max) || max < min) { out.textContent = '范围不合法'; return; }
        const span = max - min + 1;
        if (unique && n > span) { out.textContent = '互不重复时数量不能超过范围大小（' + span + '）'; return; }
        const picked = [];
        const seen = {};
        while (picked.length < n) {
          const v = min + Math.floor(Math.random() * span);
          if (unique && seen[v]) continue;
          seen[v] = 1;
          picked.push(v);
        }
        if (sort) picked.sort(function (x, y) { return x - y; });
        out.textContent = picked.join(', ');
      };
    },
  });

  /* ============ 掷骰子 / 抛硬币 ============ */
  TB.registerCustom('dice', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:12px">' +
        '<select class="fp-select dc-mode" style="width:130px"><option value="coin">抛硬币</option><option value="d6">骰子 d6</option><option value="d20">骰子 d20</option></select>' +
        '<span class="fp-hint">次数 <input class="fp-input dc-n" type="number" value="1" min="1" max="100" style="width:80px"></span>' +
        '<button class="fp-btn primary dc-go" data-primary="1">来！</button></div>' +
        '<div class="fp-result dc-out" style="text-align:center;font-size:1.1em">…</div></div>';
    },
    init: function (root) {
      q(root, '.dc-go').onclick = function () {
        const mode = q(root, '.dc-mode').value;
        const n = parseInt(q(root, '.dc-n').value, 10) || 1;
        const out = q(root, '.dc-out');
        const res = [];
        for (let i = 0; i < n; i++) {
          if (mode === 'coin') res.push(Math.random() < 0.5 ? '正面' : '反面');
          else if (mode === 'd6') res.push(Math.floor(Math.random() * 6) + 1 + ' 点');
          else res.push(Math.floor(Math.random() * 20) + 1 + ' 点');
        }
        out.textContent = n === 1 ? res[0] : res.join(' · ') + '\n共 ' + n + ' 次';
      };
    },
  });

  /* ============ 顺序打乱 ============ */
  TB.registerCustom('shuffle', {
    render: function () {
      return '<div class="fp-card"><div class="ft-split">' +
        '<div class="ft-field"><label>输入名单（每行一项）</label><textarea class="fp-textarea sf-in" placeholder="张三&#10;李四&#10;王五"></textarea></div>' +
        '<div><div class="fp-row" style="margin-bottom:8px">' +
        '<button class="fp-btn primary sf-go" data-primary="1">打乱顺序</button>' +
        '<button class="fp-btn sf-copy">复制结果</button></div>' +
        '<div class="fp-result sf-out">等待输入…</div></div>' +
        '</div><p class="fp-hint" style="margin-bottom:0">Fisher-Yates 洗牌算法，适合决定发言顺序、值日表等。</p></div>';
    },
    init: function (root) {
      const input = q(root, '.sf-in'), out = q(root, '.sf-out');
      q(root, '.sf-go').onclick = function () {
        const items = input.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        if (!items.length) { out.textContent = '请先输入名单'; return; }
        for (let i = items.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const t = items[i]; items[i] = items[j]; items[j] = t;
        }
        out.textContent = items.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n');
      };
      q(root, '.sf-copy').onclick = function () {
        if (out.textContent !== '等待输入…') TB.copy(out.textContent, '已复制', out);
      };
    },
  });

  /* ============ 抽签 / 抽奖 ============ */
  TB.registerCustom('lottery', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="ft-field"><label>候选名单（每行一项）</label><textarea class="fp-textarea lt-in" placeholder="张三&#10;李四&#10;王五&#10;赵六"></textarea></div>' +
        '<div class="fp-row" style="margin-bottom:12px">' +
        '<span class="fp-hint">抽取 <input class="fp-input lt-n" type="number" value="1" min="1" style="width:80px"> 名</span>' +
        '<label class="fp-hint"><input type="checkbox" class="lt-fair" checked> 公平随机（加密随机数）</label>' +
        '<button class="fp-btn primary lt-go" data-primary="1">抽！</button></div>' +
        '<div class="fp-result lt-out" style="font-size:1.05em">…</div></div>';
    },
    init: function (root) {
      q(root, '.lt-go').onclick = function () {
        const items = q(root, '.lt-in').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        const n = parseInt(q(root, '.lt-n').value, 10) || 1;
        const out = q(root, '.lt-out');
        if (!items.length) { out.textContent = '请先输入候选名单'; return; }
        if (n > items.length) { out.textContent = '抽取数量超过候选人数'; return; }
        const pool = items.slice();
        const picked = [];
        const buf = new Uint32Array(1);
        while (picked.length < n) {
          let idx;
          if (q(root, '.lt-fair').checked) {
            const limit = Math.floor(4294967296 / pool.length) * pool.length;
            do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
            idx = buf[0] % pool.length;
          } else {
            idx = Math.floor(Math.random() * pool.length);
          }
          picked.push(pool.splice(idx, 1)[0]);
        }
        out.textContent = '🎉 中选：' + picked.join('、') + (n > 1 ? '\n（共 ' + n + ' 名，不重复）' : '');
      };
    },
  });

  /* ============ 团队分组 ============ */
  TB.registerCustom('group', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="ft-field"><label>名单（每行一项）</label><textarea class="fp-textarea gr-in" placeholder="一人一行"></textarea></div>' +
        '<div class="fp-row" style="margin-bottom:12px">' +
        '<span class="fp-hint">分成 <input class="fp-input gr-n" type="number" value="3" min="2" style="width:80px"> 组</span>' +
        '<button class="fp-btn primary gr-go" data-primary="1">分组</button></div>' +
        '<div class="fp-result gr-out">…</div></div>';
    },
    init: function (root) {
      q(root, '.gr-go').onclick = function () {
        const items = q(root, '.gr-in').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        const n = parseInt(q(root, '.gr-n').value, 10) || 2;
        const out = q(root, '.gr-out');
        if (items.length < n) { out.textContent = '人数少于组数啦'; return; }
        for (let i = items.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const t = items[i]; items[i] = items[j]; items[j] = t;
        }
        const groups = [];
        for (let i = 0; i < n; i++) groups.push([]);
        items.forEach(function (name, i) { groups[i % n].push(name); });
        out.textContent = groups.map(function (g, i) {
          return '第 ' + (i + 1) + ' 组（' + g.length + ' 人）：' + g.join('、');
        }).join('\n');
      };
    },
  });

  /* ============ 随机配色 ============ */
  TB.registerCustom('palette', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:14px">' +
        '<select class="fp-select pl-scheme" style="width:150px">' +
        '<option value="analog">邻近色</option><option value="triad">三角对立</option><option value="comp">互补色</option><option value="random">随心随机</option></select>' +
        '<button class="fp-btn primary pl-go" data-primary="1">生成配色</button>' +
        '<span class="fp-hint">点击色块复制 HEX</span></div>' +
        '<div class="fp-row pl-out"></div></div>';
    },
    init: function (root) {
      const out = q(root, '.pl-out');
      function hsl2hex(h, s, l) {
        s /= 100; l /= 100;
        const k = function (n) { return (n + h / 30) % 12; };
        const a = s * Math.min(l, 1 - l);
        const f = function (n) {
          const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
          return Math.round(255 * c).toString(16).padStart(2, '0');
        };
        return ('#' + f(0) + f(8) + f(4)).toUpperCase();
      }
      q(root, '.pl-go').onclick = function () {
        const scheme = q(root, '.pl-scheme').value;
        const baseH = Math.floor(Math.random() * 360);
        const s = 55 + Math.floor(Math.random() * 30);
        let hues;
        if (scheme === 'analog') hues = [baseH - 30, baseH, baseH + 30, baseH + 15, baseH - 15];
        else if (scheme === 'triad') hues = [baseH, baseH + 120, baseH + 240, baseH + 60, baseH + 300];
        else if (scheme === 'comp') hues = [baseH, baseH + 180, baseH + 20, baseH + 200, baseH - 20];
        else hues = hues = [0, 1, 2, 3, 4].map(function () { return Math.floor(Math.random() * 360); });
        const lights = [72, 60, 48, 36, 26];
        out.innerHTML = '';
        hues.forEach(function (h, i) {
          const hex = hsl2hex((h + 360) % 360, s, lights[i]);
          const chip = document.createElement('div');
          chip.style.cssText = 'flex:1;min-width:90px;height:72px;border-radius:10px;cursor:pointer;display:flex;align-items:flex-end;justify-content:center;color:#fff;font-size:0.78em;padding-bottom:6px;text-shadow:0 1px 2px rgba(0,0,0,.4);background:' + hex;
          chip.textContent = hex;
          chip.onclick = function () { TB.copy(hex, '已复制 ' + hex); };
          out.appendChild(chip);
        });
      };
      q(root, '.pl-go').click();
    },
  });

  /* ============ URL 参数解析 ============ */
  TB.registerCustom('urlparam', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="ft-field"><label>粘贴完整 URL 或查询串（?a=1&b=2）</label>' +
        '<textarea class="fp-textarea up-in" placeholder="https://example.com/page?name=Lifeline&tag=%E5%89%8D%E7%AB%AF&page=2"></textarea></div>' +
        '<div class="fp-row" style="margin:10px 0"><button class="fp-btn primary up-go" data-primary="1">解析</button>' +
        '<button class="fp-btn up-json">复制为 JSON</button><span class="fp-hint up-n"></span></div>' +
        '<div class="tb-table-wrap"><table class="tb-table"><thead><tr><th>参数</th><th>值（已解码）</th><th>原始值</th></tr></thead><tbody class="up-body"></tbody></table></div>' +
        '</div>';
    },
    init: function (root) {
      const input = q(root, '.up-in'), body = q(root, '.up-body'), n = q(root, '.up-n');
      let rows = [];
      function parse() {
        let raw = input.value.trim();
        body.innerHTML = ''; rows = [];
        if (!raw) { n.textContent = ''; return; }
        let qs = raw;
        const qi = raw.indexOf('?');
        if (qi > -1) qs = raw.slice(qi + 1);
        else if (raw.indexOf('=') === -1) { n.textContent = '没有找到查询参数'; return; }
        qs.split('#')[0].split('&').forEach(function (pair) {
          if (!pair) return;
          const eq = pair.indexOf('=');
          const k = eq === -1 ? pair : pair.slice(0, eq);
          const v = eq === -1 ? '' : pair.slice(eq + 1);
          let dec = v, decOk = true;
          try { dec = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { decOk = false; }
          rows.push([k, decOk ? dec : v + '（解码失败）', v]);
        });
        n.textContent = rows.length + ' 个参数';
        body.innerHTML = rows.map(function (r) {
          return '<tr><td><b>' + TB.esc(r[0]) + '</b></td><td>' + TB.esc(r[1]) + '</td><td class="fp-hint">' + TB.esc(r[2]) + '</td></tr>';
        }).join('') || '<tr><td colspan="3" class="fp-hint">没有参数</td></tr>';
        body.querySelectorAll('tr').forEach(function (tr) {
          tr.onclick = function () { const t = tr.querySelectorAll('td'); if (t.length > 1) TB.copy(t[1].textContent, '已复制值'); };
        });
      }
      q(root, '.up-go').onclick = parse;
      q(root, '.up-json').onclick = function () {
        if (!rows.length) { TB.toast('先解析出参数'); return; }
        const obj = {};
        rows.forEach(function (r) { obj[r[0]] = r[1]; });
        TB.copy(JSON.stringify(obj, null, 2), '已复制 JSON');
      };
      let t = null;
      input.oninput = function () { clearTimeout(t); t = setTimeout(parse, 400); };
    },
  });

  /* ============ Mock 数据生成 ============ */
  TB.registerCustom('mock', {
    render: function () {
      const fields = [['姓名', 'name', 1], ['手机号', 'phone', 1], ['邮箱', 'email', 1], ['性别', 'gender', 1], ['生日', 'birthday', 1], ['地址', 'address', 1], ['IP', 'ip', 1], ['公司', 'company', 1]];
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:10px;flex-wrap:wrap;gap:6px">' +
        '<span class="fp-hint">字段：</span>' +
        fields.map(function (f, i) {
          return '<label class="fp-hint"><input type="checkbox" class="mk-f" value="' + f[1] + '"' + (i < 4 ? ' checked' : '') + '> ' + f[0] + '</label>';
        }).join('') + '</div>' +
        '<div class="fp-row" style="margin-bottom:10px">' +
        '<label class="fp-hint">条数 <input type="number" class="fp-input mk-n" value="5" min="1" max="50" style="width:80px"></label>' +
        '<label class="fp-hint">格式 <select class="fp-select mk-fmt" style="width:auto"><option value="json">JSON</option><option value="tsv">表格(TSV)</option></select></label>' +
        '<button class="fp-btn primary mk-go" data-primary="1">生成</button>' +
        '<button class="fp-btn mk-copy">复制结果</button></div>' +
        '<div class="fp-result fp-code mk-out">点击「生成」</div></div>';
    },
    init: function (root) {
      const out = q(root, '.mk-out');
      const SURNAMES = '李王张刘陈杨黄赵吴周徐孙马朱胡郭何林罗高郑梁谢宋唐许韩冯邓曹彭曾肖田董潘袁蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤';
      const GIVEN_M = ['浩宇', '子轩', '俊杰', '宇航', '博文', '天佑', '志强', '明轩', '瑞霖', '嘉懿', '思远', '凯文', '泽洋', '鸿涛', '建国', '建军', '志远', '文博', '一鸣', '皓轩', '伟', '强', '磊', '军', '洋', '勇', '杰', '涛', '斌', '鹏', '旭', '晨', '岩', '哲'];
      const GIVEN_F = ['欣怡', '梓萱', '语嫣', '若曦', '雨桐', '梦琪', '雅静', '晓萱', '诗涵', '佳琪', '思颖', '雪莉', '安妮', '慧娴', '玉兰', '丽华', '秀英', '桂芳', '静', '丽', '娜', '敏', '芳', '燕', '婷', '玲', '雪', '洁', '琳', '薇'];
      const CITIES = ['北京市朝阳区', '上海市浦东新区', '广州市天河区', '深圳市南山区', '杭州市西湖区', '成都市武侯区', '武汉市洪山区', '南京市鼓楼区', '郑州市金水区', '西安市雁塔区', '重庆市渝北区', '长沙市岳麓区'];
      const ROADS = ['中山路', '人民路', '建设路', '文化路', '花园路', '科技路', '创新大道', '平安街', '康乐街', '望江路'];
      const IND = ['科技', '网络', '信息', '教育', '文化', '贸易', '实业', '医疗', '传媒', '智能'];
      const CORP = ['云联', '启明', '华创', '瑞丰', '天成', '博远', '智联', '卓航', '星河', '恒信'];
      function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
      function pickName(gender) {
        const s = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
        const pool = gender === '男' ? GIVEN_M : gender === '女' ? GIVEN_F : (Math.random() < 0.5 ? GIVEN_M : GIVEN_F);
        return s + rnd(pool);
      }
      function make(idx, fields) {
        const g = Math.random() < 0.5 ? '男' : '女';
        const name = pickName(g);
        const py = 'u' + Math.floor(Math.random() * 9000 + 1000);
        const o = {};
        fields.forEach(function (f) {
          if (f === 'name') o.name = name;
          else if (f === 'gender') o.gender = g;
          else if (f === 'phone') o.phone = rnd(['133', '135', '136', '137', '138', '150', '152', '155', '157', '158', '166', '176', '180', '182', '185', '188', '199']) + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
          else if (f === 'email') o.email = 'user' + py + idx + '@' + rnd(['qq.com', '163.com', '126.com', 'gmail.com', 'outlook.com']);
          else if (f === 'birthday') o.birthday = (1970 + Math.floor(Math.random() * 35)) + '-' + String(1 + Math.floor(Math.random() * 12)).padStart(2, '0') + '-' + String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
          else if (f === 'address') o.address = rnd(CITIES) + rnd(ROADS) + (1 + Math.floor(Math.random() * 299)) + '号';
          else if (f === 'ip') o.ip = [10, 172, 192][Math.floor(Math.random() * 3)] === 10 ? '10.' + Math.floor(Math.random() * 255) + '.' + Math.floor(Math.random() * 255) + '.' + (1 + Math.floor(Math.random() * 253)) : '192.168.' + Math.floor(Math.random() * 255) + '.' + (1 + Math.floor(Math.random() * 253));
          else if (f === 'company') o.company = rnd(CITIES).slice(0, 2) + rnd(CORP) + rnd(IND) + '有限公司';
        });
        return o;
      }
      q(root, '.mk-go').onclick = function () {
        const fields = qa(root, '.mk-f:checked').map(function (c) { return c.value; });
        if (!fields.length) { TB.toast('至少勾选一个字段'); return; }
        const n = Math.min(50, Math.max(1, parseInt(q(root, '.mk-n').value, 10) || 5));
        const fmt = q(root, '.mk-fmt').value;
        const list = [];
        for (let i = 0; i < n; i++) list.push(make(i + 1, fields));
        out.textContent = fmt === 'json'
          ? JSON.stringify(list, null, 2)
          : [fields.join('\t')].concat(list.map(function (o) { return fields.map(function (f) { return o[f]; }).join('\t'); })).join('\n');
      };
      q(root, '.mk-copy').onclick = function () { if (out.textContent !== '点击「生成」') TB.copy(out.textContent, '已复制', out); };
    },
  });

  /* ============ 贷款计算 ============ */
  TB.registerCustom('loan', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">' +
        '<label class="fp-hint">贷款额(万)<input type="number" class="fp-input ln-p" value="50" style="width:90px"></label>' +
        '<label class="fp-hint">年利率(%)<input type="number" class="fp-input ln-r" value="3.6" step="0.05" style="width:90px"></label>' +
        '<label class="fp-hint">年限<input type="number" class="fp-input ln-y" value="30" style="width:70px"></label>' +
        '<label class="fp-hint">方式<select class="fp-select ln-m" style="width:auto"><option value="ax">等额本息</option><option value="bj">等额本金</option></select></label>' +
        '<button class="fp-btn primary ln-go" data-primary="1">计算</button></div>' +
        '<div class="fp-result fp-code ln-out">等待计算</div></div>';
    },
    init: function (root) {
      function fmtW(v) { return (v / 10000).toFixed(2) + ' 万元'; }
      function run() {
        const P = (parseFloat(q(root, '.ln-p').value) || 0) * 10000;
        const r = (parseFloat(q(root, '.ln-r').value) || 0) / 100 / 12;
        const n = Math.round((parseFloat(q(root, '.ln-y').value) || 0) * 12);
        const m = q(root, '.ln-m').value;
        if (P <= 0 || n <= 0 || r < 0) { q(root, '.ln-out').textContent = '请填写有效参数'; return; }
        let lines = [];
        if (m === 'ax') {
          const pow = Math.pow(1 + r, n);
          const M = r === 0 ? P / n : P * r * pow / (pow - 1);
          const total = M * n;
          lines.push('每月还款：' + M.toFixed(2) + ' 元');
          lines.push('还款总额：' + fmtW(total));
          lines.push('支付利息：' + fmtW(total - P) + '（占本金 ' + ((total - P) / P * 100).toFixed(1) + '%）');
        } else {
          const base = P / n;
          const first = base + P * r;
          const last = base + base * r;
          const interest = P * r * (n + 1) / 2;
          lines.push('首月还款：' + first.toFixed(2) + ' 元');
          lines.push('末月还款：' + last.toFixed(2) + ' 元');
          lines.push('每月递减：' + (base * r).toFixed(2) + ' 元');
          lines.push('还款总额：' + fmtW(P + interest));
          lines.push('支付利息：' + fmtW(interest) + '（占本金 ' + (interest / P * 100).toFixed(1) + '%）');
        }
        q(root, '.ln-out').innerHTML = lines.map(function (l) { return '<div>' + TB.esc(l) + '</div>'; }).join('');
      }
      q(root, '.ln-go').onclick = run;
      run();
    },
  });

  /* ============ 折扣比价 ============ */
  TB.registerCustom('discount', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">' +
        '<label class="fp-hint">单价(元)<input type="number" class="fp-input dc-p" value="99" style="width:90px"></label>' +
        '<label class="fp-hint">数量<input type="number" class="fp-input dc-n" value="3" min="1" style="width:70px"></label>' +
        '</div>' +
        '<div class="fp-row" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">' +
        '<label class="fp-hint">折扣<input type="number" class="fp-input dc-d" value="85" min="1" max="99" style="width:70px">（85 = 85 折）</label>' +
        '<label class="fp-hint">满减 满<input type="number" class="fp-input dc-s" value="200" style="width:80px">减<input type="number" class="fp-input dc-j" value="30" style="width:70px"></label>' +
        '<label class="fp-hint">第 N 件<select class="fp-select dc-half" style="width:auto"><option value="2">第 2 件半价</option><option value="3">第 3 件 0 元</option></select></label>' +
        '<button class="fp-btn primary dc-go" data-primary="1">比一比</button></div>' +
        '<div class="fp-result dc-out">等待计算</div></div>';
    },
    init: function (root) {
      function run() {
        const p = parseFloat(q(root, '.dc-p').value) || 0;
        const n = Math.max(1, Math.round(parseFloat(q(root, '.dc-n').value) || 1));
        const d = Math.min(99, Math.max(1, parseFloat(q(root, '.dc-d').value) || 100)) / 100;
        const s = parseFloat(q(root, '.dc-s').value) || 0;
        const j = parseFloat(q(root, '.dc-j').value) || 0;
        const halfAt = parseInt(q(root, '.dc-half').value, 10);
        if (p <= 0) { q(root, '.dc-out').textContent = '请填写单价'; return; }
        const base = p * n;
        const list = [
          { name: '不打折', pay: base },
          { name: d * 10 + ' 折', pay: base * d },
          { name: '满 ' + s + ' 减 ' + j, pay: base - (s > 0 ? Math.floor(base / s) * j : 0) },
          { name: halfAt === 2 ? '第 2 件半价' : '第 3 件 0 元', pay: halfAt === 2 ? base - Math.floor(n / 2) * p * 0.5 : base - Math.floor(n / 3) * p },
        ];
        const best = Math.min.apply(null, list.map(function (x) { return x.pay; }));
        q(root, '.dc-out').innerHTML = '<table class="tb-table"><thead><tr><th>方案</th><th>应付</th><th>折合每件</th><th>省</th></tr></thead><tbody>' +
          list.map(function (x) {
            const star = x.pay === best && best < base;
            return '<tr style="' + (star ? 'background:var(--anzhiyu-secondbg)' : '') + '"><td>' + TB.esc(x.name) + (star ? ' ← 最优' : '') + '</td><td>' + x.pay.toFixed(2) + ' 元</td><td>' + (x.pay / n).toFixed(2) + ' 元</td><td>' + (base - x.pay).toFixed(2) + ' 元</td></tr>';
          }).join('') + '</tbody></table>';
      }
      q(root, '.dc-go').onclick = run;
      run();
    },
  });

  /* ============ 科学计算器 ============ */
  TB.registerCustom('scalc', {
    render: function () {
      const keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '^', '='];
      const fns = ['sin', 'cos', 'tan', 'sqrt', 'ln', 'log', 'pi', 'e'];
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:10px">' +
        '<input class="fp-input sc-in" style="flex:1;min-width:200px;font-family:monospace" placeholder="如 (3+4)×sin(pi/2) 或 2^10">' +
        '<label class="fp-hint"><input type="checkbox" class="sc-deg" checked> 三角函数用角度</label>' +
        '<button class="fp-btn primary sc-go" data-primary="1">=</button></div>' +
        '<div class="fp-row" style="margin-bottom:10px;flex-wrap:wrap;gap:6px">' +
        fns.map(function (f) { return '<button class="fp-btn sc-k" data-k="' + f + '(">' + f + '</button>'; }).join('') +
        '<button class="fp-btn sc-k" data-k="ans">ans</button></div>' +
        '<div class="sc-pad" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-width:380px">' +
        keys.map(function (k) {
          const kw = k === '=' ? ' primary' : '';
          return '<button class="fp-btn sc-k' + kw + '" data-k="' + TB.esc(k) + '" style="padding:10px 0">' + TB.esc(k) + '</button>';
        }).join('') + '</div>' +
        '<div class="fp-result fp-code sc-out" style="margin-top:12px">输入算式后按 = 或 Ctrl+Enter</div></div>';
    },
    init: function (root) {
      const input = q(root, '.sc-in'), out = q(root, '.sc-out');
      let ans = 0;
      function tokenize(s) {
        const re = /\s*(\d+\.?\d*(?:[eE][+-]?\d+)?|[a-zA-Z]+|[+\-*/%^(),])/y;
        const toks = []; let m;
        while ((m = re.exec(s))) { toks.push(m[1]); if (re.lastIndex >= s.length) break; }
        if (re.lastIndex < s.length) throw new Error('无法识别的字符：' + s[re.lastIndex]);
        return toks;
      }
      function evaluate(toks, deg) {
        let pos = 0;
        const peek = function () { return toks[pos]; };
        function expr() {
          let v = term();
          while (peek() === '+' || peek() === '-') { const op = toks[pos++]; v = op === '+' ? v + term() : v - term(); }
          return v;
        }
        function term() {
          let v = unary();
          while (peek() === '*' || peek() === '/' || peek() === '%') {
            const op = toks[pos++];
            const rhs = unary();
            if (op === '*') v *= rhs; else if (op === '/') { if (rhs === 0) throw new Error('除数不能为 0'); v /= rhs; } else v %= rhs;
          }
          return v;
        }
        function unary() {
          if (peek() === '-') { pos++; return -unary(); }
          if (peek() === '+') { pos++; return unary(); }
          return power();
        }
        function power() {
          const base = primary();
          if (peek() === '^') { pos++; return Math.pow(base, unary()); }
          return base;
        }
        function primary() {
          const t = peek();
          if (t === undefined) throw new Error('算式不完整');
          pos++;
          if (/^\d/.test(t)) return parseFloat(t);
          if (t === '(') { const v = expr(); if (peek() !== ')') throw new Error('缺少右括号'); pos++; return v; }
          if (/^[a-zA-Z]+$/.test(t)) {
            const F = {
              sin: Math.sin, cos: Math.cos, tan: Math.tan,
              asin: Math.asin, acos: Math.acos, atan: Math.atan,
              sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
              ln: Math.log, log: Math.log10, exp: Math.exp,
              round: Math.round, floor: Math.floor, ceil: Math.ceil,
              pi: Math.PI, e: Math.E, ans: ans,
            };
            const f = F[t.toLowerCase()];
            if (f === undefined) throw new Error('不认识：' + t);
            if (peek() === '(') {
              pos++;
              const args = [expr()];
              while (peek() === ',') { pos++; args.push(expr()); }
              if (peek() !== ')') throw new Error('缺少右括号');
              pos++;
              if (typeof f !== 'function') throw new Error(t + ' 不是函数');
              const toRad = deg && ['sin', 'cos', 'tan'].indexOf(t.toLowerCase()) > -1;
              const fromRad = deg && ['asin', 'acos', 'atan'].indexOf(t.toLowerCase()) > -1;
              const av = args.map(function (x) { return toRad ? x * Math.PI / 180 : x; });
              const r = f.apply(null, av);
              return fromRad ? r * 180 / Math.PI : r;
            }
            if (typeof f !== 'function') return f; // 常量
            throw new Error(t + ' 需要括号，如 ' + t + '(x)');
          }
          throw new Error('意外的符号：' + t);
        }
        const v = expr();
        if (pos < toks.length) throw new Error('多余的符号：' + toks[pos]);
        return v;
      }
      function run() {
        const s = input.value.trim();
        if (!s) return;
        if (!/^[0-9a-zA-Z+\-*/%^().,\s]+$/.test(s)) { out.textContent = '含有不支持的字符'; return; }
        try {
          const v = evaluate(tokenize(s), q(root, '.sc-deg').checked);
          if (typeof v !== 'number' || isNaN(v)) throw new Error('结果不是有效数字');
          ans = v;
          out.textContent = String(Number(v.toPrecision(12)));
        } catch (e) { out.textContent = '算式有误：' + e.message; }
      }
      q(root, '.sc-go').onclick = run;
      qa(root, '.sc-k').forEach(function (b) {
        b.onclick = function () {
          const k = b.dataset.k;
          if (k === 'C') { input.value = ''; out.textContent = '已清空'; return; }
          if (k === '=') { run(); return; }
          input.value += k;
          input.focus();
        };
      });
      input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); run(); } };
    },
  });

  /* ============ BMR 热量 ============ */
  TB.registerCustom('bmr', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">' +
        '<label class="fp-hint">性别<select class="fp-select bm-g" style="width:auto"><option value="m">男</option><option value="f">女</option></select></label>' +
        '<label class="fp-hint">年龄<input type="number" class="fp-input bm-a" value="20" style="width:70px"></label>' +
        '<label class="fp-hint">身高(cm)<input type="number" class="fp-input bm-h" value="172" style="width:80px"></label>' +
        '<label class="fp-hint">体重(kg)<input type="number" class="fp-input bm-w" value="62" style="width:80px"></label>' +
        '<label class="fp-hint">活动量<select class="fp-select bm-act" style="width:auto">' +
        '<option value="1.2">久坐不动</option><option value="1.375">每周轻量 1-3 次</option>' +
        '<option value="1.55" selected>每周中度 3-5 次</option><option value="1.725">高强度 6-7 次</option><option value="1.9">体力劳动/一天两练</option></select></label>' +
        '<button class="fp-btn primary bm-go" data-primary="1">计算</button></div>' +
        '<div class="fp-result fp-code bm-out">等待计算</div>' +
        '<p class="fp-hint" style="margin:10px 0 0">采用 Mifflin-St Jeor 公式（目前公认较准）；结果为估算值，仅供参考。</p></div>';
    },
    init: function (root) {
      function run() {
        const g = q(root, '.bm-g').value, a = parseFloat(q(root, '.bm-a').value), h = parseFloat(q(root, '.bm-h').value), w = parseFloat(q(root, '.bm-w').value);
        if (!(a > 0 && h > 0 && w > 0)) { q(root, '.bm-out').textContent = '请填写有效数据'; return; }
        const bmr = Math.round(10 * w + 6.25 * h - 5 * a + (g === 'm' ? 5 : -161));
        const tdee = Math.round(bmr * parseFloat(q(root, '.bm-act').value));
        const bmi = (w / Math.pow(h / 100, 2)).toFixed(1);
        q(root, '.bm-out').innerHTML = [
          '基础代谢 BMR：' + bmr + ' 千卡/天',
          '每日总消耗 TDEE：' + tdee + ' 千卡/天',
          '减脂建议摄入：' + (tdee - 500) + ' ～ ' + (tdee - 300) + ' 千卡/天',
          '增肌建议摄入：' + (tdee + 200) + ' ～ ' + (tdee + 400) + ' 千卡/天',
          '当前 BMI：' + bmi + (bmi < 18.5 ? '（偏瘦）' : bmi < 24 ? '（正常）' : bmi < 28 ? '（偏胖）' : '（肥胖）'),
        ].map(function (l) { return '<div>' + TB.esc(l) + '</div>'; }).join('');
      }
      q(root, '.bm-go').onclick = run;
      run();
    },
  });

  /* ============ 几何计算 ============ */
  TB.registerCustom('geometry', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">' +
        '<label class="fp-hint">形状<select class="fp-select ge-shape" style="width:auto">' +
        '<option value="circle">圆</option><option value="rect">矩形</option><option value="tri">三角形(三边)</option>' +
        '<option value="trap">梯形</option><option value="cyl">圆柱</option></select></label>' +
        '<span class="ge-inputs fp-row" style="gap:10px;flex-wrap:wrap"></span>' +
        '<button class="fp-btn primary ge-go" data-primary="1">计算</button></div>' +
        '<div class="fp-result fp-code ge-out">等待计算</div></div>';
    },
    init: function (root) {
      const FIELDS = {
        circle: [['r', '半径 r']],
        rect: [['w', '宽 w'], ['h', '高 h']],
        tri: [['a', '边 a'], ['b', '边 b'], ['c', '边 c']],
        trap: [['a', '上底 a'], ['b', '下底 b'], ['h', '高 h']],
        cyl: [['r', '半径 r'], ['h', '高 h']],
      };
      const box = q(root, '.ge-inputs'), shapeSel = q(root, '.ge-shape'), out = q(root, '.ge-out');
      function renderInputs() {
        box.innerHTML = FIELDS[shapeSel.value].map(function (f) {
          return '<label class="fp-hint">' + f[1] + '<input type="number" class="fp-input ge-v" data-k="' + f[0] + '" style="width:80px"></label>';
        }).join('');
      }
      shapeSel.onchange = function () { renderInputs(); out.textContent = '等待计算'; };
      renderInputs();
      q(root, '.ge-go').onclick = function () {
        const v = {};
        qa(root, '.ge-v').forEach(function (i) { v[i.dataset.k] = parseFloat(i.value); });
        const bad = FIELDS[shapeSel.value].some(function (f) { return !(v[f[0]] > 0); });
        if (bad) { out.textContent = '请填写所有边长/尺寸（需大于 0）'; return; }
        const s = shapeSel.value;
        let lines = [];
        const fx = function (x) { return Number(x.toFixed(4)); };
        if (s === 'circle') {
          lines.push('面积：' + fx(Math.PI * v.r * v.r));
          lines.push('周长：' + fx(2 * Math.PI * v.r));
          lines.push('直径：' + fx(2 * v.r));
        } else if (s === 'rect') {
          lines.push('面积：' + fx(v.w * v.h));
          lines.push('周长：' + fx(2 * (v.w + v.h)));
          lines.push('对角线：' + fx(Math.hypot(v.w, v.h)));
        } else if (s === 'tri') {
          if (v.a + v.b <= v.c || v.a + v.c <= v.b || v.b + v.c <= v.a) { out.textContent = '这三条边构不成三角形'; return; }
          const p = (v.a + v.b + v.c) / 2;
          lines.push('面积（海伦公式）：' + fx(Math.sqrt(p * (p - v.a) * (p - v.b) * (p - v.c))));
          lines.push('周长：' + fx(v.a + v.b + v.c));
        } else if (s === 'trap') {
          lines.push('面积：' + fx((v.a + v.b) * v.h / 2));
        } else if (s === 'cyl') {
          lines.push('体积：' + fx(Math.PI * v.r * v.r * v.h));
          lines.push('侧面积：' + fx(2 * Math.PI * v.r * v.h));
          lines.push('全面积：' + fx(2 * Math.PI * v.r * (v.r + v.h)));
        }
        out.innerHTML = lines.map(function (l) { return '<div>' + TB.esc(l) + '</div>'; }).join('');
      };
    },
  });

  /* ============ 随机中文姓名 ============ */
  TB.registerCustom('cname', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">' +
        '<label class="fp-hint">风格<select class="fp-select cn-g" style="width:auto"><option value="any">不限</option><option value="m">偏男生</option><option value="f">偏女生</option></select></label>' +
        '<label class="fp-hint">数量<input type="number" class="fp-input cn-n" value="8" min="1" max="30" style="width:70px"></label>' +
        '<button class="fp-btn primary cn-go" data-primary="1">换一批</button>' +
        '<button class="fp-btn cn-copy">复制全部</button></div>' +
        '<div class="cn-out fp-row" style="gap:10px;flex-wrap:wrap"></div></div>';
    },
    init: function (root) {
      const SURNAMES = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何林罗高郑梁谢宋唐许韩冯邓曹彭曾肖田董潘袁蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤'.split('');
      const M = ['浩宇', '子轩', '俊杰', '宇航', '博文', '天佑', '志远', '明轩', '瑞霖', '嘉懿', '思远', '泽洋', '鸿涛', '文博', '一鸣', '皓轩', '逸尘', '景行', '云舟', '砚青', '亦辰', '沐阳', '止戈', '既白'];
      const F = ['欣怡', '梓萱', '语嫣', '若曦', '雨桐', '梦琪', '雅静', '晓萱', '诗涵', '佳琪', '思颖', '雪莉', '知夏', '清婉', '映棠', '疏影', '鹿鸣', '南乔', '念安', '初晴', '婉宁', '锦书', '语汐', '攸宁'];
      const N = ['知行', '望舒', '清和', '砚知', '慕言', '亦安', '听澜', '予安', '之恒', '静水', '明澈', '问渠', '昭然', '锦时'];
      const out = q(root, '.cn-out');
      let last = [];
      function run() {
        const g = q(root, '.cn-g').value;
        const n = Math.min(30, Math.max(1, parseInt(q(root, '.cn-n').value, 10) || 8));
        last = [];
        for (let i = 0; i < n; i++) {
          const s = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
          const pool = g === 'm' ? M : g === 'f' ? F : (Math.random() < 0.4 ? N : Math.random() < 0.5 ? M : F);
          last.push(s + pool[Math.floor(Math.random() * pool.length)]);
        }
        out.innerHTML = last.map(function (name) {
          return '<button class="fp-btn cn-item" style="min-width:110px;justify-content:center">' + TB.esc(name) + '</button>';
        }).join('');
        out.querySelectorAll('.cn-item').forEach(function (b) {
          b.onclick = function () { TB.copy(b.textContent, '已复制 ' + b.textContent, b); };
        });
      }
      q(root, '.cn-go').onclick = run;
      q(root, '.cn-copy').onclick = function () { if (last.length) TB.copy(last.join('\n'), '已复制全部'); };
      run();
    },
  });

  /* ============ 今天吃什么 ============ */
  TB.registerCustom('eat', {
    render: function () {
      return '<div class="fp-card" style="text-align:center;padding:30px 20px">' +
        '<div class="fp-row" style="justify-content:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">' +
        '<button class="fp-btn et-cat active" data-c="all">随便</button>' +
        '<button class="fp-btn et-cat" data-c="staple">主食</button>' +
        '<button class="fp-btn et-cat" data-c="noodle">面食</button>' +
        '<button class="fp-btn et-cat" data-c="fast">快餐</button>' +
        '<button class="fp-btn et-cat" data-c="spicy">重口味</button></div>' +
        '<div class="et-name" style="font-size:2em;font-weight:700;color:var(--anzhiyu-theme);min-height:1.4em">…</div>' +
        '<div class="fp-hint et-sub" style="margin:6px 0 16px">选择分类，然后摇一摇</div>' +
        '<button class="fp-btn primary et-go" data-primary="1" style="padding:12px 40px;font-size:1.1em">今天吃什么</button></div>';
    },
    init: function (root) {
      const FOODS = {
        staple: ['黄焖鸡米饭', '猪脚饭', '蛋炒饭', '咖喱鸡饭', '台式卤肉饭', '牛肉盖浇饭', '梅菜扣肉饭', '糖醋里脊饭', '饺子', '生煎包', '砂锅粥', '糯米鸡'],
        noodle: ['兰州拉面', '重庆小面', '武汉热干面', '山西刀削面', '河南烩面', '油泼面', '螺蛳粉', '桂林米粉', '肥肠粉', '云吞面', '炸酱面', '酸辣粉'],
        fast: ['汉堡炸鸡', '披萨', '三明治', '寿司', '饭团', '沙县小吃', '麦当劳', '肯德基', '塔斯汀', '便利店便当', '轻食沙拉'],
        spicy: ['麻辣烫', '麻辣香锅', '火锅', '冒菜', '钵钵鸡', '辣子鸡', '水煮鱼', '麻婆豆腐', '酸汤肥牛', '湘菜小炒', '烤鱼', '螺蛳粉'],
      };
      FOODS.all = [].concat(FOODS.staple, FOODS.noodle, FOODS.fast, FOODS.spicy);
      let cat = 'all', rolling = null;
      const nameEl = q(root, '.et-name'), sub = q(root, '.et-sub');
      qa(root, '.et-cat').forEach(function (b) {
        b.onclick = function () {
          cat = b.dataset.c;
          qa(root, '.et-cat').forEach(function (x) { x.classList.toggle('active', x === b); });
        };
      });
      q(root, '.et-go').onclick = function () {
        if (rolling) return;
        const pool = FOODS[cat];
        let i = 0;
        rolling = setInterval(function () {
          nameEl.textContent = pool[Math.floor(Math.random() * pool.length)];
          if (++i > 14) {
            clearInterval(rolling); rolling = null;
            const final = pool[Math.floor(Math.random() * pool.length)];
            nameEl.textContent = final;
            sub.textContent = '就它了 —— ' + final + '！不满意的点 5 分钟后再摇';
          }
        }, 70);
      };
    },
  });

  /* ============ 渐变生成 ============ */
  TB.registerCustom('gradient', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">' +
        '<label class="fp-hint">类型<select class="fp-select gr-type" style="width:auto"><option value="linear">线性</option><option value="radial">径向</option></select></label>' +
        '<label class="fp-hint">角度<input type="range" class="gr-ang" min="0" max="360" value="135" style="vertical-align:middle"> <b class="gr-angv">135°</b></label>' +
        '<label class="fp-hint">色 1 <input type="color" class="gr-c1" value="#425aef"></label>' +
        '<label class="fp-hint">色 2 <input type="color" class="gr-c2" value="#9b6cff"></label>' +
        '<label class="fp-hint"><input type="checkbox" class="gr-en3"> 色 3</label>' +
        '<input type="color" class="gr-c3" value="#ff7eb3" disabled>' +
        '</div>' +
        '<div class="gr-view" style="height:150px;border-radius:12px;margin-bottom:12px"></div>' +
        '<div class="fp-row"><button class="fp-btn primary gr-copy" data-primary="1">复制 CSS</button>' +
        '<span class="fp-hint gr-css" style="font-family:monospace"></span></div></div>';
    },
    init: function (root) {
      const type = q(root, '.gr-type'), ang = q(root, '.gr-ang'), angv = q(root, '.gr-angv');
      const c1 = q(root, '.gr-c1'), c2 = q(root, '.gr-c2'), c3 = q(root, '.gr-c3'), en3 = q(root, '.gr-en3');
      const view = q(root, '.gr-view'), cssEl = q(root, '.gr-css');
      function css() {
        const stops = en3.checked ? c1.value + ', ' + c2.value + ', ' + c3.value : c1.value + ', ' + c2.value;
        return type.value === 'linear'
          ? 'linear-gradient(' + ang.value + 'deg, ' + stops + ')'
          : 'radial-gradient(circle at center, ' + stops + ')';
      }
      function run() {
        angv.textContent = ang.value + '°';
        c3.disabled = !en3.checked;
        const c = css();
        view.style.background = c;
        cssEl.textContent = 'background-image: ' + c + ';';
      }
      [type, ang, c1, c2, c3, en3].forEach(function (el) { el.oninput = run; el.onchange = run; });
      q(root, '.gr-copy').onclick = function () { TB.copy('background-image: ' + css() + ';', 'CSS 已复制'); };
      run();
    },
  });

  /* ============ Box-Shadow 生成 ============ */
  TB.registerCustom('boxshadow', {
    render: function () {
      function slider(k, label, min, max, val) {
        return '<label class="fp-hint" style="display:flex;align-items:center;gap:6px">' + label +
          '<input type="range" class="bs-r" data-k="' + k + '" min="' + min + '" max="' + max + '" value="' + val + '" style="width:140px;vertical-align:middle">' +
          '<b class="bs-v" data-v="' + k + '" style="min-width:34px;display:inline-block">' + val + '</b></label>';
      }
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">' +
        slider('x', 'X 偏移', -50, 50, 0) + slider('y', 'Y 偏移', -50, 50, 8) +
        slider('blur', '模糊', 0, 100, 24) + slider('spread', '扩散', -50, 50, 0) +
        '<label class="fp-hint">颜色 <input type="color" class="bs-c" value="rgba(66,90,239,0.35)" style="width:44px;height:32px;border:none;background:none;cursor:pointer;vertical-align:middle"></label>' +
        '<label class="fp-hint"><input type="checkbox" class="bs-inset"> inset</label></div>' +
        '<div class="fp-row" style="margin-bottom:12px;flex-wrap:wrap;gap:6px"><span class="fp-hint">预设：</span>' +
        '<button class="fp-btn bs-pre" data-p="0 8px 24px rgba(66,90,239,.35)">浮起</button>' +
        '<button class="fp-btn bs-pre" data-p="0 2px 8px rgba(0,0,0,.15)">卡片</button>' +
        '<button class="fp-btn bs-pre" data-p="inset 0 2px 6px rgba(0,0,0,.25)">内凹</button></div>' +
        '<div style="display:flex;justify-content:center;padding:26px;background:var(--anzhiyu-secondbg);border-radius:12px;margin-bottom:12px">' +
        '<div class="bs-view" style="width:150px;height:90px;border-radius:12px;background:var(--anzhiyu-card-bg)"></div></div>' +
        '<div class="fp-row"><button class="fp-btn primary bs-copy" data-primary="1">复制 CSS</button>' +
        '<span class="fp-hint bs-css" style="font-family:monospace"></span></div></div>';
    },
    init: function (root) {
      const view = q(root, '.bs-view'), cssEl = q(root, '.bs-css');
      function val(k) { return q(root, '.bs-r[data-k="' + k + '"]').value; }
      function css() {
        const c = q(root, '.bs-c').value;
        // 原生 color input 只给 hex；这里把 hex 转 rgba 并支持透明度
        let color = c;
        if (/^#[0-9a-f]{6}$/i.test(c)) {
          const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
          color = 'rgba(' + r + ',' + g + ',' + b + ',0.35)';
        }
        return (q(root, '.bs-inset').checked ? 'inset ' : '') + val('x') + 'px ' + val('y') + 'px ' + val('blur') + 'px ' + val('spread') + 'px ' + color;
      }
      function run() {
        qa(root, '.bs-r').forEach(function (r) { q(root, '.bs-v[data-v="' + r.dataset.k + '"]').textContent = r.value; });
        const c = css();
        view.style.boxShadow = c;
        cssEl.textContent = 'box-shadow: ' + c + ';';
      }
      qa(root, '.bs-r').forEach(function (r) { r.oninput = run; });
      q(root, '.bs-c').oninput = run;
      q(root, '.bs-inset').onchange = run;
      qa(root, '.bs-pre').forEach(function (b) {
        b.onclick = function () {
          const p = b.dataset.p;
          const m = p.match(/(-?\d+)px\s+(-?\d+)px\s+(\d+)px(?:\s+(-?\d+)px)?\s+(.+)$/);
          if (!m) { view.style.boxShadow = p; cssEl.textContent = 'box-shadow: ' + p + ';'; return; }
          q(root, '.bs-r[data-k="x"]').value = m[1];
          q(root, '.bs-r[data-k="y"]').value = m[2];
          q(root, '.bs-r[data-k="blur"]').value = m[3];
          q(root, '.bs-r[data-k="spread"]').value = m[4] || '0';
          q(root, '.bs-inset').checked = /inset/.test(p);
          run();
        };
      });
      q(root, '.bs-copy').onclick = function () { TB.copy('box-shadow: ' + css() + ';', 'CSS 已复制'); };
      run();
    },
  });

  /* ============ Favicon 生成 ============ */
  TB.registerCustom('favicon', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">' +
        '<label class="fp-hint">字符(1-2 个)<input type="text" class="fp-input fv-t" value="L" maxlength="2" style="width:70px"></label>' +
        '<label class="fp-hint">文字色 <input type="color" class="fv-fg" value="#ffffff" style="width:44px;height:32px;border:none;background:none;cursor:pointer;vertical-align:middle"></label>' +
        '<label class="fp-hint">背景色 <input type="color" class="fv-bg" value="#425aef" style="width:44px;height:32px;border:none;background:none;cursor:pointer;vertical-align:middle"></label>' +
        '<label class="fp-hint"><input type="checkbox" class="fv-round" checked> 圆角</label></div>' +
        '<div class="fp-row" style="margin-bottom:12px;align-items:flex-end">' +
        '<canvas class="fv-cv" width="128" height="128" style="border-radius:16px;box-shadow:var(--anzhiyu-shadow-black)"></canvas>' +
        '<div class="fp-row fv-dl" style="gap:6px;flex-wrap:wrap"></div></div>' +
        '<p class="fp-hint" style="margin:0">下载后放站点根目录，并在 head 里加：&lt;link rel="icon" href="/favicon-32.png"&gt;</p></div>';
    },
    init: function (root) {
      const cv = q(root, '.fv-cv'), ctx = cv.getContext('2d');
      function draw() {
        const t = q(root, '.fv-t').value || 'L';
        const fg = q(root, '.fv-fg').value, bg = q(root, '.fv-bg').value;
        const round = q(root, '.fv-round').checked;
        ctx.clearRect(0, 0, 128, 128);
        ctx.fillStyle = bg;
        if (round) {
          const r = 28;
          ctx.beginPath();
          ctx.moveTo(r, 0); ctx.arcTo(128, 0, 128, 128, r); ctx.arcTo(128, 128, 0, 128, r);
          ctx.arcTo(0, 128, 0, 0, r); ctx.arcTo(0, 0, 128, 0, r); ctx.closePath(); ctx.fill();
        } else ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = fg;
        ctx.font = 'bold ' + (t.length > 1 ? 56 : 76) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(t, 64, 70);
      }
      function download(size) {
        const off = document.createElement('canvas');
        off.width = off.height = size;
        off.getContext('2d').drawImage(cv, 0, 0, size, size);
        const a = document.createElement('a');
        a.href = off.toDataURL('image/png');
        a.download = 'favicon-' + size + '.png';
        a.click();
        TB.toast('已下载 favicon-' + size + '.png');
      }
      function renderDl() {
        const box = q(root, '.fv-dl');
        box.innerHTML = '';
        [16, 32, 48, 180].forEach(function (size) {
          const b = document.createElement('button');
          b.className = 'fp-btn';
          b.textContent = '下载 ' + size + 'px' + (size === 180 ? '(apple)' : '');
          b.onclick = function () { download(size); };
          box.appendChild(b);
        });
      }
      ['fv-t', 'fv-fg', 'fv-bg', 'fv-round'].forEach(function (cls) {
        const el = q(root, '.' + cls);
        el.oninput = draw; el.onchange = draw;
      });
      draw(); renderDl();
    },
  });

  /* ============ 占位图生成 ============ */
  TB.registerCustom('placeholder', {
    render: function () {
      return '<div class="fp-card">' +
        '<div class="fp-row" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">' +
        '<label class="fp-hint">宽<input type="number" class="fp-input ph-w" value="400" min="16" max="2000" style="width:90px"></label>' +
        '<label class="fp-hint">高<input type="number" class="fp-input ph-h" value="260" min="16" max="2000" style="width:90px"></label>' +
        '<label class="fp-hint">背景 <input type="color" class="ph-bg" value="#8a93a6" style="width:44px;height:32px;border:none;background:none;cursor:pointer;vertical-align:middle"></label>' +
        '<label class="fp-hint">文字<input type="text" class="fp-input ph-t" placeholder="留空 = 尺寸" style="width:140px"></label>' +
        '<label class="fp-hint">格式<select class="fp-select ph-fmt" style="width:auto"><option value="png">PNG</option><option value="svg">SVG</option></select></label>' +
        '<button class="fp-btn primary ph-go" data-primary="1">生成</button>' +
        '<button class="fp-btn ph-dl">下载</button>' +
        '<button class="fp-btn ph-sv">复制 SVG 代码</button></div>' +
        '<div class="ph-view" style="text-align:center;background:var(--anzhiyu-secondbg);border-radius:12px;padding:16px"></div></div>';
    },
    init: function (root) {
      let lastSvg = '';
      function buildSvg() {
        const w = Math.min(2000, Math.max(16, parseInt(q(root, '.ph-w').value, 10) || 400));
        const h = Math.min(2000, Math.max(16, parseInt(q(root, '.ph-h').value, 10) || 260));
        const bg = q(root, '.ph-bg').value;
        const t = q(root, '.ph-t').value.trim() || w + ' × ' + h;
        // 自动文字色：根据背景亮度
        const r = parseInt(bg.slice(1, 3), 16), g = parseInt(bg.slice(3, 5), 16), b = parseInt(bg.slice(5, 7), 16);
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const fg = lum > 150 ? '#333333' : '#ffffff';
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
          '<rect width="100%" height="100%" fill="' + bg + '"/>' +
          '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="' + Math.max(12, Math.round(Math.min(w, h) / 10)) + '" fill="' + fg + '">' + TB.esc(t) + '</text></svg>';
      }
      function render() {
        lastSvg = buildSvg();
        const view = q(root, '.ph-view');
        view.innerHTML = '<img alt="占位图预览" style="max-width:100%;border-radius:8px" src="data:image/svg+xml;charset=utf-8,' + encodeURIComponent(lastSvg) + '">';
      }
      q(root, '.ph-go').onclick = render;
      q(root, '.ph-dl').onclick = function () {
        const fmt = q(root, '.ph-fmt').value;
        const a = document.createElement('a');
        if (fmt === 'svg') {
          a.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(lastSvg);
          a.download = 'placeholder.svg';
        } else {
          const img = new Image();
          img.onload = function () {
            const cv = document.createElement('canvas');
            cv.width = img.naturalWidth; cv.height = img.naturalHeight;
            cv.getContext('2d').drawImage(img, 0, 0);
            a.href = cv.toDataURL('image/png');
            a.download = 'placeholder.png';
            a.click();
            TB.toast('已下载 placeholder.png');
          };
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(lastSvg);
          return;
        }
        a.click();
        TB.toast('已下载 placeholder.svg');
      };
      q(root, '.ph-sv').onclick = function () { TB.copy(lastSvg, 'SVG 代码已复制'); };
      render();
    },
  });
})();
