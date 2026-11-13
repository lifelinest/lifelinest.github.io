import json, urllib.request, urllib.parse, ssl

m = json.load(open('cdn-manifest.json', encoding='utf-8'))
items = m['items']
ctx = ssl.create_default_context()
ok = fail = 0
for k, v in items.items():
    u = v.get('cdn')
    p = urllib.parse.urlparse(u)
    enc = p.scheme + '://' + p.netloc + urllib.parse.quote(p.path) + ('?' + p.query if p.query else '')
    try:
        req = urllib.request.Request(enc, method='HEAD', headers={'User-Agent': 'verify'})
        with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
            code = r.status
            cl = r.headers.get('Content-Length', '?')
        status = 'OK' if code == 200 else 'BAD'
    except Exception as e:
        code = type(e).__name__
        cl = '-'
        status = 'ERR'
    if status == 'OK':
        ok += 1
    else:
        fail += 1
    # 文件名仅打 ASCII 安全部分，避免控制台编码报错
    fn = k.split('/')[-1]
    safefn = fn.encode('ascii', 'replace').decode('ascii')
    print('%s %s %s' % (status, cl, safefn[:40]))
print('---')
print('OK=%d FAIL=%d TOTAL=%d' % (ok, fail, len(items)))
