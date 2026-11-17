// Hexo generator：构建期自动生成符合 Apple Podcasts / 小宇宙规范的 podcast.xml
// 数据源 = source/_data/podcast-audio.json（由 tools/podcast/synth.py 维护）
// 用 generator 而非静态 source/*.xml，避免 Nunjucks 把 {# / {{ 当模板语法。
'use strict';
const fs = require('fs');
const path = require('path');

hexo.extend.generator.register('podcast_feed', function () {
  const cfg = JSON.parse(fs.readFileSync(path.join(hexo.base_dir, 'tools/podcast/config.json'), 'utf8'));
  const mfPath = path.join(hexo.base_dir, 'source/_data/podcast-audio.json');
  const show = cfg.show;

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  const hhmmss = sec => {
    const n = Math.max(0, Math.round(Number(sec) || 0));
    const p = x => String(x).padStart(2, '0');
    return p(Math.floor(n / 3600)) + ':' + p(Math.floor(n % 3600 / 60)) + ':' + p(n % 60);
  };

  let items = [];
  if (fs.existsSync(mfPath)) {
    let mf = {};
    // 合成器与构建可能同时运行；读到写入一半的 manifest 时降级为空，不中断整站构建
    try {
      mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
    } catch (e) {
      console.warn('[podcast-feed] manifest 尚未写完，本次跳过条目: ' + e.message);
    }
    // 只收录音频文件真实存在的条目，避免 feed 指向 404
    items = Object.keys(mf).map(abbr => ({ abbr, ...mf[abbr] }))
      .filter(x => fs.existsSync(path.join(hexo.base_dir, 'source/audio/podcast', x.abbr + '.mp3')))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  const itemXml = items.map(x => {
    const date = new Date(x.date);
    const pub = isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString();
    const desc = '本期由《' + x.title + '》生成，台词取自文章自身的摘要、问答与章节要点。完整文字：' + x.post;
    return [
      '    <item>',
      '      <title>' + esc(x.title) + '</title>',
      '      <link>' + esc(x.post) + '</link>',
      '      <description>' + esc(desc) + '</description>',
      '      <itunes:summary>' + esc(desc) + '</itunes:summary>',
      '      <pubDate>' + pub + '</pubDate>',
      '      <guid isPermaLink="false">tag:mfy-lifeline.com,2026:podcast/' + esc(x.abbr) + '</guid>',
      '      <enclosure url="' + esc(x.url) + '" length="' + Number(x.bytes) + '" type="audio/mpeg" />',
      '      <itunes:duration>' + hhmmss(x.duration) + '</itunes:duration>',
      '      <itunes:image href="' + esc(show.artwork) + '" />',
      '      <itunes:explicit>' + esc(show.explicit) + '</itunes:explicit>',
      '      <itunes:episodeType>full</itunes:episodeType>',
      '    </item>'
    ].join('\n');
  }).join('\n');

  const owner = show.ownerEmail
    ? '    <itunes:owner>\n      <itunes:name>' + esc(show.author) + '</itunes:name>\n      <itunes:email>' + esc(show.ownerEmail) + '</itunes:email>\n    </itunes:owner>\n'
    : '';

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    '  <channel>',
    '    <title>' + esc(show.title) + '</title>',
    '    <link>' + esc(show.link) + '</link>',
    '    <description>' + esc(show.description) + '</description>',
    '    <language>' + esc(show.language) + '</language>',
    '    <itunes:author>' + esc(show.author) + '</itunes:author>',
    '    <itunes:summary>' + esc(show.description) + '</itunes:summary>',
    '    <itunes:image href="' + esc(show.artwork) + '" />',
    '    <itunes:category text="' + esc(show.category) + '" />',
    '    <itunes:explicit>' + esc(show.explicit) + '</itunes:explicit>',
    '    <itunes:type>episodic</itunes:type>',
    owner.replace(/\n$/, ''),
    itemXml,
    '  </channel>',
    '</rss>',
    ''
  ].filter(x => x !== '').join('\n');

  return { path: 'podcast.xml', data: xml };
});
