/**
 * 中国城市宣传标语数据库 - 主文件
 * 整合所有区域的城市宣传标语数据
 */

// 确保各区域数据已加载
(function() {
  // 定义所有区域数据名称
  const requiredData = [
    'CHINA_CITY_SLOGANS_NORTH',
    'CHINA_CITY_SLOGANS_NORTHEAST',
    'CHINA_CITY_SLOGANS_EAST',
    'CHINA_CITY_SLOGANS_CENTRAL',
    'CHINA_CITY_SLOGANS_SOUTH',
    'CHINA_CITY_SLOGANS_SOUTHWEST',
    'CHINA_CITY_SLOGANS_NORTHWEST'
  ];
  
  // 初始化缺失的数据为默认空对象
  for (const dataName of requiredData) {
    if (typeof window[dataName] === 'undefined') {
      console.log(`城市标语数据 ${dataName} 未加载，已创建默认空对象`);
      window[dataName] = {};
    }
  }
  
  // 添加一个全局调试函数，用于检查城市标语数据
  window.debugCitySlogans = function() {
    console.log('城市标语数据库状态:');
    requiredData.forEach(dataName => {
      const loaded = typeof window[dataName] !== 'undefined';
      const count = loaded ? Object.keys(window[dataName]).length : 0;
      console.log(`- ${dataName}: ${loaded ? '已加载' : '未加载'}, 包含 ${count} 个省份/直辖市`);
    });
    
    if (typeof CHINA_CITY_SLOGANS !== 'undefined') {
      const provinces = Object.keys(CHINA_CITY_SLOGANS);
      console.log(`合并后的数据包含 ${provinces.length} 个省份/直辖市:`, provinces);
    } else {
      console.log('合并后的城市标语数据不可用');
    }
  };
})();

// 合并所有区域数据
const CHINA_CITY_SLOGANS = (function() {
  try {
    // 检查各区域数据是否存在
    const dataModules = {
      '华北地区': typeof CHINA_CITY_SLOGANS_NORTH !== 'undefined' ? CHINA_CITY_SLOGANS_NORTH : null,
      '东北地区': typeof CHINA_CITY_SLOGANS_NORTHEAST !== 'undefined' ? CHINA_CITY_SLOGANS_NORTHEAST : null,
      '华东地区': typeof CHINA_CITY_SLOGANS_EAST !== 'undefined' ? CHINA_CITY_SLOGANS_EAST : null,
      '华中地区': typeof CHINA_CITY_SLOGANS_CENTRAL !== 'undefined' ? CHINA_CITY_SLOGANS_CENTRAL : null,
      '华南地区': typeof CHINA_CITY_SLOGANS_SOUTH !== 'undefined' ? CHINA_CITY_SLOGANS_SOUTH : null,
      '西南地区': typeof CHINA_CITY_SLOGANS_SOUTHWEST !== 'undefined' ? CHINA_CITY_SLOGANS_SOUTHWEST : null,
      '西北地区': typeof CHINA_CITY_SLOGANS_NORTHWEST !== 'undefined' ? CHINA_CITY_SLOGANS_NORTHWEST : null
    };
    
    // 记录加载状态
    console.log('城市标语数据模块加载状态:', Object.entries(dataModules).map(([name, data]) => 
      `${name}: ${data ? '已加载' : '未加载'}`
    ).join(', '));
    
    // 合并所有可用的数据
    const mergedData = {};
    Object.entries(dataModules).forEach(([name, data]) => {
      if (data) {
        Object.assign(mergedData, data);
      }
    });
    
    // 检查合并结果
    const provinceCount = Object.keys(mergedData).length;
    console.log(`成功合并 ${provinceCount} 个省份/直辖市的数据`);
    
    return mergedData;
  } catch (e) {
    console.error('合并城市标语数据失败:', e);
    return {};
  }
})();

// 获取城市标语的函数
function getCitySlogan(province, city) {
  if (!province || !city) return null;
  
  // 尝试直接匹配省份和城市
  const provinceData = CHINA_CITY_SLOGANS[province];
  if (!provinceData) return null;
  
  // 在省份数据中查找城市
  const cityData = provinceData.find(item => item.城市 === city);
  return cityData ? cityData.标语 : null;
}

