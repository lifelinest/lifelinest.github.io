# 批量为所有没有 abbrlink 的文章补全 abbrlink 字段
$postsPath = "source/_posts"
$files = Get-ChildItem -Path $postsPath -Filter *.md

function Get-Abbrlink($title) {
    # 用简单的哈希算法生成唯一数字（可自定义）
    $hash = 0
    foreach ($c in $title.ToCharArray()) {
        $hash = ($hash * 31 + [int][char]$c) % 1000000007
    }
    return $hash
}

foreach ($file in $files) {
    $lines = Get-Content $file.FullName
    if ($lines -join "`n" -notmatch "abbrlink:") {
        # 找到 front-matter 结尾行号
        $endIndex = ($lines | Select-String "^---$").LineNumber[1]
        if ($endIndex) {
            # 获取标题
            $titleLine = $lines | Where-Object { $_ -match "^title:" }
            $title = $titleLine -replace "^title:\s*", ""
            $abbrlink = Get-Abbrlink $title
            # 在 front-matter 结尾前插入 abbrlink
            $lines = $lines[0..($endIndex-2)] + "abbrlink: $abbrlink" + $lines[($endIndex-1)..($lines.Length-1)]
            Set-Content $file.FullName $lines
            Write-Host "已为 $($file.Name) 添加 abbrlink: $abbrlink"
        }
    }
}
Write-Host "All done!"