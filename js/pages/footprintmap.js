// 足迹地图页面JavaScript

// 全局变量
let map = null;
let markers = [];
let footprintData = [];

// 地图库加载状态
let mapLibraryLoaded = false;
let mapInitializationTimer = null;

// 初始化地图和数据
function initFootprintMap() {
  // 确保DOM元素已加载
  const mapContainer = document.getElementById('footprint-map');
  
  if (!mapContainer) {
    console.error('地图容器不存在');
    showMapError('地图容器未找到，请检查页面结构');
    return;
  }
  
  // 显示加载状态
  showMapLoading();
  
  // 模拟足迹数据 - 实际项目中应该从API获取
  footprintData = generateMockData();
  
  // 尝试加载地图库和初始化地图
  loadMapLibrary().then(() => {
    // 地图库加载成功
    initMap(mapContainer);
  }).catch(error => {
    // 地图库加载失败，使用模拟地图
    console.warn('地图库加载失败，使用模拟地图:', error);
    initMockMap(mapContainer);
  });
  
  // 设置初始化超时
  mapInitializationTimer = setTimeout(() => {
    if (!mapLibraryLoaded) {
      console.warn('地图初始化超时，切换到模拟地图');
      initMockMap(mapContainer);
    }
  }, 5000);
  
  // 初始化筛选功能
  initFilters();
  
  // 初始化侧边栏事件
  initSidebarEvents();
  
  // 渲染足迹列表
  renderFootprintList(footprintData);
  
  // 更新统计信息
  updateStats(footprintData);
}

// 加载地图库
async function loadMapLibrary() {
  return new Promise((resolve, reject) => {
    // 在实际项目中，这里应该加载真实的地图库脚本
    // 例如：
    /*
    const script = document.createElement('script');
    script.src = 'https://api.map.baidu.com/api?v=3.0&ak=YOUR_API_KEY';
    script.onload = () => {
      mapLibraryLoaded = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
    */
    
    // 模拟地图库加载延迟
    setTimeout(() => {
      // 模拟加载成功
      mapLibraryLoaded = true;
      resolve();
    }, 1000);
  });
}

// 初始化真实地图 (实际项目中使用)
function initMap(container) {
  // 清除超时计时器
  if (mapInitializationTimer) {
    clearTimeout(mapInitializationTimer);
    mapInitializationTimer = null;
  }
  
  // 清除加载状态
  container.innerHTML = '';
  
  try {
    // 在实际项目中，这里应该是地图库的初始化代码
    // 例如使用百度地图：
    /*
    map = new BMapGL.Map(container);
    const point = new BMapGL.Point(104.066, 30.573); // 成都作为中心点
    map.centerAndZoom(point, 4);
    map.enableScrollWheelZoom(true);
    */
    
    // 这里使用模拟地图代替
    initMockMap(container);
    
  } catch (error) {
    console.error('地图初始化失败:', error);
    showMapError('地图初始化失败');
  }
}

// 初始化模拟地图
function initMockMap(container) {
  // 清除超时计时器
  if (mapInitializationTimer) {
    clearTimeout(mapInitializationTimer);
    mapInitializationTimer = null;
  }
  
  // 清空容器
  container.innerHTML = '';
  
  // 创建模拟地图背景
  const mapBackground = document.createElement('div');
  mapBackground.style.width = '100%';
  mapBackground.style.height = '100%';
  mapBackground.style.background = 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)';
  mapBackground.style.position = 'relative';
  mapBackground.style.overflow = 'hidden';
  
  // 添加中国地图轮廓（简化版）
  const mapOutline = document.createElement('div');
  mapOutline.style.position = 'absolute';
  mapOutline.style.width = '80%';
  mapOutline.style.height = '70%';
  mapOutline.style.left = '10%';
  mapOutline.style.top = '15%';
  mapOutline.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 800 600\"%3E%3Cpath d=\"M200,100 Q400,50 600,120 T700,300 Q650,450 500,500 T300,450 Q250,350 200,300 T200,100\" fill=\"none\" stroke=\"%233498db\" stroke-width=\"2\"/%3E%3C/svg%3E")';
  mapOutline.style.backgroundSize = 'contain';
  mapOutline.style.backgroundRepeat = 'no-repeat';
  mapOutline.style.backgroundPosition = 'center';
  
  mapBackground.appendChild(mapOutline);
  container.appendChild(mapBackground);
  
  // 添加模拟标记点
  addMockMarkers(mapBackground);
  
  // 添加模拟地图控件
  addMockMapControls(container);
}

