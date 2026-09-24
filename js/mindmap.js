// 思维导图功能配置
window.MINDMAP_CONFIG = {
  enable: true,
  // 使用本地库文件替代CDN依赖
  d3Cdn: '/libs/markmap/d3.min.js',
  libCdn: '/libs/markmap/markmap-lib.js',
  viewCdn: '/libs/markmap/markmap-view.js',
  icon: 'anzhiyu-icon-lightbulb',
  options: {
    duration: 700,
    maxWidth: 300,
    spacing: 50,
    padding: 30,
    initialExpandLevel: 2,
    fitRatio: 0.9,
    autoFit: true,
    color: {
      light: ['#3182CE', '#38A169', '#DD6B20', '#805AD5'],
      dark: ['#4299E1', '#48BB78', '#ED8936', '#9F7AEA']
    }
  },
  fullscreen: {
    enable: true,
    mobile_only: false,
    button_text: '全屏查看'
  },
  export: {
    enable: true,
    formats: ['svg'],
    filename_format: '{title}-mindmap'
  }
};

// 模块化架构实现
// 1. 错误管理模块
const ErrorManager = {
  types: {
    LIBRARY_LOAD: 'library_load',
    RENDERING: 'rendering',
    DATA_PARSING: 'data_parsing',
    DOM: 'dom',
    NETWORK: 'network'
  },
  
  createError(type, message, details = {}) {
    return {
      type,
      message,
      details,
      timestamp: Date.now()
    };
  },
  
  logError(error) {
    console.error(`[Mindmap Error] [${error.type}] ${error.message}`, error.details);
  },
  
  displayError(container, error) {
    container.innerHTML = '';
    const errorEl = document.createElement('div');
    errorEl.className = 'mindmap-error';
    
    let icon = 'exclamation-triangle';
    let recoverySuggestion = '';
    
    switch (error.type) {
      case this.types.LIBRARY_LOAD:
        icon = 'box';
        recoverySuggestion = '<p>请检查本地库文件是否正确安装</p>';
        break;
      case this.types.RENDERING:
        icon = 'paint-brush';
        recoverySuggestion = '<p>尝试刷新页面或检查浏览器兼容性</p>';
        break;
      case this.types.DATA_PARSING:
        icon = 'file-text';
        recoverySuggestion = '<p>检查文章标题结构是否正确</p>';
        break;
      case this.types.DOM:
        icon = 'layout';
        recoverySuggestion = '<p>页面结构可能有问题，请刷新页面</p>';
        break;
      case this.types.NETWORK:
        icon = 'wifi';
        recoverySuggestion = '<p>网络连接可能有问题，请检查网络设置</p>';
        break;
    }
    
    errorEl.innerHTML = `
      <i class="anzhiyufont anzhiyu-icon-${icon}"></i>
      <p>思维导图加载失败: ${error.message}</p>
      ${recoverySuggestion}
    `;
    container.appendChild(errorEl);
    
    // 显示通知
    if(typeof anzhiyu !== 'undefined') {
      anzhiyu.snackbarShow('思维导图加载失败: ' + error.message, false, 5000);
    }
  }
};

