# -*- coding: utf-8 -*-
"""并发校验 cdn-manifest.json 里每个 CDN 链接是否真能打开（防图床 SPA 假成功）。"""
import json, os, ssl, sys, io
import urllib.request, urllib.parse, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, 'cdn-manifest.json')
CTX = ssl.create_default_context()
FAIL_OUT = os.path.join(ROOT, 'cdn-verify-failed.txt')
REPORT_OUT = os.path.join(ROOT, 'cdn-verify-report.json')


def check(item):
    rel, meta = item
    u = meta.get('cdn') if isinstance(meta, dict) else None
    if not u:
        return (rel, 'NOCDN', 0, 0)
    p = urllib.parse.urlparse(u)
    enc = p.scheme + '://' + p.netloc + urllib.parse.quote(p.path) + ('?' + p.query if p.query else '')
    for attempt in range(3):
        try:
            req = urllib.request.Request(enc, method='HEAD', headers={'User-Agent': 'verify'})
            with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
                cl = int(r.headers.get('Content-Length') or 0)
                if r.status == 200:
                    return (rel, 'OK', cl, meta.get('size', 0))
                return (rel, 'BAD%d' % r.status, cl, meta.get('size', 0))
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < 2:
                continue
            return (rel, 'HTTP%d' % e.code, 0, meta.get('size', 0))
        except Exception as e:
            if attempt < 2:
                continue
            return (rel, type(e).__name__, 0, meta.get('size', 0))
    return (rel, 'RETRYFAIL', 0, meta.get('size', 0))


def main():
    m = json.load(io.open(MANIFEST, encoding='utf-8'))
    items = list(m.get('items', {}).items())
    print('待校验: %d 个链接' % len(items))
    ok = bad = 0
    fails = []
    size_mismatch = 0
    with ThreadPoolExecutor(max_workers=16) as ex:
        futs = [ex.submit(check, it) for it in items]
        done = 0
        for fu in as_completed(futs):
            rel, status, cl, local_sz = fu.result()
            done += 1
            if status == 'OK':
                ok += 1
                if local_sz and cl and cl != local_sz:
                    size_mismatch += 1
            else:
                bad += 1
                fails.append((rel, status))
            if done % 100 == 0:
                print('  校验进度 %d/%d  成功 %d 失败 %d' % (done, len(items), ok, bad))
    print('---')
    print('OK=%d  FAIL=%d  TOTAL=%d  体积不符=%d' % (ok, bad, len(items), size_mismatch))
    with io.open(FAIL_OUT, 'w', encoding='utf-8') as f:
        for rel, st in fails:
            f.write('%s\t%s\n' % (rel, st))
    with io.open(REPORT_OUT, 'w', encoding='utf-8') as f:
        json.dump({'total': len(items), 'ok': ok, 'fail': bad,
                   'size_mismatch': size_mismatch,
                   'failed': [{'rel': r, 'status': s} for r, s in fails]},
                  f, ensure_ascii=False, indent=1)
    print('失败清单: cdn-verify-failed.txt  报告: cdn-verify-report.json')


if __name__ == '__main__':
    main()
