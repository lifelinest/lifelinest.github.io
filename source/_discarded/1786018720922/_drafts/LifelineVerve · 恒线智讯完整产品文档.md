---
title: LifelineVerve · 恒线智讯完整产品文档
author: Lifeline
abbrlink: 2d1759ed
date: 2026-08-06 20:07:45
tags:
---
# RuiCheng Advisor（LifelineVerve·恒线智讯）

![11-frontend-desktop-open.png](/images/11-frontend-desktop-open.png)

> 本文档整合了四部分内容，便于一站式查阅：
> 
> - **一、产品介绍**（是什么、能做什么、实现细节）
> - **二、产品规划与优化路径**（完美版蓝图 / 付费空间 / 近中远期路线 / 竞品差异化 / 当前不足）
> - **三、开发心路历程**（背景动机 / 架构选型 / 核心实现 / 踩坑复盘 / 版本变更）
> - **四、使用者手册**（安装 / 配置参数 / 操作流程 / FAQ 排障）

> 本文由「产品介绍」与「产品规划与优化路径」两部分整合而成，覆盖产品定位、核心能力、完美版功能蓝图、商业化设计与近 / 中 / 远期迭代路线图。

---

## 一、产品介绍

![01-login.png](/images/01-login.png)

> 恒线智讯（LifelineVerve），构筑网站永不离线的沟通生命线。Verve 寓意永续活力，代表一条永不休眠的沟通生命线。适配 WordPress 生态，7×24 小时 AI 全天候值守接待访客，智能应答咨询、归集访客需求，打通咨询流转链路，让沟通通道持续在线，不错过每一次对话机遇。

### 品牌故事与定位

LifelineVerve（中文名"恒线智讯"）是一个面向 WordPress 站点的**嵌入式 AI 对话获客插件**。它把"网站"从一块被动的展示牌，变成一个有温度、永不离线的 AI 接待前台——访客随时提问，AI 即时应答、理解需求、并把有价值的咨询沉淀为可跟进的销售线索。

我们相信：每一次网站访问都是一次潜在的对话机会，而大多数站点在访客最想问问题的深夜、周末、节假日却"无人值守"。恒线智讯要做的，就是让这条沟通生命线**恒定在线（Lifeline）且充满活力（Verve）**。

### 一句话定位

LifelineVerve（恒线智讯）是一个嵌入式 AI 对话获客插件：把你的 WordPress 网站变成 7×24 小时在线的 AI 接待前台，用大语言模型实时应答访客、把咨询转化为结构化线索。

### 它解决什么（核心痛点）

- **访客咨询没人及时回** → AI 全天候值守，秒级应答，不再错过深夜询盘。
- **线索散落在聊天记录里** → 自动归集、评分、推送邮件 / Webhook，销售第一时间收到。
- **客服答非所问** → 知识库让 AI 基于你的业务资料作答，而非凭空编造。
- **主模型故障对话中断** → 自动失败转移到备用 Provider，对话不中断。
- **监管合规压力** → 内置数据合规模块，可按邮箱 / 会话 / 线索擦除个人数据。

### 主要功能详解

#### 1. 智能对话引擎

- **多模型兼容**：可接入 OpenAI / Azure OpenAI / 国内大模型网关（DeepSeek、火山方舟 ARK 等）/ 本地 Ollama，API Key 由你自己填写（BYOK），数据与成本都掌握在自己手里。
- **失败转移与降级话术**：当主 Provider 不可用，自动切换到备用 Provider；若全部故障，给出友好的兜底提示而非白屏报错，保障对话连续性。
- **多轮上下文**：保持对话连贯，能理解追问与指代（如"它多少钱"中的"它"指向前文）。
- **图文理解**：支持视觉模型，可处理用户发送的图片。

**实现细节**

- 调用协议为 OpenAI 兼容的 Chat Completions；前端经 `POST ruicheng/v1/chat` 以 SSE 流式转发（`text/event-stream`，逐块 emit 实现打字机），请求需带 `proxy_token` 鉴权。
- 失败转移仅在「主文本通道无内容且报错」时触发；开关 `failover_on=on` 且备用模型三件套（endpoint/key/model）齐全才武装。
- 含图消息由 `ruicheng_advisor_has_image()` 检测后自动切到 vision 通道（可开 `vision_same_key` 复用文本 Key）。
- 落库：每次对话写 `wp_rc_conversations`（按 `session_id` 聚合）+ `wp_rc_conv_meta`（评分 / 国家 / 建议等元数据）；访客 IP 限流 30/60s（transient 信号量），流式并发上限 `max_stream_concurrency`（默认 16）。
- 配置入口：后台「服务商 / 提示词」页（文本模型、备用模型、生成参数、失败转移）。

#### 2. 知识库驱动（RAG-lite）

- **多格式 ingestion**：上传 PDF / Word / 纯文本，AI 基于你的业务资料作答。
- **关键词检索（BM25）**：在当前版本中以 BM25 关键词匹配从知识库中召回相关内容，喂给大模型生成答案，显著降低凭空编造的幻觉。
- **业务专属话术**：售前问答、产品参数、退换货政策等都可以沉淀进知识库，让 AI 成为"懂你业务"的接待员。

**实现细节**

- 检索算法为 **BM25-lite（k1=1.5, b=0.75）**，非向量检索；中文走二元组（bigram）分词，拉丁走 `[a-z0-9]{2,}` 小写分词。**无 embedding / 向量库依赖**，轻量可落地。
- 两种模式：`kb_mode=full` 把启用文件全量拼接注入（上限 `kb_max_chars` 12000 字符）；`kb_mode=retrieval` 按访客问题召回 top-K（`kb_retrieve_k` 默认 4，分块 ≤480 字符），无命中自动回退全量。
- 文本抽取：Office 用 ZipArchive；PDF 优先 `pdftotext` 否则纯 PHP 解析；支持 txt/md/csv/json/html/xml/pdf/docx/pptx/xlsx 等（旧版 doc/ppt/xls 不支持提取）。
- 可开 `kb_cite` 要求模型用 `[[来源: 文件名]]` 标注依据；文件名 / 分类命中额外加分。
- 存储：文件存于 Web 根外私有目录 `rc-kb-private`，仅经鉴权 REST 读取。配置入口：后台「知识库」页。

#### 3. 线索归集与评分

- **意图识别 + 联系方式抽取**：从自由对话中识别访客意向，并自动抽取邮箱、电话、微信等联系方式。
- **结构化线索**：把零散对话转成一条条带字段的线索记录，便于销售跟进。
- **防垃圾评分**：对低质量 / 灌水对话打分过滤，减少无效提醒。
- **即时通知**：通过邮件和 Webhook 把新线索推送到你指定的地址或自有系统。

**实现细节**

- 数据模型：线索落 `wp_rc_leads`（含 `ai_score`/`ai_label`/`email_status`），会话落 `wp_rc_conversations`，会话级元数据落 `wp_rc_conv_meta`。
- AI 评分：`ruicheng_advisor_analyze_lead()` 调 LLM 产出 `score`(0–100) / `label`（5 类：真实采购意向 / 比价 / 竞争对手 / 机器人垃圾 / 信息不足）/ `reason` / `suggestion`，结果同步写入 `rc_conv_meta`。
- 发信门控：仅当 `score ≥ lead_email_threshold`（默认 40）且标签非"机器人/垃圾"才发邮件 + Webhook；`email_status` 状态机 pending/sent/skipped/failed，失败由 hourly cron 重试最多 3 次。
- 防垃圾：一次性邮箱域名库（\x7e100 个）、键盘乱敲检测（如 `asdfg`/`aaa`）、零件描述最短字符校验、蜜罐隐藏域。
- 工程附件：白名单（step/stp/iges/dwg/dxf/sldprt… + pdf/图片/zip/txt），随机 16 字节文件名，落私有目录 `rc-leads-private`。配置入口：后台「线索通知」页（阈值、Webhook、触发关键词、AI 分析）+「外观与触发」页（表单文案 `lead_*_zh`）。

#### 4. 多语种自动适配（auto-i18n）

- **按访问者地理自动判定默认语种**，让不同国家访客看到母语界面与回复。
- **中文单源 → 多语种**：你只需维护一套中文知识库与文案，系统面向其他语种访客自动翻译呈现（品牌名等专有名词通常保留原文）。

**实现细节**

- 语种判定**三级回落**：① CDN / 反代国家头（如 `HTTP_CF_IPCOUNTRY`）→ ② 真实 IP → GeoIP（本地 MaxMind mmdb 优先，否则外部 ipinfo.io，按 IP 缓存 12h / 失败 1h）→ ③ 浏览器 `Accept-Language`；均未命中则前端回落内置 `en`/`zh`。
- **中文单源**：`zh` 是唯一人工维护源；保存配置时（`update_option_ruicheng_advisor_opts` 钩子）复用已配 LLM 批量译为 en/ja/ko/de/fr/es/pt/it/ru 并缓存到 `rc_adv_i18n`，仅变更文案才重译（md5 比对），失败保留旧译文不阻断保存。
- 文案取值优先级：`rc_adv_i18n[lang]`（已翻译）> 中文单源 `$o[key_zh]` > 内置兜底，注入 `window.LIFELINE_TEXTS` 供前端 `T()` 取词。品牌名（如 RUICHENG）等专有名词通常不翻译。
- 配置入口：文案在「外观与触发」页的 `*_zh` 字段；`geo_lang` 开关控制是否按 IP 选语。

