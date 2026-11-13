/* 统一标签体系 —— 人工维护的注册表（T4）
 *
 * 作用：把三页各自"各写各的"标签，收敛成一套词汇表。
 *   - name   规范名（展示用）
 *   - alias  别名/异写，运行时会归一到 name（如 UI → UI 设计）
 *   - group  归属分组（用于标签总览分组与配色）
 *
 * 生成：node tools/generate_tags.js  →  source/_data/tags.json
 * 未登记的新标签会被自动收录（group: 'other'），不会丢。
 */
module.exports = {
  groups: [
    { key: 'tech', name: '技术栈', color: '#4f7cff' },
    { key: 'lang', name: '语言', color: '#7c5cff' },
    { key: 'domain', name: '领域', color: '#0ea5a5' },
    { key: 'form', name: '形态', color: '#e08a1e' },
    { key: 'style', name: '风格', color: '#d9538a' },
    { key: 'craft', name: '工艺 / 材质', color: '#8a6a4a' },
    { key: 'other', name: '其他', color: '#8b93a7' }
  ],
  tags: [
    /* ---------- 技术栈 ---------- */
    { name: 'WordPress', group: 'tech', alias: ['wordpress', 'wp'] },
    { name: 'PHP', group: 'tech', alias: ['php'] },
    { name: 'React', group: 'tech', alias: ['react'] },
    { name: 'Vue', group: 'tech', alias: ['vue', 'Vue3', 'Vue 3'] },
    { name: 'Vite', group: 'tech', alias: ['vite'] },
    { name: 'Tailwind', group: 'tech', alias: ['tailwind', 'Tailwind CSS'] },
    { name: 'GSAP', group: 'tech', alias: ['gsap'] },
    { name: 'Hexo', group: 'tech', alias: ['hexo'] },
    { name: 'Pug', group: 'tech', alias: ['pug', 'Jade'] },
    { name: 'CSS 变量', group: 'tech', alias: ['css变量', 'CSS变量', 'CSS Variables'] },
    { name: 'MySQL', group: 'tech', alias: ['mysql', 'SQL'] },
    { name: 'ESP32', group: 'tech', alias: ['esp32'] },
    { name: 'Arduino', group: 'tech', alias: ['arduino'] },
    { name: 'WS2812', group: 'tech', alias: ['ws2812', 'WS2812B'] },
    { name: 'MQTT', group: 'tech', alias: ['mqtt'] },
    { name: 'Blender', group: 'tech', alias: ['blender'] },
    { name: 'Fusion 360', group: 'tech', alias: ['fusion360', 'Fusion360'] },
    { name: 'GSAP / Lenis', group: 'tech', alias: ['Lenis'] },

    /* ---------- 语言（热榜） ---------- */
    { name: 'Python', group: 'lang', alias: ['python'] },
    { name: 'JavaScript', group: 'lang', alias: ['javascript', 'JS'] },
    { name: 'TypeScript', group: 'lang', alias: ['typescript', 'TS'] },
    { name: 'Go', group: 'lang', alias: ['golang'] },
    { name: 'Rust', group: 'lang', alias: ['rust'] },
    { name: 'Java', group: 'lang', alias: ['java'] },
    { name: 'C++', group: 'lang', alias: ['cpp', 'C++'] },
    { name: 'C', group: 'lang', alias: [] },
    { name: 'Shell', group: 'lang', alias: ['shell', 'Bash'] },
    { name: 'HTML', group: 'lang', alias: ['html'] },
    { name: 'LLVM', group: 'lang', alias: [] },
    { name: 'Swift', group: 'lang', alias: [] },
    { name: 'Mojo', group: 'lang', alias: [] },

    /* ---------- 领域 ---------- */
    { name: 'AI 大模型', group: 'domain', alias: ['LLM', 'llm', '大模型'] },
    { name: 'AI 应用', group: 'domain', alias: ['AI 对话', 'AI对话', 'AIGC', 'Agent'] },
    { name: '前端', group: 'domain', alias: ['frontend', 'Front-end'] },
    { name: '后端', group: 'domain', alias: ['backend', 'Back-end'] },
    { name: '开发工具', group: 'domain', alias: ['devtools', 'DevTools', '工具链'] },
    { name: '系统工具', group: 'domain', alias: ['系统软件'] },
    { name: '游戏开发', group: 'domain', alias: ['游戏引擎', 'Game'] },
    { name: '数据可视化', group: 'domain', alias: ['数据', '图表', '看板数据'] },
    { name: '物联网', group: 'domain', alias: ['IoT', 'iot'] },
    { name: 'UI 设计', group: 'domain', alias: ['UI', 'ui', 'UI设计', '界面设计'] },
    { name: '品牌视觉', group: 'domain', alias: ['品牌'] },
    { name: '插画创作', group: 'domain', alias: ['插画'] },
    { name: '3D 建模', group: 'domain', alias: ['3D建模', '建模', '3D'] },
    { name: '3D 打印', group: 'domain', alias: ['3D打印', '3d打印', '3D printing'] },
    { name: '平面物料', group: 'domain', alias: [] },
    { name: 'IP 形象', group: 'domain', alias: ['IP', 'ip'] },
    { name: '工业设计', group: 'domain', alias: [] },

    /* ---------- 形态 ---------- */
    { name: '海报', group: 'form', alias: ['poster'] },
    { name: 'banner', group: 'form', alias: ['Banner', '横幅'] },
    { name: '看板', group: 'form', alias: ['Dashboard', '仪表盘'] },
    { name: '地图', group: 'form', alias: ['足迹地图', '高德地图', 'Amap', 'amap'] },
    { name: '角色', group: 'form', alias: [] },
    { name: '表情', group: 'form', alias: ['表情包'] },
    { name: '原型', group: 'form', alias: ['prototype'] },
    { name: '手板', group: 'form', alias: [] },
    { name: '架构设计', group: 'form', alias: ['架构'] },

    /* ---------- 风格 ---------- */
    { name: '渐变', group: 'style', alias: ['gradient'] },
    { name: '深色', group: 'style', alias: ['暗色', 'Dark', '深色模式'] },
    { name: '撞色', group: 'style', alias: [] },
    { name: '视觉', group: 'style', alias: [] },
    { name: '配色', group: 'style', alias: ['色彩'] },
    { name: '动效', group: 'style', alias: ['动画', 'Animation'] },
    { name: '交互', group: 'style', alias: ['交互设计', 'Interaction'] },
    { name: '改版', group: 'style', alias: ['重构'] },
    { name: '活动', group: 'style', alias: ['活动页'] },

    /* ---------- 工艺 / 材质 ---------- */
    { name: '植鞣革', group: 'craft', alias: [] },
    { name: '烫金', group: 'craft', alias: [] },
    { name: '手工', group: 'craft', alias: ['手作'] },
    { name: '轴承', group: 'craft', alias: [] },
    { name: '卡扣结构', group: 'craft', alias: ['卡扣'] },
    { name: '结构', group: 'craft', alias: [] },
    { name: '渲染', group: 'craft', alias: ['render'] }
  ]
};
