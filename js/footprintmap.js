// 足迹地图功能实现

// 全局变量
window.map = window.map || null;
window.markers = window.markers || [];
let footprintsData = [];
let filteredFootprints = [];
window.mapTrafficLayer = window.mapTrafficLayer || null;
window.mapBuildingLayer = window.mapBuildingLayer || null;

// 配置常量
const AMapConfig = {
  key: 'dc1eaa8e383ff12ca596ba00fe2b2ed1',
  securityJsCode: 'dc1eaa8e383ff12ca596ba00fe2b2ed1',
  version: '2.0',
  retry: {
    max: 3,
    delay: 1000
  }
};

// 全局错误捕获
if (typeof window !== 'undefined') {
  // 捕获未处理的JavaScript错误
  window.addEventListener('error', function(event) {
    console.error('捕获到JavaScript错误:', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error
    });
    
    // 如果错误与地图相关且地图未初始化，尝试重新初始化
    if (!window.map && event.filename && event.filename.includes('amap.com')) {
      console.error('地图API加载或执行错误，将尝试重新初始化');
      setTimeout(() => {
        initializeMap();
      }, 1000);
    }
  });
  
  // 捕获Promise错误
  window.addEventListener('unhandledrejection', function(event) {
    console.error('捕获到Promise错误:', {
      reason: event.reason,
      promise: event.promise
    });
  });
}

// 初始化地图的主函数
async function initializeMap() {
  console.log('开始初始化足迹地图...');
  
  // 设置全局错误处理
  window.mapErrorCallback = (errorMsg) => {
    console.error('全局地图错误:', errorMsg);
    showMapError();
  };
  
  try {
    // 1. 等待页面加载完成
    await waitForDocumentReady();
    console.log('文档已准备就绪');
    
    // 2. 加载高德地图API
    await loadAMapScript();
    console.log('高德地图API加载完成');
    
    // 3. 设置首次加载标志
    window.isFirstLoad = true;
    
    // 4. 加载足迹数据
    loadFootprintsData();
    console.log('足迹数据加载完成，共', filteredFootprints.length, '个足迹');
    
    // 5. 初始化地图实例（Promise方式）
    const map = await initMap();
    if (!map) {
      throw new Error('地图初始化失败');
    }
    console.log('地图初始化成功');
    
    // 6. 绑定事件
    bindEvents();
    console.log('事件绑定完成');
    
    // 7. 更新统计信息
    updateStats();
    
    console.log('地图初始化完成');
    return map; // 返回地图实例供外部使用
  } catch (error) {
    console.error('地图初始化失败:', error);
    console.error('错误堆栈:', error.stack);
    if (window.mapErrorCallback) {
      window.mapErrorCallback(error.message || '初始化失败');
    }
    return null;
  }
}

// 等待文档加载完成
function waitForDocumentReady() {
  return new Promise((resolve) => {
    if (document.readyState === 'complete') {
      resolve();
    } else {
      window.addEventListener('load', resolve);
    }
  });
}

// 动态加载高德地图API（Promise封装）
function loadAMapScript() {
  return new Promise((resolve, reject) => {
    // 检查AMap是否已经加载
    if (typeof AMap !== 'undefined') {
      console.log('高德地图API已加载');
      resolve();
      return;
    }
    
    // 设置安全密钥
    window._AMapSecurityConfig = {
      securityJsCode: AMapConfig.securityJsCode
    };
    
    console.log('正在加载高德地图API...');
    
    // 移除可能存在的旧脚本
    const oldScript = document.querySelector('script[src*="webapi.amap.com"]');
    if (oldScript) {
      oldScript.remove();
    }
    
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=${AMapConfig.version}&key=${AMapConfig.key}`;
    script.type = 'text/javascript';
    script.async = true;
    
    script.onload = function() {
      if (typeof AMap !== 'undefined') {
        console.log('高德地图API加载成功');
        resolve();
      } else {
        reject(new Error('高德地图API加载后未定义'));
      }
    };
    
    script.onerror = function() {
      reject(new Error('高德地图API加载失败'));
    };
    
    document.head.appendChild(script);
  });
}

// 初始化函数
function init() {
  initializeMap();
}

// 显示地图错误信息
function showMapError() {
  console.log('显示地图错误信息');
  const mapContainer = document.getElementById('footprint-map') || document.getElementById('map');
  if (mapContainer) {
    mapContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #ff4d4f; text-align: center;">
        <div style="font-size: 24px; margin-bottom: 16px;">地图加载失败</div>
        <div style="margin-bottom: 20px;">可能是由于网络问题或API密钥错误</div>
        <button id="retry-map-btn" style="padding: 8px 16px; background-color: #1890ff; color: white; border: none; border-radius: 4px; cursor: pointer;">
          重试加载
        </button>
      </div>
    `;
    
    // 添加重试按钮事件
    document.getElementById('retry-map-btn').addEventListener('click', function() {
      console.log('用户点击重试按钮');
      mapContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #1890ff;">正在重新加载地图...</div>';
      loadAMapScript();
    });
  }
}

// 更新统计信息
function updateStats() {
  const totalFootprints = document.getElementById('total-footprints');
  const totalCities = document.getElementById('total-cities');
  const totalTypes = document.getElementById('total-types');
  
  if (totalFootprints) {
    totalFootprints.textContent = filteredFootprints.length;
  }
  
  if (totalCities) {
    // 提取所有城市（从地址中提取）
    const cities = new Set();
    filteredFootprints.forEach(fp => {
      if (fp.address) {
        // 简单提取城市名称（假设地址格式为"XX市..."）
        const cityMatch = fp.address.match(/(.+?[市县区])/);
        if (cityMatch && cityMatch[1]) {
          cities.add(cityMatch[1]);
        }
      }
    });
    totalCities.textContent = cities.size;
  }
  
  if (totalTypes) {
    // 提取所有足迹类型
    const types = new Set();
    filteredFootprints.forEach(fp => {
      if (fp.footprintType) {
        types.add(fp.footprintType);
      }
    });
    totalTypes.textContent = types.size;
  }
}

// 侧边栏相关功能已移除，侧边栏现在始终固定显示
// 移除了createSidebarOverlay和toggleSidebar函数

// 加载足迹数据
function loadFootprintsData() {
  // 由于Hexo在构建时会将_data目录下的JSON文件解析为数据对象
  // 这里我们假设footprints数据已经通过模板注入到页面中
  if (window.footprintsData) {
    footprintsData = window.footprintsData.footprints || [];
    filteredFootprints = [...footprintsData];
    updateFootprintList();
    updateStats();
    
    // 确保地图初始化后再添加标记
    if (map) {
      addMarkersToMap();
    } else {
      // 地图初始化时会检查数据并添加标记
      console.log('Map not initialized yet, markers will be added when map is ready');
    }
  } else {
    console.warn('No footprints data found in window.footprintsData');
    
    // 备选方案：创建模拟数据用于测试
    console.log('Creating mock data for testing');
    createMockFootprintsData();
    
    // 备选方案：通过AJAX加载数据
    fetch('/_data/footprints.json')
      .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
      })
      .then(data => {
        console.log('Loaded data from JSON file:', data);
        footprintsData = data.footprints || [];
        filteredFootprints = [...footprintsData];
        updateFootprintList();
        updateStats();
        if (map) addMarkersToMap();
      })
      .catch(error => {
        console.error('Failed to load footprints data:', error);
        const footprintList = document.getElementById('footprint-list');
        if (footprintList) {
          footprintList.innerHTML = '<div class="error-message">数据加载失败，已使用模拟数据</div>';
        }
      });
  }
}

