# -*- coding: utf-8 -*-
"""
迁移后完整性校验：
1) 扫描 source 下所有 .md/.html/.yml/.yaml/.json 里的图片引用
2) 本地引用(/images/, /img/)：
   - 若文件在 source 已不存在，但在归档区(_uploaded_backup/_unused_images)里存在
     -> 说明“引用还在指本地、文件却被归档走了” = 本次造成的裂图（应为 0）
   - 若 source 与归档区都不存在 -> 迁移前既有的历史裂图
3) 图床引用(cloudflare-img-bzb.pages.dev)：去重后并发 HEAD，确认全部 200
"""
import io, os, re, ssl, json
import urllib.parse, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
SRC = 'source'
DOM = 'cloudflare-img-bzb.pages.dev'
# 注意：路径可能含空格（中文标题目录），因此不能用 \s 作为终止符（\s 含空格会被截断，
# 不含又会跨行贪婪吃字）；正确做法是只排除换行与图片语法天然终止符 ) " ' >
REF = re.compile(r'/(?:images|img)/[^\r\n)"\'>]+')
CDNRE = re.compile(r'https?://cloudflare-img-bzb\.pages\.dev/file/[^\r\n)"\'>]+')
EXT = ('.md', '.html', '.yml', '.yaml', '.json')
ARCH = ['_uploaded_backup', '_unused_images', '_archived']
CTX = ssl.create_default_context()

local_refs = {}     # ref -> set(files)
cdn_refs = {}       # url -> set(files)
for dp, dn, fn in os.walk(SRC):
    if os.path.basename(dp) in ('node_modules', '_drafts', 'backup'):
        continue
    for f in fn:
        if not f.endswith(EXT):
            continue
        p = os.path.join(dp, f)
        try:
            t = io.open(p, encoding='utf-8-sig').read()
        except Exception:
            continue
        for m in CDNRE.finditer(t):
            cdn_refs.setdefault(m.group(0).strip(), set()).add(p)
        for m in REF.finditer(t):
            r = urllib.parse.unquote(m.group(0).strip()).lstrip('/')
            local_refs.setdefault(r, set()).add(p)

# 本地引用分类
still_in_source = 0
caused_broken = []   # 本次造成的裂图
historical_broken = 0
for r, files in local_refs.items():
    in_src = os.path.exists(os.path.join(SRC, r.replace('/', os.sep)))
    if in_src:
        still_in_source += 1
    else:
        in_arch = any(os.path.exists(os.path.join(a, r.replace('/', os.sep))) for a in ARCH)
        if in_arch:
            caused_broken.append((r, list(files)[:2]))
        else:
            historical_broken += 1

print('本地图片引用条目(去重):', len(local_refs))
print('  仍在 source 内(可解析):', still_in_source)
print('  ⚠ 本次导致裂图(引用指本地但文件已归档):', len(caused_broken))
for r, fs in caused_broken[:20]:
    print('      !', r, '<-', fs)
print('  历史裂图(迁移前就不存在):', historical_broken)

# 图床链接校验
urls = list(cdn_refs.keys())
print('\n图床引用(去重):', len(urls))
ok = bad = 0
fails = []


def chk(u):
    p = urllib.parse.urlparse(u)
    # 先解码再统一编码，避免对已编码路径二次编码（%->%25）
    path = urllib.parse.quote(urllib.parse.unquote(p.path), safe='/')
    enc = p.scheme + '://' + p.netloc + path + ('?' + p.query if p.query else '')
    for _ in range(3):
        try:
            req = urllib.request.Request(enc, method='HEAD', headers={'User-Agent': 'verify'})
            with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
                return (u, r.status if r.status == 200 else 'BAD%d' % r.status)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                continue
            return (u, 'HTTP%d' % e.code)
        except Exception as e:
            return (u, type(e).__name__)
    return (u, 'RETRYFAIL')


with ThreadPoolExecutor(max_workers=16) as ex:
    for fu in as_completed([ex.submit(chk, u) for u in urls]):
        u, st = fu.result()
        if st == 200:
            ok += 1
        else:
            bad += 1
            fails.append((u, st))
print('图床链接校验: OK=%d FAIL=%d TOTAL=%d' % (ok, bad, len(urls)))
for u, st in fails[:20]:
    print('   X', st, u[:100])

json.dump({'local_refs': len(local_refs), 'still_in_source': still_in_source,
           'caused_broken': caused_broken, 'historical_broken': historical_broken,
           'cdn_total': len(urls), 'cdn_ok': ok, 'cdn_fail': bad,
           'cdn_failed': fails},
          io.open('cdn-verify-report-after-archive.json', 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)

print('\n结论: %s' % ('✅ 无本次裂图、图床链接全部有效' if (not caused_broken and bad == 0)
                     else '❌ 存在问题，见上'))
