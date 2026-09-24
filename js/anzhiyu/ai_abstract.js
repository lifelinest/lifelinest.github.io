(function () {
  // 仅需品牌名与本地摘要相关配置（tianli/墨洪AI 相关项已移除）
  const { randomNum, basicWordCount, gptName } = GLOBAL_CONFIG.postHeadAiDescription;

  const { title, postAI, pageFillDescription } = GLOBAL_CONFIG_SITE;

  let lastAiRandomIndex = -1;
  let animationRunning = true;
  let refreshNum = 0;
  let prevParam;
  let isPaused = false;

  const post_ai = document.querySelector(".post-ai-description");
  const aiTitleRefreshIcon = post_ai.querySelector(".ai-title .anzhiyufont.anzhiyu-icon-arrow-rotate-right");
  let aiReadAloudIcon = post_ai.querySelector(".anzhiyu-icon-circle-dot");
  const explanation = post_ai.querySelector(".ai-explanation");

  let aiStr = "";
  let aiStrLength = "";
  let delayInit = 600;
  let indexI = 0;
  let indexJ = 0;
  let timeouts = [];
  let elapsed = 0;

  const observer = createIntersectionObserver();
  const aiFunctions = [introduce, aiTitleRefreshIconClick, aiRecommend, aiGoHome];

  const aiBtnList = post_ai.querySelectorAll(".ai-btn-item");
  aiBtnList.forEach((item, index) => {
    item.addEventListener("click", () => {
      aiFunctions[index]();
    });
  });

  document.getElementById("ai-tag").addEventListener("click", onAiTagClick);
  aiTitleRefreshIcon.addEventListener("click", onAiTitleRefreshIconClick);
  aiReadAloudIcon.addEventListener("click", readAloud);

  async function readAloud() {
    if (!("speechSynthesis" in window)) {
      anzhiyu.snackbarShow("当前浏览器不支持语音朗读～");
      return;
    }
    aiReadAloudIcon = post_ai.querySelector(".anzhiyu-icon-circle-dot");
    const synth = window.speechSynthesis;
    // 正在朗读 → 暂停
    if (synth.speaking && !isPaused) {
      synth.pause();
      isPaused = true;
      aiReadAloudIcon.style.opacity = "0.4";
      return;
    }
    // 已暂停 → 继续
    if (isPaused) {
      synth.resume();
      isPaused = false;
      aiReadAloudIcon.style.cssText = "animation: breathe .5s linear infinite; opacity: 0.2;cursor: pointer;";
      return;
    }
    // 否则 → 从头朗读当前摘要（浏览器内置 TTS：零成本、无任何外部依赖）
    const text = String(aiStr || "").trim();
    if (!text) {
      anzhiyu.snackbarShow("摘要还没加载完呢，请稍后。。。");
      return;
    }
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "zh-CN";
    utter.rate = 1;
    utter.onend = () => {
      isPaused = false;
      aiReadAloudIcon.style.opacity = "1";
      aiReadAloudIcon.style.animation = "";
    };
    synth.speak(utter);
    isPaused = false;
    aiReadAloudIcon.style.cssText = "animation: breathe .5s linear infinite; opacity: 0.2;cursor: pointer;";
  }

  aiAbstract();
  showAiBtn();

  function createIntersectionObserver() {
    return new IntersectionObserver(
      entries => {
        let isVisible = entries[0].isIntersecting;
        animationRunning = isVisible;
        if (animationRunning) {
          delayInit = indexI === 0 ? 200 : 20;
          timeouts[1] = setTimeout(() => {
            if (indexJ) {
              indexI = 0;
              indexJ = 0;
            }
            if (indexI === 0) {
              explanation.innerHTML = aiStr.charAt(0);
            }
            requestAnimationFrame(animate);
          }, delayInit);
        }
      },
      { threshold: 0 }
    );
  }

  function animate(timestamp) {
    if (!animationRunning) {
      return;
    }
    if (!animate.start) animate.start = timestamp;
    elapsed = timestamp - animate.start;
    if (elapsed >= 20) {
      animate.start = timestamp;
      if (indexI < aiStrLength - 1) {
        let char = aiStr.charAt(indexI + 1);
        let delay = /[,.，。!?！？]/.test(char) ? 150 : 20;
        if (explanation.firstElementChild) {
          explanation.removeChild(explanation.firstElementChild);
        }
        explanation.innerHTML += char;
        let div = document.createElement("div");
        div.className = "ai-cursor";
        explanation.appendChild(div);
        indexI++;
        if (delay === 150) {
          post_ai.querySelector(".ai-explanation .ai-cursor").style.opacity = "0.2";
        }
        if (indexI === aiStrLength - 1) {
          observer.disconnect();
          explanation.removeChild(explanation.firstElementChild);
        }
        timeouts[0] = setTimeout(() => {
          requestAnimationFrame(animate);
        }, delay);
      }
    } else {
      requestAnimationFrame(animate);
    }
  }

  function clearTimeouts() {
    if (timeouts.length) {
      timeouts.forEach(item => {
        if (item) {
          clearTimeout(item);
        }
      });
    }
  }

  function startAI(str, df = true) {
    indexI = 0;
    indexJ = 1;
    clearTimeouts();
    animationRunning = false;
    elapsed = 0;
    observer.disconnect();
    explanation.innerHTML = df ? "生成中. . ." : "请等待. . .";
    aiStr = str;
    aiStrLength = aiStr.length;
    observer.observe(post_ai);
  }

  async function aiAbstract() {
    // 仅保留 local：摘要来自构建期写入 front-matter 的 ai: 字段（已移除 tianli/墨洪AI 分支）
    aiAbstractLocal();
  }

  function aiAbstractLocal() {
    const strArr = postAI.split(",").map(item => item.trim());
    if (strArr.length !== 1) {
      let randomIndex = Math.floor(Math.random() * strArr.length);
      while (randomIndex === lastAiRandomIndex) {
        randomIndex = Math.floor(Math.random() * strArr.length);
      }
      lastAiRandomIndex = randomIndex;
      startAI(strArr[randomIndex]);
    } else {
      startAI(strArr[0]);
    }
    setTimeout(() => {
      aiTitleRefreshIcon.style.opacity = "1";
    }, 600);
  }

  function aiRecommend() {
    indexI = 0;
    indexJ = 1;
    clearTimeouts();
    animationRunning = false;
    elapsed = 0;
    explanation.innerHTML = "生成中. . .";
    aiStr = "";
    aiStrLength = "";
    observer.disconnect();
    timeouts[2] = setTimeout(() => {
      explanation.innerHTML = recommendList();
    }, 600);
  }

  function recommendList() {
    let thumbnail = document.querySelectorAll(".relatedPosts-list a");
    if (!thumbnail.length) {
      const cardRecentPost = document.querySelector(".card-widget.card-recent-post");
      if (!cardRecentPost) return "";

      thumbnail = cardRecentPost.querySelectorAll(".aside-list-item a");

      let list = "";
      for (let i = 0; i < thumbnail.length; i++) {
        const item = thumbnail[i];
        list += `<div class="ai-recommend-item"><span class="index">${
          i + 1
        }：</span><a href="javascript:;" onclick="pjax.loadUrl('${item.href}')" title="${
          item.title
        }" data-pjax-state="">${item.title}</a></div>`;
      }

      return `很抱歉，无法找到类似的文章，你也可以看看本站最新发布的文章：<br /><div class="ai-recommend">${list}</div>`;
    }

    let list = "";
    for (let i = 0; i < thumbnail.length; i++) {
      const item = thumbnail[i];
      list += `<div class="ai-recommend-item"><span>推荐${
        i + 1
      }：</span><a href="javascript:;" onclick="pjax.loadUrl('${item.href}')" title="${
        item.title
      }" data-pjax-state="">${item.title}</a></div>`;
    }

    return `推荐文章：<br /><div class="ai-recommend">${list}</div>`;
  }

  function aiGoHome() {
    startAI("正在前往博客主页...", false);
    timeouts[2] = setTimeout(() => {
      if (window.pjax) {
        pjax.loadUrl("/");
      } else {
        location.href = location.origin;
      }
    }, 1000);
  }

  function introduce() {
    startAI(`我是本博客的文章 AI 摘要助手「${gptName}」，只负责当前这一篇；想跨文章提问或了解整个网站，点左下角看板娘，那里是站内管家 LifelineVerve。`);
  }

  function aiTitleRefreshIconClick() {
    aiTitleRefreshIcon.click();
  }

  function onAiTagClick() {
    post_ai.querySelectorAll(".ai-btn-item").forEach(item => (item.style.display = "block"));
    startAI(
      `你好，我是「${gptName}」——本博客的文章 AI 摘要助手，只负责当前这一篇的摘要显示。想了解整个网站、跨文章找内容，点左下角看板娘找站内管家 LifelineVerve。`
    );
  }

  function onAiTitleRefreshIconClick() {
    const truncateDescription = (title + pageFillDescription).trim().substring(0, basicWordCount);

    aiTitleRefreshIcon.style.opacity = "0.2";
    aiTitleRefreshIcon.style.transitionDuration = "0.3s";
    aiTitleRefreshIcon.style.transform = "rotate(" + 360 * refreshNum + "deg)";
    if (truncateDescription.length <= basicWordCount) {
      let param = truncateDescription.length - Math.floor(Math.random() * randomNum);
      while (param === prevParam || truncateDescription.length - param === prevParam) {
        param = truncateDescription.length - Math.floor(Math.random() * randomNum);
      }
      prevParam = param;
      aiAbstract(param);
    } else {
      let value = Math.floor(Math.random() * randomNum) + basicWordCount;
      while (value === prevParam || truncateDescription.length - value === prevParam) {
        value = Math.floor(Math.random() * randomNum) + basicWordCount;
      }
      aiAbstract(value);
    }
    refreshNum++;
  }

  function showAiBtn() {
    document.getElementById("ai-tag").innerHTML = gptName;
  }
})();
