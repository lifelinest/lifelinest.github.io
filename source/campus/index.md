---
title: 大学技能树
date: 2026-09-06 12:30:00
aside: false
comments: false
top_img: false
---

<link rel="stylesheet" href="/css/feature-pages.css?v=20260907e">
<div class="fp-page" id="page-campus">
  <div class="fp-hero fp-card">
    <div class="fp-hero-icon"><i class="anzhiyufont anzhiyu-icon-fire"></i></div>
    <div>
      <h2 class="fp-hero-title">大学技能树</h2>
      <p class="fp-hero-sub">新乡职业技术学院 · 大数据技术 · 2021 — 2024</p>
    </div>
    <div class="fp-hero-extra">
      <span class="fp-badge gold"><i class="anzhiyufont anzhiyu-icon-circle-check"></i>已毕业</span>
      <span class="fp-badge"><i class="anzhiyufont anzhiyu-icon-plant-fill"></i>技能树继续生长</span>
    </div>
  </div>
  <div class="fp-card tl-card">
    <div class="fp-section-title" style="margin-top:0">大学时光线 <span class="fp-section-tip">2021 — 现在</span></div>
    <div class="tl-track">
      <div class="tl-node"><span class="tl-dot tl-done"></span><b>2021.09</b><span>入学 · 大数据技术专业</span></div>
      <div class="tl-node"><span class="tl-dot tl-done"></span><b>2023</b><span>在校期间搭建个人博客</span></div>
      <div class="tl-node"><span class="tl-dot tl-done"></span><b>2023.11</b><span>首篇文章发布，开荒者上路</span></div>
      <div class="tl-node"><span class="tl-dot tl-done"></span><b>2024.06</b><span>毕业，交出第一份答卷</span></div>
      <div class="tl-node"><span class="tl-dot tl-doing"></span><b>现在</b><span>持续自学 · 技能树继续生长</span></div>
    </div>
  </div>
  <div class="tree-progress fp-card" style="margin-top:16px">
    <b style="font-size:0.92em">点亮进度</b>
    <div class="tree-progress-bar"><div class="tree-progress-inner" id="tree-progress-bar" style="width:0"></div></div>
    <span class="fp-hint" id="tree-progress-text">…</span>
    <div class="fp-row" id="tree-chips" style="width:100%"></div>
    <div class="fp-row" style="width:100%">
      <button class="fp-btn primary" id="replay-btn"><i class="anzhiyufont anzhiyu-icon-play"></i>回放成长</button>
      <span class="fp-hint" id="replay-status"></span>
    </div>
    <div class="fp-hint skill-summary" id="skill-summary" style="width:100%"></div>
  </div>
  <div class="fp-section-title">技能树 <span class="fp-section-tip">点击节点查看说明 · 三种状态</span></div>
  <div class="tree-grid" id="tree-grid"><!-- 由 page-campus.js 根据数据渲染 --></div>
  <div class="fp-card goals-card" style="margin-top:16px">
    <div class="fp-section-title" style="margin-top:0">阶段目标 <span class="fp-section-tip">勾选记录保存在本机</span><span class="ach-counter" id="goal-counter" style="margin-left:auto"></span></div>
    <div id="goal-list"></div>
    <div class="ach-progress" style="margin-top:12px"><div class="ach-progress-inner" id="goal-bar" style="width:0"></div></div>
  </div>
  <div class="fp-card" style="margin-top:16px;text-align:center">
    <p style="margin:0;font-size:0.95em;color:var(--anzhiyu-secondtext)">
      「真正的大师永远怀着一颗学徒的心」—— 毕业 不是终点，是下一棵树的种子。
    </p>
  </div>
</div>
<div class="tree-modal" id="tree-modal">
  <div class="tree-modal-mask"></div>
  <div class="tree-modal-card fp-card" id="tree-modal-card"></div>
</div>
<script src="/js/page-campus.js?v=20260907g"></script>
