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
    // 调用自有 AI 代理（Cloudflare Worker，绑定 lifeline.cc.cd 自定义域名，密钥存于服务端，浏览器零接触）
    proxyEndpoint: 'https://ai.lifeline.cc.cd',
    indexUrl: '/site-index.json',
    temperature: 0.6,
    maxHistory: 8,                               // 保留最近 N 轮对话（用户+助手各算 1 条）
    welcome: '嗨，我是博客小助手 ✨\n欢迎来到 Lifeline 的博客～\n有任何关于博客内容的问题尽管问我，我会帮你找到准确答案和相关文章链接。'
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

  // ---------- 入口 ----------
  function init() {
    if (inited) return;
    inited = true;
    buildPanel();
    bindEvents();
  }

  // 兜底：DOMContentLoaded + pjax 切换后尝试初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('pjax:success', init);
  document.addEventListener('pjax:complete', init);

  // ---------- 构建 UI ----------
  function buildPanel() {
    if (document.getElementById('live2d-chat-panel')) return;
    panel = document.createElement('div');
    panel.id = 'live2d-chat-panel';
    panel.innerHTML =
      '<div class="lc-header">' +
        '<img class="lc-avatar" src="http://p2.music.126.net/x55FPD2xWTqmMIFjDKXogw==/109951163513084093.jpg?param=130y130" alt="博客小助手" onerror="this.style.display=\'none\'" />' +
        '<div class="lc-title-wrap">' +
          '<div class="lc-title">博客小助手</div>' +
          '<div class="lc-status">在线</div>' +
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

    // 欢迎语
    appendMessage('assistant', CONFIG.welcome, false);

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

  // 新对话：清空历史并重置为欢迎语
  function newChat() {
    if (loading) return;
    history = [];
    if (bodyEl) bodyEl.innerHTML = '';
    appendMessage('assistant', CONFIG.welcome, false);
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
      '你是「博客小助手」，服务于 Lifeline 的个人博客。你的职责是根据下方提供的站点页面索引，准确回答访客关于博客内容的问题，并在合适时附上相关页面的链接。',
      '',
      '回答规则：',
      '1. 只回答与博客内容相关的问题；与博客无关的问题礼貌引导回博客主题。',
      '2. 当回答涉及某篇具体文章或页面时，必须在回复中附上对应链接，使用 Markdown 格式：[标题](相对路径)。',
      '3. 链接路径必须严格使用下方索引中提供的真实路径（形如 /posts/xxxx/ 或 /about/），禁止编造任何路径或 URL。',
      '4. 若索引中没有相关内容，如实告知访客该博客可能未涉及此话题，不要编造文章。',
      '5. 优先推荐与问题最相关的 1-3 篇，避免一次性罗列过多。',
      '6. 语言简洁友好，称呼访客为"你"，正文不要使用代码块包裹链接。',
      '',
      '以下是博客全部页面的索引（共 ' + items.length + ' 条，每条含标题、链接、标签、摘要）：',
      '',
      indexText
    ].join('\n');
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
    // 5. 放回链接
    t = t.replace(/\u0000L(\d+)\u0000/g, function (_, i) {
      var l = links[+i];
      return '<a href="' + escapeHtml(l.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(l.txt) + '</a>';
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
