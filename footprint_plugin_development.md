# Hexo博客足迹地图插件开发文档

## 1. 项目概述

本文档详细介绍如何为Hexo博客框架开发一个足迹地图插件，该插件基于高德地图API，可以记录和展示用户去过的地方。本插件参考了Halo博客框架的同名插件`footprint`，并将其适配到Hexo环境。

## 2. 技术栈

- Hexo 5.x+
- Node.js 14.x+
- 高德地图API 2.0
- HTML5/CSS3/JavaScript
- jQuery 3.x

## 3. 项目结构

```
hexo-footprint/
├── index.js               # 插件入口文件
├── package.json           # 依赖管理
├── README.md              # 插件说明
├── src/
│   ├── js/
│   │   └── footprint.js   # 地图逻辑实现
│   ├── css/
│   │   └── footprint.css  # 样式文件
│   └── templates/
│       └── footprint.ejs  # 页面模板
├── _config.yml            # 插件配置
└── assets/
    ├── img/
    │   └── link.svg       # 图标资源
    └── font/              # 字体资源
```

## 4. 核心功能实现

### 4.1 插件入口文件 (index.js)

```javascript
/* global hexo */
'use strict';

// 常量定义
const path = require('path');
const fs = require('fs');

// 插件配置
hexo.config.footprint = Object.assign({
  enable: true,
  gaoDeKey: '',  // 高德地图API密钥
  title: '足迹',
  logoName: '足迹',
  describe: '每一处足迹都充满了故事，那是对人生的思考和无限的风光。',
  hsla: '200, 100%, 50%',
  mapStyle: 'amap://styles/normal',
  path: 'footprints'
}, hexo.config.footprint);

// 注册路由
hexo.extend.generator.register('footprint', function(locals) {
  const config = hexo.config.footprint;
  if (!config.enable) return;

  return {
    path: config.path + '/index.html',
    data: locals,
    layout: ['footprint']
  };
});

// 添加视图
hexo.extend.view.register('footprint', path.join(__dirname, 'src/templates/footprint.ejs'));

// 注入脚本和样式
hexo.extend.filter.register('after_render:html', function(html) {
  const config = hexo.config.footprint;
  if (!config.enable) return html;

  // 注入CSS
  const css = fs.readFileSync(path.join(__dirname, 'src/css/footprint.css'), 'utf8');
  const styleTag = `<style>${css}</style>`;
  html = html.replace('</head>', `${styleTag}</head>`);

  // 注入JS
  const js = fs.readFileSync(path.join(__dirname, 'src/js/footprint.js'), 'utf8');
  const jsTag = `<script>${js}</script>`;
  html = html.replace('</body>', `${jsTag}</body>`);

  return html;
});

// 复制静态资源
hexo.extend.filter.register('after_generate', function() {
  const assetDir = path.join(hexo.public_dir, 'assets', 'footprint');
  const sourceDir = path.join(__dirname, 'assets');

  // 确保目标目录存在
  if (!fs.existsSync(assetDir)) {
    fs.mkdirSync(assetDir, { recursive: true });
  }

  // 复制资源
  if (fs.existsSync(sourceDir)) {
    fs.readdirSync(sourceDir).forEach(file => {
      const source = path.join(sourceDir, file);
      const target = path.join(assetDir, file);

      if (fs.lstatSync(source).isDirectory()) {
        if (!fs.existsSync(target)) {
          fs.mkdirSync(target);
        }
        fs.readdirSync(source).forEach(subFile => {
          fs.copyFileSync(path.join(source, subFile), path.join(target, subFile));
        });
      } else {
        fs.copyFileSync(source, target);
      }
    });
  }
});
```

### 4.2 页面模板 (footprint.ejs)

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= config.footprint.title || '足迹 - 记录生活的每一步' %></title>
  <!-- 引入高德地图API -->
  <script type="text/javascript">
    window._AMapSecurityConfig = {
      securityJsCode: '<%= config.footprint.gaoDeKey %>'
    }
  </script>
  <script type="text/javascript" src="https://webapi.amap.com/maps?v=2.0&key=<%= config.footprint.gaoDeKey %>"></script>
  <!-- 引入jQuery -->
  <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
  <!-- 注入配置信息 -->
  <script>
    window.FOOTPRINT_CONFIG = {
      amapKey: '<%= config.footprint.gaoDeKey %>',
      footprints: [], // 足迹数据将通过API获取或从配置中加载
      title: '<%= config.footprint.title || '足迹' %>',
      logoName: '<%= config.footprint.logoName || '足迹' %>',
      describe: '<%= config.footprint.describe || '每一处足迹都充满了故事，那是对人生的思考和无限的风光。' %>',
      hsla: '<%= config.footprint.hsla || '200, 100%, 50%' %>',
      mapStyle: '<%= config.footprint.mapStyle || 'amap://styles/normal' %>'
    };
  </script>
