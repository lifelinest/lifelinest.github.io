# 图床管理规范（cloudflare-img-bzb.pages.dev）

> 用途：统一图片上传与归类标准，杜绝「图床变垃圾场」。
> 适用范围：所有需要把图片传到 `https://cloudflare-img-bzb.pages.dev` 的工作（博客、关于页、友链、足迹、作品集……）。
> 凭证：`Blog/cdn-token.local`（已 gitignore，读取后不回显）。
> 映射表：`Blog/.tmp/imgbed-map.json`（本地文件名 → 图床 URL，工具自动维护）。

---

## 一、核心原则

1. **按「用途」分类，不按「时间/来源」乱堆。** 顶层目录 = 图片干什么用；子目录按年份/月份/标识细分。
2. **文件名必须语义化。** 禁止 `b00`、`c03`、`o22`、`image1` 这类无含义编码（历史遗留见第四节）。
3. **现有 live 图只审计、不擅动。** 任何已被线上页面引用的图，挪动/删除会断链，必须同步改引用后才可动（见红线）。
4. **中文路径必须百分号编码。** 写入 `<img src>` 直接用即可；写入 CSS `url()` / JS 模板变量时必须先 `encodeURIComponent`（否则中文路径在 CSS 里直接失效）。
5. **上传即验真。** 上传后必须确认：HTTP 200 + 真实图片魔数 + 字节数与本地一致（图床对无效路径会返 200+HTML 回退页，假成功陷阱）。

---

## 二、标准目录树（顶层 = 用途）

```
file/                                  # 图床根
├── 文章图/                             # 博客文章正文配图
│   └── <年>/<月>/<文章标识>/            # 文章标识用 abbrlink 或英文 slug，禁用中文标题（含 ? + 空格会断 URL）
│       例：文章图/2025/09/9641524/
├── 封面图/                             # 文章/页面封面、社交分享 OG 图
│   └── <年>/<月>/
├── 头像/                               # 作者/品牌头像及变体
│   ├── 默认/                           # 站点默认头像（_config 里 site.avatar）
│   └── 节日/                           # avatar-holiday.js 调用的节日限定头像
├── 主题/                               # 站点主题视觉资源（非内容）
│   ├── 导航图标/                       # 返回菜单/侧栏图标（原 theme/back-menu）
│   ├── 背景/                           # 页面/卡片背景图
│   └── 装饰/                           # 装饰性小图
├── 系统/                               # 功能性、数据驱动的非内容图
│   ├── 打赏/                           # 微信/支付宝收款码
│   ├── 关于页/                         # 关于页各模块（MBTI 背景+小人、旅行、技能、番剧、音乐…）
│   ├── 足迹/                           # 足迹地图相关图
│   ├── 设备/                           # 装备页（equipment.yml）
│   ├── 相册/                           # 相册模块
│   └── 友链/                           # 友链站点 logo/头像（link.yml 的 siteshot）
├── 作品集/                             # 作品/项目展示图（workshop.json / designs.json）
└── 临时/                               # 临时中转，禁止长期保留，定期清空
```

### 分类速查表

| 用途 | 目录 | 典型来源 |
|---|---|---|
| 文章内插图 | `文章图/<年>/<月>/<slug>/` | 博文正文 `![]()` |
| 封面 / OG | `封面图/<年>/<月>/` | front-matter `cover`、og_image |
| 作者头像 | `头像/默认/` | `_config.anzhiyu.yml` `site.avatar` |
| 节日头像 | `头像/节日/` | `source/js/avatar-holiday.js` |
| 导航图标 | `主题/导航图标/` | `_config.anzhiyu.yml` 返回菜单 `icon` |
| 主题背景/装饰 | `主题/背景/`、`主题/装饰/` | 主题视觉 |
| 收款码 | `系统/打赏/` | 关于页/打赏 `reward` |
| 关于页模块图 | `系统/关于页/` | `source/_data/about.yml` |
| 足迹地图 | `系统/足迹/` | `source/json/footprint_data.json`、`pf-index.json` |
| 装备图 | `系统/设备/` | `source/_data/equipment.yml` |
| 相册 | `系统/相册/` | `source/album/index.md` |
| 友链截图 | `系统/友链/` | `source/_data/link.yml` `siteshot` |
| 作品展示 | `作品集/` | `source/_data/workshop.json` |
| 临时 | `临时/` | 一次性中转 |

---

## 三、命名规范

