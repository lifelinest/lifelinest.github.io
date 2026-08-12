'use strict';

/**
 * 站点内容索引生成器
 * 在 hexo generate / hexo server 时生成 /site-index.json
 * 供前端 Live2D 看板娘大模型对话使用：让 AI 能基于站点全部页面内容回答访客提问并附上链接
 *
 * 索引内容：每篇文章 / 独立页面的 标题、相对链接、标签、分类、内容摘要(前 ~140 字)
 */

hexo.extend.generator.register('site-index', function (locals) {
  const siteUrl = (hexo.config && hexo.config.url) || (locals.config && locals.config.url) || '';
  const items = [];

  // 1. 博客文章（按日期倒序）
  locals.posts.sort('-date').forEach(function (post) {
    items.push(buildItem(post, 'post'));
  });

  // 2. 独立页面
  locals.pages.forEach(function (page) {
    const src = page.source || '';
    if (!/\.md$/i.test(src)) return;                 // 仅索引 markdown 页面
    if (/reward-admin|google[a-z0-9]*\.(html|txt)/i.test(src)) return; // 排除工具页
    if (!page.title) return;                          // 排除无标题页面
    // 排除开发 / 设计文档（对访客无意义）
    if (/(layout_design|interaction_design|plugin-dev|dev-doc|footprint-map-plugin)/i.test(src)) return;
    items.push(buildItem(page, 'page'));
  });

  const data = JSON.stringify({
    generated: Date.now(),
    site: siteUrl,
    count: items.length,
    items: items
  });

  return { path: 'site-index.json', data: data };
});

function buildItem(post, type) {
  return {
    type: type,
    title: post.title || '',
    url: relUrl(post),
    date: post.date ? new Date(post.date).getTime() : 0,
    tags: collectNames(post.tags),
    categories: collectNames(post.categories),
    excerpt: makeExcerpt(post.excerpt || post.content, 140)
  };
}

// 取相对路径（去掉协议与域名），便于换域名时仍可用
function relUrl(post) {
  let p = post.permalink || post.path || '';
  p = p.replace(/^https?:\/\/[^\/]+/, '');   // 去掉 http(s)://域名
  p = p.replace(/\/index\.html$/, '/');      // posts/xxx/index.html -> posts/xxx/
  if (!p) p = '/';
  if (p.charAt(0) !== '/') p = '/' + p;
  return p;
}

function collectNames(coll) {
  if (!coll) return [];
  let arr = coll;
  if (typeof coll.toArray === 'function') arr = coll.toArray();
  if (!Array.isArray(arr)) return [];
  return arr.map(function (c) { return (c && c.name) || ''; }).filter(Boolean);
}

// 把 markdown / html 噪声清掉，取前 n 字纯文本作为摘要
function makeExcerpt(str, n) {
  if (!str) return '';
  const text = String(str)
    .replace(/```[\s\S]*?```/g, '')          // 代码块
    .replace(/<!--[\s\S]*?-->/g, '')          // HTML/Hexo 注释
    .replace(/<[^>]+>/g, '')                  // HTML 标签
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')     // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // 链接保留文字
    .replace(/`([^`]*)`/g, '$1')              // 行内代码
    .replace(/^#{1,6}\s+/gm, '')              // 标题标记
    .replace(/[*_~]/g, '')                     // 强调
    .replace(/&emsp;|&ensp;|&nbsp;/g, ' ')    // 实体空格
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > n ? text.slice(0, n) + '…' : text;
}
