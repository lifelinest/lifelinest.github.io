#!/usr/bin/env node
/**
 * 定位契合度体检（只读）
 * 把全站文章按「推不推得动三支柱」分成 契合/支撑/稀释/冲突 四档，并与近 90 天真实 PV 交叉。
 *
 * 用法（仓库根目录执行）：
 *   node tools/positioning-audit.js                      # 只做内容分层（不联网）
 *   node tools/positioning-audit.js --stats=<stats.json>  # 带上 PV（先用 tools/fetch-stats.js --json 产出）
 *   node tools/positioning-audit.js --json D:/1/1/.tmp/fit-result.json
 *
 * 定位基准（2026-09-19 冻结）：孟凡宇 = 用 AI 把外贸 B2B 独立站跑通的增长实战派
 * 三支柱：外贸B2B独立站 / AI内容增长 / SEO与Google Ads
 *
 * ⚠️ 冲突组清单（下面的 G）是人工按题材判定的，新增/改写文章后需要人工复核这份清单。
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const POSTS = path.join(ROOT, 'source/_posts');

const argv = process.argv.slice(2);
const argOf = k => {
  const hit = argv.find(a => a === k || a.startsWith(k + '='));
  if (!hit) return null;
  const i = argv.indexOf(hit);
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : (argv[i + 1] || null);
};
const statsPath = argOf('--stats');
const jsonOut = argOf('--json');

// ---------- 1. 扫 front-matter ----------
function parseFM(txt) {
  const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm = {}; let cur = null;
  for (const raw of m[1].split(/\r?\n/)) {
    const kv = raw.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) { cur = kv[1]; fm[cur] = kv[2].trim(); }
    else if (/^\s*-\s+/.test(raw) && cur) {
      (fm['__' + cur] = fm['__' + cur] || []).push(raw.replace(/^\s*-\s+/, '').replace(/^['"]|['"]$/g, '').trim());
    }
  }
  return fm;
}
const arrOf = (fm, k) => {
  if (fm['__' + k]) return fm['__' + k];
  const v = fm[k]; if (!v) return [];
  if (v.startsWith('[')) { try { return JSON.parse(v.replace(/'/g, '"')); } catch (e) { return v.replace(/[\[\]]/g, '').split(',').map(s => s.trim()); } }
  return [v.replace(/^['"]|['"]$/g, '')];
};
const clean = s => String(s || '').replace(/^['"]|['"]$/g, '');

const rows = fs.readdirSync(POSTS).filter(f => f.endsWith('.md')).map(f => {
  const txt = fs.readFileSync(path.join(POSTS, f), 'utf8');
  const fm = parseFM(txt);
  const body = txt.replace(/^---[\s\S]*?---/, '');
  return {
    file: f,
    title: clean(fm.title) || f.replace(/\.md$/, ''),
    abbrlink: clean(fm.abbrlink),
    categories: arrOf(fm, 'categories'),
    date: clean(fm.date).slice(0, 10),
    words: (body.match(/[\u4e00-\u9fa5]/g) || []).length,
    links: (body.match(/\]\(\/posts\//g) || []).length,
  };
});

// ---------- 2. 读 PV ----------
const pvOf = {}; let pvAt = '(未提供 PV 数据)', totalPv = 0;
if (statsPath && fs.existsSync(statsPath)) {
  const s = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
  pvAt = s.pvAt || s.fetchedAt || '?';
  for (const h of (s.hotMerged || s.hot || [])) {
    const m = String(h.key || '').match(/^post:(.+)$/);
    if (!m) continue;
    pvOf[m[1]] = pvOf[m[1]] || { pv: 0, uv: 0 };
    pvOf[m[1]].pv += h.pv || 0; pvOf[m[1]].uv += h.uv || 0;
  }
  totalPv = Object.values(pvOf).reduce((a, b) => a + b.pv, 0);
}
const pv = a => (pvOf[a] || {}).pv || 0;

// ---------- 3. 冲突组（人工判定，需定期复核） ----------
const G = {
  // 2026-10-01：cd7681cc / de68b87d / 1fddf13f 三篇已改造为外贸支柱文（跨境网络方案 / 业务自动化 / 素材版权），移出冲突组
  // 2026-10-10：A2（dced8aaa / bd6e33cb）两篇军事·政治文已于 10-01 删除，整组移除
  // 2026-10-10：96fe089a(LifelineVerve产品页)用户判定为重点资产→移除 noindex、恢复收录，移出冲突组；
  //            ad9cf40f(标签规范)属内部文档→归位 published:false，移出冲突组；
  //            699ead5(毕设)/f288ca1(get_jobs)归为第二类个人经历随笔(暂保留 noindex)；
  // 2026-10-11：A1 中 7 篇技术干货已改造成定位内资产并去除 noindex（见下），移出冲突组：
  //            2080dcc7(独立站支付风控) / 2aea9a81(短信验证码安全) / 985f9bfd(内网穿透·开发调试)
  //            / e93b1b79(电商App合规自动化) / 85920be9(独立站运营者隐私保护) / e6cd93cd(跨境多账号防关联)
  //            / c70de62d(外贸团队知识库，已并入 AI内容增长)。剩余 A1 为仍偏灰产/弱相关的 7 篇。
  'A1 灰产·破解·隐私逆向题材（剩余，仍 noindex）': ['6336ac44','2cbf2bcc','f56293ec','ab0a1bd1','343e78a4','75eb0785','868d8faa'],
  'A3 生活·个人经历随笔（暂保留 noindex）': ['122fb7ad','ac008fca','ea64d404','3369804f','d097bc95','8f4d7f6c','57986b0a','bc19d2c1','daa5a7f5','b2bf9bb6','bd4d0e0e','f3b2c920','7e51e542','1a7e4f01','a9fc7482','4536520a','f33ceadd','1e2258a3','8a7b7145','14e4d86a','82e329c9','c4d3526','699ead5','f288ca1'],
};
// 已缓解（noindex）清单：2026-10-10 上述 40 篇已全部加 noindex（scripts/noindex.js 自动注入 meta + 剔除 sitemap），
// 画像影响已消除，体检不再计入「活跃冲突」；如需重新计入可从 MITIGATED 移回 G。
const MITIGATED = new Set(Object.values(G).flat());
const conflict = new Set(Object.values(G).flat().filter(a => !MITIGATED.has(a))); // 活跃冲突 = 未缓解的
const SUPPORT_AI = ['24c9c254','6cae7b2c','7be0899e','f2b68b74','5daa7ae4','30a2dcc4','e57cb390','fe9f2465','f83bd290','83dd532c','a0f90707','d923f1bb','1a2e622e','f1de5082','68d350e2','d1874d21','79b00bbf','66ea8cb4','481d113d','95094afd','89472648','d0dc42b8','a4b9adb4','b9342cef'];
const CORE_CATS = ['外贸B2B独立站','AI内容增长','SEO与Google Ads'];

function bucket(r) {
  if (conflict.has(r.abbrlink)) return 'conflict';
  if (MITIGATED.has(r.abbrlink)) return 'mitigated';
  if (CORE_CATS.includes(r.categories[0])) return 'core';
  if (r.categories[0] === '博客建站与前端' || SUPPORT_AI.includes(r.abbrlink)) return 'support';
  return 'dilute';
}
const by = { core: [], support: [], dilute: [], conflict: [], mitigated: [] };
for (const r of rows) by[bucket(r)].push(r);
const sum = l => l.reduce((a, r) => a + pv(r.abbrlink), 0);

console.log('定位契合度体检 ｜ 篇数 ' + rows.length + ' ｜ PV 窗口 ' + pvAt + '\n');
const names = { core: '契合·三支柱', support: '支撑·独立站/AI工作流', dilute: '稀释·纯工具测评', conflict: '冲突·离题(活跃)', mitigated: '已缓解·noindex' };
for (const k of ['conflict','mitigated','core','support','dilute']) {
  const p = sum(by[k]);
  console.log('  ' + names[k].padEnd(20) + ' 篇数 ' + String(by[k].length).padStart(3) +
    ' | PV ' + String(p).padStart(4) + (totalPv ? ' | 占比 ' + (p / totalPv * 100).toFixed(1) + '%' : ''));
}
if (totalPv) console.log('  PV 合计 ' + totalPv + '（活跃冲突类占 ' + (sum(by.conflict) / totalPv * 100).toFixed(1) + '%）');

for (const [g, list] of Object.entries(G)) {
  console.log('\n## ' + g + '（' + list.length + ' 篇，已全部 noindex 缓解）');
  for (const a of list) {
    const r = rows.find(x => x.abbrlink === a);
    if (!r) { console.log('  !! 未找到 ' + a + '（已删除？请更新脚本里的清单）'); continue; }
    console.log('  ' + a + ' | PV ' + String(pv(a)).padStart(4) + ' | 字数 ' + String(r.words).padStart(5) + ' | [已缓解] ' + r.title);
  }
}
console.log('\n## 全站 PV TOP15');
for (const r of rows.slice().sort((a, b) => pv(b.abbrlink) - pv(a.abbrlink)).slice(0, 15)) {
  console.log('  PV ' + String(pv(r.abbrlink)).padStart(4) + ' | ' + bucket(r).padEnd(8) + ' | ' + r.title);
}

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify({
    pvAt, totalPv, rows: rows.length,
    buckets: Object.fromEntries(['conflict','mitigated','core','support','dilute'].map(k => [k, {
      n: by[k].length, pv: sum(by[k]),
      list: by[k].map(r => ({ abbr: r.abbrlink, title: r.title, cat: r.categories[0], words: r.words, pv: pv(r.abbrlink) })).sort((a, b) => b.pv - a.pv)
    }])),
  }, null, 2), 'utf8');
  console.log('\n-> ' + jsonOut);
}
