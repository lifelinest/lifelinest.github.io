/* T1 数据对齐：微码仓库热榜快照
   规格筛选需要「领域」；协议 / 更新时间属后端 API 字段，快照里没有 → 不编造，
   由前端在"数据存在时才渲染该行"降级处理。
   本脚本按 仓库名 + 描述 + 主语言 关键词推导 domain（自动归类）。
*/
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..', 'source', '_data', 'trending.json');
const t = JSON.parse(fs.readFileSync(P, 'utf8'));

const RULES = [
  ['游戏开发', /game|unity|godot|engine|graphics|render|animation|manim|3d/i],
  ['AI 大模型', /\bai\b|llm|gpt|agent|model|prompt|skill|context|embedding|transformer|neural|diffusion|rag|mcp|machine.?learn|mojo|foundation/i],
  ['前端', /react|vue|svelte|css|html|tailwind|frontend|ui\b|component|next\.?js|nuxt/i],
  ['后端', /server|api\b|database|framework|http|grpc|microservice|postgres|redis|kafka|graphql/i],
  ['系统工具', /linux|kernel|os\b|docker|kubernetes|shell|macos|container|terminal|filesystem|cli tool/i],
  ['开发工具', /cli|tool|editor|build|bundler|linter|formatter|vscode|git\b|devtool|specification|plugin|utils|notes|awesome|skills?\b/i]
];

function domainOf(d) {
  const hay = [d.full_name, d.repo, d.description || '', d.language || ''].join(' ');
  for (let i = 0; i < RULES.length; i++) {
    if (RULES[i][1].test(hay)) return RULES[i][0];
  }
  return '其他';
}

const count = {};
['daily', 'weekly', 'monthly'].forEach(function (p) {
  (t[p] || []).forEach(function (d) {
    d.domain = domainOf(d);
    count[d.domain] = (count[d.domain] || 0) + 1;
  });
});

fs.writeFileSync(P, JSON.stringify(t, null, 2) + '\n', 'utf8');
console.log('trending 领域归类完成：');
Object.keys(count).sort(function (a, b) { return count[b] - count[a]; })
  .forEach(function (k) { console.log('  ' + k + ' × ' + count[k]); });
