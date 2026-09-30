/* 粒子文字雕塑 —— 7000 颗粒子 morph 成任意文字（支持中文）
 * 玩法：自动轮换句子 / 输入任意文字回车即变形 / 拖拽旋转 / 滚轮缩放
 */
(function () {
  var BOX_ID = 'text-sculpture-3d';
  var NS = '__mfyTextSculpture';
  var box = document.getElementById(BOX_ID);
  if (!box) return;
  if (window[NS]) { try { window[NS](); } catch (e) {} }
  window[NS] = null;

  var N = 7000;
  var PHRASES = ['保持热爱', '奔赴山海', '慢慢来，比较快', '今天也要开心', '孟凡宇的博客', '所求皆如愿'];

  var THREE, renderer, scene, camera, points, geo, mat, glowTex;
  var pos, col, tpos, tcol;                 // Float32Array(N*3)
  var raf = 0, disposed = false, timer = null;
  var hue = 0.55, pi = 0, auto = true;
  var rotY = 0, rotX = 0, tgtRY = 0, tgtRX = 0, zoom = 1;
  var dragging = false, lastX = 0, lastY = 0;
  var listeners = [];

  function fail(msg) {
    var d = document.createElement('div');
    d.className = 'ts-fallback';
    d.textContent = msg;
    box.appendChild(d);
  }

  function makeGlow() {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  // 采样文字像素 -> 平面坐标点集（返回 [x0,y0,x1,y1,...]）
  function sample(str) {
    var W = 1000, H = 280;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    var fs = 200;
    var font = function (s) { return 'bold ' + s + 'px "Microsoft YaHei","PingFang SC","Heiti SC",sans-serif'; };
    g.font = font(fs);
    var w = g.measureText(str).width;
    if (w > 0) fs = Math.min(260, Math.max(60, fs * (W * 0.86) / w));
    g.font = font(fs);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText(str, W / 2, H / 2);
    var d = g.getImageData(0, 0, W, H).data;
    var out = [];
    for (var step = 3; step <= 16; step++) {
      out.length = 0;
      for (var y = 0; y < H; y += step) {
        for (var x = 0; x < W; x += step) {
          if (d[(y * W + x) * 4 + 3] > 128) out.push(x, y);
        }
      }
      if (out.length / 2 <= N) break;
    }
    // 仍超量则等距抽稀
    var cnt = out.length / 2;
    if (cnt > N) {
      var keep = [];
      var k = cnt / N;
      for (var i = 0; i < N; i++) { var j = Math.floor(i * k); keep.push(out[j * 2], out[j * 2 + 1]); }
      out = keep;
    }
    return { pts: out, W: W, H: H };
  }

  function setText(str) {
    str = (str || '').trim();
    if (!str) str = PHRASES[0];
    var r = sample(str);
    var pts = r.pts, W = r.W, H = r.H;
    var cnt = pts.length / 2;
    if (!cnt) return;
    var s = 48 / W;                       // 世界宽 48
    hue = (hue + 0.17) % 1;
    var c = new THREE.Color();
    for (var i = 0; i < N; i++) {
      var j = i % cnt;
      var px = pts[j * 2], py = pts[j * 2 + 1];
      var dup = i >= cnt;                 // 点不够时复用，加抖动避免完全重叠
      tpos[i * 3] = (px - W / 2) * s + (dup ? (Math.random() - 0.5) * 0.6 : 0);
      tpos[i * 3 + 1] = -(py - H / 2) * s + (dup ? (Math.random() - 0.5) * 0.6 : 0);
      tpos[i * 3 + 2] = (Math.random() - 0.5) * 2.4;
      c.setHSL((hue + (px / W) * 0.20) % 1, 0.72, 0.62);
      tcol[i * 3] = c.r; tcol[i * 3 + 1] = c.g; tcol[i * 3 + 2] = c.b;
    }
    var cap = document.getElementById('ts-caption');
    if (cap) cap.textContent = str;
  }

  function next() {
    pi = (pi + 1) % PHRASES.length;
    setText(PHRASES[pi]);
  }

  function bindUI() {
    var input = document.getElementById('ts-input');
    var go = document.getElementById('ts-go');
    var nb = document.getElementById('ts-next');
    var ab = document.getElementById('ts-auto');
    function submit() {
      if (!input) return;
      var v = input.value.trim();
      if (!v) return;
      setText(v);
      input.value = '';
      restartTimer();
    }
    if (go) go.addEventListener('click', submit);
    if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    if (nb) nb.addEventListener('click', function () { next(); restartTimer(); });
    if (ab) ab.addEventListener('click', function () {
      auto = !auto;
      ab.classList.toggle('on', auto);
      ab.textContent = auto ? '自动轮换：开' : '自动轮换：关';
      if (auto) restartTimer(); else if (timer) { clearInterval(timer); timer = null; }
    });
  }

  function restartTimer() {
    if (timer) clearInterval(timer);
    if (!auto) return;
    timer = setInterval(function () { if (!disposed && auto) next(); }, 5600);
  }

  function bindDrag() {
    function down(e) { dragging = true; lastX = e.clientX; lastY = e.clientY; box.setPointerCapture && box.setPointerCapture(e.pointerId); }
    function move(e) {
      if (!dragging) return;
      tgtRY += (e.clientX - lastX) * 0.006;
      tgtRX += (e.clientY - lastY) * 0.004;
      tgtRX = Math.max(-0.6, Math.min(0.6, tgtRX));
      lastX = e.clientX; lastY = e.clientY;
    }
    function up() { dragging = false; }
    function wheel(e) {
      e.preventDefault();
      zoom *= Math.exp(e.deltaY * 0.0012);
      zoom = Math.max(0.55, Math.min(2.2, zoom));
    }
    box.addEventListener('pointerdown', down);
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
    box.addEventListener('pointerleave', up);
    box.addEventListener('wheel', wheel, { passive: false });
    listeners.push([box, 'pointerdown', down], [box, 'pointermove', move], [box, 'pointerup', up],
      [box, 'pointerleave', up], [box, 'wheel', wheel]);
  }

  function fitCamera() {
    var aspect = box.clientWidth / Math.max(1, box.clientHeight);
    camera.aspect = aspect;
    var vFov = camera.fov * Math.PI / 180;
    var halfW = 27, halfH = 10;
    var dH = halfH / Math.tan(vFov / 2);
    var dW = halfW / (Math.tan(vFov / 2) * aspect);
    camera.position.set(0, 0, Math.max(dH, dW) * 1.15 * zoom);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  var onResize = function () {
    if (!renderer) return;
    var w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    fitCamera();
  };

  var last = 0;
  function loop(t) {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    var dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
    last = t;
    var tt = t / 1000;

    rotY += (tgtRY + (auto ? Math.sin(tt * 0.30) * 0.30 : 0) - rotY) * Math.min(1, dt * 4);
    rotX += (tgtRX - rotX) * Math.min(1, dt * 4);

    var kp = Math.min(1, dt * 3.2), kc = Math.min(1, dt * 2.0);
    for (var i = 0; i < N; i++) {
      var i3 = i * 3;
      pos[i3] += (tpos[i3] - pos[i3]) * kp;
      pos[i3 + 1] += (tpos[i3 + 1] - pos[i3 + 1]) * kp;
      pos[i3 + 2] += (tpos[i3 + 2] - pos[i3 + 2]) * kp;
      col[i3] += (tcol[i3] - col[i3]) * kc;
      col[i3 + 1] += (tcol[i3 + 1] - col[i3 + 1]) * kc;
      col[i3 + 2] += (tcol[i3 + 2] - col[i3 + 2]) * kc;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;

    points.rotation.y = rotY;
    points.rotation.x = rotX;
    fitCamera();
    renderer.render(scene, camera);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    if (timer) clearInterval(timer);
    listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); });
    window.removeEventListener('resize', onResize);
    if (geo) geo.dispose();
    if (mat) mat.dispose();
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
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b1020);
      camera = new THREE.PerspectiveCamera(45, box.clientWidth / Math.max(1, box.clientHeight), 0.1, 500);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(box.clientWidth, box.clientHeight);
      if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
      box.appendChild(renderer.domElement);

      pos = new Float32Array(N * 3);
      col = new Float32Array(N * 3);
      tpos = new Float32Array(N * 3);
      tcol = new Float32Array(N * 3);
      // 初始：随机球面散开
      for (var i = 0; i < N; i++) {
        var r = 26 + Math.random() * 14;
        var a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(b) * Math.cos(a);
        pos[i * 3 + 1] = r * Math.cos(b);
        pos[i * 3 + 2] = r * Math.sin(b) * Math.sin(a);
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0.2;
      }

      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      glowTex = makeGlow();
      mat = new THREE.PointsMaterial({
        size: 0.46, map: glowTex, vertexColors: true, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
      });
      points = new THREE.Points(geo, mat);
      scene.add(points);

      setText(PHRASES[0]);
      bindDrag();
      bindUI();
      restartTimer();
      window.addEventListener('resize', onResize);
      onResize();
      raf = requestAnimationFrame(loop);
    } catch (e) {
      fail('你的浏览器不支持 WebGL，无法显示 3D 效果。');
    }
  })();
})();
