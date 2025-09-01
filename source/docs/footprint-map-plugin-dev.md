---
title: Hexo博客足迹地图插件开发文档
date: 2023-01-01 12:00:00
categories:
  - 开发文档
tags:
  - Hexo
  - 插件
  - 地图
---

# Hexo博客足迹地图插件开发文档

## 功能概述

本插件将基于高德地图实现足迹地图功能，允许用户在Hexo博客中展示自己的旅行足迹。用户可以在地图上查看标记点、点击查看详情，并可以切换地图图层、缩放等交互操作。

## 技术栈

- Hexo 5.0+
- 高德地图API
- JavaScript
- HTML/CSS
- anzhiyu主题（适配）

## 目录结构

```
Blog/
├── source/
│   ├── _data/
│   │   └── footprints.json       # 足迹数据
│   ├── docs/
│   │   └── footprint-map-plugin-dev.md  # 本文档
│   ├── footprints/              # 足迹地图页面
│   │   └── index.md
│   └── js/
│       └── footprint.js         # 地图交互逻辑
└── themes/
    └── anzhiyu/
        └── layout/
            └── page/
                └── footprint.ejs  # 足迹地图页面模板
```

## 详细实现步骤

### 1. 创建足迹数据文件

在`source/_data`目录下创建`footprints.json`文件，用于存储足迹数据：

```json
{
  "gaoDeKey": "your_gaode_api_key",
  "title": "我的足迹地图",
  "logoName": "足迹",
  "describe": "记录生活的每一步",
  "hsla": "200, 100%, 50%",
  "mapStyle": "amap://styles/normal",
  "footprints": [
    {
      "id": 1,
      "spec": {
        "longitude": 116.404,          # 经度
        "latitude": 39.915,           # 纬度
        "name": "北京天安门",        # 地点名称
        "footprintType": "景点",     # 类型
        "createTime": "2023-10-01",  # 时间
        "address": "北京市东城区",    # 地址
        "description": "参观了天安门广场",  # 描述
        "image": "https://example.com/beijing.jpg",  # 图片
        "article": "/posts/beijing-trip/"  # 相关文章链接
      }
    },
    // 更多足迹...
  ]
}
```

### 2. 创建足迹地图页面模板

在`themes/anzhiyu/layout/page`目录下创建`footprint.ejs`文件，用于渲染足迹地图页面：

```ejs
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><%= page.title || config.title %></title>
    <!-- 引入高德地图API -->
    <script type="text/javascript">
        window._AMapSecurityConfig = {
            securityJsCode: '<%= theme.footprint.gaoDeKey %>'
        }
    </script>
    <script type="text/javascript" src="https://webapi.amap.com/maps?v=2.0&key=<%= theme.footprint.gaoDeKey %>"></script>
    <!-- 引入jQuery -->
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <!-- 注入配置信息 -->
    <script>
        window.FOOTPRINT_CONFIG = {
            amapKey: '<%= theme.footprint.gaoDeKey %>',
            footprints: <%- JSON.stringify(theme.footprint.footprints) %>,
            title: '<%= theme.footprint.title %>',
            logoName: '<%= theme.footprint.logoName %>',
            describe: '<%= theme.footprint.describe %>',
            hsla: '<%= theme.footprint.hsla %>',
            mapStyle: '<%= theme.footprint.mapStyle %>'
        };
    </script>
    <!-- 引入自定义CSS -->
    <link rel="stylesheet" href="/css/footprint.css">
</head>
<body id="footprint-page">
    <div class="footprint-container">
        <!-- 地图容器 -->
        <div id="footprint-map"></div>

        <!-- 左下角Logo和文字 -->
        <div class="logo-container">
            <h1 class="footprint-logo"><%= theme.footprint.logoName %><span class="logo-version">2024</span></h1>
            <p class="footprint-slogan"><%= theme.footprint.describe %></p>
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
    <!-- 引入地图交互脚本 -->
    <script src="/js/footprint.js"></script>
</body>
</html>
```

### 3. 创建足迹地图页面

在`source/footprints`目录下创建`index.md`文件，用于生成足迹地图页面：

```markdown
---
title: 我的足迹地图
layout: footprint
---
```

### 4. 创建地图交互脚本

在`source/js`目录下创建`footprint.js`文件，用于处理地图交互逻辑：

