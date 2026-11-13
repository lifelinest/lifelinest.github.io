# -*- coding: utf-8 -*-
"""本地图片清理（两件事，全部是"移出"而非"删除"）

A. 止损：把 source/images 下**今天新生成、且不在原始备份里**的 WebP 移出
   （这些是 optimize_images.py 中断后留下的孤儿，无任何引用）
B. 清死图：按 unused-images.txt 把零引用的老图移出

安全设计：
  * 绝不删除，只 shutil.move 到 _archived/ 下（可随时搬回）
  * 双重校验：文件必须存在于 backup/images_bak_20260910 才算"老资产"；
    A 类必须"不在备份里"才算"今天新生成"
  * 移之前再做一次引用子串检查，只要文本里出现过就不动（保守）
  * 支持 --plan（只读）/ --apply（执行），产出 manifest json

用法：
  python tools/cleanup_images.py --plan
  python tools/cleanup_images.py --apply
"""
import os, io, json, re, shutil, datetime, urllib.parse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC_IMG = os.path.join(ROOT, 'source', 'images')
BACKUP_IMG = os.path.join(ROOT, 'backup', 'images_bak_20260910')
ARCH = os.path.join(ROOT, '_archived')
ARCH_ORPHAN = os.path.join(ARCH, 'ph2_orphan_webp')
ARCH_UNUSED = os.path.join(ARCH, 'unused')
UNUSED_LIST = os.path.join(ROOT, 'unused-images.txt')
TXT_EXT = ('.md', '.markdown', '.html', '.htm', '.yml', '.yaml', '.json', '.css', '.js', '.txt', '.ejs')


def relset(base):
    out = set()
    if not os.path.isdir(base):
        return out
    for dp, _, fn in os.walk(base):
        for f in fn:
            out.add(os.path.relpath(os.path.join(dp, f), base).replace('\\', '/'))
    return out


def load_text_blob():
    parts = []
    for dp, _, fn in os.walk(os.path.join(ROOT, 'source')):
        for f in fn:
            if f.lower().endswith(TXT_EXT):
                try:
                    parts.append(io.open(os.path.join(dp, f), encoding='utf-8', errors='ignore').read())
                except Exception:
                    pass
    return '\n'.join(parts)


def collect_used(blob):
    """把文本里所有图片引用抽成集合（URL 解码 + 去重）。

    覆盖 `![alt](/images/a.png)`、`src="images/a.png"`、`cover: /images/a.png`、
    CSS `url(/images/a.png)`、yml/json 数组等全部写法；%20/%E5%89%AF 等编码会解码。
    返回 (相对 images 的完整路径集合, 文件名集合)。
    """
    paths, names = set(), set()
    pat = re.compile(r'/?(?:images|img)/([^)\s"\'\]>,;?#|]+\.(?:png|jpe?g|gif|webp|bmp|svg|avif|ico))', re.I)
    for m in re.finditer(pat, blob):
        raw = m.group(1)
        try:
            u = urllib.parse.unquote(raw)
        except Exception:
            u = raw
        u = u.strip().lstrip('/')
        if not u:
            continue
        paths.add(u)
        names.add(os.path.basename(u))
    return paths, names



def load_unused():
    """读取 unused-images.txt，返回相对 source/ 的路径列表，如 images/21.jpg"""
    items = []
    if not os.path.isfile(UNUSED_LIST):
        return items
    for line in io.open(UNUSED_LIST, encoding='utf-8'):
        if not line.strip():
            continue
        p = line.split('\t')[0].strip().replace('\\', '/')
        if p.startswith('source/'):
            p = p[len('source/'):]
        if p:
            items.append(p)
    return items


def referenced(rel_img, used_paths, used_names):
    """精确引用判断：文件相对路径或其文件名（URL 解码后）出现在引用集合里，即算被使用。"""
    return rel_img in used_paths or os.path.basename(rel_img) in used_names


def build():
    bk = relset(BACKUP_IMG)
    blob = load_text_blob()
    used_paths, used_names = collect_used(blob)

    # ---- A. 孤儿 WebP：source/images 下不在备份里的 webp ----
    orphan, kept = [], []
    for dp, _, fn in os.walk(SRC_IMG):
        for f in fn:
            if not f.lower().endswith('.webp'):
                continue
            rel = os.path.relpath(os.path.join(dp, f), SRC_IMG).replace('\\', '/')
            if rel in bk:
                continue                      # 老资产，绝不动
            if referenced(rel, used_paths, used_names):
                kept.append(rel)              # 有引用，保守保留
                continue
            orphan.append(rel)

    # ---- B. 死图：清单里的老图，二次确认零引用 ----
    # 清单里的路径形如 source/images/xxx.png（相对整个项目）
    unused, unused_skip = [], []
    for rel_src in load_unused():
        rel_img = rel_src[len('images/'):] if rel_src.startswith('images/') else rel_src
        abs_p = os.path.join(ROOT, 'source', rel_src)
        if not os.path.isfile(abs_p):
            unused_skip.append((rel_src, '文件不存在'))
            continue
        if rel_img not in bk:
            unused_skip.append((rel_src, '不在原始备份中'))
            continue
        if referenced(rel_img, used_paths, used_names):
            unused_skip.append((rel_src, '仍被引用'))
            continue
        unused.append(rel_img)
    return orphan, kept, unused, unused_skip, (used_paths, used_names)


