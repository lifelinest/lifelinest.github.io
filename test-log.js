// 测试文件 - 修改log-js.pug后控制台无变化的排查
console.log('测试文件已加载，修改log-js.pug后请刷新页面查看效果');

// 尝试恢复console.log函数
setTimeout(() => {
  if (window.HoldLog) {
    console.log = window.HoldLog;
    console.log('console.log函数已恢复');
  }
}, 2000);