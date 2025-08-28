// 文章朗读功能
class ArticleReader {
  constructor() {
    this.synth = window.speechSynthesis;
    this.utterance = null;
    this.isReading = false;
    this.currentPosition = 0;
    this.voices = [];
    this.selectedVoice = null;
    this.rate = 1.0;
    this.minRate = 0.5;
    this.maxRate = 2.0;
    this.rateStep = 0.25;
    this.articleContent = '';
    this.readingButton = null;
    
    // 滚动控制相关
    this.autoScrollEnabled = true;
    this.lastUserScrollTime = 0;
    this.scrollPauseTime = 2000; // 用户滚动后暂停自动滚动的时间（毫秒）
    
    // 初始化
    this.init();
    
    // 添加页面刷新事件监听
    window.addEventListener('beforeunload', () => this.stopReading());
    
    // 监听用户滚动事件
    window.addEventListener('scroll', () => {
      this.lastUserScrollTime = Date.now();
    }, { passive: true });
    
    // 将实例保存到全局变量中，以便在页面可见性变化时访问
    if (!window._articleReaderInstances) {
      window._articleReaderInstances = [];
    }
    window._articleReaderInstances.push(this);
  }
  
  init() {
    // 等待页面加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
    
    // 监听语音列表加载
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.loadVoices();
    }
    
