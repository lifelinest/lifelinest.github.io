/* 迷宫实验室 · 零依赖
   生成: DFS 回溯 / Kruskal / 随机 Prim / 递归分割
   寻路: BFS / DFS / A* / 贪心最佳优先
   全部算法用生成器实现，逐 yield 一步，因此能"看得见算法在想什么"。 */
(function () {
  'use strict';

  if (window.__mazeLab && window.__mazeLab.destroy) {
    try { window.__mazeLab.destroy(); } catch (e) { }
  }

  var stage = document.getElementById('maze-stage');
  var canvas = document.getElementById('maze-canvas');
  if (!stage || !canvas) return;

  var ctx = canvas.getContext('2d');
  var el = function (id) { return document.getElementById(id); };
  var genSel = el('ml-gen'), sizeR = el('ml-size'), speedR = el('ml-speed');
  var solA = el('ml-solve-a'), solB = el('ml-solve-b'), viewSel = el('ml-view');
  var btnGen = el('ml-btn-gen'), btnSolve = el('ml-btn-solve'), btnPause = el('ml-btn-pause');
  var btnStep = el('ml-btn-step'), btnClear = el('ml-btn-clear'), btnCmp = el('ml-btn-compare');
  var stat = el('ml-stat'), hint = el('ml-hint');
  if (!genSel || !btnGen) return;

  /* ---------- 迷宫数据 ---------- */
  function Maze(cols, rows) {
    this.cols = cols; this.rows = rows;
    this.hW = new Uint8Array((rows + 1) * cols);   // 水平墙: cell(r,c) 的 N 墙 = hW[r*cols+c]
    this.vW = new Uint8Array(rows * (cols + 1));   // 垂直墙: cell(r,c) 的 W 墙 = vW[r*(cols+1)+c]
    this.hW.fill(1); this.vW.fill(1);
  }
  Maze.prototype.idx = function (r, c) { return r * this.cols + c; };
  Maze.prototype.carve = function (r1, c1, r2, c2) {
    if (r1 === r2) {                                 // 左右相邻
      var c = Math.min(c1, c2) + 1;
      this.vW[r1 * (this.cols + 1) + c] = 0;
    } else {                                         // 上下相邻
      var r = Math.min(r1, r2) + 1;
      this.hW[r * this.cols + c1] = 0;
    }
  };
  Maze.prototype.open = function (r, c, dir) {       // 打通单侧
    if (dir === 0) this.hW[r * this.cols + c] = 0;                 // N
    else if (dir === 1) this.vW[r * (this.cols + 1) + c + 1] = 0;  // E
    else if (dir === 2) this.hW[(r + 1) * this.cols + c] = 0;      // S
    else this.vW[r * (this.cols + 1) + c] = 0;                     // W
  };
  Maze.prototype.hasWall = function (r, c, dir) {
    if (dir === 0) return this.hW[r * this.cols + c];
    if (dir === 1) return this.vW[r * (this.cols + 1) + c + 1];
    if (dir === 2) return this.hW[(r + 1) * this.cols + c];
    return this.vW[r * (this.cols + 1) + c];
  };
  Maze.prototype.clearAll = function () { this.hW.fill(0); this.vW.fill(0); };
  // 外边界补回（递归分割是先清空再砌墙，最后要围一圈）
  Maze.prototype.border = function () {
    var i;
    for (i = 0; i < this.cols; i++) { this.hW[0 * this.cols + i] = 1; this.hW[this.rows * this.cols + i] = 1; }
    for (i = 0; i < this.rows; i++) { this.vW[i * (this.cols + 1)] = 1; this.vW[i * (this.cols + 1) + this.cols] = 1; }
  };

  function rng(seed) {                               // 可复现的随机
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* ---------- 生成算法（生成器） ---------- */
  function* genDFS(m, rnd) {
    var N = m.cols * m.rows, vis = new Uint8Array(N), stack = [[0, 0]];
    vis[0] = 1;
    var D = [[-1, 0, 0], [0, 1, 1], [1, 0, 2], [0, -1, 3]];
    while (stack.length) {
      var cur = stack[stack.length - 1], r = cur[0], c = cur[1];
      var cand = [];
      for (var i = 0; i < 4; i++) {
        var nr = r + D[i][0], nc = c + D[i][1];
        if (nr >= 0 && nr < m.rows && nc >= 0 && nc < m.cols && !vis[nr * m.cols + nc]) cand.push([nr, nc, D[i][2]]);
      }
      if (!cand.length) { stack.pop(); yield { cur: [r, c], back: true }; continue; }
      var pick = cand[Math.floor(rnd() * cand.length)];
      m.open(r, c, pick[2]);
      vis[pick[0] * m.cols + pick[1]] = 1;
      stack.push([pick[0], pick[1]]);
      yield { cur: [pick[0], pick[1]], back: false };
    }
  }

  function* genPrim(m, rnd) {
    var N = m.cols * m.rows, vis = new Uint8Array(N), frontier = [];
    var sr = Math.floor(rnd() * m.rows), sc = Math.floor(rnd() * m.cols);
    vis[sr * m.cols + sc] = 1;
    var push = function (r, c) { frontier.push([r, c]); };
    var D = [[-1, 0], [0, 1], [1, 0], [0, -1]];
    for (var i = 0; i < 4; i++) {
      var nr = sr + D[i][0], nc = sc + D[i][1];
      if (nr >= 0 && nr < m.rows && nc >= 0 && nc < m.cols) push(nr, nc);
    }
    while (frontier.length) {
      var k = Math.floor(rnd() * frontier.length);
      var cell = frontier[k]; frontier[k] = frontier[frontier.length - 1]; frontier.pop();
      var r = cell[0], c = cell[1];
      if (vis[r * m.cols + c]) continue;
      var nb = [];
      for (var j = 0; j < 4; j++) {
        var ar = r + D[j][0], ac = c + D[j][1];
        if (ar >= 0 && ar < m.rows && ac >= 0 && ac < m.cols && vis[ar * m.cols + ac]) nb.push([ar, ac, j]);
      }
      if (!nb.length) continue;
      var p = nb[Math.floor(rnd() * nb.length)];
      m.open(r, c, p[2]);
      vis[r * m.cols + c] = 1;
      yield { cur: [r, c], back: false };
      for (var q = 0; q < 4; q++) {
        var br = r + D[q][0], bc = c + D[q][1];
        if (br >= 0 && br < m.rows && bc >= 0 && bc < m.cols && !vis[br * m.cols + bc]) push(br, bc);
      }
    }
  }

  function* genKruskal(m, rnd) {
    var N = m.cols * m.rows, parent = new Int32Array(N), i;
    for (i = 0; i < N; i++) parent[i] = i;
    function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
    var edges = [];
    for (var r = 0; r < m.rows; r++) {
      for (var c = 0; c < m.cols; c++) {
        if (c + 1 < m.cols) edges.push([r, c, r, c + 1]);
        if (r + 1 < m.rows) edges.push([r, c, r + 1, c]);
      }
    }
    for (i = edges.length - 1; i > 0; i--) {          // Fisher-Yates
      var j = Math.floor(rnd() * (i + 1)), t = edges[i]; edges[i] = edges[j]; edges[j] = t;
    }
    for (i = 0; i < edges.length; i++) {
      var e = edges[i], a = find(e[0] * m.cols + e[1]), b = find(e[2] * m.cols + e[3]);
      if (a !== b) { parent[a] = b; m.carve(e[0], e[1], e[2], e[3]); yield { cur: [e[2], e[3]], back: false }; }
    }
  }

  function* genRecDiv(m, rnd) {
    m.clearAll(); m.border();
    var stack = [[0, 0, m.cols, m.rows]];
    while (stack.length) {
      var rc = stack.pop(), x = rc[0], y = rc[1], w = rc[2], h = rc[3];
      if (w < 2 || h < 2) continue;
      var horiz = h > w ? true : (w > h ? false : rnd() < 0.5);
      if (horiz) {
        var wy = y + 1 + Math.floor(rnd() * (h - 1));   // 分割线：wy 行之上砌墙
        var hole = x + Math.floor(rnd() * w);
        for (var c = x; c < x + w; c++) {
          if (c === hole) continue;
          m.hW[wy * m.cols + c] = 1;
          yield { cur: [wy, c], wall: true };
        }
        stack.push([x, y, w, wy - y]); stack.push([x, wy, w, y + h - wy]);
      } else {
        var wx = x + 1 + Math.floor(rnd() * (w - 1));
        var hole2 = y + Math.floor(rnd() * h);
        for (var r2 = y; r2 < y + h; r2++) {
          if (r2 === hole2) continue;
          m.vW[r2 * (m.cols + 1) + wx] = 1;
          yield { cur: [r2, wx], wall: true };
        }
        stack.push([x, y, wx - x, h]); stack.push([wx, y, x + w - wx, h]);
      }
    }
  }

  var GENS = { dfs: genDFS, prim: genPrim, kruskal: genKruskal, recdiv: genRecDiv };

  /* ---------- 最小堆（A星 与 Greedy 用） ---------- */
  function Heap() { this.a = []; }
  Heap.prototype.push = function (node) {
    var a = this.a; a.push(node); var i = a.length - 1;
    while (i > 0) { var p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; var t = a[p]; a[p] = a[i]; a[i] = t; i = p; }
  };
  Heap.prototype.pop = function () {
    var a = this.a; if (!a.length) return null;
    var top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, s = i;
        if (l < a.length && a[l][0] < a[s][0]) s = l;
        if (r < a.length && a[r][0] < a[s][0]) s = r;
        if (s === i) break;
        var t = a[s]; a[s] = a[i]; a[i] = t; i = s;
      }
    }
    return top;
  };
  Heap.prototype.size = function () { return this.a.length; };

  /* ---------- 寻路（生成器） ---------- */
  var DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];

  function* solve(m, algo, sr, sc, er, ec) {
    var cols = m.cols, rows = m.rows, N = cols * rows;
    var vis = new Uint8Array(N), from = new Int32Array(N);
    for (var i = 0; i < N; i++) from[i] = -1;
    var start = sr * cols + sc, goal = er * cols + ec;
    var h = function (id) { return Math.abs((id / cols | 0) - er) + Math.abs((id % cols) - ec); };
    var container, popNext, gScore = null;
    if (algo === 'bfs') {
      container = [start]; popNext = function () { return container.shift(); };
    } else if (algo === 'dfs') {
      container = [start]; popNext = function () { return container.pop(); };
    } else {
      gScore = new Float64Array(N); gScore.fill(Infinity); gScore[start] = 0;
      container = new Heap();
      container.push(algo === 'astar' ? [h(start), 0, start] : [h(start), start]);
      popNext = function () {
        var n = container.pop(); if (!n) return undefined;
        return algo === 'astar' ? n[2] : n[1];
      };
    }
    var push = function (id, fromId, g) {
      if (algo === 'bfs' || algo === 'dfs') container.push(id);
      else if (algo === 'astar') { gScore[id] = g; container.push([g + h(id), g, id]); }
      else container.push([h(id), id]);
      from[id] = fromId;
    };
    vis[start] = 1; var steps = 0;
    yield { cur: start, found: false };
    while (true) {
      var cur = popNext();
      if (cur === undefined || cur === null) break;
      steps++;
      if (cur === goal) {
        var path = []; var p = goal;
        while (p !== -1) { path.push(p); p = from[p]; }
        path.reverse();
        yield { cur: cur, found: true, path: path };
        return;
      }
      var r = cur / cols | 0, c = cur % cols;
      for (var d = 0; d < 4; d++) {
        if (m.hasWall(r, c, d)) continue;
        var nr = r + DIRS[d][0], nc = c + DIRS[d][1];
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        var nid = nr * cols + nc;
        if (vis[nid]) continue;
        vis[nid] = 1;
        push(nid, cur, (gScore ? gScore[cur] + 1 : 0));
      }
      yield { cur: cur, found: false, visited: vis };
    }
    yield { cur: -1, found: false };
  }

  /* ---------- 状态 ---------- */
  var S = {
    maze: null, cols: 31, rows: 21,
    start: [0, 0], end: [20, 30],
    phase: 'idle',                 // idle | gen | solve | done
    gen: null, solver: null, solverB: null,
    visOrder: null, visOrderB: null, path: null, pathB: null,
    cur: -1, curB: -1, found: false, foundB: false,
    steps: 0, stepsB: 0, t0: 0, ms: 0, msB: 0,
    raf: 0, paused: false, compare: false, view: 'flat'
  };

  function sizeOf() {
    var n = parseInt(sizeR.value, 10) || 31;
    var cols = n, rows = Math.max(9, Math.round(n * 0.68));
    if (cols % 2 === 0) cols++; if (rows % 2 === 0) rows++;
    return [cols, rows];
  }

  function reset(keepWalls) {
    cancelAnimationFrame(S.raf); S.raf = 0;
    var sz = sizeOf(); S.cols = sz[0]; S.rows = sz[1];
    if (!keepWalls || !S.maze || S.maze.cols !== S.cols || S.maze.rows !== S.rows) S.maze = new Maze(S.cols, S.rows);
    S.start = [0, 0];
    S.end = [S.rows - 1, S.cols - 1];
    S.visOrder = []; S.visOrderB = []; S.path = null; S.pathB = null;
    S.cur = -1; S.curB = -1; S.found = false; S.foundB = false;
    S.steps = 0; S.stepsB = 0; S.ms = 0; S.msB = 0;
    S.phase = 'idle'; S.paused = false;
    resize(); draw(); updateStat();
  }

  function newMaze() {
    reset(false);
    var rnd = rng((Date.now() ^ 0x9e3779b9) >>> 0);
    var fn = GENS[genSel.value] || genDFS;
    S.gen = fn(S.maze, rnd);
    if (genSel.value === 'recdiv') S.maze.border();
    S.phase = 'gen'; S.t0 = performance.now();
    loop();
  }

  function startSolve() {
    if (!S.maze) return;
    S.visOrder = []; S.visOrderB = []; S.path = null; S.pathB = null;
    S.cur = -1; S.curB = -1; S.found = false; S.foundB = false;
    S.steps = 0; S.stepsB = 0; S.ms = 0; S.msB = 0;
    S.solver = solve(S.maze, solA.value, S.start[0], S.start[1], S.end[0], S.end[1]);
    S.solverB = S.compare ? solve(S.maze, solB.value, S.start[0], S.start[1], S.end[0], S.end[1]) : null;
    S.phase = 'solve'; S.paused = false; S.t0 = performance.now();
    btnPause.textContent = '暂停';
    loop();
  }

  function loop() {
    if (S.raf) cancelAnimationFrame(S.raf);
    var speed = parseInt(speedR.value, 10) || 30;
    var tick = function () {
      if (S.paused) { S.raf = requestAnimationFrame(tick); return; }
      var n = speed >= 400 ? 100000 : speed;
      if (S.phase === 'gen') {
        n *= 3;                          // 生成只是铺垫，快些；寻路才是要看的部分
        if (n < 20) n = 20;
        for (var i = 0; i < n; i++) {
          var r = S.gen.next();
          if (r.done) { S.phase = 'idle'; S.ms = performance.now() - S.t0; draw(); updateStat(); startSolve(); return; }
          S.cur = r.value && r.value.cur ? r.value.cur[0] * S.cols + r.value.cur[1] : S.cur;
        }
        draw(); updateStat();
        S.raf = requestAnimationFrame(tick);
      } else if (S.phase === 'solve') {
        var alive = false, aliveB = false;
        for (var k = 0; k < n; k++) {
          if (S.solver && !S.found && S.steps < 200000) {
            var a = S.solver.next();
            if (a.done) { S.solver = null; }
            else {
              var v = a.value; alive = true;
              if (v.cur >= 0) { S.visOrder.push(v.cur); S.cur = v.cur; S.steps++; }
              if (v.found) { S.path = v.path; S.found = true; S.ms = performance.now() - S.t0; S.solver = null; }
            }
          }
          if (S.solverB && !S.foundB && S.stepsB < 200000) {
            var b = S.solverB.next();
            if (b.done) { S.solverB = null; }
            else {
              var v2 = b.value; aliveB = true;
              if (v2.cur >= 0) { S.visOrderB.push(v2.cur); S.curB = v2.cur; S.stepsB++; }
              if (v2.found) { S.pathB = v2.path; S.foundB = true; S.msB = performance.now() - S.t0; S.solverB = null; }
            }
          }
          if (!alive && !aliveB) break;
        }
        if ((!S.solver || S.found) && (!S.solverB || S.foundB)) {
          S.phase = 'done';
          updateStat();                  // 先刷文案再画，保证提示不会卡在"正在搜索"
          draw();
          return;
        }
        draw(); updateStat();
        S.raf = requestAnimationFrame(tick);
      }
    };
    S.raf = requestAnimationFrame(tick);
  }

  function stepOnce() {
    if (S.phase === 'gen') {
      var r = S.gen.next();
      if (r.done) { S.phase = 'idle'; startSolve(); return; }
      S.cur = r.value && r.value.cur ? r.value.cur[0] * S.cols + r.value.cur[1] : S.cur;
    } else if (S.phase === 'solve' || S.phase === 'done') {
      if (S.phase === 'done') { S.phase = 'solve'; }
      if (S.solver && !S.found) {
        var a = S.solver.next();
        if (!a.done) { var v = a.value; if (v.cur >= 0) { S.visOrder.push(v.cur); S.cur = v.cur; S.steps++; } if (v.found) { S.path = v.path; S.found = true; S.solver = null; } }
        else S.solver = null;
      }
      if (S.solverB && !S.foundB) {
        var b = S.solverB.next();
        if (!b.done) { var v2 = b.value; if (v2.cur >= 0) { S.visOrderB.push(v2.cur); S.curB = v2.cur; S.stepsB++; } if (v2.found) { S.pathB = v2.path; S.foundB = true; S.solverB = null; } }
        else S.solverB = null;
      }
    }
    draw(); updateStat();
  }

  /* ---------- 渲染 ---------- */
  var cw = 10, chh = 10, ox = 0, oy = 0;

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = stage.clientWidth || 900, h = stage.clientHeight || 520;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout(w, h);
  }

  function layout(w, h) {
    var cols = S.cols, rows = S.rows;
    if (S.view === 'iso') {
      var tw = (cols + rows), th = (cols + rows) / 2 + 2;
      cw = Math.min(w / tw * 1.35, h / th * 0.9);
      chh = cw * 0.5;
      ox = w / 2; oy = h / 2 - (rows - 1) * chh / 2 + 8;
    } else {
      cw = Math.min((w - 24) / cols, (h - 24) / rows);
      chh = cw;
      ox = (w - cw * cols) / 2; oy = (h - chh * rows) / 2;
    }
  }

  function isoX(r, c) { return ox + (c - r) * cw / 2; }
  function isoY(r, c) { return oy + (c + r) * chh / 2; }
  function flatX(c) { return ox + c * cw; }
  function flatY(r) { return oy + r * chh; }

  function cellColor(orderIdx, total) {
    var t = total > 1 ? orderIdx / (total - 1) : 0;
    var h1 = 205 + (165 - 205) * t;               // 蓝 → 青
    return 'hsl(' + h1 + ',72%,' + (26 + 26 * t) + '%)';
  }

  function drawPane(vp) {
    var m = S.maze, cols = S.cols, rows = S.rows;
    ctx.save();
    ctx.beginPath(); ctx.rect(vp.x, vp.y, vp.w, vp.h); ctx.clip();
    ctx.translate(vp.x, vp.y);
    if (S.view === 'iso') { ox = vp.w / 2; oy = vp.h / 2 - (rows - 1) * chh / 2 + 8; }
    else { ox = (vp.w - cw * cols) / 2; oy = (vp.h - chh * rows) / 2; }

    var visMap = new Int32Array(cols * rows).fill(-1), i;
    var order = vp.b ? S.visOrderB : S.visOrder;
    for (i = 0; i < order.length; i++) visMap[order[i]] = i;
    var total = Math.max(order.length, 1);
    var pathSet = new Uint8Array(cols * rows);
    var p = vp.b ? S.pathB : S.path;
    if (p) for (i = 0; i < p.length; i++) pathSet[p[i]] = 1;

    // 地板 / 已访问
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var id = r * cols + c, oi = visMap[id];
        var fill = oi >= 0 ? cellColor(oi, total) : '#141a2b';
        if (S.view === 'iso') {
          var x = isoX(r, c), y = isoY(r, c);
          ctx.beginPath();
          ctx.moveTo(x, y); ctx.lineTo(x + cw / 2, y + chh / 2);
          ctx.lineTo(x, y + chh); ctx.lineTo(x - cw / 2, y + chh / 2); ctx.closePath();
          ctx.fillStyle = fill; ctx.fill();
        } else {
          ctx.fillStyle = fill;
          ctx.fillRect(flatX(c), flatY(r), cw + 0.6, chh + 0.6);
        }
      }
    }
    // 路径
    if (p) {
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = Math.max(1.5, cw * 0.32); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      for (i = 0; i < p.length; i++) {
        var pr = p[i] / cols | 0, pc = p[i] % cols;
        var px = S.view === 'iso' ? isoX(pr, pc) : flatX(pc) + cw / 2;
        var py = S.view === 'iso' ? isoY(pr, pc) + chh / 2 : flatY(pr) + chh / 2;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    // 墙
    ctx.strokeStyle = '#4a6a9e'; ctx.lineWidth = Math.max(1, cw * 0.14); ctx.lineCap = 'square';
    ctx.beginPath();
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        if (S.view === 'iso') {
          var bx = isoX(r, c), by = isoY(r, c);
          if (m.hasWall(r, c, 0)) { ctx.moveTo(bx, by); ctx.lineTo(bx + cw / 2, by - chh / 2 + chh); ctx.lineTo(bx + cw / 2, by + chh / 2); }
          if (m.hasWall(r, c, 3)) { ctx.moveTo(bx, by + chh); ctx.lineTo(bx - cw / 2, by + chh / 2); }
          if (r === rows - 1 && m.hasWall(r, c, 2)) { ctx.moveTo(bx, by + chh); ctx.lineTo(bx + cw / 2, by + chh * 1.5); }
          if (c === cols - 1 && m.hasWall(r, c, 1)) { ctx.moveTo(bx + cw / 2, by + chh / 2); ctx.lineTo(bx + cw, by + chh); }
        } else {
          var fx = flatX(c), fy = flatY(r);
          if (m.hasWall(r, c, 0)) { ctx.moveTo(fx, fy); ctx.lineTo(fx + cw, fy); }
          if (m.hasWall(r, c, 3)) { ctx.moveTo(fx, fy); ctx.lineTo(fx, fy + chh); }
          if (r === rows - 1 && m.hasWall(r, c, 2)) { ctx.moveTo(fx, fy + chh); ctx.lineTo(fx + cw, fy + chh); }
          if (c === cols - 1 && m.hasWall(r, c, 1)) { ctx.moveTo(fx + cw, fy); ctx.lineTo(fx + cw, fy + chh); }
        }
      }
    }
    ctx.stroke();
    // 起终点
    var sd = S.start[0] * cols + S.start[1], ed = S.end[0] * cols + S.end[1];
    mark(sd, '#4ade80'); mark(ed, '#f87171');
    function mark(id, color) {
      var mr = id / cols | 0, mc = id % cols;
      if (S.view === 'iso') {
        var x = isoX(mr, mc), y = isoY(mr, mc) + chh / 2;
        ctx.beginPath(); ctx.ellipse(x, y, cw * 0.3, chh * 0.5, 0, 0, 6.2832);
      } else {
        ctx.beginPath(); ctx.arc(flatX(mc) + cw / 2, flatY(mr) + chh / 2, cw * 0.32, 0, 6.2832);
      }
      ctx.fillStyle = color; ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    var w = canvas.width / (canvas.width / parseFloat(canvas.style.width || canvas.width));
    var W = parseFloat(canvas.style.width) || stage.clientWidth;
    var H = parseFloat(canvas.style.height) || stage.clientHeight;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, W, H);
    layout(W, H);
    if (S.compare) {
      var gap = 10, half = (W - gap) / 2;
      drawPane({ x: 0, y: 0, w: half, h: H, b: false });
      drawPane({ x: half + gap, y: 0, w: half, h: H, b: true });
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.font = '600 12px system-ui,sans-serif';
      ctx.fillText(label(solA.value), 10, 18);
      ctx.fillText(label(solB.value), half + gap + 10, 18);
    } else {
      drawPane({ x: 0, y: 0, w: W, h: H, b: false });
    }
  }

  function label(a) {
    return { bfs: 'BFS 广度优先', dfs: 'DFS 深度优先', astar: 'A* 启发式', greedy: '贪心最佳优先' }[a] || a;
  }

  function updateStat() {
    if (!stat) return;
    var total = S.cols * S.rows;
    var s = '网格 ' + S.cols + '×' + S.rows + '（' + total + ' 格）';
    if (S.compare) {
      s += ' ｜ <b>A</b> 探索 ' + S.visOrder.length + ' 格，路径 ' + (S.path ? S.path.length : '—') + ' 步'
        + ' ｜ <b>B</b> 探索 ' + S.visOrderB.length + ' 格，路径 ' + (S.pathB ? S.pathB.length : '—') + ' 步';
    } else {
      s += ' ｜ 探索 ' + S.visOrder.length + ' 格 ｜ 路径 ' + (S.path ? S.path.length : (S.found ? 0 : '—')) + ' 步';
    }
    if (S.ms) s += ' ｜ 耗时 ' + S.ms.toFixed(0) + ' ms';
    stat.innerHTML = s;
    if (hint) {
      hint.textContent = S.phase === 'gen' ? '正在生成迷宫…' :
        S.phase === 'solve' ? ('正在搜索：' + label(solA.value) + (S.compare ? ' vs ' + label(solB.value) : '')) :
          S.phase === 'done' ? '完成。点击任意格子可改起点 / 终点' : '点「生成迷宫」开始';
    }
  }

  /* ---------- 交互 ---------- */
  btnGen.addEventListener('click', newMaze);
  btnSolve.addEventListener('click', startSolve);
  btnStep.addEventListener('click', function () { S.paused = true; btnPause.textContent = '继续'; stepOnce(); });
  btnPause.addEventListener('click', function () {
    S.paused = !S.paused; btnPause.textContent = S.paused ? '继续' : '暂停';
  });
  btnClear.addEventListener('click', function () {
    cancelAnimationFrame(S.raf); S.raf = 0;
    S.visOrder = []; S.visOrderB = []; S.path = null; S.pathB = null;
    S.found = false; S.foundB = false; S.solver = null; S.solverB = null;
    S.phase = 'idle'; draw(); updateStat();
  });
  btnCmp.addEventListener('click', function () {
    S.compare = !S.compare;
    btnCmp.classList.toggle('on', S.compare);
    btnCmp.textContent = S.compare ? '对比：开' : '对比：关';
    solB.parentNode.style.display = S.compare ? '' : 'none';
    draw(); updateStat();
  });
  viewSel.addEventListener('change', function () { S.view = viewSel.value; draw(); });
  sizeR.addEventListener('change', function () { newMaze(); });
  var ro = window.ResizeObserver ? new ResizeObserver(function () { resize(); draw(); }) : null;
  if (ro) ro.observe(stage); else window.addEventListener('resize', function () { resize(); draw(); });

  // 点击设起点 / 终点
  var pickToggle = 0;
  canvas.addEventListener('click', function (e) {
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var r, c;
    if (S.view === 'iso') {
      var sx = mx - ox, sy = my - oy;
      c = Math.round(sx / cw + sy / chh); r = Math.round(sy / chh - sx / cw);
    } else {
      c = Math.floor((mx - ox) / cw); r = Math.floor((my - oy) / chh);
    }
    if (r < 0 || r >= S.rows || c < 0 || c >= S.cols) return;
    if (pickToggle === 0) { S.start = [r, c]; pickToggle = 1; }
    else { S.end = [r, c]; pickToggle = 0; }
    draw(); updateStat();
    if (S.end[0] === r && S.end[1] === c && pickToggle === 0) startSolve();
  });

  function onKey(e) {
    if (/input|select|textarea/i.test(e.target && e.target.tagName || '')) return;
    if (e.key === 'g' || e.key === 'G') newMaze();
    else if (e.key === 's' || e.key === 'S') startSolve();
    else if (e.key === ' ') { e.preventDefault(); btnPause.click(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stepOnce(); }
  }
  window.addEventListener('keydown', onKey);

  /* ---------- 启动 ---------- */
  S.view = viewSel.value || 'flat';
  if (solB && solB.parentNode && !S.compare) solB.parentNode.style.display = 'none';
  resize();
  newMaze();

  window.__mazeLab = {
    destroy: function () {
      cancelAnimationFrame(S.raf); S.raf = 0;
      if (ro) ro.disconnect();
      window.removeEventListener('keydown', onKey);
      window.__mazeLab = null;
    }
  };
})();
