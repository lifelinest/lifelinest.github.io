# -*- coding: utf-8 -*-
"""
图床图片 WebP 转码上传器（B 方案自动化）

背景:
  cloudflare-img-bzb.pages.dev 是原文件直读，实测 ?format=webp 等参数被忽略
  （同 URL 加参数返回字节级相同的 PNG）——CDN 侧无法实时转格式。
  => 要吃 WebP 红利只能「重编码 + 重上传」，本工具把这条链自动化:
     下载原图 -> Pillow 转 WebP(q82) -> 上传到 /file/blog/optim/ -> 记进 img-optim.json
     构建时 scripts/img-optim.js 据 webp 字段把 <img> 包成 <picture>（webp 优先原图兜底）。

安全设计:
  - 默认演练（--no-apply）: 只下载+转码+打印压缩率，不上传、不写 manifest 的 webp 字段
  - 必须显式 --apply 才真正上传；凭证从 IMG_CDN_AUTH（authCode）或 IMG_CDN_TOKEN（header）读
  - 已是 webp/gif/svg 的跳过；小于 --min-bytes 的跳过（收益太小不值得多一个文件）
  - 压缩率不足 --min-save-pct 的放弃转码（记录原因，不动原图）
  - 内容哈希去重: 相同字节只传一份，多 URL 共享同一 webp 地址
  - 断点续传: manifest 里已有 webp 的 URL 跳过，可随时中断重跑
  - 串行上传（小并发+退避），遇 429 自动等待

前置:
  pip install --target D:\\1\\1\\.tmp\\pylibs pillow   （本脚本自动挂该路径，不占 C 盘）

用法:
  python tools/img-optimize.py --limit 3            # 演练 3 张，看压缩率
  python tools/img-optimize.py --apply --limit 10   # 真传 10 张试点
  python tools/img-optimize.py --apply              # 全量（可中断重跑）
"""
import os
import re
import sys
import json
import time
import hashlib
import argparse
import subprocess
import mimetypes
import ssl
import urllib.request
import urllib.error
import urllib.parse

BLOG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, r'D:\1\1\.tmp\pylibs')  # Pillow 装在 D 盘，不占 C

MANIFEST = os.path.join(BLOG, 'img-optim.json')
WORK = r'D:\1\1\.tmp\img-opt'          # 原图/产物暂存，全在 D 盘
DOMAIN = 'https://cloudflare-img-bzb.pages.dev'
UPLOAD_FOLDER = '/file/blog/optim'
SKIP_EXT = ('.webp', '.gif', '.svg')
W = WORK + r'\orig'
V = WORK + r'\webp'


def log(msg):
    print(msg, flush=True)


def load_manifest():
    try:
        d = json.load(open(MANIFEST, encoding='utf-8'))
    except Exception:
        return {}
    d.pop('_meta', None)
    return d


def save_manifest(d, extra_note=''):
    meta = d.get('_meta', {})
    d['_meta'] = dict(meta, webp_updated=time.strftime('%Y-%m-%d %H:%M:%S'),
                      note='img-optim.js 消费；webp 字段由 img-optimize.py 写入' + extra_note)
    tmp = MANIFEST + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False)
    os.replace(tmp, MANIFEST)


def download(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    r = subprocess.run(['curl', '-s', '-m', '120', '-L', '-A', 'Mozilla/5.0',
                        '-o', dest, url], capture_output=True, timeout=150)
    if r.returncode != 0 or not os.path.exists(dest) or os.path.getsize(dest) == 0:
        return None
    return dest


def convert(src, dst, quality):
    from PIL import Image  # noqa: 延迟导入
    im = Image.open(src)
    if getattr(im, 'is_animated', False):
        raise RuntimeError('animated-动图转webp丢帧，跳过（保留原图）')
    im.load()
    has_alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
    if has_alpha:
        im = im.convert('RGBA')
    else:
        im = im.convert('RGB')
    im.save(dst, 'WEBP', quality=quality, method=6)
    return os.path.getsize(dst)


def upload_one(local_path, auth, token, channel='cfr2'):
    """上传到 /file/blog/optim/（与 tools/upload_to_cdn.py 同一套上传协议）。"""
    q = {
        'returnFormat': 'full',
        'uploadNameType': 'default',
        'uploadChannel': channel,
        'autoRetry': 'true',
        'serverCompress': 'false',
        'uploadFolder': UPLOAD_FOLDER,
    }
    if auth:
        q['authCode'] = auth
    qs = '&'.join('%s=%s' % (k, urllib.parse.quote(str(v), safe='')) for k, v in q.items())
    url = '%s/upload?%s' % (DOMAIN, qs)
    ctype = mimetypes.guess_type(local_path)[0] or 'image/webp'
    boundary = '----bndry%d' % int(time.time() * 1000)
    hdr = ('--%s\r\n' % boundary).encode()
    hdr += ('Content-Disposition: form-data; name="file"; filename="%s"\r\n'
            % os.path.basename(local_path)).encode('utf-8')
    hdr += ('Content-Type: %s\r\n\r\n' % ctype).encode()
    tail = ('\r\n--%s--\r\n' % boundary).encode()
    body = hdr + open(local_path, 'rb').read() + tail
    headers = {'User-Agent': 'Mozilla/5.0 (blog-img-optim)',
               'Content-Type': 'multipart/form-data; boundary=%s' % boundary}
    if token:
        headers['Authorization'] = token
    req = urllib.request.Request(url, data=body, method='POST', headers=headers)
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=120, context=ctx) as r:
            raw = r.read().decode('utf-8', 'replace')
            code = r.status
    except urllib.error.HTTPError as e:
        return None, e.code, e.read().decode('utf-8', 'replace')[:200]
    except Exception as e:
        return None, None, '%s: %s' % (type(e).__name__, e)
    if code != 200:
        return None, code, raw[:200]
    try:
        j = json.loads(raw)
    except Exception:
        return None, 'json', raw[:200]
    arr = j if isinstance(j, list) else (j.get('data') or [])
    if not arr:
        return None, 'empty', raw[:200]
    cdn = arr[0].get('publicUrl') or arr[0].get('src', '')
    if not cdn:
        return None, 'nosrc', raw[:200]
    if cdn.startswith('/file'):
        cdn = DOMAIN + cdn
    return cdn, 200, ''


