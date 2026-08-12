/**
 * Hexo 思维导图标签插件
 * 支持使用 {% mindmap %}...{% endmindmap %} 语法在 Markdown 中插入思维导图
 */

hexo.extend.tag.register('mindmap', function(args, content) {
  const id = `mindmap-${Math.random().toString(36).substr(2, 9)}`;
  
  // 确保内容安全，避免模板渲染错误
  const safeContent = content.replace(/[<>&"'`]/g, function(match) {
    const escapeMap = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&#39;',
      '`': '&#96;'
    };
    return escapeMap[match] || match;
  });
  
  return `<div class="mindmap-container" id="${id}"><div class="mindmap-content">${safeContent}</div></div>`;
}, {ends: true});

// 为文章添加思维导图支持的辅助函数
hexo.extend.helper.register('hasMindmap', function(post) {
  return post && post.content && post.content.includes('mindmap-container');
});