/**
 * 城市标语数据库测试工具
 * 用于测试城市标语数据库的加载和使用
 */

(function() {
  // 测试城市标语数据库是否正确加载
  function testCitySloganLoading() {
    console.group('城市标语数据库加载测试');
    
    // 检查全局标记
    console.log('全局加载标记:', window.CITY_SLOGANS_LOADED ? '已设置' : '未设置');
    
    // 检查主数据库
    console.log('主数据库:', typeof window.CHINA_CITY_SLOGANS !== 'undefined' ? '已加载' : '未加载');
    console.log('getCitySlogan函数:', typeof window.getCitySlogan === 'function' ? '已加载' : '未加载');
    console.log('getSloganByLocation函数:', typeof window.getSloganByLocation === 'function' ? '已加载' : '未加载');
    
    // 检查各区域数据
    const regions = [
      { name: '华北地区', var: 'CHINA_CITY_SLOGANS_NORTH' },
      { name: '东北地区', var: 'CHINA_CITY_SLOGANS_NORTHEAST' },
      { name: '华东地区', var: 'CHINA_CITY_SLOGANS_EAST' },
      { name: '华中地区', var: 'CHINA_CITY_SLOGANS_CENTRAL' },
      { name: '华南地区', var: 'CHINA_CITY_SLOGANS_SOUTH' },
      { name: '西南地区', var: 'CHINA_CITY_SLOGANS_SOUTHWEST' },
      { name: '西北地区', var: 'CHINA_CITY_SLOGANS_NORTHWEST' }
    ];
    
    regions.forEach(region => {
      const loaded = typeof window[region.var] !== 'undefined';
      console.log(`${region.name} (${region.var}):`, loaded ? '已加载' : '未加载');
      
      if (loaded) {
        const provinceCount = Object.keys(window[region.var]).length;
        console.log(`  - 包含 ${provinceCount} 个省份/直辖市`);
      }
    });
    
    // 检查合并后的数据
    if (typeof window.CHINA_CITY_SLOGANS !== 'undefined') {
      const provinces = Object.keys(window.CHINA_CITY_SLOGANS);
      console.log(`合并后的数据包含 ${provinces.length} 个省份/直辖市:`, provinces);
      
      // 检查每个省份的城市数量
      provinces.forEach(province => {
        const cities = window.CHINA_CITY_SLOGANS[province];
        if (Array.isArray(cities)) {
          console.log(`  - ${province}: ${cities.length} 个城市`);
        } else {
          console.warn(`  - ${province}: 数据格式不正确`);
        }
      });
    }
    
    console.groupEnd();
  }
  
  // 测试特定省份和城市的标语
  function testCitySlogan(province, city) {
    console.group(`测试城市标语: ${province} - ${city}`);
    
    if (typeof window.getCitySlogan !== 'function') {
      console.error('getCitySlogan函数未加载');
      console.groupEnd();
      return null;
    }
    
    const slogan = window.getCitySlogan(province, city);
    console.log('查询结果:', slogan || '未找到匹配的标语');
    
    // 如果没有找到，尝试查找原因
    if (!slogan) {
      console.log('尝试诊断问题...');
      
      // 检查省份是否存在
      if (typeof window.CHINA_CITY_SLOGANS === 'undefined') {
        console.error('CHINA_CITY_SLOGANS 未定义');
      } else if (!window.CHINA_CITY_SLOGANS[province]) {
        console.error(`省份 "${province}" 在数据库中不存在`);
        console.log('可用省份:', Object.keys(window.CHINA_CITY_SLOGANS));
      } else {
        // 检查城市是否存在
        const cities = window.CHINA_CITY_SLOGANS[province].map(item => item.城市);
        console.log(`省份 "${province}" 中的城市:`, cities);
        
        if (!cities.includes(city)) {
          console.error(`城市 "${city}" 在 "${province}" 中不存在`);
          
          // 尝试查找相似的城市名称
          const similarCities = cities.filter(c => 
            c.includes(city) || city.includes(c)
          );
          
          if (similarCities.length > 0) {
            console.log('可能相似的城市:', similarCities);
            
            // 尝试使用相似城市查询
            similarCities.forEach(similarCity => {
              const similarSlogan = window.getCitySlogan(province, similarCity);
              console.log(`使用 "${similarCity}" 查询结果:`, similarSlogan || '未找到');
            });
          }
        }
      }
    }
    
    console.groupEnd();
    return slogan;
  }
  
  // 测试IP定位信息获取标语
  function testLocationSlogan(ipLocation) {
    console.group('测试IP定位标语获取');
    
    if (!ipLocation) {
      console.error('IP定位信息不可用');
      console.groupEnd();
      return null;
    }
    
    console.log('IP定位信息:', ipLocation);
    
    if (typeof window.getSloganByLocation !== 'function') {
      console.error('getSloganByLocation函数未加载');
      console.groupEnd();
      return null;
    }
    
    const slogan = window.getSloganByLocation(ipLocation);
    console.log('查询结果:', slogan || '未找到匹配的标语');
    
    console.groupEnd();
    return slogan;
  }
  
  // 测试加载性能
  function testLoadingPerformance() {
    console.group('城市标语数据库加载性能测试');
    
    // 清除缓存
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('city_slogan_load_time');
    }
    
    // 记录开始时间
    const startTime = performance.now();
    
    // 动态加载所有数据文件
    const files = [
      '/js/city-slogans.js',
      '/js/city-slogans-north.js',
      '/js/city-slogans-northeast.js',
      '/js/city-slogans-east.js',
      '/js/city-slogans-central.js',
      '/js/city-slogans-south.js',
      '/js/city-slogans-southwest.js',
      '/js/city-slogans-northwest.js'
    ];
    
    // 创建加载Promise
    const loadPromises = files.map(file => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = file;
        script.async = true;
        script.onload = () => {
          console.log(`${file} 加载完成`);
          resolve(file);
        };
        script.onerror = () => {
          console.error(`${file} 加载失败`);
          reject(file);
        };
        document.head.appendChild(script);
      });
    });
    
    // 等待所有文件加载完成
    Promise.all(loadPromises)
      .then(() => {
        const endTime = performance.now();
        const loadTime = endTime - startTime;
        
        console.log(`所有文件加载完成，耗时: ${loadTime.toFixed(2)}ms`);
        
        // 保存加载时间
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('city_slogan_load_time', loadTime.toString());
        }
        
        // 检查数据是否正确加载
        testCitySloganLoading();
      })
      .catch(err => {
        console.error('部分文件加载失败:', err);
      });
    
    console.groupEnd();
  }
  
  // 导出测试函数到全局作用域
  window.testCitySloganLoading = testCitySloganLoading;
  window.testCitySlogan = testCitySlogan;
  window.testLocationSlogan = testLocationSlogan;
  window.testLoadingPerformance = testLoadingPerformance;
  
  // 添加一个便捷的测试入口
  window.runCitySloganTests = function() {
    console.group('城市标语数据库综合测试');
    
    // 测试数据库加载
    testCitySloganLoading();
    
    // 测试常用城市标语
    const testCases = [
      { province: '北京市', city: '北京' },
      { province: '上海市', city: '上海' },
      { province: '广东省', city: '广州' },
      { province: '广东省', city: '深圳' },
      { province: '浙江省', city: '杭州' },
      { province: '福建省', city: '厦门' }
    ];
    
    testCases.forEach(test => {
      testCitySlogan(test.province, test.city);
    });
    
    // 测试IP定位标语
    if (window.ipLocation) {
      testLocationSlogan(window.ipLocation);
    } else {
      console.warn('IP定位信息不可用，跳过定位标语测试');
    }
    
    console.groupEnd();
    
    return '城市标语数据库测试完成，请查看控制台输出';
  };
})();