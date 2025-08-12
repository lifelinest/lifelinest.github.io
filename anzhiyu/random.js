var posts=["posts/985f9bfd/","posts/a0f90707/","posts/e6cd93cd/","posts/66ea8cb4/","posts/2d25e1d/","posts/a4b9adb4/","posts/1fddf13f/","posts/d0dc42b8/","posts/6336ac44/","posts/cd7681cc/","posts/bc2ba537/","posts/ab0a1bd1/","posts/85920be9/","posts/343e78a4/","posts/699ead5/","posts/c4efaa0d/","posts/1e3fd2c9/","posts/4536520a/","posts/b25123cd/","posts/868d8faa/","posts/4e9eb22b/","posts/57986b0a/","posts/488b66fb/","posts/f288ca1/","posts/f1de5082/","posts/75eb0785/","posts/bc19d2c1/","posts/538c1c99/","posts/122fb7ad/","posts/3369804f/","posts/89472648/","posts/618f4052/","posts/910dfdcb/","posts/481d113d/","posts/8f4d7f6c/","posts/f2555b7f/","posts/ba9cc685/","posts/327a8d06/","posts/909097d9/","posts/1a2e622e/","posts/a51aefa7/","posts/f56293ec/","posts/6161e3e8/","posts/d8b0d66/","posts/2cbf2bcc/","posts/9fc22798/","posts/c4d3526/","posts/95094afd/","posts/d923f1bb/","posts/68d350e2/","posts/d1874d21/","posts/79b00bbf/","posts/78e63314/","posts/c65bdcca/","posts/9edf104d/","posts/a9fc7482/","posts/c50d6270/","posts/cab7a2a3/","posts/2080dcc7/","posts/dced8aaa/","posts/a6aeac5e/","posts/2d843850/","posts/5c36814b/","posts/afc9406a/"];function toRandomPost(){
    window.location.href='/'+posts[Math.floor(Math.random() * posts.length)];
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