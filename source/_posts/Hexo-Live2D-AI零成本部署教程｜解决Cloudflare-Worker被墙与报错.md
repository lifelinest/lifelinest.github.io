---
title: Hexo Live2D AI零成本部署教程｜解决Cloudflare Worker被墙与报错
author: Lifeline
tags:
  - 技术踩坑
  - 开源项目
  - 人工智能
categories:
  - 技术探索
cover: /images/抽象网络数据流被半透明屏障阻断，线条中断，冷灰蓝色科技画面.webp
abbrlink: 2514c491
date: 2026-08-31 22:31:11
---
## 前言

![域名解析概念抽象图形，锁形几何图标缠绕网络链路，低饱和度蓝色.webp](/images/%E5%9F%9F%E5%90%8D%E8%A7%A3%E6%9E%90%E6%A6%82%E5%BF%B5%E6%8A%BD%E8%B1%A1%E5%9B%BE%E5%BD%A2%EF%BC%8C%E9%94%81%E5%BD%A2%E5%87%A0%E4%BD%95%E5%9B%BE%E6%A0%87%E7%BC%A0%E7%BB%95%E7%BD%91%E7%BB%9C%E9%93%BE%E8%B7%AF%EF%BC%8C%E4%BD%8E%E9%A5%B1%E5%92%8C%E5%BA%A6%E8%93%9D%E8%89%B2.webp)

