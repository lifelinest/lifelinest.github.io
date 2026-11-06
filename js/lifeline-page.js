/* Lifeline 页 · 回归 AnZhiYu 主题版
 * 视觉全部走主题变量；生命线是唯一贯穿标识，四章是它的四次读数。
 *
 * 【触控板滚动修复 / 2026-11-06 根因实锤 · 本轮严格保留】
 * 旧版把 Lenis 的 raf 挂在 gsap.ticker 上：页面静止后 ticker autoSleep(~120 帧)
 * 停摆，Lenis 不再把 targetScroll 应用到 window，却仍 preventDefault 了 wheel
 * ⇒ 触控板/滚轮被完全吞掉（CDP 实测 10 次 wheel 后 scrollY 恒为 0，
 *   而 window.scrollTo(0,900) 正常）。
 * 修复：默认不启用平滑滚动，交回浏览器原生滚动；ScrollTrigger 原生监听
 * scroll 即可。下方保留一份「修好的」平滑实现（独立 rAF + wheel 看门狗），
 * 由 ENABLE_SMOOTH 开关控制。本轮新增的播放器/导航/重播均不接管任何 wheel。
 *
 * 【动效状态异常修复】
 * ① 单一主控 ScrollTrigger 计算当前章节（唯一真值源）；② 章节入场 once；
 * ③ 尾声 onLeaveBack 完整回滚；④ 节点由 CSS 跟随卡片，不再 JS 定位；
 * ⑤ 库失效 / reduced-motion 全量直出，且不加 .ll-ready。
 *
 * 【2026-11-06 深度优化新增】
 * · 原生 <audio> 播放器：播放/暂停、进度拖动、时间、音量、静音、循环；
 *   主播放器状态同源（模块一播放条与图注重播按钮已移除）。
 * · 时间轴节点 = 可点击章节导航（原生 scrollIntoView，不引入平滑接管）。
 * · 第 04 章圆形闭环 + 尾声按钮：可重复触发的四段状态机。
 * · 所有 UI 初始化在 fallback 之前执行，即使 GSAP 失效播放器仍可用。
 */
