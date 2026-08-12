/**
 * 简化的Admin文件复制脚本
 * 不依赖外部库的基础版本
 */

const fs = require('fs');
const path = require('path');

const ADMIN_SOURCE_DIR = path.join(__dirname, '..', 'static', 'admin');
const ADMIN_PUBLIC_DIR = path.join(__dirname, '..', 'public', 'admin');

function copyFileSync(source, target) {
  try {
    fs.copyFileSync(source, target);
    console.log(`✅ 已复制: ${path.basename(source)}`);
    return true;
  } catch (error) {
    console.error(`❌ 复制失败: ${path.basename(source)} - ${error.message}`);
    return false;
  }
}

function copyAdminFiles() {
  console.log('🚀 开始复制Admin文件...');
  
  try {
    // 确保目标目录存在
    if (!fs.existsSync(ADMIN_PUBLIC_DIR)) {
      fs.mkdirSync(ADMIN_PUBLIC_DIR, { recursive: true });
      console.log('📁 创建admin目录');
    }

    // 检查源目录
    if (!fs.existsSync(ADMIN_SOURCE_DIR)) {
      console.log('⚠️  源目录不存在，跳过复制');
      return;
    }

    // 复制所有文件
    const files = fs.readdirSync(ADMIN_SOURCE_DIR);
    let successCount = 0;
    
    files.forEach(file => {
      const sourcePath = path.join(ADMIN_SOURCE_DIR, file);
      const targetPath = path.join(ADMIN_PUBLIC_DIR, file);
      
      if (fs.statSync(sourcePath).isFile()) {
        if (copyFileSync(sourcePath, targetPath)) {
          successCount++;
        }
      }
    });
    
    console.log(`🎉 Admin文件复制完成！成功复制 ${successCount} 个文件`);
    
  } catch (error) {
    console.error('❌ Admin文件复制失败:', error.message);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  copyAdminFiles();
}

// 导出函数供其他脚本使用
module.exports = { copyAdminFiles };