#### 5. 外观与触发定制

- **视觉自定义**：气泡颜色、位置（左下 / 右下）、头像、欢迎语、问候语均可后台配置，与你的品牌风格一致。
- **三种触发方式**：① 自动嵌入全站；② 仅指定页面（白名单）；③ 排除指定页面（黑名单）；也可通过短代码 `[ruicheng_advisor]` 在任意页面手动放置。
- **任意主题兼容**：挂件通过 portal 机制注入 `<body>`，避免被主题外层容器的定位 / 溢出影响，最大限度兼容各类 WordPress 主题与页面构建器。

**实现细节**

- 配置落地：所有外观值经 `sanitize_merge()` 净化（如 `accent_color` 规范化为 `#`+3/6 位十六进制并展开 6 位）；后台左侧配置、右侧 `#rc_live_preview` 实时预览，与前端挂件共用同一套 CSS 变量，确保"后台所见即前端所得"。
- 触发闸门（最常踩坑点）：`wp_footer` 钩子输出挂件，受 `auto_embed`（总开关）+ `page_visibility`(all/include/exclude) + `page_list`（受控页 ID）控制；**`page_visibility=include` 且 `page_list` 为空 = 首页永不显示**。`auto_embed=off` 时改用短代码 `[ruicheng_advisor]` 指定页面嵌入。
- FAB / portal 渲染：挂件样式与标记从 `widget.html` 抽取，经 `rcPortalToBody()` 注入 `document.body`，兼容任意主题（根治"真机看不到按钮"）。
- 配置入口：后台「外观与触发」页（颜色 / 布局 / 排版 / 文案 / 触发方式）。

#### 6. 通知与告警

- **邮件通知**：新线索、关键事件实时邮件提醒。
- **Webhook 对接**：把事件推送到你的自有系统（如飞书、企业微信、CRM），打通内部流转。

**实现细节**

- 渠道：邮件（`lead_email`，保存时实时校验 MX 解析与 WP Mail SMTP 发件人域名一致性，防仿冒 / 退信）+ Webhook（`lead_webhook`，JSON POST）。
- 触发弹窗：命中 `trigger_keywords`（fuzzy=包含 / exact=整句相等）的聊天消息后，延迟 `lead_form_delay` 秒弹报价表单；纯文件上传不再自动弹窗。
- 限流：`rate_chat` / `rate_lead` 为"请求 / 分钟 / IP"；"发送测试邮件"按钮验证链路；邮件送达状态 `email_status` 可观测、失败自动重试。
- 配置入口：后台「线索通知」页（4 个 Tab：通知渠道 / 限流与上传 / 触发弹窗 / AI 自动分析）。

#### 7. 会话与线索后台

- **会话记录**：后台可查询历史对话，了解访客都问了什么。
- **线索列表**：结构化线索一览，支持筛选与跟进状态管理。

**实现细节**

- 数据：会话 `wp_rc_conversations` + 元数据 `wp_rc_conv_meta` + 线索 `wp_rc_leads` 三者关联（按 session_id / lead_id）。
- 后台能力：列表筛选（status / label / 关键词 / 国家 / 是否有线索 / 是否有附件 / 标签 / 已读 / 天数）、会话详情、打标签、已读标记、批量操作、CSV 导出（UTF-8 BOM + 单元格前置 `'` 防公式注入）、关联线索查看。
- 批量删除走事务：删会话行 + 匿名化关联线索（`ruicheng_advisor_anonymize_lead`）+ 清 meta，任一失败整体 ROLLBACK。
- 配置入口：后台「会话」页、「线索」页（列表筛选 / 详情 / 改状态 / 重分析 / 重发邮件 / 导出 CSV）。

#### 8. 数据合规（compliance）

- **契合 GDPR / 个保法**：提供个人数据擦除能力，可按邮箱、会话或线索维度删除相关数据，应对"被遗忘权"等合规要求。
- **数据自有**：对话落你自己的 MySQL（`wp_ruicheng_*` 表），不上传到第三方 SaaS。

**实现细节**

- 擦除：`ruicheng_advisor_compliance_erase()` 支持按 email / session / lead_id 批量**删除或匿名化**（mode=delete/anonymize）。
- 删除：清 `rc_leads` + 关联 `rc_conversations`，并 `unlink` 私有目录附件；匿名化：邮箱改 `anon-<md5>`、姓名改"已匿名"、清空 part/attachment/source/utm 等 PII 字段、会话内容标 `[已匿名]`。
- 审计：`rc_adv_erasure_log` 保留最近 50 条（ts / mode / summary / admin），面向 GDPR / 个保法取证。REST：`POST ruicheng/v1/compliance/erase`、`GET /log`。
- 配置入口：后台「会话」页的"数据合规擦除·按邮箱"区。

#### 9. 成本与可观测（budget / diagnostics）

- **配置完成度**：引导式检查，避免漏填关键项。
- **运行健康卡**：直观展示插件运行状态。
- **近 7 天请求趋势**：用量一目了然。
- **用量与成本记录**：按模型 / 页面记录调用量与花费，为后续成本优化提供依据。

**实现细节**

- 成本计算：每次模型调用经 `diagnostics::record_usage()` → `do_action('ruicheng_advisor_usage_recorded', $model, $cost, $endpoint)`，budget 监听后按 scope（all/deepseek/openai/moonshot/ark/ollama）归集；成本 = tokens × 单价（`model_price()` 按模型名前缀匹配，未命中回落 `default_price_input/output` 默认 1.0 / 2.0 USD 每百万 token）。
- 预算告警：规则可按 scope + 周期（月 / 季 / 年）+ 阈值（50/80/100%）配置；跨阈值触发邮件，去重 key=`$id|$periodKey`，同等级每周期仅一次。
- 自愈：历史 bug 曾把默认单价清零导致成本恒 0、预算永不生效，已加 `ruicheng_advisor_budget_heal_zero_pricing()` 一次性自愈（仅当"单价双零 + 有零成本用量 + 有启用规则"才回填出厂默认）。
- 可观测：配置完成度（文本 70% + 视觉 15% + 备用 15%）、运行健康卡（total/ok/fail、错误分类 auth/model/network/quota/server/other）、近 7 天请求趋势、用量按月聚合（保留 12 个月）。
- 配置入口：后台「服务商 / 提示词」页内的"成本预算"与"运行健康"标签页。

### 技术架构亮点

- **引导文件只做常量定义与模块加载**；业务逻辑拆到 `features/`（15 个功能模块），钩子与 REST 路由集中在 `includes/loader.php`，结构清晰、易维护。
- **统一设计系统（DESIGN.md）** 贯穿 9 个后台页与前端挂件，体验一致。
- **数据安全双保险**：业务数据落 MySQL；敏感上传文件存于 Web 根外私有目录（随机文件名，不可猜测），避免被直接下载。
- **BYOK 模式**：API Key 由站点主自己配置，对话与成本数据均不出域。

### 适用场景与典型用户

- **外贸 / 出海企业**：多语种接待全球访客，把询盘沉淀为线索。
- **制造 / 工业企业**：用知识库承载产品参数、规格、交期等复杂信息，让 AI 准确应答专业咨询。
- **SaaS / 工具类产品**：7×24 解答功能与使用问题，降低客服压力。
- **咨询 / 服务类团队**：归集潜在客户意向，及时转交销售跟进。
- **任何需要把"网站访客"稳定转化为"销售线索"的团队**。

### 快速上手（5 步）

1. **安装激活**：上传插件并在 WordPress 后台启用。
2. **填模型 Key**：在"服务商"中配置你的 API Key 与默认模型（BYOK）。
3. **建知识库**：上传产品 / 服务资料（PDF、Word、文本），让 AI 懂你的业务。
4. **定外观**：在"外观与触发"中设置气泡颜色、位置、欢迎语，并开启"自动嵌入 + 全站显示"。
5. **开通知**：配置邮件 / Webhook，新线索自动推送，开始接待。

### 为什么选择 LifelineVerve（差异化速览）

在众多客服机器人 / AI 插件中，恒线智讯的差异化在于：**WordPress 原生 + 数据自有（BYOK）+ 出海多语种 + 行业纵深 + 合规导向** 这一组合——你不必把客户数据交给按席位收费的第三方 SaaS，也能拥有一个永不离线的 AI 接待前台。关于竞品格局、当前不足与完整迭代路线，详见本文第二部分。

---

## 二、产品规划与优化路径

![04-kb.png](/images/04-kb.png)

> 基于 v1.0.19 源码架构（15 个 features 模块 + loader 钩子体系）与线上排障经验整理。
> 本文回答三件事：① 完美版应具备的功能；② 若做部分功能付费，提升空间在哪；③ 近 / 中 / 远期优化路线图。

---

### 一、完美版本功能蓝图

按"价值支柱"组织，每个支柱给出终极态。

#### 1. 对话智能（核心）

