/**
 * 更新日志页交互 / update/
 * ⚠️ 本文件是唯一生效源（source/js/update.js 优先于主题那份）
 *    旧版监听的是已废弃的 .timeline-content / .tag，且每 2 秒往页面塞一个
 *    "心电图" 脉冲 div（还会跟样式里的 display:none !important 打架）。
 * class 契约见 themes/anzhiyu/layout/update.pug
 */
(function () {
  'use strict';

  function init() {
    var cards = document.querySelectorAll('.update-card');
    if (!cards.length) return; // 不在更新日志页
    if (document.body.__updateBound) return;
    document.body.__updateBound = true;

    // 进入视口时淡入上移，只播一次
    if ('IntersectionObserver' in window) {
      cards.forEach(function (card) {
        card.style.opacity = '0';
        card.style.transform = 'translateY(14px)';
        card.style.transition = 'opacity .5s ease, transform .5s ease, box-shadow .25s ease, border-color .25s ease';
      });

      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en, i) {
          if (!en.isIntersecting) return;
          var el = en.target;
          setTimeout(function () {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
          }, i * 60);
          io.unobserve(el);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

      cards.forEach(function (c) { io.observe(c); });

      // pjax 替换页面前断开观察器，避免泄漏
      document.addEventListener('pjax:beforeReplace', function () {
        io.disconnect();
        document.body.__updateBound = false;
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('pjax:complete', init);
})();