</head>
<body id="footprint-page">
  <div class="footprint-container">
    <!-- 地图容器 -->
    <div id="footprint-map"></div>

    <!-- 左下角Logo和文字 -->
    <div class="logo-container">
      <h1 class="footprint-logo"><%= config.footprint.logoName || '足迹' %><span class="logo-version">2024</span></h1>
      <p class="footprint-slogan"><%= config.footprint.describe || '每一处足迹都充满了故事，那是对人生的思考和无限的风光。' %></p>
    </div>

    <!-- 底部控制栏 -->
    <div class="map-controls">
      <div class="button-group">
        <button class="control-btn active" data-type="normal">标准图层</button>
        <button class="control-btn" data-type="satellite">卫星图</button>
      </div>
      <div class="button-group">
        <label class="plane-switch">
          <input type="checkbox" data-type="road">
          <div>
            <div>
              <svg viewBox="0 0 13 13">
                <path d="M1.55989957,5.41666667 L5.51582215,5.41666667 L4.47015462,0.108333333 L4.47015462,0.108333333 C4.47015462,0.0634601974 4.49708054,0.0249592654 4.5354546,0.00851337035 L4.57707145,0 L5.36229752,0 C5.43359776,0 5.50087375,0.028779451 5.55026392,0.0782711996 L5.59317877,0.134368264 L7.13659662,2.81558333 L8.29565964,2.81666667 C8.53185377,2.81666667 8.72332694,3.01067661 8.72332694,3.25 C8.72332694,3.48932339 8.53185377,3.68333333 8.29565964,3.68333333 L7.63589819,3.68225 L8.63450135,5.41666667 L11.9308317,5.41666667 C12.5213171,5.41666667 13,5.90169152 13,6.5 C13,7.09830848 12.5213171,7.58333333 11.9308317,7.58333333 L8.63450135,7.58333333 L7.63589819,9.31666667 L8.29565964,9.31666667 C8.53185377,9.31666667 8.72332694,9.51067661 8.72332694,9.75 C8.72332694,9.98932339 8.53185377,10.1833333 8.29565964,10.1833333 L7.13659662,10.1833333 L5.59317877,12.8656317 C5.55725264,12.9280353 5.49882018,12.9724157 5.43174295,12.9907056 L5.36229752,13 L4.57707145,13 L4.55610333,12.9978962 C4.51267695,12.9890959 4.48069792,12.9547924 4.47230803,12.9134397 L4.47223088,12.8704208 L5.51582215,7.58333333 L1.55989957,7.58333333 L0.891288881,8.55114605 C0.853775374,8.60544678 0.798421006,8.64327676 0.73629202,8.65879796 L0.672314689,8.66666667 L0.106844414,8.66666667 L0.0715243949,8.66058466 L0.0715243949,8.66058466 C0.0297243066,8.6457608 0.00275502199,8.60729104 0,8.5651586 L0.00593007386,8.52254537 L0.580855011,6.85813984 C0.64492547,6.67265611 0.6577034,6.47392717 0.619193545,6.28316421 L0.580694768,6.14191703 L0.00601851064,4.48064746 C0.00203480725,4.4691314 0,4.45701613 0,4.44481314 C0,4.39994001 0.0269259152,4.36143908 0.0652999725,4.34499318 L0.106916826,4.33647981 L0.672546853,4.33647981 C0.737865848,4.33647981 0.80011301,4.36066329 0.848265401,4.40322477 L0.89131128,4.45169723 L1.55989957,5.41666667 Z" fill="currentColor"></path>
              </svg>
            </div>
            <span class="street-middle"></span>
            <span class="cloud"></span>
            <span class="cloud two"></span>
          </div>
          <span class="switch-text">路网</span>
        </label>
        <label class="plane-switch">
          <input type="checkbox" data-type="traffic">
          <div>
            <div>
              <svg viewBox="0 0 13 13">
                <path d="M1.55989957,5.41666667 L5.51582215,5.41666667 L4.47015462,0.108333333 L4.47015462,0.108333333 C4.47015462,0.0634601974 4.49708054,0.0249592654 4.5354546,0.00851337035 L4.57707145,0 L5.36229752,0 C5.43359776,0 5.50087375,0.028779451 5.55026392,0.0782711996 L5.59317877,0.134368264 L7.13659662,2.81558333 L8.29565964,2.81666667 C8.53185377,2.81666667 8.72332694,3.01067661 8.72332694,3.25 C8.72332694,3.48932339 8.53185377,3.68333333 8.29565964,3.68333333 L7.63589819,3.68225 L8.63450135,5.41666667 L11.9308317,5.41666667 C12.5213171,5.41666667 13,5.90169152 13,6.5 C13,7.09830848 12.5213171,7.58333333 11.9308317,7.58333333 L8.63450135,7.58333333 L7.63589819,9.31666667 L8.29565964,9.31666667 C8.53185377,9.31666667 8.72332694,9.51067661 8.72332694,9.75 C8.72332694,9.98932339 8.53185377,10.1833333 8.29565964,10.1833333 L7.13659662,10.1833333 L5.59317877,12.8656317 C5.55725264,12.9280353 5.49882018,12.9724157 5.43174295,12.9907056 L5.36229752,13 L4.57707145,13 L4.55610333,12.9978962 C4.51267695,12.9890959 4.48069792,12.9547924 4.47230803,12.9134397 L4.47223088,12.8704208 L5.51582215,7.58333333 L1.55989957,7.58333333 L0.891288881,8.55114605 C0.853775374,8.60544678 0.798421006,8.64327676 0.73629202,8.65879796 L0.672314689,8.66666667 L0.106844414,8.66666667 L0.0715243949,8.66058466 L0.0715243949,8.66058466 C0.0297243066,8.6457608 0.00275502199,8.60729104 0,8.5651586 L0.00593007386,8.52254537 L0.580855011,6.85813984 C0.64492547,6.67265611 0.6577034,6.47392717 0.619193545,6.28316421 L0.580694768,6.14191703 L0.00601851064,4.48064746 C0.00203480725,4.4691314 0,4.45701613 0,4.44481314 C0,4.39994001 0.0269259152,4.36143908 0.0652999725,4.34499318 L0.106916826,4.33647981 L0.672546853,4.33647981 C0.737865848,4.33647981 0.80011301,4.36066329 0.848265401,4.40322477 L0.89131128,4.45169723 L1.55989957,5.41666667 Z" fill="currentColor"></path>
              </svg>
            </div>
            <span class="street-middle"></span>
            <span class="cloud"></span>
            <span class="cloud two"></span>
          </div>
          <span class="switch-text">路况</span>
        </label>
      </div>
      <div class="zoom-buttons">
        <button class="zoom-btn" id="zoom-in">+</button>
        <button class="zoom-btn" id="zoom-out">−</button>
      </div>
      <div class="amap-scale-text">1000 公里</div>
    </div>
  </div>
