/**
 * 文档中心搜索（/docs/）
 * ⚠️ 本文件是唯一生效源：source/ 优先于 themes/anzhiyu/source/js/docs.js
 *    （旧版那份是假搜索，只弹 alert，且监听已废弃的 .module-container）
 * 依赖 class（见 themes/anzhiyu/layout/docs.pug）：
 *   .docs-group / .docs-card / .docs-no-result(.show)
 * 状态class：.is-hidden由本脚本增删，CSS 必须在 source/css/docs.styl 里定义
 */
(function () {
  'use strict';

  function init() {
    var input = document.getElementById('docs-search-input');
    if (!input) return; // 不在文档中心，直接退出
    // 按元素去重：pjax 重入时同一个 input 不重复绑事件
    if (input.__docsBound) { input.focus(); return; }
    input.__docsBound = true;

    var groups = Array.prototype.slice.call(document.querySelectorAll('.docs-group'));
    var noResult = document.querySelector('.docs-no-result');
    var searchBtn = document.querySelector('.docs-search-box .search-btn');

    function normalize(s) {
      return (s || '').toLowerCase();
    }

    function filter(q) {
      q = normalize(q).trim();
      var totalVisible = 0;

      groups.forEach(function (group) {
        var cards = Array.prototype.slice.call(group.querySelectorAll('.docs-card'));
        var groupVisible = 0;

        cards.forEach(function (card) {
          var match = !q || normalize(card.textContent).indexOf(q) !== -1;
          card.classList.toggle('is-hidden', !match);
          if (match) {
            groupVisible++;
            totalVisible++;
          }
        });

        group.classList.toggle('is-hidden', groupVisible === 0);
      });

      if (noResult) {
        noResult.classList.toggle('show', totalVisible === 0);
      }
    }

    // 桌面端自动聚焦，移动端不弹键盘
    setTimeout(function () {
      if (window.matchMedia && !window.matchMedia('(max-width: 768px)').matches) {
        input.focus();
      }
    }, 400);

    input.addEventListener('input', function (e) {
      filter(e.target.value);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        filter(input.value);
      }
    });

    if (searchBtn) {
      searchBtn.addEventListener('click', function () {
        filter(input.value);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // pjax 局部导航后重新绑定（主题用 pjax 局部加载，不会重跑 DOMContentLoaded）
  document.addEventListener('pjax:complete', init);
})();