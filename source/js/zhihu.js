document.addEventListener('DOMContentLoaded', function() {
  const zhihuContainer = document.getElementById('zhihu-container');
  if (!zhihuContainer) return;

  // 奶思喵API已下线，vvhan API存在SSL证书问题，使用静态数据
  const platforms = {
    weibo: {
      name: '微博',
      data: [
        { title: "#中国女排3-0横扫多米尼加#", url: "https://s.weibo.com/weibo?q=%23中国女排3-0横扫多米尼加%23", hot: "3.2亿" },
        { title: "#奥运冠军全红婵回应成团#", url: "https://s.weibo.com/weibo?q=%23奥运冠军全红婵回应成团%23", hot: "2.8亿" },
        { title: "#中国队金牌总数已超越东京奥运会#", url: "https://s.weibo.com/weibo?q=%23中国队金牌总数已超越东京奥运会%23", hot: "2.5亿" },
        { title: "#巴黎奥运会中国队已获得35枚金牌#", url: "https://s.weibo.com/weibo?q=%23巴黎奥运会中国队已获得35枚金牌%23", hot: "2.1亿" },
        { title: "#张雨霏说这是我最后一届奥运会#", url: "https://s.weibo.com/weibo?q=%23张雨霏说这是我最后一届奥运会%23", hot: "1.9亿" },
        { title: "#多地出台新政支持住房消费#", url: "https://s.weibo.com/weibo?q=%23多地出台新政支持住房消费%23", hot: "1.7亿" },
        { title: "#暑期旅游攻略#", url: "https://s.weibo.com/weibo?q=%23暑期旅游攻略%23", hot: "1.5亿" },
        { title: "#这些美食太治愈了#", url: "https://s.weibo.com/weibo?q=%23这些美食太治愈了%23", hot: "1.3亿" },
        { title: "#多部门部署防汛救灾工作#", url: "https://s.weibo.com/weibo?q=%23多部门部署防汛救灾工作%23", hot: "1.1亿" },
        { title: "#专家解读7月经济数据#", url: "https://s.weibo.com/weibo?q=%23专家解读7月经济数据%23", hot: "9800万" }
      ]
    },
    pengpai: {
      name: '澎湃',
      data: [
        { title: "国家统计局：7月份CPI同比上涨0.5%", url: "https://www.thepaper.cn/newsDetail_forward_23971234", hot: "热度 98" },
        { title: "多地出台新政支持住房消费", url: "https://www.thepaper.cn/newsDetail_forward_23970156", hot: "热度 95" },
        { title: "专家解读7月经济数据：经济回升向好态势没有改变", url: "https://www.thepaper.cn/newsDetail_forward_23969078", hot: "热度 92" },
        { title: "中国女排3-0完胜多米尼加晋级四强", url: "https://www.thepaper.cn/newsDetail_forward_23968123", hot: "热度 90" },
        { title: "多部门部署防汛救灾工作", url: "https://www.thepaper.cn/newsDetail_forward_23967045", hot: "热度 87" },
        { title: "人工智能赋能制造业转型", url: "https://www.thepaper.cn/newsDetail_forward_23966001", hot: "热度 85" },
        { title: "新能源汽车销量创新高", url: "https://www.thepaper.cn/newsDetail_forward_23965002", hot: "热度 82" },
        { title: "乡村振兴战略取得新成效", url: "https://www.thepaper.cn/newsDetail_forward_23964003", hot: "热度 80" },
        { title: "高校毕业生就业政策解读", url: "https://www.thepaper.cn/newsDetail_forward_23963004", hot: "热度 78" },
        { title: "数字经济发展势头强劲", url: "https://www.thepaper.cn/newsDetail_forward_23962005", hot: "热度 76" }
      ]
    },
    juejin: {
      name: '掘金',
      data: [
        { title: "Vue3 + TypeScript 最佳实践", url: "https://juejin.cn/post/7123456789", hot: "5421" },
        { title: "React 18 新特性详解", url: "https://juejin.cn/post/7123456788", hot: "4832" },
        { title: "前端性能优化实战指南", url: "https://juejin.cn/post/7123456787", hot: "4215" },
        { title: "深入浅出 WebAssembly", url: "https://juejin.cn/post/7123456786", hot: "3987" },
        { title: "Node.js 微服务架构设计", url: "https://juejin.cn/post/7123456785", hot: "3654" },
        { title: "Rust 入门指南与实践", url: "https://juejin.cn/post/7123456784", hot: "3421" },
        { title: "Kubernetes 从入门到精通", url: "https://juejin.cn/post/7123456783", hot: "3187" },
        { title: "Flutter 跨平台开发实战", url: "https://juejin.cn/post/7123456782", hot: "2976" },
        { title: "Python 数据分析与可视化", url: "https://juejin.cn/post/7123456781", hot: "2754" },
        { title: "GraphQL 完整教程", url: "https://juejin.cn/post/7123456780", hot: "2532" }
      ]
    },
    douyin: {
      name: '抖音',
      data: [
        { title: "#奥运冠军回国花絮#", url: "https://www.douyin.com/search?keyword=奥运冠军回国花絮", hot: "1.8亿" },
        { title: "#这才是真正的中国式浪漫#", url: "https://www.douyin.com/search?keyword=这才是真正的中国式浪漫", hot: "1.5亿" },
        { title: "#暑期旅游攻略#", url: "https://www.douyin.com/search?keyword=暑期旅游攻略", hot: "1.2亿" },
        { title: "#这些美食太治愈了#", url: "https://www.douyin.com/search?keyword=这些美食太治愈了", hot: "9800万" },
        { title: "#当代年轻人的生活日常#", url: "https://www.douyin.com/search?keyword=当代年轻人的生活日常", hot: "8500万" },
        { title: "#猫咪的日常#", url: "https://www.douyin.com/search?keyword=猫咪的日常", hot: "7200万" },
        { title: "#健身打卡挑战#", url: "https://www.douyin.com/search?keyword=健身打卡挑战", hot: "6800万" },
        { title: "#手工DIY教程#", url: "https://www.douyin.com/search?keyword=手工DIY教程", hot: "5500万" },
        { title: "#智能家居好物推荐#", url: "https://www.douyin.com/search?keyword=智能家居好物推荐", hot: "4200万" },
        { title: "#旅行Vlog分享#", url: "https://www.douyin.com/search?keyword=旅行Vlog分享", hot: "3800万" }
      ]
    }
  };

  // 默认加载微博热搜
  let currentPlatform = 'weibo';
  renderData(platforms[currentPlatform].data, currentPlatform);

  // 添加标签点击事件
  const tabs = document.querySelectorAll('.hot-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const platform = this.getAttribute('data-platform');
      if (platform === currentPlatform) return;
      
      tabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      
      currentPlatform = platform;
      renderData(platforms[platform].data, platform);
    });
  });

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
        if (i > 20) break;
      }
    }
    html += '</div>';
    zhihuContainer.innerHTML = html;
  }
});
