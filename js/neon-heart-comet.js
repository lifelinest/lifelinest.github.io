/* 霓虹跑马灯爱心 —— 复刻 WebGL shader 版（亮点+辉光双弧），Canvas 2D 实现，背景透明
 * 原型：I:\学习资料\...\情人节表白\霓虹灯爱心\js\script.js
 * 数学：心形参数曲线 x=16sin³t, y=-(13cos t-5cos2t-2cos3t-cos4t)
 *       两条光弧沿曲线运行，相位差 3.4 rad，粉/蓝各一，白色高亮芯 + 同色辉光
 */
(function () {
  var CANVAS_ID = 'neon-heart-comet';
  var CSS_SIZE = 32;              // 页脚显示尺寸(px)
  var POINT_SPAN = 2.0;           // 单条光弧覆盖的弧度（原版 8 点 × 0.25 rad）
  var PHASE_GAP = 3.4;            // 两条光弧相位差（原版 offset）
  var SPEED = -0.5;               // 原版 speed（负值 = 反向流动）
  var STEPS = 40;                 // 每条光弧细分数（越大越顺滑）
  var FIT = 0.72;                 // 心形占画布比例（留出辉光余量）

  function heartPos(t) {
    var s = Math.sin(t), c = Math.cos(t);
    return [
      16 * s * s * s,
      -(13 * c - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
    ];
  }

  function init() {
    var canvas = document.getElementById(CANVAS_ID);
    if (!canvas) return false;
    var ctx = canvas.getContext('2d');
    if (!ctx) return false;
    if (canvas.dataset.neonReady === '1') return true;

    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var S = Math.round(CSS_SIZE * dpr);
    canvas.width = S;
    canvas.height = S;

    // 归一化：把心形缩放居中到画布内
    var maxX = 0, maxY = 0, minY = Infinity, maxYv = -Infinity;
    for (var i = 0; i < 360; i++) {
      var p = heartPos(i / 360 * Math.PI * 2);
      if (Math.abs(p[0]) > maxX) maxX = Math.abs(p[0]);
      if (Math.abs(p[1]) > maxY) maxY = Math.abs(p[1]);
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxYv) maxYv = p[1];
    }
    var k = Math.min((S * FIT / 2) / maxX, (S * FIT / 2) / maxY);
    var cx = S / 2;
    var cy = S / 2 - ((minY + maxYv) / 2) * k;
    function T(pt) { return [cx + pt[0] * k, cy + pt[1] * k]; }

    var core = Math.max(1.1, S * 0.035);   // 亮芯线宽（画布像素）
    var running = true;
    var startTime = performance.now();

    var drawArc = function (shadowRGB, coreColor) {
      return function (t0) {
        // 收集/T 变换后的采样点
        var pts = [];
        for (var i = 0; i <= STEPS; i++) {
          pts.push(T(heartPos(t0 + (i / STEPS) * POINT_SPAN)));
        }

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 1) 外层柔光（同色大晕）
        ctx.save();
        ctx.shadowColor = 'rgba(' + shadowRGB + ',0.95)';
        ctx.shadowBlur = core * 3.2;
        ctx.strokeStyle = 'rgba(' + shadowRGB + ',0.20)';
        ctx.lineWidth = core * 3.6;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (var m = 1; m < pts.length; m++) ctx.lineTo(pts[m][0], pts[m][1]);
        ctx.stroke();
        ctx.stroke();
        ctx.restore();

        // 2) 主体饱和色带
        ctx.save();
        ctx.strokeStyle = 'rgba(' + shadowRGB + ',0.85)';
        ctx.lineWidth = core * 1.7;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (var m2 = 1; m2 < pts.length; m2++) ctx.lineTo(pts[m2][0], pts[m2][1]);
        ctx.stroke();
        ctx.restore();

        // 3) 白色高亮芯（向尾部收细 + 减淡，做出彗尾）
        ctx.save();
        for (var j = 0; j < STEPS; j++) {
          var f = j / (STEPS - 1);
          var a = Math.pow(1 - f, 0.85) * 0.85 + 0.15;
          ctx.globalAlpha = a;
          ctx.strokeStyle = coreColor;
          ctx.lineWidth = core * (0.95 - 0.55 * f);
          ctx.beginPath();
          ctx.moveTo(pts[j][0], pts[j][1]);
          ctx.lineTo(pts[j + 1][0], pts[j + 1][1]);
          ctx.stroke();
        }
        ctx.restore();
      };
    }

    var drawPink = drawArc('255, 45, 120', '#ffffff');   // 粉弧
    var drawBlue = drawArc('60, 150, 255', '#ffffff');   // 蓝弧

    function frame(now) {
      if (!running) return;
      var time = (now - startTime) / 1000;
      // 对应原版 fract(speed*t)*6.28（speed 为负 ⇒ 取负号保持同向）
      var scroll = -((Math.abs(SPEED) * time) % 1) * Math.PI * 2;

      ctx.clearRect(0, 0, S, S);
      drawPink(scroll);
      drawBlue(scroll + PHASE_GAP);

      requestAnimationFrame(frame);
    }

    canvas.dataset.neonReady = '1';
    requestAnimationFrame(frame);

    // 页面不可见时暂停省 CPU（恢复时不重置 startTime，动画接着走，避免相位跳变）
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        running = false;
      } else if (!running) {
        running = true;
        requestAnimationFrame(frame);
      }
    });
    return true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // pjax 场景重新初始化
  document.addEventListener('pjax:complete', init);
})();
