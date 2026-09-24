/**
 * AnZhiYu
 * @example
 *  page_description()
 *  cloudTags(source, minfontsize, maxfontsize, limit)
 */

"use strict";

const { stripHTML, escapeHTML, prettyUrls } = require("hexo-util");
const crypto = require("crypto");

hexo.extend.helper.register('page_description', function () {
  const { config, page } = this

  // 自动页（首页/标签页/归档/相册/追番等）没有独立 description，会落到很短的
  // page.title，被 Bing 等搜索引擎判为“元描述过短”。按 path/layout 注入合规描述。
  const AUTO_DESC = {
    home: '孟凡宇（Lifeline）的个人博客，专注用 AI 与 SEO 跑通外贸 B2B 独立站。这里系统分享独立站运营、Google SEO/Ads 投放、AI 内容增长、效率工具与软件测评的实战笔记与踩坑记录，以及前端开发与博客搭建经验，帮助读者从 0 到 1 搭建可获客的内容与流量体系，把实战踩过的坑变成可复用的方法。',
    tags: '浏览本博客全部文章标签，按主题快速定位独立站运营、Google SEO、AI 内容增长、效率工具与软件测评等实战笔记分类。无论你想找某一技术方向还是某个工具的踩坑记录，都能在这里通过标签高效归集与检索，提升找内容的效率，让分散在各篇文章里的经验按主题重新串起来。',
    archives: '按时间倒序列出孟凡宇博客的全部文章归档，涵盖独立站运营、SEO/Ads 投放、AI 工具落地、效率软件与技术踩坑等历史笔记，方便按月份回溯与检索每一篇实战分享，从建站至今的每一次更新都一目了然，是回顾站点成长与按时间线查找内容的入口，也方便追踪长期主题脉络。',
    album: '相册集是孟凡宇的影像记录空间，按主题汇集旅行、生活与项目中的精选照片，留存值得纪念的瞬间与沿途风景，用图像讲述文字之外的故事，方便访客一站式浏览与回味，涵盖城市街拍、自然风光与日常碎片，呈现镜头下的世界与心境，让记忆以最直观的方式被看见与收藏，留住每一个值得回看的时刻。',
    bangumis: '番剧与追番记录页，汇总孟凡宇在看的动画与新番追踪，分享观番心得、评分与推荐清单，记录每一季的追看进度与短评，也整理值得安利给同好的佳作，为紧张的实战技术分享之外保留一处轻松的二次元休闲角落，让同好能在这里交流彼此的观番体验，发现更多值得一看的好番。'
  }

  // 段路径：去掉尾部 index.html 与首尾斜杠（实际 page.path 形如 tags/index.html、archives/2026/07/index.html）
  const seg = (page.path || '')
    .replace(/index\.html$/, '')
    .replace(/^\/+|\/+$/g, '')

  let description = page.description || page.content || page.title || config.description

  // 按段前缀注入自动描述（首页 / 标签 / 归档全系 / 相册 / 追番）
  let autoKey = null
  if (seg === '') autoKey = 'home'
  else if (seg === 'tags') autoKey = 'tags'
  else if (seg.indexOf('archives') === 0) autoKey = 'archives'
  else if (seg.indexOf('album') === 0) autoKey = 'album'
  else if (seg.indexOf('bangumis') === 0) autoKey = 'bangumis'

  if (autoKey && AUTO_DESC[autoKey]) {
    // 仅当当前描述偏短时才覆盖，避免覆盖已有合规描述（如 album 自身 description）
    const currentLen = String(page.description || page.content || page.title || '').replace(/<[^>]+>/g, '').length
    if (currentLen < 100) {
      description = AUTO_DESC[autoKey]
    }
  }

  if (description) {
    // 1) stripHTML 只剥标签，不剥 <script>/<style> 内部的文本。
    //    没有写 description 的页面（如 /charts）会因此把页内 JS 当成摘要输出到 SERP。
    //    先把这几类块整体摘掉，再交给 stripHTML。
    const text = String(description)
      .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')

    const cleaned = stripHTML(text).replace(/\n/g, ' ').trim()
    // 2) 仍不足 100 字则回退到站点描述，避免被判过短
    if (cleaned.length < 100 && config.description) {
      return stripHTML(String(config.description)).substring(0, 150).trim().replace(/\n/g, ' ')
    }
    // 3) 这里不要再调 escapeHTML()。本 helper 只被 Open_Graph.pug 的 meta(content=...)
    //    使用，pug 写属性时会转义一次，再转一次会出现双层（SERP 摘要出现 &amp;quot;）。
    //    转义交给 pug，这里只负责产出纯文本。
    return cleaned.substring(0, 150)
  }
})

