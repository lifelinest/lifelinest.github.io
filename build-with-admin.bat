@echo off
echo 🚀 开始构建 - 包含Admin目录复制...

:: 复制admin目录到public
echo 📁 复制admin目录...
if exist static\admin (
    if not exist public\admin mkdir public\admin
    xcopy /E /Y /I static\admin\* public\admin\
    echo ✅ Admin目录复制完成
) else (
    echo ⚠️ 未找到static\admin目录
)

:: 执行Hexo生成
echo 📝 执行Hexo生成...
call hexo generate

if %errorlevel% equ 0 (
    echo ✅ 构建成功！
    echo 🌐 可以访问 http://localhost:8080/admin/ 查看管理界面
) else (
    echo ❌ 构建失败，请检查错误信息
)

echo 🎉 构建完成！
pause