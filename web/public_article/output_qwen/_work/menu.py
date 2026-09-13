# -*- coding: utf-8 -*-
"""菜单栏视觉概念: 微信公众号手机 mockup (750x1334)"""
from PIL import Image, ImageDraw, ImageFont

BASE = "/home/admin/tools/cuijin/public_article"
A = f"{BASE}/output_qwen/assets"
OUT = f"{BASE}/output_qwen/images"

PURPLE   = (74, 63, 156)
PURPLE_D = (52, 43, 112)
PURPLE_L = (151, 143, 205)
GOLD     = (245, 127, 47)
GOLD_L   = (250, 199, 120)
TEAL     = (46, 134, 171)
INK      = (40, 44, 60)
GRAY     = (128, 134, 148)
GRAY_L   = (168, 174, 188)

FONT_B = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_R = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"


def F(size, bold=True):
    return ImageFont.truetype(FONT_B if bold else FONT_R, size, index=0)


def tw(d, s, f):
    b = d.textbbox((0, 0), s, font=f)
    return b[2] - b[0]


def render():
    W, H = 750, 1334
    canvas = Image.new("RGBA", (W, H), (250, 252, 255, 255))
    d = ImageDraw.Draw(canvas)

    # 状态栏
    d.text((32, 22), "9:41", font=F(26), fill=INK)
    d.text((660, 24), "5G", font=F(20, False), fill=INK)
    for i in range(4):
        d.rectangle([600 + i * 12, 30 - i * 4, 609 + i * 12, 30], fill=INK)

    # 公众号头部
    d.line([(0, 92), (W, 92)], fill=(236, 240, 246), width=2)
    logo = Image.open(f"{A}/logo_mark.png").convert("RGBA")
    lw = 72
    lh = int(logo.height / logo.width * lw)
    logo = logo.resize((lw, lh), Image.LANCZOS)
    av = Image.new("RGBA", (84, 84), (255, 255, 255, 255))
    av.alpha_composite(logo, ((84 - lw) // 2, (84 - lh) // 2))
    mask = Image.new("L", (84, 84), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, 84, 84], fill=255)
    av.putalpha(mask)
    canvas.alpha_composite(av, (30, 104))
    d.text((132, 110), "睿美达环保科技", font=F(30), fill=INK)
    d.text((132, 152), "超微纳米曝气 × 臭氧催化氧化 · 一体化水处理", font=F(16, False), fill=GRAY)
    d.text((684, 116), "···", font=F(26), fill=GRAY)

    # ---- 文章卡片1 ----
    card_y = 206
    d.rounded_rectangle([30, card_y, W - 30, 566], radius=16, fill=(255, 255, 255),
                        outline=(232, 238, 246), width=2)
    dev = Image.open(f"{A}/rmd01_cutout.png").convert("RGBA")
    dw, dh = dev.size
    sc = 292 / dw
    dev = dev.resize((292, int(dh * sc)), Image.LANCZOS)
    canvas.alpha_composite(dev, (44, card_y + 104))
    d.text((356, card_y + 42), "节能降耗30–50%：", font=F(27), fill=INK)
    d.text((356, card_y + 84), "超微纳米曝气×臭氧催化氧化", font=F(27), fill=PURPLE_D)
    d.text((356, card_y + 126), "一体化工艺包解析", font=F(27), fill=TEAL)
    d.text((356, card_y + 182), "睿美达环保科技  2026-09-13", font=F(16, False), fill=GRAY_L)
    d.line([(44, card_y + 232), (706, card_y + 232)], fill=(240, 244, 250), width=2)
    d.text((44, card_y + 252), "传统曝气能耗高、难降解污染物去除效率低？", font=F(19, False), fill=GRAY)
    d.text((44, card_y + 288), "睿美达以成套一体化工艺给出答案。", font=F(19, False), fill=GRAY)

    # ---- 文章卡片2 (示意) ----
    d.rounded_rectangle([30, 592, W - 30, 900], radius=16, fill=(255, 255, 255),
                        outline=(232, 238, 246), width=2)
    d.text((44, 616), "案例 | 市政污水厂提标改造工程运行数据", font=F(24), fill=INK)
    d.text((44, 660), "臭氧催化氧化协同纳米曝气，COD去除率提升25%，", font=F(18, False), fill=GRAY)
    d.text((44, 692), "吨水电耗下降38%，出水稳定达到一级A。", font=F(18, False), fill=GRAY)
    dev2 = Image.open(f"{A}/rmd04_cutout.png").convert("RGBA")
    dw2, dh2 = dev2.size
    sc2 = 430 / dw2
    dev2 = dev2.resize((430, int(dh2 * sc2)), Image.LANCZOS)
    canvas.alpha_composite(dev2, (160, 726))

    # 空态提示
    d.text((255, 950), "—  更多文章  —", font=F(17, False), fill=GRAY_L)
    d.text((215, 1000), "关注后第一时间获取最新工艺与案例", font=F(17, False), fill=GRAY_L)

    # ---- 底部菜单栏 ----
    mb_y = 1088
    d.rectangle([0, mb_y, W, H], fill=(255, 255, 255))
    d.line([(0, mb_y), (W, mb_y)], fill=(224, 230, 240), width=3)

    def icon_home(x, y):
        d.rounded_rectangle([x - 34, y - 34, x + 34, y + 34], radius=12, fill=(243, 238, 255))
        d.ellipse([x - 15, y - 18, x + 15, y + 12], fill=TEAL)
        d.ellipse([x - 5, y - 9, x + 7, y + 3], fill=(255, 255, 255))
        d.ellipse([x + 9, y - 20, x + 17, y - 12], fill=PURPLE_L)

    def icon_product(x, y):
        d.rounded_rectangle([x - 34, y - 34, x + 34, y + 34], radius=12, fill=(243, 238, 255))
        d.rounded_rectangle([x - 17, y - 16, x - 3, y + 18], radius=6, fill=PURPLE_D)
        d.rounded_rectangle([x + 3, y - 16, x + 17, y + 18], radius=6, fill=TEAL)
        d.line([(x - 10, y - 16), (x - 10, y - 23)], fill=GOLD, width=3)
        d.line([(x + 10, y - 16), (x + 10, y - 23)], fill=GOLD, width=3)
        d.line([(x - 10, y - 23), (x + 10, y - 23)], fill=GOLD, width=3)

    def icon_call(x, y):
        d.rounded_rectangle([x - 34, y - 34, x + 34, y + 34], radius=12, fill=(253, 240, 228))
        # 听筒: 两段圆弧 + 连线
        d.arc([x - 20, y - 20, x + 20, y + 20], start=200, end=340, fill=GOLD, width=7)
        d.arc([x - 20, y - 20, x + 20, y + 20], start=20, end=60, fill=GOLD, width=7)
        d.arc([x - 20, y - 20, x + 20, y + 20], start=120, end=160, fill=GOLD, width=7)
        d.ellipse([x - 24, y - 6, x - 14, y + 4], fill=GOLD)
        d.ellipse([x + 14, y - 6, x + 24, y + 4], fill=GOLD)

    cols = [(125, icon_home, "首页"), (375, icon_product, "产品工艺"), (625, icon_call, "联系我们")]
    for cx, fn, label in cols:
        fn(cx, mb_y + 56)
        wlab = tw(d, label, F(20))
        d.text((cx - wlab / 2, mb_y + 104), label, font=F(20), fill=INK)

    # 菜单结构说明条
    d.rounded_rectangle([50, 1240, 700, 1296], radius=10, fill=(243, 238, 255))
    d.text((74, 1250), "一级: 首页 / 产品工艺 / 联系我们", font=F(18), fill=PURPLE_D)
    d.text((74, 1274), "二级: 工艺包 · 案例 · 服务 · 监测 · 电话 · 地址", font=F(16, False), fill=GRAY)

    canvas.convert("RGB").save(f"{OUT}/04_菜单栏视觉概念_750x1334.png", quality=92)
    print("menu mockup saved")


render()
