/* 烟花工坊 —— 点击夜空放烟花：5 种花型 × 5 套配色，含火箭拖尾与重力物理
 * 玩法：点/拖夜空任意处发射 · 换花型与配色 · 一键齐放 · 闲置时自动放
 */
(function () {
  var BOX_ID = 'fireworks-3d';
  var NS = '__mfyFireworks';
  var box = document.getElementById(BOX_ID);
  if (!box) return;
  if (window[NS]) { try { window[NS](); } catch (e) {} }
  window[NS] = null;

  var THREE, renderer, scene, camera, glowTex, starPts;
  var sparks = null, trails = null;
  var rockets = [];
  var raf = 0, disposed = false, listeners = [];
  var pat = 'sphere', pal = 'rainbow';
  var idle = 0, lastT = 0, launched = 0;
  var plane = null, ray = null, ndc = null;

  var PALETTE = {
    rainbow: null,                 // 随机色相
    gold: [0.09, 0.13],
    cyan: [0.48, 0.56],
    pink: [0.88, 0.96],
    purple: [0.70, 0.80]
  };

  function fail(msg) {
    var d = document.createElement('div');
    d.className = 'fw-fallback';
    d.textContent = msg;
    box.appendChild(d);
  }

  function makeGlow() {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  // ---------- 粒子池 ----------
  function Pool(n, size, name) {
    var p = {
      n: n, cur: 0,
      pos: new Float32Array(n * 3), vel: new Float32Array(n * 3),
      col: new Float32Array(n * 3), bcol: new Float32Array(n * 3),
      life: new Float32Array(n), max: new Float32Array(n),
      drag: new Float32Array(n), grav: new Float32Array(n),
      geo: null, mat: null, obj: null, size: size, name: name
    };
    p.geo = new THREE.BufferGeometry();
    p.geo.setAttribute('position', new THREE.BufferAttribute(p.pos, 3));
    p.geo.setAttribute('color', new THREE.BufferAttribute(p.col, 3));
    p.mat = new THREE.PointsMaterial({
      size: size, map: glowTex, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    p.obj = new THREE.Points(p.geo, p.mat);
    p.obj.frustumCulled = false;
    scene.add(p.obj);
    return p;
  }

  function alloc(p) {
    for (var k = 0; k < p.n; k++) {
      var i = (p.cur + k) % p.n;
      if (p.life[i] <= 0) { p.cur = (i + 1) % p.n; return i; }
    }
    return -1;
  }

  function spawn(p, x, y, z, vx, vy, vz, r, g, b, life, drag, grav) {
    var i = alloc(p);
    if (i < 0) return;
    var i3 = i * 3;
    p.pos[i3] = x; p.pos[i3 + 1] = y; p.pos[i3 + 2] = z;
    p.vel[i3] = vx; p.vel[i3 + 1] = vy; p.vel[i3 + 2] = vz;
    p.bcol[i3] = r; p.bcol[i3 + 1] = g; p.bcol[i3 + 2] = b;
    p.col[i3] = r; p.col[i3 + 1] = g; p.col[i3 + 2] = b;
    p.life[i] = life; p.max[i] = life;
    p.drag[i] = drag; p.grav[i] = grav;
  }

  function updatePool(p, dt) {
    var dirty = false;
    for (var i = 0; i < p.n; i++) {
      if (p.life[i] <= 0) continue;
      var i3 = i * 3;
      p.life[i] -= dt;
      if (p.life[i] <= 0) { p.col[i3] = p.col[i3 + 1] = p.col[i3 + 2] = 0; dirty = true; continue; }
      p.vel[i3 + 1] -= p.grav[i] * dt;
      var f = 1 - p.drag[i] * dt; if (f < 0) f = 0;
      p.vel[i3] *= f; p.vel[i3 + 1] *= f; p.vel[i3 + 2] *= f;
      p.pos[i3] += p.vel[i3] * dt;
      p.pos[i3 + 1] += p.vel[i3 + 1] * dt;
      p.pos[i3 + 2] += p.vel[i3 + 2] * dt;
      var k = p.life[i] / p.max[i]; k = k * k;
      p.col[i3] = p.bcol[i3] * k;
      p.col[i3 + 1] = p.bcol[i3 + 1] * k;
      p.col[i3 + 2] = p.bcol[i3 + 2] * k;
      dirty = true;
    }
    if (dirty) {
      p.geo.attributes.position.needsUpdate = true;
      p.geo.attributes.color.needsUpdate = true;
    }
  }

  function clearPool(p) {
    for (var i = 0; i < p.n; i++) {
      p.life[i] = 0;
      p.col[i * 3] = p.col[i * 3 + 1] = p.col[i * 3 + 2] = 0;
    }
    p.geo.attributes.color.needsUpdate = true;
  }

  // ---------- 颜色 ----------
  var tmpC = null;
  function color(rng) {
    var range = PALETTE[pal];
    var h = range ? (range[0] + Math.random() * (range[1] - range[0])) : Math.random();
    tmpC.setHSL(h % 1, 0.85, 0.62);
    return tmpC;
  }

  // ---------- 爆炸 ----------
  function explode(x, y, z, pattern) {
    var count, i, dir, sp, c, life, drag, grav;
    var V = THREE.Vector3;

    if (pattern === 'sphere' || pattern === 'double') {
      count = pattern === 'double' ? 460 : 420;
      for (i = 0; i < count; i++) {
        var b = Math.acos(2 * Math.random() - 1), a = Math.random() * Math.PI * 2;
        dir = new V(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a));
        var inner = pattern === 'double' && i % 2 === 0;
        sp = (inner ? 4 + Math.random() * 3 : 8 + Math.random() * 5);
        c = color();
        life = 1.4 + Math.random() * 0.9;
        spawn(sparks, x, y, z, dir.x * sp, dir.y * sp, dir.z * sp, c.r, c.g, c.b, life, 1.05, 5.5);
      }
    } else if (pattern === 'ring') {
      count = 320;
      var axis = new V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      var u = new V(1, 0, 0);
      if (Math.abs(axis.x) > 0.9) u.set(0, 1, 0);
      var u1 = new V().crossVectors(axis, u).normalize();
      var u2 = new V().crossVectors(axis, u1).normalize();
      c = color();
      for (i = 0; i < count; i++) {
        var ang = (i / count) * Math.PI * 2 + Math.random() * 0.05;
        dir = new V().addScaledVector(u1, Math.cos(ang)).addScaledVector(u2, Math.sin(ang)).normalize();
        sp = 9 + Math.random() * 2.5;
        spawn(sparks, x, y, z, dir.x * sp, dir.y * sp, dir.z * sp, c.r, c.g, c.b, 1.6 + Math.random() * 0.6, 1.0, 5.0);
      }
    } else if (pattern === 'willow') {
      count = 300;
      for (i = 0; i < count; i++) {
        var b2 = Math.acos(2 * Math.random() - 1), a2 = Math.random() * Math.PI * 2;
        dir = new V(Math.sin(b2) * Math.cos(a2), Math.abs(Math.cos(b2)) * 0.9 + 0.25, Math.sin(b2) * Math.sin(a2)).normalize();
        sp = 5 + Math.random() * 4;
        c = color();
        spawn(sparks, x, y, z, dir.x * sp, dir.y * sp, dir.z * sp, c.r, c.g, c.b, 2.6 + Math.random() * 1.0, 0.35, 3.2);
      }
    } else if (pattern === 'heart') {
      count = 340;
      c = color();
      for (i = 0; i < count; i++) {
        var t = (i / count) * Math.PI * 2;
        var hx = 16 * Math.pow(Math.sin(t), 3);
        var hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        dir = new V(hx / 17, hy / 17, (Math.random() - 0.5) * 0.12).normalize();
        sp = 7.5 + Math.random() * 3;
        spawn(sparks, x, y, z, dir.x * sp, dir.y * sp, dir.z * sp, c.r, c.g, c.b, 1.9 + Math.random() * 0.7, 0.75, 4.2);
      }
    }
    launched++;
    var lc = document.getElementById('fw-count');
    if (lc) lc.textContent = String(launched);
  }

  // ---------- 火箭 ----------
  function launch(tx, ty, delay) {
    rockets.push({
      from: new THREE.Vector3(tx * 0.12, -26, 0),
      to: new THREE.Vector3(tx, ty, 0),
      t: -(delay || 0), dur: 1.05, pat: pat, pal: pal, emit: 0
    });
  }

  function updateRockets(dt) {
    for (var i = rockets.length - 1; i >= 0; i--) {
      var r = rockets[i];
      r.t += dt;
      if (r.t < 0) continue;
      var k = Math.min(1, r.t / r.dur);
      var e = 1 - Math.pow(1 - k, 1.8);
      var x = r.from.x + (r.to.x - r.from.x) * e;
      var y = r.from.y + (r.to.y - r.from.y) * e;
      r.emit += dt;
      if (r.emit > 0.012) {
        r.emit = 0;
        var c = color();
        spawn(trails, x + (Math.random() - 0.5) * 0.4, y, 0,
          (Math.random() - 0.5) * 1.2, -1.5 - Math.random(), (Math.random() - 0.5) * 1.2,
          c.r, c.g, c.b, 0.55 + Math.random() * 0.3, 1.6, 1.2);
      }
      if (k >= 1) {
        explode(r.to.x, r.to.y, 0, r.pat);
        rockets.splice(i, 1);
      }
    }
  }

  // ---------- 交互 ----------
  function toWorld(clientX, clientY) {
    var rect = box.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    var out = new THREE.Vector3();
    ray.ray.intersectPlane(plane, out);
    return out;
  }

  function bindInput() {
    function fire(e) {
      idle = 0;
      var p = toWorld(e.clientX, e.clientY);
      launch(p.x, Math.max(-6, p.y), 0);
    }
    box.addEventListener('pointerdown', fire);
    listeners.push([box, 'pointerdown', fire]);

    var pats = document.querySelectorAll('[data-pat]');
    Array.prototype.forEach.call(pats, function (c) {
      c.addEventListener('click', function () {
        Array.prototype.forEach.call(pats, function (x) { x.classList.remove('on'); });
        c.classList.add('on');
        pat = c.getAttribute('data-pat');
      });
    });
    var pals = document.querySelectorAll('[data-pal]');
    Array.prototype.forEach.call(pals, function (c) {
      c.addEventListener('click', function () {
        Array.prototype.forEach.call(pals, function (x) { x.classList.remove('on'); });
        c.classList.add('on');
        pal = c.getAttribute('data-pal');
      });
    });

    var salvo = document.getElementById('fw-salvo');
    if (salvo) salvo.addEventListener('click', function () {
      idle = 0;
      for (var i = 0; i < 6; i++) {
        launch((Math.random() - 0.5) * 46, 4 + Math.random() * 16, i * 0.16);
      }
    });
    var clear = document.getElementById('fw-clear');
    if (clear) clear.addEventListener('click', function () {
      clearPool(sparks); clearPool(trails);
      rockets.length = 0;
      launched = 0;
      var lc = document.getElementById('fw-count');
      if (lc) lc.textContent = '0';
    });
  }

  var onResize = function () {
    if (!renderer) return;
    var w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };

  function loop(t) {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t;

    idle += dt;
    if (idle > 7 && Math.random() < dt * 0.75) {
      launch((Math.random() - 0.5) * 44, 2 + Math.random() * 18, 0);
      idle = 6.2;
    }

    updateRockets(dt);
    updatePool(sparks, dt);
    updatePool(trails, dt);
    if (starPts) starPts.material.opacity = 0.55 + Math.sin(t / 700) * 0.15;

    renderer.render(scene, camera);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); });
    window.removeEventListener('resize', onResize);
    [sparks, trails].forEach(function (p) {
      if (!p) return;
      scene.remove(p.obj); p.geo.dispose(); p.mat.dispose();
    });
    if (glowTex) glowTex.dispose();
    if (renderer) renderer.dispose();
    while (box.firstChild) box.removeChild(box.firstChild);
    window[NS] = null;
  }
  window[NS] = dispose;
  window.addEventListener('pagehide', dispose, { once: true });

  (async function () {
    try { THREE = await import('/js/lib/three.module.min.js'); }
    catch (e) { fail('3D 引擎加载失败，请刷新页面重试。'); return; }
    try {
      tmpC = new THREE.Color();
      plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      ray = new THREE.Raycaster();
      ndc = new THREE.Vector2();

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x05070f);
      camera = new THREE.PerspectiveCamera(55, box.clientWidth / Math.max(1, box.clientHeight), 0.1, 400);
      camera.position.set(0, 0, 62);
      camera.lookAt(0, 0, 0);

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(box.clientWidth, box.clientHeight);
      if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
      box.appendChild(renderer.domElement);

      glowTex = makeGlow();

      // 星空
      var sn = 700, sp = new Float32Array(sn * 3);
      for (var i = 0; i < sn; i++) {
        sp[i * 3] = (Math.random() - 0.5) * 200;
        sp[i * 3 + 1] = (Math.random() - 0.5) * 120;
        sp[i * 3 + 2] = -60 - Math.random() * 60;
      }
      var sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      var sm = new THREE.PointsMaterial({ size: 0.75, color: 0xbfd4ff, transparent: true, opacity: 0.6, depthWrite: false });
      starPts = new THREE.Points(sg, sm);
      scene.add(starPts);

      // 城市剪影
      var cityMat = new THREE.MeshBasicMaterial({ color: 0x0a0f1c });
      for (var b = 0; b < 18; b++) {
        var w = 3 + Math.random() * 5;
        var h = 6 + Math.random() * 18;
        var g2 = new THREE.BoxGeometry(w, h, 4);
        var m2 = new THREE.Mesh(g2, cityMat);
        m2.position.set(-52 + b * 6 + Math.random() * 2, -26 + h / 2, -12);
        scene.add(m2);
      }

      sparks = Pool(6000, 0.85, 'sparks');
      trails = Pool(2600, 0.45, 'trails');

      bindInput();
      window.addEventListener('resize', onResize);
      onResize();
      // 开场来一发
      launch(0, 12, 0.3);
      launch(-14, 6, 0.9);
      launch(15, 9, 1.5);
      raf = requestAnimationFrame(loop);
    } catch (e) {
      fail('你的浏览器不支持 WebGL，无法显示 3D 效果。');
    }
  })();
})();
