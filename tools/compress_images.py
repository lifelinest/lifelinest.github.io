# -*- coding: utf-8 -*-
"""
批量把 PNG / JPG 转成 WebP，并生成 manifest 供 scripts/image-cdn.js 使用。

特点:
  - 原图一律保留，只新增同名 .webp，随时可回退
  - 只把「转换成功」的图片写进 manifest，没成功的保持原样，不会裂图
  - 支持先跑小批量试水，确认画质再全量

用法:
    python tools/compress_images.py --limit 20            # 先转 20 张看看效果（默认只预览）
    python tools/compress_images.py --limit 20 --apply    # 实际转换
    python tools/compress_images.py --apply               # 全量转换
    python tools/compress_images.py --apply --quality 88  # 调整画质

参数:
    --quality     WebP 画质，默认 82（肉眼无损与体积的较好平衡点）
    --max-width   超过该宽度则等比缩放，默认 1920，0 表示不缩放
    --limit       只处理前 N 张（按体积从大到小），用于试跑
    --apply       真实写入；不加则只预览将要做什么
"""
import argparse
import io
import json
import os
import sys

try:
    from PIL import Image
    from PIL import ImageFile
    ImageFile.LOAD_TRUNCATED_IMAGES = True
    Image.MAX_IMAGE_PIXELS = None
except ImportError:
    print('缺少 Pillow，请先安装： pip install Pillow')
    sys.exit(1)

BLOG_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_DIR = os.path.join(BLOG_ROOT, 'source', 'images')
MANIFEST = os.path.join(IMG_DIR, 'webp-manifest.json')

SRC_EXT = ('.png', '.jpg', '.jpeg', '.bmp', '.tif', '.tiff')


def collect():
    items = []
    for dp, dn, fn in os.walk(IMG_DIR):
        for f in fn:
            if f.lower().endswith(SRC_EXT):
                p = os.path.join(dp, f)
                try:
                    items.append((os.path.getsize(p), p))
                except OSError:
                    continue
    # 体积大的优先，收益最高
    items.sort(key=lambda x: -x[0])
    return [p for _, p in items]


def convert(src, quality, max_width):
    """返回 (webp路径, 原大小, 新大小)；失败返回 None"""
    dst = os.path.splitext(src)[0] + '.webp'
    if os.path.exists(dst):
        return None  # 已存在，跳过，避免重复劳动
    try:
        with Image.open(src) as im:
            orig_mode = im.mode
            w, h = im.size
            if max_width and w > max_width:
                nh = int(h * max_width / w)
                im = im.resize((max_width, nh), Image.LANCZOS)

            # 带透明通道的用 RGBA，其余转 RGB，避免 WebP 保存报错
            if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
                im = im.convert('RGBA')
            else:
                im = im.convert('RGB')

            old = os.path.getsize(src)
            im.save(dst, 'WEBP', quality=quality, method=6)
            new = os.path.getsize(dst)
            if new >= old:
                # 转完反而更大，删掉，继续用原图
                os.remove(dst)
                return None
            return dst, old, new
    except Exception as e:
        if os.path.exists(dst):
            try:
                os.remove(dst)
            except OSError:
                pass
        print('  [跳过] %s : %s' % (os.path.basename(src), e))
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='实际写入（不加则只预览）')
    ap.add_argument('--quality', type=int, default=82)
    ap.add_argument('--max-width', type=int, default=1920)
    ap.add_argument('--limit', type=int, default=0)
    args = ap.parse_args()

    files = collect()
    if args.limit:
        files = files[:args.limit]
    print('待处理: %d 张\n' % len(files))

    manifest = {}
    if os.path.exists(MANIFEST):
        try:
            with io.open(MANIFEST, encoding='utf-8') as f:
                manifest = json.load(f)
        except Exception:
            manifest = {}

    saved = 0
    done = 0
    for i, src in enumerate(files, 1):
        rel = os.path.relpath(src, BLOG_ROOT).replace('\\', '/')
        key = '/' + rel
        webp_rel = os.path.splitext(rel)[0] + '.webp'

        if key in manifest and os.path.exists(os.path.join(BLOG_ROOT, webp_rel)):
            continue  # 已登记且文件还在

        if not args.apply:
            print('[预览] %s (%d KB)' % (rel, os.path.getsize(src) // 1024))
            continue

        r = convert(src, args.quality, args.max_width)
        if r:
            dst, old, new = r
            manifest[key] = '/' + os.path.splitext(rel)[0] + '.webp'
            saved += old - new
            done += 1
            print('[%d/%d] %s  %dKB -> %dKB  (省 %d%%)'
                  % (i, len(files), os.path.basename(src),
                     old // 1024, new // 1024,
                     int((old - new) * 100 / old)))

    if not args.apply:
        print('\n预览结束，加 --apply 才会真正转换。')
        return

    # 写 manifest（合并历史记录，去掉已失效的条目）
    valid = {}
    for k, v in manifest.items():
        p = os.path.join(BLOG_ROOT, v.lstrip('/'))
        if os.path.exists(p):
            valid[k] = v
    with io.open(MANIFEST, 'w', encoding='utf-8') as f:
        json.dump(valid, f, ensure_ascii=False, indent=1)

    print('\n本轮转换: %d 张，节省 %.1f MB' % (done, saved / 1024 / 1024))
    print('manifest 共 %d 条 -> %s' % (len(valid), MANIFEST))
    print('\n下一步: 把 _config.yml 里 image_cdn.webp 改成 true，然后 hexo server 检查效果。')


if __name__ == '__main__':
    main()
