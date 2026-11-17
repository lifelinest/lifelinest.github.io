// 台词稿体检：确认「100% 来自原文、没有把 Markdown/链接/推广语念进音频」
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = 'D:/1/1/.tmp/podcast/scripts';
const mf = require('D:/1/1/.tmp/podcast/source-manifest.json');

const BAD = [
  ['markdown 图片', /!\[|\]\(/],
  ['URL', /https?:\/\/|www\./i],
  ['Hexo 标签', /\{%|\{\{/],
  ['HTML 标签', /<\/?[a-z][^>]*>/i],
  ['强调/标题符', /\*\*|^#{1,6}\s|\s#{1,6}\s/],
  ['代码块', /```|\|\s*---/],
  ['占位/待补', /\[待考证\]|\[待补\]|TODO|XX{2,}/i],
  ['推广/引导', /扫码|关注我|转载请|点击阅读原文|商务合作|加微信|私信我/i]
];
const issues = [];
let chars = 0, lines = 0;

for (const rec of mf) {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, rec.abbrlink + '.json'), 'utf8'));
  chars += d.chars; lines += d.lines.length;
  d.lines.forEach((l, i) => {
    if (!l.text || !l.text.trim()) issues.push([rec.abbrlink, i + 1, '空台词', '']);
    if (l.text.length > 260) issues.push([rec.abbrlink, i + 1, '超长台词 ' + l.text.length + ' 字', l.text.slice(0, 60)]);
    for (const [name, re] of BAD) {
      if (re.test(l.text)) issues.push([rec.abbrlink, i + 1, name, l.text.slice(0, 90)]);
    }
  });
  // 同一篇里重复台词
  const seen = new Set();
  d.lines.forEach((l, i) => {
    if (seen.has(l.text)) issues.push([rec.abbrlink, i + 1, '重复台词', l.text.slice(0, 60)]);
    seen.add(l.text);
  });
}

console.log('篇数=%d 台词总数=%d 总字符=%d 平均=%.0f 字/篇', mf.length, lines, chars, chars / mf.length);
console.log('问题数=%d', issues.length);
issues.slice(0, 40).forEach(x => console.log('  %s #%d [%s] %s', x[0], x[1], x[2], x[3]));

// 打印 2 篇无 FAQ 骨架样本，供人工听感核对
const noFaq = mf.filter(r => {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, r.abbrlink + '.json'), 'utf8'));
  return d.lines.some(l => l.text.indexOf('这篇主要分几块讲') >= 0);
});
console.log('\n=== 无 FAQ 骨架篇数=%d，样本 2 篇 ===', noFaq.length);
noFaq.slice(0, 2).forEach(r => {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, r.abbrlink + '.json'), 'utf8'));
  console.log('\n--- ' + r.abbrlink + ' | ' + d.title + ' | ' + d.lines.length + ' 句 / ' + d.chars + ' 字 ---');
  d.lines.forEach((l, i) => console.log((i + 1) + '. [' + l.role + '] ' + l.text.slice(0, 150)));
});

// 退回 description 的篇数
const fb = mf.filter(r => {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, r.abbrlink + '.json'), 'utf8'));
  return d.lines.some(l => l.text.indexOf('那这篇具体讲了什么') >= 0);
});
console.log('\n退回 description 骨架的篇数=%d %s', fb.length, fb.slice(0, 6).map(x => x.abbrlink).join(','));