    // 从本地存储加载用户偏好设置
    this.loadUserPreferences();
  }
  
  loadUserPreferences() {
    // 加载语速设置
    const savedRate = localStorage.getItem('article-reader-rate');
    if (savedRate) {
      this.rate = parseFloat(savedRate);
    }
    
    // 加载自动滚动设置
    const savedAutoScroll = localStorage.getItem('article-reader-auto-scroll');
    if (savedAutoScroll !== null) {
      this.autoScrollEnabled = savedAutoScroll === 'true';
    }
  }
  
  setup() {
    // 仅在文章页面添加朗读功能
    if (!this.isArticlePage()) return;
    
    // 加载可用的语音
    this.loadVoices();
    
    // 获取文章内容
    this.extractArticleContent();
    
    // 创建朗读按钮
    this.createReadingButton();
    
    // 添加事件监听
    this.addEventListeners();
  }
  
  isArticlePage() {
    // 只在 posts/ 路径下的文章页面显示朗读按钮
    const currentPath = window.location.pathname;
    
    // 检查是否为 posts 路径下的文章
    if (!currentPath.includes('/posts/')) {
      return false;
    }
    
    // 检查是否存在文章内容元素
    const selectors = [
      '.post-content',
      '.article-content',
      '.article-entry',
      '.entry-content',
      '#article-container',
      '.post-article'
    ];
    
    for (const selector of selectors) {
      if (document.querySelector(selector) !== null) {
        return true;
      }
    }
    
    return false;
  }
  
  loadVoices() {
    // 获取所有可用的语音
    this.voices = this.synth.getVoices();
    
    // 默认选择中文语音，如果有的话
    this.selectedVoice = this.voices.find(voice => voice.lang.includes('zh')) || 
                         this.voices.find(voice => voice.lang.includes('en-US')) || 
                         this.voices[0];
  }
  
  extractArticleContent() {
    // 尝试多种可能的文章内容区域选择器
    const selectors = [
      '.post-content',
      '.article-content',
      '.article-entry',
      '.entry-content',
      '#article-container',
      '.post-article'
    ];
    
    let contentElement = null;
    for (const selector of selectors) {
      contentElement = document.querySelector(selector);
      if (contentElement) {
        console.log('找到文章内容区域:', selector);
        break;
      }
    }
    
    if (!contentElement) {
      console.error('无法找到文章内容区域');
      return;
    }
    
    // 提取纯文本内容，忽略代码块
    let content = '';
    const paragraphs = contentElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
    paragraphs.forEach(p => {
      // 跳过代码块内的内容
      if (!this.isInsideCodeBlock(p)) {
        content += p.textContent + ' ';
      }
    });
    
    this.articleContent = content.trim();
    console.log('提取的文章内容长度:', this.articleContent.length);
  }
  
  isInsideCodeBlock(element) {
    // 检查元素是否在代码块内
    let parent = element;
    while (parent) {
      if (parent.tagName === 'PRE' || parent.classList.contains('code-block')) {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  }
  
  createReadingButton() {
    // 创建朗读按钮
    this.readingButton = document.createElement('button');
    this.readingButton.className = 'article-reader-btn';
    this.readingButton.innerHTML = '<i class="anzhiyu-icon-volume-high"></i> 朗读文章';
    this.readingButton.title = '朗读文章';
    
    // 查找时间元素
    const timeElements = document.querySelectorAll('time.post-meta-date-updated');
    
    if (timeElements.length > 0) {
      // 找到更新时间元素
      const updateTimeElement = timeElements[0];
      
      // 获取父元素
      const parentElement = updateTimeElement.parentElement;
      
      if (parentElement) {
        // 创建一个容器来放置按钮
        const buttonContainer = document.createElement('span');
        buttonContainer.className = 'article-reader-btn-container';
        buttonContainer.style.marginLeft = '10px';
        buttonContainer.style.display = 'inline-flex';
        buttonContainer.style.alignItems = 'center';
        buttonContainer.style.verticalAlign = 'middle';
        buttonContainer.style.transform = 'translateY(-3px)'; // 向上微调按钮位置
        buttonContainer.appendChild(this.readingButton);
        
        // 将按钮插入到时间元素后面
        parentElement.appendChild(buttonContainer);
        
        console.log('朗读按钮已添加到更新日期元素后面');
        return;
      }
    }
    
    // 尝试查找包含"更新于"文本的元素
    const metaFirstline = document.querySelector('.meta-firstline');
    if (metaFirstline) {
      // 查找所有文本节点
      const textNodes = [];
      const walker = document.createTreeWalker(
        metaFirstline,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      let node;
      while (node = walker.nextNode()) {
        textNodes.push(node);
      }
      
      // 查找包含"更新于"的文本节点
      let updateNode = null;
      for (const node of textNodes) {
        if (node.textContent.includes('更新于')) {
          updateNode = node;
          break;
        }
      }
      
      // 如果找到了包含"更新于"的节点
      if (updateNode) {
        // 获取父元素
        const parentElement = updateNode.parentElement;
        
        // 创建一个容器来放置按钮
        const buttonContainer = document.createElement('span');
        buttonContainer.className = 'article-reader-btn-container';
        buttonContainer.style.marginLeft = '10px';
        buttonContainer.style.display = 'inline-block';
        buttonContainer.appendChild(this.readingButton);
        
        // 将按钮插入到父元素之后
        if (parentElement.nextSibling) {
          parentElement.parentNode.insertBefore(buttonContainer, parentElement.nextSibling);
        } else {
          parentElement.parentNode.appendChild(buttonContainer);
        }
        
        console.log('朗读按钮已添加到更新日期元素后面');
        return;
      }
    }
    
    // 如果上述方法失败，尝试直接插入到post-meta区域
    const postMeta = document.querySelector('#post-meta .meta-firstline');
    if (postMeta) {
      // 创建一个容器来放置按钮
      const buttonContainer = document.createElement('span');
      buttonContainer.className = 'article-reader-btn-container';
      buttonContainer.style.marginLeft = '10px';
      buttonContainer.style.display = 'inline-block';
      buttonContainer.appendChild(this.readingButton);
      
      // 添加分隔符
      const separator = document.createElement('span');
      separator.className = 'post-meta-separator';
      postMeta.appendChild(separator);
      
      // 将按钮添加到meta-firstline中
      postMeta.appendChild(buttonContainer);
      
      console.log('朗读按钮已添加到文章信息区域');
      return;
    }
    
    // 如果所有方法都失败，创建固定位置的按钮
    console.warn('无法找到合适的位置，将创建固定位置的按钮');
    this.readingButton.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      z-index: 99;
      padding: 8px 16px;
      background-color: var(--anzhiyu-main);
      color: white;
      border: none;
      border-radius: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
      transition: all 0.3s ease;
      font-weight: bold;
      font-size: 14px;
    `;
    document.body.appendChild(this.readingButton);
  }
  
  addEventListeners() {
    // 朗读按钮点击事件 - 直接切换朗读状态
    this.readingButton.addEventListener('click', () => {
      if (this.isReading) {
        this.stopReading();
        this.readingButton.innerHTML = '<i class="anzhiyu-icon-volume-high"></i> 朗读文章';
      } else {
        this.startReading();
        this.readingButton.innerHTML = '<i class="anzhiyu-icon-stop"></i> 停止朗读';
      }
    });
  }
  
  startReading(startPosition = 0) {
    if (!this.articleContent) return;
    
    // 停止当前朗读
    this.synth.cancel();
    
    // 创建新的朗读实例
    this.utterance = new SpeechSynthesisUtterance(this.articleContent);
    
    // 设置语音
    if (this.selectedVoice) {
      this.utterance.voice = this.selectedVoice;
    }
    
    // 设置语速
    this.utterance.rate = this.rate;
    
    // 设置开始位置
    if (startPosition > 0) {
      const textBefore = this.articleContent.substring(0, startPosition);
      const textAfter = this.articleContent.substring(startPosition);
      this.utterance.text = textAfter;
    }
    
    // 记录当前位置
    this.currentPosition = startPosition;
    
    // 创建或获取朗读提示元素
    this.createOrUpdateReadingIndicator();
    
    // 设置事件监听
    this.utterance.onend = () => {
      this.isReading = false;
      this.currentPosition = 0;
      
      // 更新按钮状态
      this.readingButton.innerHTML = '<i class="anzhiyu-icon-volume-high"></i> 朗读文章';
      
      // 移除朗读提示
      this.removeReadingIndicator();
    };
    
    // 添加朗读进度事件
    this.utterance.onboundary = (event) => {
      if (event.name === 'word') {
        // 更新当前朗读位置，需要加上起始位置的偏移
        this.updateReadingPosition(startPosition + event.charIndex);
      }
    };
    
    // 开始朗读
    this.synth.speak(this.utterance);
    this.isReading = true;
    
    // 立即高亮显示当前位置，不等待第一个boundary事件
    this.highlightCurrentParagraph();
  }
  
  createOrUpdateReadingIndicator() {
    // 检查是否已存在提示元素
    let indicator = document.getElementById('article-reading-indicator');
    
    if (!indicator) {
      // 创建朗读提示元素
      indicator = document.createElement('div');
      indicator.id = 'article-reading-indicator';
      indicator.className = 'article-reading-indicator';
      
      // 创建垂直布局容器
      const verticalContainer = document.createElement('div');
      verticalContainer.className = 'vertical-container';
      
      // 创建内容容器（上部分）
      const contentDiv = document.createElement('div');
      contentDiv.className = 'indicator-content';
      contentDiv.innerHTML = '<i class="anzhiyu-icon-volume-high"></i> 朗读中';
      verticalContainer.appendChild(contentDiv);
      
      // 创建控制容器（下部分）
      const controlsDiv = document.createElement('div');
      controlsDiv.className = 'indicator-controls';
      
      // 添加语速控制按钮
      const speedControls = document.createElement('div');
      speedControls.className = 'speed-controls';
      
      // 语速显示和控制按钮
      const rateDisplay = document.createElement('button');
      rateDisplay.className = 'rate-display';
      rateDisplay.textContent = `${this.rate.toFixed(1)}x`;
      rateDisplay.id = 'rate-display';
      rateDisplay.title = '点击切换语速';
      
      // 预设语速选项
      const speedOptions = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
      let currentSpeedIndex = speedOptions.indexOf(this.rate);
      if (currentSpeedIndex === -1) {
        // 如果当前语速不在预设选项中，找到最接近的值
        currentSpeedIndex = speedOptions.findIndex(speed => speed >= this.rate);
        if (currentSpeedIndex === -1) currentSpeedIndex = speedOptions.length - 1;
      }
      
      // 点击语速显示切换语速
      rateDisplay.addEventListener('click', () => {
        // 循环切换到下一个语速选项
        currentSpeedIndex = (currentSpeedIndex + 1) % speedOptions.length;
        this.rate = speedOptions[currentSpeedIndex];
        
        this.updateRateDisplay();
        
        // 如果正在朗读，需要停止并以新速度重新开始
        if (this.utterance && this.isReading) {
          // 保存当前位置
          const currentPosition = this.currentPosition;
          // 停止当前朗读
          this.synth.cancel();
          // 以新速度重新开始朗读，使用最小延迟
          setTimeout(() => {
            this.startReading(currentPosition);
          }, 10); // 极短延迟，几乎无感知
        }
      });
      
      // 添加语速控制到控制容器
      speedControls.appendChild(rateDisplay);
      
      // 添加自动滚动开关
      const toggleButton = document.createElement('button');
      toggleButton.className = 'auto-scroll-toggle';
      toggleButton.innerHTML = this.autoScrollEnabled ? 
        '<i class="anzhiyu-icon-eye"></i>' : 
        '<i class="anzhiyu-icon-eye-slash"></i>';
      toggleButton.title = this.autoScrollEnabled ? '关闭自动滚动' : '开启自动滚动';
      
      toggleButton.addEventListener('click', () => {
        this.autoScrollEnabled = !this.autoScrollEnabled;
        toggleButton.innerHTML = this.autoScrollEnabled ? 
          '<i class="anzhiyu-icon-eye"></i>' : 
          '<i class="anzhiyu-icon-eye-slash"></i>';
        toggleButton.title = this.autoScrollEnabled ? '关闭自动滚动' : '开启自动滚动';
        
        // 保存用户偏好
        localStorage.setItem('article-reader-auto-scroll', this.autoScrollEnabled ? 'true' : 'false');
      });
      
      // 将控制元素添加到下部分
      const controlsRow = document.createElement('div');
      controlsRow.className = 'controls-row';
      controlsRow.appendChild(speedControls);
      controlsDiv.appendChild(controlsRow);
      
      // 将下部分添加到垂直容器
      verticalContainer.appendChild(controlsDiv);
      
      // 将垂直容器添加到主容器
      indicator.appendChild(verticalContainer);
      document.body.appendChild(indicator);
      
      // 添加样式
      const style = document.createElement('style');
      style.textContent = `
        .article-reading-indicator {
          position: fixed;
          bottom: 20px;
          right: 0;
          background-color: var(--anzhiyu-main);
          color: white;
          padding: 10px 15px;
          border-radius: 20px 0 0 20px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          z-index: 999;
          font-size: 14px;
          transition: all 0.3s ease;
        }
        .vertical-container {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .indicator-content {
          display: flex;
          align-items: center;
          gap: 8px;
          justify-content: center;
        }
        .indicator-content i {
          animation: pulse 1.5s infinite;
        }
        .indicator-controls {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .controls-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .speed-controls {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .rate-display {
          font-size: 12px;
          width: 40px;
          text-align: center;
          background: rgba(255, 255, 255, 0.2);
          border: none;
          border-radius: 12px;
          color: white;
          cursor: pointer;
          padding: 2px 8px;
          transition: all 0.2s ease;
          margin: 0 auto;
          display: block;
        }
        .rate-display:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: scale(1.1);
        }
        .auto-scroll-toggle {
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          padding: 0 5px;
          font-size: 16px;
          opacity: 0.8;
          transition: all 0.3s ease;
        }
        .auto-scroll-toggle:hover {
          opacity: 1;
          transform: scale(1.1);
        }
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
    
    // 显示提示元素
    indicator.style.display = 'block';
  }
  
  updateRateDisplay() {
    // 更新语速显示
    const rateDisplay = document.getElementById('rate-display');
    if (rateDisplay) {
      rateDisplay.textContent = `${this.rate.toFixed(1)}x`;
    }
    
    // 保存用户偏好
    localStorage.setItem('article-reader-rate', this.rate.toString());
  }
  
  updateReadingPosition(charIndex) {
    // 更新当前朗读位置
    this.currentPosition = charIndex;
    
    // 尝试高亮当前朗读的段落
    this.highlightCurrentParagraph();
  }
  
  highlightCurrentParagraph() {
    // 获取文章内容区域
    const contentSelectors = [
      '.post-content',
      '.article-content',
      '.article-entry',
      '.entry-content',
      '#article-container',
      '.post-article'
    ];
    
    let contentElement = null;
    for (const selector of contentSelectors) {
      contentElement = document.querySelector(selector);
      if (contentElement) break;
    }
    
    if (!contentElement) return;
    
    // 移除之前的高亮和波浪线
    const previousHighlight = document.querySelector('.article-reading-highlight');
    if (previousHighlight) {
      previousHighlight.classList.remove('article-reading-highlight');
    }
    
    // 移除之前的句子波浪线
    const previousSentenceUnderline = document.querySelector('.article-reading-sentence');
    if (previousSentenceUnderline) {
      const parent = previousSentenceUnderline.parentElement;
      if (parent) {
        parent.innerHTML = parent.innerHTML.replace(/<span class="article-reading-sentence">([^<]+)<\/span>/g, '$1');
      }
    }
    
    // 获取所有段落
    const paragraphs = contentElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
    
    // 计算每个段落的文本长度，找到当前朗读的段落
    let accumulatedLength = 0;
    for (const paragraph of paragraphs) {
      // 跳过代码块内的内容
      if (this.isInsideCodeBlock(paragraph)) continue;
      
      const paragraphLength = paragraph.textContent.length;
      
      if (accumulatedLength <= this.currentPosition && 
          this.currentPosition < accumulatedLength + paragraphLength) {
        // 找到当前朗读的段落，添加高亮样式
        paragraph.classList.add('article-reading-highlight');
        
        // 计算当前句子在段落中的位置
        const paragraphText = paragraph.textContent;
        const relativePosition = this.currentPosition - accumulatedLength;
        
        // 查找当前句子的开始和结束位置
        // 使用中文句号、英文句号、问号、感叹号等作为句子分隔符
        const sentenceDelimiters = ['.', '。', '!', '！', '?', '？', ';', '；'];
        
        // 找到当前位置之前的最后一个分隔符
        let sentenceStart = 0;
        for (let i = relativePosition - 1; i >= 0; i--) {
          if (sentenceDelimiters.includes(paragraphText[i])) {
            sentenceStart = i + 1;
            break;
          }
        }
        
        // 找到当前位置之后的第一个分隔符
        let sentenceEnd = paragraphText.length;
        for (let i = relativePosition; i < paragraphText.length; i++) {
          if (sentenceDelimiters.includes(paragraphText[i])) {
            sentenceEnd = i + 1;
            break;
          }
        }
        
        // 获取当前句子
        const currentSentence = paragraphText.substring(sentenceStart, sentenceEnd);
        
        // 在段落中标记当前句子
        if (currentSentence.trim().length > 0) {
          // 创建一个文本节点的范围，用于查找和替换
          const textNodes = [];
          const walker = document.createTreeWalker(
            paragraph,
            NodeFilter.SHOW_TEXT,
            null,
            false
          );
          
          let node;
          while (node = walker.nextNode()) {
            textNodes.push(node);
          }
          
          // 在文本节点中查找当前句子
          for (const textNode of textNodes) {
            const nodeText = textNode.nodeValue;
            const sentenceIndex = nodeText.indexOf(currentSentence);
            
            if (sentenceIndex !== -1) {
              // 将文本节点分割，并用带波浪线的span替换当前句子
              const beforeText = nodeText.substring(0, sentenceIndex);
              const afterText = nodeText.substring(sentenceIndex + currentSentence.length);
              
              const spanElement = document.createElement('span');
              spanElement.className = 'article-reading-sentence';
              spanElement.textContent = currentSentence;
              
              // 替换文本节点
              const fragment = document.createDocumentFragment();
              if (beforeText) {
                fragment.appendChild(document.createTextNode(beforeText));
              }
              fragment.appendChild(spanElement);
              if (afterText) {
                fragment.appendChild(document.createTextNode(afterText));
              }
              
              textNode.parentNode.replaceChild(fragment, textNode);
              break;
            }
          }
        }
        
        // 添加高亮和波浪线样式
        if (!document.getElementById('reading-highlight-style')) {
          const style = document.createElement('style');
          style.id = 'reading-highlight-style';
          style.textContent = `
            .article-reading-highlight {
              background-color: rgba(var(--anzhiyu-main-rgb), 0.1);
              border-left: 3px solid var(--anzhiyu-main);
              padding-left: 10px;
              transition: all 0.3s ease;
            }
            .article-reading-sentence {
              text-decoration: wavy underline var(--anzhiyu-main);
              text-decoration-thickness: 2px;
              text-underline-offset: 4px;
            }
          `;
          document.head.appendChild(style);
        }
        
        // 只有在自动滚动启用且用户最近没有手动滚动时才自动滚动
        const currentTime = Date.now();
        if (this.autoScrollEnabled && (currentTime - this.lastUserScrollTime > this.scrollPauseTime)) {
          paragraph.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        break;
      }
      
      accumulatedLength += paragraphLength + 1; // +1 for space
    }
  }
  
  removeReadingIndicator() {
    // 移除朗读提示元素
    const indicator = document.getElementById('article-reading-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
    
    // 移除高亮
    const highlight = document.querySelector('.article-reading-highlight');
    if (highlight) {
      highlight.classList.remove('article-reading-highlight');
    }
    
    // 移除所有句子波浪线
    const sentenceUnderlines = document.querySelectorAll('.article-reading-sentence');
    sentenceUnderlines.forEach(el => {
      const parent = el.parentElement;
      if (parent) {
        const text = el.textContent;
        const textNode = document.createTextNode(text);
        parent.replaceChild(textNode, el);
      }
    });
  }
  
  stopReading() {
    this.synth.cancel();
    this.isReading = false;
    this.currentPosition = 0;
    
    // 移除朗读提示
    this.removeReadingIndicator();
  }
}

// 初始化文章朗读功能
document.addEventListener('DOMContentLoaded', () => {
  // 检查浏览器是否支持语音合成
  if ('speechSynthesis' in window) {
    // 确保页面加载时停止任何可能正在进行的朗读
    window.speechSynthesis.cancel();
    new ArticleReader();
  }
});

// 支持PJAX
document.addEventListener('pjax:complete', () => {
  if ('speechSynthesis' in window) {
    // 确保PJAX页面切换时停止任何可能正在进行的朗读
    window.speechSynthesis.cancel();
    new ArticleReader();
  }
});

// 页面可见性变化时处理朗读状态
document.addEventListener('visibilitychange', () => {
  // 获取当前实例
  const articleReaderInstances = window._articleReaderInstances || [];
  const currentReader = articleReaderInstances[0];
  
  if (document.visibilityState === 'hidden') {
    // 页面不可见时暂停朗读
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      // 保存当前朗读状态和位置
      if (currentReader && currentReader.isReading) {
        // 保存当前位置到localStorage
        localStorage.setItem('article-reader-position', currentReader.currentPosition);
        localStorage.setItem('article-reader-was-reading', 'true');
        localStorage.setItem('article-reader-url', window.location.href);
        
        // 暂停朗读
        window.speechSynthesis.pause();
      }
    }
  } else if (document.visibilityState === 'visible') {
    // 页面重新可见时恢复朗读
    if (window.speechSynthesis && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    
    // 检查是否需要重新开始朗读（如果已经超时或浏览器停止了朗读）
    setTimeout(() => {
      // 确保是同一个URL（同一篇文章）
      if (currentReader && 
          localStorage.getItem('article-reader-was-reading') === 'true' && 
          localStorage.getItem('article-reader-url') === window.location.href) {
        
        // 检查是否真的还在朗读
        if (!window.speechSynthesis.speaking) {
          console.log('检测到标签页切换后朗读停止，正在恢复朗读...');
          // 获取保存的位置
          const savedPosition = parseInt(localStorage.getItem('article-reader-position') || '0');
          
          // 重新开始朗读
          currentReader.startReading(savedPosition);
          
          // 更新按钮状态
          if (currentReader.readingButton) {
            currentReader.readingButton.innerHTML = '<i class="anzhiyu-icon-stop"></i> 停止朗读';
          }
        }
      }
    }, 300); // 增加延迟，确保状态已更新
  }
});