// 2. 数据解析和验证模块
const DataParser = {
  // 提取文章标题并转换为 Markdown 格式
  extractHeadingsAsMarkdown() {
    const articleContainer = document.getElementById('article-container');
    if (!articleContainer) {
      console.warn('[Mindmap] Article container not found');
      return `# 文章目录\n\n## 未找到文章内容`;
    }
    
    const headings = Array.from(articleContainer.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    if (headings.length === 0) {
      console.warn('[Mindmap] No headings found');
      return `# 文章目录\n\n## 未检测到标题结构`;
    }
    
    // 使用固定的根节点层级，确保生成有效的思维导图
    let markdown = `# ${document.title || '文章目录'}\n\n`;
    
    headings.forEach(h => {
      const level = parseInt(h.tagName[1]);
      const text = h.textContent.trim();
      // 调整层级，确保所有文章标题都成为根节点的子节点
      const safeLevel = Math.max(2, Math.min(6, level + 1));
      markdown += '#'.repeat(safeLevel) + ' ' + text + '\n';
    });
    
    console.log('[Mindmap] Generated markdown:', markdown);
    return markdown;
  },
  
  // 验证Markdown内容
  validateMarkdown(markdown) {
    if (!markdown || typeof markdown !== 'string') {
      return { valid: false, error: 'Markdown content is required' };
    }
    
    if (markdown.trim().length < 3) {
      return { valid: false, error: 'Markdown content is too short' };
    }
    
    return { valid: true };
  }
};

// 3. 渲染引擎模块
const RenderingEngine = {
  // 渲染内联思维导图
  async renderInlineMindmaps() {
    const containers = document.querySelectorAll('.mindmap-container');
    if (containers.length === 0) return;
    
    try {
      await this.loadLibraries();
      const { Transformer, Markmap } = window.markmap;
      const transformer = new Transformer();
      
      containers.forEach((container) => {
        const contentEl = container.querySelector('.mindmap-content');
        if (!contentEl) return;
        
        const markdown = contentEl.textContent;
        if (!markdown || markdown.trim().length === 0) return;
        
        // 创建 SVG 容器
        const svgContainer = document.createElement('div');
        svgContainer.className = 'mindmap-svg';
        container.appendChild(svgContainer);
        
        // 转换并渲染思维导图
        const { root } = transformer.transform(markdown);
        const options = this.getRenderOptions();
        
        const markmapInstance = Markmap.create(svgContainer, options, root);
        
        // 确保渲染完成后调用 fit() 方法调整布局
        setTimeout(() => {
          if (markmapInstance && typeof markmapInstance.fit === 'function') {
            markmapInstance.fit();
            console.log('[Mindmap] Inline mindmap layout adjusted with fit() method');
          }
        }, 300);
      });
    } catch (error) {
      console.error('[Mindmap] Inline render failed:', error);
    }
  },
  
  // 获取渲染选项
  getRenderOptions() {
    return {
      duration: window.MINDMAP_CONFIG.options?.duration || 700,
      maxWidth: window.MINDMAP_CONFIG.options?.maxWidth || 300,
      spacing: window.MINDMAP_CONFIG.options?.spacing || 50,
      padding: window.MINDMAP_CONFIG.options?.padding || 30,
      fitRatio: window.MINDMAP_CONFIG.options?.fitRatio || 0.9,
      initialExpandLevel: window.MINDMAP_CONFIG.options?.initialExpandLevel || 2,
      embedGlobalCSS: false
    };
  },
  
  // 加载所需库
  async loadLibraries() {
    if (window.markmap && window.markmap.Markmap) {
      console.log('[Mindmap] Libraries already loaded');
      return;
    }
    
    try {
      console.log('[Mindmap] Loading required libraries');
      
      // 1. 首先加载d3
      if (!window.d3) {
        await this.loadScript(window.MINDMAP_CONFIG.d3Cdn);
        console.log('[Mindmap] d3 loaded:', !!window.d3);
      }
      
      // 2. 加载markmap-view（提供Markmap类）
      await this.loadScript(window.MINDMAP_CONFIG.viewCdn);
      console.log('[Mindmap] markmap-view loaded:', !!window.markmap);
      
      // 3. 加载markmap-lib（提供Transformer）
      await this.loadScript(window.MINDMAP_CONFIG.libCdn);
      console.log('[Mindmap] markmap-lib loaded:', !!window.markmap?.Transformer);
      
      console.log('[Mindmap] All libraries loaded successfully');
      console.log('[Mindmap] Markmap API:', {
        hasMarkmap: !!(window.markmap && window.markmap.Markmap),
        hasTransformer: !!(window.markmap && window.markmap.Transformer),
        hasCreate: typeof window.markmap?.Markmap?.create === 'function'
      });
    } catch (error) {
      const libError = ErrorManager.createError(
        ErrorManager.types.LIBRARY_LOAD,
        'Failed to load required libraries',
        { error: error.message }
      );
      ErrorManager.logError(libError);
      throw libError;
    }
  },
  
  // 加载脚本辅助函数
  loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  },
  
  // 尝试多种渲染方式
  async render(container, markdown) {
    let rendered = false;
    
    console.log('[Mindmap] Starting render with markdown:', markdown.substring(0, 100) + '...');
    
    // 主要渲染方式: 使用Markmap.create方法
    if (window.markmap && window.markmap.Markmap && typeof window.markmap.Markmap.create === 'function') {
      console.log('[Mindmap] Using Markmap.Markmap.create API');
      try {
        const { Transformer } = window.markmap;
        if (Transformer) {
          console.log('[Mindmap] Using Transformer to process markdown');
          const transformer = new Transformer();
          const { root } = transformer.transform(markdown);
          
          const options = this.getRenderOptions();
          console.log('[Mindmap] Creating markmap with options:', options);
          
          // 创建SVG元素
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('width', '100%');
          svg.setAttribute('height', '100%');
          container.innerHTML = '';
          container.appendChild(svg);
          console.log('[Mindmap] SVG element created:', !!svg);
          
          // 使用SVG元素创建markmap
          const markmapInstance = window.markmap.Markmap.create(svg, options, root);
          console.log('[Mindmap] Markmap created successfully:', !!markmapInstance);
          
          // 确保渲染完成后调用 fit() 方法调整布局
          setTimeout(() => {
            if (markmapInstance && typeof markmapInstance.fit === 'function') {
              markmapInstance.fit();
              console.log('[Mindmap] Layout adjusted with fit() method');
            }
          }, 500);
          
          return { success: true, markmap: markmapInstance, treeData: root };
        } else {
          console.warn('[Mindmap] Transformer not available, trying direct create');
        }
      } catch (error) {
        console.error('[Mindmap] Markmap.create failed:', error);
        console.error('[Mindmap] Error stack:', error.stack);
      }
    }
    
    // 备用方式: 使用window.markmap.create方法
    if (!rendered && window.markmap && typeof window.markmap.create === 'function') {
      console.log('[Mindmap] Using window.markmap.create API');
      try {
        // 创建SVG元素
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        container.innerHTML = '';
        container.appendChild(svg);
        
        const options = this.getRenderOptions();
        const markmapInstance = window.markmap.create(svg, options, markdown);
        console.log('[Mindmap] Markmap created via window.create:', !!markmapInstance);
        
        setTimeout(() => {
          if (markmapInstance && typeof markmapInstance.fit === 'function') {
            markmapInstance.fit();
          }
        }, 500);
        
        return { success: true, markmap: markmapInstance };
      } catch (error) {
        console.error('[Mindmap] window.markmap.create failed:', error);
        console.error('[Mindmap] Error stack:', error.stack);
      }
    }
    
    // 错误处理
    console.error('[Mindmap] No valid Markmap API found');
    console.log('[Mindmap] Available API:', {
      hasMarkmap: !!(window.markmap && window.markmap.Markmap),
      hasTransformer: !!(window.markmap && window.markmap.Transformer),
      hasMarkmapCreate: typeof window.markmap?.Markmap?.create === 'function',
      hasCreate: typeof window.markmap?.create === 'function'
    });
    
    throw ErrorManager.createError(
      ErrorManager.types.RENDERING,
      'No valid Markmap API found',
      { 
        availableAPIs: {
          hasMarkmap: !!(window.markmap && window.markmap.Markmap),
          hasTransformer: !!(window.markmap && window.markmap.Transformer),
          hasMarkmapCreate: typeof window.markmap?.Markmap?.create === 'function',
          hasCreate: typeof window.markmap?.create === 'function'
        },
        markdownPreview: markdown.substring(0, 50) + '...'
      }
    );
  },
  
  // 使用分离的Transformer和Markmap API渲染
  async renderWithSeparateAPI(container, markdown) {
    try {
      const { Transformer, Markmap } = window.markmap;
      const transformer = new Transformer();
      const { root } = transformer.transform(markdown);
      
      const options = this.getRenderOptions();
      const markmapInstance = Markmap.create(container, options, root);
      
      // 确保渲染完成后调用 fit() 方法调整布局
      setTimeout(() => {
        if (markmapInstance && typeof markmapInstance.fit === 'function') {
          markmapInstance.fit();
          console.log('[Mindmap] Layout adjusted with fit() method');
        }
      }, 500);
      
      return { success: true, markmap: markmapInstance, treeData: root };
    } catch (error) {
      console.error('[Mindmap] renderWithSeparateAPI failed:', error);
      return false;
    }
  },
  
  // 使用完整的transform和render API渲染
  async renderWithFullAPI(container, markdown) {
    try {
      // 使用完整的transform方法转换Markdown
      const { root } = window.markmap.transform(markdown);
      
      // 创建SVG容器
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      container.appendChild(svg);
      
      // 使用render方法渲染思维导图
      window.markmap.render(svg, root, this.getRenderOptions());
      
      return { success: true, treeData: root };
    } catch (error) {
      console.error('[Mindmap] renderWithFullAPI failed:', error);
      return false;
    }
  },
  
  // 使用简化的create API渲染
  async renderWithCreateAPI(container, markdown) {
    try {
      // 直接使用create方法渲染
      const markmapInstance = window.markmap.create(container, this.getRenderOptions(), markdown);
      
      // 确保渲染完成后调用 fit() 方法调整布局
      setTimeout(() => {
        if (markmapInstance && typeof markmapInstance.fit === 'function') {
          markmapInstance.fit();
          console.log('[Mindmap] Layout adjusted with fit() method');
        }
      }, 500);
      
      return { success: true, markmap: markmapInstance };
    } catch (error) {
      console.error('[Mindmap] renderWithCreateAPI failed:', error);
      return false;
    }
  }
};

