# -*- coding: utf-8 -*-
"""
图床图片可用性校验器 —— 解决「迁移后图片失效」的核心工具。

为什么需要它:
  CloudFlare-ImgBed 对「不存在的路径」会返回 HTTP 200 + 一个 HTML 回退页，
  而不是 404。普通脚本会被 200 骗过，报「全部成功」，
  结果线上图片其实全是裂图。本工具用三重检查识破这种「假成功」:
    1) HTTP 状态码
    2) Content-Type 必须是 image/*（HTML 回退页是 text/html）
    3) 文件头魔数匹配（PNG/JPG/... 的真实二进制特征）

它只读不写，纯校验，随时可跑。配合 upload_to_cdn.py 的映射表使用。

用法:
    # 校验上传结果（默认读 cdn-manifest.json）
    python tools/verify_cdn_images.py

    # 只校验前 20 张
    python tools/verify_cdn_images.py --limit 20

    # 只重跑上次失败的
    python tools/verify_cdn_images.py --retry-failed
"""
import argparse
import io
import json
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

BLOG_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(BLOG_ROOT, 'cdn-manifest.json')

MAGIC = [
    ('.png', b'\x89PNG\r\n\x1a\n'),
    ('.jpg', b'\xff\xd8\xff'),
    ('.jpeg', b'\xff\xd8\xff'),
    ('.gif', b'GIF8'),
    ('.webp', b'RIFF'),
    ('.bmp', b'BM'),
]


def sniff(data, rel):
    ext = os.path.splitext(rel)[1].lower()
    if ext == '.svg':
        head = data[:512].lstrip().lower()
        return head.startswith(b'<svg') or head.startswith(b'<?xml')
    for e, sig in MAGIC:
        if ext == e:
            return data.startswith(sig)
    return bool(data)


def range_check(url, timeout=15):
    """用 Range 请求取前 2KB：既是真实图片也能拿到类型与大小。"""
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (image-migration-verifier)',
        'Range': 'bytes=0-2047',
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = r.read(2048)
            cr = r.headers.get('Content-Range') or ''
            total = None
            if '/' in cr:
                try:
                    total = int(cr.rsplit('/', 1)[-1])
                except ValueError:
                    total = None
            if total is None and r.headers.get('Content-Length'):
                try:
                    total = int(r.headers['Content-Length'])
                except ValueError:
                    total = None
            return r.status, data, total, r.headers.get('Content-Type', '')
    except urllib.error.HTTPError as e:
        return e.code, b'', None, ''
    except Exception as e:
        return None, b'', None, '%s: %s' % (type(e).__name__, e)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--manifest', default=MANIFEST)
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--workers', type=int, default=8)
    ap.add_argument('--timeout', type=int, default=15)
    ap.add_argument('--retry-failed', action='store_true')
    ap.add_argument('--output', default='cdn-verify-report.json')
    args = ap.parse_args()

    if not os.path.exists(args.manifest):
        print('找不到映射表 %s' % args.manifest)
        print('请先运行 upload_to_cdn.py 生成映射表。')
        sys.exit(2)

    man = json.load(io.open(args.manifest, encoding='utf-8'))
    items = man.get('items', {})
    failed = man.get('failed', {})
    # (rel, cdn_url, local_size)
    rows = []
    for rel, info in items.items():
        cdn = info.get('cdn') if isinstance(info, dict) else info
        if not cdn:
            continue
        if args.retry_failed and rel not in failed:
            continue
        size = info.get('size', 0) if isinstance(info, dict) else 0
        rows.append((rel, cdn, size))

    if args.limit:
        rows = rows[:args.limit]
    if not rows:
        print('没有可校验的图片（映射表为空或全部已校验通过）。')
        return

    print('映射表   : %s' % args.manifest)
    print('待校验   : %d 张\n' % len(rows))

    ok, bad_size, fake, missing = [], [], [], []
    start = time.time()

    def work(row):
        rel, cdn, size = row
        status, data, total, ctype = range_check(cdn, args.timeout)
        return rel, cdn, size, status, total, data, ctype

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(work, r) for r in rows]
        done = 0
        for f in as_completed(futs):
            rel, cdn, size, status, total, data, ctype = f.result()
            done += 1
            if status != 200:
                missing.append({'local': rel, 'url': cdn, 'status': status})
                flag = 'MISS'
            elif ctype and not ctype.lower().startswith('image/'):
                fake.append({'local': rel, 'url': cdn, 'content_type': ctype})
                flag = 'FAKE'
            elif not sniff(data, rel):
                fake.append({'local': rel, 'url': cdn, 'content_type': ctype, 'reason': 'magic-mismatch'})
                flag = 'FAKE'
            elif total and size and abs(int(total) - size) > 1:
                bad_size.append({'local': rel, 'url': cdn, 'local_size': size, 'remote_size': int(total)})
                flag = 'SIZE'
            else:
                ok.append({'local': rel, 'url': cdn, 'size': size})
                flag = 'OK'
            if done % 20 == 0 or done == len(rows):
                print('  进度 %d/%d  [%s %d | 假成功 %d | 缺失 %d | 大小不符 %d]'
                      % (done, len(rows), 'OK', len(ok), len(fake), len(missing), len(bad_size)))

    report = {
        'manifest': args.manifest,
        'checked': len(rows),
        'ok': len(ok),
        'size_mismatch': len(bad_size),
        'fake': len(fake),
        'missing': len(missing),
        'ok_list': ok,
        'size_mismatch_list': bad_size,
        'fake_list': fake,
        'missing_list': missing,
        'elapsed_sec': round(time.time() - start, 1),
    }
    out = os.path.join(BLOG_ROOT, args.output)
    with io.open(out, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=1)

    print('\n' + '=' * 60)
    print('可用             : %d 张' % len(ok))
    print('大小不符         : %d 张   <- 上传中断/传错，必须重传' % len(bad_size))
    print('假成功(SPA回退)  : %d 张   <- 服务器返回 HTML 却报 200，必须重传' % len(fake))
    print('缺失/失败        : %d 张' % len(missing))
    print('耗时             : %.1f 秒' % report['elapsed_sec'])
    print('报告             : %s' % out)

    if bad_size:
        print('\n大小不符明细（前 10）:')
        for d in bad_size[:10]:
            print('  %s  本地 %d B / 远端 %s B' % (d['local'], d['local_size'], d['remote_size']))
    if fake:
        print('\n假成功明细（前 10，最容易踩的坑）:')
        for d in fake[:10]:
            print('  %s  -> %s  (Content-Type=%s)' % (d['local'], d.get('reason', ''), d['content_type']))
    if missing:
        print('\n缺失明细（前 10）:')
        for d in missing[:10]:
            print('  %s  -> HTTP %s' % (d['local'], d['status']))

    if not missing and not bad_size and not fake:
        print('\n全部通过，可以放心开启渲染替换。')
    else:
        print('\n还有问题，先别开 image_cdn.enable。')


if __name__ == '__main__':
    main()
