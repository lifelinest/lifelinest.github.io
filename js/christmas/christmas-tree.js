// ============================================================
// christmas-tree.js — 侧边栏卡片版螺旋发光粒子圣诞树
// 源自 Mzying022/christmas-tree (MIT) 的 main.js，剥离 store/OrbitControls/照片层，
// 改为自包含、按 canvas 尺寸自适应、可按需动态 import 的独立组件。
// ============================================================
import * as THREE from './three.module.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);

/* ---------- 程序化辉光贴图 ---------- */
function radialTexture(inner = 'rgba(255,255,255,0.95)', mid = 'rgba(180,220,255,0.35)', outer = 'rgba(120,180,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(0.3, mid); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- 树的几何形态 ---------- */
const TREE_H = 9.6, TREE_BOTTOM = -4.8, TREE_R = 4.5;
function coneRadius(t) { return TREE_R * Math.pow(1 - t, 0.86); }
function scatterPoint() {
  const u = Math.random(), v = Math.random();
  const theta = u * Math.PI * 2, phi = Math.acos(2 * v - 1);
  const r = rand(5.5, 12);
  return {
    x: Math.sin(phi) * Math.cos(theta) * r,
    y: Math.cos(phi) * r * 0.7 + rand(-1, 1),
    z: Math.sin(phi) * Math.sin(theta) * r,
  };
}
function spiralTreePoint(i, total) {
  const rnd = Math.random();
  const t = Math.pow(Math.random(), 0.72);
  const baseR = coneRadius(t);
  let angle, r;
  if (rnd < 0.68) {
    const strands = 6, turns = 7.5, strand = i % strands;
    angle = t * turns * Math.PI * 2 + strand * (Math.PI * 2 / strands) + rand(-0.14, 0.14);
    r = baseR * (0.9 + 0.22 * Math.random());
  } else if (rnd < 0.9) {
    const layers = 13, layer = Math.floor(t * layers) / (layers - 1), lt = clamp(layer);
    angle = Math.random() * Math.PI * 2;
    r = coneRadius(lt) * (0.94 + 0.1 * Math.random());
    return { x: Math.cos(angle) * r, y: TREE_BOTTOM + lt * TREE_H + rand(-0.08, 0.08), z: Math.sin(angle) * r, t: lt };
  } else {
    angle = Math.random() * Math.PI * 2;
    r = baseR * Math.sqrt(Math.random());
  }
  return { x: Math.cos(angle) * r, y: TREE_BOTTOM + t * TREE_H + rand(-0.06, 0.06), z: Math.sin(angle) * r, t };
}

/* ---------- 发光粒子 shader ---------- */
const VERT = `
  attribute vec3 aTree;
  attribute vec3 aScatter;
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uSpread;
  uniform float uTime;
  uniform float uDpr;
  uniform float uFade;
  uniform float uPS;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 pos = mix(aTree, aScatter, uSpread);
    float w = uSpread * 0.5;
    pos.x += sin(uTime * 0.7 + aPhase) * w;
    pos.y += cos(uTime * 0.55 + aPhase) * w;
    pos.z += sin(uTime * 0.65 + aPhase * 1.4) * w;
    vColor = aColor;
    vAlpha = (0.55 + 0.45 * sin(uTime * 2.2 + aPhase * 2.0)) * uFade;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = aSize * uDpr * uPS * (72.0 / max(-mv.z, 0.1)) * (1.0 - 0.25 * uSpread);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = `
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float core = smoothstep(0.17, 0.0, d);
    float halo = pow(smoothstep(0.5, 0.0, d), 1.35);
    float glow = core * 0.85 + halo * 0.6;
    vec3 lit = mix(vColor, vec3(1.0), core * 0.35);
    gl_FragColor = vec4(lit, glow * clamp(vAlpha, 0.0, 1.0));
  }
