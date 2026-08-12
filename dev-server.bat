@echo off
echo 🚀 启动开发环境...

:: 复制admin目录
echo 📁 复制admin目录到public...
if exist static\admin (
    if not exist public\admin mkdir public\admin
    xcopy /E /Y /I static\admin\* public\admin\
    echo ✅ Admin目录复制完成
) else (
    echo ⚠️ 未找到static\admin目录
)

:: 启动本地服务器
echo 🌐 启动本地服务器...
cd public
start http://localhost:8080/admin/
python -m http.server 8080

echo 🎉 开发服务器已启动！
echo 💡 可以访问 http://localhost:8080/admin/ 查看管理界面