hexo.extend.helper.register("get_page_fill_description", function () {
  const { config, page } = this;
  let description = page.content || page.description || page.title || config.description;

  if (description) {
    // 使用正则表达式匹配 h1-h6 标签中的文本内容
    const regex = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/g;
    const headings = [];
    let match;
    while ((match = regex.exec(description))) {
      headings.push(match[0]);
    }

    const contents = headings.map(heading => {
      // 去掉 a 标签及其内容
      const text = heading.replace(/<a[^>]*>.*?<\/a>/g, "");
      // 去除特殊符号 &,:,; 等
      return text.replace(/<\/?[^>]+>|&|:|;|quot;|，|,|“|”|"|'|#/g, "");
    });

    // 排除 div.post-ai-description 元素中的内容
    const excludedDivRegex = /<div[^>]*class="?post-ai-description"?.*?>[\s\S]*?<\/div>/gi;
    description = description.replace(excludedDivRegex, "");

    description = escapeHTML(stripHTML(description).trim())
      .replace(/\n/g, " ")
      .replace(/[^\u4e00-\u9fa5]/gi, "");

    return contents.join(", ") + description;
  }
});

hexo.extend.helper.register("cloudTags", function (options = {}) {
  const env = this;
  let source = options.source;
  const minfontsize = options.minfontsize;
  const maxfontsize = options.maxfontsize;
  const limit = options.limit;
  const unit = options.unit || "px";
  const colorful = options.color || false;
  const highlightTags = options.highlightTags || [];

  let result = "";
  if (limit > 0) {
    source = source.limit(limit);
  }

  const sizes = [];
  source.sort("length").forEach(tag => {
    const { length } = tag;
    if (sizes.includes(length)) return;
    sizes.push(length);
  });

  const length = sizes.length - 1;
  source.sort("name").forEach(tag => {
    const ratio = length ? sizes.indexOf(tag.length) / length : 0;
    const size = minfontsize + (maxfontsize - minfontsize) * ratio;
    let style = `font-size: ${parseFloat(size.toFixed(2))}${unit};`;
    if (colorful) {
      const color =
        "rgb(" +
        Math.floor(Math.random() * 201) +
        ", " +
        Math.floor(Math.random() * 201) +
        ", " +
        Math.floor(Math.random() * 201) +
        ")"; // 0,0,0 -> 200,200,200
      style += ` color: ${color};`;
    }

    const matchingTag = highlightTags.find(highlightTag => highlightTag === tag.name);
    if (matchingTag) {
      style += ` font-weight: 500; color: var(--anzhiyu-lighttext)`;
    }
    result += `<a href="${env.url_for(tag.path)}" style="${style}">${tag.name}<sup>${tag.length}</sup></a>`;
  });
  return result;
});

hexo.extend.helper.register("urlNoIndex", function (url = null) {
  return prettyUrls(url || this.url, { trailing_index: false, trailing_html: true });
});

hexo.extend.helper.register("md5", function (path) {
  return crypto
    .createHash("md5")
    .update(decodeURI(this.url_for(path)))
    .digest("hex");
});

hexo.extend.helper.register('injectHtml', function (data) {
  if (!data) return ''
  return data.join('')
})

hexo.extend.helper.register("findArchivesTitle", function (page, menu, date) {
  if (page.year) {
    const dateStr = page.month ? `${page.year}-${page.month}` : `${page.year}`;
    const date_format = page.month ? hexo.theme.config.aside.card_archives.format : "YYYY";
    return date(dateStr, date_format);
  }

  const defaultTitle = this._p("page.archives");
  if (!menu) return defaultTitle;

  const loop = m => {
    for (const key in m) {
      if (typeof m[key] === "object") {
        loop(m[key]);
      }

      if (/\/archives\//.test(m[key])) {
        return key;
      }
    }
  };

  return loop(menu) || defaultTitle;
});

hexo.extend.helper.register('isImgOrUrl', function (path) {
  const imgTestReg = /\.(png|jpe?g|gif|svg|webp)(\?.*)?$/i
  return path.indexOf('//') !== -1 || imgTestReg.test(path)
})