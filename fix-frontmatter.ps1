$postsPath = "source/_posts"
$files = Get-ChildItem -Path $postsPath -Filter *.md

foreach ($file in $files) {
    $lines = Get-Content $file.FullName
    $startIndex = ($lines | Select-String "^---$").LineNumber[0]
    $endIndex = ($lines | Select-String "^---$").LineNumber[1]
    if ($startIndex -eq 0 -and $endIndex -gt 0) {
        $frontMatter = $lines[$startIndex+1..($endIndex-1)]
        $frontMatterText = $frontMatter -join "`n"

        # 用正则把 title/author/tags/date/categories/abbrlink 拆成多行
        $frontMatterText = $frontMatterText -replace "title:\s*([^\n]+?)\s*author:", "title: `$1`nauthor:"
        $frontMatterText = $frontMatterText -replace "author:\s*([^\n]+?)\s*tags:", "author: `$1`ntags:"
        $frontMatterText = $frontMatterText -replace "tags:\s*([^\n]+?)\s*categories:", "tags:`n  - `$1`ncategories:"
        $frontMatterText = $frontMatterText -replace "categories:\s*\[\]\s*date:", "categories: []`ndate:"
        $frontMatterText = $frontMatterText -replace "date:\s*([^\n]+?)\s*abbrlink:", "date: `$1`nabbrlink:"

        $fixedFrontMatter = $frontMatterText -split "`n"

        # 重新拼接全文
        $newLines = @()
        $newLines += $lines[0..$startIndex]
        $newLines += $fixedFrontMatter
        $newLines += $lines[$endIndex..($lines.Length-1)]
        Set-Content $file.FullName $newLines
        Write-Host "已修复 $($file.Name)"
    }
}
Write-Host "All fixed!"