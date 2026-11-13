/* T1 数据对齐：设计图仓
   1) 分类按规格 7 类重映射（UI设计/品牌视觉/插画创作/3D建模/平面物料/工业设计/交互原型）
   2) 补 views（浏览）/ likes（点赞）/ type（项目|素材）—— 供 排序 + 类型筛选
   3) 追加 3 条占位作品，使 3D建模/工业设计/交互原型 三类都有内容
*/
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..', 'source', '_data', 'designs.json');
const data = JSON.parse(fs.readFileSync(P, 'utf8'));

/* 1) 分类重映射 */
const catMap = {
  'd-001': 'UI设计',
  'd-002': '插画创作',
  'd-003': 'UI设计',
  'd-004': '品牌视觉',
  'd-005': '插画创作',
  'd-006': '平面物料'
};

/* 2) 浏览/点赞/类型 */
const extra = {
  'd-001': { views: 1284, likes: 96, type: '项目' },
  'd-002': { views: 2130, likes: 187, type: '素材' },
  'd-003': { views: 864, likes: 71, type: '项目' },
  'd-004': { views: 1532, likes: 112, type: '素材' },
  'd-005': { views: 1917, likes: 231, type: '项目' },
  'd-006': { views: 706, likes: 54, type: '素材' }
};

data.forEach(function (d) {
  if (catMap[d.id]) d.category = catMap[d.id];
  if (extra[d.id]) { d.views = extra[d.id].views; d.likes = extra[d.id].likes; d.type = extra[d.id].type; }
});

/* 3) 追加 3 条（分类占位） */
const IMG = '/images/portfolio/';
data.push({
  id: 'd-007', title: '智能音箱 3D 建模', desc: '产品级 3D 建模与材质渲染，用于概念提案。',
  image: IMG + 'design-07.svg', category: '3D建模', tags: ['3D', '建模', '渲染'], tools: ['Blender', 'KeyShot'],
  date: '2026-08-05', width: 1600, height: 1000, client: '个人作品', role: '3D 建模 + 渲染',
  views: 1120, likes: 88, type: '项目',
  versions: [
    { v: 'v1.0', date: '2026-07-28', note: '白模阶段：确认比例与倒角。' },
    { v: 'v1.1', date: '2026-08-05', note: '定稿：布光与材质分区，出概念渲染图。' }
  ],
  review: {
    summary: '3D 建模的难点不在建模本身，而在「看起来像真做出来的」。倒角半径和布光决定了产品感。',
    points: [
      '倒角半径 ≥ 1.5mm，否则渲染边缘发飘、像塑料玩具。',
      '主光 + 补光 + 边缘光三灯起底，比堆材质贴图有效。',
      '渲染前先出白模看体块，避免材质掩盖结构问题。'
    ]
  },
  inspiration: [{ title: '无印良品产品摄影', note: '极简白底 + 单侧硬光，产品质感的标准解。' }]
});
data.push({
  id: 'd-008', title: '桌面收纳系统 工业设计', desc: '模块化桌面收纳，含手板打样与结构验证。',
  image: IMG + 'design-08.svg', category: '工业设计', tags: ['工业设计', '结构', '手板'], tools: ['Rhino', 'Keyshot'],
  date: '2026-07-12', width: 1600, height: 1000, client: '个人项目', role: '工业设计',
  views: 934, likes: 62, type: '项目',
  versions: [
    { v: 'v1.0', date: '2026-06-30', note: '草图方案：三种模块组合方式。' },
    { v: 'v1.1', date: '2026-07-12', note: '定稿：卡扣结构替代螺丝，免工具拆装。' }
  ],
  review: {
    summary: '工业设计要先解决「怎么装」，再解决「好不好看」。卡扣方案砍掉 12 颗螺丝，装配时间从 4 分钟降到 20 秒。',
    points: [
      '结构验证必须做手板，屏幕上看不出公差问题。',
      '卡扣配合留 0.2mm 间隙，否则装配会卡死。',
      '模块接口统一，才能自由组合出 N 种形态。'
    ]
  },
  inspiration: [{ title: '模块化家具范式', note: '统一接口 + 有限模块数 = 最大组合自由度。' }]
});
data.push({
  id: 'd-009', title: '作品集站点 交互原型', desc: '求职作品集的可交互原型，含滚动动效与状态流。',
  image: IMG + 'design-09.svg', category: '交互原型', tags: ['交互', '原型', '动效'], tools: ['Figma', 'Principle'],
  date: '2026-09-03', width: 1600, height: 1000, client: '个人求职作品集', role: '交互设计',
  views: 1476, likes: 143, type: '项目',
  versions: [
    { v: 'v1.0', date: '2026-08-22', note: '低保真线框：确定信息区块与滚动节奏。' },
    { v: 'v1.1', date: '2026-09-03', note: '高保真：补交互动效与响应式规则。' }
  ],
  review: {
    summary: '原型要回答的是「用户下一步看哪」，不是「页面长什么样」。滚动叙事比点击跳转更适合作品集。',
    points: [
      '首屏必须让人 3 秒内知道「你是做什么的」。',
      '动效服务内容：只在区块入场和状态切换时出现。',
      '给每个区块一个明确的下一步引导，避免用户迷失。'
    ]
  },
  inspiration: [{ title: 'motionsites 案例库', note: '滚动驱动的叙事结构，动效与内容强绑定。' }]
});

fs.writeFileSync(P, JSON.stringify(data, null, 2) + '\n', 'utf8');
const cats = [...new Set(data.map(function (d) { return d.category; }))];
console.log('设计图仓：' + data.length + ' 件，分类 = ' + cats.join(' / '));