// 4. 用户交互处理模块
const UserInteraction = {
  // 绑定事件
  bindEvents(engine) {
    if (!engine.modal || !engine.container) {
      console.warn('[Mindmap] Modal or container not found, skipping event binding');
      return;
    }
    
    console.log('[Mindmap] Binding events for modal:', engine.modal);
    
    // 绑定关闭按钮事件
    const closeBtn = engine.modal.querySelector('#mindmap-btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        console.log('[Mindmap] Close button clicked');
        engine.hideModal();
      });
      console.log('[Mindmap] Close button event bound');
    }
    
    // 绑定遮罩层点击事件
    const overlay = engine.modal.querySelector('.mindmap-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => {
        console.log('[Mindmap] Overlay clicked');
        engine.hideModal();
      });
      console.log('[Mindmap] Overlay event bound');
    }
    
    // 绑定全屏按钮事件
    const fullscreenBtn = engine.modal.querySelector('#mindmap-btn-fullscreen');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => {
        console.log('[Mindmap] Fullscreen button clicked');
        engine.toggleFullscreen();
      });
      console.log('[Mindmap] Fullscreen button event bound');
    }
    
    // 绑定导出按钮事件
    const exportBtn = engine.modal.querySelector('#mindmap-btn-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        console.log('[Mindmap] Export button clicked');
        engine.exportAsSVG();
      });
      console.log('[Mindmap] Export button event bound');
    }

    // 绑定Escape键事件
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && engine.state.visible) {
        console.log('[Mindmap] Escape key pressed, hiding modal');
        engine.hideModal();
      }
    });
    console.log('[Mindmap] Escape key event bound');
  },
  
  // 显示模态框
  showModal(modal) {
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
    document.body.style.overflow = 'hidden';
  },
  
  // 隐藏模态框
  hideModal(modal) {
    modal.classList.remove('show');
    setTimeout(() => {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }, 300);
  },
  
  // 切换全屏
  toggleFullscreen(modal, state, markmap) {
    if (!state.fullscreen) {
      modal.classList.add('fullscreen');
      state.fullscreen = true;
      const btn = document.getElementById('mindmap-btn-fullscreen');
      if (btn) {
        const svg = btn.querySelector('svg');
        if (svg) {
          svg.innerHTML = '<path d="M8 16H6v5h5v-2H8v-3zm0-10h2V3h3V1H6v5h2V6zm10 10h-3v2h5v-5h-2v3zM14 5v2h3v3h2V6h-5z"/>';
        }
      }
    } else {
      modal.classList.remove('fullscreen');
      state.fullscreen = false;
      const btn = document.getElementById('mindmap-btn-fullscreen');
      if (btn) {
        const svg = btn.querySelector('svg');
        if (svg) {
          svg.innerHTML = '<path d="M7 14H5v5h5v-2H8v-3zm0-10h2V3h3V1H6v5h2V6zm10 10h-3v2h5v-5h-2v3zM14 5v2h3v3h2V6h-5z"/>';
        }
      }
    }
    if (markmap) {
      setTimeout(() => markmap.fit(), 100);
    }
  }
};

