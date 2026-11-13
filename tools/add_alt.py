# -*- coding: utf-8 -*-
"""
给 source/_posts 里 markdown 图片补 alt：
  ![空 alt](url)  ->  ![根据上下文生成的描述](url)

规则（优先级）：
  1. 图片前“最近的有意义文本行”：小标题优先，其次正文句；做 markdown/HTML 清洗
  2. 若前文没有可用信息 -> 用文章标题
  3. 仍为空 -> “文章配图”
只补“alt 为空”的图；已有 alt 一律不动；跳过代码块内的图片语法。
回写前对整个 source/_posts 做备份，可整体还原。
"""
import io
import os
import re
import shutil
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTS = os.path.join(ROOT, 'source', '_posts')
MD_IMG = re.compile(r'!\[([^\]]*)\]\(([^)]+)\)')

GENERIC = {'image', 'img', 'photo', 'pic', 'picture', 'screenshot', 'screen',
           'untitled', '微信图片', '无标题', '未命名', '副本', 'main', 'cover'}
TITLE_RE = re.compile(r'^title:\s*(.+)$', re.M)


def clean_text(s):
    s = s.strip()
    # 去掉 markdown 标题符号 / 引用 / 列表 / 强调 / 行内代码
    s = re.sub(r'^#{1,6}\s*', '', s)
    s = re.sub(r'^>\s*', '', s)
    s = re.sub(r'^[\-\*\+]\s+', '', s)
    s = re.sub(r'^\d+[\.、\)]\s*', '', s)
    s = re.sub(r'^[一二三四五六七八九十百]+[、\.]\s*', '', s)
    s = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', s)   # [t](u) -> t
    s = s.replace('**', '').replace('__', '').replace('`', '')
    s = re.sub(r'^\*+|\*+$', '', s)
    # HTML 实体 / 全角空格
    s = re.sub(r'&(emsp|nbsp|ensp|thinsp);', ' ', s)
    s = s.replace('\u2003', ' ').replace('\xa0', ' ').replace('\u3000', ' ')
    s = re.sub(r'<[^>]+>', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    # 截断到自然边界，最长 ~50 字
    if len(s) > 50:
        cut = max(s.rfind(p, 0, 50) for p in '。；，、！？.!?,;')
        s = s[:cut] if cut > 12 else s[:50]
    return s.strip(' -—–，。、；：').strip()


YAML_KEY = re.compile(r'^(title|date|updated|tags|categories|cover|abbrlink|top|'
                      r'description|keywords|author|layout|permalink|toc|comments|'
                      r'mathjax|mermaid|katex|swiper|sticky|excerpt|link|type)\s*:')


def is_noise(s):
    t = s.strip()
    if not t:
        return True
    if set(t) <= set('-—_=*#>'):
        return True
    if t.startswith('![') or t.startswith('<img') or t.startswith('<figure'):
        return True
    if YAML_KEY.match(t):
        return True
    return False


def post_title(text):
    m = TITLE_RE.search(text[:4000])
    if m:
        return m.group(1).strip().strip('"\'')
    return ''


def alt_from_url(url, fallback):
    # 仅当文件名真有描述性（中文/有意义英文）时才用，否则只用 fallback
    from urllib.parse import unquote
    name = unquote(url.split('?')[0].split('/')[-1])
    name = re.sub(r'\.(png|jpe?g|webp|gif|bmp|svg|avif)$', '', name, flags=re.I)
    name = re.sub(r'[0-9a-f]{16,}', '', name, flags=re.I)
    name = re.sub(r'\d{8,}', '', name)
    name = re.sub(r'[_\-]+', ' ', name).strip()
    for g in list(GENERIC):
        name = name.replace(g, ' ')
    name = re.sub(r'\s+', ' ', name).strip()
    if len(re.sub(r'\s', '', name)) >= 3 and re.search(r'[\u4e00-\u9fff]{2,}', name):
        return name
    return fallback


def gen_alt(lines, i, title, used, fm_end=-1):
    ctx = ''
    for j in range(i - 1, max(-1, i - 12), -1):
        if j <= fm_end:
            break
        s = lines[j]
        if is_noise(s):
            continue
        ctx = clean_text(s)
        if ctx:
            break
    if not ctx:
        ctx = clean_text(title) or '文章配图'
    base = ctx
    # 同篇重复时加序号，避免完全同名
    n = used.get(base, 0)
    used[base] = n + 1
    if n:
        base = '%s（%d）' % (base, n + 1)
    return base


def main():
    bak = os.path.join(ROOT, 'backup', 'alt_bak_%s' % time.strftime('%Y%m%d_%H%M%S'))
    shutil.copytree(POSTS, os.path.join(bak, '_posts'))
    changed_files = 0
    filled = 0
    for dp, dn, fn in os.walk(POSTS):
        for f in sorted(fn):
            if not f.endswith('.md'):
                continue
            p = os.path.join(dp, f)
            text = io.open(p, encoding='utf-8-sig').read()
            lines = text.split('\n')
            title = post_title(text)
            fm_end = -1
            if lines and lines[0].strip() == '---':
                for k in range(1, len(lines)):
                    if lines[k].strip() == '---':
                        fm_end = k
                        break
            used = {}
            out = []
            in_fence = False
            f_changed = 0
            for i, ln in enumerate(lines):
                st = ln.lstrip()
                if st.startswith('```') or st.startswith('~~~'):
                    in_fence = not in_fence
                    out.append(ln)
                    continue
                if in_fence or '![' not in ln:
                    out.append(ln)
                    continue

                def repl(m):
                    nonlocal f_changed
                    if m.group(1).strip():
                        return m.group(0)
                    a = gen_alt(lines, i, title, used, fm_end)
                    a = alt_from_url(m.group(2), a)
                    f_changed += 1
                    return '![%s](%s)' % (a, m.group(2))

                nl = MD_IMG.sub(repl, ln)
                out.append(nl)
            if f_changed:
                io.open(p, 'w', encoding='utf-8').write('\n'.join(out))
                changed_files += 1
                filled += f_changed
    print('补 alt 完成：%d 张，涉及 %d 篇' % (filled, changed_files))
    print('备份目录：%s' % bak)


if __name__ == '__main__':
    main()