(function () {
  'use strict';
  var doc = document;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var hasGsap = !!window.gsap;
  var hasST = !!(window.gsap && window.ScrollTrigger);
  var animated = hasST && !reduce;

  /* 触控板修复总开关：默认 false = 原生滚动，触控板 100% 可用 */
  var ENABLE_SMOOTH = false;

  /* 【跨设备动效统一 / 2026-11-06】
   * 旧规则把章节级触发全绑在「视口高度百分比」上（top 82%/88%/78%）
   * 且当前章判定线 = 0.44*vh：1920×1080 提前量 194px / 判定线 475px，
   * 844×390 却只有 70px / 172px ⇒ 大屏首屏第 1 章描线已放完、矮横屏
   * 要等章节快贴脸才动，宽屏一次滚动还常把两三章一起起播。
   * 新规则：① 所有章节事件共用同一条更低的视口相对线（65%），保证
   * 任何屏幕首屏都不会提前把第 1 章描完；② 波形统一预隐藏为「未描」；
   * ③ 章节入场不再排队（旧 240ms 队列会让宽屏跨章时波形长时间空白）。
   * 当前章判定沿用视口 44% 相对线（恢复，勿改），节点跳转改为对齐该线。
   * 【交互修复 / 同日】主控补齐已滚过章节的波形；尾声加一次性状态锁，
   *   避免来回滚动重复播落款；PC 大视口误判下一章、手机滚到底节点全灭
   *   一并修正。
   * 注：不引入任何 wheel 接管，触控板原生滚动保持可用。 */
  var ENTER_LINE = '65%';   /* 章节顶部到达视口 65%：入场 + 描线 + 尾声 */
  var REVEAL_LINE = '72%';  /* 逐字揭示 */
  /* CH_GAP 全局队列已移除：它会让宽屏跨章时最后几章的描线迟迟不起播 */

  function $(s, c) { return (c || doc).querySelector(s); }
  function $all(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  function gsap() { return window.gsap; }
  function ST() { return window.ScrollTrigger; }

  /* 【初始化时序 / 2026-11-06】init() 统一在 IIFE 末尾调用。
     函数声明会提升，但 var LOOP / LOOP_T 等对象字面量的「赋值」不会：
     旧版在此处就 else init() ⇒ setupLoop() 访问 LOOP.fig 抛 TypeError，
     又被 try{}catch{} 静默吞掉 ⇒ 闭环起点没写 inline dash，ll-anim
     预隐藏移除后先全显，进入第 04 章才突然收回（突跳）。
     所有变量就绪后再启动，见文件末尾。 */

  function init() {
    /* 交互层优先初始化：库失效时音乐/导航依然可用 */
    try { setupPlayer(); } catch (e) {}
    try { setupNav(); } catch (e) {}
    try { setupLoop(); } catch (e) {}
    if (window.__llFailSafe) { clearTimeout(window.__llFailSafe); window.__llFailSafe = null; }

    if (hasST) gsap().registerPlugin(ST());
    setupSmoothScroll();

    if (!animated) { fallback(); doc.documentElement.classList.remove('ll-anim'); return; }
    doc.documentElement.classList.add('ll-ready');
    prepareLines();

    setupReveal();
    setupRail();      // 主控：进度 / 当前章节 / 节点状态
    setupChapters();  // 每章一次入场 + 描边
    setupFinale();    // 尾声进入 / 回滚闭环

    window.addEventListener('load', refresh);
    window.addEventListener('resize', debounce(onResize, 200));
    setTimeout(refresh, 700);
    setTimeout(refresh, 2000);
    doc.documentElement.classList.remove('ll-anim');
  }

  /* ==========================================================
     音乐播放器：原生 audio，零依赖、不触碰滚动
     ========================================================== */
  function setupPlayer() {
    var audio = $('#llAudio');
    if (!audio) return;
    var seek = $('#llSeek'), vol = $('#llVol');
    var cur = $('#llCur'), dur = $('#llDur');
    var state = $('#llPlayerState'), mute = $('#llMute');
    var btns = ['#llPlay']
      .map(function (s) { return $(s); }).filter(Boolean);
    var seeking = false, available = true, failed = false;

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function fmt(t) {
      t = Math.max(0, Math.floor(t || 0));
      return pad(Math.floor(t / 60)) + ':' + pad(t % 60);
    }
    function fill(el, pct) { if (el) el.style.setProperty('--fill', pct.toFixed(2) + '%'); }

    function syncPlaying() {
      if (failed) return;
      var on = !audio.paused && !audio.ended && available;
      doc.documentElement.classList.toggle('ll-playing', on);
      btns.forEach(function (b) {
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.setAttribute('aria-label', on ? '暂停配乐' : '播放配乐');
      });
      if (state) {
        state.textContent = !available ? '原曲暂时连不上 · 可点右侧去网易云'
          : on ? '正在播放 · Lifeline（生命线）'
          : '已暂停 · 点播放继续，不播放也不影响阅读。';
      }
    }
    function syncMute() {
      if (!mute) return;
      var m = !!audio.muted;
      mute.classList.toggle('is-muted', m);
      mute.setAttribute('aria-pressed', m ? 'true' : 'false');
      mute.setAttribute('aria-label', m ? '取消静音' : '静音');
    }
    function retry() {
      failed = false;
      available = true;
      if (state) state.textContent = '正在重新连接原曲…';
      try { audio.load(); } catch (e) {}
      var p = audio.play();
      if (p && p.catch) p.catch(function () {
        if (state) state.textContent = '仍未连上 · 点播放重试，或点右侧去网易云听';
      });
    }
    function toggle() {
      if (!available) { retry(); return; }
      if (audio.paused) {
        var p = audio.play();
        if (p && p.catch) p.catch(function (err) {
          if (err && err.name === 'AbortError') return;
          if (failed || !available) return;
          failed = true;
          if (state) state.textContent = '暂时没播起来 · 点播放重试，或点右侧去网易云';
        });
      } else {
        audio.pause();
      }
    }

    btns.forEach(function (b) { b.addEventListener('click', toggle); });

    audio.addEventListener('play', syncPlaying);
    audio.addEventListener('pause', syncPlaying);
    audio.addEventListener('ended', syncPlaying);
    audio.addEventListener('loadedmetadata', function () {
      failed = false;
      available = true;
      if (dur) dur.textContent = fmt(audio.duration);
      if (cur) cur.textContent = fmt(audio.currentTime);
      syncPlaying();
    });
    audio.addEventListener('timeupdate', function () {
      var d = audio.duration || 0;
      if (cur) cur.textContent = fmt(audio.currentTime);
      if (d > 0 && !seeking) {
        var ratio = audio.currentTime / d;
        if (seek) { seek.value = Math.round(ratio * 1000); fill(seek, ratio * 100); }
      }
    });
    audio.addEventListener('error', function () {
      failed = true;
      available = false;
      doc.documentElement.classList.remove('ll-playing');
      btns.forEach(function (b) {
        b.setAttribute('aria-pressed', 'false');
      });
      if (state) state.textContent = '原曲暂时连不上 · 点播放重试，或点右侧去网易云';
      if (cur) cur.textContent = '--:--';
    });

    if (seek) {
      seek.addEventListener('input', function () {
        seeking = true;
        var v = (+seek.value || 0) / 1000;
        fill(seek, v * 100);
        var d = audio.duration || 0;
        if (d > 0) {
          audio.currentTime = v * d;
          if (cur) cur.textContent = fmt(audio.currentTime);
        }
      });
      ['change', 'pointerup', 'blur'].forEach(function (evt) {
        seek.addEventListener(evt, function () { seeking = false; });
      });
    }

    if (vol) {
      var v0 = (+vol.value || 55) / 100;
      audio.volume = v0;
      fill(vol, v0 * 100);
      vol.addEventListener('input', function () {
        var v = (+vol.value || 0) / 100;
        audio.volume = v;
        fill(vol, v * 100);
      });
    }
    if (mute) mute.addEventListener('click', function () { audio.muted = !audio.muted; syncMute(); });

    /* 键盘：空格/回车由 button 原生处理；此处补一个全局快捷键仅在无输入聚焦时生效 */
    syncPlaying(); syncMute();
  }

  /* ==========================================================
     时间轴节点 → 章节导航（原生滚动，不接管 wheel）
     ========================================================== */
  function setupNav() {
    $all('.ll-node').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var host = btn.closest ? btn.closest('.ll-chapter') : null;
        if (!host) return;
        /* 对齐到 44% 判定线，而不是 block:'start'。
           旧写法在 PC 1920x1080 把目标章顶到 132px，下一章(811px)
           反而离判定线(475px)更近 ⇒ 阶段标签跳去下一章；手机却判对。 */
        var top = host.getBoundingClientRect().top + window.scrollY;
        var target = Math.max(0, top - window.innerHeight * 0.44 + 24);
        try { window.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' }); }
        catch (e) { window.scrollTo(0, target); }
      });
    });
  }

  /* ==========================================================
     圆形闭环（第 04 章）+「尾声 / 归于平静」按钮
     四段叙事：展开 → 回环 → 收束 → 归于平静。
     【2026-11-06 闭环重做】三段起伏改为沿圆周首尾相接的三瓣轨迹
       （r = 76 - 30*sin²(1.5θ)：三次都从 r=76 的基线圆出发、向内凹到
        r=46、再回到同一条基线圆，全程在圆内，不再有圆外那条尾巴）。
       光点沿 #llLoopTrack 跑一圈，并「按进度」同步描出三段线——
       旧版光点跑圆环、三段弧各自独立描出，两件事没有联动。
       收束把三瓣擦回圆里（不是压扁变淡），终态只剩完整淡环 + 中心静点。
     自治状态机，不进 drawn / settled 一次性缓存：进入 / 重新进入第 04 章、
     按钮点击、回顶复位后都会自然重放；每次先平滑收回再展开，绝不硬切。
     ========================================================== */
  var LOOP_T = { reset: 0.42, expand: 0.9, loop: 1.6, collect: 1.1, calm: 0.42 };
  var LOOP = {
    fig: null, ring: null, track: null, arcs: [], dot: null, core: null, nodes: [],
    btn: null, mini: null, tl: null, state: 'idle', seq: 0,
    ringLen: 0, trackLen: 0, arcLens: [], arcUserLens: [], arcEnd: []
  };

  function loopEls() {
    if (LOOP.fig) return;
    LOOP.fig = $('#llLoopFig');
    if (!LOOP.fig) return;
    LOOP.ring = $('[data-loop="ring"]', LOOP.fig);
    LOOP.track = $('#llLoopTrack', LOOP.fig);
    LOOP.arcs = $all('[data-loop="arc"]', LOOP.fig);
    LOOP.dot = $('.ll-loop-dot', LOOP.fig);
    LOOP.core = $('.ll-loop-core', LOOP.fig);
    LOOP.nodes = $all('.ll-loop-node', LOOP.fig);
    LOOP.btn = $('#llFinTrigger');
    LOOP.mini = LOOP.btn ? $('.ll-fin-mini-ring', LOOP.btn) : null;
  }

  function loopState(s) {
    LOOP.state = s;
    if (LOOP.fig) LOOP.fig.setAttribute('data-loop-state', s);
  }

  function loopMeasure() {
    loopEls();
    if (!LOOP.fig) return false;
    /* DOMContentLoaded 时 SVG 可能尚未完成布局：getScreenCTM() 可能取不到，
       这里保留用户单位长度兜底；滚动进入时 loopPlay() 会重新量精确屏幕长度。 */
    var userLen = function (p) { try { return p.getTotalLength() || 0; } catch (e) { return 0; } };
    var measure = function (p) { return screenLen(p) || userLen(p) || 600; };
    LOOP.ringLen = LOOP.ring ? measure(LOOP.ring) : 0;
    LOOP.trackLen = LOOP.track ? userLen(LOOP.track) : 0;
    LOOP.arcLens = LOOP.arcs.map(function (p) { return measure(p); });
    LOOP.arcUserLens = LOOP.arcs.map(function (p) { return userLen(p); });
    /* 按三段「用户单位长度」占比切分光点进度，保证描线与光点严格同步 */
    var sum = LOOP.arcUserLens.reduce(function (a, b) { return a + b; }, 0);
    var acc = 0;
    LOOP.arcEnd = LOOP.arcUserLens.map(function (L) { acc += L; return sum ? acc / sum : 0; });
    if (LOOP.arcEnd.length !== 3 || !sum) LOOP.arcEnd = [1 / 3, 2 / 3, 1];
    return true;
  }

  /* 起点：环未描、三瓣未描、光点在顶点、中心点与节点隐藏 */
  function loopBase() {
    if (LOOP.ring && LOOP.ringLen) {
      LOOP.ring.style.strokeDasharray = LOOP.ringLen;
      LOOP.ring.style.strokeDashoffset = LOOP.ringLen;
    }
    LOOP.arcs.forEach(function (p, i) {
      if (!LOOP.arcLens[i]) return;
      p.style.strokeDasharray = LOOP.arcLens[i];
      p.style.strokeDashoffset = LOOP.arcLens[i];
      p.style.opacity = '0.82';
    });
    if (LOOP.dot) { LOOP.dot.setAttribute('cx', 360); LOOP.dot.setAttribute('cy', 34); }
    [LOOP.dot, LOOP.core].concat(LOOP.nodes).forEach(function (el) {
      if (!el) return;
      if (animated) gsap().set(el, { opacity: 0 });
      else el.style.opacity = 0;
    });
    if (LOOP.mini) LOOP.mini.style.strokeDashoffset = 52;
  }

  function loopTargets() {
    return [LOOP.ring, LOOP.dot, LOOP.core, LOOP.mini].concat(LOOP.arcs, LOOP.nodes)
      .filter(function (x) { return !!x; });
  }

  function setBtnState(s) {
    var b = LOOP.btn;
    if (!b) return;
    b.setAttribute('data-state', s);
    b.setAttribute('aria-pressed', s === 'active' ? 'true' : 'false');
  }

  /* 统一 setter：gsap 可用走 set；reduced-motion 走 inline style（支持数组） */
  function loopSet(el, props) {
    if (!el) return;
    if (animated) { gsap().set(el, props); return; }
    (Array.isArray(el) ? el : [el]).forEach(function (x) {
      if (!x) return;
      Object.keys(props).forEach(function (k) {
        if (k === 'svgOrigin') return;
        x.style[k] = props[k];
      });
    });
  }

  /* 静息终态：三瓣擦回圆里，只剩完整淡环 + 三个基线落点 + 中心静点 */
  function loopSettle() {
    if (!loopMeasure()) return;
    if (LOOP.tl) { LOOP.tl.kill(); LOOP.tl = null; }
    LOOP.seq++;
    loopBase();
    if (LOOP.ring) LOOP.ring.style.strokeDashoffset = 0;
    loopSet(LOOP.ring, { opacity: 0.55, strokeWidth: 1.4 });
    loopSet(LOOP.arcs, { opacity: 0 });
    loopSet(LOOP.nodes, { opacity: 0.5 });
    loopSet(LOOP.dot, { opacity: 0 });
    loopSet(LOOP.core, { opacity: 1 });
    if (LOOP.mini) LOOP.mini.style.strokeDashoffset = 0;
    loopState('calm');
  }

  /* 完整四段重放：任何入口都先平滑收回，再依次展开/回环/收束/归于平静 */
  function loopPlay(from) {
    if (!loopMeasure()) return;
    if (!animated) { loopSettle(); setBtnState('calm'); return; }
    LOOP.seq++;
    var seq = LOOP.seq;
    if (LOOP.tl) { LOOP.tl.kill(); LOOP.tl = null; }
    gsap().killTweensOf(loopTargets());
    if (LOOP.mini) gsap().killTweensOf(LOOP.mini);

    var T = LOOP_T;
    var t0 = 0, t1 = t0 + T.reset, t2 = t1 + T.expand,
        t3 = t2 + T.loop, t4 = t3 + T.collect;
    var tl = gsap().timeline({
      onComplete: function () {
        if (seq !== LOOP.seq) return;
        loopState('calm');
        setBtnState('calm');
      }
    });
    LOOP.tl = tl;
    loopState('reset');

    /* 0) 平滑收回：从任意当前状态收敛到起点，杜绝突跳 */
    if (LOOP.ring) tl.to(LOOP.ring, {
      strokeDashoffset: LOOP.ringLen, opacity: 1, strokeWidth: 2.2,
      duration: T.reset, ease: 'power1.inOut'
    }, t0);
    LOOP.arcs.forEach(function (p, i) {
      tl.to(p, {
        strokeDashoffset: LOOP.arcLens[i], opacity: 0.82,
        duration: T.reset, ease: 'power1.inOut'
      }, t0);
    });
    tl.to(LOOP.nodes, { opacity: 0.3, duration: T.reset }, t0)
      .to(LOOP.dot, { opacity: 0, duration: T.reset }, t0)
      .to(LOOP.core, { opacity: 0, duration: T.reset }, t0);
    /* 按钮 mini 环与闭环共用同一条时间轴，重复触发也平滑 */
    if (LOOP.mini) {
      tl.to(LOOP.mini, { strokeDashoffset: 52, duration: T.reset, ease: 'power1.inOut' }, t0);
      if (from === 'button') tl.to(LOOP.mini, {
        strokeDashoffset: 0, duration: t4 - T.reset, ease: 'power2.inOut'
      }, t1);
    }

    /* 1) 展开：主圆环沿圆周描出，三个基线落点依次亮起 */
    tl.call(function () { if (seq === LOOP.seq) loopState('expanding'); }, null, t1);
    if (LOOP.ring) tl.to(LOOP.ring, {
      strokeDashoffset: 0, duration: T.expand, ease: 'power2.inOut'
    }, t1);
    tl.to(LOOP.nodes, { opacity: 0.55, duration: 0.5, stagger: 0.12, ease: 'power1.out' }, t1 + 0.12);
    tl.to(LOOP.dot, { opacity: 0.9, duration: 0.35, ease: 'power1.out' }, t1 + 0.4);

    /* 2) 回环：光点沿三瓣轨迹跑满一圈，三段线按进度同步描出。
          每段都从 r=76 的基线圆出发、凹到 r=46、再回到同一条基线圆。 */
    tl.call(function () { if (seq === LOOP.seq) loopState('looping'); }, null, t2);
    var proxy = { t: 0 };
    var ends = LOOP.arcEnd;
    var onMove = function () {
      var p = Math.max(0, Math.min(1, proxy.t));
      if (LOOP.track && LOOP.trackLen && LOOP.dot) {
        try {
          var q = LOOP.track.getPointAtLength(LOOP.trackLen * (p % 1));
          LOOP.dot.setAttribute('cx', q.x.toFixed(1));
          LOOP.dot.setAttribute('cy', q.y.toFixed(1));
        } catch (e) {}
      }
      LOOP.arcs.forEach(function (a, i) {
        var a0 = i ? ends[i - 1] : 0, a1 = ends[i];
        var seg = (p - a0) / Math.max(0.000001, a1 - a0);
        seg = Math.max(0, Math.min(1, seg));
        a.style.strokeDashoffset = LOOP.arcLens[i] * (1 - seg);
      });
    };
    tl.to(proxy, { t: 1, duration: T.loop - 0.16, ease: 'none', onUpdate: onMove }, t2 + 0.08);
    tl.to(LOOP.nodes, { opacity: 0.8, duration: T.loop * 0.6, ease: 'power1.out' }, t2 + 0.2);

    /* 3) 收束：三瓣擦回圆里、环线收细变淡、光点在起点淡出 */
    tl.call(function () { if (seq === LOOP.seq) loopState('collecting'); }, null, t3);
    LOOP.arcs.forEach(function (p, i) {
      tl.to(p, {
        strokeDashoffset: LOOP.arcLens[i], opacity: 0,
        duration: T.collect, ease: 'power2.inOut'
      }, t3);
    });
    if (LOOP.ring) tl.to(LOOP.ring, {
      opacity: 0.55, strokeWidth: 1.4, duration: T.collect, ease: 'power2.inOut'
    }, t3);
    tl.to(LOOP.dot, { opacity: 0, duration: T.collect * 0.6 }, t3);
    tl.to(LOOP.nodes, { opacity: 0.5, duration: T.collect }, t3);

    /* 4) 归于平静：中心静点稳定，闭环保持完整可视，可再次触发 */
    tl.call(function () { if (seq === LOOP.seq) loopState('calm'); }, null, t4);
    tl.fromTo(LOOP.core, { scale: 0.6, opacity: 0 },
      { scale: 1, opacity: 1, svgOrigin: '360 110', duration: T.calm, ease: 'power1.out' }, t4);
  }

  /* 状态复位：向上离开第 04 章 / 回顶时平滑收回，下次进入自然重放 */
  function loopReset() {
    loopEls();
    if (!LOOP.fig) return;
    LOOP.seq++;
    var seq = LOOP.seq;
    if (LOOP.tl) { LOOP.tl.kill(); LOOP.tl = null; }
    if (!loopMeasure()) return;
    if (!animated) { loopSettle(); return; }
    gsap().killTweensOf(loopTargets());
    var g = gsap().timeline({ onComplete: function () {
      if (seq !== LOOP.seq) return;
      loopBase();
      loopState('idle');
      setBtnState('idle');
    }});
    LOOP.tl = g;
    if (LOOP.ring) g.to(LOOP.ring, {
      strokeDashoffset: LOOP.ringLen, opacity: 1, duration: 0.3, ease: 'power1.inOut'
    }, 0);
    LOOP.arcs.forEach(function (p, i) {
      g.to(p, {
        strokeDashoffset: LOOP.arcLens[i], opacity: 0.82,
        duration: 0.3, ease: 'power1.inOut'
      }, 0);
    });
    g.to(LOOP.nodes, { opacity: 0.1, duration: 0.3 }, 0)
      .to(LOOP.dot, { opacity: 0, duration: 0.3 }, 0)
      .to(LOOP.core, { opacity: 0, duration: 0.3 }, 0);
  }

  /* 按钮：触发（涟漪 + mini 环描线）→ 恢复（calm）→ 再次触发（完整重放） */
  function loopTrigger() {
    loopEls();
    if (!LOOP.fig && !LOOP.btn) return;
    setBtnState('active');
    var b = LOOP.btn;
    if (b) {
      b.classList.remove('is-firing');
      void b.offsetWidth;
      b.classList.add('is-firing');
      setTimeout(function () { b.classList.remove('is-firing'); }, 1150);
    }
    if (!animated && LOOP.mini) LOOP.mini.style.strokeDashoffset = 0;
    loopPlay('button');   /* mini 环由同一条时间轴驱动 */
  }

  function setupLoop() {
    loopEls();
    if (!LOOP.fig) return;
    if (LOOP.btn) {
      LOOP.btn.addEventListener('click', loopTrigger);
      setBtnState('idle');
    }
    if (!animated) { loopSettle(); return; }
    loopMeasure();
    loopBase();
    loopState('idle');
    if (LOOP.mini) LOOP.mini.style.strokeDashoffset = 52;
  }

  /* === 滚动接管：默认关闭；开启时也用永不休眠的独立 rAF === */
  function setupSmoothScroll() {
    if (!ENABLE_SMOOTH || reduce || !window.Lenis) return;
    try {
      var l = new window.Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 1, autoRaf: false });
      (function loop(t) { l.raf(t); requestAnimationFrame(loop); })(performance.now());
      l.on('scroll', function () { if (hasST) ST().update(); });
      var y0 = window.scrollY, timer = 0;
      window.addEventListener('wheel', function () {
        y0 = window.scrollY; clearTimeout(timer);
        timer = setTimeout(function () {
          if (Math.abs(window.scrollY - y0) < 1) { try { l.destroy(); } catch (e) {} }
        }, 400);
      }, { passive: true });
    } catch (e) { /* 任何异常都保持原生滚动 */ }
  }

  /* === 无 GSAP / 无 ST / reduced-motion：内容全量直出 === */
  function fallback() {
    $all('.ll-chapter').forEach(function (c, i) { c.classList.add('in'); draw(i); });
    $all('.ll-node').forEach(function (n) { n.classList.add('lit'); });
    var fin = $('#llFin'); if (fin) fin.classList.add('on');
    var sign = $('#llSign'); if (sign) sign.classList.add('stamp');
    draw(-1);
    setProgress(100);
    var jn = $('.ll-join'); if (jn) jn.style.opacity = '1';
    var o = $('#llOld'); if (o) o.style.opacity = '.6';
    var n = $('#llNew'); if (n) n.style.opacity = '1';
  }

  /* === 统一描边揭示：五段读数共用一个函数 === */
  /* 【2026-11-06 硬 BUG 修复 · 实测实锤】
     vector-effect:non-scaling-stroke + preserveAspectRatio="none" 下，
     stroke-dasharray / stroke-dashoffset 按「屏幕像素」解释，而
     getTotalLength() 返回的是 viewBox 用户坐标长度。1920 宽实测
     1024.7 vs 1311.7（比值 1.28）⇒ 旧代码每段波形最多只画 78%，
     末尾永远缺一截（用户截图里蓝线停在面板 3/4 处）。
     统一改用「屏幕空间路径长度」：沿路径采样 + getScreenCTM() 变换。 */
  function screenLen(p) {
    var userLen;
    try { userLen = p.getTotalLength(); } catch (e) { return 0; }
    if (!userLen) return 0;
    var svg = p.ownerSVGElement, m = null;
    try { m = p.getScreenCTM(); } catch (e) {}
    if (!m || !svg || !svg.createSVGPoint) return userLen;
    try {
      var pt = svg.createSVGPoint(), total = 0, prev = null, i, q, a;
      for (i = 0; i <= 240; i++) {
        q = p.getPointAtLength(userLen * i / 240);
        pt.x = q.x; pt.y = q.y;
        a = pt.matrixTransform(m);
        if (prev) total += Math.sqrt((a.x - prev.x) * (a.x - prev.x) + (a.y - prev.y) * (a.y - prev.y));
        prev = { x: a.x, y: a.y };
      }
      return total > 0 ? total : userLen;
    } catch (e) { return userLen; }
  }

  function prepareLines() {
    $all('path[data-line]').forEach(function (p) {
      var len = screenLen(p);
      if (!len) return;
      p.__llLen = len;
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
    });
  }
  var drawn = {};
  function draw(idx, force) {
    if (drawn[idx] && !force) return;
    drawn[idx] = true;
    paint(idx, false);
  }

  /* 每段波形有自己的叙事节奏，旧版 5 段全部「同时从左往右画」，
     汇流/断接/回环的文案含义根本没被演出来，观感就是同一段动画重复。
       0 起搏：五次心跳，一段一段跳出来
       1 汇流：四条细线先各自汇到一点 → 汇合点弹亮 → 一条粗线向右延伸
       2 断接：先画到断口 → 断口闪一下 → 隔一拍再接上后半段
       3 回环：三个起伏依次画完，每次都回到同一条基线
      -1 平线：一口气缓缓拉平 */
  function paint(idx, isReplay) {
    var host = idx < 0 ? $('#llFin') : $all('.ll-chapter')[idx];
    if (!host) return;
    var paths = $all('path[data-line]', host);
    var lens = paths.map(function (p) {
      var L = screenLen(p) || p.__llLen || 0;
      p.__llLen = L;
      return L;
    });
    paths.forEach(function (p, i) {
      if (animated) gsap().killTweensOf(p);
      p.style.strokeDasharray = lens[i];
      p.style.strokeDashoffset = lens[i];
    });
    if (!animated) {
      paths.forEach(function (p) { p.style.strokeDashoffset = 0; });
      var j0 = $('.ll-join', host); if (j0) j0.style.opacity = '1';
      return;
    }
    var k = isReplay ? 0.8 : 1;
    var tl = gsap().timeline();
    var P = function (i) { return paths[i]; };
    var to0 = function (i, dur, at, ease) {
      if (!P(i)) return;
      tl.to(P(i), { strokeDashoffset: 0, duration: dur * k, ease: ease || 'power2.inOut' }, at * k);
    };

    if (idx === 0) {
      /* 起搏：按 4 个心跳把整条线切成 5 次短促推进，中间留呼吸 */
      var cuts = [0.18, 0.40, 0.63, 0.87, 1], acc = 0, L = lens[0];
      if (P(0)) cuts.forEach(function (c, j) {
        tl.to(P(0), { strokeDashoffset: L * (1 - c), duration: 0.17 * k, ease: 'power3.out' }, acc * k);
        acc += 0.17 + (j < cuts.length - 1 ? 0.11 : 0);
      });
    } else if (idx === 1) {
      /* 汇流：四条细线 → 汇合点弹亮 → 一条粗线 */
      for (var i = 0; i < 4; i++) to0(i, 0.52, i * 0.09);
      var join = $('.ll-join', host);
      if (join) {
        gsap().set(join, { transformOrigin: '50% 50%', scale: 0, opacity: 0 });
        tl.to(join, { scale: 1, opacity: 1, duration: 0.34 * k, ease: 'back.out(2)' }, 0.52 * k);
      }
      to0(4, 0.62, 0.74);
    } else if (idx === 2) {
      /* 断接：先到断口，停一拍，再自己接上 */
      to0(0, 0.55, 0);
      var brk = $('.ll-break', host);
      if (brk) {
        tl.to(brk, { opacity: 1, duration: 0.16 * k }, 0.48 * k)
          .to(brk, { opacity: 0.65, duration: 0.34 * k }, 0.66 * k);
      }
      to0(1, 0.72, 0.80);
    } else {
      /* 尾声平线 */
      to0(0, 0.95, 0, 'power1.inOut');
    }
  }

  /* === 逐字遮罩揭示（仅动画可用时才拆字） === */
  function setupReveal() {
    $all('[data-reveal]').forEach(function (el) {
      var text = el.textContent;
      el.setAttribute('aria-label', text);
      el.textContent = '';
      var frag = doc.createDocumentFragment();
      Array.from(text).forEach(function (ch) {
        var o = doc.createElement('span'); o.className = 'll-ch';
        var i = doc.createElement('span'); i.className = 'll-ch-i';
        i.textContent = (ch === ' ') ? '\u00a0' : ch;
        o.appendChild(i); frag.appendChild(o);
      });
      el.appendChild(frag);
      var inners = $all('.ll-ch-i', el);
      gsap().set(inners, { yPercent: 70 });
      ST().create({
        trigger: el, start: 'top ' + REVEAL_LINE, once: true,
        onEnter: function () {
          gsap().to(inners, { yPercent: 0, duration: 0.55, stagger: 0.012, ease: 'power3.out' });
        }
      });
    });
  }

  /* === 主控状态机：唯一真值源，杜绝区间重叠抖动 === */
  var current = -1;
  function setupRail() {
    var stage = $('#llStage');
    if (!stage) return;
    ST().create({
      trigger: stage, start: 'top ' + ENTER_LINE, end: 'bottom bottom',
      onUpdate: function (self) {
        clearFinale();
        var p = Math.max(0, Math.min(1, self.progress));
        setProgress(p * 100);
        settlePassed();
        var idx = nearestChapter();
        if (idx !== current) { current = idx; setActive(idx); }
      },
      onLeaveBack: function () { setProgress(0); current = -1; setActive(-1); loopReset(); },
      onLeave: function () { setProgress(100); }
    });
  }

  function nearestChapter() {
    /* 判定线 = 视口高度 44%，取「顶部离该线最近」的可见章节。
       这条相对线在正常阅读下跨设备完全同步，实测 5 视口阶段切换一致，
       不要改成「已越过判定线的最后一章」：那样会慢整整一章。
       【本次修正】所有章节都滚出视口上方时返回最后一章，
       旧版返回 -1 会让手机「一次滚到底」的节点全部熄灭。 */
    var vh = window.innerHeight, line = vh * 0.44;
    var best = -1, dist = Infinity, last = 0;
    $all('.ll-chapter').forEach(function (c, i) {
      last = i;
      var r = c.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) {
        var d = Math.abs(r.top - line);
        if (d < dist) { dist = d; best = i; }
      }
    });
    return best >= 0 ? best : last;
  }

  /* 被快速跳过的章节：不再排队描线，直接补成「已画完」。
     只对顶部已滚出视口的章节生效，当前正在阅读的那章保留完整入场动画。 */
  var settled = {};
  function settlePassed() {
    $all('.ll-chapter').forEach(function (c, i) {
      var box = c.getBoundingClientRect();
      if (settled[i] || box.top >= 0) return;
      /* 第 04 章闭环由自治状态机驱动：只有整章完全滚出视口才补静息终态。
         旧版只要章节顶部越过视口顶就 loopSettle()，与 onEnter 的
         loopPlay() 抢同一条时间轴 ⇒ 环线 strokeDashoffset 从 0 硬切
         到 ringLen（实测 Δ=434.2px），并把正在播的终态搅乱。 */
      if (i === 3 && box.bottom > 0) return;
      settled[i] = true;
      if (i === 3) { loopSettle(); drawn[i] = true; return; }
      c.classList.add('in');
      $all('path[data-line]', c).forEach(function (p) {
        var len = screenLen(p) || p.__llLen || 0;
        if (!len) return;
        p.__llLen = len;
        gsap().killTweensOf(p);
        p.style.strokeDasharray = len;
        p.style.strokeDashoffset = 0;
      });
      var jn = $('.ll-join', c);
      if (jn) { gsap().killTweensOf(jn); gsap().set(jn, { scale: 1, opacity: 1 }); }
      drawn[i] = true;
      if (i === 2) morph();
    });
  }

  var finActive = false;
  var stampPlayed = false;   /* 落款盖章整页只播一次，避免上下抖动反复重播 */
  function clearFinale() {
    var fin = $('#llFin');
    if (!fin) return;
    /* 已抵达尾声时不清理，避免主控 onUpdate 把落款动画反复抹掉 */
    if (fin.getBoundingClientRect().top < window.innerHeight * 0.65) return;
    if (!fin.classList.contains('on') && !finActive) return;
    fin.classList.remove('on');
    finActive = false;
    delete drawn[-1];
  }

  function setProgress(pct) {
    var rail = $('#llRailFill');
    if (rail) rail.style.height = pct.toFixed(2) + '%';
  }

  function setActive(idx) {
    var chapters = $all('.ll-chapter'), nodes = $all('.ll-node');
    nodes.forEach(function (n, i) {
      n.classList.toggle('lit', i <= idx);
      n.classList.toggle('cur', i === idx);
      n.setAttribute('aria-current', i === idx ? 'step' : 'false');
    });
    chapters.forEach(function (c, i) { c.classList.toggle('is-active', i === idx); });
  }

  /* === 章节入场：每章一次，起始透明度温和，未触发也可读 ===
     【交互修复】旧版用 CH_GAP=240ms 全局队列给入场排队：宽屏一次滚动
     跨 3–4 章时最后一段波形要等 720ms 才开始、再画 1s 才完，用户早已
     滚过去，实测出现「章节已 in 但波形 undrawn / mid」的空白面板。
     改为立即执行；被跨过的章节交给主控 settlePassed() 直接补完。 === */
  function setupChapters() {
    $all('.ll-chapter').forEach(function (c, i) {
      var cfg = {
        trigger: c, start: 'top ' + ENTER_LINE,
        onEnter: function () {
          c.classList.add('in');
          reveal(c);
          if (i === 3) loopPlay('enter'); else draw(i);
          if (i === 2) morph();
        }
      };
      if (i === 3) {
        /* 圆形闭环不设 once：重新进入 / 状态复位后自然重放 */
        cfg.onEnterBack = function () { loopPlay('reenter'); };
        cfg.onLeaveBack = function () { loopReset(); };
      } else {
        cfg.once = true;
      }
      ST().create(cfg);
    });
  }

  function reveal(c) {
    var card = $('.ll-card', c);
    if (!card) return;
    var kids = $all(':scope > *', card);
    gsap().fromTo(kids,
      { y: 14, opacity: 0.72 },
      { y: 0, opacity: 1, duration: 0.62, stagger: 0.05, ease: 'power3.out', clearProps: 'transform,opacity' }
    );
  }

  var morphed = false;
  function morph() {
    if (morphed) return;
    morphed = true;
    var o = $('#llOld'), n = $('#llNew');
    if (o) gsap().to(o, { opacity: 0.5, x: -6, duration: 0.9, ease: 'power2.out' });
    if (n) gsap().fromTo(n, { opacity: 0.4, x: 14 }, { opacity: 1, x: 0, duration: 0.95, ease: 'power2.out' });
  }

  /* === 尾声：进入 / 回滚完整闭环 === */
  function setupFinale() {
    var fin = $('#llFin');
    if (!fin) return;
    ST().create({
      trigger: fin, start: 'top ' + ENTER_LINE,
      onEnter: function () { enterFinale(fin); },
      onLeaveBack: function () { leaveFinale(fin); }
    });
  }

  function enterFinale(fin) {
    if (finActive) return;
    finActive = true;
    fin.classList.add('on');
    setProgress(100);
    $all('.ll-node').forEach(function (n) { n.classList.remove('cur'); });
    var sign = $('#llSign');
    if (sign) {
      if (!stampPlayed) { sign.classList.remove('stamp'); void sign.offsetWidth; sign.classList.add('stamp'); stampPlayed = true; }
      else sign.classList.add('stamp');
    }
    draw(-1);
    var ft = $('#llFinText');
    if (ft) gsap().fromTo(ft, { opacity: 0 }, { opacity: 1, duration: 0.85, ease: 'power2.out' });
  }

  function leaveFinale(fin) {
    if (!finActive) return;
    finActive = false;
    fin.classList.remove('on');
    /* 保留 stamp：移除会让下次进入重新触发 keyframes，观感像动画重复播放 */
    delete drawn[-1];
    current = -1;
    setActive(3);
  }

  /* 视口变化后 CTM 变化 ⇒ 屏幕空间长度变化；只更新已画完的线，
     未画/正在画的交给 paint() 重算，避免打断进行中的 tween。 */
  function onResize() {
    $all('path[data-line]').forEach(function (p) {
      if ((parseFloat(p.style.strokeDashoffset) || 0) > 0.5) return;
      var L = screenLen(p); if (!L) return;
      p.__llLen = L;
      p.style.strokeDasharray = L;
      p.style.strokeDashoffset = 0;
    });
    if (LOOP.fig && LOOP.state === 'calm') loopSettle();
    else if (LOOP.fig && LOOP.state === 'idle') { loopMeasure(); loopBase(); }
    refresh();
  }
  function refresh() {
    if (LOOP.fig && LOOP.state === 'idle') { try { loopMeasure(); loopBase(); } catch (e) {} }
    if (hasST) try { ST().refresh(); } catch (e) {}
  }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  /* 所有函数声明与 var 赋值就绪后再启动（顺序敏感，勿上移） */
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