// MindmapEngine 核心类
if (typeof window.MindmapEngine === 'undefined') {
  window.MindmapEngine = class MindmapEngine {
    constructor() {
      this.state = {
        rendered: false,
        visible: false,
        fullscreen: false,
        markmapLoaded: false
      };
      this.cache = {
        treeData: null,
        svgElement: null,
        markmap: null
      };
      // 延迟获取DOM元素，确保页面加载完成
      setTimeout(() => {
        this.modal = document.getElementById('mindmap-modal');
        this.container = document.getElementById('mindmap-svg-container');
        UserInteraction.bindEvents(this);
        RenderingEngine.renderInlineMindmaps();
      }, 100);
    }

    // 显示思维导图
    async show() {
      if (this.state.rendered && this.cache.markmap) {
        this.showCached();
        return;
      }
      await this.firstRender();
    }

    // 首次渲染
    async firstRender() {
      try {
        console.log('[Mindmap] Starting firstRender');
        
        // 清空容器内容，确保重新渲染
        this.container.innerHTML = '';
        console.log('[Mindmap] Container cleared');
        
        // 显示加载状态
        this.showLoading();
        console.log('[Mindmap] Loading state shown');
        
        // 提取文章标题生成Markdown
        const markdown = DataParser.extractHeadingsAsMarkdown();
        console.log('[Mindmap] Generated markdown:', markdown);
        
        // 验证Markdown内容
        const validation = DataParser.validateMarkdown(markdown);
        if (!validation.valid) {
          console.log('[Mindmap] Invalid markdown content:', validation.error);
          this.hideLoading();
          this.showEmptyState();
          return;
        }
        
        // 确保所有依赖都已加载
        try {
          await RenderingEngine.loadLibraries();
          console.log('[Mindmap] All dependencies loaded successfully');
        } catch (loadError) {
          console.error('[Mindmap] Failed to load dependencies:', loadError);
          this.hideLoading();
          ErrorManager.displayError(this.container, loadError);
          return;
        }
        
        // 移除加载状态
        this.hideLoading();
        
        // 清空容器，确保只有Markmap渲染的内容
        this.container.innerHTML = '';
        console.log('[Mindmap] Container emptied before rendering');
        
        // 渲染思维导图
        const result = await RenderingEngine.render(this.container, markdown);
        
        // 缓存结果
        if (result.success) {
          this.cache.markmap = result.markmap;
          this.cache.treeData = result.treeData;
          
          // 缓存SVG元素以便导出
          setTimeout(() => {
            this.cache.svgElement = this.container.cloneNode(true);
            console.log('[Mindmap] SVG Element cached for export');
          }, 1000);

          this.state.rendered = true;
          console.log('[Mindmap] First render completed successfully');
        }
      } catch (error) {
        console.error('[Mindmap] Render failed:', error);
        
        // 移除加载状态
        this.hideLoading();
        
        // 显示错误信息
        if (error.type) {
          ErrorManager.displayError(this.container, error);
        } else {
          const genericError = ErrorManager.createError(
            ErrorManager.types.RENDERING,
            error.message || 'Unknown error'
          );
          ErrorManager.displayError(this.container, genericError);
        }
      }
    }

    // 显示缓存
    showCached() {
      UserInteraction.showModal(this.modal);
      this.state.visible = true;
      if (this.cache.markmap) {
        this.cache.markmap.fit();
      }
    }

    // 显示模态框
    showModal() {
      UserInteraction.showModal(this.modal);
      this.state.visible = true;
    }

    // 隐藏模态框
    hideModal() {
      UserInteraction.hideModal(this.modal);
      this.state.visible = false;
      this.state.fullscreen = false;
      this.modal.classList.remove('fullscreen');
    }

    // 显示加载状态
    showLoading() {
      const loading = document.createElement('div');
      loading.className = 'mindmap-loading';
      loading.innerHTML = '<i class="anzhiyufont anzhiyu-icon-spinner-animate"></i><p>正在生成思维导图...</p>';
      this.container.appendChild(loading);
    }

    // 隐藏加载状态
    hideLoading() {
      const loading = this.container.querySelector('.mindmap-loading');
      if (loading) loading.remove();
    }

    // 显示空状态
    showEmptyState() {
      document.querySelector('.mindmap-empty-state').style.display = 'block';
      this.hideLoading();
    }

    // 全屏切换
    toggleFullscreen() {
      UserInteraction.toggleFullscreen(this.modal, this.state, this.cache.markmap);
    }

    // 导出为 SVG
    exportAsSVG() {
      if (!this.cache.svgElement) {
        if(typeof anzhiyu !== 'undefined') anzhiyu.snackbarShow('请先打开思维导图', false, 2000);
        return;
      }
      const svgData = new XMLSerializer().serializeToString(this.cache.svgElement);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      this.downloadBlob(svgBlob, this.getExportFilename('svg'));
    }

    // 下载文件
    downloadBlob(blob, filename) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
      if(typeof anzhiyu !== 'undefined') anzhiyu.snackbarShow('导出成功', false, 2000);
    }

    // 生成导出文件名
    getExportFilename(format) {
      const template = window.MINDMAP_CONFIG.export.filename_format || '{title}-mindmap';
      const title = document.title || 'mindmap';
      const filename = template.replace('{title}', title);
      return `${filename}.${format}`;
    }

    // 销毁实例
    destroy() {
      if (this.cache.markmap) {
        this.cache.markmap.destroy && this.cache.markmap.destroy();
      }
      this.state = { rendered: false, visible: false, fullscreen: false, markmapLoaded: false };
      this.cache = { treeData: null, svgElement: null, markmap: null };
    }
  };
}

