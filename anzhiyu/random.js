var posts=["2024/03/09/11款轻量、简洁、免费无限制内网穿透工具/","2025/03/24/1111/","2024/03/08/2024年最新To浏览器教程及暗网访问指南/","2025/03/27/DeepSeek-Kimi-如何用-AI-颠覆传统-PPT-制作？/","2024/03/06/Hexo+GitHub搭建个人博客教程（2025最新版）/","2024/03/07/Markdown最全基本语法整理-有这一篇就够了/","2025/03/25/除了常见的影视网站，还有哪些小众但优质的资源？/","2024/03/06/Markdown——入门指南/","2023/11/14/红米K305G刷HyperOS1-0系统/","2024/03/08/免费机场公益机场免费VPN/","2024/03/08/火绒杀毒软件的进阶用法/","2025/03/29/如何查看微信撤回的消息？/","2025/03/28/如何防范个人信息被“开盒”？/","2025/03/25/谁偷偷删了我的微信好友？/","2023/11/02/这是我的第一篇博客/","2025/04/11/MCP光速建站，如何做到毫秒级访问？/","2025/04/12/哪些插件能让你的上网效率翻倍？/","2025/04/12/手机旁路充电，真的能解决充电发热问题吗？/","2025/04/13/QuickLook：一款值得拥有的预览软件？/","2025/04/13/云萌Windows-激活与切换真这么简单？/","2025/04/14/通信协议连接世界的语言/","2025/04/15/城市立交：从钢铁迷宫到流动艺术的进化史/","2025/04/16/如何理解MCP通信协议的核心原理？/","2025/04/17/get-jobs真的能提升求职成功率吗？/","2025/04/18/Excalidraw的效率提升之道/","2025/04/19/游戏绘制文件开挂是如何实现的？/","2025/04/20/如何打造合理高效的城市功能分区？/","2025/04/21/如何提升Hexo博客的访问速度？/","2025/04/22/N-比例火车模型藏着多少可玩的惊喜？/","2025/04/23/时间滤镜下的爱情：你爱的是谁？/","2025/04/24/ChatLog-如何挖掘聊天关键信息？/","2025/04/25/百度搜索高能技巧你-get-到了吗？/","2025/04/26/值得尝试的-Tauri-开源图片重命名工具/","2025/04/27/AigcPanel数字人系统真的简单易用？/","2025/04/28/小时候看过的公益广告你还记忆新犹吗？/","2025/04/29/uTools-能否一键开启无限能力？/","2025/04/30/Glance自托管仪表板好用吗？/","2025/05/06/如何在hexo-pro后台打造个性化博客？/","2025/05/07/ImageGlass有哪些图片管理功能？/","2025/05/08/Napkin-AI一款将文本转化为可视化内容的强大工具/","2025/05/10/如何用-Rust-轻松打包网页为多平台桌面应用？/","2025/05/12/保姆级-ADB-实战教程：解锁安卓8大调试场景/","2025/05/13/如何借助流行脚本管理器让浏览器更智能？/","2025/05/14/使用Ventoy制作可启动U盘有多简单？/","2025/05/15/想让小爱触屏音箱-LX04-随意安装-APP？/","2025/05/16/ProcessOn思维导图和流程图怎么用？/","2025/05/18/零基础小白如何开启地铁线路绘图之旅？/","2025/05/19/为什么AI生成的图像文字常常出现乱码？/","2025/05/20/NotebookLM-如何将你的零散信息系统化？/","2025/05/21/如何用Coze创建自动化工作流？/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };var friend_link_list=[{"name":"Hexo","link":"https://hexo.io/zh-tw/","avatar":null,"descr":"快速、简单且强大的网站框架"},{"name":"anzhiyu主题","link":"https://blog.anheyu.com/","avatar":"https://npm.elemecdn.com/anzhiyu-blog-static@1.0.4/img/avatar.jpg","descr":"生活明朗，万物可爱","siteshot":null},{"name":"安知鱼","link":"https://blog.anheyu.com/","avatar":"https://npm.elemecdn.com/anzhiyu-blog-static@1.0.4/img/avatar.jpg","descr":"生活明朗，万物可爱","siteshot":"https://npm.elemecdn.com/anzhiyu-theme-static@1.1.6/img/blog.anheyu.com.jpg","color":"vip","tag":"技术"},{"name":"安知鱼","link":"https://blog.anheyu.com/","avatar":"https://npm.elemecdn.com/anzhiyu-blog-static@1.0.4/img/avatar.jpg","descr":"生活明朗，万物可爱","recommend":true},{"name":"张洪Heo","link":"https://blog.zhheo.com/","avatar":"https://s21.ax1x.com/2025/03/31/pEsvaIU.png","descr":"分享设计与科技生活","recommend":true},{"name":"HiPeach","link":"https://blog.opeach.cn","avatar":"https://npm.elemecdn.com/opicture@1.0.0/main/avatar.webp","descr":"妙不可言","siteshot":"https://npm.webcache.cn/opicture@1.1.2/blog/siteshot/siteshot.webp"},{"name":"chenlei","link":"https://blog.opeach.cn","avatar":"https://img.hellolei.xin/preview.jpg","descr":"Live Long and Prosper!","siteshot":"https://img.hellolei.xin/preview.jpg"}];
    var refreshNum = 1;
    function friendChainRandomTransmission() {
      const randomIndex = Math.floor(Math.random() * friend_link_list.length);
      const { name, link } = friend_link_list.splice(randomIndex, 1)[0];
      Snackbar.show({
        text:
          "点击前往按钮进入随机一个友链，不保证跳转网站的安全性和可用性。本次随机到的是本站友链：「" + name + "」",
        duration: 8000,
        pos: "top-center",
        actionText: "前往",
        onActionClick: function (element) {
          element.style.opacity = 0;
          window.open(link, "_blank");
        },
      });
    }
    function addFriendLinksInFooter() {
      var footerRandomFriendsBtn = document.getElementById("footer-random-friends-btn");
      if(!footerRandomFriendsBtn) return;
      footerRandomFriendsBtn.style.opacity = "0.2";
      footerRandomFriendsBtn.style.transitionDuration = "0.3s";
      footerRandomFriendsBtn.style.transform = "rotate(" + 360 * refreshNum++ + "deg)";
      const finalLinkList = [];
  
      let count = 0;

      while (friend_link_list.length && count < 3) {
        const randomIndex = Math.floor(Math.random() * friend_link_list.length);
        const { name, link, avatar } = friend_link_list.splice(randomIndex, 1)[0];
  
        finalLinkList.push({
          name,
          link,
          avatar,
        });
        count++;
      }
  
      let html = finalLinkList
        .map(({ name, link }) => {
          const returnInfo = "<a class='footer-item' href='" + link + "' target='_blank' rel='noopener nofollow'>" + name + "</a>"
          return returnInfo;
        })
        .join("");
  
      html += "<a class='footer-item' href='/link/'>更多</a>";

      document.getElementById("friend-links-in-footer").innerHTML = html;

      setTimeout(()=>{
        footerRandomFriendsBtn.style.opacity = "1";
      }, 300)
    };