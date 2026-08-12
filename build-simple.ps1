# 简单构建脚本
Write-Host "开始构建..." -ForegroundColor Green

# 复制admin目录
Write-Host "复制Admin目录..." -ForegroundColor Blue
Copy-Item -Path "static\admin" -Destination "public" -Recurse -Force

# 生成静态文件
Write-Host "生成静态文件..." -ForegroundColor Blue
hexo generate

Write-Host "构建完成！" -ForegroundColor Green