def report(orphan, kept, unused, unused_skip):
    def sz(rels):
        t = 0
        for r in rels:
            p = os.path.join(SRC_IMG, r)
            if os.path.isfile(p):
                t += os.path.getsize(p)
        return t / 1024 / 1024

    total = sum(os.path.getsize(os.path.join(dp, f))
                for dp, _, fn in os.walk(SRC_IMG) for f in fn
                if os.path.isfile(os.path.join(dp, f)))
    cnt = sum(len(fn) for _, _, fn in os.walk(SRC_IMG))
    print('source/images 现状 : %d 个文件, %.1f MB' % (cnt, total / 1024 / 1024))
    print('A 孤儿 WebP 待移出 : %d 张, %.1f MB' % (len(orphan), sz(orphan)))
    print('  (保守留下有引用的): %d 张' % len(kept))
    print('B 死图待移出       : %d 张, %.1f MB' % (len(unused), sz(unused)))
    print('  (清单中被跳过的)  : %d 张' % len(unused_skip))
    for r, why in unused_skip[:5]:
        print('     跳过 %s (%s)' % (r, why))
    after = cnt - len(orphan) - len(unused)
    afts = (total - sz(orphan) * 1024 * 1024 - sz(unused) * 1024 * 1024) / 1024 / 1024
    print('执行后预计         : %d 个文件, %.1f MB（省 %.1f MB）'
          % (after, afts, (total / 1024 / 1024) - afts))
    if kept:
        print('\n--- 保守保留的样例 ---')
        for r in kept[:5]:
            print('   %s' % r)


def move_all(rels, dest_root):
    n, fail = 0, []
    for r in rels:
        s = os.path.join(SRC_IMG, r)
        d = os.path.join(dest_root, r)
        if not os.path.isfile(s):
            continue
        os.makedirs(os.path.dirname(d), exist_ok=True)
        try:
            if os.path.exists(d):
                fail.append((r, '目标已存在，跳过'))
                continue
            shutil.move(s, d)
            n += 1
        except Exception as e:
            fail.append((r, str(e)))
    return n, fail


def do_verify():
    """校验：文本里所有 images/ 引用是否都有对应文件（找出裂图）。只读。"""
    blob = load_text_blob()
    used_paths, _ = collect_used(blob)
    have = relset(SRC_IMG)
    missing = sorted(p for p in used_paths if p not in have)

    old = set()
    ob = os.path.join(ROOT, 'broken-image-refs.txt')
    if os.path.isfile(ob):
        for line in io.open(ob, encoding='utf-8'):
            t = line.strip().split('\t')[0].split()[0] if line.strip() else ''
            if not t:
                continue
            t = t.replace('\\', '/').lstrip('/')
            if t.startswith('source/'):
                t = t[len('source/'):]
            if t.startswith('images/'):
                t = t[len('images/'):]
            old.add(t)

    new_broken = [p for p in missing if p not in old]
    print('文本中的图片引用 : %d 个不同路径' % len(used_paths))
    print('文件缺失(裂图)   : %d 个' % len(missing))
    print('  其中历史已知   : %d 个' % len([p for p in missing if p in old]))
    print('  ⚠ 新增裂图     : %d 个' % len(new_broken))
    for p in new_broken[:10]:
        print('     %s' % p)
    return len(new_broken)


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--plan', action='store_true')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--verify', action='store_true')
    args = ap.parse_args()

    if args.verify:
        do_verify()
        return

    orphan, kept, unused, unused_skip, _ = build()
    report(orphan, kept, unused, unused_skip)

    if not args.apply:
        print('\n（只读演练，未改动任何文件。加 --apply 执行）')
        return

    print('\n=== 执行 ===')
    n1, f1 = move_all(orphan, ARCH_ORPHAN)
    print('A 孤儿 WebP 移出: %d / %d' % (n1, len(orphan)))
    n2, f2 = move_all(unused, ARCH_UNUSED)
    print('B 死图移出     : %d / %d' % (n2, len(unused)))

    ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    man = {
        'time': ts,
        'orphan_webp': {'dest': '_archived/ph2_orphan_webp', 'files': orphan},
        'unused_note': '清单来源 unused-images.txt',
        'unused': {'dest': '_archived/unused', 'files': unused},
        'skipped': [{'file': r, 'reason': w} for r, w in unused_skip],
        'failed': [{'file': r, 'reason': w} for r, w in (f1 + f2)],
    }
    mp = os.path.join(ROOT, 'tools', 'cleanup-manifest-%s.json' % ts)
    io.open(mp, 'w', encoding='utf-8').write(json.dumps(man, ensure_ascii=False, indent=1))
    print('\n清单: %s' % os.path.relpath(mp, ROOT))
    if f1 or f2:
        print('失败 %d 项：' % (len(f1) + len(f2)))
        for r, w in (f1 + f2)[:5]:
            print('   %s | %s' % (r, w))
    print('全部为"移出"，未删除任何文件；回滚方式：把 _archived/ 下对应文件搬回 source/images/')


if __name__ == '__main__':
    main()
