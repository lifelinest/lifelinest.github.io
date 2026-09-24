---
title: 心愿墙
date: 2026-09-06 20:00:00
aside: false
comments: false
top_img: false
description: 心愿墙与树洞是孟凡宇博客的互动角落，访客可以匿名写下一张便签贴上墙，许下一个想实现的愿望，或者找个树洞安心说说心里话。这里没有评判，只有被听见与被陪伴的温柔，支持匿名发布与点赞互动，愿每一份悄悄写下的心事都能被温柔以待。
keywords: 心愿墙,树洞,便签墙,许愿
---

<link rel="stylesheet" href="/css/feature-pages.css?v=20260907h">
<link rel="stylesheet" href="/css/wish.css?v=20260907d">
<script>/* 心愿墙云端 API（Cloudflare Worker，已绑定自定义域名绕过 workers.dev 被墙问题） */
window.WISH_API = 'https://wish-api.mfyresume.dpdns.org';</script>

<div class="fp-page" id="page-wish">
  <div class="fp-hero fp-card">
    <div class="fp-hero-icon"><i class="anzhiyufont anzhiyu-icon-hand-heart-fill"></i></div>
    <div>
      <h2 class="fp-hero-title">心愿墙</h2>
      <p class="fp-hero-sub">写下一张便签贴上墙 —— 许一个想实现的愿望，或是找个树洞说说心里话。支持匿名。</p>
    </div>
    <div class="fp-hero-extra">
      <span class="fp-badge wb-mode-badge" id="wb-mode"><i class="anzhiyufont anzhiyu-icon-circle-check"></i>检测连接中</span>
    </div>
  </div>
  <div class="wb-stats fp-card">
    <div class="wb-stat"><i class="anzhiyufont anzhiyu-icon-dice-d20"></i><b id="wb-count-all">0</b><span>便签总数</span></div>
    <div class="wb-stat"><i class="anzhiyufont anzhiyu-icon-plant-fill"></i><b id="wb-count-wish">0</b><span>心愿</span></div>
    <div class="wb-stat"><i class="anzhiyufont anzhiyu-icon-moon"></i><b id="wb-count-hole">0</b><span>树洞</span></div>
    <div class="wb-stat"><i class="anzhiyufont anzhiyu-icon-heartbeat"></i><b id="wb-count-likes">0</b><span>收获共鸣</span></div>
  </div>
  <div class="wb-compose fp-card" id="wb-compose">
    <button class="wb-compose-btn" id="wb-compose-btn" type="button"><i class="anzhiyufont anzhiyu-icon-pencil"></i>写一张便签</button>
    <div class="wb-form" id="wb-form" hidden>
      <div class="wb-form-row">
        <div class="wb-types" id="wb-types" role="tablist">
          <button type="button" class="wb-type active" data-type="wish"><i class="anzhiyufont anzhiyu-icon-plant-fill"></i>心愿</button>
          <button type="button" class="wb-type" data-type="hole"><i class="anzhiyufont anzhiyu-icon-moon"></i>树洞</button>
        </div>
        <span class="wb-form-tip" id="wb-type-tip">写下你想实现的事，实现后可以回来点亮它</span>
      </div>
      <div class="wb-form-row">
        <div class="wb-colors" id="wb-colors" role="radiogroup" aria-label="便签颜色"></div>
      </div>
      <div class="wb-form-row wb-form-inputs">
        <input class="wb-input" id="wb-nick" type="text" maxlength="12" placeholder="怎么称呼你？留空则匿名">
        <textarea class="wb-input wb-textarea" id="wb-content" rows="3" maxlength="200" placeholder="这一页写给未来的自己……（200 字以内，Ctrl+Enter 直接贴上墙）"></textarea>
        <div class="wb-form-row" id="wb-target-row">
          <label class="fp-hint">目标日期（可选，卡片上会显示倒计时）<input type="date" class="wb-input" id="wb-target" style="width:auto;margin-left:8px"></label>
        </div>
        <div class="wb-form-foot">
          <span class="wb-counter" id="wb-counter">0 / 200</span>
          <button class="wb-submit" id="wb-submit" type="button" data-primary><i class="anzhiyufont anzhiyu-icon-paper-plane"></i>贴上墙</button>
        </div>
      </div>
    </div>
  </div>
  <div class="wb-wall-head">
    <h3 class="fp-section-title" style="margin:0"><i class="anzhiyufont anzhiyu-icon-comments"></i> 便签墙</h3>
    <div class="wb-tools">
      <div class="wb-searchbox">
        <i class="anzhiyufont anzhiyu-icon-magnifying-glass"></i>
        <input class="wb-input" id="wb-search" type="text" placeholder="搜索便签内容 / 昵称…">
        <button class="wb-search-clear" id="wb-search-clear" type="button" hidden><i class="anzhiyufont anzhiyu-icon-circle-xmark"></i></button>
      </div>
      <select class="wb-input wb-sort" id="wb-sort">
        <option value="new">最新在前</option>
        <option value="hot">共鸣最多</option>
      </select>
    </div>
    <div class="wb-filters" id="wb-filters">
      <button class="wb-filter active" data-f="all" type="button">全部</button>
      <button class="wb-filter" data-f="wish" type="button">心愿</button>
      <button class="wb-filter" data-f="hole" type="button">树洞</button>
      <button class="wb-filter" data-f="mine" type="button">我的</button>
    </div>
  </div>
  <div class="wb-wall" id="wb-wall"></div>
  <div class="wb-empty" id="wb-empty" hidden>
    <div class="wb-empty-note"><i class="anzhiyufont anzhiyu-icon-pencil"></i></div>
    <p>墙上还没有便签</p>
    <span>点击上方「写一张便签」，成为第一个留下痕迹的人</span>
  </div>
  <div class="wb-foot fp-card">
    <p><i class="anzhiyufont anzhiyu-icon-circle-check"></i> 便签内容仅代表访客本人；违规内容可联系站长删除，或使用下方入口直接清理。</p>
    <p><i class="anzhiyufont anzhiyu-icon-plant-fill"></i> 心愿便签支持三种状态：待实现 → 进行中 → 已实现，只有你自己能改自己的状态，也可以随时撤回自己的便签。</p>
    <p><button class="wb-admin-btn" id="wb-admin-btn" type="button"><i class="anzhiyufont anzhiyu-icon-gear"></i><span class="wb-admin-text">站长审核入口</span></button>
    <button class="wb-admin-btn" id="wb-export-btn" type="button" hidden><i class="anzhiyufont anzhiyu-icon-download"></i>导出便签备份</button></p>
  </div>
</div>

<script defer src="/js/page-wish.js?v=20260907d"></script>