</body>
</html>
```

### 4.3 JavaScript逻辑实现 (footprint.js)

```javascript
// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', () => {
  // 判断当前路径是否为/footprints
  const currentPath = window.location.pathname;
  if (!currentPath.includes('footprints')) {
    console.log('非足迹页面，不加载地图功能');
    return;
  }

  // 设置全局颜色变量
  const footprintPage = document.getElementById('footprint-page');
  if (footprintPage && window.FOOTPRINT_CONFIG) {
    footprintPage.style.setProperty('--footprint-hsla', window.FOOTPRINT_CONFIG.hsla);
  }

  // 打印插件信息
  console.log(
    '%c足迹插件%c🗺️ 记录生活轨迹，分享旅途故事\n%c作者 %c',
    'background: #42b983; color: white; padding: 2px 4px; border-radius: 3px;',
    'color: #42b983; padding: 2px 4px;',
    'color: #666; padding: 2px 4px;',
    'color: #42b983; text-decoration: underline; padding: 2px 4px;'
  );

  // 等待AMap对象加载完成
  const checkAMap = () => {
    if (typeof AMap === 'undefined') {
      console.warn('等待高德地图API加载...');
      setTimeout(checkAMap, 100);
      return;
    }
    console.log('高德地图API加载成功');
    initializeApp();
  };
  checkAMap();
});

