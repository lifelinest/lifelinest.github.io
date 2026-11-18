# -*- coding: utf-8 -*-
"""存量音频批量混入背景音乐：先备份纯人声，再从备份读入混音写回，天然幂等可重复跑。

流程：
  1) 把 source/audio/podcast/*.mp3（当前纯人声）备份到 .tmp/podcast/voice-backup/
     —— 已备份过的跳过，绝不覆盖备份（备份 = 唯一纯人声源）
  2) 从备份读纯人声 → mix_bg.mix() → 写回 source/audio/podcast/ + public/audio/podcast/
     —— 每篇独立，失败不影响其它；已处理过的按文件 hash 记录跳过（可断点续跑）
  3) 更新 podcast-audio.json 的 bytes（混入背景后文件变大，RSS enclosure 必须准确）

用法：
  python tools/podcast/mix_existing.py --workers=3
  python tools/podcast/mix_existing.py --only=0055d24e     # 单篇
"""
import concurrent.futures, hashlib, json, os, shutil, sys, time

sys.path.insert(0, 'D:/1/1/Blog/tools/podcast')
import mix_bg

BLOG = 'D:/1/1/Blog'
AUDIO = os.path.join(BLOG, 'source/audio/podcast')
PUBLIC_AUDIO = os.path.join(BLOG, 'public/audio/podcast')
BACKUP = 'D:/1/1/.tmp/podcast/voice-backup'
STATE = 'D:/1/1/.tmp/podcast/mix-state.json'
MANIFEST = os.path.join(BLOG, 'source/_data/podcast-audio.json')


def opt(k, default=None):
    for a in sys.argv[1:]:
        if a.startswith('--' + k + '='):
            return a.split('=', 1)[1]
    return default


def backup_all(names):
    os.makedirs(BACKUP, exist_ok=True)
    n = 0
    for name in names:
        src = os.path.join(AUDIO, name)
        dst = os.path.join(BACKUP, name)
        if os.path.exists(dst) and os.path.getsize(dst) > 10000:
            continue
        shutil.copy2(src, dst)
        n += 1
    print('备份: 新增 %d 个, 备份库共 %d 个' % (n, len(os.listdir(BACKUP))), flush=True)


def load_state():
    if os.path.exists(STATE):
        try:
            return json.load(open(STATE, encoding='utf-8'))
        except Exception:
            pass
    return {}


def save_state(s):
    tmp = STATE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(s, f)
    os.replace(tmp, STATE)


def process(name, state):
    voice = os.path.join(BACKUP, name)          # 永远从纯人声备份读
    out = os.path.join(AUDIO, name)
    pub = os.path.join(PUBLIC_AUDIO, name)
    # 用备份文件的 hash 做幂等键：同一纯人声源只混一次
    h = hashlib.md5(open(voice, 'rb').read()).hexdigest()
    if state.get(name) == h and os.path.exists(out) and os.path.getsize(out) > 10000:
        return 'skip'
    mix_bg.mix(voice, out)
    shutil.copy2(out, pub)
    return h


def update_manifest_bytes():
    m = json.load(open(MANIFEST, encoding='utf-8'))
    changed = 0
    for abbr, rec in m.items():
        p = os.path.join(AUDIO, abbr + '.mp3')   # 默认音色 A 无后缀
        if os.path.exists(p):
            b = os.path.getsize(p)
            if rec.get('bytes') != b:
                rec['bytes'] = b
                changed += 1
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        json.dump(m, f, ensure_ascii=False, indent=2)
    print('manifest bytes 更新 %d 条（共 %d）' % (changed, len(m)), flush=True)


def main():
    workers = max(1, min(4, int(opt('workers', '2') or 2)))
    only = opt('only')
    names = sorted(f for f in os.listdir(AUDIO) if f.endswith('.mp3'))
    if only:
        names = [f for f in names if f.startswith(only)]
    print('待处理音频 %d 个, workers=%d' % (len(names), workers), flush=True)
    if not names:
        return
    backup_all(names)
    state = load_state()
    stats = {'ok': 0, 'skip': 0, 'fail': 0}
    t0 = time.time()
    lock = __import__('threading').Lock()

    def one(i, name):
        try:
            r = process(name, state)
            if r == 'skip':
                stats['skip'] += 1
            else:
                with lock:
                    state[name] = r
                    save_state(state)
                stats['ok'] += 1
            if i % 20 == 0 or i == len(names):
                print('[%d/%d] ok=%d skip=%d fail=%d %.1fmin' %
                      (i, len(names), stats['ok'], stats['skip'], stats['fail'],
                       (time.time() - t0) / 60), flush=True)
        except Exception as e:
            stats['fail'] += 1
            print('[%d/%d] %s FAIL %s' % (i, len(names), name, str(e)[:120]), flush=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(one, range(1, len(names) + 1), names))
    if not only:
        update_manifest_bytes()
    print('DONE ok=%d skip=%d fail=%d elapsed=%.1fmin' %
          (stats['ok'], stats['skip'], stats['fail'], (time.time() - t0) / 60), flush=True)
    if stats['fail']:
        sys.exit(1)


if __name__ == '__main__':
    main()