// 添加模拟标记点
function addMockMarkers(mapBackground) {
  footprintData.forEach(item => {
    // 计算模拟坐标 (简化的经纬度到百分比的转换)
    const left = (item.lng - 73) / (135 - 73) * 80 + 10; 
    const top = (54 - item.lat) / (54 - 18) * 80 + 10;
    
    const marker = document.createElement('div');
    marker.className = 'simulated-marker';
    marker.style.position = 'absolute';
    marker.style.left = `${left}%`;
    marker.style.top = `${top}%`;
    marker.style.width = '20px';
    marker.style.height = '20px';
    marker.style.backgroundColor = '#ff6b6b';
    marker.style.borderRadius = '50%';
    marker.style.transform = 'translate(-50%, -50%)';
    marker.style.zIndex = '10';
    marker.style.cursor = 'pointer';
    marker.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    marker.setAttribute('data-id', item.id);
    
    // 添加脉冲动画
    marker.style.animation = 'pulse 2s infinite';
    
    // 添加点击事件
    marker.addEventListener('click', () => {
      showFootprintDetail(item);
    });
    
    // 添加悬停效果
    marker.addEventListener('mouseover', () => {
      marker.style.transform = 'translate(-50%, -50%) scale(1.2)';
      marker.style.zIndex = '11';
    });
    
    marker.addEventListener('mouseout', () => {
      marker.style.transform = 'translate(-50%, -50%) scale(1)';
      marker.style.zIndex = '10';
    });
    
    mapBackground.appendChild(marker);
    markers.push(marker);
  });
  
  // 确保动画样式已添加
  ensureAnimationStyles();
}

// 添加模拟地图控件
function addMockMapControls(container) {
  // 检查是否已存在地图控件
  const existingControls = document.querySelector('.map-controls');
  if (!existingControls) {
    const controls = document.createElement('div');
    controls.className = 'map-controls';
    
    // 缩放控件
    const zoomInBtn = document.createElement('button');
    zoomInBtn.className = 'control-btn';
    zoomInBtn.innerHTML = '➕';
    zoomInBtn.title = '放大';
    zoomInBtn.addEventListener('click', () => {
      console.log('放大地图');
      // 实际项目中这里应该调用地图库的放大方法
    });
    
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.className = 'control-btn';
    zoomOutBtn.innerHTML = '➖';
    zoomOutBtn.title = '缩小';
    zoomOutBtn.addEventListener('click', () => {
      console.log('缩小地图');
      // 实际项目中这里应该调用地图库的缩小方法
    });
    
    // 定位控件
    const locateBtn = document.createElement('button');
    locateBtn.className = 'control-btn';
    locateBtn.innerHTML = '📍';
    locateBtn.title = '定位';
    locateBtn.addEventListener('click', () => {
      console.log('定位到当前位置');
      // 实际项目中这里应该调用地图库的定位方法
    });
    
    // 移动端侧边栏切换按钮
    const toggleSidebarBtn = document.createElement('button');
    toggleSidebarBtn.id = 'toggle-sidebar';
    toggleSidebarBtn.className = 'control-btn';
    toggleSidebarBtn.innerHTML = '☰';
    toggleSidebarBtn.title = '显示/隐藏侧边栏';
    toggleSidebarBtn.addEventListener('click', () => {
      toggleSidebar();
    });
    
    // 添加所有控件
    controls.appendChild(zoomInBtn);
    controls.appendChild(zoomOutBtn);
    controls.appendChild(locateBtn);
    controls.appendChild(toggleSidebarBtn);
    
    container.appendChild(controls);
  }
}

// 确保动画样式已添加
function ensureAnimationStyles() {
  if (!document.querySelector('#footprint-map-animations')) {
    const style = document.createElement('style');
    style.id = 'footprint-map-animations';
    style.textContent = `
      @keyframes pulse {
        0% {
          box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.7);
        }
        70% {
          box-shadow: 0 0 0 10px rgba(255, 107, 107, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(255, 107, 107, 0);
        }
      }
    `;
    document.head.appendChild(style);
  }
}

// 生成模拟数据
function generateMockData() {
  return [
    { id: 1, name: '北京', address: '北京市东城区', type: '城市', lng: 116.404, lat: 39.915, time: '2023-05-15' },
    { id: 2, name: '上海', address: '上海市黄浦区', type: '城市', lng: 121.473, lat: 31.230, time: '2023-04-20' },
    { id: 3, name: '杭州西湖', address: '浙江省杭州市西湖区', type: '景点', lng: 120.148, lat: 30.242, time: '2023-06-10' },
    { id: 4, name: '广州塔', address: '广东省广州市海珠区', type: '地标', lng: 113.325, lat: 23.129, time: '2023-03-05' },
    { id: 5, name: '成都', address: '四川省成都市武侯区', type: '城市', lng: 104.066, lat: 30.573, time: '2023-07-22' },
    { id: 6, name: '西安兵马俑', address: '陕西省西安市临潼区', type: '景点', lng: 109.273, lat: 34.385, time: '2023-08-15' }
  ];
}

