/**
 * 自动备份系统
 * 定期备份博客数据和配置
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

class BackupSystem {
  constructor() {
    this.config = this.loadBackupConfig();
    this.backupDir = this.config.backup?.backup_directory || 'backup/auto';
    this.init();
  }

  init() {
    // 确保备份目录存在
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
    
    console.log('💾 自动备份系统已启动');
  }

  loadBackupConfig() {
    try {
      const securityConfigPath = '_config.security.yml';
      if (fs.existsSync(securityConfigPath)) {
        const yaml = require('js-yaml');
        return yaml.load(fs.readFileSync(securityConfigPath, 'utf8'));
      }
    } catch (error) {
      console.warn('⚠️  安全配置加载失败，使用默认配置');
    }
    
    return {
      backup: {
        enable: false, // 禁用自动备份系统
        backup_directory: 'backup/auto',
        max_backups: 7
      },
      monitoring: {
        enable: false // 禁用安全监控
      }
    };
  }

  // 创建完整备份
  createFullBackup() {
    console.log('🔄 开始创建完整备份...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `full-backup-${timestamp}`);
    
    try {
      if (!fs.existsSync(backupPath)) {
        fs.mkdirSync(backupPath, { recursive: true });
      }

      // 备份内容
      const itemsToBackup = [
        'source/_posts',
        'source/_data',
        '_config.yml',
        '_config.anzhiyu.yml',
        '_config.netlify_cms.yml',
        '_config.security.yml',
        '_admin-security.yml',
        'package.json',
        'scaffolds',
        'themes/anzhiyu/_config.yml'
      ];

      itemsToBackup.forEach(item => {
        if (fs.existsSync(item)) {
          this.copyItem(item, path.join(backupPath, item));
          console.log(`  ✅ 已备份: ${item}`);
        } else {
          console.log(`  ⚠️  跳过: ${item} (不存在)`);
        }
      });

      // 创建备份清单
      const manifest = {
        createdAt: new Date().toISOString(),
        version: this.getVersion(),
        items: itemsToBackup.filter(item => fs.existsSync(item)),
        size: this.calculateDirectorySize(backupPath)
      };

      fs.writeFileSync(
        path.join(backupPath, 'backup-manifest.json'),
        JSON.stringify(manifest, null, 2)
      );

      // 创建压缩包
      const zipFile = `${backupPath}.zip`;
      this.createZipBackup(backupPath, zipFile);

      console.log(`✅ 完整备份创建完成: ${zipFile}`);
      
      // 清理旧备份
      this.cleanupOldBackups();
      
      return {
        success: true,
        backupPath: zipFile,
        size: manifest.size,
        timestamp: manifest.createdAt
      };
      
    } catch (error) {
      console.error('❌ 完整备份创建失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 创建增量备份
  createIncrementalBackup() {
    console.log('🔄 开始创建增量备份...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `incremental-backup-${timestamp}`);
    
    try {
      if (!fs.existsSync(backupPath)) {
        fs.mkdirSync(backupPath, { recursive: true });
      }

      // 获取上次备份时间
      const lastBackupTime = this.getLastBackupTime();
      const changedFiles = this.getChangedFiles(lastBackupTime);

      if (changedFiles.length === 0) {
        console.log('ℹ️  没有文件变更，跳过增量备份');
        return {
          success: true,
          skipped: true,
          message: '没有文件变更'
        };
      }

      changedFiles.forEach(file => {
        if (fs.existsSync(file)) {
          this.copyItem(file, path.join(backupPath, file));
          console.log(`  ✅ 已备份: ${file}`);
        }
      });

      // 创建备份清单
      const manifest = {
        createdAt: new Date().toISOString(),
        version: this.getVersion(),
        type: 'incremental',
        baseBackup: lastBackupTime,
        changedFiles: changedFiles.filter(file => fs.existsSync(file)),
        size: this.calculateDirectorySize(backupPath)
      };

      fs.writeFileSync(
        path.join(backupPath, 'backup-manifest.json'),
        JSON.stringify(manifest, null, 2)
      );

      console.log(`✅ 增量备份创建完成: ${backupPath}`);
      
      return {
        success: true,
        backupPath: backupPath,
        changedFiles: manifest.changedFiles.length,
        size: manifest.size,
        timestamp: manifest.createdAt
      };
      
    } catch (error) {
      console.error('❌ 增量备份创建失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 复制文件或目录
  copyItem(src, dest) {
    const stat = fs.statSync(src);
    
    if (stat.isDirectory()) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      
      const files = fs.readdirSync(src);
      files.forEach(file => {
        this.copyItem(path.join(src, file), path.join(dest, file));
      });
    } else {
      const destDir = path.dirname(dest);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(src, dest);
    }
  }

  // 创建压缩备份
  createZipBackup(sourceDir, zipFile) {
    try {
      // 使用Windows内置压缩或第三方工具
      if (process.platform === 'win32') {
        // Windows PowerShell压缩
        const command = `powershell -command "Compress-Archive -Path '${sourceDir}' -DestinationPath '${zipFile}' -Force"`;
        execSync(command);
      } else {
        // Unix系统使用zip命令
        const command = `zip -r "${zipFile}" "${sourceDir}"`;
        execSync(command);
      }
      
      console.log(`  📦 压缩包创建完成: ${zipFile}`);
    } catch (error) {
      console.warn(`⚠️  压缩创建失败: ${error.message}`);
      // 保持原始备份目录
    }
  }

  // 获取版本信息
  getVersion() {
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      return {
        hexo: packageJson.dependencies?.hexo || 'unknown',
        theme: 'anzhiyu',
        backupSystem: '1.0.0'
      };
    } catch (error) {
      return {
        hexo: 'unknown',
        theme: 'anzhiyu',
        backupSystem: '1.0.0'
      };
    }
  }

  // 计算目录大小
  calculateDirectorySize(dirPath) {
    try {
      let totalSize = 0;
      const files = fs.readdirSync(dirPath);
      
      files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          totalSize += this.calculateDirectorySize(filePath);
        } else {
          totalSize += stat.size;
        }
      });
      
      return totalSize;
    } catch (error) {
      return 0;
    }
  }

  // 获取上次备份时间
  getLastBackupTime() {
    try {
      const backups = this.listBackups();
      if (backups.length > 0) {
        return new Date(backups[0].timestamp);
      }
    } catch (error) {
      console.warn('⚠️  获取上次备份时间失败:', error.message);
    }
    
    return new Date(0); // 如果没有备份，返回1970年
  }

  // 获取变更的文件
  getChangedFiles(since) {
    const changedFiles = [];
    const monitorPaths = [
      'source/_posts',
      'source/_data',
      '_config.yml',
      '_config.anzhiyu.yml',
      'scaffolds'
    ];

    monitorPaths.forEach(monitorPath => {
      if (fs.existsSync(monitorPath)) {
        this.findChangedFiles(monitorPath, since, changedFiles);
      }
    });

    return changedFiles;
  }

  // 递归查找变更文件
  findChangedFiles(dirPath, since, changedFiles) {
    try {
      const files = fs.readdirSync(dirPath);
      
      files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          this.findChangedFiles(filePath, since, changedFiles);
        } else if (stat.mtime > since) {
          changedFiles.push(filePath);
        }
      });
    } catch (error) {
      console.warn(`⚠️  扫描目录失败: ${dirPath}`, error.message);
    }
  }

  // 列出备份
  listBackups() {
    try {
      const backups = [];
      
      if (fs.existsSync(this.backupDir)) {
        const items = fs.readdirSync(this.backupDir);
        
        items.forEach(item => {
          const itemPath = path.join(this.backupDir, item);
          const stat = fs.statSync(itemPath);
          
          if (stat.isDirectory() && item.startsWith('full-backup-')) {
            const manifestPath = path.join(itemPath, 'backup-manifest.json');
            if (fs.existsSync(manifestPath)) {
              const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
              backups.push({
                type: 'full',
                path: itemPath,
                timestamp: manifest.createdAt,
                size: manifest.size,
                manifest: manifest
              });
            }
          } else if (item.startsWith('full-backup-') && item.endsWith('.zip')) {
            backups.push({
              type: 'full-zip',
              path: itemPath,
              timestamp: stat.mtime.toISOString(),
              size: stat.size
            });
          }
        });
      }
      
      return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      console.error('❌ 列出备份失败:', error.message);
      return [];
    }
  }

  // 清理旧备份
  cleanupOldBackups() {
    try {
      const maxBackups = this.config.backup?.max_backups || 7;
      const backups = this.listBackups();
      
      if (backups.length > maxBackups) {
        const toDelete = backups.slice(maxBackups);
        
        toDelete.forEach(backup => {
          try {
            if (fs.existsSync(backup.path)) {
              if (fs.statSync(backup.path).isDirectory()) {
                fs.rmSync(backup.path, { recursive: true, force: true });
              } else {
                fs.unlinkSync(backup.path);
              }
              console.log(`  🗑️  已删除旧备份: ${backup.path}`);
            }
          } catch (error) {
            console.warn(`⚠️  删除备份失败: ${backup.path}`, error.message);
          }
        });
      }
      
      console.log(`✅ 备份清理完成，保留最近 ${maxBackups} 个备份`);
    } catch (error) {
      console.error('❌ 备份清理失败:', error.message);
    }
  }

  // 验证备份完整性
  verifyBackup(backupPath) {
    console.log(`🔍 验证备份完整性: ${backupPath}`);
    
    try {
      let manifestPath;
      
      if (fs.statSync(backupPath).isDirectory()) {
        manifestPath = path.join(backupPath, 'backup-manifest.json');
      } else {
        console.log('⚠️  压缩包验证暂未实现');
        return { success: true, message: '压缩包验证暂未实现' };
      }
      
      if (!fs.existsSync(manifestPath)) {
        return { success: false, error: '备份清单不存在' };
      }
      
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const missingFiles = [];
      
      manifest.items.forEach(item => {
        const itemPath = path.join(backupPath, item);
        if (!fs.existsSync(itemPath)) {
          missingFiles.push(item);
        }
      });
      
      if (missingFiles.length > 0) {
        return {
          success: false,
          error: `缺失文件: ${missingFiles.join(', ')}`
        };
      }
      
      console.log('✅ 备份验证通过');
      return { success: true };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 恢复备份
  restoreBackup(backupPath) {
    console.log(`🔄 开始恢复备份: ${backupPath}`);
    
    try {
      const verification = this.verifyBackup(backupPath);
      if (!verification.success) {
        console.error('❌ 备份验证失败:', verification.error);
        return verification;
      }
      
      // 这里应该实现具体的恢复逻辑
      console.log('⚠️  恢复功能暂未实现，请手动恢复');
      
      return {
        success: true,
        message: '备份验证通过，请手动恢复文件'
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 显示备份状态
  showBackupStatus() {
    console.log('\n📊 备份状态报告');
    console.log('========================');
    
    const backups = this.listBackups();
    
    if (backups.length === 0) {
      console.log('ℹ️  暂无备份');
      return;
    }
    
    console.log(`总备份数: ${backups.length}`);
    console.log(`最新备份: ${backups[0].timestamp}`);
    console.log(`备份总大小: ${this.formatBytes(backups.reduce((sum, b) => sum + (b.size || 0), 0))}`);
    
    console.log('\n最近备份:');
    backups.slice(0, 5).forEach((backup, index) => {
      console.log(`  ${index + 1}. ${backup.type} - ${backup.timestamp} (${this.formatBytes(backup.size)})`);
    });
  }

  // 格式化字节数
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// 导出备份系统
const backupSystem = new BackupSystem();

// 如果直接运行此脚本
if (require.main === module) {
  const command = process.argv[2] || 'status';
  
  switch (command) {
    case 'full':
      backupSystem.createFullBackup();
      break;
    case 'incremental':
      backupSystem.createIncrementalBackup();
      break;
    case 'status':
      backupSystem.showBackupStatus();
      break;
    case 'cleanup':
      backupSystem.cleanupOldBackups();
      break;
    default:
      console.log('用法: node backup-system.js [full|incremental|status|cleanup]');
  }
}

module.exports = backupSystem;