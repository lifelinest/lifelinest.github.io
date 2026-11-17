# -*- coding: utf-8 -*-
"""生成 Apple Podcasts 规范的节目封面（1400x1400 方图，RGB/JPEG）。
纯 Pillow 绘制，不调用任何生图模型 / 图库；呼应站点「Lifeline 生命线」的波形意象。
用法：python tools/podcast/make-artwork.py
"""
import math
import os
import sys

sys.path.insert(0, 'D:/1/1/.tmp/pydeps')
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = 'D:/1/1/Blog/source/audio/podcast/artwork.jpg'
S = 1400

FONTS = [
    ('bold', 'C:/Windows/Fonts/msyhbd.ttc'),
    ('reg', 'C:/Windows/Fonts/msyh.ttc'),
    ('reg', 'C:/Windows/Fonts/simhei.ttf'),
]


def font(kind, size):
    for k, p in FONTS:
        if k == kind and os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


# 1) 背景：深靛 → 主题蓝的斜向渐变（用 1px 宽的竖条拉伸，避免逐像素 Python 循环）
top = (22, 27, 66)
bot = (66, 90, 239)
strip = Image.new('RGB', (1, S))
sp = strip.load()
for y in range(S):
    sp[0, y] = mix(top, bot, 0.62 * y / S)
im = strip.resize((S, S), Image.BILINEAR).convert('RGB')

# 右上角柔光（加法叠加）
glow = Image.new('RGB', (S, S), (0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse((S * 0.52, -S * 0.30, S * 1.42, S * 0.60), fill=(58, 46, 38))
glow = glow.filter(ImageFilter.GaussianBlur(230))
from PIL import ImageChops
im = ImageChops.add(im, glow)

d = ImageDraw.Draw(im)

# 2) 细网格（极淡，增加质感，不抢主体）
for i in range(1, 8):
    x = S * i / 8
    d.line((x, 0, x, S), fill=mix(top, (255, 255, 255), 0.055), width=1)

GOLD = (244, 205, 124)
WHITE = (255, 255, 255)
FAINT = (206, 216, 255)

# 3) 中央「生命线」波形：两段平缓 + 一次心跳尖峰，呼应 Lifeline
CY = 760


def wave_y(x):
    u = x / S
    base = CY + 12 * math.sin(u * math.pi * 2.2) - 6 * math.sin(u * math.pi * 6)
    # 心跳：以 0.46 为中心的窄尖峰
    q = (u - 0.46) / 0.10
    beat = 0
    if abs(q) < 1.6:
        beat = -150 * math.exp(-((q + 0.22) ** 2) / 0.010) \
               + 92 * math.exp(-((q - 0.02) ** 2) / 0.004) \
               - 32 * math.exp(-((q - 0.30) ** 2) / 0.016)
    return base + beat


pts = [(x, wave_y(x)) for x in range(70, S - 70, 2)]
# 外发光
for w, alpha in [(16, 0.13), (9, 0.22)]:
    lay = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lay)
    ld.line(pts, fill=GOLD + (int(255 * alpha),), width=w, joint='curve')
    lay = lay.filter(ImageFilter.GaussianBlur(9))
    im = Image.alpha_composite(im.convert('RGBA'), lay).convert('RGB')
d = ImageDraw.Draw(im)
d.line(pts, fill=GOLD, width=6, joint='curve')

# 波形两端的小圆点（起点 / 归于平静的落点）
for x, r, col in [(70, 9, GOLD), (S - 70, 9, FAINT)]:
    d.ellipse((x - r, wave_y(x) - r, x + r, wave_y(x) + r), fill=col)

# 4) 文字层
pad = 110
f_kicker = font('bold', 34)
f_title = font('bold', 108)
f_sub = font('reg', 40)
f_foot = font('bold', 30)

d.text((pad, 150), 'LIFELINE  /  AI PODCAST', font=f_kicker, fill=GOLD)
d.line((pad, 218, pad + 250, 218), fill=GOLD, width=4)

d.text((pad, 300), '把文章', font=f_title, fill=WHITE)
d.text((pad, 424), '聊成播客', font=f_title, fill=WHITE)

d.text((pad, 592), '双人对话 · 每期一篇文章', font=f_sub, fill=FAINT)
d.text((pad, 654), '台词只取自原文，不添一字', font=f_sub, fill=FAINT)

d.line((pad, S - 190, S - pad, S - 190), fill=(126, 142, 220), width=2)
d.text((pad, S - 152), '孟凡宇 · Lifeline', font=f_foot, fill=WHITE)
d.text((S - pad - 430, S - 150), 'mfy-lifeline.com', font=f_foot, fill=FAINT)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
im.save(OUT, 'JPEG', quality=92, optimize=True, progressive=False)
print('OK %s %dx%d %dKB' % (OUT, S, S, os.path.getsize(OUT) // 1024))
