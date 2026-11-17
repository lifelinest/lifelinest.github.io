/* 文章页「AI 播客」按钮 + 紧凑播放器（注入式，不改主题源码）
 * 通过 inject.bottom 加载；音频按 permalink: posts/:abbrlink/ 对应 /audio/podcast/<abbrlink>.mp3
 * 三套音色：A 默认（无后缀，RSS 指向它）/ B -b / C -c，与 tools/podcast/config.json 的 voiceSets 一致。
 * 原「朗读摘要」图标保留节点但隐藏，避免主题 ai_abstract.js 的 querySelector 拿到 null 抛错。
 */
(function () {
  'use strict';
  var READY = 'llpodReady';
  var VOICE_KEY = 'llpodVoice';
  // id / suffix 必须与 config.json voiceSets 保持一致；改音色配置时同步这里
  var VOICE_SETS = [
    { id: 'a', suffix: '', label: 'A · 云希×晓晓' },
    { id: 'b', suffix: '-b', label: 'B · 云扬×晓晓' },
    { id: 'c', suffix: '-c', label: 'C · 云希×晓伊' }
  ];
  var audio = null;
  var timer = null;
  // pjax 重新执行本脚本时，暂停上一页仍在播放的实例
  function stopPrev() {
    var prev = window.__llpodAudio;
    if (prev && prev !== audio) { try { prev.pause(); } catch (e) {} }
  }

  function byId(id) {
    for (var i = 0; i < VOICE_SETS.length; i++) if (VOICE_SETS[i].id === id) return VOICE_SETS[i];
    return VOICE_SETS[0];
  }
  function savedVoice() {
    try { return byId(localStorage.getItem(VOICE_KEY)); } catch (e) { return VOICE_SETS[0]; }
  }
  function saveVoice(id) {
    try { localStorage.setItem(VOICE_KEY, id); } catch (e) {}
  }

  function css() {
    if (document.getElementById('llpod-style')) return;
    var s = document.createElement('style');
    s.id = 'llpod-style';
    s.textContent = [
      '.llpod-trigger{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;margin-left:auto;',
      'border:1px solid var(--anzhiyu-theme,#425aef);border-radius:20px;background:transparent;',
      'color:var(--anzhiyu-theme,#425aef);font-size:12px;line-height:1;cursor:pointer;',
      'vertical-align:middle;transition:background .2s,color .2s,transform .2s,box-shadow .2s}',
      '.llpod-trigger:hover{background:var(--anzhiyu-theme,#425aef);color:#fff;transform:translateY(-1px);',
      'box-shadow:0 3px 10px rgba(66,90,239,.22)}',
      '.llpod-trigger:active{transform:scale(.96)}',
      '.llpod-trigger:focus-visible{outline:2px solid var(--anzhiyu-theme,#425aef);outline-offset:2px}',
      '.llpod-trigger[disabled]{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none}',
      '.llpod-trigger svg{width:13px;height:13px;flex:none}',
      '.llpod-trigger svg .bar{transform-origin:center bottom}',
      '.llpod-trigger.is-playing svg .b1{animation:llpod-b .8s ease-in-out infinite}',
      '.llpod-trigger.is-playing svg .b2{animation:llpod-b .8s ease-in-out .16s infinite}',
      '.llpod-trigger.is-playing svg .b3{animation:llpod-b .8s ease-in-out .32s infinite}',
      '@keyframes llpod-b{0%,100%{transform:scaleY(.45)}50%{transform:scaleY(1)}}',
      '.llpod-panel{display:none;align-items:center;gap:9px;flex-wrap:wrap;margin-top:10px;padding:8px 10px;',
      'border-radius:10px;background:var(--anzhiyu-secondbg,rgba(66,90,239,.06));',
      'color:var(--anzhiyu-font-color,#363636);font-size:12px}',
      '.llpod-panel.open{display:flex}',
      '.llpod-play{width:30px;height:30px;flex:none;border:0;border-radius:50%;cursor:pointer;',
      'background:var(--anzhiyu-theme,#425aef);color:#fff;font-size:12px;line-height:30px;text-align:center;padding:0}',
      '.llpod-play:hover{filter:brightness(1.08)}',
      '.llpod-seek{flex:1 1 140px;min-width:80px;height:4px;accent-color:var(--anzhiyu-theme,#425aef);cursor:pointer}',
      '.llpod-time{font-variant-numeric:tabular-nums;white-space:nowrap;opacity:.75;font-size:11px}',
      '.llpod-rate,.llpod-close,.llpod-voice{border:1px solid var(--anzhiyu-theme,#425aef);border-radius:14px;',
      'background:transparent;color:var(--anzhiyu-theme,#425aef);font-size:11px;height:24px;padding:0 9px;',
      'cursor:pointer;white-space:nowrap}',
      '.llpod-rate:hover,.llpod-close:hover,.llpod-voice:hover{background:var(--anzhiyu-theme,#425aef);color:#fff}',
      '.llpod-rate:focus-visible,.llpod-voice:focus-visible{outline:2px solid var(--anzhiyu-theme,#425aef);outline-offset:2px}',
      '.llpod-voice{padding:0 6px;max-width:132px;color-scheme:light dark}',
      '.llpod-voice option{background:var(--anzhiyu-card-bg,#fff);color:var(--anzhiyu-font-color,#363636)}',
      '.llpod-close{border-color:transparent;opacity:.6;padding:0 6px}',
      '.llpod-hint{width:100%;opacity:.7;font-size:11px;line-height:1.5}',
      '@media (max-width:520px){.llpod-trigger{height:22px;padding:0 6px;font-size:11px}.llpod-panel{gap:7px}',
      '.llpod-voice{max-width:118px;font-size:10px;padding:0 4px}}'
    ].join('');
    document.head.appendChild(s);
  }

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function snack(msg) {
    // 主题 snackbar 内部若因依赖缺失抛错，不能阻断降级/切换等核心逻辑
    try {
      if (window.anzhiyu && typeof window.anzhiyu.snackbarShow === 'function') {
        window.anzhiyu.snackbarShow(msg);
        return;
      }
    } catch (e) {}
    console.info('[AI 播客] ' + msg);
  }

  function boot() {
    var card = document.querySelector('.post-ai-description');
    if (!card) return;
    var m = location.pathname.match(/^\/posts\/([A-Za-z0-9._-]+)\/?$/);
    if (!m) return;                       // 只在文章页生效
    // 彻底去除原「朗读摘要」按钮：直接从 DOM 移除节点。
    // 主题 ai_abstract.js 在播放器之前加载执行（事件已绑定完成），删除后其引用变 detached、
    // 点击无从触发，浏览器内置 TTS 朗读功能随之消失；播客按钮补位到原处。
    var old = card.querySelector('.anzhiyu-icon-circle-dot');
    // 朗读图标原在标题行 .ai-title 内（朗读图标 → #ai-tag）。播客按钮必须原位替换它，
    // 不能 appendChild 到卡片末尾——那样会掉到按钮 tag 行下面、样式错位。
    var title = card.querySelector('.ai-title');
    var insertParent = old && old.parentNode ? old.parentNode : (title || card);
    var insertRef = old ? old.nextSibling : (title ? title.querySelector('#ai-tag') : null);
    if (old) { try { old.remove(); } catch (e) { old.style.display = 'none'; } }
    // 用「按钮是否仍挂在 DOM 上」判重：主题异步初始化 / pjax 可能重建卡片，
    // 只靠卡片属性会误判为已完成，导致按钮被冲掉后永不恢复。
    var existing = card.querySelector('.llpod-trigger');
    if (existing && existing.isConnected) return;

    card.setAttribute(READY, '1');
    css();
    stopPrev();
    if (audio) { try { audio.pause(); } catch (e) {} }
    if (timer) { clearInterval(timer); timer = null; }

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'llpod-trigger';
    trigger.title = 'AI 播客 · 听两人聊这篇文章';
    trigger.setAttribute('aria-label', trigger.title);
    trigger.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<rect class="bar b1" x="3" y="9" width="3" height="7" rx="1.5" fill="currentColor"/>' +
      '<rect class="bar b2" x="9" y="5" width="3" height="15" rx="1.5" fill="currentColor"/>' +
      '<rect class="bar b3" x="15" y="8" width="3" height="9" rx="1.5" fill="currentColor"/>' +
      '</svg><span>AI 播客</span>';
    try { insertParent.insertBefore(trigger, insertRef && insertRef.parentNode === insertParent ? insertRef : null); }
    catch (e) { (title || card).appendChild(trigger); }

    var panel = document.createElement('div');
    panel.className = 'llpod-panel';
    var opts = VOICE_SETS.map(function (v) {
      return '<option value="' + v.id + '">' + v.label + '</option>';
    }).join('');
    panel.innerHTML =
      '<button class="llpod-play" type="button" aria-label="播放/暂停">▶</button>' +
      '<input class="llpod-seek" type="range" min="0" max="100" value="0" step="0.1" aria-label="播放进度">' +
      '<span class="llpod-time">00:00 / 00:00</span>' +
      '<select class="llpod-voice" aria-label="选择播客音色" title="切换音色">' + opts + '</select>' +
      '<button class="llpod-rate" type="button" title="切换倍速">1.0×</button>' +
      '<button class="llpod-close" type="button" title="收起">✕</button>' +
      '<div class="llpod-hint">双人对话由本文摘要、问答与章节要点生成 · 可切换音色 · <a href="/podcast.xml" target="_blank" rel="noopener">订阅播客</a></div>';
    card.appendChild(panel);

    var playBtn = panel.querySelector('.llpod-play');
    var seek = panel.querySelector('.llpod-seek');
    var timeEl = panel.querySelector('.llpod-time');
    var voiceSel = panel.querySelector('.llpod-voice');
    var rateBtn = panel.querySelector('.llpod-rate');
    var closeBtn = panel.querySelector('.llpod-close');

    var abbr = m[1];
    var curSet = savedVoice();
    var fallbackTried = false;
    var pendingPos = 0;      // 切换音色后要恢复的进度
    var seeking = false;
    var rates = [1, 1.25, 1.5, 2];
    var ri = 0;

    function srcFor(set) { return '/audio/podcast/' + abbr + set.suffix + '.mp3'; }

    audio = new Audio();
    window.__llpodAudio = audio;
    audio.preload = 'none';
    audio.src = srcFor(curSet);
    voiceSel.value = curSet.id;

    function sync() {
      if (!seeking && isFinite(audio.duration) && audio.duration > 0) {
        seek.value = String(audio.currentTime / audio.duration * 100);
      }
      timeEl.textContent = fmt(audio.currentTime) + ' / ' + fmt(audio.duration);
    }

    // 换音色：保持播放进度、播放状态、倍速；选择写进 localStorage，跨文章生效
    function switchVoice(id, opt) {
      var next = byId(id);
      opt = opt || {};
      if (next.id === curSet.id) return;
      var wasPlaying = !audio.paused;
      var pos = audio.currentTime || 0;
      var rate = audio.playbackRate;
      curSet = next;
      fallbackTried = false;
      pendingPos = pos > 0 ? pos : pendingPos;
      voiceSel.value = next.id;
      saveVoice(next.id);
      audio.src = srcFor(next);
      audio.playbackRate = rate;
      audio.load();
      if (!opt.silent && wasPlaying) {
        audio.play().catch(function () {});
      }
      if (!opt.silent && !wasPlaying) snack('已切换为音色 ' + next.label);
    }

    trigger.addEventListener('click', function () {
      panel.classList.toggle('open');
      if (panel.classList.contains('open') && audio.paused) {
        audio.play().catch(function () { snack('音频还没准备好，稍后再试'); });
      }
    });
    playBtn.addEventListener('click', function () {
      if (audio.paused) audio.play().catch(function () { snack('音频加载失败'); });
      else audio.pause();
    });
    audio.addEventListener('play', function () {
      playBtn.textContent = '❚❚';
      trigger.classList.add('is-playing');
      if (timer) clearInterval(timer);
      timer = setInterval(sync, 250);
    });
    audio.addEventListener('pause', function () {
      playBtn.textContent = '▶';
      trigger.classList.remove('is-playing');
      if (timer) { clearInterval(timer); timer = null; }
    });
    audio.addEventListener('loadedmetadata', function () {
      // 三套音频台词相同、时长略有差异：按当前时间恢复，夹到有效范围内
      if (pendingPos > 0 && isFinite(audio.duration) && audio.duration > 0) {
        try { audio.currentTime = Math.min(pendingPos, Math.max(0, audio.duration - 0.25)); } catch (e) {}
      }
      pendingPos = 0;
      sync();
    });
    audio.addEventListener('timeupdate', sync);
    audio.addEventListener('ended', function () { playBtn.textContent = '▶'; trigger.classList.remove('is-playing'); });
    audio.addEventListener('error', function () {
      // 某篇还没生成该音色时优雅降级到默认 A，不禁用整个播放器
      if (curSet.id !== 'a' && !fallbackTried) {
        fallbackTried = true;
        snack('这个音色还没准备好，已切回默认音色');
        var pos = pendingPos || 0;
        switchVoice('a', { silent: true });
        pendingPos = pos;
        // error 发生时 audio.paused 已是 true（加载失败会自动暂停），不能用它判断
        // 「之前是否在听」。能走到这里说明用户刚点了播放/切换，意图就是听，直接续播。
        audio.play().catch(function () {});
        return;
      }
      trigger.disabled = true;
      trigger.title = '这期播客还在准备中';
      panel.classList.remove('open');
      snack('这期播客还在准备中');
    });
    voiceSel.addEventListener('change', function () { switchVoice(voiceSel.value); });
    seek.addEventListener('pointerdown', function () { seeking = true; });
    seek.addEventListener('pointerup', function () { seeking = false; });
    seek.addEventListener('input', function () {
      if (isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = Number(seek.value) / 100 * audio.duration;
        sync();
      }
    });
    rateBtn.addEventListener('click', function () {
      ri = (ri + 1) % rates.length;
      audio.playbackRate = rates[ri];
      rateBtn.textContent = rates[ri].toFixed(2).replace(/0$/, '').replace(/\.$/, '.0') + '×';
    });
    closeBtn.addEventListener('click', function () {
      panel.classList.remove('open');
      audio.pause();
    });
  }

  // 不用 defer：外部 CDN 卡住时 document.readyState 会长期停在 loading，
  // DOMContentLoaded 不触发，defer 脚本下载完也不会执行。本脚本位于 </body> 前，
  // 摘要卡片已解析完毕，立即执行一次；DOMContentLoaded / pjax / 定时只作兜底。
  boot();
  document.addEventListener('DOMContentLoaded', boot);
  document.addEventListener('pjax:complete', boot);
  // 主题 ai_abstract.js 异步初始化摘要卡片，多次兜底保证按钮一定挂上
  [900, 2500, 6000].forEach(function (t) { setTimeout(boot, t); });
})();
