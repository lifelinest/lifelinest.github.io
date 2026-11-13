/* T1 数据对齐：智造工坊
   规格筛选维度 = 分类（电子DIY/机械拼装/3D打印/手工文创/工具改造）+ 难度（入门/进阶/硬核）+ 周期（1天内/1周内/1月内）
   1) 给已有 4 条项目补 category / level / period（软件类项目归入「工具改造」）
   2) 追加 4 条造物项目，覆盖其余 4 个分类（含 BOM / 步骤 / 避坑，供 T3 使用）
*/
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..', 'source', '_data', 'workshop.json');
const data = JSON.parse(fs.readFileSync(P, 'utf8'));

const fix = {
  'w-001': { category: '工具改造', level: '进阶', period: '1月内' },
  'w-002': { category: '工具改造', level: '硬核', period: '1月内' },
  'w-003': { category: '工具改造', level: '进阶', period: '1周内' },
  'w-004': { category: '工具改造', level: '入门', period: '1周内' }
};
data.forEach(function (d) { if (fix[d.id]) Object.assign(d, fix[d.id]); });

const IMG = '/images/portfolio/';
function mk(o) {
  return {
    id: o.id, featured: false, name: o.name, tagline: o.tagline, cover: IMG + o.cover,
    stack: o.stack, category: o.category, level: o.level, period: o.period,
    status: o.status, progress: o.progress, date: o.date,
    metrics: o.metrics, links: o.links || [],
    detail: o.detail, bom: o.bom, steps: o.steps, pitfalls: o.pitfalls
  };
}

