document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('docs-search-input');
  const searchBtn = document.querySelector('.search-btn');
  
  // 自动聚焦搜索框
  setTimeout(() => {
    if(searchInput) searchInput.focus();
  }, 500);
  
  if (searchBtn && searchInput) {
    searchBtn.addEventListener('click', function() {
      const query = searchInput.value.trim();
      if (query) {
        const originalHTML = this.innerHTML;
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 搜索中...';
        this.disabled = true;
        
        setTimeout(() => {
          this.innerHTML = originalHTML;
          this.disabled = false;
          alert(`执行搜索: ${query}`);
        }, 800);
      }
    });
    
    searchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        searchBtn.click();
      }
    });
  }
  
  // 卡片悬停动画
  const modules = document.querySelectorAll('.module-container');
  modules.forEach(module => {
    module.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-10px)';
      this.style.boxShadow = '0 25px 60px rgba(0, 0, 0, 0.18)';
    });
    
    module.addEventListener('mouseleave', function() {
      this.style.transform = '';
      this.style.boxShadow = '';
    });
  });
  
  // 列表项悬停效果
  const listItems = document.querySelectorAll('.feature-list li');
  listItems.forEach(item => {
    item.addEventListener('mouseenter', function() {
      this.style.transform = 'translateX(5px)';
      this.style.color = 'var(--primary-color)';
    });
    
    item.addEventListener('mouseleave', function() {
      this.style.transform = '';
      this.style.color = '';
    });
  });
});