/*!
 * Live2D 看板娘大模型对话（安全版）
 * 点击左下角 Live2D 看板娘即可唤起对话面板
 * 通过 Cloudflare Worker 代理调用 DeepSeek，密钥不暴露于客户端
 *
 * ============================================================
 *  配置说明
 *  将 CONFIG.proxyEndpoint 改为你部署的 Worker 地址即可
 *  密钥由 Worker 在服务端持有，前端零密钥
 * ============================================================
 */
(function () {
  'use strict';

  var CONFIG = {
    // 调用自有 AI 代理（Cloudflare Worker，绑定 mfyresume.dpdns.org 自定义域名，密钥存于服务端，浏览器零接触）
    proxyEndpoint: 'https://ai.mfyresume.dpdns.org',
    indexUrl: '/site-index.json',
    temperature: 0.6,
    maxHistory: 8,                               // 保留最近 N 轮对话（用户+助手各算 1 条）
    brand: 'LifelineVerve',
    welcome: '嗨，我是 LifelineVerve ✨\nLifeline 博客的站内管家——全站内容我都熟。\n问我「这个站有什么」「XX 主题的文章在哪」，我会给你答案和相关文章链接。'
  };

  // ---------- 状态 ----------
  var panel, bodyEl, inputEl, sendBtn;
  var siteIndex = null;          // 站点索引数组
  var systemPrompt = '';         // 含索引的系统提示词
  var history = [];              // 对话历史 [{role, content}]
  var loading = false;           // 是否正在等待/接收回复
  var indexLoading = false;      // 索引是否正在加载
  var indexPromise = null;       // 索引加载 Promise（缓存，避免重复 fetch）
  var inited = false;
  // ⚠️ 必须在此处（init() 之前）声明：init 可能在脚本主体执行完之前就被调用，
  // 若声明在下方函数区内会因 var 提升而取到 undefined，导致会话恢复读到错误的 key
  var STORE_KEY = 'lc-chat-history-v1';

  // ---------- 入口 ----------
  function init() {
    if (inited) return;
    inited = true;
    buildPanel();
    bindEvents();
    injectButlerEntry();
    prefetchIndex();
  }

  // 空闲时预取站点索引（约 66KB），避免访客点开面板后才开始下载、白等一段
  function prefetchIndex() {
    // 省流模式或极慢网络下不预取，避免替用户多花流量
    try {
      var c = navigator.connection;
      if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;
    } catch (e) {}
    if (window.requestIdleCallback) {
      window.requestIdleCallback(function () { ensureIndex(); }, { timeout: 4000 });
    } else {
      setTimeout(function () { ensureIndex(); }, 2500);
    }
  }

  // 兜底：DOMContentLoaded + pjax 切换后尝试初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('pjax:success', init);
  document.addEventListener('pjax:complete', init);
  // pjax 切页后文章 AI 框会重绘，需重新注入「问管家」入口按钮
  document.addEventListener('pjax:success', injectButlerEntry);
  document.addEventListener('pjax:complete', injectButlerEntry);

  // 按当前页面动态生成欢迎语：文章页会点出"你正在读的这篇"
  function welcomeText() {
    try {
      var cfg = window.GLOBAL_CONFIG_SITE || {};
      if (/^\/posts\//.test(location.pathname) && cfg.title) {
        return '嗨，我是 LifelineVerve ✨ Lifeline 博客的站内管家。\n你现在读的是《' + cfg.title +
          '》——需要我讲讲这篇的要点，或帮你找相关文章吗？';
      }
    } catch (e) {}
    return CONFIG.welcome;
  }

  // 在文章 AI 摘要框里注入「问管家」入口，打通"单篇摘要 → 全站管家"两层
  function injectButlerEntry() {
    var box = document.querySelector('.post-ai-description .ai-btn-box');
    if (!box || box.querySelector('.lc-butler-entry')) return;
    var btn = document.createElement('div');
    btn.className = 'ai-btn-item lc-butler-entry';
    btn.textContent = '站内管家 LifelineVerve 🤖';
    btn.addEventListener('click', function () { openPanel(); });
    box.appendChild(btn);
  }

  // ---------- 构建 UI ----------
  function buildPanel() {
    if (document.getElementById('live2d-chat-panel')) return;
    panel = document.createElement('div');
    panel.id = 'live2d-chat-panel';
    panel.innerHTML =
      '<div class="lc-header">' +
        '<img class="lc-avatar" src="https://p2.music.126.net/x55FPD2xWTqmMIFjDKXogw==/109951163513084093.jpg?param=130y130" alt="LifelineVerve 站内管家" onerror="this.style.display=\'none\'" />' +
        '<div class="lc-title-wrap">' +
          '<div class="lc-title">LifelineVerve</div>' +
          '<div class="lc-status">站内管家 · 在线</div>' +
        '</div>' +
      '</div>' +
      '<div class="lc-body"></div>' +
      '<div class="lc-input-wrap">' +
        '<textarea class="lc-input" rows="1" placeholder="问我任何问题…" aria-label="输入消息"></textarea>' +
        '<button class="lc-new" title="新对话" aria-label="新对话"><span class="lc-new-icon">⟳</span></button>' +
        '<button class="lc-send" title="发送" aria-label="发送"><span class="lc-send-icon">➤</span></button>' +
      '</div>';
    document.body.appendChild(panel);

    bodyEl = panel.querySelector('.lc-body');
    inputEl = panel.querySelector('.lc-input');
    sendBtn = panel.querySelector('.lc-send');

    // 恢复本标签页内已有的对话；没有则显示欢迎语
    restoreHistory();

    // 输入框自适应高度 + 回车发送
    inputEl.addEventListener('input', autoGrow);
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    });
    sendBtn.addEventListener('click', onSend);
    panel.querySelector('.lc-new').addEventListener('click', newChat);
  }

  // ---------- 对话持久化（sessionStorage，仅本标签页，关掉即清） ----------
  function saveHistory() {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(history.slice(-CONFIG.maxHistory * 2)));
    } catch (e) { /* 隐私模式等场景静默降级 */ }
  }

  function clearStoredHistory() {
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  function loadStoredHistory() {
    try {
      var arr = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]');
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (m) {
        return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
      });
    } catch (e) { return []; }
  }

  // 面板构建时渲染：有历史就还原气泡，否则只放欢迎语
  function restoreHistory() {
    var restored = loadStoredHistory();
    if (!restored.length) {
      appendMessage('assistant', welcomeText(), false);
      return;
    }
    history = restored;
    for (var i = 0; i < restored.length; i++) {
      appendMessage(restored[i].role, restored[i].content, false);
    }
  }

  // 新对话：清空历史并重置为欢迎语
  function newChat() {
    if (loading) return;
    history = [];
    clearStoredHistory();
    if (bodyEl) bodyEl.innerHTML = '';
    appendMessage('assistant', welcomeText(), false);
    try { inputEl.focus(); } catch (e) {}
  }

  function autoGrow() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    // 事件委托：点击 Live2D 看板娘切换面板开/关（看板娘 DOM 延迟生成也能捕获）
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t) return;
      var hit = t.closest && t.closest('#live2d-widget, .live2d-widget-container, #live2dcanvas, canvas.live2d-canvas');
      if (hit) {
        // 避免点击聊天面板内部时误触
        if (panel && panel.contains(t)) return;
        togglePanel();
      }
    });
  }

  // 点击看板娘切换面板开/关
  function togglePanel() {
    if (!panel) init();
    if (panel.classList.contains('open')) {
      closePanel();
    } else {
      openPanel();
    }
  }

  function openPanel() {
    if (!panel) init();
    // 动态让气泡底部紧贴看板娘顶部（L2Dwidget 容器顶部位置不固定，需运行时对齐）
    var widget = document.getElementById('live2d-widget');
    if (widget) {
      var rect = widget.getBoundingClientRect();
      // 减 10px 让气泡底部下沿覆盖看板娘头部，实现"紧贴"效果
      var bottomVal = window.innerHeight - rect.top - 10;
      if (bottomVal > 0) {
        panel.style.bottom = bottomVal + 'px';
        // 限制面板高度不超过视口可用空间（视口高度 - 底部位置 - 顶部留白 10px）
        var maxH = window.innerHeight - bottomVal - 10;
        panel.style.maxHeight = Math.max(160, maxH) + 'px';
      }
    }
    panel.classList.add('open');
    setTimeout(function () { inputEl && inputEl.focus(); }, 280);
    ensureIndex();
  }

  function closePanel() {
    panel.classList.remove('open');
  }

  // ---------- 站点索引 ----------
  function ensureIndex() {
    if (siteIndex) return Promise.resolve(siteIndex);
    if (indexPromise) return indexPromise;
    indexLoading = true;
    indexPromise = fetch(CONFIG.indexUrl, { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('索引加载失败 HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        siteIndex = (data && data.items) || [];
        systemPrompt = buildSystemPrompt(siteIndex);
        return siteIndex;
      })
      .catch(function (err) {
        console.info('[live2d-chat] 索引加载失败:', err);
        systemPrompt = buildSystemPrompt([]);
        return [];
      })
      .then(function (res) { indexLoading = false; return res; });
    return indexPromise;
  }

  function buildSystemPrompt(items) {
    var lines = items.map(function (it, i) {
      var tags = (it.tags && it.tags.length) ? it.tags.join('、') : '无';
      var cats = (it.categories && it.categories.length) ? it.categories.join('、') : '';
      var head = '【' + (i + 1) + '】' + (it.title || '无标题');
      var url = '链接：' + (it.url || '/');
      var tagLine = '标签：' + tags + (cats ? '｜分类：' + cats : '');
      var excerpt = '摘要：' + (it.excerpt || '（无摘要）');
      return head + '\n' + url + '\n' + tagLine + '\n' + excerpt;
    });
    var indexText = lines.length ? lines.join('\n\n') : '（索引为空，可能是首次构建未生成）';

    return [
      '你是「LifelineVerve」，Lifeline 个人博客的站内管家 AI，了解本站的全部内容（下方索引列出了每篇文章/页面的标题、链接、标签、分类与摘要）。你的职责是准确回答访客关于本站内容的问题，并在合适时附上可点击的相关文章链接。',
      '',
      '你的定位（与「文章 AI 摘要」的层级关系）：',
      '- 你是「全站管家」：负责跨文章、跨主题地回答"这个站有什么、我要的内容在哪"，并给出链接。',
      '- 每篇文章顶部另有一个「文章 AI 摘要」模块，那是针对当前这一篇的简介；你与它是互补的两层，互不替代。',
      '',
      '回答规则：',
      '1. 只回答与本站内容相关的问题；与站点无关的问题礼貌引导回博客主题。',
      '2. 当回答涉及某篇具体文章或页面时，必须附上对应链接，使用 Markdown 格式：[标题](相对路径)。',
      '3. 链接路径必须严格使用下方索引中的真实路径（形如 /posts/xxxx/ 或 /about/），禁止编造任何路径或 URL。',
      '4. 若索引中没有相关内容，如实告知访客本站可能未涉及此话题，不要编造文章。',
      '5. 优先推荐与问题最相关的 1-3 篇，避免一次性罗列过多。',
      '6. 语言简洁友好，称呼访客为"你"，正文不要使用代码块包裹链接。',
      '',
      '以下是本站全部页面的索引（共 ' + items.length + ' 条，每条含标题、链接、标签、摘要）：',
      '',
      indexText,
      '',
      // ⚠️ 顺序很关键：可变内容（当前文章）必须排在体积最大的索引【之后】。
      // 大模型按「前缀」命中缓存，索引（约 2 万 token）放在最后才能被所有页面共享前缀，
      // 否则每篇文章都会让整段索引缓存失效、成本翻十倍。
      currentPageContext()
    ].join('\n');
  }

  // 当前页面上下文：把"访客正在读哪一篇"告诉管家，打通「单篇摘要」与「全站管家」两层
  function currentPageContext() {
    try {
      var cfg = window.GLOBAL_CONFIG_SITE || {};
      if (/^\/posts\//.test(location.pathname) && cfg.title) {
        var sum = String(cfg.postAI || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean).join('；');
        var block = '【当前页面】访客正在阅读文章《' + cfg.title + '》（链接：' + location.pathname + '）。';
        if (sum) block += '本文 AI 摘要：' + sum + '。';
        block += '当访客提到"这篇文章/本文"时，请优先结合本文内容回答。\n\n';
        return block;
      }
    } catch (e) {}
    return '';
  }

  // ---------- 发送 ----------
  function onSend() {
    if (loading) return;
    var text = (inputEl.value || '').trim();
    if (!text) return;

    appendMessage('user', text);
    history.push({ role: 'user', content: text });
    inputEl.value = '';
    autoGrow();
    setLoading(true);

    var assistantEl = appendMessage('assistant', '', true);
    // 等待站点索引加载完成后再调用大模型，避免索引未就绪时 AI 误答“没有相关文章”
    ensureIndex().then(function () {
      streamChat(assistantEl);
    });
  }

  function setLoading(v) {
    loading = v;
    sendBtn.disabled = v;
    inputEl.disabled = v;
  }

  // ---------- 调用 Worker 代理（流式，密钥由 Worker 持有） ----------
  function streamChat(assistantEl) {
    var bubble = assistantEl.querySelector('.lc-bubble');
    var reqMessages = [{ role: 'system', content: systemPrompt }];
    // 截断历史，控制 token
    var recent = history.slice(-CONFIG.maxHistory * 2);
    for (var i = 0; i < recent.length; i++) reqMessages.push(recent[i]);

    var full = '';
    var reader = null;

    fetch(CONFIG.proxyEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: reqMessages,
        temperature: CONFIG.temperature
      })
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (t) {
          throw new Error(parseApiError(resp.status, t));
        });
      }
      reader = resp.body.getReader();
      var decoder = new TextDecoder('utf-8');
      var buffer = '';

      function pump() {
        return reader.read().then(function (chunk) {
          if (chunk.done) return;
          buffer += decoder.decode(chunk.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop(); // 保留最后不完整的一行
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || line.indexOf('data:') !== 0) continue;
            var payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              var json = JSON.parse(payload);
              var delta = json.choices && json.choices[0] && json.choices[0].delta;
              if (delta && delta.content) {
                full += delta.content;
                renderStreaming(bubble, full);
                scrollToBottom();
              }
            } catch (e) { /* 忽略心跳/keepalive 行 */ }
          }
          return pump();
        });
      }
      return pump();
    }).then(function () {
      // 流结束
      bubble.innerHTML = renderMarkdown(full);
      if (full) history.push({ role: 'assistant', content: full });
      trimHistory();
      saveHistory();
      setLoading(false);
      scrollToBottom();
    }).catch(function (err) {
      bubble.classList.add('lc-error-bubble');
      bubble.innerHTML = '⚠️ ' + escapeHtml(err.message || '请求失败，请稍后重试');
      // 失败时把刚才的用户消息从历史移除，避免污染上下文
      if (history.length && history[history.length - 1].role === 'user') {
        history.pop();
      }
      setLoading(false);
    });
  }

  function parseApiError(status, body) {
    var msg = '请求失败（HTTP ' + status + '）';
    try {
      var j = JSON.parse(body);
      if (j.error) msg = j.error.message || j.error;
    } catch (e) {}
    if (status === 401) msg = '请求未授权（401），请通过博客页面使用此功能。';
    if (status === 403) msg = '来源域名不被允许（403）。';
    if (status === 429) msg = '请求过于频繁或今日额度已用尽（429），请稍后再试。';
    return msg;
  }

  function trimHistory() {
    var max = CONFIG.maxHistory * 2;
    while (history.length > max) history.shift();
  }

  // ---------- 渲染 ----------
  function appendMessage(role, content, thinking) {
    var msg = document.createElement('div');
    msg.className = 'lc-msg ' + role;
    var bubble = document.createElement('div');
    bubble.className = 'lc-bubble';
    if (thinking) {
      bubble.innerHTML = thinkingDots();
    } else if (role === 'user') {
      bubble.textContent = content;
    } else {
      bubble.innerHTML = renderMarkdown(content);
    }
    msg.appendChild(bubble);
    bodyEl.appendChild(msg);
    scrollToBottom();
    return msg;
  }

  function thinkingDots() {
    return '<span class="lc-thinking"><span></span><span></span><span></span></span>';
  }

  // 流式过程中渲染（含光标），用 textContent 防止半截 HTML
  function renderStreaming(bubble, text) {
    var safe = escapeHtml(text);
    bubble.innerHTML = safe.replace(/\n/g, '<br>') + '<span class="lc-cursor"></span>';
  }

  // 最终渲染：把 Markdown 链接转成可点击 <a>
  function renderMarkdown(text) {
    if (!text) return '';
    var links = [];
    var t = String(text);
    // 1. 提取 markdown 链接 [text](url)
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, function (_, txt, url) {
      links.push({ txt: txt, url: url });
      return '\u0000L' + (links.length - 1) + '\u0000';
    });
    // 2. 提取裸 URL（剩余的，不会误伤已替换的占位符）
    t = t.replace(/(https?:\/\/[^\s<]+)/g, function (_, url) {
      links.push({ txt: url, url: url });
      return '\u0000L' + (links.length - 1) + '\u0000';
    });
    // 3. 转义 HTML
    t = escapeHtml(t);
    // 4. 换行
    t = t.replace(/\n/g, '<br>');
    // 5. 放回链接：仅站内相对路径可点击，外部链接降级为纯文本
    //    （防止提示注入把管家当成站外链接出口）
    t = t.replace(/\u0000L(\d+)\u0000/g, function (_, i) {
      var l = links[+i];
      var href = String(l.url);
      var isInternal = href.charAt(0) === '/' && href.indexOf('//') !== 0;
      if (!isInternal) {
        return '<span class="lc-link-plain">' + escapeHtml(l.txt) + '</span>';
      }
      return '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(l.txt) + '</a>';
    });
    return t;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function scrollToBottom() {
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }
})();
