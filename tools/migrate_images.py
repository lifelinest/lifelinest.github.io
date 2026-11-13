# -*- coding: utf-8 -*-
"""
整站图片 -> 图床 迁移器（按文章归类 + 回写 md 引用）

目录规则（对齐你图床现有约定 /file/<大类>/<子路径>）:
    文章/<年>年/<月中文>/<文章标题>/<文件>
    例如: 文章/2026年/九月/海外保号卡对比：注册海外社媒与AI工具怎么选/xxx.png
    站点级资源（没被任何文章引用的图）: 系统/站点资源/<文件>

为什么这么干:
    你选了「按文章归类」，并且要求本地 md 的引用路径也同步改掉。
    所以本工具不只是上传，还会把每篇文章里 ![](/images/x.png) 的引用
    直接改写成图床 URL，让源文件本身就干净、规范，不依赖渲染期替换。

安全设计:
    - 默认只 --plan（只读，打印每篇归类，不发请求、不改文件）
    - --apply 才上传 + 回写 md；回写前自动备份 _posts 到 backup/_posts_bak_<时间戳>
    - 内容哈希去重：字节相同的图只传一份，多篇文章共享同一 URL
    - 已在 md 里用绝对 CDN 地址的图：不动、不重复传
    - 断点续传：manifest 记录成功项，重跑跳过；--rewrite-only 可单独重跑回写

用法:
    python tools/migrate_images.py --plan              # 只读预览归类
    python tools/migrate_images.py --plan --limit 5    # 只看前 5 篇
    export IMG_CDN_TOKEN="带 upload 权限的 Token"       # 或 IMG_CDN_AUTH
    python tools/migrate_images.py --apply --limit 5   # 试传+回写前 5 篇
    python tools/migrate_images.py --apply             # 全量
    python tools/migrate_images.py --rewrite-only      # 仅按已有 manifest 回写 md
"""
import argparse
import io
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
import mimetypes
import ssl
import hashlib
import shutil
from datetime import datetime

BLOG_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTS_DIR = os.path.join(BLOG_ROOT, 'source', '_posts')
SOURCE_DIR = os.path.join(BLOG_ROOT, 'source')
IMG_ROOTS = [os.path.join(BLOG_ROOT, 'source', 'images'),
             os.path.join(BLOG_ROOT, 'source', 'img')]
MANIFEST = os.path.join(BLOG_ROOT, 'cdn-manifest.json')
DEFAULT_DOMAIN = 'https://cloudflare-img-bzb.pages.dev'
SRC_EXT = ('.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg')

CN_MONTH = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月',
            '九月', '十月', '十一月', '十二月']

# 任何上下文里的本地图片引用：() 、src= 、url() 、CSS/行内样式都算
REF_RE = re.compile(r'/(?:images|img)/[^\s"\'\)>]+')


def sanitize_title(title):
    # 去掉会破坏路径的字符，保留中文
    t = title.strip()
    for ch in ['/', '\\', ':', '：', '*', '?', '"', '<', '>', '|']:
        t = t.replace(ch, '-')
    t = t.strip('-').strip()
    return t or '未命名'


def parse_post(path, kind):
    # 整篇读取：front-matter 取日期/标题，全文扫描图片引用（长文章图常在靠后位置）
    full = io.open(path, encoding='utf-8-sig').read()
    txt = full[:4000]
    if not txt.startswith('---'):
        date = None
        # 无 front-matter（html/yml 页面）：用所在目录名做归属名，比 index 有意义
        if kind == 'page':
            title = os.path.basename(os.path.dirname(path))
        else:
            title = os.path.splitext(os.path.basename(path))[0]
    else:
        end = txt.find('\n---', 3)
        fm = txt[3:end] if end > 0 else ''
        dm = re.search(r'^date:\s*(.+)$', fm, re.M)
        tm = re.search(r'^title:\s*(.+)$', fm, re.M)
        date = None
        if dm:
            try:
                date = datetime.strptime(dm.group(1).strip()[:19], '%Y-%m-%d %H:%M:%S')
            except ValueError:
                try:
                    date = datetime.strptime(dm.group(1).strip()[:10], '%Y-%m-%d')
                except ValueError:
                    date = None
        title = tm.group(1).strip().strip('"\'') if tm else os.path.splitext(os.path.basename(path))[0]
    refs = []
    for m in REF_RE.finditer(full):
        # md 里的中文路径常被百分号编码（如 /images/0_%E5%89%AF%E6%9C%AC.png），
        # 必须解码后才能和本地真实文件名对上，否则会被误判成“未引用”
        p = urllib.parse.unquote(m.group(0))
        if p.lower().endswith(SRC_EXT):
            refs.append(p)
    return kind, date, title, refs