// 创建模拟数据用于测试
function createMockFootprintsData() {
  footprintsData = [
    {
      id: '1',
      name: '北京市',
      address: '北京市',
      longitude: 116.4074,
      latitude: 39.9042,
      footprintType: '旅游',
      createTime: '2024-01-15',
      description: '首都之旅，参观了故宫、长城等著名景点',
      image: 'https://picsum.photos/400/300?random=1'
    },
    {
      id: '2',
      name: '上海市',
      address: '上海市',
      longitude: 121.4737,
      latitude: 31.2304,
      footprintType: '工作',
      createTime: '2024-02-20',
      description: '商务出差，参观了上海中心大厦',
      image: 'https://picsum.photos/400/300?random=2'
    },
    {
      id: '3',
      name: '广州市',
      address: '广东省广州市',
      longitude: 113.2644,
      latitude: 23.1291,
      footprintType: '旅游',
      createTime: '2024-03-10',
      description: '美食之旅，品尝了广州特色美食',
      image: 'https://picsum.photos/400/300?random=3'
    }
  ];
  filteredFootprints = [...footprintsData];
  updateFootprintList();
  updateStats();
}

// 关闭模态框函数
function closeModal() {
  const modal = document.getElementById('footprint-modal');
  if (!modal) return;
  
  const modalContent = modal.querySelector('.modal-content');
  if (modalContent) {
    modalContent.classList.remove('show');
  }
  
  setTimeout(() => {
    modal.style.display = 'none';
  }, 300);
}

// 验证地图容器
function validateMapContainer() {
  console.log('开始验证地图容器');
  
  // 尝试获取两个可能的地图容器
  const container1 = document.getElementById('footprint-map');
  const container2 = document.getElementById('map');
  
  // 使用第一个找到的容器
  let container = container1 || container2;
  
  if (!container) {
    console.error('未找到地图容器 (footprint-map 或 map)');
    return null;
  }
  
  console.log('找到地图容器:', container.id);
  
  // 重置容器样式，确保没有冲突
  console.log('重置地图容器样式');
  container.style.cssText = '';
  
  // 设置必要的容器样式
  container.style.width = '100%';
  container.style.height = '600px';
  container.style.position = 'relative';
  container.style.minWidth = '300px';
  container.style.minHeight = '400px';
  container.style.background = '#f0f2f5';
  container.style.overflow = 'hidden';
  container.style.zIndex = '10';
  container.style.border = 'none';
  
  // 递归检查并修复所有祖先容器
  console.log('检查并修复所有祖先容器');
  let currentParent = container.parentElement;
  let depth = 0;
  
  while (currentParent && depth < 5) { // 最多检查5层祖先元素
    console.log(`检查祖先容器 (层级 ${depth}):`, currentParent.id || currentParent.tagName);
    
    // 获取计算样式
    const parentStyle = window.getComputedStyle(currentParent);
    
    // 检查并修复position
    if (parentStyle.position === 'static') {
      console.log(`修复祖先容器position: 从 static 改为 relative`);
      currentParent.style.position = 'relative';
    }
    
    // 检查并修复width
    const computedWidth = parentStyle.width;
    if (computedWidth === '0px' || computedWidth === 'auto' || 
        (parseInt(computedWidth) <= 10 && computedWidth.includes('px'))) {
      console.log(`修复祖先容器width: 从 ${computedWidth} 改为 100%`);
      currentParent.style.width = '100%';
    }
    
    // 检查并修复height (如果是直接父容器)
    if (depth === 0) {
      const computedHeight = parentStyle.height;
      if (computedHeight === '0px' || computedHeight === 'auto') {
        console.log(`修复直接父容器height: 从 ${computedHeight} 改为 600px`);
        currentParent.style.height = '600px';
      }
    }
    
    // 检查并修复overflow
    if (parentStyle.overflow === 'hidden' && depth > 0) {
      console.log(`修复祖先容器overflow: 从 hidden 改为 visible`);
      currentParent.style.overflow = 'visible';
    }
    
    // 检查z-index
    const zIndex = parentStyle.zIndex;
    if (zIndex !== 'auto' && parseInt(zIndex) < 1) {
      console.log(`修复祖先容器z-index: 从 ${zIndex} 改为 1`);
      currentParent.style.zIndex = '1';
    }
    
    // 移动到上一级
    currentParent = currentParent.parentElement;
    depth++;
  }
  
  // 最后检查一次容器尺寸
  setTimeout(() => {
    const rect = container.getBoundingClientRect();
    console.log(`地图容器最终尺寸: width=${rect.width}px, height=${rect.height}px`);
    
    if (rect.width <= 0 || rect.height <= 0) {
      console.error('警告：地图容器尺寸仍然为零！');
      
      // 尝试更激进的修复
      container.style.width = '800px';
      container.style.height = '600px';
      container.style.minWidth = '800px';
      container.style.minHeight = '600px';
      container.style.maxWidth = 'none';
      container.style.maxHeight = 'none';
      container.style.display = 'block';
      
      // 给直接父容器设置固定尺寸
      const directParent = container.parentElement;
      if (directParent) {
        directParent.style.width = '800px';
        directParent.style.height = '600px';
      }
      
      // 再次检查
      setTimeout(() => {
        const finalRect = container.getBoundingClientRect();
        console.log(`激进修复后地图容器尺寸: width=${finalRect.width}px, height=${finalRect.height}px`);
      }, 100);
    }
  }, 100);
  
  return container;
}

