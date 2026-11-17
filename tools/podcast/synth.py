# -*- coding: utf-8 -*-
"""全站播客音频合成：Edge TTS 双音色 + ffmpeg 拼接。零 key / 零费用 / 可断点续跑。

用法：
  python tools/podcast/synth.py --tasks=D:/1/1/.tmp/podcast/tasks.json --workers=4
        # 增量：只合成 tasks.json 列出的 (abbrlink, set)，已存在的文件直接跳过
  python tools/podcast/synth.py --set=b --limit=2        # 整套 B 的前 2 篇（自检）
  python tools/podcast/synth.py --set=a --only=a0f90707  # 单篇指定音色
  python tools/podcast/synth.py --set=b --force          # 强制重合成整套 B

音色取自 tools/podcast/config.json 的 voiceSets。A 为默认（无后缀，RSS enclosure 固定
指向它），B/C 分别加 -b / -c。**只有默认音色会写 podcast-audio.json（RSS 清单）**，
B/C 只产音频文件，避免在 feed 里重复分集。

音频双写：source/audio/podcast/（随源码持久保存）+ public/audio/podcast/
（本次构建立刻可用，绕过 Hexo 在 before_generate 时可能已缓存文件列表的问题）。
"""
import asyncio, json, os, shutil, subprocess, sys, time

BASE = 'D:/1/1/.tmp/podcast'
BLOG = 'D:/1/1/Blog'
SCRIPTS = os.path.join(BASE, 'scripts')
PARTS = os.path.join(BASE, 'parts')
AUDIO = os.path.join(BLOG, 'source/audio/podcast')
PUBLIC_AUDIO = os.path.join(BLOG, 'public/audio/podcast')
MANIFEST = os.path.join(BLOG, 'source/_data/podcast-audio.json')

sys.path.insert(0, 'D:/1/1/.tmp/pydeps')
import edge_tts

CFG = json.load(open(os.path.join(BLOG, 'tools/podcast/config.json'), encoding='utf-8'))
AUD = CFG['audio']
SITE = CFG['site']
SETS = {s['id']: s for s in CFG['voiceSets']}
DEFAULT_SET = CFG.get('defaultVoice', 'a')
FALLBACK = CFG['voices']
PROXY = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')


def opt(k, default=None):
    for a in sys.argv[1:]:
        if a.startswith('--' + k + '='):
            return a.split('=', 1)[1]
    return default


ONLY = opt('only')
TASKS_FILE = opt('tasks')
SET = opt('set', DEFAULT_SET)
LIMIT = int(opt('limit', '0') or 0)
FORCE = '--force' in sys.argv[1:]
WORKERS = max(1, min(6, int(opt('workers', '3') or 3)))

os.makedirs(AUDIO, exist_ok=True)
os.makedirs(PARTS, exist_ok=True)
os.makedirs(PUBLIC_AUDIO, exist_ok=True)

SIL = os.path.join(PARTS, 'sil.mp3')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi',
                '-i', 'anullsrc=r=24000:cl=mono', '-t', str(AUD['gap']),
                '-c:a', 'libmp3lame', '-b:a', '48k', SIL], check=True)


def load_manifest():
    if os.path.exists(MANIFEST):
        try:
            return json.load(open(MANIFEST, encoding='utf-8'))
        except Exception:
            return {}
    return {}


def save_manifest(m):
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        json.dump(m, f, ensure_ascii=False, indent=2)


async def tts(text, voice, out):
    last = None
    for attempt in range(3):
        try:
            kw = {'rate': AUD['rate']}
            if PROXY:
                kw['proxy'] = PROXY
            c = edge_tts.Communicate(text, voice, **kw)
            await c.save(out)
            if os.path.getsize(out) > 500:
                return
            raise RuntimeError('empty audio')
        except Exception as e:
            last = e
            await asyncio.sleep(1.5 * (attempt + 1))
    raise RuntimeError('TTS failed after 3 tries: %s' % last)


def duration(p):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                        '-of', 'default=noprint_wrappers=1:nokey=1', p],
                       capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def resolve_tasks():
    if TASKS_FILE:
        with open(TASKS_FILE, encoding='utf-8') as f:
            raw = json.load(f)
        tasks = []
        for t in raw:
            if isinstance(t, str):
                tasks.append({'abbr': t, 'set': SET})
            else:
                tasks.append({'abbr': t.get('abbrlink') or t.get('abbr'),
                              'set': t.get('set', SET)})
        return [t for t in tasks if t['abbr']]
    files = sorted(f for f in os.listdir(SCRIPTS) if f.endswith('.json'))
    if ONLY:
        files = [f for f in files if f.startswith(ONLY)]
    if LIMIT:
        files = files[:LIMIT]
    return [{'abbr': os.path.splitext(f)[0], 'set': SET} for f in files]


