/*
 * StellarEarth - 星辰相册「记忆地球视图」（P2 视图，普通 script + IIFE）
 *
 * 依赖：window.THREE（由 HTML 中 <script type="module"> 导入自托管 three.module.js 后注入）
 *      window.STELLAR_DATA.albums（stellar-data.js 生成的 19 个相册数据）
 * 导出：window.StellarEarth = { mount(canvas, opts) -> controller }
 *   opts:       { onStarClick(album), onHover(album|null) }
 *   controller: { render(), resize(), pause(), resume(), destroy(), setTheme(isDark) }
 *
 * ============ 合规红线（本文件严格遵守） ============
 * 1. 纯 Three.js 程序化球体：不加载任何地图瓦片服务（Google / Apple / Bing / OSM /
 *    Mapbox / 高德 / 百度 / 腾讯地图瓦片等一律不接）。
 * 2. 不加载任何国界 / 省界 GeoJSON（Natural Earth / DataV / earth-boundaries.geojson /
 *    china-provinces.geojson 等），不绘制任何行政区划边界、台湾单独国界标注或南海断续线。
 * 3. 陆地仅由 fbm 噪声生成模糊色块，纯氛围用途，不构成可识别的地图。
 * 4. 相册数据没有真实 GPS 坐标：19 个光点按 album.id 确定性地用黄金角螺旋撒在球面上。
 *    「光点为示意位置，非真实地理坐标」——此说明同时写入代码注释和 UI 提示文字。
 * 5. 不加载任何贴图文件（辉光贴图由 canvas 程序生成）、不读写后端；
 *    光源方向固定，海洋/陆地/昼夜全部由 ShaderMaterial 实时计算。
 * 6. 经纬网格仅为装饰性坐标参考线，不是行政边界，且刻意做得很淡。
 * ====================================================
 */
