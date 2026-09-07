---
title: 工具箱
date: 2026-09-06 12:00:00
aside: false
comments: false
top_img: false
description: 全能在线工具箱：开发助手、编码加密、文本处理、单位换算、日常计算、随机生成、设计辅助、查询参考等 70+ 纯本地小工具，数据不出浏览器。
keywords: 在线工具箱,JSON格式化,正则测试,单位换算,时间戳转换,二维码生成,Base64,UUID,哈希计算
---

<link rel="stylesheet" href="/css/feature-pages.css?v=20260907c">
<div class="fp-page" id="page-frontend">
  <div class="fp-hero fp-card">
    <div class="fp-hero-icon"><i class="anzhiyufont anzhiyu-icon-cube"></i></div>
    <div>
      <h2 class="fp-hero-title">工具箱</h2>
      <p class="fp-hero-sub">开发 / 编码 / 文本 / 换算 / 计算 / 随机 / 设计 / 查询，八大类纯本地小工具。<b>Ctrl+K</b> 搜索 · <b>Ctrl+Enter</b> 执行 · 所有数据不出浏览器。</p>
    </div>
    <div class="fp-hero-extra">
      <span class="fp-badge"><i class="anzhiyufont anzhiyu-icon-circle-check"></i>隐私安全</span>
      <span class="fp-badge" id="tb-count-badge">…</span>
    </div>
  </div>
  <div class="tb-shell tb-mode-list">
    <aside class="tb-side fp-card">
      <div class="tb-search">
        <i class="anzhiyufont anzhiyu-icon-magnifying-glass"></i>
        <input id="tb-search" type="text" placeholder="搜索工具… (Ctrl+K)" autocomplete="off">
        <button id="tb-search-clear" class="tb-search-clear" style="display:none" aria-label="清空搜索">
          <i class="anzhiyufont anzhiyu-icon-circle-xmark"></i>
        </button>
      </div>
      <nav class="tb-list" id="tb-list" aria-label="工具分类"></nav>
      <div class="tb-flyout" id="tb-flyout"></div>
    </aside>
    <main class="tb-main">
      <div class="tb-topbar fp-card">
        <button id="tb-back" class="fp-btn"><i class="anzhiyufont anzhiyu-icon-angle-left"></i>工具列表</button>
        <b id="tb-cur-name">—</b>
        <span class="tb-topbar-tip" id="tb-cur-tip"></span>
      </div>
      <div id="tb-view"></div>
    </main>
  </div>
  <div class="fp-hint" id="fp-usage" style="margin-top:14px;text-align:center;display:none"></div>
</div>
<script src="/js/lib/qrcode.js" defer></script>
<script src="/js/toolbox-core.js?v=20260907d"></script>
<script src="/js/toolbox-custom.js?v=20260907d"></script>
<script src="/js/toolbox-tools.js?v=20260907d"></script>
