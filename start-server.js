const { spawn } = require('child_process');

console.log('开始启动Hexo服务器...');

// 使用spawn启动hexo server命令
const hexoServer = spawn('hexo', ['server', '--debug'], {
  stdio: 'inherit',
  shell: true
});

// 监听进程事件
hexoServer.on('close', (code) => {
  console.log(`Hexo服务器进程已关闭，退出码: ${code}`);
});

hexoServer.on('error', (error) => {
  console.error('启动Hexo服务器时出错:', error);
});

// 保持脚本运行，不自动退出
console.log('服务器启动脚本正在运行...');