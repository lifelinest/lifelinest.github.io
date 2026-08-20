// 为时间线添加交互效果
document.addEventListener('DOMContentLoaded', function () {
  const timelineItems = document.querySelectorAll('.timeline-content');
  const tags = document.querySelectorAll('.tag');

  // 悬停效果
  timelineItems.forEach(item => {
    item.addEventListener('mouseenter', () => {
      item.style.transform = 'translateY(-8px)';
      item.style.boxShadow = '0 15px 35px rgba(31, 38, 135, 0.25)';
    });

    item.addEventListener('mouseleave', () => {
      item.style.transform = 'translateY(0)';
      item.style.boxShadow = '0 8px 32px rgba(31, 38, 135, 0.15)';
    });
  });

  // 标签效果
  tags.forEach(tag => {
    tag.addEventListener('mouseenter', () => {
      tag.style.transform = 'scale(1.05)';
    });

    tag.addEventListener('mouseleave', () => {
      tag.style.transform = 'scale(1)';
    });
  });
});