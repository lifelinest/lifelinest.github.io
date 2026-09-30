/* 分形植物园 —— 3D 递归树：可调参数实时重生 / 四季切换 / 风摇曳
 * 自托管 three.js，零外部依赖。脚本以 data-pjax 方式加载，重复进入会先销毁旧实例。
 */
(function () {
  var BOX_ID = 'fractal-plant-3d';
  var NS = '__mfyFractalPlant';
  var box = document.getElementById(BOX_ID);
  if (!box) return;

  // 若上一实例还在（pjax 重复进入），先销毁
  if (window[NS]) { try { window[NS](); } catch (e) {} }
  window[NS] = null;

  var THREE, renderer, scene, camera, group, leafPoints, leafGeo, leafMat, leafTex;
  var raf = 0, disposed = false, started = false;
  var trash = [];              // 需要 dispose 的 geometry / material
  var segs = [], tipList = [];
  var grow = 0;
  var theta = 0.75, phi = 1.12, dist = 36;
  var dragging = false, lastX = 0, lastY = 0, idle = 0;
  var UP = null;

  var SEASON = {
    spring: { leaf: 0xff9ec7, size: 0.72, tip: 0xd8a06a, sky: 0x0d1626 },
    summer: { leaf: 0x8ae08b, size: 0.60, tip: 0xb98a55, sky: 0x0d1a20 },
    autumn: { leaf: 0xffb04a, size: 0.66, tip: 0xa9764a, sky: 0x1a1210 },
    winter: { leaf: 0xe8f2ff, size: 0.52, tip: 0x8d8577, sky: 0x101820 }
  };

  var opt = { angle: 30, scale: 0.76, depth: 7, rnd: 0.40, season: 'summer', autoRotate: true };

  function fail(msg) {
    var d = document.createElement('div');
    d.className = 'fp-fallback';
    d.textContent = msg;
    box.appendChild(d);
  }

  // ---------- 工具 ----------
  function makeLeafTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.75)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    var t = new THREE.CanvasTexture(c);
    trash.push(t);
    return t;
  }

  function clearTree() {
    if (leafPoints) { group.remove(leafPoints); }
    if (leafGeo) { leafGeo.dispose(); }
    if (leafMat) { leafMat.dispose(); }
    leafPoints = leafGeo = leafMat = null;
    for (var i = 0; i < segs.length; i++) {
      var m = segs[i].mesh;
      if (!m) continue;
      group.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
    }
    segs = []; tipList = [];
    trash = trash.filter(function (t) { return t === leafTex; });
  }

  // ---------- 生成树 ----------
  function buildTree() {
    clearTree();
    var maxD = opt.depth;
    var baseLen = 6.4, baseRad = 0.60;
    var twist = 2.399; // 黄金角，保证分叉平面逐层旋转 -> 立体感
    var list = [], tips = [];

    function branch(origin, dir, len, rad, depth) {
      if (depth > maxD || len < 0.14) return;
      list.push({ o: origin.clone(), d: dir.clone(), len: len, r0: rad, r1: rad * 0.72, depth: depth });
      var end = origin.clone().addScaledVector(dir, len);
      if (depth === maxD) { tips.push(end.clone()); return; }

      var up = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      var right = new THREE.Vector3().crossVectors(dir, up).normalize();
      var up2 = new THREE.Vector3().crossVectors(right, dir).normalize();

      for (var i = 0; i < 2; i++) {
        var a = opt.angle * Math.PI / 180 + (Math.random() - 0.5) * opt.rnd * 1.0;
        var az = twist * depth + i * Math.PI + (Math.random() - 0.5) * opt.rnd;
        var nd = dir.clone().multiplyScalar(Math.cos(a))
          .addScaledVector(right, Math.cos(az) * Math.sin(a))
          .addScaledVector(up2, Math.sin(az) * Math.sin(a))
          .normalize();
        branch(end, nd, len * opt.scale, rad * 0.72, depth + 1);
      }
    }
    branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), baseLen, baseRad, 0);

    // 建 mesh
    var trunk = new THREE.Color(0x6b4a2f);
    var tipC = new THREE.Color(SEASON[opt.season].tip);
    list.forEach(function (s) {
      var t = s.depth / Math.max(1, maxD);
      var mat = new THREE.MeshStandardMaterial({
        color: trunk.clone().lerp(tipC, t), roughness: 0.88, metalness: 0.04
      });
      var geo = new THREE.CylinderGeometry(s.r1, s.r0, s.len, 6, 1, false);
      geo.translate(0, s.len / 2, 0);
      var m = new THREE.Mesh(geo, mat);
      m.position.copy(s.o);
      m.quaternion.setFromUnitVectors(UP, s.d);
      m.scale.y = 0.0001;
      group.add(m);
      s.mesh = m;
    });
    segs = list; tipList = tips;

    // 叶 / 花
    var sc = SEASON[opt.season];
    var pos = new Float32Array(tips.length * 3);
    for (var i = 0; i < tips.length; i++) {
      pos[i * 3] = tips[i].x; pos[i * 3 + 1] = tips[i].y; pos[i * 3 + 2] = tips[i].z;
    }
    leafGeo = new THREE.BufferGeometry();
    leafGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    leafMat = new THREE.PointsMaterial({
      color: sc.leaf, size: sc.size, map: leafTex,
      transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true
    });
    leafPoints = new THREE.Points(leafGeo, leafMat);
    group.add(leafPoints);

    grow = 0;
    var cnt = document.getElementById('fp-count');
    if (cnt) cnt.textContent = String(list.length);
  }

  // ---------- 交互 ----------
  function bindOrbit() {
    function down(e) {
      dragging = true; idle = 0;
      lastX = e.clientX; lastY = e.clientY;
      box.setPointerCapture && box.setPointerCapture(e.pointerId);
    }
    function move(e) {
      if (!dragging) return;
      theta -= (e.clientX - lastX) * 0.006;
      phi -= (e.clientY - lastY) * 0.006;
      phi = Math.max(0.18, Math.min(Math.PI - 0.18, phi));
      lastX = e.clientX; lastY = e.clientY; idle = 0;
    }
    function up() { dragging = false; }
    box.addEventListener('pointerdown', down);
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
    box.addEventListener('pointerleave', up);
    function wheel(e) {
      e.preventDefault();
      dist *= Math.exp(e.deltaY * 0.0012);
      dist = Math.max(18, Math.min(90, dist));
      idle = 0;
    }
    box.addEventListener('wheel', wheel, { passive: false });
    listeners.push([box, 'pointerdown', down], [box, 'pointermove', move], [box, 'pointerup', up],
      [box, 'pointerleave', up], [box, 'wheel', wheel]);
  }
  var listeners = [];

  function bindUI() {
    var map = {
      'fp-angle': ['angle', 1], 'fp-scale': ['scale', 0.01],
      'fp-depth': ['depth', 1], 'fp-rnd': ['rnd', 0.01]
    };
    var timer = null;
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var key = map[id][0], mul = map[id][1];
      var out = document.getElementById(id + '-val');
      function sync() {
        opt[key] = parseFloat(el.value) * mul;
        if (out) out.textContent = (key === 'scale' || key === 'rnd')
          ? (opt[key].toFixed(2)) : String(Math.round(opt[key]));
      }
      sync();
      el.addEventListener('input', function () {
        sync();
        clearTimeout(timer);
        timer = setTimeout(buildTree, 150);
      });
      listeners.push([el, 'input', null]);
    });

    var regrow = document.getElementById('fp-regrow');
    if (regrow) regrow.addEventListener('click', buildTree);

    var rndBtn = document.getElementById('fp-random');
    if (rndBtn) rndBtn.addEventListener('click', function () {
      opt.angle = 18 + Math.random() * 34;
      opt.scale = 0.66 + Math.random() * 0.20;
      opt.depth = 5 + Math.floor(Math.random() * 4);
      opt.rnd = Math.random() * 0.8;
      syncSliders();
      buildTree();
    });

    function syncSliders() {
      var set = { 'fp-angle': opt.angle, 'fp-depth': opt.depth, 'fp-scale': opt.scale, 'fp-rnd': opt.rnd };
      Object.keys(set).forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.value = String(set[id]);
        var out = document.getElementById(id + '-val');
        if (out) out.textContent = (id === 'fp-scale' || id === 'fp-rnd')
          ? set[id].toFixed(2) : String(Math.round(set[id]));
      });
    }

    var chips = document.querySelectorAll('[data-season]');
    Array.prototype.forEach.call(chips, function (c) {
      c.addEventListener('click', function () {
        Array.prototype.forEach.call(chips, function (x) { x.classList.remove('on'); });
        c.classList.add('on');
        opt.season = c.getAttribute('data-season');
        var sc = SEASON[opt.season];
        if (leafMat) { leafMat.color.setHex(sc.leaf); leafMat.size = sc.size; }
        scene.background = new THREE.Color(sc.sky);
      });
    });

    var rot = document.getElementById('fp-rotate');
    if (rot) rot.addEventListener('click', function () {
      opt.autoRotate = !opt.autoRotate;
      rot.classList.toggle('on', opt.autoRotate);
      rot.textContent = opt.autoRotate ? '自动旋转：开' : '自动旋转：关';
    });
  }

  // ---------- 主循环 ----------
  function updateCamera() {
    camera.position.set(
      dist * Math.sin(phi) * Math.cos(theta),
      dist * Math.cos(phi) + 4,
      dist * Math.sin(phi) * Math.sin(theta)
    );
    camera.lookAt(0, 11, 0);
  }

  var last = 0;
  function loop(t) {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    var dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
    last = t;

    if (!dragging) idle += dt;
    if (opt.autoRotate && idle > 1.2) theta += dt * 0.16;

    if (grow < 1.9) {
      grow += dt / 2.0;
      var maxD = opt.depth;
      for (var i = 0; i < segs.length; i++) {
        var s = segs[i];
        var start = s.depth / (maxD + 1);
        var span = 1.8 / (maxD + 1);
        var p = Math.min(1, Math.max(0, (grow - start) / span));
        var e = 1 - Math.pow(1 - p, 3);
        s.mesh.scale.y = Math.max(0.0001, e);
      }
      if (leafMat) leafMat.opacity = Math.min(1, Math.max(0, (grow - 0.8) / 0.45));
    }

    var tt = t / 1000;
    group.rotation.z = Math.sin(tt * 0.75) * 0.022;
    group.rotation.x = Math.sin(tt * 0.55 + 1.2) * 0.016;

    updateCamera();
    renderer.render(scene, camera);
  }

  var onResize = function () {
    if (!renderer) return;
    var w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };

  // ---------- 销毁 ----------
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    listeners.forEach(function (l) { if (l[2]) l[0].removeEventListener(l[1], l[2]); });
    window.removeEventListener('resize', onResize);
    clearTree();
    if (leafTex) leafTex.dispose();
    if (renderer) { renderer.dispose(); }
    while (box.firstChild) box.removeChild(box.firstChild);
    window[NS] = null;
  }
  window[NS] = dispose;
  window.addEventListener('pagehide', dispose, { once: true });

  // ---------- 启动 ----------
  (async function () {
    try {
      THREE = await import('/js/lib/three.module.min.js');
    } catch (e) {
      fail('3D 引擎加载失败，请刷新页面重试。');
      return;
    }
    try {
      UP = new THREE.Vector3(0, 1, 0);
      scene = new THREE.Scene();
      scene.background = new THREE.Color(SEASON[opt.season].sky);
      scene.fog = new THREE.Fog(SEASON[opt.season].sky, 34, 78);

      camera = new THREE.PerspectiveCamera(45, box.clientWidth / Math.max(1, box.clientHeight), 0.1, 400);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(box.clientWidth, box.clientHeight);
      if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
      box.appendChild(renderer.domElement);

      // 光
      scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x2a1d14, 0.85));
      var dir = new THREE.DirectionalLight(0xffffff, 1.15);
      dir.position.set(12, 26, 14);
      scene.add(dir);
      var warm = new THREE.PointLight(0xffd9a0, 0.6, 60);
      warm.position.set(-10, 8, -8);
      scene.add(warm);

      // 地面
      var ground = new THREE.Mesh(
        new THREE.CircleGeometry(16, 48),
        new THREE.MeshStandardMaterial({ color: 0x1d2b26, roughness: 1 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.02;
      scene.add(ground);
      trash.push(ground.geometry, ground.material);

      group = new THREE.Group();
      scene.add(group);

      leafTex = makeLeafTexture();
      buildTree();
      bindOrbit();
      bindUI();
      window.addEventListener('resize', onResize);
      onResize();
      started = true;
      raf = requestAnimationFrame(loop);
    } catch (e) {
      fail('你的浏览器不支持 WebGL，无法显示 3D 效果。');
    }
  })();
})();
