document.addEventListener('DOMContentLoaded', function() {
  // 获取.back-home-button元素
  const backHomeButton = document.querySelector('.back-home-button');
  
  if (backHomeButton) {
    // 添加点击事件监听器
    backHomeButton.addEventListener('click', function() {
      // 跳转到主页
      if (window.pjax) {
        pjax.loadUrl('/');
      } else {
        window.location.href = '/';
      }
    });
  }
});