/**
 * Hexo-pro与Netlify CMS冲突解决器
 * 自动检测并解决插件冲突
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ConflictResolver {
  constructor() {
    this.conflicts = [];
    this.resolutions = [];
    this.backupDir = 'backup/pre-migration';
    this.init();
  }

  init() {
    // 确保备份目录存在
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
    
    console.log('🔧 Hexo-pro与Netlify CMS冲突解决器已启动');
  }

  // 检测冲突
  async detectConflicts() {
    console.log('\n🔍 检测插件冲突...');
    
    this.conflicts = [];
    
    // 检查hexo-pro插件
    if (this.isPluginInstalled('hexo-pro')) {
      console.log('  ⚠️  检测到hexo-pro插件');
      
      this.conflicts.push({
        type: 'plugin_conflict',
        plugin: 'hexo-pro',
        severity: 'high',
        description: 'hexo-pro与Netlify CMS功能重叠，可能导致冲突',
        affected_files: this.getPluginFiles('hexo-pro')
      });
    }

    // 检查配置文件冲突
    const configConflicts = this.checkConfigConflicts();
    this.conflicts.push(...configConflicts);

    // 检查路由冲突
    const routeConflicts = this.checkRouteConflicts();
    this.conflicts.push(...routeConflicts);

    // 检查依赖冲突
    const dependencyConflicts = this.checkDependencyConflicts();
    this.conflicts.push(...dependencyConflicts);

    console.log(`  发现 ${this.conflicts.length} 个冲突`);
    
    return this.conflicts;
  }

  // 检查插件是否安装
  isPluginInstalled(pluginName) {
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      return !!(
        packageJson.dependencies?.[pluginName] || 
        packageJson.devDependencies?.[pluginName]
      );
    } catch (error) {
      return false;
    }
  }

  // 获取插件文件
  getPluginFiles(pluginName) {
    const pluginFiles = [];
    const pluginPath = `node_modules/${pluginName}`;
    
    if (fs.existsSync(pluginPath)) {
      this.walkDirectory(pluginPath, (file) => {
        pluginFiles.push(file);
      });
    }
    
    return pluginFiles;
  }

  // 遍历目录
  walkDirectory(dir, callback) {
    try {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          this.walkDirectory(filePath, callback);
        } else {
          callback(filePath);
        }
      });
    } catch (error) {
      console.warn(`  ⚠️  无法访问目录: ${dir}`);
    }
  }

  // 检查配置文件冲突
  checkConfigConflicts() {
    const conflicts = [];
    
    // 检查_config.yml中的冲突
    try {
      const config = fs.readFileSync('_config.yml', 'utf8');
      
      if (config.includes('hexo-pro') || config.includes('admin')) {
        conflicts.push({
          type: 'config_conflict',
          file: '_config.yml',
          severity: 'medium',
          description: '配置文件包含hexo-pro相关设置',
          details: '需要清理hexo-pro相关配置'
        });
      }
    } catch (error) {
      console.warn('  ⚠️  无法读取主配置文件');
    }

    // 检查主题配置文件
    const themeConfigPath = '_config.anzhiyu.yml';
    if (fs.existsSync(themeConfigPath)) {
      try {
        const themeConfig = fs.readFileSync(themeConfigPath, 'utf8');
        
        if (themeConfig.includes('hexo-pro') || themeConfig.includes('admin')) {
          conflicts.push({
            type: 'config_conflict',
            file: themeConfigPath,
            severity: 'low',
            description: '主题配置文件包含hexo-pro相关设置',
            details: '需要清理hexo-pro相关配置'
          });
        }
      } catch (error) {
        console.warn(`  ⚠️  无法读取主题配置文件: ${themeConfigPath}`);
      }
    }

    return conflicts;
  }

  // 检查路由冲突
  checkRouteConflicts() {
    const conflicts = [];
    
    // 检查source目录中的路由文件
    const adminPath = 'source/admin';
    if (fs.existsSync(adminPath)) {
      conflicts.push({
        type: 'route_conflict',
        path: adminPath,
        severity: 'high',
        description: 'hexo-pro的admin路由与Netlify CMS冲突',
        details: '需要移除hexo-pro的admin目录'
      });
    }

    return conflicts;
  }

  // 检查依赖冲突
  checkDependencyConflicts() {
    const conflicts = [];
    
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      // 检查hexo-pro依赖
      if (dependencies['hexo-pro']) {
        conflicts.push({
          type: 'dependency_conflict',
          package: 'hexo-pro',
          severity: 'high',
          description: 'hexo-pro包与Netlify CMS冲突',
          current_version: dependencies['hexo-pro'],
          solution: '卸载hexo-pro包'
        });
      }

      // 检查其他潜在冲突的依赖
      const conflictingPackages = ['hexo-admin', 'hexo-hey'];
      conflictingPackages.forEach(pkg => {
        if (dependencies[pkg]) {
          conflicts.push({
            type: 'dependency_conflict',
            package: pkg,
            severity: 'medium',
            description: `${pkg}可能与Netlify CMS功能重叠`,
            current_version: dependencies[pkg],
            solution: `考虑卸载${pkg}包`
          });
        }
      });

    } catch (error) {
      console.warn('  ⚠️  无法检查依赖冲突');
    }

    return conflicts;
  }

  // 解决冲突
  async resolveConflicts() {
    console.log('\n🔧 开始解决冲突...');
    
    this.resolutions = [];
    
    for (const conflict of this.conflicts) {
      try {
        const resolution = await this.resolveConflict(conflict);
        this.resolutions.push(resolution);
        console.log(`  ✅ 已解决: ${conflict.type} - ${conflict.description}`);
      } catch (error) {
        console.error(`  ❌ 解决失败: ${conflict.type} - ${error.message}`);
        this.resolutions.push({
          conflict: conflict,
          success: false,
          error: error.message
        });
      }
    }

    return this.resolutions;
  }

  // 解决单个冲突
  async resolveConflict(conflict) {
    switch (conflict.type) {
      case 'plugin_conflict':
        return this.resolvePluginConflict(conflict);
      
      case 'config_conflict':
        return this.resolveConfigConflict(conflict);
      
      case 'route_conflict':
        return this.resolveRouteConflict(conflict);
      
      case 'dependency_conflict':
        return this.resolveDependencyConflict(conflict);
      
      default:
        throw new Error(`未知的冲突类型: ${conflict.type}`);
    }
  }

  // 解决插件冲突
  resolvePluginConflict(conflict) {
    console.log(`  🔄 解决插件冲突: ${conflict.plugin}`);
    
    // 备份插件文件
    const backupPath = path.join(this.backupDir, `plugin-${conflict.plugin}-${Date.now()}`);
    if (fs.existsSync(`node_modules/${conflict.plugin}`)) {
      this.copyDirectory(`node_modules/${conflict.plugin}`, backupPath);
      console.log(`  📦 已备份插件文件到: ${backupPath}`);
    }

    // 卸载插件
    try {
      execSync(`npm uninstall ${conflict.plugin}`, { stdio: 'inherit' });
      console.log(`  🗑️  已卸载插件: ${conflict.plugin}`);
    } catch (error) {
      console.warn(`  ⚠️  卸载插件失败: ${error.message}`);
    }

    return {
      conflict: conflict,
      success: true,
      action: 'uninstall_plugin',
      backup_path: backupPath
    };
  }

  // 解决配置冲突
  resolveConfigConflict(conflict) {
    console.log(`  🔄 解决配置冲突: ${conflict.file}`);
    
    // 备份配置文件
    if (fs.existsSync(conflict.file)) {
      const backupPath = `${conflict.file}.backup-${Date.now()}`;
      fs.copyFileSync(conflict.file, backupPath);
      console.log(`  📦 已备份配置文件到: ${backupPath}`);
    }

    // 清理配置中的hexo-pro相关设置
    let config = fs.readFileSync(conflict.file, 'utf8');
    
    // 移除hexo-pro相关配置
    config = this.removeHexoProConfig(config);
    
    // 保存清理后的配置
    fs.writeFileSync(conflict.file, config);
    console.log(`  🧹 已清理配置文件: ${conflict.file}`);

    return {
      conflict: conflict,
      success: true,
      action: 'clean_config',
      backup_path: `${conflict.file}.backup-${Date.now()}`
    };
  }

  // 解决路由冲突
  resolveRouteConflict(conflict) {
    console.log(`  🔄 解决路由冲突: ${conflict.path}`);
    
    // 备份路由文件
    if (fs.existsSync(conflict.path)) {
      const backupPath = path.join(this.backupDir, `route-${path.basename(conflict.path)}-${Date.now()}`);
      this.copyDirectory(conflict.path, backupPath);
      console.log(`  📦 已备份路由文件到: ${backupPath}`);
      
      // 删除冲突的路由
      this.removeDirectory(conflict.path);
      console.log(`  🗑️  已移除冲突路由: ${conflict.path}`);
    }

    return {
      conflict: conflict,
      success: true,
      action: 'remove_route',
      backup_path: path.join(this.backupDir, `route-${path.basename(conflict.path)}-${Date.now()}`)
    };
  }

  // 解决依赖冲突
  resolveDependencyConflict(conflict) {
    console.log(`  🔄 解决依赖冲突: ${conflict.package}`);
    
    // 卸载冲突的包
    try {
      execSync(`npm uninstall ${conflict.package}`, { stdio: 'inherit' });
      console.log(`  🗑️  已卸载包: ${conflict.package}`);
    } catch (error) {
      console.warn(`  ⚠️  卸载包失败: ${error.message}`);
    }

    return {
      conflict: conflict,
      success: true,
      action: 'uninstall_package'
    };
  }

  // 移除hexo-pro相关配置
  removeHexoProConfig(config) {
    // 移除hexo-pro插件配置
    config = config.replace(/^\s*hexo-pro:\s*[\s\S]*?(?=\n\w|\n*$)/gm, '');
    
    // 移除admin相关配置
    config = config.replace(/^\s*admin:\s*[\s\S]*?(?=\n\w|\n*$)/gm, '');
    
    // 移除hexo_pro相关配置
    config = config.replace(/^\s*hexo_pro:\s*[\s\S]*?(?=\n\w|\n*$)/gm, '');
    
    return config;
  }

  // 复制目录
  copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const files = fs.readdirSync(src);
    files.forEach(file => {
      const srcPath = path.join(src, file);
      const destPath = path.join(dest, file);
      const stat = fs.statSync(srcPath);
      
      if (stat.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    });
  }

  // 删除目录
  removeDirectory(dir) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // 生成冲突报告
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      conflicts_detected: this.conflicts.length,
      conflicts_resolved: this.resolutions.filter(r => r.success).length,
      conflicts: this.conflicts,
      resolutions: this.resolutions,
      recommendations: this.generateRecommendations()
    };

    const reportPath = 'hexo-pro-conflict-resolution-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n📊 冲突解决报告已生成: ${reportPath}`);
    return report;
  }

  // 生成建议
  generateRecommendations() {
    const recommendations = [];
    
    if (this.conflicts.some(c => c.type === 'plugin_conflict')) {
      recommendations.push({
        type: 'post_resolution',
        priority: 'high',
        description: '重新安装依赖并清理缓存',
        action: 'npm install && hexo clean'
      });
    }

    if (this.conflicts.some(c => c.type === 'config_conflict')) {
      recommendations.push({
        type: 'post_resolution',
        priority: 'medium',
        description: '验证配置文件语法',
        action: '检查所有修改后的配置文件'
      });
    }

    recommendations.push({
      type: 'post_resolution',
      priority: 'low',
      description: '测试Netlify CMS功能',
      action: '运行hexo generate并访问/admin/测试管理后台'
    });

    return recommendations;
  }

  // 显示冲突摘要
  showConflictSummary() {
    console.log('\n📋 冲突摘要');
    console.log('==================');
    
    if (this.conflicts.length === 0) {
      console.log('✅ 未检测到冲突');
      return;
    }

    console.log(`检测到 ${this.conflicts.length} 个冲突:`);
    
    this.conflicts.forEach((conflict, index) => {
      const severityIcon = {
        high: '🔴',
        medium: '🟡',
        low: '🟢'
      }[conflict.severity];
      
      console.log(`  ${index + 1}. ${severityIcon} [${conflict.type}] ${conflict.description}`);
    });

    const successfulResolutions = this.resolutions.filter(r => r.success);
    const failedResolutions = this.resolutions.filter(r => !r.success);
    
    console.log(`\n解决结果:`);
    console.log(`  ✅ 成功: ${successfulResolutions.length}`);
    console.log(`  ❌ 失败: ${failedResolutions.length}`);
    
    if (failedResolutions.length > 0) {
      console.log('\n失败的解决:');
      failedResolutions.forEach(resolution => {
        console.log(`  - ${resolution.conflict.type}: ${resolution.error}`);
      });
    }
  }
}

// 运行冲突解决
if (require.main === module) {
  const resolver = new ConflictResolver();
  
  resolver.detectConflicts()
    .then(() => resolver.resolveConflicts())
    .then(() => {
      resolver.showConflictSummary();
      resolver.generateReport();
      console.log('\n🎉 冲突解决完成！');
    })
    .catch(error => {
      console.error('\n❌ 冲突解决失败:', error);
      process.exit(1);
    });
}

module.exports = ConflictResolver;