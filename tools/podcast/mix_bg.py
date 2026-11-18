# -*- coding: utf-8 -*-
"""AI 播客背景音乐混入：《Lifeline》原曲低音量垫底 + 人声闪避（ducking）。

核心原则（用户要求）：背景音乐是"垫底氛围"，绝不能抢朗读。
  · 人声保持 edge-tts 原始响度（约 -20 LUFS），不做任何处理
  · 背景原曲先离线归一化成 bed（-31 LUFS），再经闪避后约 -38 LUFS，比人声低约 18dB
  · 混入时用 sidechaincompress 以人声为触发源：人声一出现，背景自动再压低；停顿间隙才回升
  · 首尾淡入淡出，避免突兀

幂等由调用方保证：永远从"纯人声"源文件读入 → 输出最终文件，
不是在已混音的文件上再叠加。synth.py 是新 TTS 拼接后直接调本脚本；
已存量音频由 mix_existing.py 先从备份读纯人声再调本脚本。

用法：
  python tools/podcast/mix_bg.py --make-bed                       # 生成归一化 bed（只做一次）
  python tools/podcast/mix_bg.py --voice=<纯人声.mp3> --out=<输出.mp3>
  python tools/podcast/mix_bg.py --check=<文件.mp3>               # 报告响度/峰值
"""
import json, os, subprocess, sys

BLOG = 'D:/1/1/Blog'
CFG = json.load(open(os.path.join(BLOG, 'tools/podcast/config.json'), encoding='utf-8'))
BGM = CFG['audio']['bgm']
ASSETS = os.path.join(BLOG, 'tools/podcast/assets')
SRC = os.path.join(ASSETS, os.path.basename(BGM['source']))
BED = os.path.join(ASSETS, os.path.basename(BGM['bed']))

SR = CFG['audio']['sampleRate']       # 24000
BITRATE = '96k'                        # bed 用略高码率保旋律，最终输出仍用 config 的 64k


def opt(k, default=None):
    for a in sys.argv[1:]:
        if a.startswith('--' + k + '='):
            return a.split('=', 1)[1]
    return default


def run(args, **kw):
    return subprocess.run(args, capture_output=True, text=True, **kw)


def duration(p):
    r = run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
             '-of', 'default=noprint_wrappers=1:nokey=1', p])
    try:
        return float(r.stdout.strip())
    except Exception:
        return 0.0


def make_bed():
    """把原曲一次性归一化成低响度 bed。loudnorm 单遍 + 目标积分响度。"""
    if not os.path.exists(SRC):
        raise RuntimeError('背景原曲不存在: ' + SRC)
    print('源: %s' % SRC, flush=True)
    # 先测原曲响度，算出需要的增益，再确定性 volume（比单遍 loudnorm 更可预测）
    r = run(['ffmpeg', '-hide_banner', '-i', SRC, '-af', 'ebur128=peak=true', '-f', 'null', '-'])
    iu = None
    for line in r.stderr.splitlines():
        if line.strip().startswith('I:'):
            try:
                iu = float(line.split('I:')[1].split()[0])
                break
            except Exception:
                pass
    if iu is None:
        raise RuntimeError('无法测量原曲响度')
    gain_db = BGM['bedLufs'] - iu
    print('原曲 %.1f LUFS -> 目标 %.1f LUFS, 增益 %.1f dB' % (iu, BGM['bedLufs'], gain_db), flush=True)
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-i', SRC,
           '-af', 'volume=%.4fdB,aresample=%s' % (gain_db, SR),
           '-ac', '1', '-c:a', 'libmp3lame', '-b:a', BITRATE, BED]
    rr = run(cmd)
    if rr.returncode:
        raise RuntimeError('bed 生成失败: ' + rr.stderr[-300:])
    print('bed 已生成: %s (%.1fs, %dKB)' % (BED, duration(BED), os.path.getsize(BED) // 1024), flush=True)


def mix(voice, out):
    """把纯人声与 bed 混合成最终播客音频。"""
    if not os.path.exists(BED):
        raise RuntimeError('bed 不存在，请先 --make-bed: ' + BED)
    if not os.path.exists(voice):
        raise RuntimeError('人声文件不存在: ' + voice)
    vdur = duration(voice)
    if vdur < 1:
        raise RuntimeError('人声时长异常: %s (%.2f)' % (voice, vdur))

    fi = BGM['fadeIn']
    fo = min(BGM['fadeOut'], max(0.5, vdur / 4))
    st = max(0.0, vdur - fo)
    # 链：人声原样；bed 循环+淡入淡出；以人声为 sidechain 压 bed；1:1 混合（不做自动增益衰减）
    filt = (
        '[0:a]aresample={sr},aformat=sample_rates={sr}:channel_layouts=mono[voice];'
        '[1:a]aresample={sr},aformat=sample_rates={sr}:channel_layouts=mono,'
        'afade=t=in:st=0:d={fi},afade=t=out:st={st:.3f}:d={fo}[bg];'
        '[bg][voice]sidechaincompress=threshold={th}:ratio={ratio}:attack={at}:release={rel}:makeup=1[ducked];'
        '[voice][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,'
        'alimiter=limit=0.95[out]'
    ).format(sr=SR, fi=fi, st=st, fo=fo,
             th=BGM['duckThreshold'], ratio=BGM['duckRatio'],
             at=BGM['duckAttack'], rel=BGM['duckRelease'])

    tmp = out + '.mixing.mp3'
    cmd = ['ffmpeg', '-y', '-loglevel', 'error',
           '-i', voice, '-stream_loop', '-1', '-i', BED,
           '-filter_complex', filt, '-map', '[out]', '-t', '%.3f' % vdur,
           '-ac', '1', '-ar', SR, '-c:a', 'libmp3lame', '-b:a', CFG['audio']['bitrate'], tmp]
    rr = run(cmd)
    if rr.returncode:
        raise RuntimeError('混音失败: ' + rr.stderr[-400:])
    odur = duration(tmp)
    if abs(odur - vdur) > 1.0:
        raise RuntimeError('混音后时长偏差过大: voice=%.1f out=%.1f' % (vdur, odur))
    os.replace(tmp, out)
    return 'ok %.1fs voice->out, fade in %.1f/out %.1f' % (odur, fi, fo)


def check(p):
    r = run(['ffmpeg', '-hide_banner', '-i', p, '-af', 'ebur128=peak=true', '-f', 'null', '-'])
    iu, pk = None, None
    for line in r.stderr.splitlines():
        s = line.strip()
        if s.startswith('I:'):
            iu = iu or s.split('I:')[1].split()[0]
        if s.startswith('Peak:') and pk is None:
            pk = s.split('Peak:')[1].split()[0]
    print('%s | %s | integrated=%s LUFS peak=%s dBFS | %.1fs | %dKB' %
          (os.path.basename(p), 'OK' if os.path.exists(p) else 'MISSING',
           iu, pk, duration(p), os.path.getsize(p) // 1024))


if __name__ == '__main__':
    try:
        if '--make-bed' in sys.argv[1:]:
            make_bed()
        elif opt('check') is not None:
            check(opt('check'))
        else:
            v, o = opt('voice'), opt('out')
            if not v or not o:
                print(__doc__)
                sys.exit(2)
            os.makedirs(os.path.dirname(o), exist_ok=True)
            print(mix(v, o), flush=True)
    except Exception as e:
        print('FATAL %s' % e, flush=True)
        sys.exit(1)