1. **目录**：`<年>` 用 4 位阿拉伯数字（2025，非「2025年」）；`<月>` 用 2 位（09，非「九月」）。降低编码出错率。
2. **文件名**：`<语义名>.<ext>`，全小写、连字符 `-` 分隔、无空格、无中文、无括号。
   - ✅ `hexo-seo-guide-01.webp`、`wechat-pay.png`、`mbti-bg.png`
   - ❌ `b08.jpeg`、`截图123.png`、`图中图 (6).webp`
3. **扩展名**：webp 优先（体积小）；透明图用 png；动图 gif/webp。
4. **上传前本地预处理**（必做）：
   - 裁掉水印/多余边距；
   - 体积压到合理范围（正文图 ≤ 200KB、封面 ≤ 300KB、图标 ≤ 50KB）；
   - 文件名先改成语义名再传。

---

## 四、现有图片审计映射（只记录，不擅动）

| 现有目录 | 条数(约) | 是否 live | 规范后应归位 | 处理建议 |
|---|---|---|---|---|
| `文章/<年>/<月>/<中文标题>/` | 25 | ✅ 文章引用 | `文章图/<年>/<月>/<slug>/` | 历史文章保留；**新文章用 slug** |
| `theme/back-menu/` | 6 | ✅ 配置引用 | `主题/导航图标/` | 保留；新图标走 `主题/导航图标/` |
| `系统/头像/` | 1 | ✅ 配置引用 | `头像/默认/` | 保留 |
| `系统/打赏/` | 2 | ✅ 配置引用 | `系统/打赏/` | 已合规 |
| `系统/MBTI/`、`系统/travel/` | 2 | ✅ 关于页(编码 URL) | `系统/关于页/` | 保留 |
| `posts/legacy/` | ~70 | ✅ equipment/link/文章引用 | 拆到 `系统/设备/`、`系统/友链/`、`文章图/` | **历史遗留、命名无语义；live 不动，待专项整理** |
| 相册/足迹/友链/作品集 | 若干 | ✅ 各 json/md 引用 | 对应 `系统/*` 或 `作品集/` | 保留 |

> ⚠️ `posts/legacy/` 是最大雷区：文件名 `b00/b01/c00/o04…` 完全无含义，但被 `equipment.yml`、`link.yml`、多篇文章引用。**整理它必须先批量更新这些引用文件，单独立项、用户批准后再做，绝不在本次顺手挪。**

---

## 五、上传标准流程（工具已内置规范）

```bash
# 1) 先看有哪些分类预设
node tools/upload-to-imgbed.js --list-categories

# 2) 按分类上传（自动落到规范目录，无需手敲 --folder）
#    文章图：--category article --sub 2025/09/9641524
#    导航图标：--category theme-nav
#    关于页图：--category about
node tools/upload-to-imgbed.js \
  --src=D:/1/1/.tmp/upload \
  --category article --sub 2025/09/9641524 \
  --only=hexo-seo-guide-01.webp \
  --apply

# 3) 干跑先预览（不加 --apply，只看会传到哪）
node tools/upload-to-imgbed.js --src=... --category about

# 4) 自定义目录（高级）：直接 --folder，但会校验是否在规范树内，越界会警告
node tools/upload-to-imgbed.js --src=... --folder=头像/默认 --apply
```

工具行为：
- `--category <key>` 映射到第二节的规范目录；
- `--sub <path>` 追加子路径（文章图必填年/月/slug）；
- 上传后**自动三重验真**（HTTP 200 + 图片魔数 + 字节数一致），不一致会报错；
- 映射写入 `Blog/.tmp/imgbed-map.json`。

---

## 六、配图 SEO 规范（配图时必须自动套用，不依赖提醒）

> 适用：所有博客文章正文配图（含「做中学」系列）。目标：图片既服务读者，也服务搜索引擎与 AI 源引用。

1. **来源**：用 AI 生图（概念/场景图）或真实合规图源（Unsplash 等）；**禁止自制 SVG 矢量图当配图**（除非用户明确要矢量示意图）。
2. **上传**：一律走图床 `文章图/<年>/<月>/<slug>/`（`--category article --sub <年>/<月>/<slug>`）。
3. **文件名语义化（硬性）**：上传前先把本地文件改名为 `<语义名>.<ext>`（如 `ai-reception-front-desk.webp`、`rag-hybrid-retrieval.webp`），禁用 AI 工具默认的长串 prompt slug / 时间戳前缀。图床名即语义名，利于图片搜索与可维护性。
4. **alt 必填**：`![<描述性中文+关键词>](url)`，如 `![AI 接待前台：永不离线智能询盘助手](url)`。图片 SEO 第一要素，不可省。
5. **title 建议填**：`![alt](url "悬停说明")` 形式，给鼠标悬停提示并辅助可访问性 / SEO。
6. **尺寸防 CLS**：提供 `width`/`height` 或 `aspect-ratio`，避免布局抖动（Core Web Vitals）。正文图优先用 HTML `<img src alt title width height loading>` 或主题能力补齐。
7. **懒加载**：非首屏正文图加 `loading="lazy"`（首屏 / 封面不加，避免拖慢 LCP）。
8. **体积 / 格式**：webp 优先；正文图 ≤ 200KB，封面 ≤ 300KB。
9. **结构化数据（增强）**：文章 JSON-LD 含 `ImageObject`（封面 + 关键正文图），提升富媒体展现概率。
10. **验真闭环**：上传即三重验真；部署前 `npm run imgbed:check` 拦截断链。