// 初始化筛选功能
function initFilters() {
  const filterInput = document.getElementById('footprint-filter');
  const typeFilter = document.getElementById('type-filter');
  
  if (filterInput) {
    filterInput.addEventListener('input', filterFootprints);
  }
  
  if (typeFilter) {
    // 填充类型选项
    const types = [...new Set(footprintData.map(item => item.type))];
    types.forEach(type => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      typeFilter.appendChild(option);
    });
    
    typeFilter.addEventListener('change', filterFootprints);
  }
}

// 筛选足迹
function filterFootprints() {
  const filterInput = document.getElementById('footprint-filter');
  const typeFilter = document.getElementById('type-filter');
  
  if (!filterInput || !typeFilter) return;
  
  const searchTerm = filterInput.value.toLowerCase();
  const typeTerm = typeFilter.value;
  
  let filtered = footprintData;
  
  // 按名称或地址筛选
  if (searchTerm) {
    filtered = filtered.filter(item => 
      item.name.toLowerCase().includes(searchTerm) || 
      item.address.toLowerCase().includes(searchTerm)
    );
  }
  
  // 按类型筛选
  if (typeTerm && typeTerm !== 'all') {
    filtered = filtered.filter(item => item.type === typeTerm);
  }
  
  // 渲染筛选后的列表
  renderFootprintList(filtered);
  
  // 更新标记点
  updateMarkers(filtered);
}

// 渲染足迹列表
function renderFootprintList(data) {
  const listContainer = document.querySelector('.footprint-list');
  
  if (!listContainer) return;
  
  // 清空列表
  listContainer.innerHTML = '';
  
  if (data.length === 0) {
    // 显示无结果提示
    const noResult = document.createElement('div');
    noResult.className = 'no-results';
    noResult.textContent = '没有找到匹配的足迹';
    listContainer.appendChild(noResult);
    return;
  }
  
  // 创建足迹项
  data.forEach(item => {
    const itemElement = document.createElement('div');
    itemElement.className = 'footprint-item';
    itemElement.setAttribute('data-id', item.id);
    
    // 足迹名称和类型
    const header = document.createElement('div');
    header.className = 'footprint-item-header';
    
    const name = document.createElement('h4');
    name.className = 'footprint-item-name';
    name.textContent = item.name;
    
    const type = document.createElement('span');
    type.className = 'footprint-item-type';
    type.textContent = item.type;
    
    header.appendChild(name);
    header.appendChild(type);
    
    // 足迹地址
    const address = document.createElement('p');
    address.className = 'footprint-item-address';
    address.textContent = item.address;
    
    // 访问时间
    const time = document.createElement('p');
    time.className = 'footprint-item-time';
    time.textContent = `访问时间: ${item.time}`;
    
    // 组装足迹项
    itemElement.appendChild(header);
    itemElement.appendChild(address);
    itemElement.appendChild(time);
    
    // 添加点击事件
    itemElement.addEventListener('click', () => {
      showFootprintDetail(item);
    });
    
    listContainer.appendChild(itemElement);
  });
}

// 更新标记点显示
function updateMarkers(data) {
  if (markers.length === 0) return;
  
  // 获取筛选后的ID列表
  const filteredIds = data.map(item => item.id);
  
  // 更新每个标记的显示状态
  markers.forEach(marker => {
    const markerId = parseInt(marker.getAttribute('data-id'));
    if (filteredIds.includes(markerId)) {
      marker.style.display = 'block';
    } else {
      marker.style.display = 'none';
    }
  });
}

// 初始化侧边栏事件
function initSidebarEvents() {
  const toggleBtn = document.getElementById('toggle-sidebar');
  const closeBtn = document.getElementById('close-sidebar');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleSidebar);
  }
  
  if (closeBtn) {
    closeBtn.addEventListener('click', hideSidebar);
  }
  
  if (overlay) {
    overlay.addEventListener('click', hideSidebar);
  }
}

// 切换侧边栏显示/隐藏
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  
  if (!sidebar || !overlay) return;
  
  const isOpen = sidebar.classList.contains('open');
  
  if (isOpen) {
    hideSidebar();
  } else {
    showSidebar();
  }
}

// 显示侧边栏
function showSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  
  if (!sidebar || !overlay) return;
  
  sidebar.classList.add('open');
  sidebar.style.transform = 'translateX(0)';
  overlay.classList.add('show');
  overlay.style.display = 'block';
  
  // 防止页面滚动
  document.body.style.overflow = 'hidden';
}

// 隐藏侧边栏
function hideSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  
  if (!sidebar || !overlay) return;
  
  sidebar.classList.remove('open');
  
  // 在移动端隐藏侧边栏
  if (window.innerWidth <= 768) {
    sidebar.style.transform = 'translateX(-100%)';
  }
  
  overlay.classList.remove('show');
  overlay.style.display = 'none';
  
  // 恢复页面滚动
  document.body.style.overflow = '';
}

