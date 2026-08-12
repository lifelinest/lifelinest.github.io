// 足迹数据管理和验证脚本
// 这个脚本提供了足迹数据的验证、统计和管理功能

const fs = require('fs');
const path = require('path');

class FootprintManager {
  constructor(dataPath = path.join(process.cwd(), 'source', '_data', 'footprints.json')) {
    this.dataPath = dataPath;
    this.footprints = [];
    this.loadData();
  }

  // 加载足迹数据
  loadData() {
    try {
      const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
      this.footprints = data.footprints || [];
      console.log(`✅ 成功加载 ${this.footprints.length} 个足迹数据`);
    } catch (error) {
      console.error('❌ 加载足迹数据失败:', error.message);
      this.footprints = [];
    }
  }

  // 保存足迹数据
  saveData() {
    try {
      const data = { footprints: this.footprints };
      fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`✅ 成功保存 ${this.footprints.length} 个足迹数据`);
      return true;
    } catch (error) {
      console.error('❌ 保存足迹数据失败:', error.message);
      return false;
    }
  }

  // 验证单个足迹数据
  validateFootprint(footprint) {
    const errors = [];

    // 必填字段验证
    const requiredFields = ['id', 'name', 'longitude', 'latitude', 'address', 'createTime'];
    requiredFields.forEach(field => {
      if (!footprint[field]) {
        errors.push(`缺少必填字段: ${field}`);
      }
    });

    // 经纬度验证
    if (footprint.longitude && (footprint.longitude < -180 || footprint.longitude > 180)) {
      errors.push('经度必须在 -180 到 180 之间');
    }
    if (footprint.latitude && (footprint.latitude < -90 || footprint.latitude > 90)) {
      errors.push('纬度必须在 -90 到 90 之间');
    }

    // ID唯一性验证
    const idExists = this.footprints.some(fp => fp.id === footprint.id && fp !== footprint);
    if (idExists) {
      errors.push(`ID 重复: ${footprint.id}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // 验证所有足迹数据
  validateAllFootprints() {
    let isValid = true;
    const allErrors = [];

    this.footprints.forEach((footprint, index) => {
      const result = this.validateFootprint(footprint);
      if (!result.valid) {
        isValid = false;
        allErrors.push({
          index,
          id: footprint.id || '未知ID',
          name: footprint.name || '未知名称',
          errors: result.errors
        });
      }
    });

    if (!isValid) {
      console.error('❌ 发现以下足迹数据问题:');
      allErrors.forEach(item => {
        console.error(`\n- 索引 ${item.index} (ID: ${item.id}, 名称: ${item.name}):`);
        item.errors.forEach(error => console.error(`  * ${error}`));
      });
    } else {
      console.log('✅ 所有足迹数据验证通过');
    }

    return isValid;
  }

  // 添加新足迹
  addFootprint(footprint) {
    const validation = this.validateFootprint(footprint);
    if (!validation.valid) {
      console.error('❌ 添加足迹失败:', validation.errors);
      return false;
    }

    this.footprints.push(footprint);
    return this.saveData();
  }

  // 更新足迹
  updateFootprint(id, updates) {
    const index = this.footprints.findIndex(fp => fp.id === id);
    if (index === -1) {
      console.error(`❌ 未找到ID为 ${id} 的足迹`);
      return false;
    }

    const updatedFootprint = { ...this.footprints[index], ...updates };
    const validation = this.validateFootprint(updatedFootprint);
    if (!validation.valid) {
      console.error('❌ 更新足迹失败:', validation.errors);
      return false;
    }

    this.footprints[index] = updatedFootprint;
    return this.saveData();
  }

  // 删除足迹
  deleteFootprint(id) {
    const initialLength = this.footprints.length;
    this.footprints = this.footprints.filter(fp => fp.id !== id);
    
    if (this.footprints.length === initialLength) {
      console.error(`❌ 未找到ID为 ${id} 的足迹`);
      return false;
    }

    return this.saveData();
  }

  // 获取足迹统计信息
  getStatistics() {
    const stats = {
      totalCount: this.footprints.length,
      types: {},
      countries: new Set(),
      cities: new Set()
    };

    this.footprints.forEach(fp => {
      // 统计类型
      if (fp.footprintType) {
        stats.types[fp.footprintType] = (stats.types[fp.footprintType] || 0) + 1;
      }

      // 提取国家和城市信息（简化版本，实际可能需要更复杂的解析）
      if (fp.address) {
        // 假设地址格式包含国家/地区和城市信息
        // 这是一个简化的实现，实际可能需要更复杂的地址解析
        const addressParts = fp.address.split('省').join('').split('市').join('').split('区').join('').split(' ');
        if (addressParts.length >= 2) {
          stats.countries.add(addressParts[0]);
          stats.cities.add(addressParts[1]);
        }
      }
    });

    return {
      ...stats,
      countryCount: stats.countries.size,
      cityCount: stats.cities.size,
      countryList: Array.from(stats.countries),
      cityList: Array.from(stats.cities)
    };
  }

  // 生成唯一ID
  generateUniqueId() {
    const timestamp = Date.now();
    let id = `fp-${timestamp}`;
    
    // 确保ID唯一
    while (this.footprints.some(fp => fp.id === id)) {
      id = `fp-${timestamp}-${Math.floor(Math.random() * 1000)}`;
    }
    
    return id;
  }

  // 导出数据为CSV格式
  exportToCSV(outputPath = path.join(process.cwd(), 'footprints-export.csv')) {
    const headers = ['ID', '名称', '描述', '经度', '纬度', '地址', '类型', '创建时间', '文章链接'];
    const rows = this.footprints.map(fp => [
      fp.id,
      `"${fp.name || ''}"`,
      `"${fp.description || ''}"`,
      fp.longitude,
      fp.latitude,
      `"${fp.address || ''}"`,
      `"${fp.footprintType || ''}"`,
      fp.createTime || '',
      fp.article || ''
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    
    try {
      fs.writeFileSync(outputPath, csvContent, 'utf8');
      console.log(`✅ 成功导出数据到 ${outputPath}`);
      return true;
    } catch (error) {
      console.error('❌ 导出数据失败:', error.message);
      return false;
    }
  }
}

// 如果直接运行此脚本（用于数据验证和管理）
if (require.main === module) {
  const manager = new FootprintManager();
  
  // 显示帮助信息
  console.log('\n=== Hexo 足迹管理工具 ===');
  console.log('1. 验证所有足迹数据');
  console.log('2. 显示足迹统计信息');
  console.log('3. 导出足迹数据为CSV');
  
  // 执行验证
  manager.validateAllFootprints();
  
  // 显示统计信息
  const stats = manager.getStatistics();
  console.log('\n=== 足迹统计信息 ===');
  console.log(`总足迹数: ${stats.totalCount}`);
  console.log(`国家/地区数: ${stats.countryCount}`);
  console.log(`城市数: ${stats.cityCount}`);
  if (Object.keys(stats.types).length > 0) {
    console.log('足迹类型分布:');
    Object.entries(stats.types).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count} 个`);
    });
  }
}

