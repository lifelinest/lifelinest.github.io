#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Read-only audit of blog local images. No file is modified."""
import os, re, hashlib, io, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # Blog/
SRC = os.path.join(ROOT, 'source')
IMG_DIRS = [os.path.join(SRC, 'images'), os.path.join(SRC, 'img')]
EXTS = ('.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.avif')
SCAN_EXTS = ('.md', '.html', '.yml', '.yaml', '.json', '.js', '.css')
REF_RE = re.compile(r'/(?:images|img)/[^\s"\'\)>]+')

def human(n):
    for u in ('B', 'KB', 'MB', 'GB'):
        if n < 1024: return f"{n:.1f}{u}"
        n /= 1024
    return f"{n:.1f}TB"

def collect_refs():
    refs = set()
    for dp, dn, fn in os.walk(SRC):
        # skip heavy / irrelevant trees
        if any(seg in dp for seg in ('/node_modules', '/.git', '/themes')):
            continue
        for f in fn:
            if not f.lower().endswith(SCAN_EXTS):
                continue
            try:
                t = io.open(os.path.join(dp, f), encoding='utf-8', errors='ignore').read()
            except Exception:
                continue
            for m in REF_RE.findall(t):
                refs.add(urllib.parse.unquote(m))
    return refs

def list_images():
    out = {}
    for d in IMG_DIRS:
        if not os.path.isdir(d):
            continue
        for dp, dn, fn in os.walk(d):
            for f in fn:
                if f.lower().endswith(EXTS):
                    p = os.path.join(dp, f)
                    out[os.path.relpath(p, ROOT).replace(os.sep, '/')] = os.path.getsize(p)
    return out

def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as fh:
        for chunk in iter(lambda: fh.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()

def norm_key(path):
    p = urllib.parse.unquote(path).lstrip('/')
    parts = [x for x in p.split('/') if x not in ('', '.')]
    if parts and parts[0] == 'source':
        parts = parts[1:]
    # drop any '..' (relative parent refs) for matching
    parts = [x for x in parts if x != '..']
    return '/'.join(parts).lower()

def main():
    refs = collect_refs()
    imgs = list_images()
    total = len(imgs)
    total_size = sum(imgs.values())

    # key: normalized 'images/foo.png' -> image rel
    img_keys = {norm_key(rel): rel for rel, sz in imgs.items()}

    # which refs point to a real local image
    ref_keys = set()
    for r in refs:
        if r.lower().endswith(EXTS):
            ref_keys.add(norm_key(r))

    used, orphan = {}, {}
    for rel, sz in imgs.items():
        if norm_key(rel) in ref_keys:
            used[rel] = sz
        else:
            orphan[rel] = sz

    # broken refs: referenced (image ext) but file missing under source/
    broken = []
    for r in sorted(refs):
        if r.lower().endswith(EXTS):
            cand = os.path.join(SRC, *norm_key(r).split('/'))
            if not os.path.exists(cand):
                broken.append(r)

    # duplicates by content
    by_hash = {}
    for rel, sz in imgs.items():
        h = sha256(os.path.join(ROOT, *rel.split('/')))
        by_hash.setdefault(h, []).append((rel, sz))
    dup_groups = {h: v for h, v in by_hash.items() if len(v) > 1}
    dup_count = sum(len(v) - 1 for v in dup_groups.values())
    dup_waste = sum((len(v) - 1) * v[0][1] for v in dup_groups.values())

    print("=" * 60)
    print("博客本地图片 检测报告（只读）")
    print("=" * 60)
    print(f"本地图片总数        : {total} 张")
    print(f"本地图片总体积      : {human(total_size)}")
    print(f"被引用（非孤儿）     : {len(used)} 张 / {human(sum(used.values()))}")
    print(f"未引用（孤儿）       : {len(orphan)} 张 / {human(sum(orphan.values()))}")
    print(f"引用但文件缺失(裂图) : {len(broken)} 处")
    print(f"内容完全重复图       : {dup_count} 张（可去重省 {human(dup_waste)}）")
    print("-" * 60)
    print("体积最大的 15 张：")
    for rel, sz in sorted(imgs.items(), key=lambda x: -x[1])[:15]:
        print(f"  {human(sz):>8}  {rel}")
    print("-" * 60)
    print(f"孤儿 Top10（最占空间）：")
    for rel, sz in sorted(orphan.items(), key=lambda x: -x[1])[:10]:
        print(f"  {human(sz):>8}  {rel}")
    print("=" * 60)
    print("结论：迁移后这些本地图可移出 source/ 归档，仓库体积将从")
    print(f"约 {human(total_size)} 降到接近 0（引用全部改指图床 URL）。")

if __name__ == '__main__':
    main()