// 初始化应用
function initializeApp() {
  // 创建地图实例
  const map = new AMap.Map('footprint-map', {
    center: [104.066541, 30.572885], // 默认中心点（成都）
    zoom: 4, // 默认缩放级别
    mapStyle: window.FOOTPRINT_CONFIG.mapStyle,
    viewMode: '3D',
    pitch: 0,
    rotation: 0
  });

  // 添加地图控件
  map.addControl(new AMap.Scale());
  map.addControl(new AMap.Zoom());

  // 初始化图层
  const layers = {
    satellite: new AMap.TileLayer.Satellite(),
    road: new AMap.TileLayer.RoadNet(),
    traffic: new AMap.TileLayer.Traffic()
  };

  // 添加图层到地图
  map.add(layers.satellite);
  map.add(layers.road);
  map.add(layers.traffic);

  // 图层状态管理
  const layerState = {
    baseLayer: 'normal',
    overlays: {
      road: true,
      traffic: false
    }
  };

  // 更新图层显示
  updateLayers(layerState, layers);

  // 加载足迹数据
  loadFootprintData().then(footprintData => {
    // 添加足迹标记
    addFootprintMarkers(map, footprintData);
    // 显示元素动画
    showElements();
  }).catch(error => {
    console.error('加载足迹数据失败:', error);
  });

  // 绑定图层切换事件
  document.querySelectorAll('.control-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-type');
      handleLayerChange(btn, type, layerState, map, layers);
    });
  });

  // 绑定开关切换事件
  document.querySelectorAll('.plane-switch input').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const type = checkbox.getAttribute('data-type');
      const btn = checkbox.closest('.plane-switch');
      handleLayerChange(btn, type, layerState, map, layers);
    });
  });

  // 绑定缩放按钮事件
  document.getElementById('zoom-in').addEventListener('click', () => {
    map.zoomIn();
  });

  document.getElementById('zoom-out').addEventListener('click', () => {
    map.zoomOut();
  });

  // 监听地图缩放事件，更新比例尺文本
  map.on('zoomend', () => {
    updateScaleText(map);
  });

  // 初始化比例尺文本
  updateScaleText(map);
}

// 加载足迹数据
function loadFootprintData() {
  return new Promise((resolve, reject) => {
    try {
      // 在Hexo中，足迹数据可以从配置中加载或通过API获取
      // 这里简化实现，直接使用配置中的数据
      const footprints = window.FOOTPRINT_CONFIG.footprints || [];
      resolve(footprints);
    } catch (error) {
      reject(error);
    }
  });
}

// 优化动画性能
const showElements = () => {
  // 添加初始类
  document.body.classList.add('theme-ready');
  
  // 动画序列
  const animationSequence = [
    {
      element: '.logo-container',
      className: 'show',
      delay: 0,
      callback: () => {
        requestAnimationFrame(() => {
          document.querySelector('.footprint-logo').style.color = 'var(--primary-color)';
        });
      }
    },
    {
      element: '.map-controls',
      className: 'show',
      delay: 200,
      callback: () => {
        // 依次显示控制按钮
        const buttons = document.querySelectorAll('.map-controls .control-btn');
        buttons.forEach((btn, index) => {
          setTimeout(() => {
            btn.classList.add('show');
            // 添加缩放效果
            btn.classList.add('scale-in');
            // 移除缩放效果
            setTimeout(() => btn.classList.remove('scale-in'), 300);
          }, index * 100);
        });
      }
    }
  ];

  // 执行动画序列
  animationSequence.forEach(({element, className, delay, callback}) => {
    setTimeout(() => {
      const el = document.querySelector(element);
      if (el) {
        el.classList.add(className);
        if (callback) {
          callback();
        }
      }
    }, delay);
  });
};

// 图层配置
const layerConfig = {
  satellite: {
    zIndex: 0,
    opacity: 1
  },
  road: {
    zIndex: 1,
    opacity: 0.6,
    strokeColor: '#666666'
  },
  traffic: {
    zIndex: 2,
    opacity: 0.6
  }
};