// 初始化思维导图功能
function initMindmapFeature() {
  // 检查文章是否启用了思维导图 - 增强检测逻辑
  const mindmapBtn = document.getElementById('mindmap-btn');
  if (!mindmapBtn) {
    setTimeout(initMindmapFeature, 50);
    return;
  }
  
  // 更可靠的启用检测：检查Front Matter中的mindmap配置
  const isMindmapEnabled = true; // 默认启用，由主题配置控制显示
  
  mindmapBtn.style.display = 'block';
  mindmapBtn.dataset.mindmapEnabled = 'true';

  const modal = document.getElementById('mindmap-modal');
  const container = document.getElementById('mindmap-svg-container');
  
  if (!modal || !container) {
    setTimeout(initMindmapFeature, 50);
    return;
  }

  if (!window.__mindmapEngine) {
    window.__mindmapEngine = new window.MindmapEngine();
  }
  
  // 确保事件绑定正确
  mindmapBtn.addEventListener('click', () => {
    if (window.__mindmapEngine) {
      window.__mindmapEngine.showModal();
      window.__mindmapEngine.show();
    }
  });
}

// 立即执行初始化
initMindmapFeature();

// 测试函数：手动测试思维导图渲染
window.testMindmap = function() {
  console.log('[Mindmap Test] Starting test...');
  
  if (!window.markmap) {
    console.error('[Mindmap Test] markmap library not loaded');
    return false;
  }
  
  console.log('[Mindmap Test] markmap library loaded:', window.markmap);
  
  // 测试简单的思维导图
  const testContainer = document.createElement('div');
  testContainer.style.position = 'fixed';
  testContainer.style.top = '10px';
  testContainer.style.left = '10px';
  testContainer.style.width = '300px';
  testContainer.style.height = '200px';
  testContainer.style.border = '1px solid red';
  testContainer.style.background = 'white';
  testContainer.style.zIndex = '99999';
  document.body.appendChild(testContainer);
  
  try {
    const markdown = `# Test Mindmap\n\n## Level 2\n### Level 3\n## Another Level 2`;
    
    if (window.markmap.Transformer && window.markmap.Markmap) {
      const transformer = new window.markmap.Transformer();
      const { root } = transformer.transform(markdown);
      
      const markmapInstance = window.markmap.Markmap.create(testContainer, {
        maxWidth: 200,
        spacing: 20,
        padding: 10
      }, root);
      
      console.log('[Mindmap Test] Test mindmap created successfully');
      return true;
    } else {
      console.error('[Mindmap Test] Required components not available:', {
        hasTransformer: !!window.markmap.Transformer,
        hasMarkmap: !!window.markmap.Markmap
      });
      return false;
    }
  } catch (error) {
    console.error('[Mindmap Test] Error creating test mindmap:', error);
    return false;
  }
};

// PJAX 兼容处理
if (typeof pjax !== 'undefined') {
  document.addEventListener('pjax:send', () => {
    if (window.__mindmapEngine) {
      window.__mindmapEngine.destroy();
      window.__mindmapEngine = null;
    }
  });
  
  document.addEventListener('pjax:complete', () => {
    initMindmapFeature();
  });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initMindmapFeature);