// 初始化地图（返回Promise）
async function initMap() {
  return new Promise((resolve, reject) => {
      console.log('开始初始化地图');
      
      // 先验证地图容器
      const mapContainer = validateMapContainer();
      if (!mapContainer) {
        const error = new Error('未找到有效的地图容器');
        console.error(error.message);
        reject(error);
        return;
      }
      
      // 确保地图包装器也有正确的样式
      const mapWrapper = mapContainer.parentElement;
      if (mapWrapper && mapWrapper.classList.contains('map-wrapper')) {
        mapWrapper.style.width = 'auto';
        mapWrapper.style.height = '100%';
      }
      
      try {
        // 增强地图API可用性检查
        console.log('检查地图API可用性');
        if (typeof AMap === 'undefined') {
          const error = new Error('高德地图API未加载');
          console.error(error.message);
          // 尝试重新加载API
          loadAMapScript();
          reject(error);
          return;
        }
        
        console.log('AMap对象存在，版本信息:', AMap.version || '未知版本');
        
        // 双重设置安全密钥（URL中已有，但再单独设置一次确保安全）
        console.log('设置地图安全密钥');
        window._AMapSecurityConfig = window._AMapSecurityConfig || {};
        window._AMapSecurityConfig.securityJsCode = 'dc1eaa8e383ff12ca596ba00fe2b2ed1';
        // 同时尝试通过AMap全局设置
        if (AMap.setSecurityConfig) {
          AMap.setSecurityConfig({ securityJsCode: 'dc1eaa8e383ff12ca596ba00fe2b2ed1' });
        }
        
        // 强制设置地图容器样式
        console.log('强制设置地图容器样式');
        mapContainer.style.cssText = 'width:100%;height:600px;position:relative;overflow:hidden;background:#f0f2f5;z-index:10;border:none;';
        
        // 确保父容器有正确的样式
        const parentContainer = mapContainer.parentElement;
        if (parentContainer) {
          parentContainer.style.position = 'relative';
          parentContainer.style.width = '100%';
          parentContainer.style.height = '600px';
          parentContainer.style.overflow = 'visible';
        }
        
        // 强制重排
        mapContainer.offsetHeight;
        
        console.log('当前地图容器尺寸:', mapContainer.offsetWidth, 'x', mapContainer.offsetHeight);
        
        // 使用更简化的配置，从2D模式开始以提高兼容性
        console.log('开始创建地图实例，使用容器ID:', mapContainer.id);
        try {
          window.map = new AMap.Map(mapContainer, {
            zoom: 5,
            center: [104.114129, 37.550339], // 中国中心点
            viewMode: '2D', // 使用2D模式以提高兼容性
            resizeEnable: true,
            zoomEnable: true,
            dragEnable: true,
            pitch: 0,
            rotation: 0,
            features: ['bg', 'point', 'road'] // 简化图层，提高加载速度
          });
          console.log('地图实例创建成功');
          
          // 添加高德地图原生控件
          console.log('开始添加高德地图原生控件');
          // 1. 控件栏：集成了缩放、旋转、倾斜等按钮的组合控件
          AMap.plugin(['AMap.ControlBar'], function() {
            const controlBar = new AMap.ControlBar({
              showZoomBar: true,
              showRotateCover: true,
              showControlButton: true
            });
            window.map.addControl(controlBar);
            console.log('控制栏控件添加成功');
          });
          
          // 2. 定位控件：显示当前位置
          AMap.plugin(['AMap.Geolocation'], function() {
            const geolocation = new AMap.Geolocation({
              enableHighAccuracy: true, // 是否使用高精度定位
              timeout: 10000, // 超时时间
              buttonOffset: new AMap.Pixel(10, 30), // 定位按钮的偏移量
              zoomToAccuracy: true // 定位成功后是否自动缩放
            });
            window.map.addControl(geolocation);
            console.log('定位控件添加成功');
          });
          
          // 3. 比例尺控件
          AMap.plugin(['AMap.Scale'], function() {
            const scale = new AMap.Scale();
            window.map.addControl(scale);
            console.log('比例尺控件添加成功');
          });
          
          // 4. 地图类型切换控件
          AMap.plugin(['AMap.MapType'], function() {
            const mapType = new AMap.MapType({
              defaultType: 0, // 默认地图类型 0:标准图, 1:卫星图, 2:卫星混合图
              showTraffic: false, // 叠加实时交通图层
              showRoad: true // 叠加道路图层
            });
            window.map.addControl(mapType);
            console.log('地图类型控件添加成功');
          });
          
          // 5. 鹰眼控件
          AMap.plugin(['AMap.OverView'], function() {
            const overView = new AMap.OverView({
              isOpen: true, // 是否默认打开
              visible: true // 是否可见
            });
            window.map.addControl(overView);
            console.log('鹰眼控件添加成功');
          });
        } catch (mapCreateError) {
          console.error('地图实例创建失败，尝试更基本的配置:', mapCreateError);
          // 尝试使用最基本的配置
          window.map = new AMap.Map(mapContainer, {
            zoom: 5,
            center: [104.114129, 37.550339],
            viewMode: '2D',
            resizeEnable: true
          });
        }
        
        if (!window.map) {
          const error = new Error('地图实例创建失败');
          console.error(error.message);
          reject(error);
          return;
        }
        
        // 添加窗口大小变化监听
        window.addEventListener('resize', function() {
          if (window.map && typeof window.map.resize === 'function') {
            console.log('窗口大小变化，调整地图尺寸');
            window.map.resize();
          }
        });
        
        // 添加地图加载完成事件监听
        window.map.on('complete', function() {
          console.log('地图加载完成');
          
          // 添加一个中心点标记以验证地图功能
          const centerMarker = new AMap.Marker({
            position: [104.114129, 37.550339],
            title: '中心点'
          });
          centerMarker.setMap(window.map);
          
          // 地图加载完成后添加标记
          if (filteredFootprints.length > 0) {
            addMarkersToMap();
          }
          
          // 地图初始化完成，解析Promise
          resolve(window.map);
        });
        
        // 监听地图错误事件
        window.map.on('error', function(error) {
          console.error('地图内部错误:', error);
          if (window.mapErrorCallback) {
            window.mapErrorCallback('地图内部错误');
          }
          reject(error);
        });
        
        // 延迟加载插件和图层，避免初始化冲突
        setTimeout(() => {
          console.log('延迟加载地图插件');
          
          // 加载城市搜索插件
          try {
            AMap.plugin(['AMap.CitySearch'], function() {
              console.log('城市搜索插件加载完成');
              var citySearch = new AMap.CitySearch();
              citySearch.getLocalCity(function(status, result) {
                console.log('获取本地城市结果:', status, result);
              });
            });
          } catch (pluginError) {
            console.error('加载插件时出错:', pluginError);
          }
          
          // 延迟加载图层
          setTimeout(() => {
            try {
              // 初始化建筑图层
              if (typeof AMap.Buildings === 'function' && window.map) {
                window.mapBuildingLayer = new AMap.Buildings({
                  zooms: [16, 18],
                  heightFactor: 2,
                  wallColor: 'rgba(53, 146, 225, 0.8)',
                  roofColor: 'rgba(53, 146, 225, 0.5)',
                  shadowColor: 'rgba(0, 0, 0, 0.2)'
                });
                window.mapBuildingLayer.setMap(window.map);
                console.log('建筑图层初始化成功');
              }
            } catch (buildingError) {
              console.error('初始化建筑图层失败:', buildingError);
            }
            
            try {
              // 初始化路况图层
              if (typeof AMap.TileLayer !== 'undefined' && AMap.TileLayer.Traffic && window.map) {
                window.mapTrafficLayer = new AMap.TileLayer.Traffic({
                  zIndex: 10
                });
                window.mapTrafficLayer.setMap(null); // 默认不显示
                console.log('路况图层初始化成功');
              }
            } catch (trafficError) {
              console.error('初始化路况图层失败:', trafficError);
            }
          }, 1000);
        }, 500);
        
        console.log('地图初始化流程完成');
        
        // 超时处理
        setTimeout(() => {
          if (window.map && window.map.getStatus && window.map.getStatus() !== 'complete') {
            const timeoutError = new Error('地图初始化超时');
            console.error(timeoutError.message);
            reject(timeoutError);
          }
        }, 10000); // 10秒超时
        
      } catch (error) {
        console.error('地图初始化异常:', error);
        console.error('错误堆栈:', error.stack);
        window.map = null; // 重置map实例，以便重试机制能够正确检测
        
        // 更友好的错误提示
        const mapContainer = document.getElementById('footprint-map') || document.getElementById('map');
        if (mapContainer) {
          mapContainer.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px; color: #ff4d4f;">
              <h3>地图加载失败</h3>
              <p>${error.message || '未知错误'}</p>
              <button onclick="location.reload()" style="margin-top: 10px; padding: 5px 15px; background: #1890ff; color: white; border: none; border-radius: 4px; cursor: pointer;">
                刷新重试
              </button>
            </div>
          `;
        }
        
        // 触发错误回调
        if (window.mapErrorCallback) {
          window.mapErrorCallback('初始化异常');
        }
        
        reject(error);
      }
    });
  }

// 切换地图类型
function switchMapType(type) {
  if (!map) return;
  
  // 移除active类
  document.querySelectorAll('.map-type-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // 添加active类到当前按钮
  const currentBtn = document.getElementById(`map-type-${type}`);
  if (currentBtn) {
    currentBtn.classList.add('active');
  }
  
  // 切换地图类型
  if (type === 'satellite') {
    map.setFeatures(['bg', 'point', 'road']);
    if (mapBuildingLayer) mapBuildingLayer.setMap(null);
  } else { // standard
    map.setFeatures(['bg', 'point', 'road', 'building']);
    if (mapBuildingLayer) mapBuildingLayer.setMap(map);
  }
}

// 切换路况显示
function toggleTraffic() {
  if (!map || !mapTrafficLayer) return;
  
  const checkbox = document.getElementById('map-traffic');
  if (checkbox) {
    if (checkbox.checked) {
      mapTrafficLayer.setMap(map);
    } else {
      mapTrafficLayer.setMap(null);
    }
  }
}

// 切换建筑显示
function toggleBuilding() {
  if (!map || !mapBuildingLayer) return;
  
  const checkbox = document.getElementById('map-building');
  if (checkbox) {
    if (checkbox.checked) {
      mapBuildingLayer.setMap(map);
    } else {
      mapBuildingLayer.setMap(null);
    }
  }
}

// 添加标记到地图
function addMarkersToMap() {
  // 确保window.markers存在
  window.markers = window.markers || [];
  
  // 检查地图实例是否存在
  if (!window.map) {
    console.error('Cannot add markers: map is not initialized');
    return;
  }
  
  // 清除现有标记
  if (window.markers.length > 0) {
    try {
      window.map.remove(window.markers);
    } catch (error) {
      console.error('Failed to remove markers:', error);
    }
    window.markers = [];
  }
  
  // 添加新标记
  filteredFootprints.forEach((footprint, index) => {
    try {
      // 检查必要字段
      if (!footprint.longitude || !footprint.latitude) {
        console.warn('Missing coordinates for footprint:', footprint.name);
        return;
      }
      
      // 创建标记点 - 使用新的样式
      const markerContent = `
        <div class="map-marker" data-id="${footprint.id}">
          <i class="fas fa-map-marker-alt" style="color: white; font-size: 12px;"></i>
        </div>
      `;
      
      const marker = new AMap.Marker({
        position: [footprint.longitude, footprint.latitude],
        title: footprint.name,
        content: markerContent,
        offset: new AMap.Pixel(-12, -12),
        zIndex: 100,
        extData: footprint
      });
      
      // 绑定点击事件
      marker.on('click', function(e) {
        const markerFootprint = e.target.getExtData();
        showFootprintDetail(markerFootprint);
        
        // 同步高亮侧边栏中的对应项
        const listItem = document.querySelector(`.footprint-item[data-id="${markerFootprint.id}"]`);
        if (listItem) {
          // 移除其他项的选中状态
          document.querySelectorAll('.footprint-item').forEach(el => {
            el.classList.remove('active');
          });
          listItem.classList.add('active');
          
          // 滚动到选中项
          listItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
      
      // 创建信息窗口 - 采用更现代的卡片样式
      const infoWindowContent = `
        <div class="marker-info-card">
          ${footprint.image ? `<img src="${footprint.image}" alt="${footprint.name}">` : ''}
          <h3>${footprint.name}</h3>
          <p>${footprint.address}</p>
          <p>${footprint.description ? footprint.description.substring(0, 80) + '...' : '暂无描述'}</p>
          <button class="btn" onclick="event.stopPropagation(); showFootprintDetail(${JSON.stringify(footprint)});">查看详情</button>
        </div>
      `;

      const infoWindow = new AMap.InfoWindow({
        content: infoWindowContent,
        offset: new AMap.Pixel(0, -30),
        closeWhenClickMap: true
      });

      // 绑定信息窗口显示事件
      marker.on('mouseover', function() {
        if (window.map) {
          infoWindow.open(window.map, marker.getPosition());
        }
      });

      marker.on('mouseout', function() {
        // 延迟关闭，让用户有时间点击
        setTimeout(() => {
          if (!infoWindow.getIsOpen()) return;
          const activeElement = document.activeElement;
          if (!activeElement || !activeElement.closest('.marker-info-card')) {
            infoWindow.close();
          }
        }, 200);
      });
      
      // 添加到标记数组
      window.markers.push(marker);
      
      // 为标记添加渐入动画效果
      setTimeout(() => {
        try {
          const markerDom = marker.getContent();
          if (markerDom) {
            markerDom.style.opacity = '1';
          }
        } catch (error) {
          console.error('Failed to set marker animation:', error);
        }
      }, index * 50); // 错开动画时间
    } catch (error) {
      console.error('Error adding marker for footprint:', footprint.name, error);
    }
  });
  
  // 将标记添加到地图
  if (window.markers.length > 0 && window.map) {
    try {
      window.map.add(window.markers);
      
      // 调整地图视野以显示所有标记
      // 添加飞行效果
      if (window.isFirstLoad) {
        window.isFirstLoad = false;
        // 先显示中国地图，然后飞转到标记点位置
        window.map.setZoomAndCenter(3, [105, 35]);
        setTimeout(() => {
          if (window.map) {
            window.map.setFitView(window.markers, false, [50, 50, 50, 50]);
          }
        }, 1000);
      } else {
        window.map.setFitView(window.markers, false, [50, 50, 50, 50]);
      }
    } catch (error) {
      console.error('Failed to add markers to map:', error);
    }
  }
  
  // 添加地图控制按钮
  try {
    addMapControls();
  } catch (error) {
    console.error('Failed to add map controls:', error);
  }
}

// 添加地图控制按钮
function addMapControls() {
  // 检查是否已存在控制按钮
  if (document.querySelector('.map-controls')) return;
  
  // 创建控制按钮容器
  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'map-controls';
  
  // 添加控制按钮 - 使用内置图标代替Font Awesome并添加自定义tooltip
  controlsContainer.innerHTML = `
    <button id="zoom-in-button" class="map-control-btn" data-tooltip="放大地图" title="放大">
      ➕
    </button>
    <button id="zoom-out-button" class="map-control-btn" data-tooltip="缩小地图" title="缩小">
      ➖
    </button>
    <button id="reset-view-button" class="map-control-btn" data-tooltip="重置视图" title="重置视图">
      🔄
    </button>
  `;
  
  // 将控制按钮添加到地图容器
  const mapContainer = document.getElementById('footprint-map') || document.getElementById('map');
  if (mapContainer) {
    mapContainer.appendChild(controlsContainer);
  }
  
  // 重新绑定事件
  bindEvents();
}

// 更新足迹列表
function updateFootprintList() {
  // 尝试获取足迹列表容器，支持多种可能的容器选择器
  const listContainer = document.getElementById('footprint-list') || 
                       document.querySelector('.footprint-list') ||
                       document.querySelector('.footprint-sidebar .list-container');
  
  if (!listContainer) {
    console.error('Footprint list container not found');
    return;
  }
  
  // 确保侧边栏容器可见
  const sidebar = listContainer.closest('.footprint-sidebar') || 
                 document.getElementById('footprint-sidebar');
  if (sidebar) {
    sidebar.style.display = 'block';
  }
  
  if (filteredFootprints.length === 0) {
    listContainer.innerHTML = '<div class="no-results">没有找到相关足迹</div>';
    return;
  }
  
  let html = '';
  filteredFootprints.forEach(footprint => {
    html += `
      <div class="footprint-item" data-id="${footprint.id}">
        <div class="footprint-item-header">
          <h4 class="footprint-item-name">${footprint.name}</h4>
          <span class="footprint-item-type">${footprint.footprintType}</span>
        </div>
        <p class="footprint-item-address">${footprint.address}</p>
        <p class="footprint-item-time">${formatDate(footprint.createTime)}</p>
      </div>
    `;
  });
  
  listContainer.innerHTML = html;
  
  // 为列表项绑定点击事件
  document.querySelectorAll('.footprint-item').forEach(item => {
    // 先移除可能存在的旧事件监听器
    const newItem = item.cloneNode(true);
    item.parentNode.replaceChild(newItem, item);
    
    newItem.addEventListener('click', function() {
      // 移除其他项的选中状态
      document.querySelectorAll('.footprint-item').forEach(el => {
        el.classList.remove('active');
      });
      
      // 添加选中状态
      this.classList.add('active');
      
      const id = this.getAttribute('data-id');
      const footprint = filteredFootprints.find(f => f.id === id);
      if (footprint) {
        // 显示详情
        showFootprintDetail(footprint);
        
        // 定位到标记并高亮
        navigateToLocation(footprint.longitude, footprint.latitude);
        
        // 高亮对应的地图标记
        window.markers.forEach(marker => {
          const markerData = marker.getExtData();
          if (markerData && markerData.id === id) {
            const markerDom = marker.getContent();
            if (markerDom) {
              markerDom.classList.add('highlighted');
              setTimeout(() => {
                markerDom.classList.remove('highlighted');
              }, 2000);
            }
          }
        });
      }
    });
  });
  
  // 更新地图布局以确保正确显示
  updateMapLayout();
}

// 更新地图布局以适配侧边栏
function updateMapLayout() {
  const mapContainer = document.getElementById('footprint-map') || document.getElementById('map');
  const mapWrapper = document.querySelector('.map-wrapper') || mapContainer?.parentElement;
  
  if (!mapContainer || !mapWrapper) return;
  
  // 设置地图容器和包装器样式
  mapContainer.style.width = '100%';
  mapContainer.style.height = '100%';
  mapWrapper.style.width = 'auto';
  
  // 确保响应式布局
  if (window.innerWidth <= 768) {
    // 小屏幕 - 地图容器宽度自适应
    mapWrapper.style.width = '100%';
  }
  
  // 如果地图已经初始化，触发地图重绘
  if (window.map) {
    try {
      window.map.resize();
    } catch (error) {
      console.warn('Map resize error:', error);
    }
  }
}

// 更新统计信息函数已移除

// 显示足迹详情
function showFootprintDetail(footprint) {
  // 找到详情容器 - 支持多种可能的容器ID
  let modal = document.getElementById('footprint-modal');
  if (!modal) {
    // 如果不存在，创建一个新的详情容器
    modal = document.createElement('div');
    modal.id = 'footprint-modal';
    modal.className = 'modal';
    document.body.appendChild(modal);
    
    // 添加基本模态框结构
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2 id="modal-title"></h2>
          <button id="modal-close-btn" class="close-button">×</button>
        </div>
        <div class="modal-body">
          <div id="modal-image-container"></div>
          <p id="modal-address"></p>
          <p id="modal-type"></p>
          <p id="modal-time"></p>
          <p id="modal-description"></p>
        </div>
        <div class="modal-footer">
          <a id="modal-article" class="btn btn-article" href="#">查看相关文章</a>
          <button id="navigate-to-location" class="btn btn-primary">导航到这里</button>
          <button id="close-modal" class="btn btn-secondary">关闭</button>
        </div>
      </div>
    `;
  }
  
  // 填充详情
  const titleElement = document.getElementById('modal-title');
  const addressElement = document.getElementById('modal-address');
  const timeElement = document.getElementById('modal-time');
  const typeElement = document.getElementById('modal-type');
  const descriptionElement = document.getElementById('modal-description');
  const imageContainer = document.getElementById('modal-image-container');
  const articleLink = document.getElementById('modal-article');
  const navigateButton = document.getElementById('navigate-to-location');
  const closeModalBtn = document.getElementById('close-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  
  if (titleElement) titleElement.textContent = footprint.name;
  if (addressElement) addressElement.textContent = `地址：${footprint.address}`;
  if (timeElement) timeElement.textContent = `时间：${formatDate(footprint.createTime)}`;
  if (typeElement) typeElement.textContent = `类型：${footprint.footprintType}`;
  if (descriptionElement) {
    descriptionElement.textContent = footprint.description || '暂无描述';
    descriptionElement.className = 'modal-description';
  }
  
  // 显示图片
  if (imageContainer) {
    if (footprint.image) {
      imageContainer.innerHTML = `<img src="${footprint.image}" alt="${footprint.name}" class="modal-image">`;
    } else {
      // 添加默认图片占位符
      imageContainer.innerHTML = `<div class="modal-image-placeholder">
        <i class="fas fa-map-marked-alt"></i>
        <span>暂无图片</span>
      </div>`;
    }
  }
  
  // 设置文章链接
  if (articleLink) {
    if (footprint.article) {
      articleLink.href = footprint.article;
      articleLink.style.display = 'inline-block';
    } else {
      articleLink.style.display = 'none';
    }
  }
  
  // 设置定位按钮事件
  if (navigateButton) {
    // 移除之前可能存在的事件监听器
    const newNavigateButton = navigateButton.cloneNode(true);
    navigateButton.parentNode.replaceChild(newNavigateButton, navigateButton);
    newNavigateButton.onclick = function() {
      navigateToLocation(footprint.longitude, footprint.latitude);
      // 关闭弹窗
      closeModal();
    };
  }
  
  // 重新绑定关闭按钮事件
  if (closeModalBtn) {
    // 移除之前可能存在的事件监听器
    const newCloseModalBtn = closeModalBtn.cloneNode(true);
    closeModalBtn.parentNode.replaceChild(newCloseModalBtn, closeModalBtn);
    newCloseModalBtn.addEventListener('click', closeModal);
  }
  
  if (modalCloseBtn) {
    // 移除之前可能存在的事件监听器
    const newModalCloseBtn = modalCloseBtn.cloneNode(true);
    modalCloseBtn.parentNode.replaceChild(newModalCloseBtn, modalCloseBtn);
    newModalCloseBtn.addEventListener('click', closeModal);
  }
  
  // 确保地图实例存在
  if (map) {
    // 居中地图到点击的标记点
    navigateToLocation(footprint.longitude, footprint.latitude);
  }
  
  // 显示弹窗并添加动画
  modal.style.display = 'block';
  setTimeout(() => {
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.classList.add('show');
    }
  }, 10);
  
  // 阻止地图点击事件冒泡，防止详情卡被关闭
  const modalContent = modal.querySelector('.modal-content');
  if (modalContent) {
    modalContent.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }
}

// 关闭弹窗函数已在前面定义，此处不再重复定义

// 导航到指定位置
function navigateToLocation(longitude, latitude) {
  map.flyTo([longitude, latitude], 15, {
    animateOptions: {
      duration: 1000
    }
  });
  
  // 添加一个临时高亮标记
  const highlightMarker = new AMap.Marker({
    position: [longitude, latitude],
    content: `<div class="highlight-marker"></div>`,
    offset: new AMap.Pixel(-15, -15)
  });
  
  map.add(highlightMarker);
  
  // 3秒后移除高亮标记
  setTimeout(() => {
    map.remove(highlightMarker);
  }, 3000);
}

// 筛选足迹
function filterFootprints() {
  const typeFilter = document.getElementById('footprint-type-filter').value;
  const searchText = document.getElementById('footprint-search').value.toLowerCase();
  
  filteredFootprints = footprintsData.filter(footprint => {
    const typeMatch = typeFilter === 'all' || footprint.footprintType === typeFilter;
    const textMatch = !searchText || 
                     footprint.name.toLowerCase().includes(searchText) ||
                     footprint.address.toLowerCase().includes(searchText) ||
                     footprint.description.toLowerCase().includes(searchText);
    
    return typeMatch && textMatch;
  });
  
  // 更新列表和地图
  updateFootprintList();
  addMarkersToMap();
}

// 绑定事件
function bindEvents() {
  // 关闭弹窗
  const closeModalBtn = document.getElementById('close-modal');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeModal);
  }
  
  // 点击弹窗外部关闭
  window.addEventListener('click', function(event) {
    const modal = document.getElementById('footprint-modal');
    if (event.target === modal) {
      closeModal();
    }
  });
  
  
  
  // 额外的模态框关闭按钮
  const modalCloseBtn = document.getElementById('modal-close-btn');
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeModal);
  }
  
  // 地图控制按钮事件
  const zoomInButton = document.getElementById('zoom-in-button');
  if (zoomInButton) {
    zoomInButton.addEventListener('click', function() {
      if (window.map) {
        const currentZoom = window.map.getZoom();
        if (currentZoom < 18) {
          window.map.setZoom(currentZoom + 1);
        }
      }
    });
  }
  
  const zoomOutButton = document.getElementById('zoom-out-button');
  if (zoomOutButton) {
    zoomOutButton.addEventListener('click', function() {
      if (window.map) {
        const currentZoom = window.map.getZoom();
        if (currentZoom > 3) {
          window.map.setZoom(currentZoom - 1);
        }
      }
    });
  }
  
  const resetViewButton = document.getElementById('reset-view-button');
  if (resetViewButton) {
    resetViewButton.addEventListener('click', function() {
      if (window.map) {
        if (window.markers.length > 0) {
          window.map.setFitView(window.markers, false, [50, 50, 50, 50]);
        }
      }
    });
  }
  
  // 确保没有重复的事件处理代码
  // 清理其他可能的重复控制按钮事件处理器
  if (typeof resetViewButton !== 'undefined' && resetViewButton) {
    // 已在上面对resetViewButton添加了事件处理器，这里不再重复添加
  }
  
  // 重置地图
  const resetMapBtn = document.getElementById('reset-map');
  if (resetMapBtn) {
    resetMapBtn.addEventListener('click', function() {
      if (!window.map) return;
      
      if (window.markers.length > 0) {
        window.map.setFitView(window.markers, false, [50, 50, 50, 50]);
      } else {
        window.map.setZoomAndCenter(3, [105, 35]);
      }
    });
  }
  
  // 地图缩放控制 - 支持另一个ID的缩放按钮
  const zoomInBtn2 = document.getElementById('map-zoom-in');
  const zoomOutBtn2 = document.getElementById('map-zoom-out');
  
  if (zoomInBtn2 && map) {
      zoomInBtn2.addEventListener('click', function() {
        const currentZoom = map.getZoom();
        if (currentZoom < map.getMaxZoom()) {
          map.setZoom(currentZoom + 1);
        }
      });
    }
    
    if (zoomOutBtn2 && map) {
      zoomOutBtn2.addEventListener('click', function() {
      const currentZoom = map.getZoom();
      if (currentZoom > map.getMinZoom()) {
        map.setZoom(currentZoom - 1);
      }
    });
  }
  
  // 地图类型切换
  const standardMapBtn = document.getElementById('map-type-standard');
  const satelliteMapBtn = document.getElementById('map-type-satellite');
  
  if (standardMapBtn) {
    standardMapBtn.addEventListener('click', function() {
      switchMapType('standard');
    });
  }
  
  if (satelliteMapBtn) {
    satelliteMapBtn.addEventListener('click', function() {
      switchMapType('satellite');
    });
  }
  
  // 路况开关
  const trafficCheckbox = document.getElementById('map-traffic');
  if (trafficCheckbox) {
    trafficCheckbox.addEventListener('change', toggleTraffic);
  }
  
  // 建筑开关
  const buildingCheckbox = document.getElementById('map-building');
  if (buildingCheckbox) {
    buildingCheckbox.addEventListener('change', toggleBuilding);
  }
  
  // 类型筛选
  const typeFilter = document.getElementById('footprint-type-filter');
  if (typeFilter) {
    typeFilter.addEventListener('change', filterFootprints);
  }
  
  // 搜索
  const searchButton = document.getElementById('search-button');
  const searchInput = document.getElementById('footprint-search');
  
  if (searchButton) {
    searchButton.addEventListener('click', filterFootprints);
  }
  
  if (searchInput) {
    searchInput.addEventListener('keyup', function(event) {
      if (event.key === 'Enter') {
        filterFootprints();
      }
    });
  }
  
  // 监听窗口大小变化，确保地图正确显示
  window.addEventListener('resize', function() {
    if (map) {
      map.resize();
    }
  });
}