`;
function treeColor(t) {
  const deep = new THREE.Color(0x3d8fd6), cold = new THREE.Color(0x8fd8ff);
  const white = new THREE.Color(0xf6faff), warm = new THREE.Color(0xffc4e0), gold = new THREE.Color(0xffe0c0);
  const c = new THREE.Color();
  if (t < 0.28) c.copy(deep).lerp(cold, smoothstep(0, 0.28, t));
  else if (t < 0.55) c.copy(cold).lerp(white, smoothstep(0.28, 0.55, t));
  else if (t < 0.82) c.copy(white).lerp(warm, smoothstep(0.55, 0.82, t));
  else c.copy(warm).lerp(gold, smoothstep(0.82, 1, t));
  c.offsetHSL(rand(-0.012, 0.012), rand(-0.035, 0.035), rand(-0.05, 0.07));
  return c;
}

/**
 * 创建一棵粒子圣诞树。
 * @param {HTMLCanvasElement} canvas 渲染画布（尺寸取其 clientWidth/clientHeight）
 * @param {Object} opts { particleCount, onReady }
 * @returns 控制器 { setGesture, scatter, celebrate, pause, resume, destroy }
 */
export function createTree(canvas, opts = {}) {
  const PARTICLE_COUNT = opts.particleCount || 28000;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050c14);
  scene.fog = new THREE.FogExp2(0x050c14, 0.0075);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
  camera.position.set(0, 1.0, 19.5);

  const clock = new THREE.Clock();
  const treeRoot = new THREE.Group();
  scene.add(treeRoot);

  // 内置手势状态：默认聚合成树、缓慢自转、呼吸
  const g = {
    openness: 0, scale: 1, spin: 0, ok: false, wishActive: false, handPresent: false, pinch: false,
  };
  let autoSpin = 0.06;           // 基础自转速度
  let dragSpin = 0;              // 拖拽附加角速度（会衰减）
  let userScale = 1;
  let scatterPulse = 0;          // 一次性散开脉冲 0..1
  let spreadCur = 0, scaleCur = 1, spinCur = 0, fadeCur = 1;
  let running = true, raf = 0, disposed = false;

  function size() {
    const w = Math.max(1, canvas.clientWidth || canvas.width || 200);
    const h = Math.max(1, canvas.clientHeight || canvas.height || 320);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 窄卡片适当拉远，保证树底完整入镜
    camera.position.z = camera.aspect < 0.75 ? 21.5 : 19.5;
    camera.updateProjectionMatrix();
    if (treeUniforms) treeUniforms.uPS.value = clamp(h / 620, 0.4, 1.15);
  }

  /* ---------- 构建场景元素 ---------- */
  let treeUniforms, ringGroup, heartGroup, heartLight, heartGlow;

  function buildTreeParticles() {
    const geo = new THREE.BufferGeometry();
    const tree = new Float32Array(PARTICLE_COUNT * 3), scatter = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3), sizes = new Float32Array(PARTICLE_COUNT), phases = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const tp = spiralTreePoint(i, PARTICLE_COUNT), sc = scatterPoint();
      tree[i * 3] = tp.x; tree[i * 3 + 1] = tp.y; tree[i * 3 + 2] = tp.z;
      scatter[i * 3] = sc.x; scatter[i * 3 + 1] = sc.y; scatter[i * 3 + 2] = sc.z;
      const col = treeColor(tp.t ?? clamp((tp.y - TREE_BOTTOM) / TREE_H));
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
      sizes[i] = Math.random() < 0.08 ? rand(2.2, 3.4) : rand(0.7, 1.7);
      phases[i] = rand(0, Math.PI * 2);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(tree, 3));
    geo.setAttribute('aTree', new THREE.BufferAttribute(tree, 3));
    geo.setAttribute('aScatter', new THREE.BufferAttribute(scatter, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    treeUniforms = {
      uSpread: { value: 0 }, uTime: { value: 0 }, uDpr: { value: dpr }, uFade: { value: 1 },
      uPS: { value: clamp((canvas.clientHeight || 320) / 620, 0.4, 1.15) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: treeUniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    treeRoot.add(pts);
  }

  function buildGroundRings() {
    ringGroup = new THREE.Group();
    const radii = [2.6, 3.4, 4.3, 5.4];
    const glowTex = radialTexture('rgba(255,255,255,0.95)', 'rgba(150,210,255,0.35)', 'rgba(120,170,255,0)');
    const ringColors = [0xbfe6ff, 0xffd9e8, 0x9ed4ff, 0xffc9de];
    radii.forEach((radius, ri) => {
      const count = 700 + ri * 200;
      const pos = new Float32Array(count * 3), sizes = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rand(-0.01, 0.01);
        const r = radius + rand(-0.12, 0.12);
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = TREE_BOTTOM - 0.15 + rand(-0.05, 0.05);
        pos[i * 3 + 2] = Math.sin(a) * r;
        sizes[i] = rand(0.7, 1.5);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      const mat = new THREE.PointsMaterial({
        color: ringColors[ri % ringColors.length], size: 0.16, map: glowTex,
        transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      });
      const ring = new THREE.Points(geo, mat);
      ring.userData.speed = (ri % 2 === 0 ? 1 : -1) * (0.03 + ri * 0.012);
      ringGroup.add(ring);
    });
    treeRoot.add(ringGroup);
  }

  function buildTopHeart() {
    heartGroup = new THREE.Group();
    const pts = [];
    for (let i = 0; i < 1400; i++) {
      const t = Math.random() * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push(x * 0.028 + rand(-0.02, 0.02), y * 0.028 + rand(-0.02, 0.02), rand(-0.06, 0.06));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    heartGroup.add(new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xff9fc4, size: 0.13,
      map: radialTexture('rgba(255,255,255,1)', 'rgba(255,160,200,0.4)', 'rgba(255,120,180,0)'),
      transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
    })));
    heartGroup.position.set(0, TREE_BOTTOM + TREE_H + 0.55, 0);
    heartLight = new THREE.PointLight(0xffb0cf, 3.5, 22, 1.8);
    heartGroup.add(heartLight);
    heartGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture('rgba(255,225,240,0.95)', 'rgba(255,150,195,0.4)', 'rgba(255,120,180,0)'),
      color: 0xffc8de, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85,
    }));
    heartGlow.scale.set(3.6, 3.6, 1);
    heartGroup.add(heartGlow);
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture('rgba(255,200,225,0.5)', 'rgba(255,140,190,0.18)', 'rgba(255,120,180,0)'),
      color: 0xffd0e2, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5,
    }));
    aura.scale.set(6.2, 6.2, 1);
    heartGroup.add(aura);
    treeRoot.add(heartGroup);
  }

  function buildStars() {
    const N = 1200, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const warm = new THREE.Color(0xffd9b8), cool = new THREE.Color(0xbfe0ff), white = new THREE.Color(0xffffff);
    for (let i = 0; i < N; i++) {
      const r = rand(35, 100), th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
      pos[i * 3 + 1] = Math.cos(ph) * r;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
      const roll = Math.random(), base = roll < 0.12 ? warm : roll < 0.3 ? cool : white, w = rand(0.35, 1);
      col[i * 3] = base.r * w; col[i * 3 + 1] = base.g * w; col[i * 3 + 2] = base.b * w;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.62, vertexColors: true, transparent: true, opacity: 0.78,
      sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending,
      map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.25)', 'rgba(255,255,255,0)'),
    })));
  }

  buildStars(); buildTreeParticles(); buildGroundRings(); buildTopHeart();
  size();

  /* ---------- 主循环 ---------- */
  function animate() {
    if (disposed) return;
    raf = requestAnimationFrame(animate);
    if (!running) { clock.getDelta(); return; }
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.getElapsedTime();

    // 目标散开度：手势张开 / 捏合 / OK / 一次性脉冲
    scatterPulse *= Math.exp(-dt * 1.6);
    let target = smoothstep(0.16, 0.82, g.openness);
    if (!g.handPresent) target = 0;
    if (g.pinch) target = Math.max(target, 0.9);
    if (g.ok) target = 1;
    target = Math.max(target, scatterPulse);
    spreadCur += (target - spreadCur) * (1 - Math.exp(-dt * 4.2));

    let fadeTarget = g.wishActive ? 0.06 : 1;
    fadeCur += (fadeTarget - fadeCur) * (1 - Math.exp(-dt * (g.wishActive ? 4.5 : 3.2)));

    const sTarget = clamp(g.scale, 0.55, 1.75) * userScale;
    scaleCur += (sTarget - scaleCur) * (1 - Math.exp(-dt * 4));
    treeRoot.scale.setScalar(scaleCur);

    dragSpin *= Math.exp(-dt * 1.8);
    spinCur += ((g.spin + dragSpin) - spinCur) * (1 - Math.exp(-dt * 6));
    treeRoot.rotation.y += dt * (autoSpin + spreadCur * 0.12 + spinCur + (g.ok ? 0.5 : 0));
    treeRoot.position.y = Math.sin(time * 0.7) * 0.1;

    treeUniforms.uSpread.value = spreadCur;
    treeUniforms.uTime.value = time;
    treeUniforms.uFade.value = fadeCur;

    ringGroup.children.forEach(r => {
      r.rotation.y += dt * r.userData.speed * (1 + spreadCur);
      r.material.opacity = (0.35 + spreadCur * 0.4) * fadeCur;
    });
    const pulse = 0.85 + 0.15 * Math.sin(time * 2.1);
    heartLight.intensity = (2.8 + pulse * 1.2) * fadeCur;
    heartGlow.material.opacity = (0.6 + pulse * 0.3) * fadeCur;
    heartGlow.scale.setScalar(3.0 + pulse * 0.5);
    heartGroup.rotation.z = Math.sin(time * 0.5) * 0.06;

    renderer.render(scene, camera);
  }
  animate();
  if (opts.onReady) opts.onReady();

  /* ---------- 降级交互：拖拽旋转 / 滚轮缩放 ---------- */
  let dragging = false, lastX = 0;
  function onDown(e) { dragging = true; lastX = (e.clientX != null ? e.clientX : (e.touches && e.touches[0].clientX)) || 0; }
  function onMove(e) {
    if (!dragging) return;
    const x = (e.clientX != null ? e.clientX : (e.touches && e.touches[0].clientX)) || 0;
    dragSpin += (x - lastX) * 0.006;
    dragSpin = clamp(dragSpin, -3, 3);
    lastX = x;
  }
  function onUp() { dragging = false; }
  function onWheel(e) {
    e.preventDefault();
    userScale = clamp(userScale - Math.sign(e.deltaY) * 0.08, 0.6, 1.6);
  }
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(size) : null;
  if (ro) ro.observe(canvas);

  return {
    setGesture(patch) { Object.assign(g, patch); },
    scatter() { scatterPulse = 1; },                 // 点击撒星光：散开再聚合
    celebrate() { scatterPulse = 1; g.ok = true; setTimeout(() => { g.ok = false; }, 1600); },
    pause() { running = false; },
    resume() { running = true; },
    resize: size,
    destroy() {
      disposed = true; cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      if (ro) ro.disconnect();
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach(mm => { if (mm.map) mm.map.dispose(); mm.dispose(); }); }
      });
      renderer.dispose();
    },
  };
}