const add = [
  mk({
    id: 'w-005', name: '桌面氛围灯 · ESP32', tagline: 'WS2812 灯带 + 手机 App 调色，一句话控制全屋氛围',
    cover: 'craft-01.svg', stack: ['ESP32', 'Arduino', 'WS2812', 'MQTT'],
    category: '电子DIY', level: '进阶', period: '1周内', status: '已完成', progress: 100, date: '2026-08-18',
    metrics: [{ label: '灯珠数', value: '60 颗' }, { label: '成本', value: '¥86' }, { label: '耗时', value: '3 天' }],
    links: [{ label: '固件源码', url: 'https://github.com/' }],
    detail: {
      background: '桌面显示器背后缺光，长时间夜用眼睛累；市售氛围灯不能自定义联动。',
      challenge: 'ESP32 的 3.3V 逻辑电平驱动 5V 灯带存在电平不匹配，且长灯带末端压降明显。',
      solution: '加 74HCT245 做电平转换，电源端每 30 颗灯珠并联注入一次，消除末端偏色。',
      result: '60 颗灯珠全亮无偏色，App 调色延迟 < 200ms，接入 Home Assistant。'
    },
    bom: [
      { name: 'ESP32 开发板', spec: 'WROOM-32', qty: '1 块', cost: '¥32', note: '主控', link: '' },
      { name: 'WS2812B 灯带', spec: '60 颗 / 1m', qty: '1 条', cost: '¥28', note: '5V 供电', link: '' },
      { name: '74HCT245 电平转换', spec: 'DIP-20', qty: '1 片', cost: '¥3', note: '3.3V→5V', link: '' },
      { name: '5V 3A 电源', spec: 'DC 头', qty: '1 个', cost: '¥18', note: '灯带供电', link: '' },
      { name: '亚克力导光板', spec: '300×30mm', qty: '1 片', cost: '¥5', note: '匀光', link: '' }
    ],
    steps: [
      { title: '选型与算功率', desc: '60 颗灯珠全白 ≈ 3.6A，电源至少留 30% 余量。', tip: '灯带功率 = 灯珠数 × 0.06A × 5V，别按经验拍。' },
      { title: '电平转换电路', desc: 'ESP32 数据脚经 74HCT245 升到 5V 再接灯带 DIN。', tip: '不加转换会长灯带花屏，且现象随机、极难排查。' },
      { title: '电源并联注入', desc: '每 30 颗灯珠从电源再引一组线，避免末端压降偏色。', tip: '末端发红就是压降，不是灯珠坏了。' },
      { title: '固件烧录', desc: 'FastLED 库驱动，实现调色/呼吸/音乐律动三种模式。' },
      { title: '结构装配', desc: '亚克力板做匀光，灯带贴背面，整体贴显示器下沿。' }
    ],
    pitfalls: [
      { q: '灯带末端颜色发红、亮度低', why: '铜箔电阻导致压降，末端电压不足 5V。', fix: '每 30 颗并联注入电源；或改用 12V 灯带 + 降压。' },
      { q: '灯带闪烁 / 随机花屏', why: 'ESP32 为 3.3V 逻辑，直接驱动 5V 灯带电平不足。', fix: '加 74HCT245 电平转换，并在数据线串 300Ω 电阻。' }
    ]
  }),
  mk({
    id: 'w-006', name: '行星减速齿轮箱', tagline: '3D 打印件拼装的两级行星减速，减速比 27:1',
    cover: 'craft-02.svg', stack: ['Fusion 360', '3D 打印', '轴承'],
    category: '机械拼装', level: '硬核', period: '1月内', status: '已完成', progress: 100, date: '2026-06-22',
    metrics: [{ label: '减速比', value: '27:1' }, { label: '零件数', value: '34 件' }, { label: '成本', value: '¥142' }],
    links: [], 
    detail: {
      background: '想给自制的桌面机械臂做一个低速大扭矩关节，市售减速箱要么贵要么尺寸不合。',
      challenge: '3D 打印件的尺寸精度有限（±0.2mm），齿隙过大会导致回程差明显。',
      solution: '齿形改用变位齿并预留 0.15mm 侧隙，输出端加 6810 轴承承力，回程差降到 1.2°。',
      result: '空载转速 22rpm，堵转扭矩约 1.8N·m，连续运行 2 小时温升 < 15℃。'
    },
    bom: [
      { name: '行星齿轮组（打印件）', spec: 'PLA / 0.12mm 层高', qty: '1 套', cost: '¥18', note: '含太阳轮/行星架', link: '' },
      { name: '6810 薄壁轴承', spec: '50×65×7', qty: '2 个', cost: '¥56', note: '输出承力', link: '' },
      { name: 'N20 减速电机', spec: '12V 200rpm', qty: '1 个', cost: '¥38', note: '动力源', link: '' },
      { name: 'M3 内六角螺丝', spec: '8/12/16mm', qty: '12 颗', cost: '¥6', note: '装配', link: '' }
    ],
    steps: [
      { title: '齿形设计', desc: 'Fusion 360 参数化建模行星轮系，模数 1、齿数按 27:1 反推。', tip: '先用参数表算齿数配比，再建模，别边画边试。' },
      { title: '打印参数', desc: '0.12mm 层高、30% 填充、外壳 4 圈，保证齿面强度。', tip: '齿轮件一定要慢速打印，速度快了齿面会有振纹。' },
      { title: '齿隙装配', desc: '手动旋转行星架，调整垫片厚度控制侧隙在 0.15mm 左右。', tip: '能感觉到轻微旷量即可，太紧要拆。' },
      { title: '承力结构', desc: '输出轴两端各压一个 6810 轴承，避免径向力作用在打印件上。' },
      { title: '跑合与检查', desc: '空载跑 20 分钟，检查发热与异响，再逐步加载。' }
    ],
    pitfalls: [
      { q: '运行有周期性异响', why: '打印齿轮的齿厚公差累积，个别齿啮合过紧。', fix: '标记紧的齿位，单独打磨 0.05mm 或重新打印该零件。' },
      { q: '输出轴晃动', why: '径向力直接作用在 3D 打印件上，材料刚性不足。', fix: '输出端加轴承承力，打印件只做定位不做承力。' }
    ]
  }),
  mk({
    id: 'w-007', name: '模块化桌面收纳架', tagline: '免螺丝卡扣，8 个模块自由组合',
    cover: 'craft-03.svg', stack: ['Blender', '3D 打印', '卡扣结构'],
    category: '3D打印', level: '入门', period: '1天内', status: '已完成', progress: 100, date: '2026-09-02',
    metrics: [{ label: '模块数', value: '8 个' }, { label: '单件耗时', value: '4.5h' }, { label: '成本', value: '¥64' }],
    links: [],
    detail: {
      background: '桌面线材、读卡器、硬盘堆成一团，市售收纳盒尺寸固定，放不进现有桌面。',
      challenge: '免螺丝卡扣既要能徒手拆装，又不能太松导致一碰就散。',
      solution: '卡扣采用 45° 斜面 + 0.2mm 过盈配合，装配靠材料弹性，反复拆装 50 次不失效。',
      result: '4 种基础模块拼出 12 种形态，桌面线材全部收纳完毕。'
    },
    bom: [
      { name: 'PLA 耗材', spec: '1.75mm / 哑光黑', qty: '约 320g', cost: '¥32', note: '主体', link: '' },
      { name: '防滑硅胶垫', spec: '自粘 10mm', qty: '16 片', cost: '¥12', note: '底部', link: '' },
      { name: '磁吸贴片', spec: '6×2mm', qty: '8 片', cost: '¥20', note: '模块对位', link: '' }
    ],
    steps: [
      { title: '尺寸测绘', desc: '量出要收纳物品的最大外轮廓，按 1.15 倍留余量设计。', tip: '先量东西再画盒子，反过来一定返工。' },
      { title: '卡扣建模', desc: '45° 斜面 + 0.2mm 过盈，靠 PLA 弹性卡紧。', tip: '过盈量 0.2mm 是甜点值，0.4mm 装配会掰断。' },
      { title: '分件打印', desc: '8 个模块分批打印，0.2mm 层高兼顾速度与外观。' },
      { title: '装配验证', desc: '反复拆装 20 次检查卡扣是否松动，再贴硅胶垫。' }
    ],
    pitfalls: [
      { q: '卡扣第一次装就断', why: '过盈量给到 0.4mm，PLA 层间强度不够。', fix: '改 0.2mm 过盈；或把卡扣材料换成 PETG。' },
      { q: '模块拼起来歪斜', why: '打印件翘边导致底面不平。', fix: '加 5mm 裙边 + 前 3 层风扇关闭，控制翘边。' }
    ]
  }),
  mk({
    id: 'w-008', name: '手作皮质书签', tagline: '植鞣革染色 + 烫金，一套 6 枚',
    cover: 'craft-04.svg', stack: ['手工', '植鞣革', '烫金'],
    category: '手工文创', level: '入门', period: '1天内', status: '已完成', progress: 100, date: '2026-07-26',
    metrics: [{ label: '成品数', value: '6 枚' }, { label: '单枚耗时', value: '40min' }, { label: '成本', value: '¥58' }],
    links: [],
    detail: {
      background: '想送一套有手作痕迹的礼物，市售书签要么太工业化，要么价格虚高。',
      challenge: '植鞣革遇水会留渍，染色和封边顺序错了整张皮就废了。',
      solution: '先封边再染色，染料稀释到 30% 分三次薄涂，避免一次性色块不均。',
      result: '6 枚色差一致，边缘圆润无毛刺，烫金不掉色。'
    },
    bom: [
      { name: '植鞣革', spec: '1.2mm / 原色', qty: '1 张(A5)', cost: '¥36', note: '主体', link: '' },
      { name: '皮革染料', spec: '酒精性 / 棕', qty: '1 瓶', cost: '¥15', note: '上色', link: '' },
      { name: '烫金箔', spec: '哑光金', qty: '1 卷', cost: '¥7', note: '纹样', link: '' }
    ],
    steps: [
      { title: '下料裁切', desc: '按 150×20mm 裁切，用钢尺压住走刀，保证边缘平直。', tip: '裁皮刀要斜向 30° 走，垂直走刀会啃边。' },
      { title: '封边处理', desc: '先上封边液打磨边缘，再进入染色环节。', tip: '顺序反了染料会渗进皮边纤维，边就毛了。' },
      { title: '分次染色', desc: '染料稀释到 30%，薄涂三次，每次间隔 10 分钟。', tip: '一次涂厚必出色块，宁可多涂几遍。' },
      { title: '烫金压纹', desc: '调温到 110℃，压 3 秒，冷却后撕箔。', tip: '温度高了金箔会糊，先在废料上试温。' }
    ],
    pitfalls: [
      { q: '染色后出现深色水渍', why: '染料浓度过高，一次涂抹渗透不均。', fix: '稀释到 30% 分三次薄涂，每次干透再涂。' },
      { q: '烫金边缘发糊', why: '烫金机温度超过 120℃，金箔熔化溢边。', fix: '控温 110℃、压 3 秒，先废料试温再上正品。' }
    ]
  })
];

add.forEach(function (d) { data.push(d); });

fs.writeFileSync(P, JSON.stringify(data, null, 2) + '\n', 'utf8');
const cats = [...new Set(data.map(function (d) { return d.category; }))];
const lv = [...new Set(data.map(function (d) { return d.level; }))];
const pd = [...new Set(data.map(function (d) { return d.period; }))];
console.log('智造工坊：' + data.length + ' 个项目');
console.log('分类 = ' + cats.join(' / '));
console.log('难度 = ' + lv.join(' / '));
console.log('周期 = ' + pd.join(' / '));
