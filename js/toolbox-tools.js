/**
 * 工具箱——工具注册表（toolbox-tools.js）
 * 三类"工厂工具"全部在这里：
 *   type:'transform'  文本进 → 文本出（可带选项控件）
 *   type:'unit'       数值 + 单位 → 全部单位（填系数或 toBase/fromBase）
 *   type:'lookup'     可筛选速查表（填表头与数据行即可）
 * 自定义交互面板在 toolbox-custom.js。
 * ====== 加工具：往 REGISTRY 里加一条即可，列表和搜索自动收录 ======
 */
(function () {
  const TB = window.TB;

  /* ================= 内部算法 ================= */
  // --- MD5（Joseph Myers 公版实现，UTF-8 安全） ---
  function md5cycle(x, k) {
    let a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
    x[0] = (x[0] + a) | 0; x[1] = (x[1] + b) | 0; x[2] = (x[2] + c) | 0; x[3] = (x[3] + d) | 0;
  }
  function cmn(q, a, b, x, s, t) { a = (((a + q) | 0) + ((x + t) | 0)) | 0; return ((a << s) | (a >>> (32 - s))) + b; }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
  function md5blk(s) {
    const b = [];
    for (let i = 0; i < 64; i += 4) {
      b[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    }
    return b;
  }
  function md51(s) {
    const n = s.length, state = [1732584193, -271733879, -1732584194, 271733878];
    let i;
    for (i = 64; i <= n; i += 64) md5cycle(state, md5blk(s.substring(i - 64, i)));
    s = s.substring(i - 64);
    const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) { md5cycle(state, tail); for (i = 0; i < 16; i++) tail[i] = 0; }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
  }
  function rhex(n) {
    let s = '';
    for (let j = 0; j < 4; j++) s += ((n >> (j * 8 + 4)) & 0x0f).toString(16) + ((n >> (j * 8)) & 0x0f).toString(16);
    return s;
  }
  function md5(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return md51(bin).map(rhex).join('');
  }

  // --- SHA（浏览器原生 SubtleCrypto） ---
  function shaHex(text, algo, upper) {
    const data = new TextEncoder().encode(text);
    return crypto.subtle.digest('SHA-' + algo, data).then(function (buf) {
      const hex = Array.from(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      return upper ? hex.toUpperCase() : hex;
    });
  }

  // --- 罗马数字 ---
  const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  function toRoman(n) {
    n = parseInt(n, 10);
    if (!n || n < 1 || n > 3999) return '仅支持 1 - 3999';
    let out = '';
    ROMAN.forEach(function (p) { while (n >= p[0]) { out += p[1]; n -= p[0]; } });
    return out;
  }
  function fromRoman(s) {
    const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    s = s.trim().toUpperCase();
    if (!/^[MDCLXVI]+$/.test(s)) return '不是合法的罗马数字';
    let out = 0;
    for (let i = 0; i < s.length; i++) {
      const v = map[s[i]], next = map[s[i + 1]] || 0;
      out += v < next ? -v : v;
    }
    return String(out);
  }

  // --- 摩斯电码 ---
  const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
    I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-',
    R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
    0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....',
    7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.', '@': '.--.-.' };
  const MORSE_REV = {};
  Object.keys(MORSE).forEach(function (k) { MORSE_REV[MORSE[k]] = k; });

  // --- 命名风格 ---
  function splitWords(s) {
    return s.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Za-z])(\d)/g, '$1 $2')
      .split(/[_\-\s]+/).map(function (w) { return w.toLowerCase(); }).filter(Boolean);
  }
  function toStyle(words, style) {
    if (!words.length) return '';
    if (style === 'camel') return words[0] + words.slice(1).map(function (w) { return w[0].toUpperCase() + w.slice(1); }).join('');
    if (style === 'pascal') return words.map(function (w) { return w[0].toUpperCase() + w.slice(1); }).join('');
    if (style === 'snake') return words.join('_');
    if (style === 'kebab') return words.join('-');
    if (style === 'const') return words.join('_').toUpperCase();
    return words.join(' ');
  }

  // --- 标点 / 全半角 ---
  const PUNCT_C2E = { '，': ',', '。': '.', '、': ',', '：': ':', '；': ';', '？': '?', '！': '!',
    '（': '(', '）': ')', '“': '"', '”': '"', '‘': "'", '’': "'", '【': '[', '】': ']', '《': '<', '》': '>', '—': '-', '～': '~' };
  const PUNCT_E2C = { ',': '，', '.': '。', ':': '：', ';': '；', '?': '？', '!': '！', '(': '（', ')': '）' };

  /* ================= 工具注册表 ================= */
  // --- UA 解析 ---
  function parseUA(raw) {
    const ua = raw.trim();
    if (!ua) return '';
    const lines = [];
    // 浏览器
    let browser = '未知浏览器';
    if (/Edg\//.test(ua)) browser = 'Edge ' + (ua.match(/Edg\/([\d.]+)/) || [])[1];
    else if (/OPR\/|Opera/.test(ua)) browser = 'Opera ' + (ua.match(/(?:OPR|Opera)[/ ]([\d.]+)/) || [])[1];
    else if (/Firefox\//.test(ua)) browser = 'Firefox ' + (ua.match(/Firefox\/([\d.]+)/) || [])[1];
    else if (/MSIE|Trident/.test(ua)) browser = 'Internet Explorer';
    else if (/Chrome\//.test(ua)) browser = 'Chrome ' + (ua.match(/Chrome\/([\d.]+)/) || [])[1];
    else if (/Safari\//.test(ua)) browser = 'Safari ' + (ua.match(/Version\/([\d.]+)/) || [])[1];
    lines.push('浏览器：' + browser);
    // 引擎
    let engine = '未知';
    if (/Gecko\/|Firefox/.test(ua) && !/like Gecko/.test(ua)) engine = 'Gecko';
    else if (/Trident/.test(ua)) engine = 'Trident';
    else if (/AppleWebKit/.test(ua)) engine = /Chrome|Edg|OPR/.test(ua) ? 'Blink (AppleWebKit)' : 'WebKit';
    lines.push('渲染引擎：' + engine);
    // 系统
    let os = '未知系统';
    if (/Windows NT ([\d.]+)/.test(ua)) {
      const map = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };
      os = 'Windows ' + (map[(ua.match(/Windows NT ([\d.]+)/) || [])[1]] || '');
    }
    else if (/Android ([\d.]+)/.test(ua)) os = 'Android ' + ua.match(/Android ([\d.]+)/)[1];
    else if (/iPhone OS ([\d_]+)/.test(ua)) os = 'iOS ' + ua.match(/iPhone OS ([\d_]+)/)[1].replace(/_/g, '.');
    else if (/iPad/.test(ua)) os = 'iPadOS' + (ua.match(/OS ([\d_]+)/) ? ' ' + ua.match(/OS ([\d_]+)/)[1].replace(/_/g, '.') : '');
    else if (/Mac OS X ([\d_.]+)/.test(ua)) os = 'macOS ' + ua.match(/Mac OS X ([\d_.]+)/)[1].replace(/_/g, '.');
    else if (/Linux/.test(ua)) os = 'Linux';
    lines.push('操作系统：' + os);
    // 设备
    let device = '电脑';
    if (/iPad/.test(ua)) device = '平板';
    else if (/Mobile|iPhone/.test(ua)) device = '手机';
    else if (/Android/.test(ua)) device = 'Android 设备';
    lines.push('设备类型：' + device);
    // 微信/小程序等特殊环境
    if (/MicroMessenger/.test(ua)) {
      const v = (ua.match(/MicroMessenger\/([\d.]+)/) || [])[1];
      lines.push('特殊环境：微信内置浏览器' + (v ? ' ' + v : '') + (/miniProgram/.test(ua) ? '（小程序）' : ''));
    }
    if (/QQ\//.test(ua)) lines.push('特殊环境：QQ 内置浏览器');
    if (/Weibo/.test(ua)) lines.push('特殊环境：微博内置浏览器');
    return lines.join('\n');
  }

  // --- JSON ⇄ CSV ---
  function csvSplit(line) {
    const out = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }
  function json2csvConvert(raw) {
    let data;
    try { data = JSON.parse(raw); } catch (e) { return 'JSON 解析失败：' + e.message; }
    if (!Array.isArray(data)) data = [data];
    if (!data.length || typeof data[0] !== 'object') return '需要对象数组，如 [{"a":1},{"a":2}]';
    const keys = [];
    data.forEach(function (o) { Object.keys(o).forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); }); });
    function esc(v) {
      const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    return [keys.map(esc).join(',')].concat(data.map(function (o) {
      return keys.map(function (k) { return esc(o[k]); }).join(',');
    })).join('\n');
  }
  function csv2jsonConvert(raw) {
    const lines = raw.trim().split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (lines.length < 2) return '至少需要表头行 + 一行数据';
    const head = csvSplit(lines[0]);
    const rows = lines.slice(1).map(function (l) {
      const cells = csvSplit(l);
      const o = {};
      head.forEach(function (h, i) {
        const v = cells[i] == null ? '' : cells[i];
        o[h] = v !== '' && !isNaN(v) && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v;
      });
      return o;
    });
    return JSON.stringify(rows, null, 2);
  }

  // --- IP 子网 ---
  function ip2int(ip) {
    const p = ip.split('.');
    if (p.length !== 4 || p.some(function (x) { return !(x >= 0 && x <= 255 && /^\d+$/.test(x)); })) return null;
    return ((+p[0] << 24) | (+p[1] << 16) | (+p[2] << 8) | +p[3]) >>> 0;
  }
  function int2ip(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'); }
  function ipnetConvert(raw) {
    const m = raw.trim().match(/^(\d+\.\d+\.\d+\.\d+)(?:\/(\d{1,2}))?$/);
    if (!m) return '输入格式：192.168.1.6/24';
    const ip = ip2int(m[1]);
    if (ip === null) return 'IP 地址不合法';
    const bits = m[2] === undefined ? 24 : parseInt(m[2], 10);
    if (bits < 0 || bits > 32) return '掩码位数 0-32';
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    const network = (ip & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    const hosts = bits >= 31 ? Math.pow(2, 32 - bits) : Math.pow(2, 32 - bits) - 2;
    const lines = [
      'IP 地址：' + m[1],
      '掩码位数：/' + bits,
      '子网掩码：' + int2ip(mask),
      '网络地址：' + int2ip(network),
      '广播地址：' + int2ip(broadcast),
      '可用主机数：' + hosts.toLocaleString() + ' 个' + (bits < 31 ? '（' + int2ip(network + 1) + ' ~ ' + int2ip(broadcast - 1) + '）' : ''),
      '所属网段（CIDR）：' + int2ip(network) + '/' + bits,
      '反掩码（通配符）：' + int2ip(~mask >>> 0),
      '二进制 IP：' + [m[1].split('.').map(function (x) { return (+x).toString(2).padStart(8, '0'); }).join('.')],
      '是否私有地址：' + (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(m[1]) ? '是' : '否'),
    ];
    return lines.join('\n');
  }

  // --- 文本进制 ---
  function textBaseConvert(raw, opts) {
    const mode = opts.mode || 'enc';
    const base = opts.base === 'bin' ? 2 : 16;
    const sep = base === 16 ? ' ' : ' ';
    try {
      if (mode === 'enc') {
        const bytes = new TextEncoder().encode(raw);
        const arr = Array.from(bytes, function (b) { return b.toString(base).padStart(base === 16 ? 2 : 8, '0'); });
        return base === 16 ? arr.join(sep) : arr.join(' ');
      }
      const parts = raw.trim().split(/[\s,]+/).filter(Boolean);
      const bytes = new Uint8Array(parts.map(function (p) {
        const v = parseInt(p, base);
        if (isNaN(v) || v < 0 || v > 255) throw new Error('「' + p + '」不是合法的' + (base === 16 ? '十六' : '二') + '进制字节');
        return v;
      }));
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch (e) { return e.message; }
  }

  const REGISTRY = [

    /* ---------------- 开发助手 ---------------- */
    { id: 'json', cat: 'dev', name: 'JSON 格式化', icon: 'file-lines', type: 'custom', keywords: 'json 校验 压缩 高亮' },
    { id: 'regex', cat: 'dev', name: '正则测试', icon: 'hashtag', type: 'custom', keywords: '正则 regex 匹配' },
    { id: 'json2ts', cat: 'dev', name: 'JSON 转 TS', icon: 'font', type: 'custom', keywords: 'typescript interface 类型' },
    { id: 'jwt', cat: 'dev', name: 'JWT 解析', icon: 'tag', type: 'custom', keywords: 'token 鉴权 header payload' },
    {
      id: 'htmlesc', cat: 'dev', name: 'HTML 转义', icon: 'shapes', type: 'transform', keywords: '转义 实体 escape',
      options: [{ key: 'mode', label: '方向', type: 'select', values: [['esc', '转义（→ 实体）'], ['unesc', '反转义（实体 → 符号）']] }],
      transform: function (t, o) {
        if (o.mode === 'esc') return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        return t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); })
          .replace(/&amp;/g, '&');
      },
    },
    {
      id: 'cookie', cat: 'dev', name: 'Cookie 解析', icon: 'paste', type: 'transform', keywords: 'header 键值 session',
      options: [{ key: 'dec', label: 'URL 解码', type: 'checkbox', checked: true }],
      transform: function (t, o) {
        return t.split(/;\s*/).filter(Boolean).map(function (pair) {
          const i = pair.indexOf('=');
          if (i < 0) return pair + '  （无值）';
          let k = pair.slice(0, i), v = pair.slice(i + 1);
          if (o.dec) { try { k = decodeURIComponent(k); v = decodeURIComponent(v); } catch (e) { /* 保持原样 */ } }
          return k + ' = ' + v;
        }).join('\n');
      },
      inputPlaceholder: '粘贴 Cookie 请求头',
    },
    {
      id: 'perm', cat: 'dev', name: 'Unix 权限对照', icon: 'gear', type: 'transform', keywords: 'chmod rwx 755 linux',
      transform: function (t) {
        return t.trim().split(/\s+/).map(function (s) {
          if (/^[0-7]{3,4}$/.test(s)) {
            const digits = s.slice(-3).split('');
            const names = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
            return s + '  →  ' + digits.map(function (d) { return names[+d]; }).join('') + '（数字 ' + s + '）';
          }
          const m = s.match(/^([r-][w-][x-]){3}$/);
          if (!m) return s + '  →  无法识别（需要 755 或 rwxr-xr-x 形式）';
          let oct = '';
          for (let i = 0; i < 9; i += 3) {
            oct += ((s[i] === 'r' ? 4 : 0) + (s[i + 1] === 'w' ? 2 : 0) + (s[i + 2] === 'x' ? 1 : 0));
          }
          return s + '  →  ' + oct + '（符号 ' + s + '）';
        }).join('\n');
      },
      inputPlaceholder: '755 或 rwxr-xr-x，每行一个',
    },
    {
      id: 'excelcol', cat: 'dev', name: 'Excel 列号转换', icon: 'list-ul', type: 'transform', keywords: '列号 A1 字母',
      options: [{ key: 'mode', label: '方向', type: 'select', values: [['n2a', '数字 → 字母（1→A）'], ['a2n', '字母 → 数字（A→1）']] }],
      transform: function (t, o) {
        return t.trim().split(/\s+/).map(function (s) {
          if (o.mode === 'n2a') {
            let n = parseInt(s, 10), out = '';
            if (!n || n < 1) return s + ' → 无效';
            while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
            return s + ' → ' + out;
          }
          const up = s.toUpperCase();
          if (!/^[A-Z]+$/.test(up)) return s + ' → 无效';
          let n = 0;
          for (let i = 0; i < up.length; i++) n = n * 26 + (up.charCodeAt(i) - 64);
          return up + ' → ' + n;
        }).join('\n');
      },
    },

    /* ---------------- 编码加密 ---------------- */
    { id: 'base64', cat: 'encode', name: 'Base64 / URL', icon: 'arrows-left-right', type: 'custom', keywords: '编码 解码 base64 url' },
    { id: 'timestamp', cat: 'encode', name: '时间戳转换', icon: 'clock', type: 'custom', keywords: 'unix 时间 日期' },
    {
      id: 'base', cat: 'encode', name: '进制转换', icon: 'hashtag', type: 'transform', keywords: '二进制 十六进制 hex 二 八 十六',
      options: [
        { key: 'from', label: '原进制', type: 'select', values: [['2', '二进制'], ['8', '八进制'], ['10', '十进制'], ['16', '十六进制'], ['36', '三十六进制']] },
        { key: 'to', label: '目标进制', type: 'select', values: [['16', '十六进制'], ['10', '十进制'], ['2', '二进制'], ['8', '八进制'], ['36', '三十六进制']] },
      ],
      transform: function (t, o) {
        return t.trim().split(/\s+/).map(function (s) {
          const n = parseInt(s, +o.from);
          if (isNaN(n)) return s + ' → 不是合法的 ' + o.from + ' 进制数';
          return s + ' → ' + n.toString(+o.to);
        }).join('\n');
      },
    },
    {
      id: 'unicode', cat: 'encode', name: 'Unicode 转义', icon: 'language', type: 'transform', keywords: '\\u 转义 中文 编码',
      options: [{ key: 'mode', label: '方向', type: 'select', values: [['enc', '文本 → \\uXXXX'], ['dec', '\\uXXXX → 文本']] }],
      transform: function (t, o) {
        if (o.mode === 'enc') {
          return t.split('').map(function (ch) {
            const c = ch.charCodeAt(0);
            return c > 127 ? '\\u' + c.toString(16).padStart(4, '0') : ch;
          }).join('');
        }
        return t.replace(/\\u([0-9a-fA-F]{4})/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); });
      },
    },
    {
      id: 'sha', cat: 'encode', name: 'SHA 哈希', icon: 'hashtag', type: 'transform', keywords: 'sha256 sha1 摘要 校验',
      options: [
        { key: 'algo', label: '算法', type: 'select', values: [['256', 'SHA-256'], ['1', 'SHA-1'], ['384', 'SHA-384'], ['512', 'SHA-512']] },
        { key: 'upper', label: '大写输出', type: 'checkbox' },
      ],
      transform: function (t, o) { return shaHex(t, o.algo, o.upper); },
      tip: 'MD5 见相邻工具；SHA 由浏览器原生 SubtleCrypto 计算。',
    },
    {
      id: 'md5', cat: 'encode', name: 'MD5', icon: 'hashtag', type: 'transform', keywords: 'md5 摘要 校验 哈希',
      options: [{ key: 'upper', label: '大写输出', type: 'checkbox' }],
      transform: function (t, o) {
        const h = md5(t);
        return o.upper ? h.toUpperCase() : h;
      },
      tip: 'MD5 为内置纯 JS 实现；仅用于校验场景，不再具备密码学安全性。',
    },
    { id: 'img2b64', cat: 'encode', name: '图片转 Base64', icon: 'images', type: 'custom', keywords: 'dataurl data-url 图片编码' },
    {
      id: 'funCipher', cat: 'encode', name: '趣味密码', icon: 'dice', type: 'transform', keywords: '摩斯 凯撒 密码 加密',
      options: [
        { key: 'mode', label: '方式', type: 'select', values: [['morse-enc', '摩斯电码 加密'], ['morse-dec', '摩斯电码 解密'], ['caesar-enc', '凯撒 加密'], ['caesar-dec', '凯撒 解密']] },
        { key: 'shift', label: '凯撒位移', type: 'number', value: 3 },
      ],
      transform: function (t, o) {
        const shift = (parseInt(o.shift, 10) || 3) % 26;
        function caesar(move) {
          return t.replace(/[a-zA-Z]/g, function (c) {
            const base = c <= 'Z' ? 65 : 97;
            return String.fromCharCode(((c.charCodeAt(0) - base + move + 26) % 26) + base);
          });
        }
        if (o.mode === 'morse-enc') {
          return t.toUpperCase().split('').map(function (c) { return MORSE[c] || (c === ' ' ? '/' : c); }).join(' ');
        }
        if (o.mode === 'morse-dec') {
          return t.trim().split(/\s+/).map(function (m) { return MORSE_REV[m] || (m === '/' ? ' ' : '?'); }).join('');
        }
        return o.mode === 'caesar-enc' ? caesar(shift) : caesar(-shift);
      },
    },
    {
      id: 'mailto', cat: 'encode', name: '邮件链接生成', icon: 'envelope', type: 'transform', keywords: 'mailto mail 邮件 链接',
      options: [
        { key: 'to', label: '收件人', type: 'text', placeholder: 'name@example.com' },
        { key: 'subject', label: '主题', type: 'text' },
        { key: 'cc', label: '抄送', type: 'text' },
      ],
      transform: function (t, o) {
        if (!o.to) return '请先在上方填写收件人邮箱';
        const params = [];
        if (o.subject) params.push('subject=' + encodeURIComponent(o.subject));
        if (o.cc) params.push('cc=' + encodeURIComponent(o.cc));
        if (t) params.push('body=' + encodeURIComponent(t));
        return 'mailto:' + o.to + (params.length ? '?' + params.join('&') : '');
      },
      inputPlaceholder: '邮件正文（可留空）',
    },

    /* ---------------- 文本处理 ---------------- */
    {
      id: 'stats', cat: 'text', name: '文本统计', icon: 'square-poll-vertical', type: 'transform', keywords: '字数 词数 行数 字节 统计',
      transform: function (t) {
        const cjk = (t.match(/[\u4e00-\u9fa5]/g) || []).length;
        const enWords = (t.match(/[a-zA-Z0-9]+/g) || []).length;
        const lines = t.split('\n');
        const nonEmpty = lines.filter(function (l) { return l.trim(); }).length;
        return '字符数（含空格）：' + t.length +
          '\n字符数（不含空白）：' + t.replace(/\s/g, '').length +
          '\n中文字符：' + cjk +
          '\n英文单词/数字串：' + enWords +
          '\n总词数（中文按字计）：' + (enWords + cjk) +
          '\n行数：' + lines.length + '（非空行 ' + nonEmpty + '）' +
          '\n段落数：' + (t.split(/\n\s*\n/).filter(function (p) { return p.trim(); }).length) +
          '\nUTF-8 字节数：' + new TextEncoder().encode(t).length;
      },
    },
    {
      id: 'dedupe', cat: 'text', name: '去重 · 排序', icon: 'list-ul', type: 'transform', keywords: '去重 排序 唯一 行',
      options: [
        { key: 'trim', label: '去每行首尾空格', type: 'checkbox', checked: true },
        { key: 'dropEmpty', label: '去空行', type: 'checkbox', checked: true },
        { key: 'unique', label: '去重', type: 'checkbox', checked: true },
        { key: 'sort', label: '排序', type: 'select', values: [['none', '不排序'], ['asc', '升序'], ['desc', '降序']] },
        { key: 'reverse', label: '倒转顺序', type: 'checkbox' },
      ],
      transform: function (t, o) {
        let lines = t.split('\n');
        if (o.trim) lines = lines.map(function (l) { return l.trim(); });
        if (o.dropEmpty) lines = lines.filter(function (l) { return l; });
        if (o.unique) {
          const seen = {};
          lines = lines.filter(function (l) { if (seen[l]) return false; seen[l] = 1; return true; });
        }
        if (o.sort === 'asc') lines.sort();
        if (o.sort === 'desc') lines.sort().reverse();
        if (o.reverse) lines.reverse();
        return lines.join('\n');
      },
      inputPlaceholder: '每行一项',
    },
    {
      id: 'naming', cat: 'text', name: '命名风格转换', icon: 'pencil', type: 'transform', keywords: '驼峰 下划线 kebab 变量命名 camel snake',
      options: [
        { key: 'to', label: '目标风格', type: 'select', values: [['camel', '小驼峰 userId'], ['pascal', '大驼峰 UserId'], ['snake', '下划线 user_id'], ['kebab', '连字符 user-id'], ['const', '常量 USER_ID']] },
      ],
      transform: function (t, o) {
        return t.trim().split(/\s+/).map(function (s) { return toStyle(splitWords(s), o.to); }).join('\n');
      },
      inputPlaceholder: 'userId / user_id / user-id 均可识别',
    },
    {
      id: 'case', cat: 'text', name: '大小写转换', icon: 'font', type: 'transform', keywords: '大写 小写 首字母',
      options: [{ key: 'mode', label: '模式', type: 'select', values: [['upper', '全部大写'], ['lower', '全部小写'], ['sentence', '句首大写'], ['title', '每词首字母大写']] }],
      transform: function (t, o) {
        if (o.mode === 'upper') return t.toUpperCase();
        if (o.mode === 'lower') return t.toLowerCase();
        if (o.mode === 'title') return t.replace(/(^|\s)([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
        return t.replace(/(^|[.!?…]\s+)([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
      },
    },
    {
      id: 'replace', cat: 'text', name: '文本替换', icon: 'scissors', type: 'transform', keywords: '替换 正则 查找',
      options: [
        { key: 'find', label: '查找', type: 'text', placeholder: '要查找的内容' },
        { key: 'repl', label: '替换为', type: 'text' },
        { key: 'regex', label: '按正则解析', type: 'checkbox' },
      ],
      transform: function (t, o) {
        if (!o.find) return t;
        try {
          const pattern = o.regex ? new RegExp(o.find, 'g') : new RegExp(o.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          return t.replace(pattern, o.repl || '');
        } catch (e) {
          return '正则语法错误：' + e.message;
        }
      },
    },
    {
      id: 'linenum', cat: 'text', name: '添加行号', icon: 'list-ul', type: 'transform', keywords: '行号 序号 编号',
      options: [{ key: 'fmt', label: '格式', type: 'select', values: [['dot', '1. 内容'], ['colon', '1: 内容'], ['bracket', '[1] 内容'], ['pad', '001 内容']] }],
      transform: function (t, o) {
        const lines = t.split('\n');
        const pad = function (n, w) { return String(n).padStart(w, '0'); };
        const w = String(lines.length).length;
        return lines.map(function (l, i) {
          const n = i + 1;
          if (o.fmt === 'colon') return n + ': ' + l;
          if (o.fmt === 'bracket') return '[' + n + '] ' + l;
          if (o.fmt === 'pad') return pad(n, w) + ' ' + l;
          return n + '. ' + l;
        }).join('\n');
      },
    },
    {
      id: 'punct', cat: 'text', name: '中英标点转换', icon: 'repeat', type: 'transform', keywords: '标点 符号 中文 英文',
      options: [{ key: 'mode', label: '方向', type: 'select', values: [['c2e', '中文标点 → 英文'], ['e2c', '英文标点 → 中文']] }],
      transform: function (t, o) {
        const map = o.mode === 'c2e' ? PUNCT_C2E : PUNCT_E2C;
        return t.replace(/[\u3000-\u303F\uFF00-\uFFEF.,:;?!()]/g, function (c) { return map[c] || c; });
      },
      tip: '英文转中文时，逗号句号会转换，其余英文标点保持原样以免误伤代码。',
    },
    {
      id: 'width', cat: 'text', name: '全半角转换', icon: 'arrows-left-right', type: 'transform', keywords: '全角 半角 空格',
      options: [{ key: 'mode', label: '方向', type: 'select', values: [['fw2hw', '全角 → 半角'], ['hw2fw', '半角 → 全角']] }],
      transform: function (t, o) {
        return t.replace(/[\uFF01-\uFF5E\u3000]/g, function (c) {
          const code = c.charCodeAt(0);
          if (o.mode === 'fw2hw') return code === 0x3000 ? ' ' : String.fromCharCode(code - 0xFEE0);
          return c === ' ' ? '\u3000' : (code >= 33 && code <= 126 ? String.fromCharCode(code + 0xFEE0) : c);
        });
      },
    },
    {
      id: 'trimws', cat: 'text', name: '空白清理', icon: 'scissors', type: 'transform', keywords: '空格 空行 清理 换行',
      options: [
        { key: 'spaces', label: '合并连续空格为一个', type: 'checkbox', checked: true },
        { key: 'nospace', label: '删除所有空格', type: 'checkbox' },
        { key: 'lines', label: '合并连续空行', type: 'checkbox', checked: true },
        { key: 'nolines', label: '删除所有空行', type: 'checkbox' },
        { key: 'eachline', label: '去每行首尾空白', type: 'checkbox', checked: true },
      ],
      transform: function (t, o) {
        let s = t.replace(/\r\n?/g, '\n');
        if (o.eachline) s = s.split('\n').map(function (l) { return l.trim(); }).join('\n');
        if (o.nospace) s = s.replace(/[ \t]+/g, '');
        else if (o.spaces) s = s.replace(/[ \t]{2,}/g, ' ');
        if (o.nolines) s = s.split('\n').filter(function (l) { return l; }).join('\n');
        else if (o.lines) s = s.replace(/\n{3,}/g, '\n\n');
        return s;
      },
    },
    {
      id: 'freq', cat: 'text', name: '字符频率统计', icon: 'chart-line', type: 'transform', keywords: '频率 字符 统计 排行',
      options: [{ key: 'nospace', label: '忽略空白字符', type: 'checkbox', checked: true }],
      transform: function (t, o) {
        if (o.nospace) t = t.replace(/\s/g, '');
        const count = {};
        let total = 0;
        Array.from(t).forEach(function (c) { count[c] = (count[c] || 0) + 1; total++; });
        if (!total) return '等待输入…';
        return Object.keys(count)
          .sort(function (a, b) { return count[b] - count[a]; })
          .slice(0, 50)
          .map(function (c) {
            const label = c === ' ' ? '(空格)' : c;
            return label + '  ×' + count[c] + '  (' + ((count[c] / total) * 100).toFixed(1) + '%)';
          }).join('\n');
      },
      tip: '仅展示出现最多的前 50 个字符。',
    },
    {
      id: 'repeat', cat: 'text', name: '重复文本', icon: 'repeat', type: 'transform', keywords: '重复 复制多次 生成',
      options: [
        { key: 'n', label: '重复次数', type: 'number', value: 3 },
        { key: 'join', label: '连接方式', type: 'select', values: [['nl', '换行'], ['sp', '空格'], ['none', '直接连接'], ['comma', '逗号']] },
      ],
      transform: function (t, o) {
        const n = Math.min(parseInt(o.n, 10) || 1, 10000);
        const sep = o.join === 'sp' ? ' ' : o.join === 'comma' ? '，' : o.join === 'none' ? '' : '\n';
        return new Array(n).fill(t).join(sep);
      },
    },
    {
      id: 'thousands', cat: 'text', name: '数字格式化', icon: 'chart-line', type: 'transform', keywords: '千分位 金额 数字 格式化',
      options: [{ key: 'mode', label: '方向', type: 'select', values: [['add', '加千分位（1234567 → 1,234,567）'], ['remove', '去千分位（1,234,567 → 1234567）']] }],
      transform: function (t, o) {
        if (o.mode === 'remove') return t.replace(/(\d),(?=\d{3}\b)/g, '$1');
        return t.replace(/\d+(?:\.\d+)?/g, function (num) {
          const parts = num.split('.');
          parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return parts.join('.');
        });
      },
    },
    {
      id: 'roman', cat: 'text', name: '罗马数字', icon: 'history', type: 'transform', keywords: '罗马 数字 转换',
      options: [{ key: 'mode', label: '方向', type: 'select', values: [['n2r', '数字 → 罗马数字'], ['r2n', '罗马数字 → 数字']] }],
      transform: function (t, o) {
        return t.trim().split(/\s+/).map(function (s) {
          return o.mode === 'n2r' ? s + ' → ' + toRoman(s) : s + ' → ' + fromRoman(s);
        }).join('\n');
      },
    },

    /* ---------------- 单位换算 ---------------- */
    {
      id: 'cssunit', cat: 'unit', name: 'CSS 单位', icon: 'shapes', type: 'custom', keywords: 'px rem vw vh 前端' },
    {
      id: 'u-length', cat: 'unit', name: '长度', icon: 'arrows-left-right', type: 'unit', keywords: '米 千米 英尺 英里',
      units: [
        { k: 'mm', n: '毫米', f: 0.001 }, { k: 'cm', n: '厘米', f: 0.01 }, { k: 'm', n: '米', f: 1 },
        { k: 'km', n: '千米', f: 1000 }, { k: 'in', n: '英寸', f: 0.0254 }, { k: 'ft', n: '英尺', f: 0.3048 },
        { k: 'yd', n: '码', f: 0.9144 }, { k: 'mi', n: '英里', f: 1609.344 }, { k: 'nmi', n: '海里', f: 1852 },
      ],
    },
    {
      id: 'u-weight', cat: 'unit', name: '重量', icon: 'arrows-left-right', type: 'unit', keywords: '千克 克 磅 盎司 斤',
      units: [
        { k: 'mg', n: '毫克', f: 0.000001 }, { k: 'g', n: '克', f: 0.001 }, { k: 'kg', n: '千克', f: 1 },
        { k: 't', n: '吨', f: 1000 }, { k: 'oz', n: '盎司', f: 0.0283495 }, { k: 'lb', n: '磅', f: 0.453592 },
        { k: 'jin', n: '斤', f: 0.5 },
      ],
    },
    {
      id: 'u-temp', cat: 'unit', name: '温度', icon: 'arrows-left-right', type: 'unit', keywords: '摄氏 华氏 开尔文',
      units: [
        { k: '°C', n: '摄氏度', toBase: function (v) { return v; }, fromBase: function (b) { return b; } },
        { k: '°F', n: '华氏度', toBase: function (v) { return (v - 32) * 5 / 9; }, fromBase: function (b) { return b * 9 / 5 + 32; } },
        { k: 'K', n: '开尔文', toBase: function (v) { return v - 273.15; }, fromBase: function (b) { return b + 273.15; } },
      ],
      tip: '换算基准为摄氏度，输入后自动显示其余温标。',
    },
    {
      id: 'u-area', cat: 'unit', name: '面积', icon: 'arrows-left-right', type: 'unit', keywords: '平方米 亩 公顷 平方英尺',
      units: [
        { k: 'm²', n: '平方米', f: 1 }, { k: 'km²', n: '平方千米', f: 1000000 },
        { k: 'ha', n: '公顷', f: 10000 }, { k: 'mu', n: '亩', f: 666.667 },
        { k: 'ft²', n: '平方英尺', f: 0.092903 }, { k: 'acre', n: '英亩', f: 4046.86 },
      ],
    },
    {
      id: 'u-volume', cat: 'unit', name: '体积', icon: 'arrows-left-right', type: 'unit', keywords: '升 毫升 加仑 立方米',
      units: [
        { k: 'ml', n: '毫升', f: 0.001 }, { k: 'L', n: '升', f: 1 }, { k: 'm³', n: '立方米', f: 1000 },
        { k: 'gal', n: '美制加仑', f: 3.78541 }, { k: 'pt', n: '美制品脱', f: 0.473176 },
      ],
    },
    {
      id: 'u-speed', cat: 'unit', name: '速度', icon: 'arrows-left-right', type: 'unit', keywords: '时速 迈 节 米每秒',
      units: [
        { k: 'm/s', n: '米/秒', f: 1 }, { k: 'km/h', n: '千米/小时', f: 0.277778 },
        { k: 'mph', n: '英里/小时', f: 0.44704 }, { k: 'knot', n: '节', f: 0.514444 },
      ],
    },
    {
      id: 'u-data', cat: 'unit', name: '数据存储', icon: 'arrows-left-right', type: 'unit', keywords: 'kb mb gb tb 容量',
      units: [
        { k: 'bit', n: '位', f: 0.125 }, { k: 'B', n: '字节', f: 1 }, { k: 'KB', n: '千字节', f: 1024 },
        { k: 'MB', n: '兆字节', f: 1048576 }, { k: 'GB', n: '吉字节', f: 1073741824 },
        { k: 'TB', n: '太字节', f: 1099511627776 },
      ],
      tip: '按 1KB = 1024B 的二进制标准换算。',
    },
    {
      id: 'u-time', cat: 'unit', name: '时间单位', icon: 'clock', type: 'unit', keywords: '秒 分 小时 天 周',
      units: [
        { k: 'ms', n: '毫秒', f: 0.001 }, { k: 's', n: '秒', f: 1 }, { k: 'min', n: '分钟', f: 60 },
        { k: 'h', n: '小时', f: 3600 }, { k: 'd', n: '天', f: 86400 },
        { k: 'week', n: '周', f: 604800 }, { k: 'month', n: '月（按30天）', f: 2592000 },
        { k: 'year', n: '年（按365天）', f: 31536000 },
      ],
    },
    {
      id: 'u-angle', cat: 'unit', name: '角度', icon: 'arrows-left-right', type: 'unit', keywords: '度 弧度 rad',
      units: [
        { k: '°', n: '度', f: 1 }, { k: 'rad', n: '弧度', f: 57.2957795 },
        { k: 'grad', n: '梯度', f: 0.9 }, { k: 'turn', n: '圈', f: 360 },
      ],
    },
    {
      id: 'u-fuel', cat: 'unit', name: '油耗', icon: 'arrows-left-right', type: 'unit', keywords: '百公里油耗 mpg 油耗换算',
      units: [
        { k: 'L/100km', n: '升/百公里', toBase: function (v) { return v; }, fromBase: function (b) { return b; } },
        { k: 'km/L', n: '千米/升', toBase: function (v) { return v ? 100 / v : NaN; }, fromBase: function (b) { return b ? 100 / b : NaN; } },
        { k: 'MPG(US)', n: '英里/加仑(美)', toBase: function (v) { return v ? 235.215 / v : NaN; }, fromBase: function (b) { return b ? 235.215 / b : NaN; } },
        { k: 'MPG(UK)', n: '英里/加仑(英)', toBase: function (v) { return v ? 282.481 / v : NaN; }, fromBase: function (b) { return b ? 282.481 / b : NaN; } },
      ],
    },
    {
      id: 'u-dpi', cat: 'unit', name: '分辨率密度', icon: 'filter-picture', type: 'unit', keywords: 'dpi ppi 像素密度',
      units: [
        { k: 'px/in', n: '像素/英寸 (DPI)', toBase: function (v) { return v; }, fromBase: function (b) { return b; } },
        { k: 'px/cm', n: '像素/厘米', toBase: function (v) { return v * 2.54; }, fromBase: function (b) { return b / 2.54; } },
        { k: 'px/mm', n: '像素/毫米', toBase: function (v) { return v * 25.4; }, fromBase: function (b) { return b / 25.4; } },
      ],
    },

    /* ---------------- 日常计算 ---------------- */
    { id: 'datecalc', cat: 'calc', name: '日期计算', icon: 'calendar-days', type: 'custom', keywords: '相差 天数 加减' },
    { id: 'age', cat: 'calc', name: '年龄计算', icon: 'hourglass-start', type: 'custom', keywords: '生日 周岁' },
    { id: 'bmi', cat: 'calc', name: 'BMI 指数', icon: 'heartbeat', type: 'custom', keywords: '体重 健康 身高' },
    { id: 'percent', cat: 'calc', name: '百分比计算', icon: 'square-poll-vertical', type: 'custom', keywords: '比例 占比 增长' },
    {
      id: 'rmb', cat: 'calc', name: '人民币大写', icon: 'copyright', type: 'transform', keywords: '大写金额 发票 报销 壹佰',
      transform: function (t) {
        const n = parseFloat(String(t).replace(/[,，\s]/g, ''));
        if (isNaN(n) || n < 0) return '请输入有效金额';
        if (n >= 1e12) return '金额过大（超过万亿）';
        const digits = '零壹贰叁肆伍陆柒捌玖';
        const units = ['', '拾', '佰', '仟'];
        const bigUnits = ['', '万', '亿', '万亿'];
        let integer = Math.floor(n);
        let decimal = Math.round((n - integer) * 100);
        if (integer === 0 && decimal === 0) return '零元整';
        let out = '';
        if (integer > 0) {
          const groups = [];
          while (integer > 0) { groups.push(integer % 10000); integer = Math.floor(integer / 10000); }
          const groupStr = [];
          for (let g = groups.length - 1; g >= 0; g--) {
            let seg = groups[g], segOut = '';
            let zero = false;
            for (let u = 3; u >= 0; u--) {
              const d = Math.floor(seg / Math.pow(10, u)) % 10;
              if (d === 0) { zero = segOut !== ''; continue; }
              if (zero) { segOut += '零'; zero = false; }
              segOut += digits[d] + units[u];
            }
            if (segOut) groupStr.push(segOut + bigUnits[g]);
          }
          out = groupStr.join('') + '元';
        }
        if (decimal === 0) return out + '整';
        const jiao = Math.floor(decimal / 10), fen = decimal % 10;
        if (jiao) out += digits[jiao] + '角';
        else if (integer > 0) out += '零';
        if (fen) out += digits[fen] + '分';
        return out;
      },
      inputPlaceholder: '金额，如 1234.56',
      tip: '四舍五入到分，支持到万亿。',
    },
    {
      id: 'zodiac', cat: 'calc', name: '生肖星座', icon: 'linggan', type: 'transform', keywords: '生肖 星座 运势 生日',
      transform: function (t) {
        const m = t.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (!m) return '请输入日期，如 2002-06-15';
        const year = +m[1], month = +m[2], day = +m[3];
        const animals = '鼠牛虎兔龙蛇马羊猴鸡狗猪';
        const zodiac = animals[(year - 4) % 12] + '（' + year + ' 年生）';
        const signs = [
          [1, 20, '摩羯座'], [2, 19, '水瓶座'], [3, 21, '双鱼座'], [4, 20, '白羊座'],
          [5, 21, '金牛座'], [6, 22, '双子座'], [7, 23, '巨蟹座'], [8, 23, '狮子座'],
          [9, 23, '处女座'], [10, 23, '天秤座'], [11, 22, '天蝎座'], [12, 22, '射手座'],
        ];
        let sign = '摩羯座';
        for (let i = 0; i < 12; i++) {
          const nm = i + 1;
          if (month === nm) sign = day < signs[i][1] ? signs[(i + 11) % 12][2] : signs[i][2];
        }
        return year + '-' + month + '-' + day + '\n生肖：' + zodiac + '\n星座：' + sign;
      },
      inputPlaceholder: '2002-06-15',
      tip: '生肖按公历年份估算，精确到农历新年前后会有偏差。',
    },
    {
      id: 'download', cat: 'calc', name: '下载时间估算', icon: 'download', type: 'transform', keywords: '网速 带宽 下载 多久',
      options: [{ key: 'bw', label: '带宽', type: 'select', values: [['10', '10 Mbps'], ['50', '50 Mbps'], ['100', '100 Mbps（千兆宽带）'], ['300', '300 Mbps'], ['1000', '1000 Mbps'], ['5', '5 Mbps'], ['20', '20 Mbps']] }],
      transform: function (t, o) {
        const m = t.trim().match(/^([\d.]+)\s*(B|KB|MB|GB|TB)$/i);
        if (!m) return '请输入文件大小，如 1.5GB、800MB、10KB';
        const mult = { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 };
        const bytes = parseFloat(m[1]) * mult[m[2].toUpperCase()];
        const mbps = parseFloat(o.bw);
        const seconds = bytes * 8 / (mbps * 1000000);
        let out;
        if (seconds < 1) out = (seconds * 1000).toFixed(0) + ' 毫秒';
        else if (seconds < 60) out = seconds.toFixed(1) + ' 秒';
        else if (seconds < 3600) out = Math.floor(seconds / 60) + ' 分 ' + Math.round(seconds % 60) + ' 秒';
        else out = Math.floor(seconds / 3600) + ' 时 ' + Math.round(seconds % 3600 / 60) + ' 分';
        return '文件 ' + m[1] + m[2].toUpperCase() + ' @ ' + mbps + ' Mbps（理论峰值）\n预计：' + out;
      },
      inputPlaceholder: '1.5GB',
    },
    {
      id: 'aspect', cat: 'calc', name: '宽高比计算', icon: 'filter-picture', type: 'transform', keywords: '比例 16:9 分辨率 视频',
      transform: function (t) {
        const m = t.trim().match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
        if (!m) return '请输入分辨率，如 1920x1080';
        const w = +m[1], h = +m[2];
        function gcd(a, b) { return b ? gcd(b, a % b) : a; }
        const g = gcd(w, h) || 1;
        const presets = [[16, 9], [4, 3], [21, 9], [1, 1]];
        let nearest = '';
        let bestDiff = Infinity;
        presets.forEach(function (p) {
          const diff = Math.abs(w / h - p[0] / p[1]);
          if (diff < bestDiff) { bestDiff = diff; nearest = p[0] + ':' + p[1]; }
        });
        return w + '×' + h + '\n最简比：' + (w / g) + ':' + (h / g) +
          '\n最接近常见比例：' + nearest + '（误差 ' + (bestDiff * 100).toFixed(1) + '%）';
      },
      inputPlaceholder: '1920x1080',
    },
    {
      id: 'weeknum', cat: 'calc', name: '星期 · 周数推算', icon: 'calendar-days', type: 'transform', keywords: '第几周 星期几 日期',
      transform: function (t) {
        const m = t.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (!m) return '请输入日期，如 2026-09-06';
        const d = new Date(+m[1], +m[2] - 1, +m[3]);
        if (isNaN(d)) return '日期无效';
        const week = '日一二三四五六'[d.getDay()];
        // ISO 8601 周数
        const target = new Date(d.valueOf());
        const dayNr = (d.getDay() + 6) % 7;
        target.setDate(target.getDate() - dayNr + 3);
        const firstThursday = new Date(target.getFullYear(), 0, 4);
        const fDayNr = (firstThursday.getDay() + 6) % 7;
        firstThursday.setDate(firstThursday.getDate() - fDayNr + 3);
        const weekNum = 1 + Math.round((target - firstThursday) / (7 * 86400000));
        const start = new Date(d.getFullYear(), 0, 0);
        const dayOfYear = Math.floor((d - start) / 86400000);
        return t + '\n星期' + week + ' · ISO 第 ' + weekNum + ' 周 · 一年中第 ' + dayOfYear + ' 天';
      },
      inputPlaceholder: '2026-09-06',
    },
    { id: 'countdown', cat: 'calc', name: '倒计时', icon: 'stopwatch', type: 'custom', keywords: '考试 倒计时 计时' },

    /* ---------------- 随机生成 ---------------- */
    { id: 'qrcode', cat: 'random', name: '二维码生成', icon: 'qrcode', type: 'custom', keywords: '扫码 qr 链接' },
    { id: 'wifiqr', cat: 'random', name: 'WiFi 二维码', icon: 'qrcode', type: 'custom', keywords: 'wifi 扫码连网 分享' },
    { id: 'password', cat: 'random', name: '密码生成', icon: 'dice', type: 'custom', keywords: '密码 随机 强度' },
    { id: 'uuid', cat: 'random', name: 'UUID 生成', icon: 'circle-dot', type: 'custom', keywords: 'guid 唯一 id' },
    { id: 'randnum', cat: 'random', name: '随机数', icon: 'dice', type: 'custom', keywords: '随机 抽号 数字' },
    { id: 'dice', cat: 'random', name: '掷骰抛硬币', icon: 'dice-d20', type: 'custom', keywords: '硬币 骰子 决定' },
    { id: 'shuffle', cat: 'random', name: '顺序打乱', icon: 'shuffle', type: 'custom', keywords: '洗牌 顺序 随机排序' },
    { id: 'lottery', cat: 'random', name: '抽签抽奖', icon: 'hand-heart-fill', type: 'custom', keywords: '抽奖 中奖 随机抽取' },
    { id: 'group', cat: 'random', name: '团队分组', icon: 'comments', type: 'custom', keywords: '分组 随机组队' },

    /* ---------------- 设计辅助 ---------------- */
    { id: 'color', cat: 'design', name: '颜色工具', icon: 'filter-picture', type: 'custom', keywords: 'hex rgb hsl 色阶 对比度 wcag' },
    { id: 'palette', cat: 'design', name: '随机配色', icon: 'images', type: 'custom', keywords: '配色 色板 灵感' },

    /* ---------------- 查询参考 ---------------- */
    {
      id: 'http', cat: 'lookup', name: 'HTTP 状态码', icon: 'circle-info', type: 'lookup', keywords: '404 500 状态码',
      cols: ['状态码', '名称', '含义'],
      rows: [
        ['100', 'Continue', '继续，客户端应继续发送请求体'], ['101', 'Switching Protocols', '切换协议（如升级 WebSocket）'],
        ['200', 'OK', '请求成功'], ['201', 'Created', '已创建（通常是 POST/PUT 成功）'],
        ['204', 'No Content', '成功但无返回体'], ['206', 'Partial Content', '部分内容（断点续传）'],
        ['301', 'Moved Permanently', '永久重定向'], ['302', 'Found', '临时重定向'],
        ['304', 'Not Modified', '缓存有效，用本地副本'], ['307', 'Temporary Redirect', '临时重定向（保持方法）'],
        ['308', 'Permanent Redirect', '永久重定向（保持方法）'], ['400', 'Bad Request', '请求参数错误'],
        ['401', 'Unauthorized', '未认证（没登录/token 失效）'], ['403', 'Forbidden', '已认证但无权限'],
        ['404', 'Not Found', '资源不存在'], ['405', 'Method Not Allowed', '请求方法不被允许'],
        ['408', 'Request Timeout', '请求超时'], ['409', 'Conflict', '资源冲突'],
        ['410', 'Gone', '资源已永久删除'], ['413', 'Payload Too Large', '请求体过大'],
        ['415', 'Unsupported Media Type', '不支持的媒体类型'], ['418', "I'm a teapot", '我是茶壶（彩蛋）'],
        ['422', 'Unprocessable Entity', '格式正确但语义错误'], ['429', 'Too Many Requests', '请求过于频繁（限流）'],
        ['431', 'Headers Too Large', '请求头过大'], ['451', 'Unavailable For Legal Reasons', '因法律原因不可用'],
        ['500', 'Internal Server Error', '服务器内部错误'], ['501', 'Not Implemented', '功能未实现'],
        ['502', 'Bad Gateway', '网关收到无效响应（后端挂了）'], ['503', 'Service Unavailable', '服务暂不可用'],
        ['504', 'Gateway Timeout', '网关等待后端超时'], ['505', 'HTTP Version Not Supported', 'HTTP 版本不支持'],
      ],
      tip: '点击任意行复制状态码。',
    },
    {
      id: 'mime', cat: 'lookup', name: 'MIME 对照', icon: 'file-lines', type: 'lookup', keywords: 'content-type 文件类型',
      cols: ['扩展名', 'MIME 类型'],
      rows: [
        ['.html', 'text/html'], ['.css', 'text/css'], ['.js', 'text/javascript'], ['.mjs', 'text/javascript'],
        ['.json', 'application/json'], ['.txt', 'text/plain'], ['.csv', 'text/csv'], ['.xml', 'application/xml'],
        ['.png', 'image/png'], ['.jpg/.jpeg', 'image/jpeg'], ['.gif', 'image/gif'], ['.webp', 'image/webp'],
        ['.svg', 'image/svg+xml'], ['.ico', 'image/x-icon'], ['.avif', 'image/avif'],
        ['.mp4', 'video/mp4'], ['.webm', 'video/webm'], ['.mov', 'video/quicktime'],
        ['.mp3', 'audio/mpeg'], ['.wav', 'audio/wav'], ['.ogg', 'audio/ogg'],
        ['.pdf', 'application/pdf'], ['.zip', 'application/zip'], ['.gz', 'application/gzip'],
        ['.wasm', 'application/wasm'], ['.woff', 'font/woff'], ['.woff2', 'font/woff2'],
        ['.ttf', 'font/ttf'], ['.otf', 'font/otf'],
        ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
      ],
    },
    {
      id: 'ascii', cat: 'lookup', name: 'ASCII 对照表', icon: 'keyboard', type: 'lookup', keywords: '字符编码 十进制 十六进制',
      cols: ['十进制', '十六进制', '字符'],
      rows: (function () {
        const rows = [[0, '0x00', 'NUL'], [9, '0x09', 'TAB'], [10, '0x0A', 'LF'], [13, '0x0D', 'CR']];
        for (let i = 32; i <= 126; i++) {
          rows.push([i, '0x' + i.toString(16).toUpperCase().padStart(2, '0'), String.fromCharCode(i)]);
        }
        return rows;
      })(),
    },
    {
      id: 'symbols', cat: 'lookup', name: '符号 · 实体表', icon: 'font', type: 'lookup', keywords: '特殊符号 html 实体 复制',
      cols: ['符号', 'HTML 实体', '名称'],
      rows: [
        ['×', '&times;', '乘号'], ['÷', '&divide;', '除号'], ['±', '&plusmn;', '正负号'],
        ['≤', '&le;', '小于等于'], ['≥', '&ge;', '大于等于'], ['≠', '&ne;', '不等于'],
        ['≈', '&asymp;', '约等于'], ['∞', '&infin;', '无穷'], ['°', '&deg;', '度'],
        ['℃', '&#8451;', '摄氏度'], ['→', '&rarr;', '向右箭头'], ['←', '&larr;', '向左箭头'],
        ['↑', '&uarr;', '向上箭头'], ['↓', '&darr;', '向下箭头'], ['★', '&#9733;', '实心星'],
        ['☆', '&#9734;', '空心星'], ['●', '&bull;', '实心圆'], ['○', '&#9675;', '空心圆'],
        ['§', '&sect;', '章节号'], ['¶', '&para;', '段落符'], ['©', '&copy;', '版权'],
        ['®', '&reg;', '注册商标'], ['™', '&trade;', '商标'], ['…', '&hellip;', '省略号'],
        ['—', '&mdash;', '破折号'], ['–', '&ndash;', '短破折号'], ['·', '&middot;', '间隔号'],
        ['‘', '&lsquo;', '左单引号'], ['’', '&rsquo;', '右单引号'], ['“', '&ldquo;', '左双引号'],
        ['”', '&rdquo;', '右双引号'], ['«', '&laquo;', '左书名号'], ['»', '&raquo;', '右书名号'],
      ],
      tip: '点击行复制符号本身。',
    },
    {
      id: 'dialcodes', cat: 'lookup', name: '国家区号', icon: 'location-dot', type: 'lookup', keywords: '电话 区号 国际',
      cols: ['国家/地区', '区号'],
      rows: [
        ['中国', '+86'], ['中国香港', '+852'], ['中国澳门', '+853'], ['中国台湾', '+886'],
        ['日本', '+81'], ['韩国', '+82'], ['新加坡', '+65'], ['马来西亚', '+60'],
        ['泰国', '+66'], ['越南', '+84'], ['菲律宾', '+63'], ['印度尼西亚', '+62'],
        ['印度', '+91'], ['美国/加拿大', '+1'], ['英国', '+44'], ['法国', '+33'],
        ['德国', '+49'], ['意大利', '+39'], ['西班牙', '+34'], ['俄罗斯', '+7'],
        ['澳大利亚', '+61'], ['新西兰', '+64'], ['阿联酋', '+971'], ['沙特阿拉伯', '+966'],
        ['巴西', '+55'], ['阿根廷', '+54'], ['墨西哥', '+52'], ['南非', '+27'],
        ['埃及', '+20'], ['尼日利亚', '+234'],
      ],
    },
    {
      id: 'clothsize', cat: 'lookup', name: '衣服尺码对照', icon: 'tag', type: 'lookup', keywords: '尺码 男装 女装 身高 胸围',
      cols: ['适用', '尺码', '身高(cm)', '胸围(cm)'],
      rows: [
        ['男装', 'S', '160 - 165', '84 - 88'], ['男装', 'M', '166 - 170', '88 - 92'],
        ['男装', 'L', '171 - 175', '92 - 96'], ['男装', 'XL', '176 - 180', '96 - 102'],
        ['男装', 'XXL', '181 - 185', '102 - 108'], ['男装', '3XL', '186 以上', '108 以上'],
        ['女装', 'S', '155 - 160', '78 - 82'], ['女装', 'M', '158 - 162', '82 - 86'],
        ['女装', 'L', '160 - 166', '86 - 92'], ['女装', 'XL', '165 - 170', '92 - 98'],
      ],
      tip: '为通用参考值，不同品牌存在差异，购买前以商品详情为准。',
    },
    {
      id: 'papersize', cat: 'lookup', name: '纸张尺寸', icon: 'copy', type: 'lookup', keywords: 'a4 b5 尺寸 打印',
      cols: ['规格', '尺寸(mm)', '尺寸(inch)'],
      rows: [
        ['A0', '841 × 1189', '33.1 × 46.8'], ['A1', '594 × 841', '23.4 × 33.1'],
        ['A2', '420 × 594', '16.5 × 23.4'], ['A3', '297 × 420', '11.7 × 16.5'],
        ['A4', '210 × 297', '8.3 × 11.7'], ['A5', '148 × 210', '5.8 × 8.3'],
        ['A6', '105 × 148', '4.1 × 5.8'], ['B4', '257 × 364', '10.1 × 14.3'],
        ['B5', '176 × 250', '6.9 × 9.8'], ['B6', '125 × 176', '4.9 × 6.9'],
        ['Letter', '216 × 279', '8.5 × 11.0'], ['Legal', '216 × 356', '8.5 × 14.0'],
      ],
    },
    {
      id: 'screensize', cat: 'lookup', name: '屏幕分辨率速查', icon: 'window-restore', type: 'lookup', keywords: '分辨率 设备 iphone 安卓 4k',
      cols: ['设备', '分辨率(px)', '比例'],
      rows: [
        ['iPhone SE', '750 × 1334', '9:16'], ['iPhone 15 / 14', '1179 × 2556', '9:19.5'],
        ['iPhone 15 Pro Max', '1290 × 2796', '9:19.5'], ['常见安卓', '1080 × 2400', '9:20'],
        ['安卓旗舰', '1440 × 3200', '9:20'], ['iPad mini', '1488 × 2266', '3:4.6'],
        ['iPad Pro 11"', '1668 × 2388', '3:4.3'], ['MacBook Air 13"', '2560 × 1664', '16:10.4'],
        ['全高清显示器', '1920 × 1080', '16:9'], ['2K 显示器', '2560 × 1440', '16:9'],
        ['4K 显示器', '3840 × 2160', '16:9'], ['带鱼屏', '3440 × 1440', '21.5:9'],
      ],
      tip: '为物理像素参考，前端做适配时注意除以 devicePixelRatio 得逻辑像素。',
    },
    {
      id: 'greek', cat: 'lookup', name: '希腊字母表', icon: 'language', type: 'lookup', keywords: 'alpha beta 希腊 字母',
      cols: ['大写', '小写', '读音'],
      rows: [
        ['Α', 'α', 'Alpha'], ['Β', 'β', 'Beta'], ['Γ', 'γ', 'Gamma'], ['Δ', 'δ', 'Delta'],
        ['Ε', 'ε', 'Epsilon'], ['Ζ', 'ζ', 'Zeta'], ['Η', 'η', 'Eta'], ['Θ', 'θ', 'Theta'],
        ['Ι', 'ι', 'Iota'], ['Κ', 'κ', 'Kappa'], ['Λ', 'λ', 'Lambda'], ['Μ', 'μ', 'Mu'],
        ['Ν', 'ν', 'Nu'], ['Ξ', 'ξ', 'Xi'], ['Ο', 'ο', 'Omicron'], ['Π', 'π', 'Pi'],
        ['Ρ', 'ρ', 'Rho'], ['Σ', 'σ', 'Sigma'], ['Τ', 'τ', 'Tau'], ['Υ', 'υ', 'Upsilon'],
        ['Φ', 'φ', 'Phi'], ['Χ', 'χ', 'Chi'], ['Ψ', 'ψ', 'Psi'], ['Ω', 'ω', 'Omega'],
      ],
      tip: '点击行复制小写字母。',
    },

    /* ================= P2 新增：开发助手 ================= */
    { id: 'urlparam', cat: 'dev', name: 'URL 参数解析', icon: 'paste', type: 'custom', keywords: 'query 参数 查询串 解析 url' },
    { id: 'mock', cat: 'dev', name: 'Mock 数据生成', icon: 'shapes', type: 'custom', keywords: '假数据 测试数据 姓名 手机 json mock' },
    {
      id: 'uaparse', cat: 'dev', name: 'UA 解析', icon: 'window-restore', type: 'transform', keywords: 'user agent 浏览器 系统 判断',
      inputPlaceholder: 'Mozilla/5.0 …',
      transform: function (raw) { return parseUA(raw); },
    },
    {
      id: 'json2csv', cat: 'dev', name: 'JSON ⇄ CSV', icon: 'repeat', type: 'transform', keywords: 'csv 表格 excel 转换 json',
      options: [{ key: 'dir', label: '方向', type: 'select', values: [['j2c', 'JSON → CSV'], ['c2j', 'CSV → JSON']] }],
      transform: function (raw, o) { return o.dir === 'c2j' ? csv2jsonConvert(raw) : json2csvConvert(raw); },
    },
    {
      id: 'ipnet', cat: 'dev', name: 'IP 子网计算', icon: 'location-dot', type: 'transform', keywords: 'cidr 掩码 网段 广播 子网划分 网络',
      inputPlaceholder: '192.168.1.6/24',
      transform: function (raw) { return ipnetConvert(raw); },
    },

    /* ================= P2 新增：编码转换 ================= */
    {
      id: 'urlencode', cat: 'encode', name: 'URL 编码', icon: 'arrows-left-right', type: 'transform', keywords: 'url encode decode %20 转码 中文参数',
      options: [{ key: 'mode', label: '模式', type: 'select', values: [['ec', '编码（组件）'], ['e', '编码（整段 URL）'], ['dc', '解码（组件）'], ['d', '解码（整段）']] }],
      transform: function (raw, o) {
        try {
          if (o.mode === 'e') return encodeURI(raw);
          if (o.mode === 'd') return decodeURI(raw);
          if (o.mode === 'dc') return decodeURIComponent(raw);
          return encodeURIComponent(raw);
        } catch (e) { return '解码失败：输入可能不是合法的编码串'; }
      },
    },
    {
      id: 'entity', cat: 'encode', name: 'HTML 实体转换', icon: 'shapes', type: 'transform', keywords: '实体 nbsp &amp 转义 解码 html',
      options: [{ key: 'mode', label: '模式', type: 'select', values: [['enc', '编码'], ['dec', '解码']] }],
      transform: function (raw, o) {
        if (o.mode === 'dec') {
          const map = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', middot: '·', times: '×', divide: '÷', deg: '°', laquo: '«', raquo: '»' };
          return raw.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, function (all, body) {
            if (body[0] === '#') {
              const num = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
              return isNaN(num) ? all : String.fromCodePoint(num);
            }
            return map[body.toLowerCase()] !== undefined ? map[body.toLowerCase()] : all;
          });
        }
        return raw.replace(/[&<>"'\u00a9\u00ae\u2122\u2026\u2014\u00b7]/g, function (ch) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '©': '&copy;', '®': '&reg;', '™': '&trade;', '…': '&hellip;', '—': '&mdash;', '·': '&middot;' }[ch];
        });
      },
    },
    {
      id: 'binhex', cat: 'encode', name: '文本 ↔ 十六进制', icon: 'hashtag', type: 'transform', keywords: 'hex 二进制 字节 utf-8 编码 转换',
      options: [
        { key: 'mode', label: '方向', type: 'select', values: [['enc', '文本 → 字节'], ['dec', '字节 → 文本']] },
        { key: 'base', label: '进制', type: 'select', values: [['hex', '十六进制'], ['bin', '二进制']] },
      ],
      transform: function (raw, o) { return textBaseConvert(raw, o); },
    },

    /* ================= P2 新增：文本处理 ================= */
    {
      id: 'indent', cat: 'text', name: '缩进转换', icon: 'list-ul', type: 'transform', keywords: 'tab 空格 缩进 2 4 格式化 代码',
      options: [{ key: 'mode', label: '方向', type: 'select', values: [['t2s4', 'Tab → 4 空格'], ['t2s2', 'Tab → 2 空格'], ['s2t', '空格 → Tab（每 4 格）'], ['s2t2', '空格 → Tab（每 2 格）']] }],
      transform: function (raw, o) {
        return raw.split('\n').map(function (line) {
          if (o.mode === 't2s4') return line.replace(/\t/g, '    ');
          if (o.mode === 't2s2') return line.replace(/\t/g, '  ');
          const n = o.mode === 's2t2' ? 2 : 4;
          return line.replace(/^( +)/, function (_, sp) {
            return '\t'.repeat(Math.floor(sp.length / n)) + ' '.repeat(sp.length % n);
          });
        }).join('\n');
      },
    },
    {
      id: 'affix', cat: 'text', name: '行前后缀', icon: 'pencil', type: 'transform', keywords: '加前缀 加后缀 拼接 引号 逗号 批量 数组',
      options: [
        { key: 'pre', label: '行首加', type: 'text', placeholder: '如 " 或 - ' },
        { key: 'suf', label: '行尾加', type: 'text', placeholder: '如 ", 或 ;' },
        { key: 'skipEmpty', label: '跳过空行', type: 'checkbox', checked: true },
      ],
      transform: function (raw, o) {
        return raw.split('\n').map(function (line) {
          if (o.skipEmpty && !line.trim()) return line;
          return (o.pre || '') + line + (o.suf || '');
        }).join('\n');
      },
    },

    /* ================= P2 新增：日常计算 ================= */
    { id: 'loan', cat: 'calc', name: '贷款计算', icon: 'copyright', type: 'custom', keywords: '房贷 月供 等额本息 等额本金 利息' },
    { id: 'discount', cat: 'calc', name: '折扣比价', icon: 'chart-line', type: 'custom', keywords: '满减 促销 第二件半价 省钱 单价' },
    { id: 'scalc', cat: 'calc', name: '科学计算器', icon: 'square-poll-vertical', type: 'custom', keywords: '计算器 三角函数 开方 乘方 表达式' },
    { id: 'bmr', cat: 'calc', name: 'BMR 热量', icon: 'heartbeat', type: 'custom', keywords: '基础代谢 tdee 减脂 增肌 卡路里' },
    { id: 'geometry', cat: 'calc', name: '几何计算', icon: 'shapes', type: 'custom', keywords: '面积 周长 体积 圆 三角形 圆柱' },

    /* ================= P2 新增：随机生成 ================= */
    { id: 'cname', cat: 'random', name: '随机姓名', icon: 'linggan', type: 'custom', keywords: '中文名 起名 笔名 角色' },
    { id: 'eat', cat: 'random', name: '今天吃什么', icon: 'dice-d20', type: 'custom', keywords: '吃饭 选择困难 摇一摇 午饭 晚饭' },

    /* ================= P2 新增：设计辅助 ================= */
    { id: 'gradient', cat: 'design', name: '渐变生成', icon: 'filter-picture', type: 'custom', keywords: 'linear-gradient radial 渐变色 css' },
    { id: 'boxshadow', cat: 'design', name: 'Box-Shadow 生成', icon: 'window-restore', type: 'custom', keywords: '阴影 投影 css box-shadow' },
    { id: 'favicon', cat: 'design', name: 'Favicon 生成', icon: 'images', type: 'custom', keywords: '站点图标 网站图标 png 下载' },
    { id: 'placeholder', cat: 'design', name: '占位图生成', icon: 'copy', type: 'custom', keywords: 'placeholder 假图 svg png 原型' },

    /* ================= P2 新增：查询参考 ================= */
    {
      id: 'cron', cat: 'lookup', name: 'Cron 表达式速查', icon: 'clock', type: 'lookup', keywords: '定时 任务 crontab 调度 计划',
      cols: ['表达式', '含义'],
      rows: [
        ['* * * * *', '每分钟'],
        ['*/5 * * * *', '每 5 分钟'],
        ['0 * * * *', '每小时整点'],
        ['0 9 * * *', '每天 9:00'],
        ['0 9-18 * * *', '每天 9:00 到 18:00 整点'],
        ['30 8 * * 1-5', '工作日 8:30'],
        ['0 0 * * 0', '每周日 0:00'],
        ['0 0 1 * *', '每月 1 号 0:00'],
        ['0 0 1 1 *', '每年 1 月 1 日 0:00'],
        ['0 */2 * * *', '每 2 小时'],
        ['0 0 */3 * *', '每 3 天 0:00'],
        ['0 12 15 * *', '每月 15 号 12:00'],
        ['0 0 * * 1', '每周一 0:00'],
        ['0 30 2 * * *', '每天 2:30（六位，含秒，Quartz）'],
        ['0 0 0 L * *', '每月最后一天（Quartz）'],
      ],
      tip: '五个字段依次为：分 时 日 月 周（0/7 都表示周日）。',
    },
    {
      id: 'keycode', cat: 'lookup', name: 'KeyCode 速查', icon: 'keyboard', type: 'lookup', keywords: '键盘按键 keydown 事件 键值 event',
      cols: ['按键', 'event.key', 'event.code', 'keyCode'],
      rows: [
        ['回车', 'Enter', 'Enter', '13'],
        ['Esc', 'Escape', 'Escape', '27'],
        ['空格', "' '", 'Space', '32'],
        ['退格', 'Backspace', 'Backspace', '8'],
        ['Tab', 'Tab', 'Tab', '9'],
        ['↑', 'ArrowUp', 'ArrowUp', '38'],
        ['↓', 'ArrowDown', 'ArrowDown', '40'],
        ['←', 'ArrowLeft', 'ArrowLeft', '37'],
        ['→', 'ArrowRight', 'ArrowRight', '39'],
        ['Shift', 'Shift', 'ShiftLeft/Right', '16'],
        ['Ctrl', 'Control', 'ControlLeft/Right', '17'],
        ['Alt', 'Alt', 'AltLeft/Right', '18'],
        ['0-9', "'0'-'9'", 'Digit0-9', '48-57'],
        ['a-z', "'a'-'z'", 'KeyA-KeyZ', '65-90'],
        ['F1', 'F1', 'F1', '112'],
        ['Delete', 'Delete', 'Delete', '46'],
        ['Insert', 'Insert', 'Insert', '45'],
        ['Home / End', 'Home / End', 'Home / End', '36 / 35'],
        ['PageUp / Down', 'PageUp / PageDown', 'PageUp / PageDown', '33 / 34'],
        ['CapsLock', 'CapsLock', 'CapsLock', '20'],
        ['; :', "';' / ':'", 'Semicolon', '186'],
        ['= +', "'=' / '+'", 'Equal', '187'],
        [', <', "',' / '<'", 'Comma', '188'],
        ['- _', "'-' / '_'", 'Minus', '189'],
        ['. >', "'.' / '>'", 'Period', '190'],
        ['/ ?', "'/' / '?'", 'Slash', '191'],
        ['[ {', "'[' / '{'", 'BracketLeft', '219'],
        ['] }', "']' / '}'", 'BracketRight', '221'],
      ],
      tip: '新项目建议用 event.key 或 event.code，keyCode 已废弃但兼容场景仍在。',
    },
    {
      id: 'regexref', cat: 'lookup', name: '正则语法速查', icon: 'hashtag', type: 'lookup', keywords: '正则 表达式 语法 元字符 regex',
      cols: ['语法', '说明', '示例'],
      rows: [
        ['.（点）', '任意单个字符（除换行）', 'a.c → abc/axc'],
        ['\\d / \\D', '数字 / 非数字', '\\d+ → 123'],
        ['\\w / \\W', '字母数字下划线 / 反之', '\\w+ → hello_1'],
        ['\\s / \\S', '空白 / 非空白', 'a\\sb → a b'],
        ['\\b', '单词边界', '\\bcat\\b → 独立的 cat'],
        ['^ / $', '行首 / 行尾', '^abc$ → 整行是 abc'],
        ['* / + / ?', '0+ / 1+ / 0 或 1 次', 'go*gle → ggle'],
        ['{n} / {n,m}', '恰好 n 次 / n 到 m 次', '\\d{3,5}'],
        ['[abc]', '字符集合之一', '[aeiou]'],
        ['[^abc]', '除 abc 以外', '[^0-9]'],
        ['[a-z0-9]', '范围组合', '[a-zA-Z0-9]'],
        ['(abc)', '分组捕获', '(ab)+ → abab'],
        ['(?:abc)', '分组不捕获', '(?:ab)+'],
        ['a|b', '或', 'cat|dog'],
        ['(?=x) / (?!x)', '前瞻：后面是/不是 x', '\\d+(?=元)'],
        ['(?<=x) / (?<!x)', '后顾：前面是/不是 x', '(?<=￥)\\d+'],
        ['*? / +?', '惰性匹配（尽量少）', '<.+?>'],
        ['\\n / \\t', '换行 / 制表符', ''],
        ['i / g / m / s / u', '标志：忽略大小写/全局/多行/点匹配换行/unicode', '/abc/gi'],
        ['$1 ~ $9', '替换中的捕获组引用', 'replace(/(a)(b)/, "$2$1")'],
      ],
      tip: '测试语法请配合「正则测试」工具实时验证。',
    },
    {
      id: 'gitref', cat: 'lookup', name: 'Git 命令速查', icon: 'github', type: 'lookup', keywords: 'git 命行 版本控制 分支 回滚 合并',
      cols: ['命令', '作用'],
      rows: [
        ['git status', '查看工作区状态'],
        ['git log --oneline --graph', '简洁图形化历史'],
        ['git add -p', '分块暂存（逐块确认）'],
        ['git commit --amend', '修改上一次提交'],
        ['git restore <file>', '丢弃工作区改动'],
        ['git restore --staged <file>', '取消暂存'],
        ['git reset --soft HEAD~1', '撤销上次提交（保留改动）'],
        ['git reset --hard HEAD~1', '撤销上次提交（连改动一起丢，慎用）'],
        ['git revert <commit>', '用新提交抵消某次提交（安全回滚）'],
        ['git switch -c <branch>', '新建并切换分支'],
        ['git branch -d <branch>', '删除分支'],
        ['git merge --no-ff <branch>', '合并并保留合并节点'],
        ['git rebase <branch>', '变基到目标分支'],
        ['git rebase -i HEAD~3', '交互式整理最近 3 个提交'],
        ['git cherry-pick <commit>', '摘取单个提交到当前分支'],
        ['git stash / stash pop', '暂存工作区 / 恢复'],
        ['git remote -v', '查看远程仓库'],
        ['git push origin --delete <branch>', '删除远程分支'],
        ['git fetch --prune', '同步并清理已删除的远程分支'],
        ['git diff HEAD', '对比上次提交的所有差异'],
        ['git blame <file>', '查看每行最后修改者'],
        ['git bisect start', '二分查找引入 bug 的提交'],
        ['git reflog', '找回"丢失"的提交'],
        ['git tag -a v1.0 -m "msg"', '创建附注标签'],
      ],
      tip: '点击行复制命令。',
    },
    {
      id: 'mdref', cat: 'lookup', name: 'Markdown 速查', icon: 'font', type: 'lookup', keywords: 'markdown 语法 md 写作 教程',
      cols: ['语法', '效果', '写法'],
      rows: [
        ['# ~ ######', '一 ~ 六级标题', '# 标题文字'],
        ['**文字**', '加粗', '**加粗**'],
        ['*文字*', '斜体', '*斜体*'],
        ['~~文字~~', '删除线', '~~删除~~'],
        ['`代码`', '行内代码', '`code`'],
        ['``` 代码块', '围栏代码块', '```js ... ```'],
        ['> 文字', '引用', '> 一段引用'],
        ['- 项目', '无序列表', '- 项目（+/* 也可）'],
        ['1. 项目', '有序列表', '1. 项目'],
        ['- [ ] 任务', '任务列表', '- [ ] 未完成 / - [x] 完成'],
        ['[文字](url)', '链接', '[博客](https://example.com)'],
        ['![alt](src)', '图片', '![](img.png)'],
        ['--- / ***', '分割线', '---'],
        ['| a | b |', '表格', '表头 + |---|---| 分隔行'],
        ['文字^[注]', '脚注（部分渲染器）', '说明^[1]'],
        ['<br>', '强制换行', '上一行末尾加两空格也可'],
      ],
      tip: '点击行复制写法。',
    },
    {
      id: 'htmlref', cat: 'lookup', name: 'HTML 标签速查', icon: 'file-lines', type: 'lookup', keywords: 'html 标签 元素 语义 网页',
      cols: ['标签', '说明', '常用属性'],
      rows: [
        ['<div> / <span>', '通用块级 / 行内容器', 'class, id, style'],
        ['<header> <footer>', '页头 / 页脚（语义）', '—'],
        ['<nav> <main> <aside>', '导航 / 主体 / 侧栏（语义）', '—'],
        ['<article> <section>', '独立文章 / 内容分区', '—'],
        ['<h1> ~ <h6>', '标题层级（每页一个 h1）', '—'],
        ['<p>', '段落', '—'],
        ['<a>', '超链接', 'href, target, rel'],
        ['<img>', '图片', 'src, alt, loading="lazy"'],
        ['<picture> <source>', '响应式图片', 'srcset, media'],
        ['<video> <audio>', '媒体播放', 'controls, autoplay, poster'],
        ['<ul> <ol> <li>', '无序 / 有序列表', 'type'],
        ['<table> <tr> <td> <th>', '表格', 'colspan, rowspan'],
        ['<form>', '表单容器', 'action, method'],
        ['<input>', '输入控件', 'type, name, required, placeholder'],
        ['<textarea>', '多行文本', 'rows, maxlength'],
        ['<select> <option>', '下拉选择', 'multiple, selected'],
        ['<button>', '按钮', 'type="button/submit"'],
        ['<label>', '控件标签（提升无障碍）', 'for'],
        ['<canvas>', '位图画布（JS 绘制）', 'width, height'],
        ['<svg>', '矢量图', 'viewBox, fill'],
        ['<iframe>', '内嵌页面', 'src, loading, sandbox'],
        ['<script>', '脚本', 'src, defer, async, type="module"'],
        ['<link>', '外部资源（样式/图标）', 'rel, href'],
        ['<meta>', '文档元信息', 'charset, name, content, viewport'],
        ['<blockquote> <q>', '块引用 / 行内引用', 'cite'],
        ['<pre> <code>', '预格式文本 / 代码', '—'],
        ['<time>', '机器可读时间', 'datetime'],
        ['<details> <summary>', '折叠面板（零 JS）', 'open'],
      ],
      tip: '优先使用语义化标签，利于 SEO 与无障碍。',
    },
    {
      id: 'port', cat: 'lookup', name: '常用端口速查', icon: 'stream', type: 'lookup', keywords: '端口 port 服务器 网络 协议',
      cols: ['端口', '协议/服务', '说明'],
      rows: [
        ['20 / 21', 'FTP', '文件传输（数据 / 控制）'],
        ['22', 'SSH / SCP / SFTP', '加密远程登录，服务器标配'],
        ['23', 'Telnet', '明文远程登录（已淘汰）'],
        ['25', 'SMTP', '发邮件'],
        ['53', 'DNS', '域名解析'],
        ['67 / 68', 'DHCP', '自动分配 IP'],
        ['80', 'HTTP', '网页'],
        ['110', 'POP3', '收邮件'],
        ['143', 'IMAP', '收邮件（同步）'],
        ['443', 'HTTPS', '加密网页'],
        ['465 / 587', 'SMTPS / SMTP 提交', '加密发邮件'],
        ['6379', 'Redis', '缓存数据库'],
        ['8080', 'HTTP 备用', '常见于开发/代理'],
        ['8443', 'HTTPS 备用', '常见于开发环境'],
        ['9200', 'Elasticsearch', '搜索引擎'],
        ['27017', 'MongoDB', '文档数据库'],
        ['3306', 'MySQL', '数据库'],
        ['3389', 'RDP', 'Windows 远程桌面'],
        ['5432', 'PostgreSQL', '数据库'],
        ['1433', 'SQL Server', '数据库'],
        ['27015', '游戏服务器', 'Source 引擎游戏'],
        ['1194', 'OpenVPN', 'VPN'],
        ['1080', 'SOCKS 代理', '代理常用'],
        ['3000 / 5173', '开发服务器', 'Node/React/Vite 默认'],
        ['4000', 'Hexo 本地预览', 'hexo server 默认'],
      ],
      tip: '10000+ 端口为动态/私有范围，自己起服务建议用 4 位数以上。',
    },
    {
      id: 'shoesize', cat: 'lookup', name: '鞋码对照', icon: 'tag', type: 'lookup', keywords: '鞋码 码数 尺码 脚长 购鞋',
      cols: ['中国码', 'US 男', 'US 女', 'UK', 'EU', '脚长(cm)'],
      rows: [
        ['225 (35)', '4', '5.5', '3', '36', '22.5'],
        ['230 (36)', '4.5', '6', '3.5', '36.5', '23.0'],
        ['235 (37)', '5.5', '7', '4.5', '37.5', '23.5'],
        ['240 (38)', '6', '7.5', '5', '38', '24.0'],
        ['245 (39)', '6.5', '8', '5.5', '38.5', '24.5'],
        ['250 (40)', '7', '9', '6', '39.5', '25.0'],
        ['255 (41)', '8', '10', '7', '40.5', '25.5'],
        ['260 (42)', '8.5', '—', '7.5', '41', '26.0'],
        ['265 (43)', '9.5', '—', '8.5', '42', '26.5'],
        ['270 (44)', '10', '—', '9', '42.5', '27.0'],
        ['275 (45)', '11', '—', '10', '43.5', '27.5'],
        ['280 (46)', '11.5', '—', '10.5', '44', '28.0'],
      ],
      tip: '不同品牌存在偏差，脚长测量（下午最准）优先于码数对照。',
    },
  ];

  TB.boot(REGISTRY);
})();