// 根据IP定位信息获取标语
function getSloganByLocation(ipLocation) {
  if (!ipLocation || !ipLocation.data) {
    console.error('IP定位数据无效');
    return null;
  }
  
  const data = ipLocation.data;
  let province = data.prov;
  let city = data.city;
  
  // 调试信息
  console.log('getSloganByLocation 接收到数据:', { province, city });
  
  if (!province || !city) {
    console.log('省份或城市数据缺失');
    return null;
  }
  
  // 处理直辖市
  if (province === '北京市' || province === '天津市' || 
      province === '上海市' || province === '重庆市') {
    city = province.substring(0, 2); // 取前两个字符，如"北京"
  }
  
  // 去除"市"后缀进行匹配
  if (city && city.endsWith('市')) {
    city = city.substring(0, city.length - 1);
  }
  
  // 检查数据库中是否有该省份
  if (!CHINA_CITY_SLOGANS[province]) {
    console.log(`数据库中没有 ${province} 的数据`);
    
    // 尝试查找类似的省份名称
    const similarProvince = Object.keys(CHINA_CITY_SLOGANS).find(p => 
      p.includes(province) || province.includes(p)
    );
    
    if (similarProvince) {
      console.log(`找到类似的省份: ${similarProvince}`);
      province = similarProvince;
    } else {
      console.log('未找到类似的省份');
    }
  }
  
  // 尝试获取标语
  let slogan = null;
  
  // 方法1: 直接匹配
  if (CHINA_CITY_SLOGANS[province]) {
    const cityData = CHINA_CITY_SLOGANS[province].find(item => item.城市 === city);
    if (cityData) {
      slogan = cityData.标语;
      console.log('直接匹配成功:', { province, city, slogan });
    }
  }
  
  // 方法2: 如果直接匹配失败，尝试在所有省份中查找城市
  if (!slogan) {
    for (const provKey in CHINA_CITY_SLOGANS) {
      const provData = CHINA_CITY_SLOGANS[provKey];
      const cityMatch = provData.find(item => item.城市 === city);
      if (cityMatch) {
        slogan = cityMatch.标语;
        console.log('跨省份匹配成功:', { province: provKey, city, slogan });
        break;
      }
    }
  }
  
  // 方法3: 如果前两种方法都失败，尝试模糊匹配
  if (!slogan) {
    for (const provKey in CHINA_CITY_SLOGANS) {
      const provData = CHINA_CITY_SLOGANS[provKey];
      const cityMatch = provData.find(item => 
        city.includes(item.城市) || item.城市.includes(city)
      );
      if (cityMatch) {
        slogan = cityMatch.标语;
        console.log('模糊匹配成功:', { province: provKey, matchedCity: cityMatch.城市, originalCity: city, slogan });
        break;
      }
    }
  }
  
  // 方法4: 如果是省会城市，可以尝试特殊处理
  if (!slogan && city.length >= 2) {
    // 常见省会城市特殊处理
    const provinceCaptials = {
      '北京': '北京市',
      '上海': '上海市',
      '广州': '广东省',
      '成都': '四川省',
      '南京': '江苏省',
      '杭州': '浙江省',
      '武汉': '湖北省',
      '长沙': '湖南省',
      '西安': '陕西省'
    };
    
    if (provinceCaptials[city]) {
      const provKey = provinceCaptials[city];
      if (CHINA_CITY_SLOGANS[provKey]) {
        const cityMatch = CHINA_CITY_SLOGANS[provKey].find(item => item.城市 === city);
        if (cityMatch) {
          slogan = cityMatch.标语;
          console.log('省会城市特殊处理匹配成功:', { province: provKey, city, slogan });
        }
      }
    }
  }
  
  return slogan;
}

// 导出函数和数据到全局作用域
(function() {
  // 确保在全局作用域中设置这些变量
  window.CHINA_CITY_SLOGANS = CHINA_CITY_SLOGANS;
  window.getCitySlogan = getCitySlogan;
  window.getSloganByLocation = getSloganByLocation;
  
  // 添加一个标记，表示城市标语数据库已加载
  window.CITY_SLOGANS_LOADED = true;
  
  console.log('城市标语数据库已加载完成，共包含', Object.keys(CHINA_CITY_SLOGANS).length, '个省份/直辖市');
})();

// 提供一个测试函数，可以在控制台中调用
window.testCitySlogan = function(province, city) {
  console.log(`测试城市标语 - 省份: ${province}, 城市: ${city}`);
  const slogan = getCitySlogan(province, city);
  console.log('查询结果:', slogan || '未找到匹配的标语');
  return slogan;
};
