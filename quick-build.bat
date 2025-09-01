@echo off
echo 开始清理...
hexo clean
timeout /t 3 /nobreak >nul
echo 清理完成，开始生成...
hexo generate
timeout /t 5 /nobreak >nul
echo 生成完成，终止后台进程...
taskkill /f /im node.exe >nul 2>&1
echo 构建完成！可以启动服务器了。
pause 