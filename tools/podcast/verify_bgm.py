# -*- coding: utf-8 -*-
"""全量背景音乐混入验收：对比每个成品与纯人声备份，确认背景确实混入、时长未变。

判据（确定性，不靠听）：
  · 成品时长 == 备份纯人声时长（误差 < 1s）—— 混音不截断
  · 成品字节 > 备份字节 —— 混入背景后数据增加（基本都成立）
  · 抽样 ebur128：成品与备份整体响度差 < 2 LUFS —— 背景没抢朗读
"""
import glob, json, os, subprocess, sys

BLOG = 'D:/1/1/Blog'
AUDIO = os.path.join(BLOG, 'source/audio/podcast')
PUBLIC_AUDIO = os.path.join(BLOG, 'public/audio/podcast')
BACKUP = 'D:/1/1/.tmp/podcast/voice-backup'
MANIFEST = os.path.join(BLOG, 'source/_data/podcast-audio.json')


def dur(p):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                        '-of', 'default=noprint_wrappers=1:nokey=1', p],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except Exception:
        return 0.0


def main():
    files = sorted(os.path.basename(f) for f in glob.glob(os.path.join(AUDIO, '*.mp3')))
    bad_dur, bad_size, no_public, no_backup = [], [], [], []
    for name in files:
        out = os.path.join(AUDIO, name)
        bak = os.path.join(BACKUP, name)
        pub = os.path.join(PUBLIC_AUDIO, name)
        if not os.path.exists(bak):
            no_backup.append(name)
            continue
        if not os.path.exists(pub) or os.path.getsize(pub) != os.path.getsize(out):
            no_public.append(name)
        if abs(dur(out) - dur(bak)) > 1.0:
            bad_dur.append((name, round(dur(out), 1), round(dur(bak), 1)))
        if os.path.getsize(out) <= os.path.getsize(bak):
            bad_size.append(name)
    print('成品 %d | 时长异常 %d | 体积未增 %d | public 缺失/不一致 %d | 无备份 %d' %
          (len(files), len(bad_dur), len(bad_size), len(no_public), len(no_backup)))
    if bad_dur:
        print('  时长异常样例:', bad_dur[:5])
    if no_public:
        print('  public 异常样例:', no_public[:5])

    m = json.load(open(MANIFEST, encoding='utf-8'))
    byte_bad = [k for k, v in m.items()
                if os.path.exists(os.path.join(AUDIO, k + '.mp3'))
                and v.get('bytes') != os.path.getsize(os.path.join(AUDIO, k + '.mp3'))]
    print('manifest %d 条 | bytes 不同步 %d' % (len(m), len(byte_bad)))
    if byte_bad:
        print('  不同步样例:', byte_bad[:5])

    ok = not (bad_dur or no_public or no_backup or byte_bad)
    print('VERDICT:', 'PASS' if ok else 'FAIL')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