// 显示足迹详情模态框
function showFootprintDetail(item) {
  const modal = document.getElementById('footprint-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalAddress = document.getElementById('modal-address');
  const modalType = document.getElementById('modal-type');
  const modalTime = document.getElementById('modal-time');
  const closeBtn = document.getElementById('modal-close-btn');
  const modalCloseIcon = document.querySelector('.modal-close');
  
  if (!modal) return;
  
  // 设置模态框内容
  if (modalTitle) modalTitle.textContent = item.name;
  if (modalAddress) modalAddress.textContent = `地址: ${item.address}`;
  if (modalType) modalType.textContent = `类型: ${item.type}`;
  if (modalTime) modalTime.textContent = `访问时间: ${item.time}`;
  
  // 显示模态框
  modal.style.display = 'flex';
  
  // 高亮对应的足迹项
  document.querySelectorAll('.footprint-item').forEach(el => {
    el.classList.remove('active');
    if (parseInt(el.getAttribute('data-id')) === item.id) {
      el.classList.add('active');
    }
  });
  
  // 添加关闭事件
  const closeModal = () => {
    modal.style.display = 'none';
  };
  
  // 移除之前的事件监听器，防止多次绑定
  closeBtn?.removeEventListener('click', closeModal);
  modalCloseIcon?.removeEventListener('click', closeModal);
  
  // 添加新的事件监听器
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (modalCloseIcon) modalCloseIcon.addEventListener('click', closeModal);
  
  // 点击模态框外部关闭
  const handleModalClick = (e) => {
    if (e.target === modal) {
      closeModal();
      modal.removeEventListener('click', handleModalClick);
    }
  };
  
  modal.addEventListener('click', handleModalClick);
  
  // ESC键关闭
  const handleEscKey = (e) => {
    if (e.key === 'Escape' && modal.style.display === 'flex') {
      closeModal();
      document.removeEventListener('keydown', handleEscKey);
    }
  };
  
  document.addEventListener('keydown', handleEscKey);
}

// 更新统计信息
function updateStats(data) {
  const totalCount = document.getElementById('total-count');
  const cityCount = document.getElementById('city-count');
  const typeCount = document.getElementById('type-count');
  
  if (totalCount) {
    totalCount.textContent = data.length;
  }
  
  // 统计城市数量
  if (cityCount) {
    const cities = data.filter(item => item.type === '城市').length;
    cityCount.textContent = cities;
  }
  
  // 统计不同类型数量
  if (typeCount) {
    const types = [...new Set(data.map(item => item.type))];
    typeCount.textContent = types.length;
  }
}

// 显示地图加载状态
function showMapLoading() {
  const mapContainer = document.getElementById('footprint-map');
  if (mapContainer) {
    mapContainer.innerHTML = `
      <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;">
        <div style="text-align:center;">
          <div style="font-size:2rem;margin-bottom:1rem;">🔄</div>
          <div>地图加载中...</div>
        </div>
      </div>
    `;
  }
}

// 显示地图错误
function showMapError(message) {
  const mapContainer = document.getElementById('footprint-map');
  if (mapContainer) {
    mapContainer.innerHTML = `
      <div class="map-error">
        <div style="text-align:center;">
          <div style="font-size:2rem;margin-bottom:1rem;">❌</div>
          <div>${message || '地图加载失败'}</div>
          <div style="font-size:0.8rem;margin-top:0.5rem;">请刷新页面重试</div>
        </div>
      </div>
    `;
  }
}

// 响应式处理
function handleResize() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  
  if (!sidebar) return;
  
  // 在移动端默认隐藏侧边栏
  if (window.innerWidth <= 768) {
    if (!sidebar.classList.contains('open')) {
      sidebar.style.transform = 'translateX(-100%)';
    }
  } else {
    // 在桌面端默认显示侧边栏
    sidebar.style.transform = 'translateX(0)';
    if (overlay) {
      overlay.classList.remove('show');
      overlay.style.display = 'none';
    }
    
    // 移除桌面端的侧边栏open类
    sidebar.classList.remove('open');
    
    // 恢复页面滚动
    document.body.style.overflow = '';
  }
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', () => {
  // 使用延迟初始化，确保所有DOM元素都已加载
  setTimeout(initFootprintMap, 100);
  
  // 添加窗口大小改变事件
  window.addEventListener('resize', handleResize);
  
  // 初始调用响应式处理
  handleResize();
});

// 页面卸载时清理资源
window.addEventListener('beforeunload', () => {
  if (mapInitializationTimer) {
    clearTimeout(mapInitializationTimer);
  }
});