def folder_for_post(date, title):
    if date:
        y = '%d年' % date.year
        m = CN_MONTH[date.month - 1]
    else:
        y = '未注明年'
        m = '未注明月'
    return '文章/%s/%s/%s' % (y, m, sanitize_title(title))


def file_hash(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def local_rel_from_ref(ref):
    # /images/foo.png -> source/images/foo.png ; /img/foo.png -> source/img/foo.png
    if ref.startswith('/images/'):
        return 'source/images' + ref[len('/images'):]
    if ref.startswith('/img/'):
        return 'source/img' + ref[len('/img'):]
    return None


def upload_one(rel, domain, auth, token, channel):
    local = os.path.join(BLOG_ROOT, rel)
    folder = target_folder_for_rel(rel)
    if os.environ.get('IMG_CDN_DRY'):
        # 演练模式：不发任何网络请求，按规则推算目标地址，用来验证归类/去重/manifest 链路
        return '%s/file/%s/%s' % (domain.rstrip('/'), folder,
                                  urllib.parse.quote(os.path.basename(local))), 200, ''
    q = {
        'returnFormat': 'full', 'uploadNameType': 'default',
        'uploadChannel': channel, 'autoRetry': 'true', 'serverCompress': 'false',
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
    headers = {'User-Agent': 'Mozilla/5.0 (blog-image-migrator)',
               'Content-Type': 'multipart/form-data; boundary=%s' % boundary}
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


# 站点级资源（没被任何文章引用）统一放这里
def target_folder_for_rel(rel):
    return _FOLDER_MAP.get(rel, '系统/站点资源')


_FOLDER_MAP = {}


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--domain', default=DEFAULT_DOMAIN)
    ap.add_argument('--plan', action='store_true', help='只读预览归类（默认）')
    ap.add_argument('--apply', action='store_true', help='上传 + 回写 md')
    ap.add_argument('--rewrite-only', action='store_true', help='仅按已有 manifest 回写 md')
    ap.add_argument('--move-unused', action='store_true',
                    help='把“未被任何文章/页面引用”的图移出 source/ 到 _unused_images/（不删除，可还原）')
    ap.add_argument('--archive-uploaded', action='store_true',
                    help='把已上传且已校验过的图移出 source/ 到 _uploaded_backup/（不删除，可还原）。'
                         '务必在 verify 全部通过后再执行')
    ap.add_argument('--channel', default='cfr2', choices=['telegram', 'cfr2'])
    ap.add_argument('--limit', type=int, default=0)
    args = ap.parse_args()

    global MANIFEST
    if os.environ.get('IMG_CDN_DRY'):
        # 演练时用独立 manifest，绝不污染真实映射表
        MANIFEST = os.path.join(BLOG_ROOT, 'cdn-manifest.dry.json')

    man = load_manifest()

    # 独立动作：归档已上传的本地图（真正瘦身的一步）
    if args.archive_uploaded:
        items = man.get('items', {})
        dest_root = os.path.join(BLOG_ROOT, '_uploaded_backup')
        moved = freed = 0
        skipped = []
        for rel, meta in items.items():
            if not (isinstance(meta, dict) and meta.get('cdn')):
                continue
            src = os.path.join(BLOG_ROOT, rel)
            if not os.path.isfile(src):
                continue
            sub = rel.split('/', 1)[1] if '/' in rel else os.path.basename(rel)
            dst = os.path.join(dest_root, sub)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            try:
                freed += os.path.getsize(src)
                shutil.move(src, dst)
                moved += 1
            except OSError as e:
                skipped.append((rel, str(e)))
        print('已归档本地图：%d 张，释放 %.1f MB -> %s' % (moved, freed / 1024 / 1024, dest_root))
        if skipped:
            print('跳过 %d 张：' % len(skipped))
            for r, e in skipped[:5]:
                print('   %s  %s' % (r, e))
        print('未删除任何文件；如需还原，把目录内容搬回 source/ 对应位置。')
        return

    man.setdefault('domain', args.domain)
    man.setdefault('items', {})

    # 1) 解析所有 md（文章 + 页面），建立 图片ref -> 归属列表
    posts = []
    pages = []
    for dp, dn, fn in os.walk(os.path.join(BLOG_ROOT, 'source')):
        for f in fn:
            # md 是主体；页面里还有 .html/.yml/.json 会引用图片，一起纳入
            # 注意：_data/footprints.json、essay.yml、album.yml 等存了大量图片路径，
            # 漏扫会导致这些图被误判成"未引用"，回写时又会漏改造成裂图
            if not f.endswith(('.md', '.html', '.yml', '.yaml', '.json')):
                continue
            p = os.path.join(dp, f)
            relp = os.path.relpath(p, BLOG_ROOT).replace('\\', '/')
            if relp.startswith('source/_posts/') or relp.startswith('source/_posts\\'):
                kind = 'post'
            elif '/_posts/' in relp or relp.startswith('source/_discarded'):
                continue  # 丢弃目录忽略
            else:
                kind = 'page'
            k, date, title, refs = parse_post(p, kind)
            if not refs:
                continue
            entry = (os.path.basename(f), date, title, refs, relp, k)
            if kind == 'post':
                posts.append(entry)
            else:
                pages.append(entry)

    # 2) 决定每个本地图片的归属目录
    ref_to_owners = {}
    for f, date, title, refs, relp, k in posts + pages:
        for r in refs:
            rel = local_rel_from_ref(r)
            if rel:
                ref_to_owners.setdefault(rel, []).append((date or datetime(1970, 1, 1), title, relp, k))

    # 本地存在的图片（含未被文章引用的站点资源）
    all_local = []
    for root in IMG_ROOTS:
        if not os.path.isdir(root):
            continue
        for dp, dn, fn in os.walk(root):
            for fl in fn:
                if fl.lower().endswith(SRC_EXT):
                    rel = os.path.relpath(os.path.join(dp, fl), BLOG_ROOT).replace('\\', '/')
                    all_local.append(rel)

    folder_map = {}
    for rel in all_local:
        owners = ref_to_owners.get(rel)
        if owners:
            # 优先归到文章（最早发布），否则归到页面
            post_owners = [o for o in owners if o[3] == 'post']
            pick = (sorted(post_owners, key=lambda x: x[0]) or sorted(owners, key=lambda x: x[0]))[0]
            date, title, relp, k = pick
            if k == 'post':
                folder_map[rel] = folder_for_post(date, title)
            else:
                # 页面：系统/<页面路径>/（去掉 source/ 前缀与 index.md）
                pp = relp
                if pp.endswith('/index.md'):
                    pp = pp[:-len('/index.md')]
                folder_map[rel] = '系统/' + pp.replace('source/', '').replace('_posts/', '')
        else:
            folder_map[rel] = '系统/未引用'

    global _FOLDER_MAP
    _FOLDER_MAP = folder_map

    # 3) 输出归类计划
    print('图床域   : %s' % args.domain)
    print('根规则   : 文章/<年>年/<月>/<标题>/  站点资源: 系统/站点资源/')
    print('文章数(含图): %d   本地图片总数: %d\n' % (len(posts), len(all_local)))

    # 按文章聚合展示
    shown = 0
    for f, date, title, refs, relp, k in posts:
        if args.limit and shown >= args.limit:
            break
        folder = folder_for_post(date, title)
        uniq = sorted(set(local_rel_from_ref(r) for r in refs if local_rel_from_ref(r)))
        print('● %s' % title)
        print('    %s' % folder)
        for u in uniq[:8]:
            print('      - %s' % os.path.basename(u))
        if len(uniq) > 8:
            print('      ... 等 %d 张' % len(uniq))
        shown += 1

    # 真孤儿（全站任何 md 都没引用）
    orphan = [r for r in all_local if r not in ref_to_owners]
    if orphan:
        tot_bytes = 0
        for r in orphan:
            try:
                tot_bytes += os.path.getsize(os.path.join(BLOG_ROOT, r))
            except OSError:
                pass
        print('\n○ 真·未引用（全站任何文章/页面都没引用）：%d 张，%.1f MB'
              % (len(orphan), tot_bytes / 1024 / 1024))
        for r in orphan[:8]:
            print('      - %s' % r)

        # 导出完整未引用清单（纯增量，便于后续人工核对/清理）
        try:
            with open(os.path.join(BLOG_ROOT, 'unused-images.txt'), 'w', encoding='utf-8') as df:
                for r in orphan:
                    try:
                        _sz = os.path.getsize(os.path.join(BLOG_ROOT, r))
                    except OSError:
                        _sz = 0
                    df.write('%s\t%d\n' % (r, _sz))
            print('      完整清单已导出: unused-images.txt（%d 张）' % len(orphan))
        except Exception as e:
            print('      清单导出失败: %s' % e)

        if args.move_unused:
            dest_root = os.path.join(BLOG_ROOT, '_unused_images')
            moved = 0
            for r in orphan:
                src = os.path.join(BLOG_ROOT, r)
                # 保持 source/images|img 下的相对结构，方便日后对照还原
                sub = r.split('/', 1)[1] if '/' in r else os.path.basename(r)
                dst = os.path.join(dest_root, sub)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                try:
                    shutil.move(src, dst)
                    moved += 1
                except OSError as e:
                    print('  跳过（无法移动）: %s  %s' % (r, e))
            print('\n已移出 source/：%d 张 -> %s' % (moved, dest_root))
            print('未删除任何文件，需要还原时把目录内容搬回 source/ 对应位置即可。')
            print('建议重新执行 --plan 复核后再上传。')
            return

    if not (args.apply or args.rewrite_only):
        print('\n【仅预览】确认归类无误后，设置 IMG_CDN_TOKEN 并加 --apply 执行上传+回写。')
        return

    # ---- 上传 + 回写 ----
    if args.rewrite_only:
        pass
    else:
        auth = os.environ.get('IMG_CDN_AUTH', '')
        token = os.environ.get('IMG_CDN_TOKEN', '')
        # 环境变量读不到时，回退到项目内本地凭证文件（已在 .gitignore 中，不会入库）
        if not auth and not token:
            for fn in ('cdn-token.local', '.cdn-token.local'):
                fp = os.path.join(BLOG_ROOT, fn)
                if not os.path.isfile(fp):
                    continue
                try:
                    for line in open(fp, encoding='utf-8'):
                        line = line.strip()
                        if not line or line.startswith('#'):
                            continue
                        if '=' in line:
                            k, v = line.split('=', 1)
                            k = k.strip().upper()
                            v = v.strip().strip('"').strip("'")
                            if k == 'IMG_CDN_AUTH':
                                auth = v
                            elif k == 'IMG_CDN_TOKEN':
                                token = v
                        elif not token:
                            token = line
                except OSError as e:
                    print('读取凭证文件失败: %s' % e)
                if auth or token:
                    print('已从 %s 读取凭证（内容不回显）' % fn)
                    break
        if os.environ.get('IMG_CDN_DRY'):
            auth = auth or 'DRY-RUN'
            print('【演练模式】不发网络请求，manifest 写入 cdn-manifest.dry.json')
        if not auth and not token:
            print('缺少凭证：export IMG_CDN_AUTH 或 IMG_CDN_TOKEN')
            sys.exit(2)
        # 上传：按 folder_map 上传，内容哈希去重
        hash_cache = {meta.get('hash'): meta['cdn']
                      for meta in man['items'].values()
                      if meta.get('hash') and meta.get('cdn')}
        # 仅上传“被文章/页面引用”的图；真·孤儿（无人引用）不传图床，
        # 留本地后续 --move-unused 归档瘦身即可，避免白占图床 96MB 且违背瘦身初衷。
        referenced_set = set(ref_to_owners.keys())
        todo = [r for r in all_local if r not in man['items'] and r in referenced_set]
        skipped_orphan = len([r for r in all_local if r not in man['items'] and r not in referenced_set])
        if skipped_orphan:
            print('跳过孤儿(未引用,不传图床): %d 张' % skipped_orphan)
        if args.limit:
            # limit 仅作用于前 N 篇文章涉及到的图
            limited = set()
            for f, date, title, refs, relp, k in posts[:args.limit]:
                for r in refs:
                    rr = local_rel_from_ref(r)
                    if rr:
                        limited.add(rr)
            todo = [r for r in todo if r in limited]
        print('\n待上传 %d 张（去重后）' % len(todo))
        ok = reused = 0
        fail = {}
        start = time.time()
        for i, rel in enumerate(todo, 1):
            h = file_hash(os.path.join(BLOG_ROOT, rel))
            if h in hash_cache:
                man['items'][rel] = {'cdn': hash_cache[h], 'size': os.path.getsize(os.path.join(BLOG_ROOT, rel)), 'hash': h}
                reused += 1
                ok += 1
            else:
                backoff = 1
                cdn = None
                for _ in range(4):
                    cdn, code, err = upload_one(rel, args.domain, auth, token, args.channel)
                    if cdn:
                        break
                    if code == 429:
                        time.sleep(backoff)
                        backoff = min(backoff * 2, 30)
                    else:
                        time.sleep(1)
                if cdn:
                    man['items'][rel] = {'cdn': cdn, 'size': os.path.getsize(os.path.join(BLOG_ROOT, rel)), 'hash': h}
                    hash_cache[h] = cdn
                    ok += 1
                else:
                    fail[rel] = code if code is not None else err
            if i % 10 == 0 or i == len(todo):
                save_manifest(man)
                print('  进度 %d/%d 成功 %d(复用 %d) 失败 %d' % (i, len(todo), ok, reused, len(fail)))
        man['failed'] = fail
        save_manifest(man)
        print('上传完成：新传 %d，复用 %d，失败 %d' % (ok - reused, reused, len(fail)))
        if fail:
            print('失败需重传：python tools/migrate_images.py --apply --rewrite-only 不可；用 --apply 重跑')

    # ---- 回写 md ----
    if os.environ.get('IMG_CDN_DRY'):
        print('\n【演练模式】跳过 md 回写（不会改动任何文章）。')
        print('演练 manifest：%s' % MANIFEST)
        return

    # 建立 pathOnly -> cdn
    path_map = {}
    for rel, meta in man['items'].items():
        if isinstance(meta, dict) and meta.get('cdn'):
            if rel.startswith('source/images/'):
                path_map['/images/' + rel[len('source/images/'):]] = meta['cdn']
            elif rel.startswith('source/img/'):
                path_map['/img/' + rel[len('source/img/'):]] = meta['cdn']

    bak_dir = os.path.join(BLOG_ROOT, 'backup', 'migrate_md_bak_%s' % time.strftime('%Y%m%d_%H%M%S'))
    os.makedirs(bak_dir, exist_ok=True)
    changed = 0

    def _sub(m):
        # 只替换映射表里有记录的图；没上传成功的保持原样，绝不产生裂图
        # 原文可能是百分号编码的，解码后再查表；替换时写入图床绝对地址
        dec = urllib.parse.unquote(m.group(0))
        return path_map.get(dec, m.group(0))

    # 扫描 source/ 下所有会引用图片的文件（文章 + 页面 + 数据文件）
    # .json/.yml 必须包含：_data/footprints.json、essay.yml、album.yml、link.yml 等
    # 存了 140+ 处图片路径，只改 md 会让这些引用继续指向已被迁走的本地图 -> 裂图
    REWRITE_EXT = ('.md', '.html', '.yml', '.yaml', '.json')
    targets = []
    for dp, dn, fn in os.walk(SOURCE_DIR):
        if os.path.basename(dp) in ('node_modules', '_drafts', 'backup'):
            continue
        for f in fn:
            if f.endswith(REWRITE_EXT):
                targets.append(os.path.join(dp, f))
    for p in sorted(targets):
        txt = io.open(p, encoding='utf-8-sig').read()
        new = REF_RE.sub(_sub, txt)
        if new != txt:
            relp = os.path.relpath(p, SOURCE_DIR).replace('\\', '/')
            dst = os.path.join(bak_dir, relp)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(p, dst)
            io.open(p, 'w', encoding='utf-8').write(new)
            changed += 1
    print('md 回写：%d 篇已修改（备份在 %s）' % (changed, bak_dir))
    if changed == 0:
        print('没有需要回写的引用（可能都已指向图床）。')


if __name__ == '__main__':
    main()
