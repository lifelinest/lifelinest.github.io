# -*- coding: utf-8 -*-
"""
自动为 Hexo 文章生成 description（SEO 摘要）并回填 front-matter。

用法:
    python auto_description.py --dry-run           # 只预览，不写文件（默认）
    python auto_description.py --apply             # 实际写入
    python auto_description.py --dry-run --sample 15   # 抽样预览 15 条

规则:
    - 已有非空 description 的文章直接跳过，绝不覆盖
    - 从正文提取：剔除代码块 / HTML / 图片 / 标题 / 引用 / 表格后，
      按顺序累积到 80 字左右，再在标点处断句，目标 90 字、硬上限 120 字
    - 优先保证 front-matter 结构不被破坏（插在 title 行之后）
    - 写入前自动备份到 backup/_posts_bak_<时间戳>/
"""
import argparse
import glob
import io
import os
import re
import sys
import shutil
import datetime

BLOG_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTS_DIR = os.path.join(BLOG_ROOT, 'source', '_posts')

TARGET_LEN = 90
HARD_LIMIT = 120
ACCUM_MIN = 80
MAX_LINES = 6


def strip_markdown(body):
    """把 markdown 正文清洗成候选纯文本行"""
    body = re.sub(r'```.*?```', '', body, flags=re.S)          # 代码块
    body = re.sub(r'`[^`]*`', '', body)                         # 行内代码
    body = re.sub(r'<!--.*?-->', '', body, flags=re.S)          # HTML 注释
    body = re.sub(r'<[^>]+>', '', body)                         # HTML 标签
    body = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', body)            # 图片
    body = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', body)        # 链接保留文字
    body = body.replace('&nbsp;', ' ').replace('&amp;', '&')    # 常见实体
    body = re.sub(r'&(?:[a-zA-Z]{2,10}|#\d{1,5});', '', body)   # 其余实体（&emsp; 等）

    lines = []
    for raw in body.split('\n'):
        s = raw.strip()
        if not s:
            continue
        if s.startswith('#'):                                   # 标题
            continue
        if s.startswith('>') or s.startswith('&gt;'):           # 引用
            continue
        if s.startswith('|') or s.startswith(':-'):             # 表格
            continue
        if re.fullmatch(r'[-*_=]{3,}', s):                      # 分隔线
            continue
        if s.startswith('- [ ]') or s.startswith('- [x]'):      # 任务列表
            continue
        # 去掉行首的列表符号
        s = re.sub(r'^[-*+]\s+', '', s)
        s = re.sub(r'^\d+\.\s+', '', s)
        # 清理残留的 markdown 标记
        s = s.replace('**', '').replace('__', '')
        s = re.sub(r'(?<!\w)\*(?!\w)', '', s)
        s = s.replace('&nbsp;', ' ').replace('&amp;', '&')
        s = re.sub(r'\s+', ' ', s).strip()
        if len(s) >= 8:
            lines.append(s)
    return lines


def cut_at_punctuation(text, target, hard):
    """在标点处断句，避免半截话"""
    if len(text) <= hard:
        return text
    window = text[: hard - 1]
    best = -1
    for i, ch in enumerate(window):
        if ch in '。！？；!?;':
            best = i
        elif ch in '，,、':
            if i >= target * 0.6:
                best = max(best, i) if best < target * 0.6 else best
    # 找最后一个不早于 target*0.6 的句读
    cand = -1
    for i, ch in enumerate(window):
        if ch in '。！？；，、!?;,':
            cand = i
    if cand >= target * 0.6:
        return window[:cand + 1].rstrip('，,、；;')
    if best >= target * 0.6:
        return window[:best + 1]
    return window.rstrip() + '…'


def build_description(body, title=''):
    lines = strip_markdown(body)
    if not lines:
        return title.strip() if title else ''

    buf = ''
    for i, line in enumerate(lines[:MAX_LINES]):
        buf = line if i == 0 else buf + ' ' + line
        if len(buf) >= ACCUM_MIN:
            break

    buf = buf.strip()
    # 清理标点前多余空格，如 "隐私保护 。" -> "隐私保护。"
    buf = re.sub(r'\s+([。，、；：！？，\.!\?;:])', r'\1', buf)
    buf = re.sub(r'\s{2,}', ' ', buf).strip()
    if len(buf) > HARD_LIMIT:
        buf = cut_at_punctuation(buf, TARGET_LEN, HARD_LIMIT)
    return buf


def yaml_quote(text):
    """用双引号安全包裹 YAML 标量"""
    text = text.replace('\\', '\\\\').replace('"', '\\"')
    return '"%s"' % text


def has_description(fm):
    m = re.search(r'^description\s*:\s*(.+)$', fm, re.M)
    if not m:
        return False
    val = m.group(1).strip().strip('"').strip("'")
    return bool(val)


def process_file(path, apply=False):
    with io.open(path, encoding='utf-8-sig', newline='') as f:
        raw = f.read()
    crlf = '\r\n' in raw
    text = raw.replace('\r\n', '\n')

    if not text.startswith('---'):
        return None, '无 front-matter'
    end = text.find('\n---', 3)
    if end == -1:
        return None, 'front-matter 未闭合'
    fm = text[3:end]
    body = text[end + 4:]

    if has_description(fm):
        return None, '已有 description'

    m = re.search(r'^title\s*:\s*(.+)$', fm, re.M)
    title = m.group(1).strip().strip('"').strip("'") if m else ''

    desc = build_description(body, title)
    if not desc:
        return None, '正文为空'

    line = 'description: ' + yaml_quote(desc)
    # 插在 title 行之后；找不到 title 则追加到 front-matter 末尾
    if m:
        insert_at = fm.index(m.group(0)) + len(m.group(0))
        new_fm = fm[:insert_at] + '\n' + line + fm[insert_at:]
    else:
        new_fm = fm.rstrip('\n') + '\n' + line

    new_text = '---' + new_fm + text[end:end + 4] + body
    if crlf:
        new_text = new_text.replace('\n', '\r\n')

    if apply:
        with io.open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(new_text)
    return desc, 'OK'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='实际写入文件')
    ap.add_argument('--dry-run', action='store_true', help='仅预览（默认）')
    ap.add_argument('--sample', type=int, default=0, help='抽样预览条数，0 表示全部')
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(POSTS_DIR, '*.md')))
    if not files:
        print('未找到文章')
        return

    if args.apply:
        stamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        bak = os.path.join(BLOG_ROOT, 'backup', '_posts_bak_' + stamp)
        shutil.copytree(POSTS_DIR, bak)
        print('已备份到: %s\n' % bak)

    written, skipped = [], []
    for p in files:
        desc, status = process_file(p, apply=args.apply)
        name = os.path.basename(p)
        if status == 'OK':
            written.append((name, desc))
        else:
            skipped.append((name, status))

    mode = '已写入' if args.apply else '预览'
    show = written if args.sample == 0 else written[:args.sample]

    print('=' * 70)
    print('%s: %d 篇  跳过: %d 篇' % (mode, len(written), len(skipped)))
    print('=' * 70)
    for i, (name, desc) in enumerate(show, 1):
        print('\n[%d] %s' % (i, name))
        print('    (%d字) %s' % (len(desc), desc))

    if skipped:
        print('\n' + '-' * 70)
        print('跳过明细:')
        for name, st in skipped:
            print('  - %s : %s' % (name, st))

    if not args.apply:
        print('\n提示: 当前为预览，加 --apply 才会写入文件。')


if __name__ == '__main__':
    main()
