# 足迹地图功能文件清理建议

## 一、文件分析结果

### 必需文件（核心功能实现）

1. **d:\1\1\Blog\source\FootprintMap\index.md**
   - 功能：足迹地图页面的入口文件，包含Front Matter配置
   - 必要性：必要，作为页面的主要入口

2. **d:\1\1\Blog\source\_data\footprints.json**
   - 功能：存储足迹数据的主文件
   - 必要性：必要，包含所有足迹数据

3. **d:\1\1\Blog\scripts\footprint-manager.js**
   - 功能：足迹数据管理和验证脚本
   - 必要性：必要，用于数据验证和管理

4. **d:\1\1\Blog\themes\anzhiyu\layout\includes\page\footprintmap.pug**
   - 功能：主要的足迹地图页面模板
   - 必要性：必要，定义了页面结构和渲染逻辑

5. **d:\1\1\Blog\source\js\footprintmap.js**
   - 功能：足迹地图的主要JavaScript实现
   - 必要性：必要，提供交互功能和地图初始化

### 冗余/过时/可删除文件

1. **d:\1\1\Blog\themes\anzhiyu\layout\footprintmap.ejs**
   - 问题：重复的足迹地图页面模板，与pug版本冲突
   - 建议：删除，使用pug版本的模板

2. **d:\1\1\Blog\source\FootprintMap\footprintmap.css**
   - 问题：重复的CSS文件，样式应该在主题中管理
   - 建议：删除，样式已在主题模板中定义

3. **d:\1\1\Blog\source\FootprintMap\FootprintMap_backup.md**
   - 问题：备份文件，包含重复的HTML和JavaScript代码
   - 建议：删除，这是旧版本的备份

4. **d:\1\1\Blog\source\json\footprint-map-example.html**
   - 问题：示例文件，不是生产环境需要的
   - 建议：删除，这只是开发过程中的示例

5. **d:\1\1\Blog\source\footprintmap_usage_guide.md**
   - 问题：使用指南文档，可能已经过时
   - 建议：如有必要可保留，否则删除

6. **d:\1\1\Blog\source\test-map-simple.md**
   - 问题：测试文件，不是生产环境需要的
   - 建议：删除，这只是测试文件

## 二、清理建议

1. 删除所有标记为冗余/过时的文件
2. 确保只保留一个版本的页面模板（pug版本）
3. 样式应统一在主题中管理
4. 数据存储应集中在footprints.json中

## 三、确认

请确认是否同意以上清理建议，特别是删除以下文件：
- d:\1\1\Blog\themes\anzhiyu\layout\footprintmap.ejs
- d:\1\1\Blog\source\FootprintMap\footprintmap.css
- d:\1\1\Blog\source\FootprintMap\FootprintMap_backup.md
- d:\1\1\Blog\source\json\footprint-map-example.html
- d:\1\1\Blog\source\test-map-simple.md
- d:\1\1\Blog\source\footprintmap_usage_guide.md（可选）

确认后，我将执行清理操作。