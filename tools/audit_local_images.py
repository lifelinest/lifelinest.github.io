# -*- coding: utf-8 -*-
"""本地图片体检（只读，不改动任何文件）：总量/分布/重复/死图/裂图/大图候选。"""
import os, io, hashlib, collections

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'source')
IMG_EXT = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif')


def fsize(p):
    try:
        return os.path.getsize(p)
    except OSError:
        return 0


imgs = []
for dp, _, fn in os.walk(SRC):
    for f in fn:
        if f.lower().endswith(IMG_EXT):
            p = os.path.join(dp, f)
            imgs.append((p, os.path.relpath(p, ROOT).replace('\\', '/'), fsize(p)))

total = sum(s for _, _, s in imgs)
print('=== 1. 总量 ===')
print('本地图片: %d 张, %.1f MB' % (len(imgs), total / 1024 / 1024))

bydir, dirsz = collections.Counter(), collections.Counter()
for p, rel, s in imgs:
    top = '/'.join(rel.split('/')[:2])
    bydir[top] += 1
    dirsz[top] += s
print('\n=== 2. 目录分布 (Top 10) ===')
for d, c in bydir.most_common(10):
    print('  %-32s %4d 张  %8.1f MB' % (d, c, dirsz[d] / 1024 / 1024))

byext, extsz = collections.Counter(), collections.Counter()
for p, rel, s in imgs:
    e = os.path.splitext(rel)[1].lower()
    byext[e] += 1
    extsz[e] += s
print('\n=== 3. 格式分布 ===')
for e, c in byext.most_common():
    print('  %-8s %4d 张  %8.1f MB' % (e, c, extsz[e] / 1024 / 1024))

print('\n=== 4. 字节级重复（SHA-256）===')
hb = collections.defaultdict(list)
for p, rel, s in imgs:
    try:
        h = hashlib.sha256(open(p, 'rb').read()).hexdigest()
    except OSError:
        continue
    hb[h].append((rel, s))
dups = {h: v for h, v in hb.items() if len(v) > 1}
dup_extra = sum((len(v) - 1) * v[0][1] for v in dups.values())
print('重复组: %d 组 | 多余副本: %d 张 | 冗余空间: %.1f MB'
      % (len(dups), sum(len(v) - 1 for v in dups.values()), dup_extra / 1024 / 1024))
for h, v in list(dups.items())[:5]:
    print('  [%d 份] %s' % (len(v), v[0][0]))
    for rel, s in v[1:3]:
        print('          重复 -> %s' % rel)

unused = []
uf = os.path.join(ROOT, 'unused-images.txt')
if os.path.isfile(uf):
    for line in io.open(uf, encoding='utf-8'):
        parts = line.rstrip('\n').split('\t')
        if parts and parts[0]:
            unused.append((parts[0], int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0))
print('\n=== 5. 未被引用（死图）===')
print('%d 张, %.1f MB  ->  unused-images.txt' % (len(unused), sum(s for _, s in unused) / 1024 / 1024))

bf = os.path.join(ROOT, 'broken-image-refs.txt')
if os.path.isfile(bf):
    lines = [l.strip() for l in io.open(bf, encoding='utf-8') if l.strip()]
    print('\n=== 6. 历史裂图（引用指向不存在的本地文件）===')
    print('%d 处  ->  broken-image-refs.txt' % len(lines))

print('\n=== 7. 体积最大的 15 张 ===')
for p, rel, s in sorted(imgs, key=lambda x: -x[2])[:15]:
    print('  %8.2f MB  %s' % (s / 1024 / 1024, rel))

# 大图（>500KB）统计，作为压缩候选
big = [x for x in imgs if x[2] > 500 * 1024]
print('\n=== 8. 压缩候选（单张 >500KB）===')
print('%d 张, 合计 %.1f MB（占总量 %.0f%%）'
      % (len(big), sum(s for _, _, s in big) / 1024 / 1024,
         100.0 * sum(s for _, _, s in big) / total if total else 0))

# 导出体检报告
with io.open(os.path.join(ROOT, 'tools', 'local-images-report.txt'), 'w', encoding='utf-8') as f:
    f.write('本地图片体检报告\n')
    f.write('本地图片: %d 张, %.1f MB\n' % (len(imgs), total / 1024 / 1024))
    f.write('死图(未引用): %d 张, %.1f MB\n' % (len(unused), sum(s for _, s in unused) / 1024 / 1024))
    f.write('字节级重复: %d 组, 冗余 %.1f MB\n' % (len(dups), dup_extra / 1024 / 1024))
    f.write('压缩候选(>500KB): %d 张, %.1f MB\n' % (len(big), sum(s for _, _, s in big) / 1024 / 1024))
print('\n报告已导出: tools/local-images-report.txt')
