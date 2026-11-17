'use strict';
/**
 * scripts/podcast-auto.js —— Hexo 构建钩子：新增文章自动出播客
 *
 * 诉求：写完文章 → 一次 hexo generate → 播客音频 / 清单 / RSS 自动齐活，零额外步骤。
 *
 * 防护（每条都是踩过的坑）：
 *  - 纯 fs 检测；音频齐全时零开销直接 return，常态下不碰 Python / 不联网。
 *  - before_generate 会被 hexo-generator-i18n 触发两轮 → process 级 flag 防重复合成。
 *  - 缺失数 > MAX_AUTO 只 warn 不合成：首次全量补齐（几百个音频）若塞进构建会
 *    把 hexo generate 卡几十分钟，那种情况走手动 `node tools/podcast/auto.js`。
 *  - 全程 try/catch，异常只 warn，**绝不 throw**（播客是增强项，不能让整站构建挂掉）。
 *  - 子进程 8 分钟超时兜底；PODCAST_AUTO=0 可临时关闭本钩子。
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const MAX_AUTO = 15; // ≈ 5 篇新文章 × 3 套音色

if (typeof hexo !== 'undefined' && hexo && hexo.extend && hexo.extend.filter) {
  hexo.extend.filter.register('before_generate', function () {
    if (process.env.PODCAST_AUTO === '0') return;
    // i18n 会在同一次 generate 内触发第二轮 before_generate。用 30 秒窗口去重，
    // 不能用「永久 flag」：hexo server 是常驻进程，永久 flag 会让后续新增文章
    // 再也不触发自动补齐。第二轮即便真跑了，auto.js 也是幂等的（缺失已补齐→0 开销）。
    const now = Date.now();
    if (process.__podcastAutoAt && now - process.__podcastAutoAt < 30000) return;
    process.__podcastAutoAt = now;

    try {
      const BLOG = hexo.base_dir;
      const POSTS = path.join(BLOG, 'source', '_posts');
      const AUDIO = path.join(BLOG, 'source', 'audio', 'podcast');
      const CFG = JSON.parse(fs.readFileSync(path.join(BLOG, 'tools', 'podcast', 'config.json'), 'utf8'));
      const sets = CFG.voiceSets || [{ suffix: '' }];
      const L = (hexo.log && typeof hexo.log.info === 'function') ? hexo.log : console;

      let missing = 0;
      const files = fs.readdirSync(POSTS).filter(f => f.endsWith('.md'));
      for (const f of files) {
        let s;
        try { s = fs.readFileSync(path.join(POSTS, f), 'utf8'); } catch (e) { continue; }
        const m = s.slice(0, 4000).match(/^abbrlink:\s*['"]?([A-Za-z0-9._-]+)['"]?\s*$/m);
        if (!m) continue;
        for (const set of sets) {
          const p = path.join(AUDIO, m[1] + (set.suffix || '') + '.mp3');
          if (!(fs.existsSync(p) && fs.statSync(p).size > 10000)) missing++;
        }
      }

      if (missing === 0) return; // 常态：全齐，零开销
      if (missing > MAX_AUTO) {
        L.warn('[podcast-auto] 检测到 %d 个音频缺失（> %d），本次不自动合成以免拖慢构建；手动补齐: node tools/podcast/auto.js', missing, MAX_AUTO);
        return;
      }
      L.info('[podcast-auto] 检测到 %d 个音频缺失，自动补齐中...', missing);
      cp.execFileSync(process.execPath,
        [path.join(BLOG, 'tools', 'podcast', 'auto.js'), '--max=' + MAX_AUTO],
        { cwd: BLOG, stdio: 'inherit', timeout: 8 * 60 * 1000 });
      L.info('[podcast-auto] 自动补齐完成');
    } catch (e) {
      const msg = '[podcast-auto] 自动补齐跳过（不影响构建）: ' + String(e.message || e).slice(0, 200);
      if (hexo.log && hexo.log.warn) hexo.log.warn(msg); else console.warn(msg);
    }
  }, 6);
}