```javascript
// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', () => {
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
        zoom: 4,
        center: [105.000, 35.000],
        mapStyle: window.FOOTPRINT_CONFIG.mapStyle,
        showIndoorMap: false
    });

    // 添加地图控件
    map.addControl(new AMap.Scale());
    map.addControl(new AMap.Zoom());

    // 创建图层
    const layers = {
        satellite: new AMap.TileLayer.Satellite({
            zIndex: 0,
            opacity: 1
        }),
        road: new AMap.TileLayer.RoadNet({
            zIndex: 1,
            opacity: 0.6
        }),
        traffic: new AMap.TileLayer.Traffic({
            zIndex: 2,
            opacity: 0.6
        })
    };

    // 图层状态
    const layerState = {
        baseLayer: 'normal',
        overlays: {
            road: false,
            traffic: false
        }
    };

    // 添加卫星图层
    map.add(layers.satellite);
    layers.satellite.hide();

    // 添加足迹标记
    addFootprintMarkers(map, window.FOOTPRINT_CONFIG.footprints);

    // 初始化图层切换事件
    initializeLayerEvents(map, layers, layerState);

    // 初始化缩放控制
    initializeZoomControls(map);

    // 显示元素动画
    showElements();
}

// 显示元素动画
function showElements() {
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
}

// 初始化图层切换事件
function initializeLayerEvents(map, layers, layerState) {
    // 图层切换按钮事件
    document.querySelectorAll('.control-btn, .plane-switch input').forEach(btn => {
        btn.addEventListener('click', function() {
            const type = this.dataset.type || this.getAttribute('data-type');
            if (type) {
                handleLayerChange(this, type, layerState, map, layers);
            }
        });
    });
}

// 处理图层切换
function handleLayerChange(btn, type, layerState, map, layers) {
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
}

// 更新图层
function updateLayers(layerState, layers) {
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
}

// 初始化缩放控制
function initializeZoomControls(map) {
    // 放大按钮
    document.getElementById('zoom-in').addEventListener('click', () => {
        const currentZoom = map.getZoom();
        if (currentZoom < 18) {
            map.zoomIn();
        }
    });

    // 缩小按钮
    document.getElementById('zoom-out').addEventListener('click', () => {
        const currentZoom = map.getZoom();
        if (currentZoom > 3) {
            map.zoomOut();
        }
    });
}

// 创建标记点
function createMarker(spec) {
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
}

// 添加足迹标记
function addFootprintMarkers(map, footprintData) {
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
        const longitude = parseFloat(footprint.spec.longitude);
        const latitude = parseFloat(footprint.spec.latitude);

        if (isNaN(longitude) || isNaN(latitude)) {
            console.warn('无效的经纬度数据:', footprint);
            return;
        }

        try {
            const position = new AMap.LngLat(longitude, latitude);
            const marker = new AMap.Marker({
                position: position,
                content: createMarker(footprint.spec),
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
                const content = createInfoWindow(footprint.spec);

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
}

// 移动到指定位置
function moveToLocation(map, position) {
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
}

// 创建信息窗口内容
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
```

### 5. 创建自定义CSS

在`source/css`目录下创建`footprint.css`文件，用于样式美化：