// 优化地图移动
const moveToLocation = (map, position) => {
  return new Promise((resolve) => {
    // 启用动画
    map.setStatus({animateEnable: true});
    
    // 设置缩放级别
    if (map.getZoom() < 14) {
      map.setZoom(14);
    }

    // 平移到目标位置
    map.panTo(position);
    
    // 等待动画完成
    const checkAnimation = () => {
      if (!map.isMoving && !map.isZooming) {
        resolve();
      } else {
        requestAnimationFrame(checkAnimation);
      }
    };
    checkAnimation();
  });
};

// 优化标记点创建
const createMarker = (spec) => {
  const markerContent = document.createElement('div');
  markerContent.className = 'custom-marker';
  
  const markerImage = document.createElement('div');
  markerImage.className = 'marker-image';
  
  const img = document.createElement('img');
  img.src = spec.image || 'https://www.lik.cc/upload/loading8.gif';
  img.alt = spec.name || '足迹标记';
  
  markerImage.appendChild(img);
  markerContent.appendChild(markerImage);
  
  return markerContent;
};

// 优化信息窗口内容创建
function createInfoWindow(spec) {
  // 确保所有字段都有默认值
  const {
    image = '',
    name = '',
    footprintType = '',
    createTime = '',
    address = '',
    description = '',
    article = ''
  } = spec;

  // 格式化时间
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).replace(/\//g, '-');
  };

  // 构建图片HTML
  const imageHtml = image ? `
    <div class="image">
      <img src="${image}" alt="${name}" style="position: absolute; width: 100%; height: 100%; object-fit: cover;">
      <div class="image-info">
        <h3 class="title">${name}</h3>
        <div class="meta">
          <span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 7v10a4 4 0 004 4h10a4 4 0 004-4V7a4 4 0 00-4-4H7a4 4 0 00-4 4z"></path>
              <path d="M9 12h6"></path>
            </svg>
            ${footprintType || '未知类型'}
          </span>
        </div>
        <div class="meta">
          <span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            ${formatDate(createTime)}
          </span>
        </div>
        <div class="meta">
          <span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            ${address || '未知位置'}
          </span>
        </div>
        ${description ? `<p class="description">${description}</p>` : ''}
        ${article ? `
            <a href="${article}" target="_blank" class="article-btn">
              查看文章
              <div class="arrow-wrapper">
                <div class="arrow"></div>
              </div>
            </a>
          ` : ''}
      </div>
    </div>
  ` : `
    <div class="image">
      <img src="https://www.lik.cc/upload/loading8.gif" alt="${name}" style="position: absolute; width: 100%; height: 100%; object-fit: cover;">
      <div class="image-info">
        <h3 class="title">${name}</h3>
        <div class="meta">
          <span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 7v10a4 4 0 004 4h10a4 4 0 004-4V7a4 4 0 00-4-4H7a4 4 0 00-4 4z"></path>
              <path d="M9 12h6"></path>
            </svg>
            ${footprintType || '未知类型'}
          </span>
        </div>
        <div class="meta">
          <span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            ${formatDate(createTime)}
          </span>
        </div>
        <div class="meta">
          <span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            ${address || '未知位置'}
          </span>
        </div>
        ${description ? `<p class="description">${description}</p>` : ''}
        ${article ? `
            <a href="${article}" target="_blank" class="article-btn">
              查看文章
              <div class="arrow-wrapper">
                <div class="arrow"></div>
              </div>
            </a>
          ` : ''}
      </div>
    </div>
  `;

  return `
    <div class="info-window">
      ${imageHtml}
    </div>
  `;
}

