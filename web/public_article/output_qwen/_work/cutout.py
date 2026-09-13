# -*- coding: utf-8 -*-
"""设备照片抠图 v2: 全图背景 + 核心框前景, 多次迭代, 输出透明 PNG"""
import cv2
import numpy as np

BASE = "/home/admin/tools/cuijin/public_article"
OUT = f"{BASE}/output_qwen/assets"

# 设备主体包围盒 (2000x1500 预览坐标), 外扩为可能前景, 核心框为确定前景
BOXES = {
    # 名称: (外框 x1,y1,x2,y2, 核心框 x1,y1,x2,y2)  单位: 预览坐标
    "rmd01": ((390, 295, 1700, 1310), (470, 340, 1650, 1290)),
    "rmd02": ((55, 375, 935, 1185), (80, 410, 915, 1160)),
    "rmd03": ((135, 435, 1520, 1390), (160, 470, 1495, 1360)),
    "rmd04": ((165, 475, 1540, 1500), (200, 505, 1515, 1485)),
}
S = 2304 / 2000.0


def cutout(name, outer, core):
    img = cv2.imread(f"{BASE}/{name}.jpg")
    h, w = img.shape[:2]

    def sc(b):
        return [int(v * S) for v in b]

    ox1, oy1, ox2, oy2 = sc(outer)
    cx1, cy1, cx2, cy2 = sc(core)

    mask = np.full(img.shape[:2], cv2.GC_BGD, np.uint8)      # 全图背景
    mask[oy1:oy2, ox1:ox2] = cv2.GC_PR_FGD                    # 外框: 可能前景
    mask[cy1:cy2, cx1:cx2] = cv2.GC_FGD                       # 核心: 确定前景

    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    for _ in range(4):
        cv2.grabCut(img, mask, None, bgd, fgd, 3, cv2.GC_INIT_WITH_MASK)

    m = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)

    # 最大连通域为主体, 保留面积 >2% 主体的独立部件(控制柜等)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    if n > 1:
        main = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        m2 = np.zeros_like(m)
        thr = stats[main, cv2.CC_STAT_AREA] * 0.02
        for i in range(1, n):
            if i == main or stats[i, cv2.CC_STAT_AREA] > thr:
                m2[labels == i] = 1
        m = m2

    # 去毛刺 + 补洞
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)
    k2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, k2)

    alpha = (m * 255).astype(np.float32)
    alpha = cv2.GaussianBlur(alpha, (5, 5), 1.6)
    hard = (m * 255).astype(np.uint8)
    edge = cv2.dilate(hard, k2, iterations=1)
    alpha = np.where((edge == 255) & (hard == 0), alpha * 0.5, alpha)

    rgba = np.dstack([img, alpha.astype(np.uint8)])
    out = f"{OUT}/{name}_cutout.png"
    cv2.imwrite(out, rgba)
    ys, xs = np.where(m == 1)
    print(f"{name}: kept {m.sum()} px, bbox x[{xs.min()}-{xs.max()}] y[{ys.min()}-{ys.max()}]")


for k, (o, c) in BOXES.items():
    cutout(k, o, c)