- **流式输出**（打字机），首字延迟 < 800ms
- **多模型智能路由**：常规问答走快模型（如 DeepSeek-V3），复杂 / 推理走强模型，成本与体验自动平衡
- **失败转移 + 降级话术**（provider 全挂时给友好兜底，不报错白屏）
- **上下文记忆与多轮连贯**（跨会话摘要、用户画像沉淀）
- **工具调用（function calling）**：查订单 / 库存 / 工单 / 预约，从"问答"到"办事"
- **主动建议**（基于浏览行为推荐知识点）

#### 2. 知识资产（RAG）

- **向量检索**（embedding + 向量库），语义匹配替代纯 BM25 关键词
- **多格式 ingestion**：PDF / Word / 网页 / FAQ / 数据库表
- **答案引用溯源**（"据《退货政策》第 3 条"），降低幻觉
- **自动知识库体检**：识别过期 / 冲突 / 低覆盖知识点，主动提醒补充
- **行业知识包**（制造业 / 外贸 / 电商模板），一键导入

#### 3. 获客与转化（leads）

- **富表单线索捕获**（带字段校验、防重复、防垃圾评分）
- **线索自动评分**（按意图强度、停留、来源）与分层
- **对话 → CRM 无缝同步**（Salesforce / HubSpot / 飞书 / 企业微信）
- **转人工 handoff**：高意向或复杂问题一键移交真人，上下文不丢
- **弃单挽回**：识别放弃行为自动触发挽留话术 / 优惠券

#### 4. 多语种全球化（auto-i18n）

- **多信号语种判定**：IP + Accept-Language + 用户手动切换（持久化）
- **中文单源 → 多语种高质量翻译**（可接专业翻译 API 或人工校订缓存）
- **RTL 支持**（阿拉伯语等）、本地化日期 / 货币 / 单位
- 各语种独立知识库与话术

#### 5. 安全与合规（compliance）

- **API Key 加密存储**（openssl + 站点盐），消除明文泄露
- **数据保留策略**（按 PIPL / GDPR 自动过期、导出、擦除）
- **完整审计日志**（谁在什么时间看了 / 删了什么对话）
- **速率限制与防滥用**（防刷对话消耗）
- **私有化 / 自托管大模型**选项（数据不出域）

#### 6. 数据洞察（diagnostics / budget）

- **成本实时看板**（按模型 / 页面 / 语种拆分）
- **对话质量分析**（解决率、转人工率、满意度 CSAT）
- **转化漏斗**（展示 → 开口 → 留资 → 成交）
- **异常告警**（成本突增、失败率升高自动通知）

#### 7. 渠道与集成

- **全渠道收口**：网站挂件 + WhatsApp + 微信 + Telegram + 邮件，统一会话台
- **Webhook / 开放 API**，便于对接自有系统
- 与主流 WP 主题 / 页面构建器（Elementor 等）**原生兼容，零配置**

#### 8. 体验与性能（widget / appearance）

- **触发方式容错**（白名单空 → 全站、管理员提示条）
- **任意主题零冲突**（portal 注入 body，已做；根治 FAB 动画稳定）
- **无障碍（a11y）**：键盘可达、屏幕阅读器友好、对比度达标
- **弱网 / 离线兜底**话术

---

### 二、付费功能的提升空间（商业化设计）

#### 现状判断

当前插件**没有任何授权 / 分层机制**，全部功能免费开放。从"工具"走向"可收费产品"，提升空间主要在三处：

1. **加授权系统**——目前无 license 校验，这是变现的前提基建。
2. **定义价值分层**——把"锦上添花 / 省大钱"的能力收到付费层，基础能力免费留住用户。
3. **用量计费基建**——budget 模块已在记录成本，可改造为"免费额度 + 超额付费"的计量闸门。

#### 推荐分层（Free / Pro / Business / Enterprise）

| 层级       | 价格锚点    | 包含                                                                     | 付费点设计                         |
| ---------- | ----------- | ------------------------------------------------------------------------ | ---------------------------------- |
| Free       | ¥0         | 单模型、基础挂件、1 种语种、月度额度（如 500 条）、"由 XXX 提供支持"品牌 | 引流，培养使用习惯                 |
| Pro        | 约 ¥99/月  | 多模型路由 + 流式、去品牌、多语种、线索捕获、基础分析                    | 去品牌 + 多语种 + 流式是强付费动机 |
| Business   | 约 ¥399/月 | 向量 RAG、CRM 集成、转人工、全渠道、转化漏斗                             | 直接关联"多成交"ROI                |
| Enterprise | 定制        | 私有化模型、SSO、合规审计、SLA、白标                                     | 安全合规 + 白标                    |

#### 最值得做成付费的"提升点"（高意愿付费）

- **去品牌 / 白标**：几乎所有 B 端都愿意为"不带别人 logo"付费。
- **多语种全球化**：外贸 / 出海客户为覆盖多国市场付费意愿强（插件已有 auto-i18n 基础，改造快）。
- **线索 → CRM → 成交闭环**：能证明"多赚的钱 > 订阅费"的功能最好卖。
- **向量 RAG + 引用溯源**：知识型业务（法律 / 医疗 / 制造文档）愿为"答得准"付费。
- **全渠道**：已在用 WhatsApp 的客户，统一收口省人力。
- **行业知识包**：做成可订阅的"制造业外贸包 / 电商包"，持续收费（SaaS 化）。

#### 变现外的"提升空间"（产品力本身）

- 把 budget 成本看板做成**客户能看懂的省钱报告**（"本月为您节省 X 小时客服"），强化续费理由。
- 增加 **A/B 问候语测试**、**节日文案模板**，提升开口率——开口率上去，付费转化才上去。
- 开放**提示词市场 / 模板市场**，UGC 生态，形成壁垒。

---

### 三、近 / 中 / 远期优化路径

![02-provider.png](/images/02-provider.png)

#### 近期（1–2 个月）· 稳根基 + 埋变现基建

目标：止血已知缺陷，并搭好"能收费"的地基。

| 序号 | 事项             | 类型       | 说明                                                                           |
| ---- | ---------------- | ---------- | ------------------------------------------------------------------------------ |
| R1   | 安全加固         | 缺陷       | 加密存储 API Key；清除 RC_ADV_OPT 影子选项（明文 Key）                         |
| R2   | 配置容错         | 体验       | 触发方式白名单空 → 全站；管理员黄条提示，根治"真机看不到挂件"                 |
| R3   | 已知缺陷修复     | 缺陷       | 跨页保存丢失、单价清零、FAB 动画稳定、邮件退信                                 |
| R4   | License 授权框架 | 商业化基建 | 引入 license 校验 + 层级开关（Free/Pro/Business/Enterprise），不改功能先搭骨架 |
| R5   | 用量计量闸门     | 商业化基建 | 把 budget 模块改为"免费额度 + 超额提示"，为付费铺路                            |
| R6   | 去品牌开关       | 付费功能   | Pro 及以上可隐藏"由 XXX 提供支持"                                              |

#### 中期（3–6 个月）· 强能力 + 拉开付费差

目标：做出只有付费才有的"硬价值"。

| 序号 | 事项                                                 | 类型        | 说明                        |
| ---- | ---------------------------------------------------- | ----------- | --------------------------- |
| M1   | 流式输出 + 多模型路由                                | 能力        | 体验质变，定为 Pro 权益     |
| M2   | 向量 RAG + 引用溯源                                  | 能力 / 付费 | Business 核心卖点           |
| M3   | 多语种增强（Accept-Language + 手动切换持久化 + RTL） | 能力 / 付费 | 出海客户强付费点            |
| M4   | 线索 → CRM 集成 + 转人工 handoff                    | 能力 / 付费 | 直接关联 ROI，Business 权益 |
| M5   | 成本 / 转化看板 v1                                   | 能力        | 让客户"看见价值"，促续费    |
| M6   | 行业知识包（制造业 / 外贸 / 电商）                   | 商业化      | 可订阅 SaaS 包，持续收入    |

#### 远期（6 个月+）· 拓边界 + 生态

目标：从"插件"升级为"平台"。

| 序号 | 事项                                                   | 类型        | 说明                   |
| ---- | ------------------------------------------------------ | ----------- | ---------------------- |
| L1   | 全渠道收口（网站 + WhatsApp + 微信 + Telegram 统一台） | 能力 / 付费 | Enterprise / Business  |
| L2   | 工具调用（查订单 / 库存 / 工单）                       | 能力        | 从问答到办事           |
| L3   | 私有化 / 自托管大模型                                  | 能力 / 付费 | 数据不出域，Enterprise |
| L4   | 提示词 / 模板市场（UGC 生态）                          | 商业化      | 形成壁垒               |
| L5   | 数据驱动：质量分析、ROI 追踪、异常告警                 | 能力        | 决策支持               |
| L6   | SSO / 合规审计 / 白标                                  | 能力 / 付费 | Enterprise 标配        |

---

### 四、竞品格局与差异化机会

![06-notify.png](/images/06-notify.png)

#### 4.1 竞争格局速写