// 添加足迹标记
const addFootprintMarkers = (map, footprintData) => {
  if (!Array.isArray(footprintData) || footprintData.length === 0) {
    console.warn('足迹数据为空或格式不正确');
    return;
  }

  // 创建信息窗体
  let infoWindow = new AMap.InfoWindow({
    isCustom: true,
    autoMove: false,
    offset: new AMap.Pixel(0, -10)
  });

  // 用于存储当前打开的标记
  let currentMarker = null;

  // 添加点击地图事件监听器，用于关闭信息窗口
  map.on('click', () => {
    if (currentMarker) {
      infoWindow.close();
      currentMarker = null;
    }
  });

  // 打开信息窗口的函数
  const openInfoWindow = (position, content) => {
    infoWindow.setContent(content);
    infoWindow.open(map, position);
    
    // 阻止信息窗口上的点击事件冒泡到地图
    requestAnimationFrame(() => {
      const infoWindowElement = document.querySelector('.info-window');
      if (infoWindowElement) {
        infoWindowElement.addEventListener('click', (e) => {
          e.stopPropagation();
        });
        
        // 为文章链接添加点击事件处理
        const articleBtn = infoWindowElement.querySelector('.article-btn');
        if (articleBtn) {
          articleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
          });
        }
      }
    });
  };

  footprintData.forEach(footprint => {
    const longitude = parseFloat(footprint.longitude);
    const latitude = parseFloat(footprint.latitude);

    if (isNaN(longitude) || isNaN(latitude)) {
      console.warn('无效的经纬度数据:', footprint);
      return;
    }

    try {
      const position = new AMap.LngLat(longitude, latitude);
      const marker = new AMap.Marker({
        position: position,
        content: createMarker(footprint),
        anchor: 'bottom-center',
        offset: new AMap.Pixel(0, 0)
      });

      marker.on('click', async () => {
        // 如果当前标记已经打开，则关闭它
        if (currentMarker === marker) {
          infoWindow.close();
          currentMarker = null;
          return;
        }

        // 先关闭当前窗体
        if (currentMarker) {
          infoWindow.close();
        }

        // 构建信息窗体内容
        const content = createInfoWindow(footprint);

        // 检查是否需要移动地图
        const currentPos = map.getCenter();
        const distance = position.distance(currentPos);
        const currentZoom = map.getZoom();
        
        // 如果距离超过1公里或缩放级别不够，需要移动地图
        const needsMovement = distance > 1000 || currentZoom < 13;
        
        if (needsMovement) {
          // 先移动地图，等待移动完成后再打开窗口
          await moveToLocation(map, position);
        }
        
        // 打开信息窗口
        openInfoWindow(position, content);
        currentMarker = marker;
      });

      map.add(marker);
    } catch (error) {
      console.error('创建标记失败:', error, footprint);
    }
  });
};

// 优化图层切换
const handleLayerChange = (btn, type, layerState, map, layers) => {
  btn.classList.add('btn-clicked');
  
  requestAnimationFrame(() => {
    if (type === 'normal' || type === 'satellite') {
      const baseButtons = document.querySelectorAll('.control-btn[data-type="normal"], .control-btn[data-type="satellite"]');
      baseButtons.forEach(button => button.classList.remove('active'));
      
      const mapContainer = document.getElementById('footprint-map');
      mapContainer.classList.add('map-transitioning');
      
      requestAnimationFrame(() => {
        btn.classList.add('active');
        layerState.baseLayer = type;
        
        updateLayers(layerState, layers).then(() => {
          setTimeout(() => {
            mapContainer.classList.remove('map-transitioning');
          }, 500);
        });
      });
    } else {
      btn.classList.toggle('active');
      layerState.overlays[type] = !layerState.overlays[type];
      
      if (layerState.overlays[type]) {
        const mapContainer = document.getElementById('footprint-map');
        mapContainer.classList.add('map-shake');
        setTimeout(() => {
          mapContainer.classList.remove('map-shake');
        }, 400);
      }
      
      updateLayers(layerState, layers);
    }
  });

  setTimeout(() => btn.classList.remove('btn-clicked'), 400);
};

// 优化图层更新
const updateLayers = async (layerState, layers) => {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      // 处理基础图层
      if (layerState.baseLayer === 'satellite') {
        layers.satellite.show();
      } else {
        layers.satellite.hide();
      }

      // 错开叠加图层的更新时间
      setTimeout(() => {
        if (layerState.overlays.road) {
          layers.road.show();
        } else {
          layers.road.hide();
        }
      }, 100);
      
      setTimeout(() => {
        if (layerState.overlays.traffic) {
          layers.traffic.show();
        } else {
          layers.traffic.hide();
        }
        resolve();
      }, 200);
    });
  });
};

