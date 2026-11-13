// 选题雷达回归测试
// 验证：R1(假空白/跨全站去重) + R2(缺口闸门/正文级去重) + P2(WP轴去WP化/阈值翻转) 修复不回归
// 运行：node tools/radar-regression.js
const cm = require('./content-matrix.js');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name + (extra ? ' → ' + extra : '')); }
  else { fail++; console.log('FAIL | ' + name + (extra ? ' → ' + extra : '')); }
}

const posts = cm.loadPosts();
const cov = cm.buildCoverage();

// ---- P2: WP 轴去 WP 化 ----
check('AXIS_NAMES.WP === 独立站技术', cm.AXIS_NAMES.WP === '独立站技术', cm.AXIS_NAMES.WP);
check('TARGET_CELLS 无 建站/WordPress 残留', cm.TARGET_CELLS.every(c => !c.includes('建站/WordPress')));
const g1 = cm.gapWeight('FT·SEO×独立站技术', cov);
check('改名后投影正常(count 为数字)', typeof g1.count === 'number' && !isNaN(g1.count), 'count=' + g1.count + ' ft=' + g1.ft);

// ---- P2: 阈值翻转（外贸格更难饱和，非外贸格更易饱和）----
const g2 = cm.gapWeight('FT·SEO×GEO', cov);
check('阈值翻转: FT·SEO×GEO 不饱和(之前 R2 后是 true)', cm.isCellSaturated(g2) === false, 'count=' + g2.count + ' sat=' + cm.isCellSaturated(g2));
check('阈值翻转单元: FT 放宽', cm.isCellSaturated({ count: 10, weight: 5, ft: true }) === false);
check('阈值翻转单元: 非FT 收紧', cm.isCellSaturated({ count: 10, weight: 5, ft: false }) === true);

// ---- R1+R2: 矩阵种子结构 ----
const seeds = cm.matrixSeeds(cov, posts);
check('matrixSeeds 结构: out/deduped/covered 均为数组',
  Array.isArray(seeds) && Array.isArray(seeds.deduped) && Array.isArray(seeds.covered));
console.log('INFO | 新种子=' + seeds.length + ' deduped=' + seeds.deduped.length + ' covered=' + seeds.covered.length);

// ---- R2: 已覆盖探针（博客已有的题不应在新种子） ----
const probe = ['SEO 与 GEO 怎么分工', '同时吃谷歌排名', 'E-E-A-T', 'AI 生成外贸落地页', '知识库页面'];
const newTitles = seeds.map(s => s.title);
let stillNew = 0;
const hitList = [];
for (const p of probe) {
  if (newTitles.some(t => t.includes(p))) {
    const inCovered = seeds.covered.some(c => c.title.includes(p));
    const inDedup = seeds.deduped.some(d => d.title.includes(p));
    if (!inCovered && !inDedup) { stillNew++; hitList.push(p); }
  }
}
check('R2: 已覆盖探针不在新种子(最多2个漏网)', stillNew <= 2, 'stillNew=' + stillNew + (hitList.length ? ' [' + hitList.join(',') + ']' : ''));

// ---- R1: llms.txt 仍正确去重 ----
const llmsDedup = seeds.deduped.some(d => d.title.toLowerCase().includes('llms.txt'));
check('R1: llms.txt 已写过→进 deduped', llmsDedup);

console.log('\n==== PASS=' + pass + ' FAIL=' + fail + ' ====');
process.exit(fail === 0 ? 0 : 1);