| 类别                 | 代表产品                                               | 与 RuiCheng 的关系                                                         |
| -------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| 海外 SaaS 客服机器人 | Tidio、Intercom / Fin、Drift、Crisp、LiveChat、Tawk.to | 强在 AI / 营销，但**数据在厂商云、按席位/对话收费贵、WP 仅为嵌入脚本**     |
| WP 原生 AI 插件      | AI Engine（Meow）、WPAIChat、各类 GPT 封装             | 偏**开发者 / 内容生成**，聊天机器人只是其中一块，少有"出海 + 获客闭环"定位 |
| 国内客服 SaaS        | 网易七鱼、美洽、智齿、腾讯企点、百度爱番番             | 强在**微信 / 企微 / 抖音渠道**，但和 WordPress 站点集成弱、贵、数据不出厂  |
| 自建 / 开源          | Rasa、Botpress、Dialogflow                             | 工程重、需运维，不适合中小 WP 站长                                         |

#### 4.2 RuiCheng 的差异化定位（机会点）

1. **WP 原生 + BYOK + 数据自有**：API Key 自己填、对话落自己库、成本自己控（budget 模块）。对"不想把客户数据交给第三方 SaaS、且已在用 WP"的 B 端是核心卖点；竞品里多数 WP 原生插件偏开发者，SaaS 类又不把数据留给你。
2. **中文单源 → 多语种出海**：auto-i18n 已有基础。对"中国制造 / 外贸出海"客户，一套中文知识库自动服务全球访客——这是 Tidio / Intercom 不强调、国内 SaaS 不覆盖 WP 的**空白带**。
3. **行业知识包（制造业 / 外贸 / 电商）可订阅**：把 RAG 知识做成垂直包，形成壁垒与持续收入；竞品多是通用 bot。
4. **合规导向（PIPL / GDPR 擦除、审计）**：compliance 模块已有雏形，对出海 / 欧盟客户是刚需卖点。
5. **成本透明 + 多模型路由**：BYOK 下用户能看每笔花费，可讲"比 SaaS 订阅更省"的叙事。

> 注意：差异化不是自动成立，必须先把"蓝图"里的能力（流式、向量 RAG、CRM、全渠道）真正做出来，才能和 Intercom / Tidio 正面比。

---

### 五、当前版本的核心不足（短板清单）

![06-notify.png](/images/06-notify.png)

按严重度与影响面排序，诚实盘点 v1.0.19 现状：

| 维度     | 不足                                                        | 影响                                         |
| -------- | ----------------------------------------------------------- | -------------------------------------------- |
| 安全     | 明文 Key 影子选项`RC_ADV_OPT` 仍未清除                      | 数据库一旦泄露即密钥外泄                     |
| 体验     | 非流式输出，等待感强；仅基础失败转移，无智能路由            | 对话体感落后竞品一代                         |
| 智能     | 仅 BM25 关键词匹配，无语义 / 向量检索                       | 复杂问题命中差、易幻觉                       |
| 渠道     | 仅网站挂件，无 WhatsApp / 微信 / Telegram                   | 客户站点已装 WhatsApp 按钮，需求明显未被满足 |
| 转化     | 线索捕获基础，无 CRM 同步、无转人工、无评分分层、无弃单挽回 | 难以证明"多成交"，付费说服力弱               |
| 多语种   | 仅靠 IP 判定（误判）、无手动切换持久化、无 RTL              | 语种错配导致答非所问                         |
| 数据     | 无分析 / ROI 看板                                           | 客户"看不见价值"→ 难续费                    |
| 健壮性   | 曾出现跨页保存丢失、单价清零、FAB 动画冲突、邮件退信        | 代码健壮性待加强，缺自动化测试               |
| 商业化   | 无 license 分层、无用量计量                                 | 无法收费，也无法防滥用                       |
| 记忆     | 无跨会话用户画像 / 摘要                                     | 多轮连贯与个性化弱                           |
| 主动触达 | 无 A/B 问候、无基于行为的主动建议                           | 开口率天花板低                               |
| 无障碍   | a11y 未系统做                                               | 合规与可及性风险                             |

---

### 六、差异化打法与"不足 → 完善"映射

![03-prompt.png](/images/03-prompt.png)

不与巨头拼"AI 多强"，而拼**竞品难同时给出的组合拳**；把短板直接映射到前面的路线图与付费分层。

| 差异化策略                         | 针对的不足                  | 完善动作（对应路线图）                                          |
| ---------------------------------- | --------------------------- | --------------------------------------------------------------- |
| **WP 原生 + 数据自有 + 成本透明**  | SaaS 数据出域、贵           | 保留 BYOK；budget 改用量计量看板（R5 / M5）；讲"比 SaaS 省"叙事 |
| **出海多语种空白带**               | 仅靠 IP、无手动切换、无 RTL | 多信号语种判定 + 持久化 + RTL（M3）；行业外贸包（M6）           |
| **行业垂直纵深**（不做通用大模型） | 通用 bot 红海               | 制造业 / 外贸 / 电商知识包订阅（M6 / L4）                       |
| **合规 + 私有化切刚需**            | 数据敏感客户不敢用          | 密钥加密（R1）、合规审计（L6）、私有化模型（L3）                |
| **获客闭环讲 ROI**                 | 无 CRM / 转人工 / 看板      | CRM 集成 + 转人工（M4）、转化漏斗（M5）                         |
| **Free 引流 + 行业包订阅**         | 无分层、无法收费            | license 框架（R4）、去品牌（R6）、用量闸门（R5）                |
| **全渠道收口**                     | 仅网站挂件                  | 网站 + WhatsApp + 微信 + Telegram 统一台（L1）                  |
| **体验补齐**                       | 非流式 / 健壮性             | 流式 + 多模型路由（M1）；补齐跨页保存 / 单价 / FAB / 邮件（R3） |

**一句话打法**：用"WP 原生 + 出海多语种 + 行业包 + 合规私有化"这条**组合差异化**避开与 Intercom / Tidio 的正面军备竞赛，用 Free 引流 + 行业包订阅把一次性插件卖出 recurring 收入，用"看得见的价值（成本 / 转化看板）"支撑续费。

---

### 七、一句话总结

![05-appearance.png](/images/05-appearance.png)

完美版 = **"会办事、答得准、覆盖全球、线索闭环、安全合规、看得见价值"** 的网站 AI 业务助手。
变现的关键不是堆功能，而是把 **去品牌、多语种、线索闭环、向量 RAG、全渠道** 这几项**明确与客户的收入 / 成本挂钩**，并用 **Free 引流 + 用量计量 + 行业包订阅** 构成可持续收入。
而差异化的胜负手，在于**不在巨头的主场（通用强 AI）与其硬拼，而在 WP 原生 + 出海多语种 + 行业垂直 + 合规私有化这条组合带上，把当前短板逐项补成别人难同时给出的价值**。

---

## 三、开发心路历程

![05-appearance.png](/images/05-appearance.png)

## 1. 插件开发的背景与动机

### 1.1 要解决什么

一个对外网站（企业站、B2B 站、独立站）最大的痛点是：**访客来了，没人接；询盘散落，没人跟。** 真人客服有作息，时区一错开、夜班一空档，咨询就白白流失。

RuiCheng Advisor 的初心，就是给网站装一条"**永不离线的沟通生命线**"（Verve = 永续活力）——一个悬浮在页面上的 AI 助手，7×24 小时接待访客、智能应答、按需归集需求，并把高价值对话转成**可追踪、可分配、可复盘**的销售线索。

品牌命名经历了两个阶段：

- **起点（工厂 demo 期）**：项目早期以 `custommetalpro`（金属定制工厂）作为内置 demo 业务，话术、示例、信用链接都写死成工厂内容，用于快速验证挂件形态。
- **成熟期（通用品牌）**：演进为通用 AI 助手产品「**LifelineVerve · 恒线智讯**」，把"AI 助手""在线为您服务"等通用话术作为默认，工厂字眼作为一次性迁移清理掉（详见 §5 版本记录与 §4.3 重品牌清洗）。

### 1.2 设计目标

1. **全站可见、各端一致**：桌面 / 移动真机都要稳定出现入口按钮（FAB）。
2. **后台所见即前端所得**：后台配置（颜色、文案、位置）必须实时、准确地反映到访客看到的挂件，不出现"后台预览一套、前端另一套"。
3. **安全合规**：API Key 不落浏览器、文件不直链、对话数据可擦除（面向 GDPR / 个人信息保护法）。
4. **可运营**：线索能评分、能通知、能归档；成本可监控、可告警。
5. **多语种**：以中文为单一内容源，按访客地域/浏览器自动呈现其它语种界面。

---

## 2. 架构设计与技术选型过程

### 2.1 总体分层

插件采用「**引导文件 + features 模块化 + loader 钩子接线**」三层结构，彻底杜绝"单文件几千行的意大利面"。

ruicheng-advisor.php        ← 引导文件（bootstrap）
│  ├─ 定义常量（ABSPATH 守卫、目录、选项名、主文件路径）
│  ├─ load_plugin_textdomain（i18n）
│  ├─ 按依赖顺序 require 15 个功能模块（features/<feature>/<feature>.php）
│  └─ 最后 require includes/loader.php（钩子接线层）
│
├─ features/              ← 业务逻辑（每个模块只写自己的函数）
│   ├─ core/            核心：选项默认值 / 校验 / 激活建表 / 加密 / 受保护目录
│   ├─ prompt-language/ 系统提示词 + 语言策略 + 护栏
│   ├─ knowledge-base/  知识库：文件夹/文件/抽取/聚合(RAG-lite)
│   ├─ diagnostics/     错误分类 / 调用诊断 / 用量归集
│   ├─ budget/          成本与预算管理 / 阈值告警
│   ├─ chat/            对话引擎（流式 SSE / 失败转移 / 落库）
│   ├─ leads/           线索捕获 / AI 评分 / 邮件+Webhook 通知 / 后台
│   ├─ conversations/   会话后台列表与详情
│   ├─ compliance/      数据合规（匿名化 / 删除 / 审计）
│   ├─ provider/        模型配置（文本 / 视觉 / 检测 / 自检）
│   ├─ appearance/      外观配置（主题色 / 触发方式 / 文案 / 头像）
│   ├─ notifications/   通知渠道 / 限流上传 / 触发弹窗 / AI 分析总控
│   ├─ auto-i18n/       多语种自动翻译与缓存
│   ├─ widget/          前端挂件输出（wp_footer / 短代码 / 页面白黑名单）
│   └─ manual/          使用手册子页面
│
└─ includes/loader.php   ← 钩子接线层（所有 WP 钩子 / REST 路由 / 菜单 / 短代码集中注册）

```
**关键纪律**（写在 `ruicheng-advisor.php` 头部注释里）：
- 引导文件只做"定义常量 + 按顺序加载模块 + 加载接线层"三件事，**不写业务函数**。
- 所有 `add_action` / `add_filter` / `register_rest_route` / `add_menu_page` **集中在 `loader.php`**。
- 跨模块通信只用**函数名调用 + REST 路由**，**禁止全局变量耦合**。

### 2.2 技术选型要点
| 关注点 | 选型 / 做法 | 理由 |
|---|---|---|
| 配置存储 | 单一 WP option 大数组 `ruicheng_advisor_opts` | 配置项多且相互关联，集中存储便于合并默认值与原子保存 |
| 密钥安全 | AES-256-CBC 加密（基于 WP 安全盐派生密钥），密文前缀 `rcsec1:` | API Key 绝不明文存 DB、绝不下发浏览器 |
| 多语种 | 中文单源 + LLM 批量翻译缓存到 `rc_adv_i18n` option | 运营只需维护一份中文，其余语种自动生成 |
| 知识库 | RAG-lite：BM25（CJK 二元组）检索 + 全量注入两种模式，**无 embedding 依赖** | 避免额外向量库/服务，轻量可落地 |
| 对话模型 | OpenAI 兼容 Chat Completions 协议，支持 DeepSeek / 火山方舟(ARK) / OpenAI / Moonshot / Ollama | 兼容主流及私有部署 |
| 流式输出 | `text/event-stream` SSE，curl 流式转发 | 访客侧打字机效果，体验更自然 |
| 前端挂件 | 单 `widget.html` 注入 `#rc-wrap`，独立脚本 portal 到 `document.body` | 解耦主题 DOM，避免被祖先 `transform/overflow` 推出屏幕 |
| 文件存储 | 上传目录与知识库目录置于 **Web 根之外两级** + `.htaccess`/`web.config`/`index.php` 三重拒绝直链 | 图纸/PII 不通过 URL 可直达 |
| 后台 UI | 自定义设计系统（`.rc-admin` 作用域）+ GSAP 动效 + 统一 REST 封装 | 不污染 WP 原生样式，长时间开后台 nonce 失效自动刷新 |

---

## 3. 核心功能实现思路与关键决策

### 3.1 对话引擎（chat）
- **主/备双通道 + 失败转移**：文本模型（text_*）、视觉模型（vision_*，含"复用文本 Key"开关）、备用模型（backup_*）。当 `failover_on=on` 且备用三件套齐全时，主模型报错会透明切换备用，访客无感知。
- **视觉自动切换**：`ruicheng_advisor_has_image()` 检测用户消息是否含图，含图则切到 vision 通道，否则走 text 通道。
- **落库**：每次对话写 `rc_conversations`（按 `session_id` 聚合），并写入 `rc_conv_meta`（评分/国家/建议等会话级元数据）。
- **系统提示词组装**（`prompt-language::ruicheng_advisor_build_system`）：`system_prompt` + 语言指令 +（护栏开启时）`custom_guardrails` + 知识库注入。

### 3.2 线索捕获与评分（leads）
- **多重防垃圾**：蜜罐字段（提交过快 / 隐藏域非空判 bot）、邮箱正则、**一次性邮箱域名库**（~100 个临时邮箱）、**键盘乱敲检测**（如 `asdfg`/`aaa`）、零件描述最短字符校验。
- **AI 真实性评分**：会话结束或表单提交后，异步跑 `ruicheng_advisor_analyze_lead()`，产出 `ai_score`(0–100) / `ai_label`（如 高意向/机器人/垃圾）/ `ai_reason` / `ai_suggestion`。
- **阈值通知**：`ai_score ≥ lead_email_threshold`（默认 40）且非垃圾，才发邮件 + Webhook；邮件含 HTML 信息卡、AI 分析卡、聊天气泡、附件（CID 内嵌 Logo）。
- **失败重试**：邮件发送失败由 hourly cron 最多重试 3 次。

### 3.3 知识库（knowledge-base）—— RAG-lite
- 支持 `txt/md/csv/json/html/xml/pdf/doc/docx/ppt/pptx/xls/xlsx`。
- PDF 优先用 `pdftotext`，无则 PHP 兜底解析（FlateDecode + Tj/TJ 抽取）。
- `kb_mode` 三种：
  - `full`：把所有启用文件正文拼接注入（受 `kb_max_chars` 上限截断）；
  - `retrieval`：BM25-lite 按访客问题检索 top-K（`kb_retrieve_k`）注入；
  - `off`：关闭。
- 可开 `kb_cite` 要求模型用 `[[来源: 文件名]]` 标注依据。

### 3.4 多语种（auto-i18n）
- 受支持语种：`en/ja/ko/de/fr/es/pt/it/ru`（+ 中文源）。
- 访客语种**三级回落**：① CDN 国家头 → ② MaxMind/外部 GeoIP（按 IP 缓存 7 天）→ ③ `Accept-Language`。
- 后台保存配置时（`update_option_ruicheng_advisor_opts` 钩子）自动触发全量翻译并缓存，前端按语种取 `rc_adv_i18n[$lang]`。
- `geo_lang=on` 时按真实 IP 国家选语；`off` 时仅按浏览器语言。

### 3.5 成本与预算（budget）
- 每次调用经 `diagnostics::ruicheng_advisor_record_usage()` 触发 `ruicheng_advisor_usage_recorded` 动作，budget 监听后按 scope（all/deepseek/openai/moonshot/ark/ollama）归集成本。
- 规则可按 scope + 阈值配置告警，同一等级每周期仅通知一次（去重 key = `$id|$periodKey`）。
- 单价 `default_price_input/output` 用于估算；曾因"默认单价被清零 → 成本恒 0 → 预算永不生效"而加入**自愈**与"兜底出厂默认"逻辑。

### 3.6 数据合规（compliance）
- 按邮箱 / session / lead id 批量擦除（线索 + 关联会话）。
- 匿名化函数清空/脱敏个人字段。
- 审计日志 `rc_adv_erasure_log`（保留最近 50 条），面向 GDPR / 个保法取证。

### 3.7 前端挂件与触发（widget / appearance）
- 两种嵌入方式：
  - **自动嵌入**：`wp_footer` 钩子，受 `auto_embed` + `page_visibility`/`page_list` 闸门控制；
  - **短代码**：`[ruicheng_advisor]`（auto_embed=off 时用于指定页面）。
- 页面可见性 `ruicheng_advisor_is_page_allowed()`：`all` 全站；`include` 白名单（仅命中 `page_list` 才显示，列表空=不显示）；`exclude` 黑名单。
- 入口按钮 `position`（corner 悬浮 / inline 内联）、`fab_position`（左/右）、自动展开策略（delay/scroll/exit）。
- 头像/背景、气泡/表面细分主题色、排版字体字号圆角等均可后台调，并带**右侧实时预览**（访客视角）。

---

## 4. 开发中遇到的挑战及解决方案

> 以下多数为生产环境真实踩坑与对应的代码级修复，按"现象 → 根因 → 方案"记录，便于后续维护者避坑。

### 4.1 前后端样式/文案不一致（双代码路径 + 工厂硬编码）
- **现象**：后台"实时预览"样式与前端实际渲染不是一套；前端出现旧工厂英文话术，与后台中文配置对不上。
- **根因**：后台预览（`appearance.php` 的内联 JS 重写）和前端挂件（`widget.html`）曾是**两套独立代码**；且 `widget.html` 早期是给 `custommetalpro` 工厂做的 demo，写死英文 + 工厂业务，未读取后台配置。
- **方案（v1.0.19）**：彻底重做 `widget.html`——清理工厂 I18N、SYSTEM_PROMPT、QUICK chips、等待提示、recommend 函数、demo-hero、信用链接兜底；同步清理 `appearance.php` / `core.php` / `prompt-language.php` 的工厂 fallback；新增**一次性重品牌迁移** `ruicheng_advisor_rebrand_cleanup()`，清洗已保存选项中含工厂子串的字段。最终验证：可见区工厂残留 0，前端显示用户配置品牌。

### 4.2 真机看不到悬浮入口（FAB）
- **现象**：浏览器模拟手机能看到，真机 Safari/移动端看不到。
- **根因（两层）**：
  1. **代码层**：`#rc-wrap` 用 `position:fixed` 钉视口，但若它不是 `<body>` 直接子节点，被移动端主题的祖先 `transform/overflow` 一夹，就被推出屏幕。
  2. **配置层（更常见）**：`wp_footer` 自动嵌入有两道闸门——`auto_embed` 总开关 + `page_visibility`/`page_list` 白黑名单。任一项没设对，首页就永远不注入挂件（实测线上 `#rc-wrap` 根本不在 DOM 里）。
- **方案**：
  - 代码层：把 `#rc-wrap` 用极小独立脚本 `rcPortalToBody()` portal 回 `document.body`，并兜底 `DOMContentLoaded`/`load`（保留在 v1.0.19）。
  - 配置层：后台「触发方式」开启自动嵌入 + 选"全站显示" + 列表留空即可。详见第二部分 FAQ。

### 4.3 跨页保存互相清空
- **现象**：在 A 设置页保存，B 设置页的配置被清空。
- **根因**：早期 `sanitize_merge()` 里对"未提交的字段"统一回写默认值，末尾 `array_merge($old,$in)` 用这些"假默认"覆盖了 `$old` 真实值。
- **方案**：改为**只回写本次表单真正提交的字段**（`$submitted`），未提交字段一律保留 `$old`。

### 4.4 默认单价清零导致预算永不生效
- **现象**：成本进度永远 0%，预算告警从不触发。
- **根因**：`sanitize` 对缺失的单价键静默取 clamp 下限 `0`，首次保存/升级时即被清零。
- **方案**：缺失单价时兜底取**出厂默认值**（而非 0），并加入 `ruicheng_advisor_budget_heal_zero_pricing()` 一次性自愈。

### 4.5 后台改了却不生效（CSS/JS 缓存）
- **现象**：改了后台样式/脚本，浏览器仍跑旧版。
- **根因**：资源版本号写死，浏览器/CDN 缓存不刷新。
- **方案**：后台资源 `version` 改为**文件 `filemtime()` 自动变化**，任一 CSS/JS 改动后浏览器必重新拉取。

### 4.6 邮件退信 / 无感知
- **现象**：后台看到线索，邮箱收不到；或收件域名拼写错导致退信。
- **方案**：新增"发送测试邮件"按钮、销售邮箱**输入时实时校验**（MX 解析 + 与 WP Mail SMTP 发件人一致性）、邮件送达状态可观测（`email_status`：pending/sent/failed/skipped + 失败重试 cron）、表单/聊天记录同信转发。

### 4.7 附件直链与 PII 泄露风险
- **现象**：客户图纸/询盘附件若存 Web 根内，可能被 URL 直接下载。
- **方案**：上传目录与知识库目录置于 **Web 根之外两级**，并写 `.htaccess` + `web.config` + `index.php` 三重拒绝；访问仅通过带 `manage_options` 或有效 `wp_rest` nonce 的 REST 端点（`/v1/uploads/<file>`）。

### 4.8 API Key 明文风险（影子选项）
- **现象**：早期版本把常量名 `RC_ADV_OPT` 误当选项名写出，导致 `wp_options` 里残留一个**同名影子选项**，明文存了 API Key。
- **现状**：迁移已读取正确的 `ruicheng_advisor_opts`，功能不受影响；但明文 Key 是泄露风险。**建议生产环境执行**：
  ```sql
  DELETE FROM wp_options WHERE option_name='RC_ADV_OPT';
```

（注意：正确选项名也是字面量 `ruicheng_advisor_opts`，与上述影子选项 `RC_ADV_OPT` 不同，删除影子项不影响配置。）

---

## 5. 迭代演进过程与版本变更记录

![07-leads.png](/images/07-leads.png)

> 说明：本插件 git 历史自 **v1.0.16** 起完整保留（`3b50a4f` P0 baseline — git init，收敛清理 `.quarantine/` 实验隔离区）；更早版本（1.0.0–1.0.15）无 git 记录。下方按可确证信息整理。

### v1.0.16 — 工程化 baseline

- 初始化 git，收敛清理 8 个实验性隔离文件（`.quarantine/`）。
- 确立「引导文件 + features 模块化 + loader 接线」分层骨架。

### v1.0.17（邮件链路与线索运营）

- 新增「发送测试邮件」按钮，验证邮件链路（`lead id=33` 端到端验证）。
- 销售邮箱改为**输入时实时校验**（ajax + 防抖 400ms，保存前即提示域名/MX 问题），新增 `wp_ajax_rc_adv_validate_lead_email`。
- 邮件通知追加**关联聊天记录**（表单 + 聊天同信转发），新增开关「邮件包含聊天记录」(默认开启)。
- 锁定退信根因：插件销售邮箱少 `china` 与 WP Mail SMTP From 是两独立设置，脚本修正复测。

### v1.0.18（对话体验与上传能力）

- 对话窗口 + 报价表单均支持**工程文件上传（CAD 全集）**，邮件附件封顶可配置（`max_email_mb`）。
- 关键词命中后**对话内不打断**，对话结束才延迟弹窗（延迟秒数后台可配 `lead_form_delay`）。
- 邮件送达**可观测性**：解决「后台有、邮箱没有」无感知问题（`email_status` + 失败重试）。

### v1.0.19（去工厂化 + 重品牌 + 真机修复）— 当前打包版本

- **彻底重做 `widget.html`**：清除 custommetalpro/lifelineverve 工厂硬编码（I18N、SYSTEM_PROMPT、QUICK chips、等待提示、recommend、demo-hero、信用链接兜底）。
- **后台与前端双路径对齐**：清理 `appearance.php` / `core.php` / `prompt-language.php` 工厂 fallback，使后台配置真实流向前端（解决"前后端不一致"）。
- **一次性重品牌迁移** `ruicheng_advisor_rebrand_cleanup()`：清洗已保存选项中含工厂子串的字段，回落通用"恒线智讯 / AI 助手"默认话术。
- **保留并确认**真机 FAB 的 `rcPortalToBody()` portal 修复，重做未引入回退。
- 版本号 1.0.18 → **1.0.19**，`readme.txt` Stable tag 同步。

### 待办 / 建议后续版本

- 触发方式"宽容化"：当 `page_visibility=include` 但列表为空时，自动 fallback 到全站并后台警告；挂件在生产页缺失时给管理员顶部黄条提示。
- 影子选项 `RC_ADV_OPT` 明文 Key 生产环境清理（见 §4.8）。

---

## 四、使用者手册

![08-conversations.png](/images/08-conversations.png)

## 1. 插件功能概述与适用场景

### 1.1 它是什么

LifelineVerve · 恒线智讯 是一个 WordPress AI 对话获客插件：在网站挂一个 AI 助手浮窗，自动接待访客、答疑、归集需求，并把高价值对话转成可追踪线索。

### 1.2 核心能力一览

| 能力     | 说明                                                                 |
| -------- | -------------------------------------------------------------------- |
| AI 对话  | 悬浮挂件，支持流式打字机、图片识别（视觉模型）、多轮对话             |
| 多语种   | 中文单源，按访客 IP/浏览器自动呈现 9 种外语界面                      |
| 知识库   | 上传产品/PPT/PDF/Word/Excel 等，自动注入回答（RAG-lite）             |
| 线索捕获 | 报价表单 + 对话归档，AI 评分（意向度），防垃圾                       |
| 通知     | 邮件 + Webhook 转发高价值线索给销售                                  |
| 合规     | 按邮箱/session/线索 ID 擦除个人数据 + 审计日志                       |
| 成本     | 按模型 scope 归集调用成本，超阈值告警                                |
| 后台     | 服务商 / 提示词 / 知识库 / 外观 / 通知 / 线索 / 会话 / 手册 八个菜单 |

### 1.3 适用场景

- B2B / 外贸独立站（塑料、金属定制等）的 7×24 询盘接待。
- 企业官网的售前咨询、常见问答、资料索取。
- 任何希望"不漏掉每一次对话机遇"的 WordPress 站点。

### 1.4 不适用 / 注意

- 需要 PHP 7.4+ 与 `openssl` 扩展（密钥加密）。
- 视觉能力依赖配置了视觉模型（如火山方舟）的 API。
- GeoIP 默认调用 `ipapi.co` 免费接口（有频率限制），内网/本地访问不触发。

---

## 2. 安装步骤与环境要求

### 2.1 环境要求

- WordPress 5.8+（建议 6.x）
- PHP 7.4+，需启用 `openssl`（API Key 加密）、`curl`（模型调用）、`ZipArchive`（Office 抽取）、`mbstring`
- MySQL/MariaDB（插件自建 `rc_leads` / `rc_conversations` / `rc_conv_meta` / `rc_kb_*` 表）
- 一个 OpenAI 兼容的模型 API（DeepSeek / 火山方舟 / OpenAI / Moonshot / 私有 Ollama 等）

### 2.2 安装步骤

1. 在 WorkBuddy 产出（或官网下载）得到 `ruicheng-advisor.zip`。
2. 登录 WP 后台 → **插件 → 安装插件 → 上传插件**，选择该 zip 并安装、启用。
3. 或 FTP/文件管理器解压到 `wp-content/plugins/ruicheng-advisor/`，再到后台启用。
4. 激活时会自动建表、创建受保护上传/知识库目录、生成 proxy_token、安排失败邮件重试 cron。

> ⚠️ **部署铁律（反复踩坑）**：更新插件时，**务必先彻底删除旧目录**（`停用 → 删除`，或用主机文件管理器删掉整个 `ruicheng-advisor/` 文件夹），再上传新版 zip。若旧目录删不掉（权限/占用），WP 会保留旧文件 → 你的修复永远不生效。上传后请核对插件列表版本号是否为 **1.0.19**。

### 2.3 快速验证是否装上

- WP 后台「插件」列表显示 `LifelineVerve` 版本 **1.0.19**。
- 前台任意页面按 F12，控制台执行：
  
  ```js
  document.querySelector('.rc-fab, [class*="rc-fab"]') ? 'FAB在' : '没找到'
  ```
  
  返回"FAB在"即挂件已渲染。

---

## 3. 详细配置说明与参数解释

所有配置存于 `ruicheng_advisor_opts` 单一数组，按模块在后台各子菜单设置。下表列出**关键参数**（完整默认值见 `features/core/core.php::ruicheng_advisor_default_opts()`）。

### 3.1 服务商（Provider / 模型配置）

| 参数                                              | 默认                                           | 说明                                                 |
| ------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| `text_endpoint`                                   | `https://api.deepseek.com/v1/chat/completions` | 文本模型接口（OpenAI 兼容）                          |
| `text_key`                                        | 空                                             | 文本 API Key（落库加密，页面不回显）                 |
| `text_model`                                      | `deepseek-chat`                                | 文本模型名                                           |
| `vision_endpoint`                                 | 火山方舟 ARK 地址                              | 视觉模型接口                                         |
| `vision_key` / `vision_model`                     | 空                                             | 视觉 Key/模型；可开`vision_same_key=on` 复用文本 Key |
| `proxy_token`                                     | 自动生成                                       | 前端代理鉴权令牌；点"生成新 Token"可轮换             |
| `temperature` / `max_tokens` / `top_p`            | 0.4 / 1200 / 1.0                               | 生成参数                                             |
| `failover_on`                                     | off                                            | 失败转移总开关                                       |
| `backup_endpoint` / `backup_key` / `backup_model` | 空                                             | 备用模型三件套（failover 时启用）                    |
| `req_timeout` / `req_retries` / `req_backoff`     | 60 / 1 / 1000(ms)                              | 超时/重试/退避                                       |
| `monthly_budget`                                  | 0                                              | 月额度（USD，0=不限）                                |
| `default_price_input` / `default_price_output`    | 1.0 / 2.0                                      | 未知模型默认单价（USD/1M tokens）                    |

> 服务商页提供「连接测试 / 端到端自测 / 拉取模型列表 / 清除日志 / 显示/清除 Key」等动作与运行健康热力图。

### 3.2 提示词（Prompt & Language）

| 参数                | 默认             | 说明                                               |
| ------------------- | ---------------- | -------------------------------------------------- |
| `system_prompt`     | 内置恒线智讯人设 | 系统提示词（不可虚构、团队路由、知识库 grounding） |
| `lang_mode`         | auto             | auto / zh / en                                     |
| `guardrails`        | on               | 护栏总开关                                         |
| `custom_guardrails` | 空               | 自定义护栏规则（每行一条，开启护栏时追加）         |

> 提示词页含 4 个 Tab：系统提示词 / 预览 / 变更记录 / 试聊沙盒。

### 3.3 知识库（Knowledge Base）

| 参数            | 默认  | 说明                                           |
| --------------- | ----- | ---------------------------------------------- |
| `kb_mode`       | full  | full（全量注入）/ retrieval（检索 top-K）/ off |
| `kb_max_chars`  | 12000 | 全量模式注入上限（字符）                       |
| `kb_cite`       | off   | 要求模型用`[[来源: 文件名]]` 标注              |
| `kb_retrieve_k` | 4     | 检索模式 top-K 片段数                          |
| `max_upload_mb` | 12    | 单文件上传上限（同时作用于线索附件）           |
| `pdf_bin`       | 空    | PDF 提取程序路径（空=自动探测 pdftotext）      |

### 3.4 外观（Appearance）

**主题色**：`accent_color`(主色 #14539b)、`primary_d_color`(主色深色)、`header_color`(头部背景)、`accent_color2`(强调橙)、`header_text_color`、`bot_bubble_bg/text`、`user_bubble_bg/text`、`panel_bg`、`input_bg`（细分项允许留空=自动派生/回退默认）。

**布局/形态**：`position`(corner/inline)、`fab_position`(right/left)、`fab_margin_x/y`、`fab_size`、`panel_width/height`、`panel_offset`、`auto_open_mode`(off/delay/scroll/exit)、`auto_open_delay`、`auto_open_scroll`。

**排版/气泡**：`font_family`(system/sans/serif/mono)、`font_size`、`bubble_radius`、`msg_gap`、`avatar_shape`(circle/rounded/square)、`avatar_size`、`show_avatars`。

**触发按钮**：`fab_text_zh`、`fab_icon`(chat/message/headset/comment/robot/sparkles/question/help/phone/mail)、`fab_custom_icon`(http/https 覆盖)。

**头像/背景**：`bot_avatar`(URL 或裁切 data:image)、`bot_avatar_src`(原图源)、`visitor_avatar_count`(1–20 虚拟形象池)、`chat_bg`、`chat_bg_opacity`(0–100)。

**卡片文案（仅中文可定制，其余语种自动翻译）**：`assistant_name_zh`(恒线智讯)、`head_sub_zh`、`input_placeholder_zh`、`send_label_zh`、`foot_disclaimer_zh`、`credit_text_zh`、`credit_url`、`privacy_url`；Layer2 `img_title_zh/new_chat_zh/bubble_title_zh/privacy_label_zh`；Layer3 报价表单 `lead_*_zh`、`lead_contacting_zh`、`lead_celebrate`(none/confetti/check/fireworks)。

**问候/短语/等待**：`greeting_zh`、`quick_chips`(JSON 最多10)、`waiting_texts_zh`(JSON [{zh,ms}])、`wait_tips_zh`(JSON [{zh,ms}])、`sent_ok_zh`。

**多语种/来源**：`geo_lang`(on/off 按 IP 选语)、`show_lang_toggle`(on)、`show_sources`(on)、`sources_max`(1–20)。

**触发方式（关键，见 FAQ）**：`auto_embed`(on/off 自动嵌入总开关)、`page_visibility`(all/include/exclude)、`page_list`(受控页面 ID)。

### 3.5 通知（Notifications）

| 参数                                                                         | 默认                                            | 说明                                                        |
| ---------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `lead_email`                                                                 | 站点 admin_email                                | 线索接收邮箱（输入时实时校验）                              |
| `lead_webhook`                                                               | 空                                              | Webhook URL（JSON POST）                                    |
| `lead_email_threshold`                                                       | 40                                              | AI 评分达此值且非垃圾才发邮件+Webhook                       |
| `email_include_chat`                                                         | on                                              | 邮件是否附带聊天记录                                        |
| `max_email_mb`                                                               | 25                                              | 邮件附件封顶                                                |
| `rate_chat` / `rate_lead`                                                    | 30 / 20                                         | 限流（次/分钟，transient 控制）                             |
| `trigger_keywords`                                                           | 报价/多少钱/价格/询价/求购/quote/price/how much | 命中后延迟弹报价表单                                        |
| `keyword_match_mode`                                                         | fuzzy                                           | fuzzy(包含)/exact(相等)                                     |
| `lead_form_delay`                                                            | 15(秒)                                          | 命中关键词后对话结束延迟弹窗                                |
| `auto_analyze`                                                               | on                                              | AI 自动分析总开关                                           |
| `analyze_abandoned` / `abandoned_notify`                                     | off / off                                       | 未提交会话也评分 / 达标发提醒                               |
| `idle_minutes`                                                               | 15                                              | 会话空闲多少分钟视为"结束"                                  |
| `ai_analysis_min_turns`                                                      | 6                                               | 未提交会话访客发言达此句数触发分析                          |
| `filter_disposable` / `filter_name` / `filter_part_min` / `filter_auto_mark` | on/on/10/on                                     | 表单过滤（一次性邮箱/键盘乱敲/零件最短字符/低质量自动标记） |

### 3.6 线索 / 会话 / 合规（后台查看与操作）

- **线索页**：列表筛选（status/analyzed/label/q/country）、详情、单条/批量改状态、重分析、重发邮件、导出 CSV（防公式注入）、关联会话查看。
- **会话页**：会话列表与详情、标签、已读标记、批量操作、导出、合规擦除入口、关联线索。
- **合规**：按邮箱 / session / lead id 批量擦除，审计日志保留最近 50 条。

---

## 4. 各功能模块的使用方法与操作流程

### 4.1 第一步：配置服务商（让 AI 能回答）

1. 后台 → **LifelineVerve · 服务商**。
2. 填「文本模型」Endpoint / Key / Model（默认 DeepSeek）。
3. 如需识图：填「视觉模型」或开"视觉复用文本 Key"。
4. 点「连接测试」→ 正常后点「端到端自测」跑一个示例问题验证整链路。
5. 可选：开「失败转移」并填备用模型，提升可用性。

### 4.2 第二步：写提示词（定人设）

1. 后台 → **提示词**。
2. 在"系统提示词"里写你的人设/边界（如"你是 XX 公司 AI 助手，不编造价格，复杂需求转人工"）。
3. 开"护栏"，可加自定义护栏规则。
4. 用"试聊沙盒"验证。

### 4.3 第三步：建知识库（让回答有据可依）

1. 后台 → **知识库 → 文件库**。
2. 建文件夹 → 上传产品手册/FAQ/PPT/PDF 等。
3. 设 `category`（用于加分）、启用文件、可"重新提取"文本。
4. `kb_mode` 选 `full`（小库）或 `retrieval`（大库按问题检索）。
5. 可选开 `kb_cite` 让模型标注来源。

### 4.4 第四步：调外观与触发（让访客看得到）

1. 后台 → **外观**。
2. 主题色 / 布局 / 排版按需调；右侧有"访客视角"实时预览。
3. **触发方式**：
   - ☑️ 自动嵌入 = 开；
   - ◉ 全站显示（最省心）；
   - 页面列表留空。
4. 上传 AI 头像、设问候语、快捷短语。
5. 保存 → 强刷前台，确认 FAB 出现。

### 4.5 第五步：设通知（让线索到你手里）

1. 后台 → **通知 → 通知渠道**：填销售邮箱（实时校验）+ 可选 Webhook。
2. 设 `lead_email_threshold`（默认 40，越低越多邮件）。
3. 点"发送测试邮件"确认链路通。
4. 「触发弹窗」可配关键词与延迟；「AI 自动分析」保持开启。

### 4.6 日常运营

- **线索页**每天看新线索、AI 评分高的优先跟；可导出 CSV 给销售。
- **会话页**复盘对话质量、打标签、必要时合规擦除。
- **成本预算**：服务商页"成本预算"Tab 看用量与阈值告警。

### 4.7 用短代码指定页面嵌入

若你关闭了"自动嵌入"（`auto_embed=off`），可在任意页面/模板放：

```
[ruicheng_advisor]
```

或在主题 `footer.php` 写 `<?php echo do_shortcode('[ruicheng_advisor]'); ?>`。

---

## 5. 常见问题解答（FAQ）与故障排查指南

![09-manual.png](/images/09-manual.png)

### Q1. 后台改了文字/颜色，前端没变？

- 确认你保存的是正确配置（选项名 `ruicheng_advisor_opts`），且**前端挂件确实被注入**（见 Q2）。
- 强刷前端（Ctrl/Cmd + Shift + R），排除浏览器/CDN 缓存。
- 后台资源已带 `filemtime` 版本号，一般无需手动清缓存。
- 若仍不一致：检查是否旧版本文件未替换（见 Q5）。

### Q2. 真机看不到悬浮按钮（FAB）？

这是**最高频问题**，按下面顺序排查：

1. **先确认挂件有没有被注入**：真机 Safari 打开站点首页，地址栏执行：
   
   ```js
   javascript:alert(document.querySelector('.rc-fab,[class*="rc-fab"]')?'FAB在':'没注入')
   ```
   
   - 若"没注入" → 是**触发设置**挡住了（见 2）。
   - 若"FAB在"但看不到 → 是被主题推出屏幕（极少，代码层已 portal 修复）。
2. **触发设置（最常见根因）**：后台 → 外观 → 触发方式：
   
   - `auto_embed` 必须 = 开；
   - `page_visibility` 必须 = `all`（全站显示）；
   - 若误设成 `include` 且 `page_list` 为空，首页**永远不会**出现挂件。
     改回"全站显示 + 列表留空" → 保存 → 强刷。
3. **确认线上版本是 1.0.19**：WP 后台插件列表看版本号（见 Q5）。

### Q3. AI 回答"我是 AI，不是真人"或乱说话？

- 这是预期免责声明（`foot_disclaimer_zh`），可在外观改文案。
- 若回答偏离业务：检查**系统提示词**与**知识库**是否配置；开 `kb_cite` 看它引用了哪些文件。

### Q4. 邮件收不到线索？

- 后台「通知」点"发送测试邮件"，看是否成功。
- 查 `lead_email` 是否拼写正确（少 `china` 是经典退信坑），已支持保存前实时校验。
- 确认 `lead_email_threshold` 没设太高（默认 40，AI 评分低于此值不发信）。
- 查 `email_status`（后台线索详情）：failed 会由 hourly cron 重试最多 3 次。

### Q5. 我上传了最新包，BUG 却没解决？

**九成是旧文件没被替换**。确认：

1. WP 后台「插件」列表 → LifelineVerve 版本号是否 **1.0.19**；
2. 不是的话：停用 → 删除旧 `ruicheng-advisor/` 目录 → 重新上传新 zip → 启用；
3. 再回 Q2 验证 FAB。

### Q6. 多语种不生效？

- `geo_lang=on` 时按真实 IP 国家选语（内网/本地不触发，回退浏览器语言）；`off` 时仅按 `Accept-Language`。
- 译文在后台**保存配置时自动翻译并缓存**到 `rc_adv_i18n`；改了中文源文案后保存一次即重新生成。
- 品牌名（如 RUICHENG）等专有名词通常不翻译。

### Q7. 想彻底删除某访客数据（合规）？

- 后台 → **会话** → 找到该会话 → 「合规擦除」，或按邮箱/session/lead id 批量擦除；审计日志在合规接口留存。

### Q8. API Key 安全吗？

- Key 以 AES-256-CBC 加密存 DB（`rcsec1:` 前缀），页面不回显，只在你点"显示"时按需取回（需 `manage_options`）。
- ⚠️ 注意清理遗留的**影子选项** `RC_ADV_OPT`（早期误写、明文存 Key）：
  
  ```sql
  DELETE FROM wp_options WHERE option_name='RC_ADV_OPT';
  ```
  
  不影响正确配置（正确选项名是 `ruicheng_advisor_opts`）。

### Q9. 成本进度一直是 0%？

- 多半是历史 bug 导致默认单价被清零，插件已内置**自愈**（`ruicheng_advisor_budget_heal_zero_pricing`）。
- 也可在「成本预算 → 单价」手动设 `default_price_input/output`，保存后进度即恢复。

### Q10. 知识库文件提取失败？

- PDF 优先用 `pdftotext`；确保服务器有该命令，或在知识库设置填 `pdf_bin` 绝对路径。
- 不支持的格式可用 TXT/Markdown 手动粘贴内容上传。

---

## 附：REST API 路由速查（namespace `ruicheng/v1`）

| 路由                                                                              | 方法                  | 权限               | 用途                           |
| --------------------------------------------------------------------------------- | --------------------- | ------------------ | ------------------------------ |
| `/chat`                                                                           | POST                  | 公开               | 对话（流式/非流式）            |
| `/lead`                                                                           | POST                  | 公开               | 提交线索                       |
| `/leads`                                                                          | GET                   | 管理员             | 线索列表                       |
| `/leads/read` `/(id)/status` `/(id)/analyze` `/(id)/conversation` `/(id)/resend`  | POST                  | 管理员             | 线索操作                       |
| `/leads/bulk` `/(export)`                                                         | POST/GET              | 管理员             | 批量/导出                      |
| `/uploads/(file)`                                                                 | GET                   | 管理员或有效 nonce | 私有附件下载                   |
| `/conversations` `(/export)` `(/bulk)`                                            | GET/POST              | 管理员             | 会话列表/导出/批量             |
| `/conversations/(sid)` `(/meta)` `(/tag)` `(/read)`                               | GET/POST              | 管理员             | 会话详情                       |
| `/kb/folders` `/(id)` `/files` `/(id)/download` `/(id)/extract`                   | GET/POST/DELETE/PATCH | 管理员             | 知识库 CRUD                    |
| `/kb/stats` `/categories`                                                         | GET                   | 管理员             | 知识库概览                     |
| `/provider/test` `/status` `/selftest` `/models` `/clear-log` `/clear-key` `/key` | POST/GET              | 管理员             | 模型健康与密钥管理             |
| `/compliance/erase` `/log`                                                        | POST/GET              | 管理员             | 数据合规                       |
| `/budget/rules` `/test` `/overview` `/pricing`                                    | GET/POST/DELETE       | 管理员             | 预算管理                       |
| `/nonce`                                                                          | GET                   | 公开               | 后台长时间开着时静默刷新 nonce |

> 短代码：`[ruicheng_advisor]`（无属性）。菜单 slug：服务商 `ruicheng-advisor`、提示词 `-prompt`、知识库 `-kb`、外观 `-appearance`、通知 `-notify`、线索 `ruicheng-leads`、会话 `ruicheng-conversations`、手册 `ruicheng-manual`。

---

*本文档基于插件 v1.0.19 源码（`features/*`、`includes/loader.php`、`ruicheng-advisor.php`）与 git 历史（自 v1.0.16 起）及生产环境调试记录梳理而成，力求与代码行为一致。配置默认值以 `features/core/core.php` 为准。*