// 更新比例尺文本
function updateScaleText(map) {
  const zoom = map.getZoom();
  let scaleText = '';

  if (zoom >= 16) {
    scaleText = '100 米';
  } else if (zoom >= 14) {
    scaleText = '500 米';
  } else if (zoom >= 12) {
    scaleText = '1 公里';
  } else if (zoom >= 10) {
    scaleText = '5 公里';
  } else if (zoom >= 8) {
    scaleText = '20 公里';
  } else if (zoom >= 6) {
    scaleText = '100 公里';
  } else if (zoom >= 4) {
    scaleText = '500 公里';
  } else {
    scaleText = '1000 公里';
  }

  const scaleElement = document.querySelector('.amap-scale-text');
  if (scaleElement) {
    scaleElement.textContent = scaleText;
  }
}
```

### 4.4 样式文件 (footprint.css)

```css
/* 基础样式 */
:root {
  --footprint-hsla: 200, 100%, 50%;
  --primary-color: hsl(var(--footprint-hsla));
  --secondary-color: hsl(var(--footprint-hsla), 0.8);
  --text-color: #333;
  --bg-color: #fff;
  --card-bg: rgba(255, 255, 255, 0.9);
  --shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  --transition: all 0.3s ease;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  color: var(--text-color);
  background-color: var(--bg-color);
  overflow: hidden;
  height: 100vh;
  width: 100vw;
}

/* 容器样式 */
.footprint-container {
  position: relative;
  height: 100%;
  width: 100%;
}

/* 地图容器样式 */
#footprint-map {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  transition: opacity 0.5s ease;
}

.map-transitioning {
  opacity: 0.6;
}

