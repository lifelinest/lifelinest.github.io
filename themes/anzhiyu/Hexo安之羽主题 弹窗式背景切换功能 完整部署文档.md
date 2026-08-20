# Hexo安之羽主题 弹窗式背景切换功能 完整部署文档

## 一、功能介绍

本功能基于WinBox弹窗插件开发，适配**Hexo 安之羽（Anzhiyu）主题**，实现博客弹窗化切换背景效果，支持电脑壁纸、手机壁纸、渐变背景、纯色背景切换，自带本地缓存功能，刷新页面保留用户设置，可一键恢复默认背景，弹窗支持窗口自适应、最大化适配等功能。

修复原项目最小化切换页面弹窗变白、滚动条异常等已知bug，完美兼容安之羽主题明暗模式。

## 二、部署前置条件

- 已搭建完成Hexo博客，正常支持本地运行、部署上线

- 博客主题为：安之羽（Anzhiyu）

- 无主题核心文件修改冲突，保留主题原始配置结构

## 三、完整部署步骤（逐条复制即用）

### 步骤1：添加右侧悬浮切换按钮

文件路径：`themes/anzhiyu/layout/includes/rightside\.pug`

在文件原有按钮when判断区块末尾，新增以下代码，用于生成背景切换按钮：

```pug
when 'bg'
  button(type="button" title="切换背景" onclick="toggleWinbox()")
    i.fas.fa-desktop
```

### 步骤2：主题配置开启按钮、关闭默认背景冲突

文件路径：`themes/anzhiyu/\_config\.yml`

1、找到右侧按钮配置，将bg加入显示列表：

```yaml
rightside_item:
  show: ['toc', 'darkmode', 'bg']
```

2、关闭主题默认背景，避免功能冲突：

```yaml
background: null
```

### 步骤3：站点全局资源注入（核心配置）

文件路径：**站点根目录**`\_config\.yml`

找到inject注入节点，替换为以下代码，自动全局加载样式、弹窗插件、功能脚本：

```yaml
inject:
  head:
    - <link rel="stylesheet" href="/css/bgswitch.css">
  bottom:
    - <script src="https://cdn.jsdelivr.net/gh/nextapps-de/winbox/dist/winbox.bundle.min.js"></script>
    - &lt;script src="/js/bgswitch.js"&gt;&lt;/script&gt;
```

#### 配置作用详解

- head引入css：加载背景切换弹窗、预览按钮的样式，解决界面错位、样式丑陋、明暗模式不适配问题

- 第一行js：引入WinBox弹窗核心插件，实现弹窗弹出、缩放、最大化、自适应等功能

- 第二行js：引入自定义背景切换核心逻辑，实现换图、缓存、重置、窗口适配功能

- inject优势：无需修改主题源码，主题更新不丢失配置，全站所有页面自动生效

### 步骤4：新建自定义样式文件

新建文件：`source/css/bgswitch\.css`，完整粘贴以下代码：

```css
.winbox {
    border-radius: 12px;
    overflow: hidden;
}
.wb-full {
    display: none;
}
.wb-min {
    background-position: center;
}
[data-theme='dark'] .wb-body,
[data-theme='dark'] #changeBgBox {
    background: #333 !important;
}
.bgbox {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
}
.pimgbox,.imgbox,.box {
    width: 166px;
    margin: 10px;
    background-size: cover
}
.pimgbox,.imgbox {
    border-radius: 10px;
    overflow: hidden;
}
.pimgbox {height: 240px;}
.imgbox {height: 95px;}
.box {height: 100px;}
@media screen and (max-width: 768px) {
    .pimgbox,.imgbox,.box {
        height: 73px;
        width: 135px;
    }
    .pimgbox {height: 205px;}
    .wb-min {display: none;}
    #changeBgBox .wb-body::-webkit-scrollbar {display: none;}
}
```

### 步骤5：新建核心功能脚本文件

新建文件：`source/js/bgswitch\.js`，完整粘贴以下代码：

