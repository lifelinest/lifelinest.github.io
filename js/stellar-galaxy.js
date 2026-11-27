/*
 * StellarGalaxy - 星辰相册「星系视图」渲染模块（普通 script，非 module）
 *
 * 依赖：window.THREE（由 HTML 中 <script type="module"> 导入自托管 three.module.js 后注入）
 *      window.STELLAR_DATA（stellar-data.js 生成的相册数据）
 *
 * 设计说明：
 * - 星系视图是「深空取景窗」，始终保持深色星空（#06070a），不随站点明暗主题切换背景；
 *   setTheme() 只微调光晕强度，这是刻意的设计意图。
 * - 不引入 Tauri IPC、不读写后端、不依赖任何 CDN / OrbitControls / EffectComposer。
 * - 主星点击 / 悬停使用「世界坐标投影到屏幕 + 像素距离」判定，比粒子 raycaster 更可靠。
 */
(function (global) {
  'use strict';

  // 同一 canvas 重复 mount 时，先销毁旧实例（ WeakMap 避免内存泄漏）
  var registry = new WeakMap();

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function hexToRgb(hex) {
    var h = String(hex || '').replace(/[^0-9a-fA-F]/g, '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return [1, 1, 1];
    var n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // 程序化径向辉光贴图（复用 christmas-tree.js 的思路），用于中心的过曝白核与柔光晕
  function radialTexture(T, inner, mid, outer) {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, inner);
    g.addColorStop(0.28, mid);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    var t = new T.CanvasTexture(c);
    if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    return t;
  }

  // 与参考项目 ASTRA_BLEND 一致的加法混合参数（避免引入后处理 Bloom）
  function additiveBlend(T) {
    return {
      blending: T.CustomBlending,
      blendEquation: T.AddEquation,
      blendSrc: T.SrcAlphaFactor,
      blendDst: T.OneFactor,
      blendEquationAlpha: T.AddEquation,
      blendSrcAlpha: T.OneFactor,
      blendDstAlpha: T.OneMinusSrcAlphaFactor
    };
  }

  /* ---------------- 星尘粒子 shader（精简自 NODE_VERT / PARTICLE_FRAG + starMaterial 星芒） ---------------- */
  var GALAXY_VERT = [
    'precision highp float;',
    'attribute vec3 aColor;',
    'attribute float aPhase;',
    'attribute float aSize;',
    'attribute float aBright;',
    'uniform float uTime;',
    'uniform float uPixelRatio;',
    'uniform float uSizeScale;',
    'uniform float uOpacity;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'varying float vDiam;',
    'varying float vRay;',
    'void main() {',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  float tw = 0.78 + 0.22 * sin(uTime * (0.9 + aBright * 1.6) + aPhase);',
    '  float ps = aSize * uSizeScale * uPixelRatio * (26.0 / max(-mv.z, 0.001));',
    '  gl_PointSize = clamp(ps, 0.9, 16.0);',
    '  vDiam = gl_PointSize;',
    '  vColor = aColor;',
    '  vAlpha = uOpacity * tw * aBright;',
    '  vRay = smoothstep(1.8, 3.4, aSize) * 0.9;',
    '}'
  ].join('\n');

  var GALAXY_FRAG = [
    'precision highp float;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'varying float vDiam;',
    'varying float vRay;',
    'float cubicCoverage(float c) {',
    '  float x = abs(c);',
    '  if (x < 1.0) return (4.0 - 6.0 * x * x + 3.0 * x * x * x) / 6.0;',
    '  float tail = max(2.0 - x, 0.0);',
    '  return tail * tail * tail / 6.0;',
    '}',
    'float filteredCore(vec2 pixel, float area) {',
    '  return cubicCoverage(pixel.x) * cubicCoverage(pixel.y) * area * vDiam * vDiam;',
    '}',
    'void main() {',
    '  vec2 pixel = (gl_PointCoord - 0.5) * max(vDiam, 4.0);',
    '  vec2 point = pixel * 2.0 / max(vDiam, 0.0001);',
    '  float d = length(point);',
    '  float disc = pow(1.0 - smoothstep(0.08, 1.0, d), 2.2);',
    '  float hx = exp(-abs(point.y) * 26.0) * (1.0 - smoothstep(0.16, 1.0, abs(point.x)));',
    '  float vy = exp(-abs(point.x) * 26.0) * (1.0 - smoothstep(0.16, 1.0, abs(point.y)));',
    '  float rays = max(hx, vy) * 0.30 * vRay;',
    '  float resolved = smoothstep(2.0, 4.0, vDiam);',
    '  float coverage = mix(filteredCore(pixel, 0.15), max(disc, rays), resolved);',
    '  if (coverage <= 0.001) discard;',
    '  vec3 emission = mix(vColor, vec3(1.0), disc * 0.65) * (1.0 + rays);',
    '  gl_FragColor = vec4(emission, vAlpha * coverage);',
    '}'
  ].join('\n');

  /* ---------------- 背景星野 shader（精简自 STAR_VERT：呼吸闪烁 + 三色冷暖分布） ---------------- */
  var FIELD_VERT = [
    'precision highp float;',
    'attribute vec3 aSeed;',
    'uniform float uTime;',
    'uniform float uPixelRatio;',
    'uniform float uOpacity;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'void main() {',
    '  vec3 p = position;',
    '  p.x += sin(uTime * 0.05 + aSeed.x * 12.0) * 1.5;',
    '  p.y += cos(uTime * 0.04 + aSeed.y * 12.0) * 1.2;',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  float breathe = 0.72 + 0.28 * sin(uTime * (0.25 + aSeed.x * 0.6) + aSeed.y * 18.0);',
    '  gl_PointSize = clamp((0.7 + aSeed.z * 1.3) * uPixelRatio, 0.5, 2.2);',
    '  vAlpha = breathe * uOpacity * (0.16 + aSeed.z * 0.26);',
    '  if (aSeed.z < 0.10) vColor = vec3(1.0, 0.58, 0.32);',
    '  else if (aSeed.z < 0.46) vColor = vec3(0.42, 0.72, 1.0);',
    '  else vColor = vec3(0.86, 0.91, 1.0);',
    '}'
  ].join('\n');

  var FIELD_FRAG = [
    'precision highp float;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'void main() {',
    '  vec2 c = gl_PointCoord - 0.5;',
    '  float d = length(c);',
    '  if (d > 0.5) discard;',
    '  float a = smoothstep(0.5, 0.05, d) * vAlpha;',
    '  gl_FragColor = vec4(vColor, a);',
    '}'
  ].join('\n');

  /* ---------------- 主星（相册）shader：大尺寸 + 十字星芒 + hover/focus 高亮 ---------------- */
  var NODE_VERT2 = [
    'precision highp float;',
    'attribute vec3 aColor;',
    'attribute float aSize;',
    'attribute float aPhase;',
    'attribute float aIndex;',
    'uniform float uTime;',
    'uniform float uPixelRatio;',
    'uniform float uHoverIndex;',
    'uniform float uFocusIndex;',
    'uniform float uOpacity;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'varying float vDiam;',
    'void main() {',
    '  vec3 p = position;',
    '  p.y += sin(uTime * 0.5 + aPhase) * 0.10;',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  float isHover = 1.0 - step(0.5, abs(aIndex - uHoverIndex));',
    '  float isFocus = 1.0 - step(0.5, abs(aIndex - uFocusIndex));',
    '  float hlStrength = max(isHover, isFocus * 0.6);',
    '  float tw = 0.82 + 0.18 * sin(uTime * (0.8 + aPhase * 0.1) + aPhase);',
    '  float ps = (aSize + hlStrength * 5.0) * uPixelRatio * (26.0 / max(-mv.z, 0.001));',
    '  gl_PointSize = clamp(ps, 4.0, 48.0);',
    '  vDiam = gl_PointSize;',
    '  vColor = mix(aColor, vec3(1.0), hlStrength * 0.25);',
    '  vAlpha = uOpacity * tw * (0.85 + hlStrength * 0.5);',
    '}'
  ].join('\n');

  var NODE_FRAG2 = [
    'precision highp float;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'varying float vDiam;',
    'void main() {',
    '  vec2 p = (gl_PointCoord - 0.5) * 2.0;',
    '  float d = length(p);',
    '  float core = pow(1.0 - smoothstep(0.0, 0.30, d), 1.6);',
    '  float glow = pow(1.0 - smoothstep(0.0, 1.0, d), 2.4);',
    '  float hx = exp(-abs(p.y) * 16.0) * (1.0 - smoothstep(0.12, 1.0, abs(p.x)));',
    '  float vy = exp(-abs(p.x) * 16.0) * (1.0 - smoothstep(0.12, 1.0, abs(p.y)));',
    '  float rays = max(hx, vy);',
    '  float a = (core + glow * 0.55 + rays * 0.45) * vAlpha;',
    '  if (a < 0.005) discard;',
    '  vec3 col = mix(vColor, vec3(1.0), core * 0.8 + rays * 0.25);',
    '  gl_FragColor = vec4(col * (1.0 + core * 0.6), min(a, 1.0));',
    '}'
  ].join('\n');

  function noopController() {
    return {
      render: function () {}, resize: function () {}, pause: function () {}, resume: function () {},
      destroy: function () {}, focusAlbum: function () {}, setTheme: function () {}
    };
  }

  // 星系几何常量（对数螺旋：r 随 t 指数增长）
  var R0 = 0.55, R_EXP = 2.75, TURNS = 1.25, ARMS = 2, TWO_PI = Math.PI * 2;
  function armPoint(arm, t, T) {
    var r = R0 * Math.exp(R_EXP * t);
    var theta = t * TURNS * TWO_PI + arm * (TWO_PI / ARMS);
    return new T.Vector3(Math.cos(theta) * r, Math.sin(theta) * r, 0);
  }

  function mount(canvas, opts) {
    opts = opts || {};
    if (!canvas || typeof canvas.getContext !== 'function') return noopController();

    var old = registry.get(canvas);
    if (old) { old.destroy(); registry.delete(canvas); }

    var destroyed = false, ready = false, running = false;
    var pollTimer = null, rafId = 0, resizeObserver = null;
    var T = null, renderer, scene, camera, tiltGroup, spinGroup;
    var dustGeo, dustMat, dustPoints, fieldGeo, fieldMat, fieldPoints;
    var starGeo, starMat, starPoints, glowTex, halo, coreSprite;
    var mainStars = [], hoverIndex = -1, focusIndex = -1;
    var spin = 0, spinTarget = 0, focusing = false;
    var elapsed = 0, lastTime = 0;
    var mouseX = -1e5, mouseY = -1e5, mouseActive = false;
    var dragging = false, dragX = 0, dragY = 0, dragMoved = 0;
    var currentDark = true, pendingFocus = null;
    var tmpVec = null;
    var bound = {};

    var controller = {
      render: function () {
        if (ready && !destroyed) { updateHover(); renderer.render(scene, camera); }
      },
      resize: resize,
      pause: function () {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
      },
      resume: function () {
        if (destroyed || !ready || running) return;
        running = true;
        lastTime = 0;
        rafId = requestAnimationFrame(loop);
      },
      destroy: destroy,
      focusAlbum: function (id) {
        if (!ready || destroyed) { pendingFocus = id; return; }
        focusAlbum(id);
      },
      setTheme: function (isDark) {
        currentDark = !!isDark;
        if (!ready || destroyed) return;
        // 星系始终保持深色星空；浅色主题仅轻微收敛光晕，不替换背景。
        var k = currentDark ? 1.0 : 0.86;
        if (halo) halo.material.opacity = 0.50 * k;
        if (coreSprite) coreSprite.material.opacity = 0.85 * k;
        if (dustMat) dustMat.uniforms.uOpacity.value = 0.95 * k;
        if (starMat) starMat.uniforms.uOpacity.value = 0.95 * k;
      }
    };
    registry.set(canvas, controller);

    // window.THREE 由 module script 注入，pjax 下可能晚到：轮询最多 5 秒。
    waitForDeps(init);
    return controller;

    function waitForDeps(cb) {
      var start = Date.now();
      function poll() {
        if (destroyed) return;
        if (global.THREE && global.STELLAR_DATA && global.STELLAR_DATA.albums) { cb(); return; }
        if (Date.now() - start > 5000) {
          if (global.console && console.warn) {
            console.warn('[StellarGalaxy] 等待 window.THREE / window.STELLAR_DATA 超时（5s），星系视图未初始化');
          }
          return;
        }
        pollTimer = setTimeout(poll, 50);
      }
      poll();
    }

    function init() {
      if (destroyed) return;
      T = global.THREE;
      tmpVec = new T.Vector3();

      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x06070a, 1);

      scene = new T.Scene();
      camera = new T.PerspectiveCamera(52, 1, 0.1, 500);
      camera.position.set(0, 0, 21);
      camera.lookAt(0, 0, 0);

      tiltGroup = new T.Group();
      tiltGroup.rotation.set(-0.38, 0.10, 0);
      scene.add(tiltGroup);
      spinGroup = new T.Group();
      tiltGroup.add(spinGroup);

      var w = canvas.clientWidth || global.innerWidth || 800;
      var mobile = w > 0 && w < 600;
      var count = Math.max(2000, Math.floor(Number(opts.starCount) || 14000));
      if (mobile) count = Math.floor(count / 2); // 移动端自动减半

      glowTex = radialTexture(T, 'rgba(255,250,235,1)', 'rgba(255,190,120,0.32)', 'rgba(255,150,80,0)');
      buildGalaxy(count);
      buildField(mobile ? 900 : 1800);
      buildStars(global.STELLAR_DATA.albums);
      buildCoreGlow();

      resize();
      bindEvents();
      ready = true;
      if (pendingFocus != null) focusAlbum(pendingFocus);
      controller.setTheme(currentDark);
      controller.render();
      controller.resume();
    }

    function buildGalaxy(count) {
      var positions = new Float32Array(count * 3);
      var colors = new Float32Array(count * 3);
      var phases = new Float32Array(count);
      var sizes = new Float32Array(count);
      var brights = new Float32Array(count);
      // 三色：冷白 / 青蓝 / 暖橙；核球偏暖白
      var C_CORE = [1.00, 0.93, 0.78], C_WARM = [1.00, 0.60, 0.30];
      var C_COLD = [0.86, 0.92, 1.00], C_BLUE = [0.42, 0.72, 1.00];
      var bulgeCount = Math.floor(count * 0.16);

      for (var i = 0; i < count; i++) {
        var isBulge = i < bulgeCount;
        var arm = i % ARMS;
        var r, theta, spread, z;
        if (isBulge) {
          r = Math.pow(Math.random(), 1.9) * 1.25;
          theta = Math.random() * TWO_PI;
          spread = r * 0.45 + 0.05;
          z = (Math.random() - 0.5) * 0.45 * (1 - r / 1.5);
        } else {
          var t = Math.pow(Math.random(), 0.72);
          r = R0 * Math.exp(R_EXP * t);
          theta = t * TURNS * TWO_PI + arm * (TWO_PI / ARMS);
          spread = 0.13 + r * 0.055;
          z = (Math.random() + Math.random() - 1) * 0.18 * (1 + r * 0.05);
        }
        var pr = Math.max(0.02, r + (Math.random() + Math.random() - 1) * spread);
        var pa = theta + (Math.random() + Math.random() - 1) * spread / Math.max(pr, 0.4);
        positions[i * 3] = Math.cos(pa) * pr;
        positions[i * 3 + 1] = Math.sin(pa) * pr;
        positions[i * 3 + 2] = z;

        var u = Math.random();
        var col;
        if (isBulge || r < 1.3) col = u < 0.55 ? C_CORE : C_WARM;
        else if (u < 0.40) col = C_BLUE;
        else if (u < 0.72) col = C_COLD;
        else col = C_WARM;
        var k = isBulge ? (0.78 + Math.random() * 0.42) : (0.30 + Math.random() * 0.70);
        colors[i * 3] = col[0] * k;
        colors[i * 3 + 1] = col[1] * k;
        colors[i * 3 + 2] = col[2] * k;

        phases[i] = Math.random() * TWO_PI;
        sizes[i] = isBulge ? (1.0 + Math.random() * 1.9) : (0.55 + Math.random() * 1.5);
        brights[i] = isBulge ? (0.85 + Math.random() * 0.5) : (0.42 + Math.random() * 0.68);
      }

      dustGeo = new T.BufferGeometry();
      dustGeo.setAttribute('position', new T.BufferAttribute(positions, 3));
      dustGeo.setAttribute('aColor', new T.BufferAttribute(colors, 3));
      dustGeo.setAttribute('aPhase', new T.BufferAttribute(phases, 1));
      dustGeo.setAttribute('aSize', new T.BufferAttribute(sizes, 1));
      dustGeo.setAttribute('aBright', new T.BufferAttribute(brights, 1));
      dustMat = new T.ShaderMaterial(Object.assign({
        uniforms: {
          uTime: { value: 0 }, uPixelRatio: { value: 1 },
          uSizeScale: { value: 2.15 }, uOpacity: { value: 0.95 }
        },
        vertexShader: GALAXY_VERT,
        fragmentShader: GALAXY_FRAG,
        transparent: true, depthWrite: false, depthTest: false, toneMapped: false
      }, additiveBlend(T)));
      dustPoints = new T.Points(dustGeo, dustMat);
      dustPoints.frustumCulled = false;
      spinGroup.add(dustPoints);
    }

    function buildField(count) {
      var positions = new Float32Array(count * 3);
      var seeds = new Float32Array(count * 3);
      for (var i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 130;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 90;
        positions[i * 3 + 2] = -22 - Math.random() * 70;
        seeds[i * 3] = Math.random();
        seeds[i * 3 + 1] = Math.random();
        seeds[i * 3 + 2] = Math.random();
      }
      fieldGeo = new T.BufferGeometry();
      fieldGeo.setAttribute('position', new T.BufferAttribute(positions, 3));
      fieldGeo.setAttribute('aSeed', new T.BufferAttribute(seeds, 3));
      fieldMat = new T.ShaderMaterial(Object.assign({
        uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uOpacity: { value: 1 } },
        vertexShader: FIELD_VERT,
        fragmentShader: FIELD_FRAG,
        transparent: true, depthWrite: false, depthTest: false, toneMapped: false
      }, additiveBlend(T)));
      fieldPoints = new T.Points(fieldGeo, fieldMat);
      fieldPoints.frustumCulled = false;
      scene.add(fieldPoints);
    }

    function buildStars(albums) {
      var n = Math.min(albums.length, 19);
      mainStars = [];
      var positions = new Float32Array(n * 3);
      var colors = new Float32Array(n * 3);
      var sizes = new Float32Array(n);
      var phases = new Float32Array(n);
      var indices = new Float32Array(n);

      for (var i = 0; i < n; i++) {
        var album = albums[i];
        var arm = i % ARMS;
        var rank = Math.floor(i / ARMS);
        var t = 0.14 + (rank / 6) * 0.80;
        var pos = armPoint(arm, t, T);
        // 轻微确定性抖动，避免主星与星尘臂完全重合
        var jitter = Math.sin(i * 12.9898) * 0.045;
        pos.applyAxisAngle(new T.Vector3(0, 0, 1), jitter);

        var rgb = hexToRgb(album.colors && album.colors[0] ? album.colors[0] : '#ffffff');
        var size = 9 + (i * 7 % 6); // 9-14 CSS px
        positions[i * 3] = pos.x;
        positions[i * 3 + 1] = pos.y;
        positions[i * 3 + 2] = pos.z;
        colors[i * 3] = Math.min(1, rgb[0] * 1.25 + 0.15);
        colors[i * 3 + 1] = Math.min(1, rgb[1] * 1.25 + 0.15);
        colors[i * 3 + 2] = Math.min(1, rgb[2] * 1.25 + 0.15);
        sizes[i] = size;
        phases[i] = i * 1.7 + 0.4;
        indices[i] = i;
        mainStars.push({ album: album, pos: pos, size: size, index: i });
      }

      starGeo = new T.BufferGeometry();
      starGeo.setAttribute('position', new T.BufferAttribute(positions, 3));
      starGeo.setAttribute('aColor', new T.BufferAttribute(colors, 3));
      starGeo.setAttribute('aSize', new T.BufferAttribute(sizes, 1));
      starGeo.setAttribute('aPhase', new T.BufferAttribute(phases, 1));
      starGeo.setAttribute('aIndex', new T.BufferAttribute(indices, 1));
      starMat = new T.ShaderMaterial(Object.assign({
        uniforms: {
          uTime: { value: 0 }, uPixelRatio: { value: 1 },
          uHoverIndex: { value: -1 }, uFocusIndex: { value: -1 },
          uOpacity: { value: 0.95 }
        },
        vertexShader: NODE_VERT2,
        fragmentShader: NODE_FRAG2,
        transparent: true, depthWrite: false, depthTest: false, toneMapped: false
      }, additiveBlend(T)));
      starPoints = new T.Points(starGeo, starMat);
      starPoints.frustumCulled = false;
      spinGroup.add(starPoints);
    }

    function buildCoreGlow() {
      halo = new T.Sprite(new T.SpriteMaterial({
        map: glowTex, color: 0xffd8a8, transparent: true,
        blending: T.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0.50
      }));
      halo.scale.set(13, 13, 1);
      spinGroup.add(halo);
      coreSprite = new T.Sprite(new T.SpriteMaterial({
        map: glowTex, color: 0xffffff, transparent: true,
        blending: T.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0.85
      }));
      coreSprite.scale.set(6.4, 6.4, 1);
      spinGroup.add(coreSprite);
    }

    function resize() {
      if (!ready || destroyed) return;
      var w = canvas.clientWidth || canvas.width || global.innerWidth || 800;
      var h = canvas.clientHeight || canvas.height || global.innerHeight || 600;
      if (w < 1) w = 800;
      if (h < 1) h = 600;
      renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      var pr = renderer.getPixelRatio();
      if (dustMat) dustMat.uniforms.uPixelRatio.value = pr;
      if (fieldMat) fieldMat.uniforms.uPixelRatio.value = pr;
      if (starMat) starMat.uniforms.uPixelRatio.value = pr;
    }

    function setHover(idx) {
      if (idx === hoverIndex) return;
      hoverIndex = idx;
      if (starMat) starMat.uniforms.uHoverIndex.value = idx;
      canvas.style.cursor = idx >= 0 ? 'pointer' : '';
      if (typeof opts.onHover === 'function') {
        opts.onHover(idx >= 0 ? mainStars[idx].album : null);
      }
    }

    // 屏幕距离判定：把主星世界坐标投影为像素坐标，取最近者
    function updateHover() {
      if (!ready || destroyed || !mouseActive) { if (hoverIndex >= 0) setHover(-1); return; }
      scene.updateMatrixWorld(true);
      var rect = canvas.getBoundingClientRect();
      var best = -1, bestDist = Infinity;
      for (var i = 0; i < mainStars.length; i++) {
        tmpVec.copy(mainStars[i].pos).applyMatrix4(starPoints.matrixWorld).project(camera);
        if (tmpVec.z < -1 || tmpVec.z > 1) continue;
        var sx = rect.left + (tmpVec.x * 0.5 + 0.5) * rect.width;
        var sy = rect.top + (-tmpVec.y * 0.5 + 0.5) * rect.height;
        var dx = mouseX - sx, dy = mouseY - sy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var threshold = Math.max(15, mainStars[i].size);
        if (dist < threshold && dist < bestDist) { bestDist = dist; best = i; }
      }
      setHover(best);
    }

    function focusAlbum(id) {
      var idx = -1;
      for (var i = 0; i < mainStars.length; i++) {
        if (String(mainStars[i].album.id) === String(id)) { idx = i; break; }
      }
      if (idx < 0) return;
      focusIndex = idx;
      if (starMat) starMat.uniforms.uFocusIndex.value = idx;
      var s = mainStars[idx];
      spinTarget = -Math.atan2(s.pos.y, s.pos.x) - 0.6; // 将该星转到画面一侧
      focusing = true;
      // 聚焦时轻微抬高视角，让目标更清晰
      tiltGroup.rotation.x += ((-0.22) - tiltGroup.rotation.x) * 0.35;
    }

    function bindEvents() {
      bound.down = function (e) {
        if (e.button !== undefined && e.button !== 0) return;
        dragging = true;
        dragX = e.clientX;
        dragY = e.clientY;
        dragMoved = 0;
        if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (_) {} }
      };
      bound.move = function (e) {
        mouseX = e.clientX;
        mouseY = e.clientY;
        mouseActive = true;
        if (dragging) {
          var dx = e.clientX - dragX, dy = e.clientY - dragY;
          dragMoved += Math.abs(dx) + Math.abs(dy);
          tiltGroup.rotation.y += dx * 0.005;
          tiltGroup.rotation.x = clamp(tiltGroup.rotation.x + dy * 0.005, -1.35, 1.35);
          dragX = e.clientX;
          dragY = e.clientY;
        }
        updateHover();
      };
      bound.up = function (e) {
        if (!dragging) return;
        dragging = false;
        if (canvas.releasePointerCapture) { try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} }
        if (dragMoved < 6 && hoverIndex >= 0 && typeof opts.onStarClick === 'function') {
          opts.onStarClick(mainStars[hoverIndex].album);
        }
      };
      bound.leave = function () { mouseActive = false; setHover(-1); };
      bound.wheel = function (e) {
        if (e.preventDefault) e.preventDefault();
        camera.position.z = clamp(camera.position.z + e.deltaY * 0.018, 13, 64);
      };
      bound.resize = resize;

      canvas.addEventListener('pointerdown', bound.down);
      canvas.addEventListener('pointermove', bound.move);
      canvas.addEventListener('pointerup', bound.up);
      canvas.addEventListener('pointercancel', bound.up);
      canvas.addEventListener('pointerleave', bound.leave);
      canvas.addEventListener('wheel', bound.wheel, { passive: false });
      global.addEventListener('resize', bound.resize);
      if (global.ResizeObserver) {
        try { resizeObserver = new global.ResizeObserver(bound.resize); resizeObserver.observe(canvas); } catch (_) {}
      }
    }

    function loop() {
      if (destroyed || !running) return;
      rafId = requestAnimationFrame(loop);
      var now = (global.performance && performance.now) ? performance.now() : Date.now();
      var dt = lastTime ? (now - lastTime) / 1000 : 0.016;
      lastTime = now;
      if (dt > 0.1) dt = 0.1; // 切换标签页回来不跳帧
      elapsed += dt;

      if (focusing) {
        var diff = spinTarget - spin;
        while (diff > Math.PI) diff -= TWO_PI;
        while (diff < -Math.PI) diff += TWO_PI;
        spin += diff * Math.min(1, dt * 2.4);
        if (Math.abs(diff) < 0.008) focusing = false;
      } else {
        spin += dt * 0.035; // 缓慢自转
      }
      if (Math.abs(spin) > 1000) { spin %= TWO_PI; spinTarget %= TWO_PI; }
      spinGroup.rotation.z = spin;

      if (dustMat) dustMat.uniforms.uTime.value = elapsed;
      if (fieldMat) fieldMat.uniforms.uTime.value = elapsed;
      if (starMat) starMat.uniforms.uTime.value = elapsed;

      updateHover();
      renderer.render(scene, camera);
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (pollTimer) clearTimeout(pollTimer);
      rafId = 0;
      pollTimer = null;

      if (global.removeEventListener) global.removeEventListener('resize', bound.resize);
      try {
        canvas.removeEventListener('pointerdown', bound.down);
        canvas.removeEventListener('pointermove', bound.move);
        canvas.removeEventListener('pointerup', bound.up);
        canvas.removeEventListener('pointercancel', bound.up);
        canvas.removeEventListener('pointerleave', bound.leave);
        canvas.removeEventListener('wheel', bound.wheel);
      } catch (_) {}
      if (resizeObserver) { try { resizeObserver.disconnect(); } catch (_) {} resizeObserver = null; }
      canvas.style.cursor = '';
      if (!ready || !T) { registry.delete(canvas); return; }

      if (dustGeo) dustGeo.dispose();
      if (dustMat) dustMat.dispose();
      if (fieldGeo) fieldGeo.dispose();
      if (fieldMat) fieldMat.dispose();
      if (starGeo) starGeo.dispose();
      if (starMat) starMat.dispose();
      if (glowTex) glowTex.dispose();
      if (halo && halo.material) halo.material.dispose();
      if (coreSprite && coreSprite.material) coreSprite.material.dispose();
      if (renderer) renderer.dispose();
      registry.delete(canvas);
    }
  }

  global.StellarGalaxy = { mount: mount };
})(window);