```css
/* 足迹地图样式 */
#footprint-page {
    --footprint-hsla: 200, 100%, 50%;
    margin: 0;
    padding: 0;
    font-family: 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
    overflow: hidden;
}

.footprint-container {
    position: relative;
    width: 100vw;
    height: 100vh;
}

#footprint-map {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    z-index: 0;
}

.logo-container {
    position: absolute;
    bottom: 60px;
    left: 20px;
    z-index: 10;
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(10px);
    padding: 15px 20px;
    border-radius: 10px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    opacity: 0;
    transform: translateY(20px);
    transition: all 0.5s ease;
}

.logo-container.show {
    opacity: 1;
    transform: translateY(0);
}

.footprint-logo {
    font-size: 24px;
    font-weight: bold;
    margin: 0;
    color: hsl(var(--footprint-hsla));
    transition: color 0.3s ease;
}

.logo-version {
    font-size: 14px;
    color: #888;
    margin-left: 5px;
}

.footprint-slogan {
    font-size: 14px;
    color: #666;
    margin: 5px 0 0 0;
    max-width: 200px;
}

.map-controls {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(10px);
    padding: 10px 15px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    gap: 15px;
    opacity: 0;
    transform: translateX(-50%) translateY(20px);
    transition: all 0.5s ease;
}

.map-controls.show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
}

.button-group {
    display: flex;
    gap: 10px;
}

.control-btn {
    padding: 6px 12px;
    background: transparent;
    border: 1px solid hsl(var(--footprint-hsla));
    border-radius: 4px;
    color: hsl(var(--footprint-hsla));
    font-size: 14px;
    cursor: pointer;
    transition: all 0.3s ease;
    opacity: 0;
    transform: translateY(10px);
}

.control-btn.show {
    opacity: 1;
    transform: translateY(0);
}

.control-btn.active {
    background: hsl(var(--footprint-hsla));
    color: white;
}

.control-btn:hover:not(.active) {
    background: hsla(var(--footprint-hsla), 0.1);
}

.control-btn.btn-clicked {
    transform: scale(0.95);
}

.plane-switch {
    display: flex;
    align-items: center;
    cursor: pointer;
}

.plane-switch input {
    display: none;
}

.plane-switch div {
    position: relative;
    width: 40px;
    height: 20px;
    background: #ddd;
    border-radius: 10px;
    margin-right: 5px;
    transition: background 0.3s ease;
}

.plane-switch input:checked + div {
    background: hsl(var(--footprint-hsla));
}

.plane-switch div div {
    position: absolute;
    width: 16px;
    height: 16px;
    background: white;
    border-radius: 50%;
    top: 2px;
    left: 2px;
    transition: left 0.3s ease;
}

.plane-switch input:checked + div div {
    left: 22px;
}

.switch-text {
    font-size: 14px;
    color: #666;
}

.zoom-buttons {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.zoom-btn {
    width: 30px;
    height: 30px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 18px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s ease;
}

.zoom-btn:hover {
    background: hsl(var(--footprint-hsla));
    color: white;
    border-color: hsl(var(--footprint-hsla));
}

.amap-scale-text {
    font-size: 12px;
    color: #666;
    white-space: nowrap;
}

/* 自定义标记样式 */
.custom-marker {
    width: 30px;
    height: 30px;
    position: relative;
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
    width: 280px;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.image {
    position: relative;
    width: 100%;
    height: 180px;
    overflow: hidden;
}

.image img {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.image-info {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
    color: white;
    padding: 15px 10px 10px;
}

.title {
    font-size: 18px;
    margin: 0 0 10px 0;
    color: white;
}

.meta {
    display: flex;
    align-items: center;
    font-size: 12px;
    margin-bottom: 5px;
    color: rgba(255, 255, 255, 0.8);
}

.meta svg {
    width: 14px;
    height: 14px;
    margin-right: 5px;
}

.description {
    font-size: 13px;
    line-height: 1.4;
    margin: 10px 0 0 0;
    color: rgba(255, 255, 255, 0.9);
}

.article-btn {
    display: inline-flex;
    align-items: center;
    margin-top: 10px;
    padding: 5px 10px;
    background: hsl(var(--footprint-hsla));
    color: white;
    border-radius: 4px;
    font-size: 13px;
    text-decoration: none;
    transition: all 0.3s ease;
}

.article-btn:hover {
    background: hsl(var(--footprint-hsla), 0.9);
}

.arrow-wrapper {
    margin-left: 5px;
    width: 15px;
    height: 15px;
    position: relative;
}

.arrow {
    position: absolute;
    top: 50%;
    right: 0;
    width: 8px;
    height: 8px;
    border-top: 2px solid white;
    border-right: 2px solid white;
    transform: translateY(-50%) rotate(45deg);
}

/* 动画效果 */
.scale-in {
    animation: scaleIn 0.3s ease forwards;
}

@keyframes scaleIn {
    0% {
        transform: scale(0.9);
        opacity: 0;
    }
    100% {
        transform: scale(1);
        opacity: 1;
    }
}

.map-transitioning {
    transition: opacity 0.5s ease;
}

.map-shake {
    animation: mapShake 0.4s ease;
}

@keyframes mapShake {
    0%, 100% {
        transform: translateX(0);
    }
    25% {
        transform: translateX(-2px);
    }
    75% {
        transform: translateX(2px);
    }
}
```

### 6. 配置主题

在`themes/anzhiyu/_config.anzhiyu.yml`中添加足迹地图配置：

```yaml
# 足迹地图配置
footprint:
  enable: true
  gaoDeKey: "your_gaode_api_key"  # 替换为你的高德地图API密钥
  title: "我的足迹地图"
  logoName: "足迹"
  describe: "记录生活的每一步"
  hsla: