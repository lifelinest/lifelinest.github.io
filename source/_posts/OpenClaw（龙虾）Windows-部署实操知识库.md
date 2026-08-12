---
title: OpenClaw（龙虾）Windows 部署实操知识库
author: Lifeline
tags:
  - 开源项目
  - 运维部署
  - 技术踩坑
categories:
  - 技术探索
cover: /images/4_1773231968549.jpg
abbrlink: a0c85c85
date: 2026-03-11 20:16:43
---
核心参考：

- OpenClaw 官方知识库：[OpenClaw 知识库](https://geekbang.feishu.cn/wiki/TSUqwoAn5iL6WxkkxHcci3pzn7c?from=from_copylink)
- 部署教程参考：[Windows 也能跑 OpenClaw！最完整安装教程 + 飞书接入](https://cloud.tencent.com/developer/article/2628002)
- 实操依据：与用户的全量部署对话（含各类报错解决、命令适配、实操踩坑）

适配版本：OpenClaw 2026.3.8（最新版）、Windows 10（版本 10.0.18363.592）

核心说明：整合 OpenClaw 基础认知、Windows 完整部署流程、对话中遇到的所有问题及解决方案，严格贴合实际操作场景，所有命令均经实操验证，代码块规范呈现，新手可全程跟着操作，避开所有高频坑点。

## 一、OpenClaw 基础认知（结合知识库+对话补充）

![6_1773231502572.jpg](/images/6_1773231502572.jpg)

### 1. 核心定义与昵称由来

OpenClaw 是一款本地优先、自托管、多通道统一接入的开源 AI Agent 执行引擎（MIT 协议开源），社区昵称「龙虾」，并非普通聊天机器人，核心能力是将自然语言指令转化为可执行操作，实现自动化办公与任务落地。

注：对话中用户全程称其为「龙虾」，后续流程中统一沿用该昵称，方便理解。

### 2. 核心优势（贴合实操场景）

- 本地优先：数据私有化，部署在本地设备，无网络也可运行基础功能，保护隐私；
- 自托管：无需依赖第三方云服务，可完全掌控部署环境和配置，避免外部干扰；
- 多通道接入：支持 Telegram（电报）、飞书等主流通讯工具，可在任意渠道下达指令；
- 开源可扩展：支持自定义插件、技能和模型，可对接 Kimi、OpenAI 等各类大模型；
- 适配性强：Windows 系统可正常部署，经实操验证，解决各类环境适配、命令报错问题。

### 3. 版本注意事项（对话高频坑点）

当前实操版本为 OpenClaw 2026.3.8（最新版），与旧版本相比，核心命令有重大变更，**无 serve/start 命令**，核心启动命令为 `gateway`，这是对话中用户多次遇到「命令不识别」的核心原因，后续流程将重点标注。

## 二、Windows 系统完整部署流程（结合对话实操+腾讯云教程）

![5_1773231502556.jpg](/images/5_1773231502556.jpg)

### 核心前提（必看，避免踩坑）

1. 全程使用 **CMD 或 PowerShell**，特殊步骤标注「管理员模式」，其余无需；
2. 关闭代理/梯子，避免干扰国内镜像下载和本地服务连接；
3. 所有操作路径无中文、空格及特殊字符，防止环境冲突；
4. 依赖 Node.js v22.x.x 版本，优先通过 nvm 管理，避免版本冲突（对话中用户使用 Node.js v22.22.0 适配成功）。

### 1. 前置环境准备（解决依赖/命令不识别问题）

#### （1）安装 nvm for Windows（版本管理工具）

参考腾讯云教程推荐方式，用 nvm 管理 Node.js 版本，避免后续版本冲突：

- 下载地址：[nvm-windows GitHub Releases](https://github.com/coreybutler/nvm-windows/releases)（选择最新版 `nvm-setup.exe`）；
- 安装步骤：双击安装包，全程下一步，默认路径即可，无需额外配置。

#### （2）安装 Node.js 22.22.0（适配最新版龙虾）

**管理员模式打开 PowerShell**，依次执行以下命令（对话中用户实操验证成功）：

```powershell
# 安装 Node.js 22 版本
nvm install 22
# 切换并使用 22.22.0 版本
nvm use 22.22.0
```

验证安装：执行以下命令，能正常显示版本号即为成功：

```powershell
# 验证 Node 版本（需显示 v22.22.0 左右）
node -v
# 验证 npm 版本（任意有效版本均可）
npm -v
```

补充：若 nvm 下载失败，可直接从 [Node.js 官网](https://nodejs.org/zh-cn/download) 下载 v22.x.x 版本，安装时**务必勾选 Add to PATH**（加入系统环境变量），否则会出现「命令不识别」报错（对话中用户未出现此问题，但为高频坑点）。

#### （3）安装 Windows 编译工具（可选，解决依赖编译报错）

若后续安装龙虾时出现`gyp`、`make` 相关报错，管理员 PowerShell 执行以下命令：

```powershell
npm install --global windows-build-tools
```

说明：安装耗时 5-10 分钟，期间看似无反应，耐心等待至出现「success」提示即可，无需中途操作。

### 2. 龙虾（OpenClaw）安装（解决国内源卡顿问题）

对话中用户遇到「安装时一直卡在 Installing OpenClaw (openclaw@latest)...」，核心原因是 npm 默认国外源，下载速度极慢，解决方案如下：

```powershell
# 配置阿里云国内镜像，大幅提升下载速度
npm config set registry https://registry.npmmirror.com
# 清理 npm 旧缓存，避免安装异常
npm cache clean --force
# 全局安装 OpenClaw 最新版（2026.3.8）
npm install -g openclaw@latest
```

安装成功判定：耗时 3-8 分钟（依网络而定），终端显示「removed 5 packages, and changed 751 packages」，**无红色 error/ERR! 报错**（对话中用户的安装日志符合此标准，判定为安装成功）。

验证安装：

```powershell
# 验证 OpenClaw 版本（显示 2026.3.8 即为成功）
openclaw --version
# 查看所有支持的命令（确认核心启动命令为 gateway，无 serve/start）
openclaw --help
```

### 3. 初始化配置（解决“配置验证失败”问题）

安装完成后，需初始化生成适配当前版本的配置文件，对话中用户遇到「Config validation failed: models.providers.kimi-coding.models.0.compat: Unrecognized key: requiresOpenAiAnthropicToolPayload」报错，核心是配置参数与版本不兼容，流程如下：

#### （1）快速初始化向导（参考腾讯云教程，适配 Windows）

```powershell
# 快速初始化，避免冗余步骤，新手友好
openclaw onboard --flow quickstart
```

#### （2）初始化关键操作（对话中用户实操步骤）

1. 风险提示「I understand this is powerful and inherently risky. Continue?」→ 输入 `Yes` 回车；
2. 模型选择 → 可选「Moonshot AI (Kimi)」（腾讯云教程示例），或选「Skip for now」后续在仪表盘配置；
3. 通讯渠道配置 → 直接选「Skip for now」（Windows 原生对插件支持有限，后续单独配置）；
4. 技能配置 → 选「No」暂不配置（对话中用户选择“Skip for now”，避免安装无用依赖，加快初始化速度）；
5. 初始化完成后，终端会自动生成网关令牌，无需手动记录。

#### （3）配置文件异常修复（对话中用户遇到的报错）

若启动时提示「Unrecognized key: requiresOpenAiAnthropicToolPayload」，执行以下命令打开配置文件，删除该无效配置行：

```powershell
# 打开 OpenClaw 配置文件（JSON 格式）
notepad $env:USERPROFILE\.openclaw\config.json
```

操作说明：打开文件后，找到包含「kimi-coding」的配置段，删除「"requiresOpenAiAnthropicToolPayload": xxx」这一行，保存文件后重新启动即可。

### 4. 启动龙虾核心服务（解决“命令不识别”问题）

对话中用户多次尝试 `openclaw serve`、`openclaw start` 均报错「unknown command」，核心原因是最新版无此命令，核心启动命令为 `gateway`，且网关窗口**不可关闭**（关闭则服务停止）：

```powershell
# 正常启动网关（默认端口 18789）
openclaw gateway
# 端口被占用时，强制杀进程并启动（推荐，对话中用户多次使用）
openclaw gateway --force
# 自定义端口启动（如 3000 端口，后续仪表盘对应端口访问）
openclaw gateway --port 3000
```

启动成功标志：终端持续输出日志，无报错且不闪退，显示以下内容：

```text
[INFO] Gateway listening on ws://127.0.0.1:18789
[INFO] HTTP server for dashboard ready on http://127.0.0.1:18789
```

### 5. 生成网关令牌+访问 Web 仪表盘（解决“加载失败”问题）

对话中用户遇到「未授权：缺少网关令牌」「仪表盘加载空白」等问题，核心是 URL 缺少令牌、网关未正常运行，解决方案如下：

#### （1）生成网关令牌（认证必备）

**新开一个终端窗口**（不要关闭网关窗口），执行命令生成认证令牌并复制：

```powershell
openclaw doctor --generate-gateway-token
```

实操说明：终端会输出一串令牌（如「abcdef1234567890abcdef1234567890」），右键终端→标记→选中令牌→回车复制，后续认证需用到。

#### （2）访问 Web 仪表盘（避免加载失败/URL 错误）

禁止手动输入 URL，执行命令生成「带令牌的精准地址」，避免因令牌缺失、端口错误导致加载失败：

```powershell
# 生成带令牌的 URL，不自动打开浏览器（方便复制）
openclaw dashboard --no-open
```

访问步骤（对话中用户实操验证成功）：

1. 复制终端输出的完整 URL（格式：`http://127.0.0.1:18789/dashboard?token=xxx`）；
2. 用 **Chrome/Edge 无痕模式** 粘贴访问（避免插件、缓存干扰，对话中用户用此方式解决加载问题）；
3. 确认仪表盘左侧「Gateway」板块状态为 **Online（在线）**，即为认证成功。

加载失败排查（对话中用户遇到的问题）：

- 清空浏览器缓存（`Ctrl+Shift+Del`），重新访问；
- 临时关闭 Windows 防火墙（测试后重新打开）；
- 确认网关窗口仍在运行，若已关闭，重新执行 `openclaw gateway --force`。

## 三、核心渠道配置（结合对话报错+教程，电报+飞书）

![8_1773231502848.jpg](/images/8_1773231502848.jpg)

### 1. Telegram（电报）配置（解决“不支持类型”报错）

对话中用户遇到「不支持类型：。使用RAW模式」报错，核心是龙虾无法识别电报部分消息类型（贴纸、动图等），解决方案如下：

1. 仪表盘进入「Channels」→ 选择「Telegram」，配置机器人 Token/账号；
2. 找到「Message Mode（消息模式）」，选择 **RAW（原始模式）**；
3. 点击「Save」保存，重启 Telegram 连接器（或重启网关），报错即可消失；
4. 若仍有报错，执行以下命令查看实时日志，定位不支持的消息类型，添加过滤规则忽略：

```powershell
# 实时查看日志，定位电报消息类型报错
openclaw logs --follow
```

### 2. 飞书配置（参考腾讯云教程，Windows 适配版）

Windows 原生对飞书插件支持有限，需先安装插件再在飞书开放平台完成配置，步骤如下：

#### （1）安装飞书插件

```powershell
openclaw plugins install @m1heng-clawd/feishu
```

#### （2）飞书开放平台配置（关键步骤）

1. 进入 [飞书开放平台](https://open.feishu.cn/) → 创建「企业自建应用」→ 添加「机器人」应用能力；
2. 复制应用「App ID」和「App Secret」，在仪表盘飞书配置页粘贴；
3. 权限配置：进入「权限管理」→ 批量导入导出权限 → 粘贴以下 JSON 配置：

```json
{
  "scopes": {
    "tenant": [
      "aily:file:read",
      "aily:file:write",
      "application:application.app_message_stats.overview:readonly",
      "application:application:self_manage",
      "application:bot.menu:write",
      "contact:user.employee_id:readonly",
      "corehr:file:download",
      "event:ip_list",
      "im:chat.access_event.bot_p2p_chat:read",
      "im:chat.members:bot_access",
      "im:message",
      "im:message.group_at_msg:readonly",
      "im:message.p2p_msg:readonly",
      "im:message:readonly",
      "im:message:send_as_bot",
      "im:resource"
    ],
    "user": ["aily:file:read", "aily:file:write", "im:chat.access_event.bot_p2p_chat:read"]
  }
}
```

1. 事件订阅：进入「事件与回调」→ 订阅方式选择「使用长连接接收事件」→ 添加核心事件 `im.message.receive_v1`（无此事件则无法接收消息）；
2. 版本发布：进入「版本管理与发布」→ 创建版本并发布（所有配置仅发布后生效）；
3. 配对绑定：飞书向机器人发消息，获取配对码 → 终端执行以下命令，完成绑定：

```powershell
openclaw pairing approve feishu 配对码
```

补充：若提示「未建立长连接」，等待1-2分钟再保存配置，确认网关正常运行即可。

## 四、常用操作命令汇总（对话实操+教程，新手必备）

![1_1773231502488.jpg](/images/1_1773231502488.jpg)

整理对话中用到的所有核心命令，按「启动/配置/排错」分类，可直接复制使用：

### 1. 核心启动命令

```powershell
# 启动网关（核心命令，最新版唯一启动方式）
openclaw gateway
# 强制启动网关（解决端口占用，对话中高频使用）
openclaw gateway --force
# 重启网关（刷新插件/机器人状态）
openclaw gateway restart
# 打开仪表盘（自动带令牌，快速访问）
openclaw dashboard
```

### 2. 配置/管理命令

```powershell
# 快速初始化配置（新手推荐）
openclaw onboard --flow quickstart
# 重置/修改模型/API 配置
openclaw config
# 生成网关令牌（认证必备）
openclaw doctor --generate-gateway-token
# 安装插件（如飞书插件）
openclaw plugins install 插件名称
# 飞书配对绑定
openclaw pairing approve feishu 配对码
# 查看渠道/网关健康状态
openclaw status --deep
# 重置龙虾（保留CLI，清空旧配置，解决配置混乱问题）
openclaw reset
```

### 3. 排错/日志命令（对话中高频使用）

```powershell
# 系统诊断（排查环境/配置问题）
openclaw doctor
# 实时查看日志（定位所有报错，最常用）
openclaw logs --follow
# 查看所有支持的命令（解决命令不识别问题）
openclaw --help
# 验证龙虾版本
openclaw --version
```

## 五、后续简化使用流程（对话实操总结）

![3_1773231502526.jpg](/images/3_1773231502526.jpg)

首次部署完成后，无需重复执行初始化、生成令牌等操作，每次使用仅需两步，高效便捷：

1. 打开 PowerShell/CMD，执行 `openclaw gateway --force` 启动网关（保持窗口打开，不可关闭）；
2. 新开终端执行 `openclaw dashboard`，或直接打开浏览器「收藏的带令牌仪表盘 URL」，即可正常使用。

## 六、常见问题与避坑指南（全部来自对话实操）

![4_1773231502457.jpg](/images/4_1773231502457.jpg)


汇总对话中用户遇到的所有报错及解决方案，覆盖高频坑点，遇到问题可直接对应查找：

| 报错现象                                   | 核心原因                                     | 解决方案                                                                                       |
| ------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| error: unknown command 'serve'/'start'     | 最新版（2026.3.8）无此命令，为旧版本指令     | 使用核心命令`openclaw gateway` 启动                                                            |
| 仪表盘加载空白/URL 拼写错误                | URL 缺少令牌、网关未运行、浏览器/防火墙拦截  | 用`openclaw dashboard --no-open` 生成带令牌 URL，无痕模式访问，关闭代理/临时防火墙             |
| 电报：不支持类型：。使用RAW模式            | 龙虾无法识别电报部分消息类型（贴纸、动图等） | 在电报连接器中开启 RAW 模式，或过滤不支持的消息类型                                            |
| 安装卡顿/超时                              | npm 默认国外源，下载速度慢                   | 切换阿里云国内镜像`npm config set registry https://registry.npmmirror.com`，清理缓存后重新安装 |
| Config validation failed: Unrecognized key | 配置文件存在无效参数，与当前版本不兼容       | 打开`config.json` 删除无效配置行，或执行 `openclaw reset` 重置配置                             |
| 未授权：缺少网关令牌                       | 未生成网关令牌，或 URL 未携带令牌            | 执行`openclaw doctor --generate-gateway-token` 生成令牌，用带令牌 URL 访问仪表盘               |

## 七、部署成功验证标准（对话实操总结）

![7_1773231502593.jpg](/images/7_1773231502593.jpg)


完成所有操作后，确认以下3点，即为部署成功，可正常使用龙虾的所有功能：

1. 网关服务：终端无报错，持续显示 `Gateway listening on ws://127.0.0.1:18789`；
2. 仪表盘：正常加载，「Gateway」状态为「Online」，可进入聊天/配置界面；
3. 渠道功能：电报/飞书配置后，能正常接收/发送自然语言消息，无类型/连接报错。

