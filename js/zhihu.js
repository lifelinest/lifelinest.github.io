document.addEventListener('DOMContentLoaded', function() {
  const zhihuContainer = document.getElementById('zhihu-container');
  if (!zhihuContainer) return;

  // 定义平台API和静态数据
  const platforms = {
    weibo: {
      name: '微博',
      api: 'https://api.nsmao.net/api/hot/query?key=XPYdG7ccICDW47apDHcLzCVHiH&title=%E5%BE%AE%E5%8D%9A',
      backupApi: 'https://api.nsmao.net/api/hot/query?key=XPYdG7ccICDW47apDHcLzCVHiH&title=微博',
      staticData: [
        { title: "#中国女排3-0横扫多米尼加#", url: "https://s.weibo.com/weibo?q=%23中国女排3-0横扫多米尼加%23", hot: "3.2亿" },
        { title: "#奥运冠军全红婵回应成团#", url: "https://s.weibo.com/weibo?q=%23奥运冠军全红婵回应成团%23", hot: "2.8亿" },
        { title: "#中国队金牌总数已超越东京奥运会#", url: "https://s.weibo.com/weibo?q=%23中国队金牌总数已超越东京奥运会%23", hot: "2.5亿" },
        { title: "#巴黎奥运会中国队已获得35枚金牌#", url: "https://s.weibo.com/weibo?q=%23巴黎奥运会中国队已获得35枚金牌%23", hot: "2.1亿" },
        { title: "#张雨霏说这是我最后一届奥运会#", url: "https://s.weibo.com/weibo?q=%23张雨霏说这是我最后一届奥运会%23", hot: "1.9亿" }
      ]
    },
    pengpai: {
      name: '澎湃',
      api: 'https://api.nsmao.net/api/hot/query?key=XPYdG7ccICDW47apDHcLzCVHiH&title=%20%E6%BE%8E%E6%B9%83%E6%96%B0%E9%97%BB',
      backupApi: 'https://api.nsmao.net/api/hot/query?key=XPYdG7ccICDW47apDHcLzCVHiH&title=澎湃新闻',
      staticData: [
        { title: "国家统计局：7月份CPI同比上涨0.5%", url: "https://www.thepaper.cn/newsDetail_forward_23971234", hot: "热度 98" },
        { title: "多地出台新政支持住房消费", url: "https://www.thepaper.cn/newsDetail_forward_23970156", hot: "热度 95" },
        { title: "专家解读7月经济数据：经济回升向好态势没有改变", url: "https://www.thepaper.cn/newsDetail_forward_23969078", hot: "热度 92" },
        { title: "中国女排3-0完胜多米尼加晋级四强", url: "https://www.thepaper.cn/newsDetail_forward_23968123", hot: "热度 90" },
        { title: "多部门部署防汛救灾工作", url: "https://www.thepaper.cn/newsDetail_forward_23967045", hot: "热度 87" }
      ]
    },
    juejin: {
      name: '掘金',
      api: 'https://api.nsmao.net/api/hot/query?key=XPYdG7ccICDW47apDHcLzCVHiH&title=%E7%A8%80%E5%9C%9F%E6%8E%98%E9%87%91%20',
      backupApi: 'https://api.nsmao.net/api/hot/query?key=XPYdG7ccICDW47apDHcLzCVHiH&title=稀土掘金',
      staticData: [
        { title: "Vue3 + TypeScript 最佳实践", url: "https://juejin.cn/post/7123456789", hot: "5421" },
        { title: "React 18 新特性详解", url: "https://juejin.cn/post/7123456788", hot: "4832" },
        { title: "前端性能优化实战指南", url: "https://juejin.cn/post/7123456787", hot: "4215" },
        { title: "深入浅出 WebAssembly", url: "https://juejin.cn/post/7123456786", hot: "3987" },
        { title: "Node.js 微服务架构设计", url: "https://juejin.cn/post/7123456785", hot: "3654" }
      ]
    },
    douyin: {
      name: '抖音',
      api: 'https://api.nsmao.net/api/hot/query?key=XPYdG7ccICDW47apDHcLzCVHiH&title=%20%E6%8A%96%E9%9F%B3',
      backupApi: 'https://api.nsmao.net/api/hot/query?key=XPYdG7ccICDW47apDHcLzCVHiH&title=抖音',
      staticData: [
        { title: "#奥运冠军回国花絮#", url: "https://www.douyin.com/search?keyword=奥运冠军回国花絮", hot: "1.8亿" },
        { title: "#这才是真正的中国式浪漫#", url: "https://www.douyin.com/search?keyword=这才是真正的中国式浪漫", hot: "1.5亿" },
        { title: "#暑期旅游攻略#", url: "https://www.douyin.com/search?keyword=暑期旅游攻略", hot: "1.2亿" },
        { title: "#这些美食太治愈了#", url: "https://www.douyin.com/search?keyword=这些美食太治愈了", hot: "9800万" },
        { title: "#当代年轻人的生活日常#", url: "https://www.douyin.com/search?keyword=当代年轻人的生活日常", hot: "8500万" }
      ]
    }
  };

  // 初始化缓存数据
  const cachedData = {};
  
  // 默认加载微博热搜
  let currentPlatform = 'weibo';
  loadHotData(currentPlatform);
  
  // 添加标签点击事件
  const tabs = document.querySelectorAll('.hot-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const platform = this.getAttribute('data-platform');
      if (platform === currentPlatform) return;
      
      // 更新标签状态
      tabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      
      // 加载新平台数据
      currentPlatform = platform;
      loadHotData(platform);
    });
  });

  // 加载热搜数据函数
  function loadHotData(platform) {
    // 显示加载中状态
    zhihuContainer.innerHTML = `<div class="zhihu-loading">加载${platforms[platform].name}热搜中...</div>`;
    
    // 如果有缓存数据，直接使用
    if (cachedData[platform]) {
      renderData(cachedData[platform], platform);
      return;
    }

    // 使用主API获取数据
    fetch(platforms[platform].api)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP错误! 状态: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log(`${platforms[platform].name}热搜API返回数据:`, data);
        
        if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
          // 缓存数据
          cachedData[platform] = data.data;
          renderData(data.data, platform);
        } else {
          // 如果数据格式不符合预期，尝试使用备用API
          console.error(`${platforms[platform].name}热搜数据格式不符合预期，尝试使用备用API:`, data);
          tryBackupApi(platform);
        }
      })
      .catch(error => {
        console.error(`获取${platforms[platform].name}热搜数据出错，尝试使用备用API:`, error);
        tryBackupApi(platform);
      });
  }

  // 备用API函数
  function tryBackupApi(platform) {
    zhihuContainer.innerHTML = `<div class="zhihu-loading">尝试使用备用API获取${platforms[platform].name}热搜...</div>`;
    
    fetch(platforms[platform].backupApi)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP错误! 状态: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log(`备用API返回${platforms[platform].name}热搜数据:`, data);
        
        if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
          // 缓存数据
          cachedData[platform] = data.data;
          renderData(data.data, platform);
        } else {
          // 如果备用API也失败，使用静态数据
          console.error(`备用API获取${platforms[platform].name}热搜也失败，使用静态数据`);
          useStaticData(platform);
        }
      })
      .catch(backupError => {
        console.error(`备用API获取${platforms[platform].name}热搜数据出错，使用静态数据:`, backupError);
        useStaticData(platform);
      });
  }

  // 使用静态数据的函数
  function useStaticData(platform) {
    console.log(`使用${platforms[platform].name}静态数据`);
    renderData(platforms[platform].staticData, platform);
  }

  // 渲染数据函数
  function renderData(data, platform) {
    let html = '';
    html += '<div class="zhihu-list">';
    let i = 1;
    for (let item of data) {
      if (item && item.title && item.url) {
        html += `<div class="zhihu-list-item">
                  <div class="zhihu-hotness">${i}</div>
                  <span class="zhihu-title">
                    <a title="${item.title}" href="${item.url}" target="_blank" rel="external nofollow noreferrer">
                      ${item.title}
                    </a>
                  </span>
                  <div class="zhihu-hot">
                    <span>${item.hot || ''}</span>
                  </div>
                </div>`;
        i++;
        if (i > 20) break; // 限制显示20条
      }
    }
    html += '</div>';
    zhihuContainer.innerHTML = html;
  }
});
