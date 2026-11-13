# -*- coding: utf-8 -*-
"""
整站图片 -> 图床 上传器（Sanyue ImgHub / CloudFlare-ImgBed）

设计要点（遵守图床现有文件规则）:
  图床 /upload 支持 uploadFolder 参数，可以按相对路径归类。
  你现在的图床规则是 /file/<大类>/<子路径>，例如:
      /file/文章/2026年/九月/2026海外保号卡对比/...
      /file/系统/头像/...
  本脚本把本地 source/images 的结构 1:1 镜像到图床的 /file/blog/ 下:
      source/images/01-login.png        -> /file/blog/01-login.png
      source/images/essay/x.png         -> /file/blog/essay/x.png
      source/img/todo.webp              -> /file/blog/todo.webp
  这样既合你的「分类目录」规则，又能和本地逐一对照、随时回退。

  去重: 字节级相同的图片只传一份，多个本地路径共享同一个图床地址，
        避免把复制粘贴产生的重复图（如 1.jpg-<uuid>.png）也搬上图床。

  映射表 cdn-manifest.json 是渲染替换的唯一依据，键为本地相对路径
  （如 source/images/01-login.png），值为图床完整 URL。

安全设计:
  - 默认只「演练」：打印将要上传到哪个目录，不发任何网络请求。
    必须显式加 --apply 才真正上传。
  - authCode 从环境变量 IMG_CDN_AUTH 读取；也可设 IMG_CDN_TOKEN 走
    Authorization 请求头（推荐，权限更细）。
  - 断点续传: 已成功的写进 manifest，重跑不重复传；跨运行也按内容哈希去重。
  - 失败隔离: 单张失败不影响整体，最后汇总失败清单。
  - 限流保护: 默认小并发 + 间隔，遇 429 自动退避。

用法:
    # 1) 只读统计：去重效果 + 实际要传多少张（不发请求）
    python tools/upload_to_cdn.py --stats

    # 2) 演练：只看会传到哪些目录（不发请求）
    python tools/upload_to_cdn.py --dry-run --limit 10

    # 3) 设置凭证后，小规模试传（前 10 张最大的）
    export IMG_CDN_AUTH="你的 authCode"
    python tools/upload_to_cdn.py --apply --limit 10

    # 4) 全量上传（边传边写 manifest，可随时中断重跑）
    python tools/upload_to_cdn.py --apply

    # 5) 只重试之前失败的
    python tools/upload_to_cdn.py --apply --retry-failed
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
import mimetypes
import ssl
import hashlib

BLOG_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(BLOG_ROOT, 'cdn-manifest.json')

DEFAULT_DOMAIN = 'https://cloudflare-img-bzb.pages.dev'
SRC_EXT = ('.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg')
ROOT_CATEGORY = 'blog'  # 迁移图片统一放在 /file/blog/ 下，与手动的 文章/系统 隔离


def collect_images():
    items = []
    for base in ('source/images', 'source/img'):
        root = os.path.join(BLOG_ROOT, base)
        if not os.path.isdir(root):
            continue
        for dp, dn, fn in os.walk(root):
            for f in fn:
                if f.lower().endswith(SRC_EXT):
                    p = os.path.join(dp, f)
                    rel = os.path.relpath(p, BLOG_ROOT).replace('\\', '/')
                    try:
                        items.append((rel, os.path.getsize(p)))
                    except OSError:
                        continue
    items.sort(key=lambda x: -x[1])
    return items


def file_hash(rel):
    h = hashlib.sha256()
    with open(os.path.join(BLOG_ROOT, rel), 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def target_folder(rel):
    """本地相对路径 -> 图床 uploadFolder（不含文件名）"""
    if rel.startswith('source/images/'):
        sub = rel[len('source/images/'):]
    elif rel.startswith('source/img/'):
        sub = rel[len('source/img/'):]
    else:
        sub = rel[len('source/'):] if rel.startswith('source/') else rel
    d = os.path.dirname(sub)
    return ROOT_CATEGORY if not d else ROOT_CATEGORY + '/' + d


def load_manifest():
    if os.path.exists(MANIFEST):
        try:
            return json.load(io.open(MANIFEST, encoding='utf-8'))
        except Exception:
            pass
    return {'domain': DEFAULT_DOMAIN, 'items': {}}


def save_manifest(m):
    tmp = MANIFEST + '.tmp'
    with io.open(tmp, 'w', encoding='utf-8') as f:
        json.dump(m, f, ensure_ascii=False, indent=1)
    os.replace(tmp, MANIFEST)


def upload_one(rel, domain, auth, token, channel):
    local = os.path.join(BLOG_ROOT, rel)
    folder = target_folder(rel)
    q = {
        'returnFormat': 'full',
        'uploadNameType': 'default',
        'uploadChannel': channel,
        'autoRetry': 'true',
        'serverCompress': 'false',
        'uploadFolder': folder,
    }
    if auth:
        q['authCode'] = auth
    qs = '&'.join('%s=%s' % (k, urllib.parse.quote(str(v), safe='')) for k, v in q.items())
    url = '%s/upload?%s' % (domain, qs)

    ctype = mimetypes.guess_type(local)[0] or 'application/octet-stream'
    boundary = '----bndry%d' % int(time.time() * 1000)
    hdr = ('--%s\r\n' % boundary).encode()
    hdr += ('Content-Disposition: form-data; name="file"; filename="%s"\r\n'
            % os.path.basename(local)).encode('utf-8')
    hdr += ('Content-Type: %s\r\n\r\n' % ctype).encode()
    tail = ('\r\n--%s--\r\n' % boundary).encode()
    body = hdr + open(local, 'rb').read() + tail
    headers = {
        'User-Agent': 'Mozilla/5.0 (blog-image-migrator)',
        'Content-Type': 'multipart/form-data; boundary=%s' % boundary,
    }
    if token:
        headers['Authorization'] = token
    req = urllib.request.Request(url, data=body, method='POST', headers=headers)
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=90, context=ctx) as r:
            raw = r.read().decode('utf-8', 'replace')
            code = r.status
    except urllib.error.HTTPError as e:
        return None, e.code, e.read().decode('utf-8', 'replace')[:300]
    except Exception as e:
        return None, None, '%s: %s' % (type(e).__name__, e)
    if code != 200:
        return None, code, raw[:300]
    try:
        j = json.loads(raw)
    except Exception:
        return None, 'json', raw[:300]
    arr = j if isinstance(j, list) else (j.get('data') or [])
    if not arr:
        return None, 'empty', raw[:300]
    cdn = arr[0].get('publicUrl') or arr[0].get('src', '')
    if not cdn:
        return None, 'nosrc', raw[:300]
    if cdn.startswith('/file'):
        cdn = domain.rstrip('/') + cdn
    return cdn, 200, ''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--domain', default=DEFAULT_DOMAIN)
    ap.add_argument('--apply', action='store_true',
                    help='真正的上传开关。不加则只演练/统计（不发请求）')
    ap.add_argument('--stats', action='store_true',
                    help='只读统计去重效果与实际待传张数（不发请求）')
    ap.add_argument('--channel', default='cfr2', choices=['telegram', 'cfr2'])
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--retry-failed', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    man = load_manifest()
    man.setdefault('domain', args.domain)
    man.setdefault('items', {})

    items = collect_images()
    done = set(man['items'].keys())

    if args.retry_failed:
        todo = [(r, s) for (r, s) in items if r in man.get('failed', {})]
    else:
        todo = [(r, s) for (r, s) in items if r not in done]

    if args.limit:
        todo = todo[:args.limit]

    if not todo:
        print('没有需要上传的图片（全部已记录或均失败需 --retry-failed）。')
        return

    # ---- 只读统计 ----
    if args.stats:
        groups = {}
        for rel, _ in todo:
            groups.setdefault(file_hash(rel), []).append(rel)
        dup_groups = [v for v in groups.values() if len(v) > 1]
        dup_files = sum(len(v) - 1 for v in dup_groups)
        print('图床域   : %s' % args.domain)
        print('根目录   : /file/%s/' % ROOT_CATEGORY)
        print('扫描到   : %d 张（本地）' % len(items))
        print('待上传   : %d 张' % len(todo))
        print('其中重复 : %d 张（%d 组），去重后实传 %d 张'
              % (dup_files, len(dup_groups), len(todo) - dup_files))
        print('\n重复组样例（前 5 组）:')
        for v in dup_groups[:5]:
            print('  组(%d张): %s' % (len(v), v[0]))
            for p in v[1:3]:
                print('        = %s' % p)
        return

    # ---- 演练 ----
    if not args.apply:
        print('【演练模式】以下为计划上传的目录归属（不发送任何请求）：')
        print('图床域   : %s' % args.domain)
        print('根目录   : /file/%s/' % ROOT_CATEGORY)
        print('命名方式 : default（前缀_原名）')
        print('渠道     : %s（不压缩、不限大小）' % args.channel)
        print('待上传   : %d 张\n' % len(todo))
        for i, (rel, size) in enumerate(todo[:30], 1):
            print('  %2d. %s  (%.1f KB)\n       -> /file/%s/%s'
                  % (i, rel, size / 1024, target_folder(rel),
                     os.path.basename(rel)))
        if len(todo) > 30:
            print('  ... 其余 %d 张省略' % (len(todo) - 30))
        print('\n确认无误后，设置 IMG_CDN_AUTH 并加 --apply 执行真实上传。')
        return

    # ---- 真实上传（带内容哈希去重）----
    auth = os.environ.get('IMG_CDN_AUTH', '')
    token = os.environ.get('IMG_CDN_TOKEN', '')
    if not auth and not token:
        print('缺少凭证。请设置其一：')
        print('  export IMG_CDN_AUTH="你的 authCode"')
        print('  export IMG_CDN_TOKEN="带有 upload 权限的 Token"')
        sys.exit(2)

    # 跨运行去重：从已有 manifest 建立 哈希->URL 缓存
    hash_cache = {}
    for rel, meta in man['items'].items():
        h = meta.get('hash')
        if h and meta.get('cdn'):
            hash_cache[h] = meta['cdn']

    print('图床     : %s' % args.domain)
    print('渠道     : %s' % args.channel)
    print('待上传   : %d 张\n' % len(todo))

    ok = 0
    reused = 0
    fail = {}
    start = time.time()
    for i, (rel, size) in enumerate(todo, 1):
        h = file_hash(rel)
        if h in hash_cache:
            # 内容已传过（本轮或上一轮），直接复用，不再上传
            man['items'][rel] = {'cdn': hash_cache[h], 'size': size, 'hash': h}
            reused += 1
            ok += 1
            mark = 'REUSE'
        else:
            backoff = 1
            cdn = None
            for attempt in range(4):
                cdn, code, err = upload_one(rel, args.domain, auth, token, args.channel)
                if cdn:
                    break
                if code == 429:
                    time.sleep(backoff)
                    backoff = min(backoff * 2, 30)
                else:
                    time.sleep(1)
            if cdn:
                man['items'][rel] = {'cdn': cdn, 'size': size, 'hash': h}
                hash_cache[h] = cdn
                ok += 1
                mark = 'OK'
            else:
                fail[rel] = code if code is not None else err
                mark = 'FAIL(%s)' % fail[rel]
        if i % 10 == 0 or i == len(todo):
            save_manifest(man)
            print('  进度 %d/%d  成功 %d(含复用 %d)  失败 %d'
                  % (i, len(todo), ok, reused, len(fail)))

    man['failed'] = fail
    save_manifest(man)

    print('\n' + '=' * 60)
    print('本次上传 : %d（其中去重复用 %d 张，新传 %d 张）' % (ok, reused, ok - reused))
    print('本次失败 : %d' % len(fail))
    print('累计已传 : %d / %d 张' % (len(man['items']), len(items)))
    print('映射表   : %s' % MANIFEST)
    print('耗时     : %.1f 秒' % (time.time() - start))
    if fail:
        print('\n失败明细（前 10）:')
        for k, v in list(fail.items())[:10]:
            print('  %s -> %s' % (k, v))
        print('\n重跑: python tools/upload_to_cdn.py --apply --retry-failed')


if __name__ == '__main__':
    main()