module.exports = FootprintManager;

// Hexo扩展：在生成前验证足迹数据
hexo.extend.filter.register('before_generate', function() {
  const manager = new FootprintManager();
  const isValid = manager.validateAllFootprints();
  
  if (!isValid) {
    console.warn('⚠️  足迹数据存在问题，请检查并修复');
  }
});

// 添加Hexo命令来管理足迹数据
hexo.extend.console.register('footprint', '管理足迹数据', function(args) {
  const manager = new FootprintManager();
  
  switch (args._[0]) {
    case 'validate':
      manager.validateAllFootprints();
      break;
    case 'stats':
      const stats = manager.getStatistics();
      console.log('\n=== 足迹统计信息 ===');
      console.log(`总足迹数: ${stats.totalCount}`);
      console.log(`国家/地区数: ${stats.countryCount}`);
      console.log(`城市数: ${stats.cityCount}`);
      if (Object.keys(stats.types).length > 0) {
        console.log('足迹类型分布:');
        Object.entries(stats.types).forEach(([type, count]) => {
          console.log(`  - ${type}: ${count} 个`);
        });
      }
      break;
    case 'export':
      manager.exportToCSV();
      break;
    default:
      console.log('\n用法: hexo footprint [命令]');
      console.log('命令:');
      console.log('  validate  验证所有足迹数据');
      console.log('  stats     显示足迹统计信息');
      console.log('  export    导出足迹数据为CSV');
  }
});