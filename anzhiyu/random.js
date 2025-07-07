var posts=["posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html","posts/undefined.html"];function toRandomPost(){
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