&nbsp;&nbsp;&nbsp;&nbsp;很多搭建 [Hexo](https://hexo.io/zh-cn/) 博客的博主，都会为站点接入[Live2D 看板娘](https://github.com/stevenjoezhang/live2d-widget) 交互组件，并搭配 [DeepSeek 大模型](https://www.deepseek.com/) 实现智能对话功能。流式问答的效果，能够极大提升个人博客的趣味性与页面互动性，也是目前 Hexo 博客热门的进阶美化方案。

&nbsp;&nbsp;&nbsp;&nbsp;但多数博主在正式部署上线时，都会遇到两大棘手问题：国内云函数长期隐性扣费，而 [Cloudflare Worker](https://workers.cloudflare.com/) 默认域名在国内无法正常访问，导致 AI 功能部署成功却无法使用。

&nbsp;&nbsp;&nbsp;&nbsp;目前网上多数教程内容滞后、方案老旧，新手盲目跟风极易踩坑。常见问题包含：**workers\.dev 域名被墙、require 语法运行报错、DeepSeek API 401 密钥失效、免费域名申请审核被拒**等一系列部署难题。

&nbsp;&nbsp;&nbsp;&nbsp;本文基于真实落地实操经验，系统复盘 Hexo Live2D AI 部署全流程坑点，淘汰所有现已失效的老旧方案，分享一套**可直接复刻、全程零成本、国内稳定可用**的 Cloudflare Worker 部署解决方案。

## 一、Hexo AI部署两大主流方案优缺点解析

![悬浮的几何节点，网状互联线条，云原生无服务器抽象视觉，冷蓝色调.webp](/images/%E6%82%AC%E6%B5%AE%E7%9A%84%E5%87%A0%E4%BD%95%E8%8A%82%E7%82%B9%EF%BC%8C%E7%BD%91%E7%8A%B6%E4%BA%92%E8%81%94%E7%BA%BF%E6%9D%A1%EF%BC%8C%E4%BA%91%E5%8E%9F%E7%94%9F%E6%97%A0%E6%9C%8D%E5%8A%A1%E5%99%A8%E6%8A%BD%E8%B1%A1%E8%A7%86%E8%A7%89%EF%BC%8C%E5%86%B7%E8%93%9D%E8%89%B2%E8%B0%83.webp)

### 1\. 国内云函数（FC/SCF）隐性扣费问题

[阿里云 FC](https://www.aliyun.com/product/fc)、[腾讯云 SCF](https://cloud.tencent.com/product/scf) 是国内博主最容易上手的 AI 代理方案。

这类国内云平台虽然提供免费试用额度，但默认开启常驻实例保活策略，无法彻底关闭后台驻留进程。

即便个人博客访问量极低，云函数依旧会持续消耗资源计费。免费额度耗尽后自动生成账单，**无法实现真正****意义上的****永久零成本**，并不适合个人博客长期稳定运营。

### 2\. Cloudflare Worker 默认域名被墙原因

依托免费额度高、无需自建服务器、免维护的优势，Cloudflare Worker 是个人博客搭建轻量 AI 代理服务的最优载体。

但新手默认使用的`workers.dev` 域名，目前已被国内大范围屏蔽。

典型表现为：本地开发调试、境外网络访问完全正常，**国内****环境下**** Hexo 博客前端 Fetch 请求超时****，Live2D ****AI 对话****功能完全****无响应**。

该问题属于结构性网络拦截，无法通过刷新缓存、切换 CDN 节点、修改配置修复，**唯一根治方式是绑定自定义域名托管 Cloudflare**。

## 二、避坑指南：两类免费域名已彻底不适用于博客AI

![多组彩色几何方块，数据流在节点之间流转，域名解析抽象可视化.webp](/images/%E5%A4%9A%E7%BB%84%E5%BD%A9%E8%89%B2%E5%87%A0%E4%BD%95%E6%96%B9%E5%9D%97%EF%BC%8C%E6%95%B0%E6%8D%AE%E6%B5%81%E5%9C%A8%E8%8A%82%E7%82%B9%E4%B9%8B%E9%97%B4%E6%B5%81%E8%BD%AC%EF%BC%8C%E5%9F%9F%E5%90%8D%E8%A7%A3%E6%9E%90%E6%8A%BD%E8%B1%A1%E5%8F%AF%E8%A7%86%E5%8C%96.webp)

&nbsp;&nbsp;&nbsp;&nbsp;网上大量老旧教程推荐的免费开发者域名，现阶段平台规则已全面收紧，不再兼容 Hexo 博客、Live2D 展示类、AI 交互类项目。盲目申请只会浪费大量时间，最终无法落地。

### 1\. is\-a\.dev 域名（博客项目100%人工驳回）

[is\-a\.dev](https://is-a.dev/) 曾经是热度最高的免费开发者域名，支持 NS 托管。

但平台官方现已更新硬性规则：**禁止个人博客、展示型站点、AI 交互类项目使用 NS 托管解析权限**，仅对纯开源工具、程序开发类项目开放审核。

本人实测验证：配置文件格式、CI 自动化校验、PR 模板规范全部合规，机器审核顺利通过，但**人工维护者一律驳回合并请求**，属于平台规则层面硬性限制，无任何变通解决方案。

### 2\. DigitalPlat 二级域名（不可复用迁移）

[DigitalPlat](https://domain.digitalplat.org/) 平台单用户仅允许注册2个二级域名，且域名绑定业务后会**锁定NS权限**。

一旦域名已绑定线上业务，强行修改 NS 解析会直接导致原有服务瘫痪，风险极高，完全不适合用于 AI 代理服务迁移部署。

## 三、最终稳定方案：DNSHE免费域名 \+ Cloudflare Worker

![分层堆叠的透明几何板块，网络链路贯穿层级，柔和青蓝色科技光影.webp](/images/%E5%88%86%E5%B1%82%E5%A0%86%E5%8F%A0%E7%9A%84%E9%80%8F%E6%98%8E%E5%87%A0%E4%BD%95%E6%9D%BF%E5%9D%97%EF%BC%8C%E7%BD%91%E7%BB%9C%E9%93%BE%E8%B7%AF%E8%B4%AF%E7%A9%BF%E5%B1%82%E7%BA%A7%EF%BC%8C%E6%9F%94%E5%92%8C%E9%9D%92%E8%93%9D%E8%89%B2%E7%A7%91%E6%8A%80%E5%85%89%E5%BD%B1.webp)

&nbsp;&nbsp;&nbsp;&nbsp;经过多平台实测对比、反复踩坑验证，目前适配 **Hexo Live2D AI 代理****服务** 的最优零成本方案为：使用 [DNSHE](https://dnshe.com/) 免费子域名托管至 Cloudflare。

本次落地稳定后缀：`cc.cd`

### 方案核心优势

1\. 接入[PSL 公共域名列表](https://publicsuffix.org/)，完美兼容 Cloudflare 免费版

2\. 支持自定义修改 NS 解析服务器，无博客场景限制，规避审核驳回风险

3\. 国内 DNS 解析稳定可靠，彻底根治 workers\.dev 域名被墙问题

4\. 永久免费续用，无隐性扣费、无额度套路

### 标准化部署流程

1\. [Cloudflare 后台](https://dash.cloudflare.com/)新增站点，获取专属 NS 服务器地址

2\. DNSHE 后台替换域名 NS，绑定 Cloudflare 节点

3\. 等待站点状态变为 Active，完成解析生效

4\. 添加 AI 子域名 CNAME 记录，开启 CDN 代理

5\. 部署 Cloudflare Worker 专属 AI 代理代码

6\. 绑定自定义域名，修改 Hexo 前端接口地址并重新部署

## 四、Hexo AI部署高频报错解决方案（精准根治）

![抽象云服务器几何体，悬浮粒子，暗色调隐喻资源消耗，极简科技构图.webp](/images/%E6%8A%BD%E8%B1%A1%E4%BA%91%E6%9C%8D%E5%8A%A1%E5%99%A8%E5%87%A0%E4%BD%95%E4%BD%93%EF%BC%8C%E6%82%AC%E6%B5%AE%E7%B2%92%E5%AD%90%EF%BC%8C%E6%9A%97%E8%89%B2%E8%B0%83%E9%9A%90%E5%96%BB%E8%B5%84%E6%BA%90%E6%B6%88%E8%80%97%EF%BC%8C%E6%9E%81%E7%AE%80%E7%A7%91%E6%8A%80%E6%9E%84%E5%9B%BE.webp)


&nbsp;&nbsp;&nbsp;&nbsp;本节汇总 Hexo \+ Cloudflare Worker 部署场景下，博主最高频遇到的三类报错，结合实战给出可直接落地的精准根治方案。

### 1\. require is not defined 报错解决

**报错原因**：新手极易混用适配阿里云 FC、腾讯云 SCF 的 Node\.js 服务端代码。

Cloudflare Worker 基于标准 Web 运行环境运行，**不支持 Node****\.js**** 原生模块与 require 语法**，直接粘贴云函数代码会直接运行报错。

**解决方法**：清空原有 Node 冗余代码，替换为 Worker 专属 `export default fetch` 标准写法，完美适配平台运行机制。

### 2\. Cloudflare Worker API 401 密钥无效

**问题现象**：修改 DeepSeek 密钥后，接口依然 401，持续读取旧密钥。

**根本原因**：Cloudflare Pages 与 Worker 项目配置混淆、环境变量存在缓存延迟、自定义令牌权限范围不足，导致密钥更新不生效。

**稳定方案**：生产环境放弃环境变量配置，采用服务端代码内置有效密钥，彻底规避缓存延迟与配置错乱问题。

### 3\. Hexo更新后AI功能自动失效

**问题原因**：[GitHub Pages](https://pages.github.com/) 自动构建会覆盖手动部署的 Worker 代码。

**解决方案**：将 Worker AI 代理代码与 Hexo 博客源码物理隔离，不纳入博客构建编译目录，避免自动部署覆盖服务配置。

## 五、方案落地最终效果

![抽象代码模块几何体之间连接断裂，微弱橙色警告光晕，无任何字符.webp](/images/%E6%8A%BD%E8%B1%A1%E4%BB%A3%E7%A0%81%E6%A8%A1%E5%9D%97%E5%87%A0%E4%BD%95%E4%BD%93%E4%B9%8B%E9%97%B4%E8%BF%9E%E6%8E%A5%E6%96%AD%E8%A3%82%EF%BC%8C%E5%BE%AE%E5%BC%B1%E6%A9%99%E8%89%B2%E8%AD%A6%E5%91%8A%E5%85%89%E6%99%95%EF%BC%8C%E6%97%A0%E4%BB%BB%E4%BD%95%E5%AD%97%E7%AC%A6.webp)


&nbsp;&nbsp;&nbsp;&nbsp;采用本文标准化方案部署后，可完美解决 Hexo Live2D AI 部署所有痛点，最终落地效果如下：

1\. 彻底解决 workers\.dev 国内被墙，实现国内全网正常访问

2\. 完全下线国内云函数，**真正零成本永久运行**

3\. DeepSeek 流式对话响应稳定，体验媲美付费服务

4\. 服务端托管密钥，杜绝前端密钥泄露风险

5\. 自定义域名长期稳定，无需频繁维护续期

## 六、总结与长期维护建议

![抽象数字表单几何图形，红色柔和警示光晕，简约科技抽象表达审核拒绝.webp](/images/%E6%8A%BD%E8%B1%A1%E6%95%B0%E5%AD%97%E8%A1%A8%E5%8D%95%E5%87%A0%E4%BD%95%E5%9B%BE%E5%BD%A2%EF%BC%8C%E7%BA%A2%E8%89%B2%E6%9F%94%E5%92%8C%E8%AD%A6%E7%A4%BA%E5%85%89%E6%99%95%EF%BC%8C%E7%AE%80%E7%BA%A6%E7%A7%91%E6%8A%80%E6%8A%BD%E8%B1%A1%E8%A1%A8%E8%BE%BE%E5%AE%A1%E6%A0%B8%E6%8B%92%E7%BB%9D.webp)


&nbsp;&nbsp;&nbsp;&nbsp;Hexo 博客 Live2D AI 部署的核心难点，不在于代码编写，而在于甄别失效方案、规避平台规则限制与各类环境报错。

&nbsp;&nbsp;&nbsp;&nbsp;弃用被墙的 workers\.dev 默认域名、淘汰审核严格的老旧免费域名、规避国内云函数隐性扣费，是实现 AI 服务零成本、长期稳定运行的三大核心关键。

&nbsp;&nbsp;&nbsp;&nbsp;长期维护层面，建议定期轮换 API 密钥提升接口安全性，同时备用 [eu\.org](https://nic.eu.org/) 域名作为兜底方案，最大程度保障 Live2D AI 服务全年稳定在线。

