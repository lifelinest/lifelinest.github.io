#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 测试每个脚本文件
const scriptsDir = path.join(__dirname, 'scripts');
const scriptFiles = fs.readdirSync(scriptsDir);

console.log('🔍 开始测试脚本文件...');

scriptFiles.forEach(file => {
  const filePath = path.join(scriptsDir, file);
  
  // 跳过非JavaScript文件
  if (!file.endsWith('.js')) {
    console.log(`⏭️  跳过: ${file} (非JavaScript文件)`);
    return;
  }
  
  console.log(`\n🧪 测试脚本: ${file}`);
  
  try {
    // 测试加载脚本
    const startTime = Date.now();
    require(filePath);
    const endTime = Date.now();
    console.log(`✅ 成功加载脚本: ${file} (${endTime - startTime}ms)`);
  } catch (error) {
    console.error(`❌ 加载脚本失败: ${file}`);
    console.error(`   错误信息: ${error.message}`);
  }
});

console.log('\n🎉 脚本测试完成！');