async def build(task, manifest):
    abbr, sid = task['abbr'], task['set']
    vs = SETS.get(sid)
    if not vs:
        raise RuntimeError('unknown voice set: ' + str(sid))
    suffix = vs.get('suffix', '')
    vmap = {
        'host_a': vs.get('host_a', FALLBACK['host_a']),
        'host_b': vs.get('host_b', FALLBACK['host_b'])
    }
    out = os.path.join(AUDIO, abbr + suffix + '.mp3')
    if os.path.exists(out) and os.path.getsize(out) > 10000 and not FORCE:
        return 'skip'

    rec = json.load(open(os.path.join(SCRIPTS, abbr + '.json'), encoding='utf-8'))
    d = os.path.join(PARTS, abbr + '_' + sid)
    os.makedirs(d, exist_ok=True)
    lines = rec['lines']
    for i, l in enumerate(lines):
        await tts(l['text'], vmap[l['role']], os.path.join(d, '%02d.mp3' % i))
        await asyncio.sleep(0.18)
    lst = os.path.join(d, 'concat.txt')
    with open(lst, 'w', encoding='utf-8') as f:
        for i in range(len(lines)):
            f.write("file '%s'\n" % os.path.join(d, '%02d.mp3' % i).replace('\\', '/'))
            if i < len(lines) - 1:
                f.write("file '%s'\n" % SIL.replace('\\', '/'))
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0',
                    '-i', lst, '-c:a', 'libmp3lame', '-b:a', AUD['bitrate'],
                    '-ar', AUD['sampleRate'], '-ac', AUD['channels'], out], check=True)
    dur = duration(out)

    try:
        shutil.copy2(out, os.path.join(PUBLIC_AUDIO, os.path.basename(out)))
    except Exception as e:
        print('  [warn] public 双写失败（不影响 source）: %s' % str(e)[:100], flush=True)

    if sid == DEFAULT_SET:
        manifest[abbr] = {
            'bytes': os.path.getsize(out),
            'duration': round(dur, 1),
            'url': '%s/audio/podcast/%s%s.mp3' % (SITE, abbr, suffix),
            'title': rec['title'],
            'post': rec['url'],
            'date': rec['date'],
            'lines': len(lines)
        }
    # 清理中间片段。沙箱的安全钩子可能把批量删除判定成超限并抛 SystemExit，
    # 那属于「清理」而非「合成」，绝不能让它把已生成好的 mp3 判成失败、带崩整个进程。
    try:
        shutil.rmtree(d, ignore_errors=True)
    except (Exception, SystemExit) as e:
        print('  [warn] 中间片段清理跳过（不影响音频）: %s' % str(e)[:100], flush=True)
    return 'ok %.1fs %dKB' % (dur, os.path.getsize(out) // 1024)


async def main():
    tasks = resolve_tasks()
    manifest = load_manifest()
    print('proxy=%s | sets=%s | tasks=%d | workers=%d | force=%s' %
          (PROXY, sorted(SETS.keys()), len(tasks), WORKERS, FORCE), flush=True)
    stats = {'ok': 0, 'skip': 0, 'fail': 0}
    t0 = time.time()
    sem = asyncio.Semaphore(WORKERS)
    lock = asyncio.Lock()

    async def one(idx, t):
        async with sem:
            try:
                r = await build(t, manifest)
                if r == 'skip':
                    stats['skip'] += 1
                else:
                    stats['ok'] += 1
                    async with lock:
                        save_manifest(manifest)
                    print('[%3d/%3d] %s%s %s' % (idx, len(tasks), t['abbr'], t['set'], r), flush=True)
            except Exception as e:
                stats['fail'] += 1
                print('[%3d/%3d] %s%s FAIL %s' %
                      (idx, len(tasks), t['abbr'], t['set'], str(e)[:140]), flush=True)

    await asyncio.gather(*(one(i, t) for i, t in enumerate(tasks, 1)))
    async with lock:
        save_manifest(manifest)
    print('DONE ok=%d skip=%d fail=%d elapsed=%.1fmin -> %s' %
          (stats['ok'], stats['skip'], stats['fail'], (time.time() - t0) / 60, AUDIO), flush=True)
    if stats['fail']:
        sys.exit(1)


asyncio.run(main())