// 格式化日期
function formatDate(dateString) {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 暂时禁用自动初始化，因为我们在页面中直接初始化地图
// 如果需要启用，可以取消下面的注释
/*
function safeInit() {
  // 检查是否已经有地图实例
  if (window.footprintMap) {
    console.log('地图实例已存在，跳过初始化');
    return;
  }
  
  // 首先检查AMap是否存在
  if (typeof AMap !== 'undefined') {
    init();
  } else {
    console.log('高德地图API未加载，等待页面中的初始化');
  }
}

// 延迟启动，让页面有机会先初始化地图
setTimeout(() => {
  if (!window.footprintMap) {
    safeInit();
  }
}, 2000);
*/

// 地图初始化重试函数（可选功能）
async function initializeMapWithRetry(maxRetries = 3, retryDelay = 1000) {
  let retries = 0;
  let mapInstance = null;
  
  while (retries < maxRetries) {
    try {
      console.log(`尝试初始化地图，第 ${retries + 1}/${maxRetries} 次`);
      
      // 尝试初始化地图
      mapInstance = await initMap();
      
      if (mapInstance && typeof mapInstance.getStatus === 'function') {
        console.log('地图初始化成功');
        return mapInstance;
      }
      
      throw new Error('地图初始化未完成');
      
    } catch (error) {
      console.warn(`地图初始化失败，第 ${retries + 1}/${maxRetries} 次:`, error.message);
      retries++;
      
      // 如果不是最后一次重试，等待后继续
      if (retries < maxRetries) {
        console.log(`等待 ${retryDelay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  console.error(`地图初始化失败，已达到最大重试次数 ${maxRetries}`);
  return null;
}

// 启用footprintmap.js的自动初始化
console.log('footprintmap.js - 启用自动初始化');

// 当页面加载完成时自动初始化
if (typeof window !== 'undefined') {
  // 检查文档加载状态
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // 如果文档已经加载完成，直接初始化
    init();
  }
}