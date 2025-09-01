# Hexo博客足迹地图功能开发文档

## 功能概述

本功能基于高德地图API，在Hexo博客的fcircle页面实现足迹地图展示。用户可以在地图上查看标记的地点，点击标记可以查看详细信息。

## 技术栈

- Hexo博客框架
- 高德地图API 2.0
- JavaScript
- CSS
- Pug模板引擎

## 实现步骤

### 1. 项目结构分析

```
Blog/
├── source/
│   ├── css/
│   │   └── amap-footprint.css  // 足迹地图样式
│   └── js/
│       ├── amap-footprint.js   // 足迹地图逻辑
│       └── footprint-poem.js   // 足迹诗句功能
└── themes/
    └── anzhiyu/
        └── layout/
            └── includes/
                └── page/
                    └── fcircle.pug  // fcircle页面模板
```

### 2. 配置高德地图API

在`fcircle.pug`中引入高德地图API，替换为您自己的API密钥：
```pug
script(src="https://webapi.amap.com/maps?v=2.0&key=您的API密钥")
```

### 3. 实现地图初始化

编辑`amap-footprint.js`文件，实现地图初始化功能：
```javascript
function initFootprintMap() {
  const container = document.getElementById('footprint-container');
  if (!container) {
    console.error('足迹地图容器不存在');
    return;
  }

  // 初始化地图
  const map = new AMap.Map('footprint-container', {
    zoom: 10,
    center: [116.397428, 39.90923],  // 默认北京
    mapStyle: 'amap://styles/normal',
    resizeEnable: true
  });

  // 添加标记点、信息窗口等功能
  // ...
}
```

### 4. 样式设计

编辑`amap-footprint.css`文件，设计地图容器和相关元素的样式：
```css
#footprint-container {
  width: 100%;
  height: 600px;
  margin: 0 auto;
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--anzhiyu-shadow-border);
}

/* 响应式调整 */
@media screen and (max-width: 768px) {
  #footprint-container {
    height: 400px;
  }
}
```

## 配置说明

### 1. 主题颜色配置

在`_config.anzhiyu.yml`中配置主题颜色：
```yaml
# 主题颜色
theme_color:
  main: '#4285f4'  # 主色调
  hover: '#3367d6'  # 悬停色
```

### 2. 地图配置

在`fcircle.pug`中可以配置地图的初始参数：
```pug
script.
  window.FOOTPRINT_CONFIG = {
    amapKey: '您的API密钥',
    defaultCenter: [116.397428, 39.90923],  // 默认中心点
    defaultZoom: 10,  // 默认缩放级别
    mapStyle: 'amap://styles/normal',  // 地图样式
    footprints: []  // 足迹数据
  };
```

## 使用方法

### 1. 添加足迹数据

可以通过以下方式添加足迹数据：
```javascript
// 在amap-footprint.js中添加足迹数据
const footprints = [
  {
    id: 1,
    name: '北京',
    longitude: 116.397428,
    latitude: 39.90923,
    image: 'https://example.com/beijing.jpg',
    description: '北京是中国的首都',
    createTime: '2023-05-15'
  },
  // 更多足迹...
];
```

### 2. 显示足迹标记

在`initFootprintMap`函数中添加显示足迹标记的代码：
```javascript
function addFootprintMarkers(map, footprints) {
  footprints.forEach(footprint => {
    const marker = new AMap.Marker({
      position: new AMap.LngLat(footprint.longitude, footprint.latitude),
      title: footprint.name,
      // 自定义标记样式
      content: `<div class='custom-marker'>${footprint.name}</div>`
    });

    // 添加点击事件
    marker.on('click', function() {
      // 显示信息窗口
      const infoWindow = new AMap.InfoWindow({
        content: `<div><h3>${footprint.name}</h3><p>${footprint.description}</p></div>`,
        offset: new AMap.Pixel(0, -30)
      });
      infoWindow.open(map, marker.getPosition());
    });

    map.add(marker);
  });
}
```

## 响应式设计和兼容性

### 1. 响应式设计

通过CSS媒体查询实现响应式设计：
```css
@media screen and (max-width: 768px) {
  #footprint-container {
    height: 400px;
  }
  /* 调整移动端的其他样式 */
}
```

### 2. 兼容性考虑

- 使用标准的JavaScript和CSS语法
- 避免使用浏览器特定的API
- 为不支持某些特性的浏览器提供降级方案
- 测试主流浏览器（Chrome、Firefox、Safari、Edge）

## 常见问题

1. 地图不显示：检查API密钥是否正确，网络是否正常
2. 标记点不显示：检查经纬度数据是否正确
3. 响应式问题：检查CSS媒体查询是否正确

## 更新日志

- 2023-05-15: 初始版本