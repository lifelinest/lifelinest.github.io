# Hexo + Netlify CMS 构建脚本
param(
    [switch]$Serve,
    [switch]$Clean
)

Write-Host "🚀 Hexo + Netlify CMS 构建工具" -ForegroundColor Green

# 清理操作
if ($Clean) {
    Write-Host "🧹 执行清理..." -ForegroundColor Yellow
    hexo clean
}

# 复制admin目录
Write-Host "📁 复制Admin目录..." -ForegroundColor Blue
if (Test-Path "static\admin") {
    if (!(Test-Path "public\admin")) {
        New-Item -ItemType Directory -Path "public\admin" -Force | Out-Null
    }
    Copy-Item -Path "static\admin\*" -Destination "public\admin" -Recurse -Force
    Write-Host "✅ Admin目录复制完成" -ForegroundColor Green
} else {
    Write-Host "⚠️ 未找到static\admin目录" -ForegroundColor Yellow
}

# 生成静态文件
Write-Host "📝 生成静态文件..." -ForegroundColor Blue
hexo generate

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 构建成功！" -ForegroundColor Green
    
    if ($Serve) {
        Write-Host "🌐 启动本地服务器..." -ForegroundColor Blue
        Write-Host "💡 访问 http://localhost:8080/admin/ 查看管理界面" -ForegroundColor Cyan
        
        Start-Process "http://localhost:8080/admin/"
        
        Set-Location public
        python -m http.server 8080
    }
} else {
    Write-Host "❌ 构建失败，请检查错误信息" -ForegroundColor Red
}

Write-Host "操作完成！" -ForegroundColor Green