def ext_of(u):
    e = u.rsplit('.', 1)[-1].lower()
    return '.' + e if len(e) <= 5 else ''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='真正上传；不加则只演练（下载+转码+统计）')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--min-bytes', type=int, default=100 * 1024, help='小于此字节的原图跳过')
    ap.add_argument('--min-save-pct', type=int, default=10, help='压缩率低于此百分比的放弃')
    ap.add_argument('--quality', type=int, default=82)
    a = ap.parse_args()

    auth = os.environ.get('IMG_CDN_AUTH', '')
    token = os.environ.get('IMG_CDN_TOKEN', '')
    if a.apply and not auth and not token:
        log('❌ --apply 需要凭证: 设 IMG_CDN_AUTH（authCode）或 IMG_CDN_TOKEN（header）后重跑')
        return 1
    try:
        import PIL  # noqa
        from PIL import Image  # noqa
    except ImportError:
        log('❌ 缺 Pillow: pip install --target D:\\1\\1\\.tmp\\pylibs pillow')
        return 1

    os.makedirs(W, exist_ok=True)
    os.makedirs(V, exist_ok=True)

    man = load_manifest()
    hash2webp = {}
    for u, rec in man.items():
        if isinstance(rec, dict) and rec.get('webp'):
            hash2webp[rec.get('orig_sha', '')] = rec['webp']

    cands = []
    for u, rec in man.items():
        if not isinstance(rec, dict) or rec.get('webp'):
            continue
        e = ext_of(u)
        if not e or e in SKIP_EXT:
            continue
        sz = rec.get('size') or 0
        if sz and sz < a.min_bytes:
            continue
        cands.append((sz or 0, u))
    cands.sort(reverse=True)  # 大图优先（收益最大）
    if a.limit:
        cands = cands[:a.limit]

    log('候选 %d 张（非webp、≥%dKB、按体积降序）| 模式: %s'
        % (len(cands), a.min_bytes // 1024, 'APPLY 真传' if a.apply else '演练(不上传)'))
    tot_o = tot_w = skip_low = fail = ok = 0
    for i, (sz, u) in enumerate(cands, 1):
        name = hashlib.sha1(u.encode()).hexdigest()[:12] + ext_of(u)
        src = os.path.join(W, name)
        dst = os.path.join(V, name + '.webp')
        try:
            if not download(u, src):
                log('  [%d/%d] 下载失败 %s' % (i, len(cands), u[:90]))
                fail += 1
                continue
            ob = os.path.getsize(src)
            sha = hashlib.sha1(open(src, 'rb').read()).hexdigest()[:12]
            wb = convert(src, dst, a.quality)
            save = (1 - wb / ob) * 100 if ob else 0
            tot_o += ob
            tot_w += wb
            if save < a.min_save_pct:
                skip_low += 1
                log('  [%d/%d] 放弃(省%.0f%%<%d%%) %dB %s' % (i, len(cands), save, a.min_save_pct, ob, u[-60:]))
                continue
            if sha in hash2webp:
                webp_url = hash2webp[sha]  # 内容去重：复用已传地址
                log('  [%d/%d] 内容重复，复用已传 webp' % (i, len(cands)))
            elif a.apply:
                webp_url, code, err = upload_one(dst, auth, token)
                if not webp_url:
                    log('  [%d/%d] ❌ 上传失败(%s) %s' % (i, len(cands), code, err[:80]))
                    fail += 1
                    time.sleep(3)
                    continue
                hash2webp[sha] = webp_url
                time.sleep(0.6)  # 限流保护
            else:
                log('  [%d/%d] 演练 省%.0f%%: %dB -> %dB %s' % (i, len(cands), save, ob, wb, u[-60:]))
                continue
            rec = man.get(u, {})
            rec.update({'webp': webp_url, 'orig_bytes': ob, 'webp_bytes': wb, 'orig_sha': sha})
            man[u] = rec
            ok += 1
            if ok % 10 == 0:
                save_manifest(man)
                log('  ... 已 %d 张，累计省 %.1fMB（断点已存）' % (ok, (tot_o - tot_w) / 1048576))
        except Exception as ex:
            log('  [%d/%d] ❌ 异常 %s: %s' % (i, len(cands), type(ex).__name__, str(ex)[:80]))
            fail += 1

    if a.apply and ok:
        save_manifest(man, extra_note='；%s 共转 %d 张' % (time.strftime('%m-%d %H:%M'), ok))
    if tot_o:
        log('== 汇总: 成功 %d | 低收益放弃 %d | 失败 %d | 体积 %s -> %s（省 %.1f%%） =='
            % (ok, skip_low, fail, f'{tot_o/1048576:.1f}MB', f'{tot_w/1048576:.1f}MB',
               (1 - tot_w / tot_o) * 100))
    log('下一步: %s 后跑 hexo generate，img-optim.js 会把 <img> 包成 <picture>(webp优先)'
        % ('构建即生效' if a.apply else '加 --apply 真传后'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