## 七、预警方案（改路径必做 + 部署前拦截）

> 核心诉求：**图床路径一旦变动，本地所有引用必须同步改动；绝不允许线上图片打不开。**
> 两个专用工具已就绪（`tools/` 下），配套 npm 脚本：`npm run imgbed:check` / `npm run imgbed:relocate`。

### 7.1 工具一：链接验真（预警拦截）
`tools/check-imgbed-links.js` —— 扫描某目录里全部图床 URL，逐个验真（HTTP 200 + 图片魔数，挡住图床「200 + HTML 回退页」假成功）。
- 默认扫 `public/`（线上实际产物）；`--dir=source` 扫源文件（提前拦「将来部署会断」的链接）。
- 带本地缓存（24h）+ 并发控制 + 网络瞬断自动重试（瞬断不污染基线）。
- **任一断链即以 `exit 1` 退出**，可直接作为部署前拦截闸。

```bash
npm run imgbed:check                      # 扫 public/ 全量验真
node tools/check-imgbed-links.js --dir=source        # 扫源文件（含草稿未构建引用）
node tools/check-imgbed-links.js --dir=public --sample=20   # 抽样快速冒烟
node tools/check-imgbed-links.js --dir=public --no-cache   # 忽略缓存强制重验
```

### 7.2 工具二：路径同步（改路径一键改写）
`tools/relocate-imgbed.js` —— 图床上的某张/某目录图被移动时，**一次性改写全仓所有引用**，并自动逐段百分号编码（杜绝中文路径在 CSS/JS 失效）。

```bash
# 默认干跑（只打印将改什么，绝不碰文件）
node tools/relocate-imgbed.js --from=posts/legacy/b00 --to=系统/设备/b00
# 整目录迁移（旧文章目录 -> 规范目录）
node tools/relocate-imgbed.js --from=文章/2026年/六月 --to=文章图/2026/06
# 确认无误后真正写盘
node tools/relocate-imgbed.js --from=文章/2026年/六月 --to=文章图/2026/06 --apply
```
- `--from` / `--to` 用**解码后的可读路径片段**（如 `系统/MBTI`、`文章/2026年/六月`），工具内部自动编码。
- 扫描范围：仓库内 `source/ tools/ scripts/` 及根 `_config*.yml`；跳过 `public/ backup/ .deploy_git/ .tmp/ node_modules`（产物与备份不在改写范围）。
- 同时更新 `.tmp/imgbed-map.json` 的 URL 映射。

### 7.3 标准作业流（SOP）—— 移动/重命名任何 live 图
1. **先确保新路径已存在**：用 `upload-to-imgbed.js` 把图传到新路径（上传即三重验真）。
2. **干跑确认影响面**：`relocate-imgbed.js --from=旧 --to=新`，看会改多少个文件/引用。
3. **改路径**：加 `--apply` 真正写盘（会自动重编码，CSS/JS 安全）。
4. **核验新路径全部可达**：`check-imgbed-links.js --dir=public`（断链会 `exit 1` 拦截）。
5. **再部署**（走既定部署流程，且须先经你确认）。

### 7.4 部署前闸
- 把 `npm run imgbed:check` 与既有的 `npm run seo:check` 并列，作为**发布清单的必过项**。
- 任何 live 图移动**必须经过 7.3 流程**，禁止手改个别文件（极易漏改导致部分页面图片打不开）。

---

## 八、红线

1. **不擅自删除/移动任何线上 live 图。** 尤其 `posts/legacy/`（被多文件引用）。
2. **绝不在 CSS/JS 模板里写未编码的中文路径。** 必须 `encodeURIComponent` 后再拼。
3. **不在 C 盘落大图。** 临时上传目录一律 `D:/1/1/.tmp/`。
4. **不重复上传同一张图。** 上传前先查 `imgbed-map.json` 是否已有。
5. **文件名语义化是硬要求**，无含义编码图一律打回重命名。
