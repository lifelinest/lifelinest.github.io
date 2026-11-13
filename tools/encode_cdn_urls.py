# -*- coding: utf-8 -*-
"""
修复：图床 URL 内含空格/中文，未做百分号编码，导致 Markdown ![](url) 在空格处断开 -> 图片 404。

做法：把 source 下所有文本文件里出现的图床 URL 做百分号编码（保留 / 不编码）。
  - 只动 cloudflare-img-bzb.pages.dev/file/... 这种 URL
  - 幂等：已编码的不会二次编码
  - 改前整体备份 source -> backup/encode_cdn_bak_<ts>/

用法：
  python tools/encode_cdn_urls.py            # dry-run，只统计与示例
  python tools/encode_cdn_urls.py --apply    # 真正改写
"""
import io, os, re, sys, time, shutil, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
SRC = 'source'
EXT = ('.md', '.html', '.htm', '.yml', '.yaml', '.json')
SKIP_DIRS = {'node_modules', '_drafts', 'backup'}

# URL 可能含空格，故不能用 \s 作终止符；以 换行/)/引号/> 为界
URL_RE = re.compile(r'https?://cloudflare-img-bzb\.pages\.dev/file/[^\r\n)"\'>]+')


def enc(u):
    p = urllib.parse.urlsplit(u)
    path = p.path
    if '%' in path:                      # 已有编码 -> 先解码再统一编码，避免二次编码
        path = urllib.parse.unquote(path)
    path = urllib.parse.quote(path, safe='/')
    return urllib.parse.urlunsplit((p.scheme, p.netloc, path, p.query, p.fragment))


def main():
    apply = '--apply' in sys.argv
    total_files = 0
    total_urls = 0
    changed_urls = 0
    samples = []
    bak = os.path.join(ROOT, 'backup', 'encode_cdn_bak_%s' % time.strftime('%Y%m%d_%H%M%S'))

    for dp, dn, fn in os.walk(SRC):
        dn[:] = [d for d in dn if d not in SKIP_DIRS]
        for f in fn:
            if not f.endswith(EXT):
                continue
            p = os.path.join(dp, f)
            try:
                t = io.open(p, encoding='utf-8-sig').read()
            except Exception:
                continue
            urls = URL_RE.findall(t)
            if not urls:
                continue
            total_files += 1

            def repl(m):
                nonlocal total_urls, changed_urls
                raw = m.group(0)
                # 去掉结尾可能被带上的空白，再编码
                core = raw.rstrip()
                trail = raw[len(core):]
                total_urls += 1
                e = enc(core)
                if e != core:
                    changed_urls += 1
                    if len(samples) < 6:
                        samples.append((e, core))
                return e + trail

            new = URL_RE.sub(repl, t)
            if apply and new != t:
                rp = os.path.relpath(p, ROOT)
                bp = os.path.join(bak, rp)
                os.makedirs(os.path.dirname(bp), exist_ok=True)
                io.open(bp, 'w', encoding='utf-8').write(t)
                io.open(p, 'w', encoding='utf-8').write(new)

    print('含图床 URL 的文件数: %d' % total_files)
    print('图床 URL 出现次数: %d' % total_urls)
    print('需要编码(含空格/中文未编码)的: %d' % changed_urls)
    for e, c in samples:
        print('   例: %s' % c[:70])
        print('   -> %s' % e[:110])
    if apply:
        print('\n已改写，备份在 %s' % bak)
    else:
        print('\n（dry-run，未改写。加 --apply 执行）')


if __name__ == '__main__':
    main()
