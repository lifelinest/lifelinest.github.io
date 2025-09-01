Write-Host "========================================" -ForegroundColor Cyan
Write-Host "智能构建脚本 - 自动处理 Auto Abbrlink 插件" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "[1/3] 开始清理..." -ForegroundColor Yellow
$cleanJob = Start-Job -ScriptBlock { 
    Set-Location "D:\1\1\Blog"
    hexo clean
}

# 等待清理完成
while ($cleanJob.State -eq "Running") {
    Write-Host "等待清理完成..." -ForegroundColor Gray
    Start-Sleep -Seconds 2
}

$cleanResult = Receive-Job $cleanJob
Remove-Job $cleanJob
Write-Host "✓ 清理完成！" -ForegroundColor Green

Write-Host ""
Write-Host "[2/3] 开始生成..." -ForegroundColor Yellow
$generateJob = Start-Job -ScriptBlock { 
    Set-Location "D:\1\1\Blog"
    hexo generate
}

# 等待生成完成
while ($generateJob.State -eq "Running") {
    Write-Host "等待生成完成..." -ForegroundColor Gray
    Start-Sleep -Seconds 3
}

$generateResult = Receive-Job $generateJob
Remove-Job $generateJob
Write-Host "✓ 生成完成！" -ForegroundColor Green

Write-Host ""
Write-Host "[3/3] 终止后台进程..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "✓ 后台进程已终止" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "构建完成！可以启动服务器了。" -ForegroundColor Green
Write-Host "运行: hexo server" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Read-Host "按回车键继续" 