```javascript
function saveData(name, data) {
    localStorage.setItem(name, JSON.stringify({ 'time': Date.now(), 'data': data }))
}
function loadData(name, time) {
    let d = JSON.parse(localStorage.getItem(name));
    if (d) {
        let t = Date.now() - d.time
        if (t < (time * 60 * 1000) && t > -1) return d.data;
    }
    return 0;
}
try {
    let data = loadData('blogbg', 1440)
    if (data) changeBg(data, 1)
    else localStorage.removeItem('blogbg');
} catch (error) { localStorage.removeItem('blogbg'); }

function changeBg(s, flag) {
    let bg = document.getElementById('web_bg')
    if (s.charAt(0) === '#') {
        bg.style.backgroundColor = s
        bg.style.backgroundImage = 'none'
    } else {
        bg.style.backgroundImage = s
    }
    if (!flag) saveData('blogbg', s)
}
var winbox = ''
function createWinbox() {
    let div = document.createElement('div')
    document.body.appendChild(div)
    winbox = WinBox({
        id: 'changeBgBox',
        index: 999,
        title: "切换背景",
        x: "center",
        y: "center",
        minwidth: '300px',
        height: "60%",
        background: '#49b1f5',
        onmaximize: () => {
            div.innerHTML = `<style>body::-webkit-scrollbar {display: none;}div#changeBgBox {width: 100% !important;}</style>`
        },
        onrestore: () => { div.innerHTML = '' }
    });
    winResize();
    window.addEventListener('resize', winResize)
    winbox.body.innerHTML = `
    <div id="article-container" style="padding:10px;">
    <p><button onclick="localStorage.removeItem('blogbg');location.reload();" style="background:#5fcdff;display:block;width:100%;padding: 15px 0;border-radius:6px;color:white;"><i class="fa-solid fa-arrows-rotate"></i> 点我恢复默认背景</button></p>
    <h2>手机壁纸</h2>
    <div class="bgbox">
    <a href="javascript:;" class="pimgbox" style="background-image:url(https://img.vm.laomishuo.com/image/2021/12/2021122715170589.jpeg)" onclick="changeBg('url(https\\://img.vm.laomishuo.com/image/2021/12/2021122715170589.jpeg)')"></a>
    </div>
    <h2>电脑壁纸</h2>
    <div class="bgbox">
    <a href="javascript:;" class="imgbox" style="background-image:url(https://cn.bing.com/th?id=OHR.GBRTurtle_ZH-CN6069093254_1920x1080.jpg)" onclick="changeBg('url(https\\://cn.bing.com/th?id=OHR.GBRTurtle_ZH-CN6069093254_1920x1080.jpg)')"></a>
    </div>
    <h2>渐变背景</h2>
    <div class="bgbox">
    <a href="javascript:;" class="box" style="background: linear-gradient(to right, #eecda3, #ef629f)" onclick="changeBg('linear-gradient(to right, #eecda3, #ef629f)')"></a>
    </div>
    <h2>纯色背景</h2>
    <div class="bgbox">
    <a href="javascript:;" class="box" style="background: #7D9D9C" onclick="changeBg('#7D9D9C')"></a>
    </div>
    </div>
    `;
}
function winResize() {
    let box = document.querySelector('#changeBgBox')
    if (!box || box.classList.contains('min') || box.classList.contains('max')) return
    var offsetWid = document.documentElement.clientWidth;
    if (offsetWid <= 768) {
        winbox.resize(offsetWid * 0.95 + "px", "90%").move("center", "center");
    } else {
        winbox.resize(offsetWid * 0.6 + "px", "70%").move("center", "center");
    }
}
function toggleWinbox() {
    if (document.querySelector('#changeBgBox')) winbox.toggleClass('hide');
    else createWinbox();
}
```

## 四、运行测试命令

部署完成后，执行清空缓存、本地启动命令，避免旧代码残留：

```bash
hexo clean && hexo s
```

访问本地博客，右侧悬浮栏出现桌面图标，点击即可弹出背景切换窗口，功能正常即部署成功。

## 五、功能特性与修复说明

- 缓存功能：背景设置自动本地缓存，有效期24小时，刷新页面不重置

- bug修复：解决最小化切换页面弹窗变白、页面滚动条异常问题

- 自适应：适配电脑、手机端窗口大小，移动端自动优化预览尺寸

- 明暗适配：兼容安之羽主题深色/浅色模式，弹窗样式自动适配

- 一键重置：支持一键清除缓存，恢复博客默认背景

## 六、自定义拓展方法

如需新增自定义壁纸、渐变、纯色背景，直接编辑`bgswitch\.js` 文件中 `winbox\.body\.innerHTML` 内的代码块，按照现有格式复制添加即可。

注意：图片链接中 `:` 符号前必须添加转义符 `\\`，否则功能失效。

## 七、全局重要注意事项

- 本文档**专属适配安之羽（Anzhiyu）主题**，不兼容Butterfly等其他主题，请勿混用配置

- 必须关闭主题默认背景配置（background: null），否则会出现双层背景、切换失效问题

- 所有自定义文件需放置在 `source/css/` 和 `source/js/` 目录下，路径不可修改

- 主题自带字体图标库，无需额外引入图标资源，按钮图标可正常显示

- 修改配置后必须执行 `hexo clean` 清空缓存，否则新功能不生效

- inject注入配置为全局核心配置，删除后会直接导致弹窗、样式、换图功能全部失效

> （注：文档部分内容可能由 AI 生成）
