/* T3 数据增强：为智造工坊补齐
 *   1) BOM 结构化字段：price(单价¥) / qtyNum / unit / priced(是否采购件) / buyUrl(采购直达)
 *   2) gallery 成品图数组（多图轮播数据源）
 *   3) video 视频入口字段
 * 只做"从既有文本中解析 + 生成同风格本地占位图"，不编造金额、不引入 AI 生图。
 * 用法: node tools/t3_workshop_enrich.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'source', '_data', 'workshop.json');
const IMG_DIR = path.join(ROOT, 'source', 'images', 'portfolio');

const list = JSON.parse(fs.readFileSync(DATA, 'utf8'));

/* ---------- 占位"成品视图" SVG（与既有 craft-0x.svg 同一风格） ---------- */
function svg(w, h, c1, c2, title, sub) {
  const fs1 = Math.round(Math.min(w, h) * 0.075);
  const fs2 = Math.round(fs1 * 0.52);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <g fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="1">
    <circle cx="${w * 0.18}" cy="${h * 0.78}" r="${Math.min(w, h) * 0.26}"/>
    <circle cx="${w * 0.18}" cy="${h * 0.78}" r="${Math.min(w, h) * 0.15}"/>
    <path d="M0 ${h * 0.3} L${w * 0.34} ${h * 0.48} L${w * 0.62} ${h * 0.28} L${w} ${h * 0.52}"/>
  </g>
  <text x="${w * 0.06}" y="${h * 0.5}" fill="#ffffff" fill-opacity="0.96"
    font-family="system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    font-size="${fs1}" font-weight="600">${title}</text>
  <text x="${w * 0.06}" y="${h * 0.5 + fs1 * 1.35}" fill="#ffffff" fill-opacity="0.62"
    font-family="system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    font-size="${fs2}">${sub}</text>
</svg>`;
}

/* 为 4 个实体项目各补 2 张"成品视图"占位图（本地、零外部依赖） */
const VIEWS = {
  'craft-01': [['#1d3557', '#4a7fb5', '成品 · 正面点亮'], ['#241b3a', '#7c5cd6', '细节 · 接线走线']],
  'craft-02': [['#3f3327', '#a3825a', '成品 · 输出端'], ['#4a3b2c', '#c0a06f', '细节 · 齿轮啮合']],
  'craft-03': [['#2a2450', '#7d6cc4', '成品 · 模块组合'], ['#33265c', '#9b87dd', '细节 · 磁吸对位']],
  'craft-04': [['#4d2334', '#b06a86', '成品 · 烫金纹样'], ['#5c2b3d', '#d093aa', '细节 · 边缘处理']]
};
let made = 0;
Object.keys(VIEWS).forEach((base) => {
  VIEWS[base].forEach((v, i) => {
    const file = base + '-' + (i === 1 ? 'b' : 'c') + '.svg';
    fs.writeFileSync(path.join(IMG_DIR, file), svg(1600, 1000, v[0], v[1], v[2], ''), 'utf8');
    made++;
  });
});

/* ---------- BOM 结构化 ----------
 * 口径说明：原数据 cost 列（如 "¥56"）是「该行整行小计」，不是单价；
 * 因此 subtotal = 解析出的金额，unitPrice = subtotal / qtyNum 反推。
 * 非采购项（自有/开源/复用/参考/按量计费…）priced=false，不计入合计。
 */
function parseAmount(cost) {
  const m = String(cost == null ? '' : cost).match(/[¥￥]\s*([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}
function parseQty(qty) {
  const s = String(qty == null ? '' : qty);
  const m = s.match(/约?\s*(\d+(?:\.\d+)?)\s*([^\d\s(]*)/);
  if (!m) return { qtyNum: 1, unit: s.replace(/^约\s*/, '') };
  return { qtyNum: parseFloat(m[1]), unit: m[2] || '' };
}
function buyUrl(name) {
  return 'https://s.1688.com/selloffer/offer_search.htm?keywords=' + encodeURIComponent(String(name).slice(0, 24));
}

list.forEach((p) => {
  (p.bom || []).forEach((b) => {
    const subtotal = parseAmount(b.cost);
    const q = parseQty(b.qty);
    b.qtyNum = q.qtyNum;
    b.unit = q.unit;
    b.subtotal = subtotal;
    b.priced = subtotal > 0;
    b.unitPrice = b.priced ? Math.round((subtotal / (q.qtyNum || 1)) * 100) / 100 : 0;
    delete b.price; // 旧口径字段，避免误用
    if (b.priced) b.buyUrl = buyUrl(b.name);
    else delete b.buyUrl;
  });

  /* 成品图：实体项目 = 封面 + 2 张视图；数字项目 = 仅封面 */
  const m = String(p.cover || '').match(/(craft-\d+)\.svg/);
  if (m) {
    p.gallery = [p.cover, '/images/portfolio/' + m[1] + '-b.svg', '/images/portfolio/' + m[1] + '-c.svg'];
  } else if (p.cover) {
    p.gallery = [p.cover];
  } else {
    p.gallery = [];
  }
  /* 视频入口：留空即自动隐藏，接入真实视频链接后自动显示 */
  if (typeof p.video !== 'string') p.video = '';
});

fs.writeFileSync(DATA, JSON.stringify(list, null, 2) + '\n', 'utf8');

const bomCount = list.reduce((n, p) => n + (p.bom || []).length, 0);
const pricedCount = list.reduce((n, p) => n + (p.bom || []).filter((b) => b.priced).length, 0);
console.log('已增强', list.length, '个项目 /', bomCount, '条物料；其中含金额', pricedCount, '条；生成占位视图', made, '张');
list.forEach((p) => {
  const total = (p.bom || []).reduce((s, b) => s + (b.priced ? b.subtotal : 0), 0);
  console.log('  ', p.id, p.name, '| 合计 ¥' + total.toFixed(2), '| gallery', (p.gallery || []).length);
});
