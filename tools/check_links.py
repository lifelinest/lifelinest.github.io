# -*- coding: utf-8 -*-
"""安全校验：source 下所有 /images/、/img/ 引用都能对上本地真实文件。"""
import os
import re
import io
import sys
import urllib.parse

BLOG_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNUSED = os.path.join(BLOG_ROOT, '_unused_images')
RESTORE = '--restore' in sys.argv
REF = re.compile(r'/(?:images|img)/[^\s"\')>]+')
SCAN_DIRS = [os.path.join(BLOG_ROOT, 'source'), os.path.join(BLOG_ROOT, 'themes')]
SCAN_FILES = [os.path.join(BLOG_ROOT, '_config.yml'),
              os.path.join(BLOG_ROOT, '_config.anzhiyu.yml')]

missing = []
checked = 0
for base in SCAN_DIRS:
    if not os.path.isdir(base):
        continue
    for dp, dn, fn in os.walk(base):
        for f in fn:
            if os.path.splitext(f)[1].lower() not in (
                    '.md', '.html', '.yml', '.yaml', '.json', '.js', '.css', '.pug', '.ejs', '.styl'):
                continue
            p = os.path.join(dp, f)
            try:
                txt = io.open(p, encoding='utf-8', errors='ignore').read()
            except Exception:
                continue
            for m in REF.finditer(txt):
                rel = 'source' + urllib.parse.unquote(m.group(0))
                if not rel.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg')):
                    continue
                checked += 1
                if not os.path.isfile(os.path.join(BLOG_ROOT, rel)):
                    missing.append((os.path.relpath(p, BLOG_ROOT), rel))

for p in SCAN_FILES:
    if not os.path.isfile(p):
        continue
    txt = io.open(p, encoding='utf-8', errors='ignore').read()
    for m in REF.finditer(txt):
        rel = 'source' + urllib.parse.unquote(m.group(0))
        if not rel.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg')):
            continue
        checked += 1
        if not os.path.isfile(os.path.join(BLOG_ROOT, rel)):
            missing.append((os.path.basename(p), rel))

seen = set()
uniq_missing = []
for src, rel in missing:
    if rel in seen:
        continue
    seen.add(rel)
    uniq_missing.append(rel)

if uniq_missing and os.path.isdir(UNUSED) and not RESTORE:
    print('\n提示：可用 python tools/check_links.py --restore 自动从 _unused_images/ 搬回。')

if RESTORE and uniq_missing:
    import shutil
    done = miss = 0
    for rel in uniq_missing:
        sub = rel.split('/', 1)[1] if '/' in rel else os.path.basename(rel)
        src = os.path.join(UNUSED, sub)
        dst = os.path.join(BLOG_ROOT, rel)
        if not os.path.isfile(src):
            miss += 1
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        try:
            shutil.move(src, dst)
            done += 1
        except OSError as e:
            print('  失败: %s  %s' % (rel, e))
            miss += 1
    print('\n已还原 %d 张；_unused_images/ 里找不到 %d 张（需另行处理）。' % (done, miss))

print('检查引用总数:', checked)
print('指向不存在文件的引用:', len(missing), '（去重后 %d 个文件）' % len(uniq_missing))
if uniq_missing and not RESTORE:
    print()
    print('=== 断链明细（前 20）===')
    for src, rel in missing[:20]:
        print('  %s  ->  %s' % (src[:60], rel[:90]))
    sys.exit(1)
elif RESTORE:
    print('已执行还原，请重新运行本脚本复核。')
else:
    print('全部引用均可解析，移动未造成断链。')