.map-shake {
  animation: shake 0.4s ease;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

/* Logo容器样式 */
.logo-container {
  position: absolute;
  bottom: 60px;
  left: 20px;
  z-index: 10;
  opacity: 0;
  transform: translateY(20px);
  transition: var(--transition);
}

.logo-container.show {
  opacity: 1;
  transform: translateY(0);
}

.footprint-logo {
  font-size: 24px;
  font-weight: bold;
  color: #333;
  margin-bottom: 5px;
  transition: color 0.3s ease;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.logo-version {
  font-size: 12px;
  color: var(--primary-color);
  margin-left: 5px;
}

.footprint-slogan {
  font-size: 14px;
  color: #666;
  max-width: 200px;
  line-height: 1.4;
}

/* 地图控制栏样式 */
.map-controls {
  position: absolute;
  bottom: 20px;
  left: 20px;
  right: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 10;
  opacity: 0;
  transform: translateY(20px);
  transition: var(--transition);
}

.map-controls.show {
  opacity: 1;
  transform: translateY(0);
}

.button-group {
  display: flex;
  gap: 10px;
}

.control-btn {
  background-color: var(--card-bg);
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 14px;
  cursor: pointer;
  transition: var(--transition);
  box-shadow: var(--shadow);
  opacity: 0;
  transform: translateY(10px);
}

.control-btn.show {
  opacity: 1;
  transform: translateY(0);
}

.control-btn.active {
  background-color: var(--primary-color);
  color: white;
}

.control-btn:hover:not(.active) {
  background-color: #f0f0f0;
}

.control-btn.btn-clicked {
  transform: scale(0.95);
}

.scale-in {
  animation: scaleIn 0.3s ease;
}

@keyframes scaleIn {
  0% { transform: scale(0.9); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

/* 开关样式 */
.plane-switch {
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
  background-color: var(--card-bg);
  padding: 6px 12px;
  border-radius: 4px;
  box-shadow: var(--shadow);
}

.plane-switch input {
  display: none;
}

.plane-switch .switch-text {
  margin-left: 8px;
  font-size: 14px;
}

/* 缩放按钮样式 */
.zoom-buttons {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.zoom-btn {
  width: 30px;
  height: 30px;
  background-color: var(--card-bg);
  border: none;
  border-radius: 4px;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow);
  transition: var(--transition);
}

.zoom-btn:hover {
  background-color: var(--primary-color);
  color: white;
}

/* 比例尺文本 */
.amap-scale-text {
  position: absolute;
  bottom: 60px;
  right: 20px;
  background-color: var(--card-bg);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  box-shadow: var(--shadow);
  z-index: 10;
}

/* 自定义标记样式 */
.custom-marker {
  width: 30px;
  height: 30px;
  position: relative;
  transform-origin: bottom center;
  transition: transform 0.3s ease;
}

.custom-marker:hover {
  transform: scale(1.2);
}

.marker-image {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.marker-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 信息窗口样式 */
.info-window {
  width: 300px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  background-color: var(--card-bg);
  transform: translateY(-10px);
  opacity: 0;
  animation: fadeInUp 0.3s ease forwards;
}

@keyframes fadeInUp {
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.info-window .image {
  position: relative;
  height: 180px;
  overflow: hidden;
}

.info-window .image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.info-window .image-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  color: white;
}

.info-window .title {
  font-size: 18px;
  margin-bottom: 8px;
}

.info-window .meta {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
  font-size: 12px;
}

.info-window .meta svg {
  width: 14px;
  height: 14px;
  margin-right: 5px;
}

.info-window .description {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.info-window .article-btn {
  display: inline-flex;
  align-items: center;
  margin-top: 10px;
  color: white;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: var(--transition);
}

.info-window .article-btn:hover {
  color: var(--primary-color);
}

.info-window .arrow-wrapper {
  margin-left: 5px;
  width: 16px;
  height: 16px;
  position: relative;
}

.info-window .arrow {
  position: absolute;
  top: 50%;
  right: 0;
  width: 8px;
  height: 8px;
  border-top: 2px solid currentColor;
  border-right: 2px solid currentColor;
  transform: translateY(-50%) rotate(45deg);
  transition: transform 0.3s ease;
}

.info-window .article-btn:hover .arrow {
  transform: translateY(-50%) rotate(45deg) translateX(3px);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .map-controls {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .button-group {
    flex-wrap: wrap;
  }
  
  .amap-scale-text {
    bottom: 140px;
  }
}
```

## 5. 配置说明

在Hexo博客的`_config.yml`文件中添加以下配置：

```yaml
# 足迹地图插件配置
footprint:
  enable: true                  # 是否启用插件
  gaoDeKey: 'your_gaode_key'    # 高德地图API密钥
  title: '足迹'                 # 页面标题
  logoName: '足迹'              # Logo名称
  describe: '每一处足迹都充满了故事，那是对人生的思考和无限的风光。' # 描述文本
  hsla: '200, 100%, 50%'        # 主题色HSLA值
  mapStyle: 'amap://styles/normal' # 地图样式
  path: 'footprints'            # 访问路径
  footprints:                   # 足迹数据
    - name: '北京'              # 地点名称
      latitude: 39.9042         # 纬度
      longitude: 116.4074       # 经度
      image: 'https://example.com/beijing.jpg' # 图片URL
      footprintType: '城市'
      createTime: '2024-01-01'
      address: '北京市'
      description: '中国的首都'
      article: 'https://example.com/beijing-article'
    - name: '上海'
      latitude: 31.2304
      longitude: 121.4737
      image: 'https://example.com/shanghai.jpg'
      footprintType: '城市'
      createTime: '2024-02-01'
      address: '上海市'
      description: '中国的经济中心'
      article: 'https://example.com/shanghai-article'
```

## 6. 使用方法

1. 安装插件：
   ```bash
   npm install hexo-footprint --save
   ```

2. 在Hexo博客的`_config.yml`中配置插件（参考第5节）。

3. 获取高德地图API密钥：
   - 访问[高德地图开放平台](https://lbs.amap.com/)
   - 注册账号并创建应用
   - 获取Web端API密钥

4. 将获取到的API密钥填入配置中。

5. 添加足迹数据到配置中。

6. 启动Hexo服务器：
   ```bash
   hexo server
   ```

7. 访问`http://localhost:4000/footprints`查看足迹地图。

## 7. 开发步骤

1. 创建插件项目结构（参考第3节）。

2. 实现插件入口文件`index.js`，处理配置、路由和资源注入。

3. 编写页面模板`footprint.ejs`，引入高德地图API并设置页面结构。

4. 实现JavaScript逻辑`footprint.js`，处理地图初始化、标记点和交互。

5. 编写样式文件`footprint.css`，美化页面和交互元素。

6. 测试插件功能，确保在Hexo环境中正常运行。

7. 发布插件到npm。

## 8. 注意事项

1. 高德地图API需要申请密钥，确保在配置中正确填写。

2. 足迹数据可以从配置中加载，也可以扩展插件从其他数据源获取（如数据库、API等）。

3. 地图插件可能会增加页面加载时间，建议优化资源加载。

4. 确保遵循Hexo插件开发规范，特别是在处理静态资源和路由时。

5. 考虑添加更多功能，如足迹分类、搜索、时间轴等，以增强用户体验。

6. 对于生产环境，建议使用CDN加速静态资源加载。

7. 定期更新插件以适配Hexo和高德地图API的新版本。