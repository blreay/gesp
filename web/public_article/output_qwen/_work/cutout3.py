# -*- coding: utf-8 -*-
"""设备抠图 v4: 按实拍逐台罐体手工描边 (预览坐标 2000x1500), 多边形并集, 水平收缩去背景边, 羽化。"""
import cv2
import numpy as np

BASE = "/home/admin/tools/cuijin/public_article"
OUT = f"{BASE}/output_qwen/assets"
S = 2304 / 2000.0

# 每图: crop 区域(x1,y1,x2,y2), 罐体天际线多边形, 附加矩形(顶部管线等)
SHAPES = {
    "rmd01": dict(
        crop=(390, 318, 1715, 1275),
        skyline=[
            (405, 1265), (405, 438), (508, 435), (512, 380), (688, 378), (692, 368),
            (828, 368), (833, 330), (982, 328), (977, 362), (1088, 360), (1084, 418),
            (1198, 415), (1202, 342), (1328, 340), (1323, 330), (1448, 330),
            (1444, 418), (1568, 415), (1556, 402), (1694, 400), (1700, 1265),
        ],
        rects=[(692, 320, 982, 372)],   # 罐后顶部工艺管线
    ),
    "rmd02": dict(
        crop=(45, 372, 690, 1175),
        skyline=[
            (55, 1168), (55, 420), (268, 412), (272, 388), (478, 385), (482, 1168),
        ],
        rects=[
            (55, 388, 660, 432),    # 顶部横向管线
            (470, 945, 660, 1168),  # 底部管线+泵组
        ],
    ),
    "rmd03": dict(
        crop=(150, 430, 1540, 1360),
        skyline=[
            (160, 1355), (160, 485), (278, 480), (282, 448), (573, 445), (577, 492),
            (688, 490), (692, 458), (848, 455), (852, 452), (963, 450), (967, 458),
            (1103, 455), (1107, 455), (1248, 455), (1252, 462), (1393, 460),
            (1397, 455), (1530, 455), (1532, 1355),
        ],
        rects=[(160, 432, 1530, 482)],   # 顶部管线
    ),
    "rmd04": dict(
        crop=(170, 495, 1540, 1500),
        skyline=[
            (180, 1495), (180, 538), (288, 535), (292, 517), (378, 515), (382, 532),
            (503, 530), (507, 530), (623, 530), (627, 547), (743, 545), (747, 512),
            (868, 508), (872, 505), (993, 503), (997, 532), (1128, 530), (1132, 522),
            (1253, 520), (1257, 542), (1398, 540), (1402, 542), (1527, 540), (1528, 1495),
        ],
        rects=[(185, 498, 1525, 545)],   # 顶部管线
    ),
}


def build(name):
    img = cv2.imread(f"{BASE}/{name}.jpg")
    H, W = img.shape[:2]
    cfg = SHAPES[name]
    cx1, cy1, cx2, cy2 = [int(v * S) for v in cfg["crop"]]
    cx1, cy1 = max(0, cx1), max(0, cy1)
    cx2, cy2 = min(W, cx2), min(H, cy2)

    m = np.zeros((cy2 - cy1, cx2 - cx1), np.uint8)
    poly = np.array([[int(x * S - cx1), int(y * S - cy1)] for x, y in cfg["skyline"]])
    cv2.fillPoly(m, [poly], 255)
    for (rx1, ry1, rx2, ry2) in cfg["rects"]:
        x1, y1 = int(rx1 * S - cx1), int(ry1 * S - cy1)
        x2, y2 = int(rx2 * S - cx1), int(ry2 * S - cy1)
        m[max(0, y1):min(m.shape[0], y2), max(0, x1):min(m.shape[1], x2)] = 255

    # 水平收缩 2 轮 x 9px, 竖向 1 轮 x 5px: 削掉多边形边缘误含的背景条带
    kx = np.ones((1, 9), np.uint8)
    for _ in range(2):
        m = cv2.erode(m, kx)
    ky = np.ones((5, 1), np.uint8)
    m = cv2.erode(m, ky)

    # 羽化
    alpha = cv2.GaussianBlur(m.astype(np.float32), (5, 5), 1.6)
    hard = m
    edge = cv2.dilate(hard, np.ones((7, 7), np.uint8), iterations=1)
    alpha = np.where((edge == 255) & (hard == 0), alpha * 0.45, alpha)

    sub = img[cy1:cy2, cx1:cx2]
    rgba = np.dstack([sub, alpha.astype(np.uint8)])
    out = f"{OUT}/{name}_cutout.png"
    cv2.imwrite(out, rgba)
    ys, xs = np.where(m == 255)
    print(f"{name}: crop {sub.shape[1]}x{sub.shape[0]}, kept {m.sum()//255} px")


for k in SHAPES:
    build(k)
