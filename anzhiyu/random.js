var posts=["posts/985f9bfd/","posts/a0f90707/","posts/e6cd93cd/","posts/66ea8cb4/","posts/2d25e1d/","posts/a4b9adb4/","posts/1fddf13f/","posts/d0dc42b8/","posts/6336ac44/","posts/cd7681cc/","posts/bc2ba537/","posts/ab0a1bd1/","posts/85920be9/","posts/343e78a4/","posts/699ead5/","posts/c4efaa0d/","posts/1e3fd2c9/","posts/4536520a/","posts/b25123cd/","posts/868d8faa/","posts/4e9eb22b/","posts/57986b0a/","posts/488b66fb/","posts/f288ca1/","posts/f1de5082/","posts/75eb0785/","posts/bc19d2c1/","posts/538c1c99/","posts/122fb7ad/","posts/3369804f/","posts/89472648/","posts/618f4052/","posts/910dfdcb/","posts/481d113d/","posts/8f4d7f6c/","posts/f2555b7f/","posts/ba9cc685/","posts/327a8d06/","posts/909097d9/","posts/1a2e622e/","posts/a51aefa7/","posts/f56293ec/","posts/6161e3e8/","posts/d8b0d66/","posts/2cbf2bcc/","posts/9fc22798/","posts/c4d3526/","posts/95094afd/","posts/d923f1bb/","posts/68d350e2/","posts/d1874d21/","posts/79b00bbf/","posts/78e63314/","posts/c65bdcca/","posts/9edf104d/","posts/a9fc7482/","posts/c50d6270/","posts/cab7a2a3/","posts/2080dcc7/","posts/dced8aaa/","posts/a6aeac5e/","posts/2d843850/","posts/5c36814b/","posts/afc9406a/","posts/28d7b030/","posts/7d5f095a/","posts/a144abe9/","posts/test123456/"];function toRandomPost(){
    window.location.href='/'+posts[Math.floor(Math.random() * posts.length)];
  };var friend_link_list=[{"name":"Hexo","link":"https://hexo.io/zh-tw/","avatar":null,"descr":"快速、简单且强大的网站框架"},{"name":"anzhiyu主题","link":"https://blog.anheyu.com/","avatar":"https://npm.elemecdn.com/anzhiyu-blog-static@1.0.4/img/avatar.jpg","descr":"生活明朗，万物可爱","siteshot":null},{"name":"安知鱼","link":"https://blog.anheyu.com/","avatar":"https://npm.elemecdn.com/anzhiyu-blog-static@1.0.4/img/avatar.jpg","descr":"生活明朗，万物可爱","siteshot":"https://npm.elemecdn.com/anzhiyu-theme-static@1.1.6/img/blog.anheyu.com.jpg","color":"vip","tag":"技术"},{"name":"安知鱼","link":"https://blog.anheyu.com/","avatar":"https://npm.elemecdn.com/anzhiyu-blog-static@1.0.4/img/avatar.jpg","descr":"生活明朗，万物可爱","recommend":true},{"name":"张洪Heo","link":"https://blog.zhheo.com/","avatar":"https://s21.ax1x.com/2025/03/31/pEsvaIU.png","descr":"分享设计与科技生活","recommend":true},{"name":"HiPeach","link":"https://blog.opeach.cn","avatar":"https://npm.elemecdn.com/opicture@1.0.0/main/avatar.webp","descr":"妙不可言","siteshot":"https://npm.webcache.cn/opicture@1.1.2/blog/siteshot/siteshot.webp"},{"name":"Calyee","link":"https://blog.calyee.top/","avatar":"https://blog.calyee.top/img/avatar.jpg","descr":"追求充实，分享快乐","siteshot":"https://blog.calyee.top/img/siteshot.webp"},{"name":"FrWalker","link":"https://blog.frwalker.top/","avatar":"http://blog.frwalker.top/favicon.ico","descr":"听风雨，问星辰，随心归✨","siteshot":"https://blog.frwalker.top/siteshot.webp"},{"name":"Yeppioo","link":"https://blog.yeppioo.vip/","avatar":"https://blog.yeppioo.vip/static/img/avatar.png","descr":"梦想成为庄稼地里的读书人.....","siteshot":"https://blog.yeppioo.vip/static/img/screenshot.png"},{"name":"小赵の破宅","link":"https://www.ziyis.cn","avatar":"http://doc.ziyis.cn/avatar.jpg","descr":"让美好持续发生.","siteshot":null},{"name":"青桔气球","link":"https://blog.qjqq.cn/","avatar":"https://q2.qlogo.cn/headimg_dl?dst_uin=1645253&spec=640","descr":"分享网络安全与科技生活","siteshot":"https://q2.qlogo.cn/headimg_dl?dst_uin=1645253&spec=640"},{"name":"前尘小筑","link":"https://mnchen.cn/","avatar":"https://image.mnchen.cn/2023/12/mnochen.jpg","descr":"虽多尘色染，犹见墨痕浓","siteshot":null},{"name":"Aurielの小破站","link":"https://www.auriel.top/","avatar":"https://blog.auriel.top/img/avatar.png","descr":"生活的最佳状态，是冷冷清清的风风火火","siteshot":null},{"name":"未央の童话镇","link":"https://forever97.top","avatar":"https://forever97-picture-bed.oss-cn-hangzhou.aliyuncs.com/img/avatar.png","descr":"在人海里梦游","siteshot":"https://cdn.jsdelivr.net/gh/Akilarlxh/ScreenShot@gh-pages/forever97.top.jpg"},{"name":"安小歪","link":"https://blog.anxy.top/","avatar":"https://imgse.koxiuqiu.cc/imgse/u/19/2025/02/20/67b737d854192.webp","descr":"记住你！自己！","siteshot":"https://imgse.koxiuqiu.cc/imgse/u/19/2025/02/20/67b739bef3f9c.png"},{"name":"幻雪的博客","link":"https://huanxueblog.top/","avatar":"https://testingcf.jsdelivr.net/gh/huanxueshengmou/picture-host/huanxueblog_avatar.webp","descr":"腐烂于花海，致死于所爱","siteshot":"https://testingcf.jsdelivr.net/gh/huanxueshengmou/picture-host/huanxueblog_background.png"}];
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