# -*- coding: utf-8 -*-
"""睿美达公众号头图 + 2套封面 (900x383, 微信头条封面安全区)"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

BASE = "/home/admin/tools/cuijin/public_article"
A = f"{BASE}/output_qwen/assets"
OUT = f"{BASE}/output_qwen/images"

# ---------- 色板 ----------
PURPLE   = (74, 63, 156)    # 皇家紫
PURPLE_D = (52, 43, 112)
PURPLE_L = (151, 143, 205)
GOLD     = (245, 127, 47)   # 达标金
GOLD_L   = (250, 199, 120)
TEAL     = (46, 134, 171)   # 浅青蓝
TEAL_L   = (178, 221, 239)
GREEN    = (98, 168, 100)   # 浅环保绿
GREEN_L  = (214, 236, 206)
INK      = (40, 44, 60)
GRAY     = (118, 124, 138)
SILVER   = (235, 238, 244)
BG_TOP   = (252, 253, 255)
BG_BOT   = (233, 241, 248)

FONT_B = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_R = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"


def F(size, bold=True):
    return ImageFont.truetype(FONT_B if bold else FONT_R, size, index=0)


def vbg(w, h, top, bot):
    """垂直渐变背景"""
    im = Image.new("RGB", (w, h))
    for y in range(h):
        t = y / (h - 1)
        c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        ImageDraw.Draw(im).line([(0, y), (w, y)], fill=c)
    return im


def paste_scaled(canvas, im, box):
    """把 im 缩放到目标框 (x, top_y, w, h) 内"""
    x, top_y, bw, bh = box
    w, h = im.size
    scale = min(bw / w, bh / h)
    nw, nh = int(w * scale), int(h * scale)
    r = im.resize((nw, nh), Image.LANCZOS)
    canvas.alpha_composite(r, (x, top_y))
    return (x, top_y, nw, nh)


def shadow(canvas, x, y, w, h, color=(90, 100, 120), opacity=90):
    """设备底部椭圆落地阴影"""
    s = Image.new("RGBA", (int(w * 1.1), int(h * 1.6)), (0, 0, 0, 0))
    d = ImageDraw.Draw(s)
    d.ellipse([0, 0, s.width, s.height], fill=color + (opacity,))
    s = s.filter(ImageFilter.GaussianBlur(max(6, h * 0.28)))
    canvas.alpha_composite(s, (int(x - w * 0.05), int(y)))


def text_w(d, s, f):
    b = d.textbbox((0, 0), s, font=f)
    return b[2] - b[0]


def bubbles(d, pts, palette):
    for (x, y, r) in pts:
        c = palette[(x * 7 + y) % len(palette)]
        d.ellipse([x - r, y - r, x + r, y + r], outline=c, width=2)
        if r > 6:
            d.ellipse([x - r * 0.55, y - r * 0.55, x - r * 0.1, y - r * 0.1],
                      outline=c, width=1)


def flow(d, x, y, labels, w_total, color=TEAL):
    """工艺管线: 节点圆 + 连线 + 箭头 + 文字, 返回结束x"""
    n = len(labels)
    step = w_total / (n - 1)
    node_r = 5
    prev = None
    for i, lab in enumerate(labels):
        x0 = x + step * i
        d.ellipse([x0 - node_r, y - node_r, x0 + node_r, y + node_r], fill=color)
        tw = text_w(d, lab, F(15, False))
        d.text((x0 - tw / 2, y + 12), lab, font=F(15, False), fill=(96, 104, 122))
        if prev is not None:
            d.line([prev, (x0 - node_r - 6, y)], fill=color, width=3)
            d.polygon([(x0 - node_r - 6, y - 5), (x0 - node_r - 6, y + 5), (x0 - node_r + 2, y)],
                      fill=color)
        prev = (x0 + node_r + 2, y)
    return x + w_total


def ring_deco(d, cx, cy, r, color, w=2):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=w)
    d.ellipse([cx - r * 0.72, cy - r * 0.72, cx + r * 0.72, cy + r * 0.72],
              outline=color, width=1)


# ---------- 公共: 左上品牌区 ----------
def brand_block(d, canvas, scale=1.0):
    s = scale
    logo = Image.open(f"{A}/logo_mark.png")
    lh = int(46 * s)
    lw = int(logo.width / logo.height * lh)
    logo = logo.resize((lw, lh), Image.LANCZOS)
    canvas.alpha_composite(logo, (int(34 * s), int(26 * s)))
    d.text((34 * s + lw + 12 * s, 26 * s + 2 * s), "北京睿美达", font=F(int(26 * s)), fill=PURPLE_D)
    d.text((34 * s + lw + 12 * s, 26 * s + 2 * s + int(30 * s)), "环保新材料科技有限公司",
           font=F(int(13 * s), False), fill=GRAY)


def footer_line(d, w, y):
    d.line([(36, y), (w - 36, y)], fill=(214, 221, 232), width=1)
    d.text((36, y + 8), "科技赋能环保 · 创新守护碧水", font=F(13, False), fill=GRAY)


# ============================================================
# 1. 头图 (hero)
# ============================================================
def render_hero():
    W, H = 900, 383
    canvas = vbg(W, H, BG_TOP, BG_BOT).convert("RGBA")
    d = ImageDraw.Draw(canvas)

    # 背景工程网格 (右上淡出)
    for i in range(14):
        x = 560 + i * 34
        d.line([(x, 0), (x, 150)], fill=(228, 236, 244), width=1)
    for i in range(6):
        y = 12 + i * 26
        d.line([(560, y), (900, y)], fill=(232, 238, 246), width=1)

    # 淡环装饰
    ring_deco(d, 872, 52, 66, (214, 226, 238), 2)
    ring_deco(d, 872, 52, 44, (224, 234, 242), 1)

    # 顶部金色细线
    d.rectangle([0, 0, W, 5], fill=GOLD)

    brand_block(d, canvas)

    # 标签条
    d.rounded_rectangle([36, 104, 176, 134], radius=15, fill=(243, 238, 255), outline=PURPLE_L, width=1)
    d.text((54, 108), "一体化成套工艺包", font=F(15), fill=PURPLE_D)

    # 主标题 (40px, 控制在左 560px 内)
    t1 = "超微纳米曝气"
    t2 = "×"
    t3 = "臭氧催化氧化"
    f1 = F(40)
    w1, w2 = text_w(d, t1, f1), text_w(d, t2, F(32))
    x = 36
    d.text((x, 140), t1, font=f1, fill=PURPLE_D)
    x += w1 + 8
    d.text((x, 147), t2, font=F(32), fill=GOLD)
    x += w2 + 8
    d.text((x, 140), t3, font=f1, fill=TEAL)

    # 副标题
    d.text((36, 200), "高级氧化水处理 · 市政提标改造 / 工业高难度废水治理",
           font=F(16, False), fill=GRAY)

    # 卖点: 大数字
    fx = 36
    d.text((fx, 232), "节能降耗", font=F(19), fill=INK)
    d.text((fx + 84, 220), "30–50%", font=F(38), fill=GOLD)
    d.ellipse([fx + 246, 240, fx + 252, 246], fill=(190, 200, 214))
    d.text((fx + 268, 232), "出水水质", font=F(19), fill=INK)
    d.text((fx + 350, 220), "100%", font=F(38), fill=TEAL)
    d.text((fx + 436, 234), "达标", font=F(19), fill=INK)

    # 工艺管线 (左下)
    flow(d, 40, 322, ["进水", "超微纳米曝气", "臭氧催化氧化", "达标出水"], 440)

    # 右: 设备 (rmd01)
    dev = Image.open(f"{A}/rmd01_cutout.png")
    shadow(canvas, 596, 294, 280, 20, opacity=80)
    paste_scaled(canvas, dev, (594, 88, 286, 210))

    # 纳米气泡 + 臭氧点缀 (设备上方)
    bubbles(d, [(620, 66, 7), (654, 42, 12), (690, 72, 5), (852, 110, 9), (874, 84, 5), (820, 150, 5)],
            [TEAL_L, PURPLE_L, GOLD_L, TEAL, PURPLE_L])

    canvas.convert("RGB").save(f"{OUT}/01_头图_900x383.png", quality=92)
    print("hero saved")


# ============================================================
# 2. 封面A: 技术产品类
# ============================================================
def render_cover_a():
    W, H = 900, 383
    canvas = vbg(W, H, (250, 252, 255), (226, 236, 246)).convert("RGBA")
    d = ImageDraw.Draw(canvas)

    # 背景: 左侧竖渐变 + 工程网格
    for i in range(10):
        x = 8 * i
        d.line([(x, 0), (x, H)], fill=(238, 244, 250) if i % 2 else (242, 247, 252), width=1)
    ring_deco(d, 60, 330, 70, (210, 222, 236), 2)

    d.rectangle([0, 0, W, 5], fill=PURPLE)

    brand_block(d, canvas, scale=0.82)

    # 左: 设备 rmd03
    dev = Image.open(f"{A}/rmd03_cutout.png")
    shadow(canvas, 50, 338, 310, 18, opacity=75)
    paste_scaled(canvas, dev, (46, 104, 320, 236))

    # 右: 信息区
    rx = 420
    d.rounded_rectangle([rx, 84, rx + 128, 112], radius=14, fill=(243, 238, 255), outline=PURPLE_L, width=1)
    d.text((rx + 16, 88), "工艺技术", font=F(15), fill=PURPLE_D)

    d.text((rx, 126), "超微纳米曝气 × 臭氧催化氧化", font=F(30), fill=PURPLE_D)
    d.text((rx, 170), "一体化成套工艺包", font=F(24), fill=TEAL)

    # 要点
    items = [
        ("30–50%", "运行能耗降低", GOLD, 120),
        ("100%", "出水达标率", TEAL, 100),
        ("2合1", "曝气+高级氧化成套集成", PURPLE, 88),
    ]
    y = 216
    for big, small, c, bw in items:
        d.ellipse([rx, y + 7, rx + 12, y + 19], fill=c)
        d.text((rx + 24, y - 4), big, font=F(26), fill=c)
        d.text((rx + bw, y + 3), small, font=F(16, False), fill=GRAY)
        y += 40

    footer_line(d, W, 352)

    canvas.convert("RGB").save(f"{OUT}/02_封面A_技术产品类_900x383.png", quality=92)
    print("cover A saved")


# ============================================================
# 3. 封面B: 案例场景类
# ============================================================
def render_cover_b():
    W, H = 900, 383
    canvas = vbg(W, H, (251, 253, 255), (228, 240, 244)).convert("RGBA")
    d = ImageDraw.Draw(canvas)

    # 背景: 淡青蓝斜向色块 + 网格
    for i in range(7):
        d.line([(W - 60 + i * 26, 0), (W - 200 + i * 26, H)], fill=(232, 240, 246), width=1)
    ring_deco(d, 840, 320, 60, (208, 224, 232), 2)

    d.rectangle([0, 0, W, 5], fill=TEAL)

    brand_block(d, canvas, scale=0.82)

    # 左: 大数字区
    d.text((40, 92), "为提标改造与高难度废水", font=F(32), fill=INK)
    d.text((40, 138), "提供一体化处理方案", font=F(32), fill=INK)

    # 场景标签
    tags = ["市政污水提标改造", "工业高难度废水", "难降解污染物去除"]
    x = 40
    for t in tags:
        tw = text_w(d, t, F(15, False)) + 28
        d.rounded_rectangle([x, 190, x + tw, 218], radius=14, fill=SILVER, outline=(214, 221, 232), width=1)
        d.text((x + 14, 194), t, font=F(15, False), fill=(96, 104, 122))
        x += tw + 12

    # 数据条
    d.rounded_rectangle([40, 244, 420, 316], radius=10, fill=(255, 255, 255),
                        outline=(222, 230, 240), width=1)
    d.text((58, 256), "节能降耗", font=F(17), fill=INK)
    d.text((58, 280), "30–50%", font=F(30), fill=GOLD)
    d.line([(170, 256), (170, 306)], fill=(230, 236, 244), width=1)
    d.text((192, 256), "出水达标", font=F(17), fill=INK)
    d.text((192, 280), "100%", font=F(30), fill=TEAL)
    d.line([(298, 256), (298, 306)], fill=(230, 236, 244), width=1)
    d.text((320, 256), "智能调控", font=F(17), fill=INK)
    d.text((320, 280), "在线监测·远程运维", font=F(14, False), fill=PURPLE_D)

    footer_line(d, W, 352)

    # 右: 设备 rmd04
    dev = Image.open(f"{A}/rmd04_cutout.png")
    shadow(canvas, 470, 330, 410, 24, opacity=80)
    paste_scaled(canvas, dev, (462, 80, 410, 248))

    bubbles(d, [(500, 60, 8), (536, 38, 5), (860, 130, 10), (836, 160, 5)],
            [TEAL_L, GOLD_L, PURPLE_L, TEAL])

    canvas.convert("RGB").save(f"{OUT}/03_封面B_案例场景类_900x383.png", quality=92)
    print("cover B saved")


render_hero()
render_cover_a()
render_cover_b()
print("done")
