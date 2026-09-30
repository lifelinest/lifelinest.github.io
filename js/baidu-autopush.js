/**
 * 百度搜索资源平台 · 普通收录 · 「自动提交」JS 推送代码
 * ------------------------------------------------------------
 * 作用：访客每打开一个页面，就把该页 URL 实时推给百度。
 * 与 scripts/baidu-push.js（主动推送 API，10 条/天配额）互补：
 *   - 主动推送：可控、精准，但受每日配额限制
 *   - 自动推送：无配额上限，靠真实访问量驱动
 *
 * 注入方式：_config.yml → inject.bottom → <script defer src="/js/baidu-autopush.js">
 * 验证位置：https://ziyuan.baidu.com/ → 普通收录 → 自动提交 → 查看推送量曲线
 *
 * 注意：这段代码只负责「告诉百度有这个 URL」，不保证收录，也不影响页面性能（defer 异步）。
 */
(function () {
  try {
    var bp = document.createElement('script');
    var curProtocol = window.location.protocol.split(':')[0];
    if (curProtocol === 'https') {
      bp.src = 'https://zz.bdstatic.com/linksubmit/push.js';
    } else {
      bp.src = 'http://push.zhanzhang.baidu.com/push.js';
    }
    var s = document.getElementsByTagName('script')[0];
    if (s && s.parentNode) {
      s.parentNode.insertBefore(bp, s);
    } else {
      document.head.appendChild(bp);
    }
  } catch (e) {
    /* 推送失败不应影响页面渲染 */
  }
})();
