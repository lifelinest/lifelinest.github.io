@echo off
echo ========================================
echo 智能构建脚本 - 自动处理 Auto Abbrlink 插件
echo ========================================

echo.
echo [1/3] 开始清理...
start /b hexo clean
timeout /t 2 /nobreak >nul

:clean_wait
tasklist /fi "imagename eq node.exe" | find "node.exe" >nul
if %errorlevel% equ 0 (
    echo 等待清理完成...
    timeout /t 1 /nobreak >nul
    goto clean_wait
)
echo ✓ 清理完成！

echo.
echo [2/3] 开始生成...
start /b hexo generate
timeout /t 3 /nobreak >nul

:generate_wait
tasklist /fi "imagename eq node.exe" | find "node.exe" >nul
if %errorlevel% equ 0 (
    echo 等待生成完成...
    timeout /t 2 /nobreak >nul
    goto generate_wait
)
echo ✓ 生成完成！

echo.
echo [3/3] 终止后台进程...
taskkill /f /im node.exe >nul 2>&1
echo ✓ 后台进程已终止

echo.
echo ========================================
echo 构建完成！可以启动服务器了。
echo 运行: hexo server
echo ========================================
pause 