(function (global) {
  'use strict';

  // 同一 canvas 重复 mount 时先销毁旧实例（WeakMap 避免内存泄漏）
  var registry = new WeakMap();

  var TWO_PI = Math.PI * 2;
  var GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // 黄金角 ≈ 2.39996 rad
  var RADIUS = 8;                                  // 地球半径（世界单位）

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // 由 album.id 派生的确定性伪随机（保证同一相册每次撒点位置一致）
  function hash01(n) {
    var s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }

  // 可复现的随机源（仅用于背景星野；相册位置改用黄金角螺旋，见 buildAlbumSprites）
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // 程序生成径向辉光贴图（不读任何外部图片文件）
  function glowTexture(T) {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0.00, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.92)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.26)');
    g.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    var t = new T.CanvasTexture(c);
    if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    return t;
  }

  /* ---------------- 地球表面 shader：程序化海洋/陆地 + 固定光源昼夜 + 边缘散射 ---------------- */
  var EARTH_VERT = [
    'precision highp float;',
    'varying vec3 vLocalPos;',
    'varying vec3 vWorldNormal;',
    'varying vec3 vWorldPos;',
    'void main() {',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vLocalPos = position;',
    '  vWorldPos = wp.xyz;',
    '  vWorldNormal = normalize(mat3(modelMatrix) * normal);',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var EARTH_FRAG = [
    'precision highp float;',
    'uniform vec3 uSun;',
    'varying vec3 vLocalPos;',
    'varying vec3 vWorldNormal;',
    'varying vec3 vWorldPos;',
    // 3D 值噪声（Dave Hoskins hash），完全程序化，不采样任何贴图
    'float hash31(vec3 p) {',
    '  p = fract(p * 0.1031);',
    '  p += dot(p, p.yzx + 33.33);',
    '  return fract((p.x + p.y) * p.z);',
    '}',
    'float noise3(vec3 p) {',
    '  vec3 i = floor(p);',
    '  vec3 f = fract(p);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  float a = mix(mix(hash31(i + vec3(0.0, 0.0, 0.0)), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),',
    '                mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);',
    '  float b = mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),',
    '                mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);',
    '  return mix(a, b, f.z);',
    '}',
    'float fbm(vec3 p) {',
    '  float v = 0.0;',
    '  float a = 0.5;',
    '  for (int k = 0; k < 4; k++) {',
    '    v += a * noise3(p);',
    '    p = p * 2.03 + vec3(11.7, 5.3, 7.1);',
    '    a *= 0.5;',
    '  }',
    '  return v * 1.0667;',
    '}',
    'void main() {',
    '  vec3 sp = normalize(vLocalPos);',
    '  float c = fbm(sp * 2.15 + vec3(2.3, 8.1, 1.7));',
    '  float d = noise3(sp * 7.3 + vec3(4.2, 1.1, 9.3));',
    '  float field = c * 0.86 + d * 0.14;',
    // 宽 smoothstep -> 模糊大陆色块（刻意不作为可识别地图）
    '  float land = smoothstep(0.44, 0.62, field);',
    '  vec3 deepOcean = vec3(0.018, 0.048, 0.110);',
    '  vec3 shallow   = vec3(0.045, 0.150, 0.260);',
    '  vec3 landLow   = vec3(0.090, 0.225, 0.225);',
    '  vec3 landHigh  = vec3(0.205, 0.315, 0.260);',
    '  vec3 ocean = mix(deepOcean, shallow, smoothstep(0.30, 0.72, c) * 0.65 + 0.12);',
    '  vec3 landCol = mix(landLow, landHigh, smoothstep(0.42, 0.78, d));',
    '  vec3 base = mix(ocean, landCol, land * 0.88);',
    '  float ice = smoothstep(0.80, 0.96, abs(sp.y) + (d - 0.5) * 0.08);',
    '  base = mix(base, vec3(0.62, 0.74, 0.86), ice * 0.72);',
    // 固定光源：法线取世界坐标，地球自转时光照分界线保持在空间中不动
    '  vec3 N = normalize(vWorldNormal);',
    '  vec3 L = normalize(uSun);',
    '  vec3 V = normalize(cameraPosition - vWorldPos);',
    '  float ndl = dot(N, L);',
    '  float day = smoothstep(-0.20, 0.28, ndl);',
    '  float night = 1.0 - smoothstep(-0.30, 0.06, ndl);',
    '  float lambert = 0.10 + 0.90 * max(ndl, 0.0);',
    '  vec3 color = base * (0.14 + 0.86 * day * lambert);',
    '  color += vec3(0.020, 0.048, 0.110) * night;',
    '  vec3 H = normalize(L + V);',
    '  float spec = pow(max(dot(N, H), 0.0), 42.0) * (1.0 - land) * day;',
    '  color += vec3(0.45, 0.62, 0.85) * spec * 0.50;',
    '  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);',
    '  color += vec3(0.10, 0.26, 0.48) * rim * (0.25 + 0.75 * day);',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');

  /* ---------------- 大气 Fresnel 光晕：BackSide 壳，只在边缘发亮 ---------------- */
  var ATMO_VERT = [
    'precision highp float;',
    'varying vec3 vNormal;',
    'varying vec3 vView;',
    'void main() {',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  vNormal = normalize(normalMatrix * normal);',
    '  vView = normalize(-mv.xyz);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var ATMO_FRAG = [
    'precision highp float;',
    'uniform vec3 uColor;',
    'uniform float uOpacity;',
    'varying vec3 vNormal;',
    'varying vec3 vView;',
    'void main() {',
    '  float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.0);',
    '  gl_FragColor = vec4(uColor * rim * 1.25, rim * 0.78 * uOpacity);',
    '}'
  ].join('\n');

  /* ---------------- 背景稀疏星野 ---------------- */
  var FIELD_VERT = [
    'precision highp float;',
    'attribute float aPhase;',
    'attribute float aSize;',
    'attribute vec3 aColor;',
    'uniform float uTime;',
    'uniform float uPixelRatio;',
    'uniform float uOpacity;',
    'varying float vA;',
    'varying vec3 vColor;',
    'void main() {',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  float tw = 0.62 + 0.38 * sin(uTime * 1.1 + aPhase);',
    '  gl_PointSize = clamp(aSize * uPixelRatio * tw, 0.8, 6.0);',
    '  vA = tw * uOpacity;',
    '  vColor = aColor;',
    '}'
  ].join('\n');

  var FIELD_FRAG = [
    'precision highp float;',
    'varying float vA;',
    'varying vec3 vColor;',
    'void main() {',
    '  vec2 p = gl_PointCoord - 0.5;',
    '  float d = length(p);',
    '  if (d > 0.5) discard;',
    '  float a = pow(1.0 - smoothstep(0.0, 0.5, d), 1.8) * vA;',
    '  gl_FragColor = vec4(vColor, a);',
    '}'
  ].join('\n');

  function noopController() {
    return {
      render: function () {}, resize: function () {}, pause: function () {},
      resume: function () {}, destroy: function () {}, setTheme: function () {}
    };
  }

  function mount(canvas, opts) {
    opts = opts || {};
    if (!canvas || typeof canvas.getContext !== 'function') return noopController();

    var old = registry.get(canvas);
    if (old) { old.destroy(); registry.delete(canvas); }

    var destroyed = false, ready = false, running = false;
    var pollTimer = null, rafId = 0, resizeObserver = null;
    var T = null, renderer, scene, camera, globeGroup;
    var earthGeo, earthMat, earthMesh, atmoGeo, atmoMat;
    var gridGeo, gridMat, fieldGeo, fieldMat, fieldPoints;
    var glowTex = null, entries = [], hoverIndex = -1;
    var elapsed = 0, lastTime = 0, currentDark = true;
    var mouseX = -1e5, mouseY = -1e5, mouseActive = false;
    var dragging = false, dragX = 0, dragY = 0, dragMoved = 0;
    var tmpVec, tmpWorld, tmpDir, center, camDir;
    var host = null, hostPrevPos = '', hostPosChanged = false;
    var hintEl = null, tipEl = null, tipName = null, tipSub = null;
    var bound = {};

    var controller = {
      render: function () {
        if (!ready || destroyed) return;
        updateHover();
        renderer.render(scene, camera);
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
      setTheme: function (isDark) {
        currentDark = !!isDark;
        // 记忆地球始终保持深色星空；setTheme 只微调光晕强度，不替换背景。
        if (!ready || destroyed) return;
        var k = currentDark ? 1.0 : 0.82;
        if (atmoMat) atmoMat.uniforms.uOpacity.value = k;
        if (fieldMat) fieldMat.uniforms.uOpacity.value = 0.95 * k;
        if (hintEl) hintEl.style.opacity = currentDark ? '1' : '0.88';
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
            console.warn('[StellarEarth] 等待 window.THREE / window.STELLAR_DATA 超时（5s），记忆地球视图未初始化');
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
      tmpWorld = new T.Vector3();
      tmpDir = new T.Vector3();
      center = new T.Vector3(0, 0, 0);
      camDir = new T.Vector3();

      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setClearColor(0x05070d, 1); // 固定深空背景，不随明暗主题改变

      scene = new T.Scene();
      camera = new T.PerspectiveCamera(45, 1, 0.1, 400);
      camera.position.set(0, 0, 24);
      camera.lookAt(0, 0, 0);

      globeGroup = new T.Group(); // 承载地球 / 大气 / 网格 / 光点，统一自转与拖拽
      scene.add(globeGroup);

      var w = canvas.clientWidth || global.innerWidth || 800;
      var mobile = w > 0 && w < 600;
      renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, mobile ? 1.5 : 2));

      buildEarth(mobile);
      buildAtmosphere();
      buildGraticule();               // 装饰性经纬参考线，不是行政边界
      buildField(mobile ? 900 : 2200); // 移动端减少星野粒子
      buildAlbumSprites(global.STELLAR_DATA.albums);

      buildUI();
      resize();
      bindEvents();
      ready = true;
      controller.setTheme(currentDark);
      controller.render();
      controller.resume();
    }

    // 程序化地球：ShaderMaterial 实时计算海洋/陆地噪声、固定光源昼夜与边缘散射
    function buildEarth(mobile) {
      earthGeo = new T.SphereGeometry(RADIUS, mobile ? 64 : 96, mobile ? 48 : 64);
      earthMat = new T.ShaderMaterial({
        uniforms: { uSun: { value: new T.Vector3(0.55, 0.32, 0.78).normalize() } },
        vertexShader: EARTH_VERT,
        fragmentShader: EARTH_FRAG
      });
      earthMesh = new T.Mesh(earthGeo, earthMat);
      globeGroup.add(earthMesh);
    }

    function buildAtmosphere() {
      atmoGeo = new T.SphereGeometry(RADIUS * 1.06, 64, 48);
      atmoMat = new T.ShaderMaterial({
        uniforms: {
          uColor: { value: new T.Color('#2c5a8f') },
          uOpacity: { value: 1.0 }
        },
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        transparent: true,
        side: T.BackSide,
        blending: T.AdditiveBlending,
        depthWrite: false
      });
      var atmo = new T.Mesh(atmoGeo, atmoMat);
      atmo.renderOrder = 2;
      globeGroup.add(atmo);
    }

    // 经纬网格：纯装饰参考线，刻意淡化；不加载/绘制任何国界、省界、行政边界数据
    function buildGraticule() {
      var pos = [];
      var r = RADIUS * 1.006;
      function vec(lat, lng) {
        var la = lat * Math.PI / 180, lo = lng * Math.PI / 180;
        return [Math.cos(la) * Math.cos(lo) * r, Math.sin(la) * r, -Math.cos(la) * Math.sin(lo) * r];
      }
      function seg(lat1, lng1, lat2, lng2) {
        var a = vec(lat1, lng1), b = vec(lat2, lng2);
        pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
      var lng, lat;
      for (lng = -180; lng < 180; lng += 30) {
        for (lat = -75; lat < 75; lat += 5) seg(lat, lng, lat + 5, lng);
      }
      for (lat = -60; lat <= 60; lat += 30) {
        for (lng = -180; lng < 180; lng += 5) seg(lat, lng, lat, lng + 5);
      }
      gridGeo = new T.BufferGeometry();
      gridGeo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      gridMat = new T.LineBasicMaterial({
        color: 0x4a6a8a, transparent: true, opacity: 0.10,
        blending: T.AdditiveBlending, depthWrite: false
      });
      var grid = new T.LineSegments(gridGeo, gridMat);
      grid.renderOrder = 1;
      globeGroup.add(grid);
    }

    function buildField(count) {
      var rng = makeRng(20251126);
      var positions = new Float32Array(count * 3);
      var phases = new Float32Array(count);
      var sizes = new Float32Array(count);
      var colors = new Float32Array(count * 3);
      var palette = [
        [0.72, 0.82, 1.00], [1.00, 0.93, 0.82], [0.85, 0.90, 1.00], [0.60, 0.76, 1.00]
      ];
      for (var i = 0; i < count; i++) {
        var y = 1 - 2 * rng();
        var rr = Math.sqrt(Math.max(0, 1 - y * y));
        var th = rng() * TWO_PI;
        var rad = 110 + rng() * 40;
        positions[i * 3] = Math.cos(th) * rr * rad;
        positions[i * 3 + 1] = y * rad;
        positions[i * 3 + 2] = Math.sin(th) * rr * rad;
        phases[i] = rng() * TWO_PI;
        sizes[i] = 0.8 + rng() * 1.7;
        var col = palette[(rng() * palette.length) | 0];
        colors[i * 3] = col[0]; colors[i * 3 + 1] = col[1]; colors[i * 3 + 2] = col[2];
      }
      fieldGeo = new T.BufferGeometry();
      fieldGeo.setAttribute('position', new T.BufferAttribute(positions, 3));
      fieldGeo.setAttribute('aPhase', new T.BufferAttribute(phases, 1));
      fieldGeo.setAttribute('aSize', new T.BufferAttribute(sizes, 1));
      fieldGeo.setAttribute('aColor', new T.BufferAttribute(colors, 3));
      fieldMat = new T.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: renderer.getPixelRatio() },
          uOpacity: { value: 0.95 }
        },
        vertexShader: FIELD_VERT,
        fragmentShader: FIELD_FRAG,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending
      });
      fieldPoints = new T.Points(fieldGeo, fieldMat);
      fieldPoints.renderOrder = -1;
      scene.add(fieldPoints);
    }

    // 19 个相册光点：数据无真实 GPS，按 album.id 确定性黄金角螺旋撒点。
    // 光点为示意位置，非真实地理坐标（UI 中也写明此提示）。
    function buildAlbumSprites(albums) {
      albums = albums || [];
      glowTex = glowTexture(T);
      var n = Math.max(1, albums.length);
      for (var i = 0; i < albums.length; i++) {
        var album = albums[i];
        var seed = hash01(Number(album.id) || i + 1);
        // 黄金角螺旋：y 均匀分布在 [-1,1]，绕行角按黄金角递增
        var y = 1 - (i / Math.max(1, albums.length - 1)) * 2;
        y = clamp(y + (seed - 0.5) * 0.04, -1, 1);
        var ring = Math.sqrt(Math.max(0, 1 - y * y));
        var theta = GOLDEN_ANGLE * i + seed * 0.35;
        var rad = RADIUS * 1.035;
        var pos = new T.Vector3(Math.cos(theta) * ring * rad, y * rad, Math.sin(theta) * ring * rad);

        var isWarm = (i % 2 === 0);
        var mat = new T.SpriteMaterial({
          map: glowTex,
          color: new T.Color(isWarm ? '#ffb45c' : '#6fd8ff'),
          transparent: true,
          opacity: 0.82,
          blending: T.AdditiveBlending,
          depthWrite: false,
          depthTest: true
        });
        var sprite = new T.Sprite(mat);
        var baseScale = 1.25;
        sprite.scale.setScalar(baseScale);
        sprite.position.copy(pos);
        sprite.renderOrder = 4;
        globeGroup.add(sprite);
        entries.push({ album: album, sprite: sprite, mat: mat, pos: pos, baseScale: baseScale, seed: seed, warm: isWarm });
      }
      void n;
    }

    function buildUI() {
      if (typeof document === 'undefined') return;
      host = canvas.parentNode || document.body;
      if (!host) return;
      if (typeof getComputedStyle === 'function' && getComputedStyle(host).position === 'static') {
        hostPrevPos = host.style.position;
        host.style.position = 'relative';
        hostPosChanged = true;
      }

      // 常驻提示：明确声明「光点为示意位置，非真实地理坐标」
      hintEl = document.createElement('div');
      hintEl.textContent = '星辰相册 · 记忆地球  |  光点为示意位置，非真实地理坐标 · 拖拽旋转 / 滚轮缩放 / 点击光点查看相册';
      var hs = hintEl.style;
      hs.position = 'absolute'; hs.left = '12px'; hs.bottom = '10px'; hs.zIndex = '5';
      hs.color = 'rgba(190,215,255,0.74)'; hs.font = '12px/1.5 sans-serif';
      hs.textShadow = '0 1px 4px rgba(0,0,0,0.9)'; hs.pointerEvents = 'none';
      hs.maxWidth = 'calc(100% - 24px)';
      host.appendChild(hintEl);

      // 悬停气泡
      tipEl = document.createElement('div');
      tipEl.style.cssText = 'position:absolute;display:none;z-index:6;pointer-events:none;' +
        'padding:8px 11px;border-radius:8px;min-width:150px;max-width:220px;' +
        'background:rgba(8,14,28,0.92);border:1px solid rgba(120,170,230,0.28);' +
        'box-shadow:0 6px 22px rgba(0,0,0,0.55);backdrop-filter:blur(4px);';
      tipName = document.createElement('div');
      tipName.style.cssText = 'font:600 13px/1.4 sans-serif;color:#e8f2ff;';
      tipSub = document.createElement('div');
      tipSub.style.cssText = 'margin-top:4px;font:11px/1.4 sans-serif;color:#9fb8d8;';
      tipSub.textContent = '示意位置 · 非真实地理坐标';
      tipEl.appendChild(tipName);
      tipEl.appendChild(tipSub);
      host.appendChild(tipEl);
    }

    function positionTip(e) {
      if (!tipEl || !host) return;
      var hr = host.getBoundingClientRect();
      var x = e.clientX - hr.left + 16;
      var y = e.clientY - hr.top + 16;
      var maxX = hr.width - 200, maxY = hr.height - 70;
      if (x > maxX) x = Math.max(4, maxX);
      if (y > maxY) y = Math.max(4, maxY);
      tipEl.style.left = x + 'px';
      tipEl.style.top = y + 'px';
    }

    function setHover(idx) {
      if (idx === hoverIndex) return;
      hoverIndex = idx;
      canvas.style.cursor = idx >= 0 ? 'pointer' : '';
      if (tipEl) {
        if (idx >= 0 && entries[idx]) {
          tipName.textContent = entries[idx].album.name || '';
          tipName.style.color = entries[idx].warm ? '#ffd6a0' : '#a8e6ff';
          tipEl.style.display = 'block';
        } else {
          tipEl.style.display = 'none';
        }
      }
      if (typeof opts.onHover === 'function') {
        opts.onHover(idx >= 0 && entries[idx] ? entries[idx].album : null);
      }
    }

    // 屏幕投影距离判定（不用 raycaster）：把光点世界坐标投影成像素，取最近者。
    // 同时用半球朝向剔除被地球遮挡的背面光点。
    function updateHover() {
      if (!ready || destroyed || !mouseActive) { if (hoverIndex >= 0) setHover(-1); return; }
      scene.updateMatrixWorld(true);
      camDir.copy(camera.position).sub(center).normalize();
      var rect = canvas.getBoundingClientRect();
      var best = -1, bestDist = Infinity;
      for (var i = 0; i < entries.length; i++) {
        tmpWorld.copy(entries[i].pos).applyMatrix4(globeGroup.matrixWorld);
        tmpDir.copy(tmpWorld).sub(center);
        if (tmpDir.dot(camDir) < -0.02) continue; // 背面光点被地球遮挡
        tmpVec.copy(tmpWorld).project(camera);
        if (tmpVec.z < -1 || tmpVec.z > 1) continue;
        var sx = rect.left + (tmpVec.x * 0.5 + 0.5) * rect.width;
        var sy = rect.top + (-tmpVec.y * 0.5 + 0.5) * rect.height;
        var dx = mouseX - sx, dy = mouseY - sy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var threshold = 18;
        if (dist < threshold && dist < bestDist) { bestDist = dist; best = i; }
      }
      setHover(best);
    }

    function resize() {
      if (!ready || destroyed) return;
      var w = canvas.clientWidth || canvas.width || global.innerWidth || 800;
      var h = canvas.clientHeight || canvas.height || global.innerHeight || 600;
      if (w < 1) w = 800;
      if (h < 1) h = 600;
      renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, w < 600 ? 1.5 : 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (fieldMat) fieldMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
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
          globeGroup.rotation.y += dx * 0.005;
          globeGroup.rotation.x = clamp(globeGroup.rotation.x + dy * 0.005, -1.2, 1.2);
          dragX = e.clientX;
          dragY = e.clientY;
        }
        positionTip(e);
        updateHover();
      };
      bound.up = function (e) {
        if (!dragging) return;
        dragging = false;
        if (canvas.releasePointerCapture) { try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} }
        if (dragMoved < 6 && hoverIndex >= 0 && entries[hoverIndex] && typeof opts.onStarClick === 'function') {
          opts.onStarClick(entries[hoverIndex].album);
        }
      };
      bound.leave = function () { mouseActive = false; setHover(-1); };
      bound.wheel = function (e) {
        if (e.preventDefault) e.preventDefault();
        camera.position.z = clamp(camera.position.z + e.deltaY * 0.02, 12, 46);
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

      if (!dragging) globeGroup.rotation.y += dt * 0.055; // 缓慢自转

      if (fieldMat) fieldMat.uniforms.uTime.value = elapsed;
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var pulse = 1 + 0.14 * Math.sin(elapsed * 1.9 + e.seed * TWO_PI);
        var boost = (i === hoverIndex) ? 1.55 : 1;
        e.sprite.scale.setScalar(e.baseScale * pulse * boost);
        e.mat.opacity = (i === hoverIndex) ? 1 : 0.82;
      }

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
      if (tipEl && tipEl.parentNode) tipEl.parentNode.removeChild(tipEl);
      if (hintEl && hintEl.parentNode) hintEl.parentNode.removeChild(hintEl);
      if (hostPosChanged && host) host.style.position = hostPrevPos;
      tipEl = hintEl = tipName = tipSub = null;
      host = null;

      if (!ready || !T) { registry.delete(canvas); return; }

      if (earthGeo) earthGeo.dispose();
      if (earthMat) earthMat.dispose();
      if (atmoGeo) atmoGeo.dispose();
      if (atmoMat) atmoMat.dispose();
      if (gridGeo) gridGeo.dispose();
      if (gridMat) gridMat.dispose();
      if (fieldGeo) fieldGeo.dispose();
      if (fieldMat) fieldMat.dispose();
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].mat) entries[i].mat.dispose();
      }
      entries = [];
      if (glowTex) glowTex.dispose();
      if (globeGroup && globeGroup.clear) globeGroup.clear();
      if (scene && scene.clear) scene.clear();
      if (renderer) renderer.dispose();
      registry.delete(canvas);
    }
  }

  global.StellarEarth = { mount: mount };
})(window);
