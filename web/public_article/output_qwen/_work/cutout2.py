# -*- coding: utf-8 -*-
"""设备抠图 v3: 设备有结构纹理, 墙面/地面/天花板是平滑背景。
用大核中值估计背景, 差分+局部纹理提取设备, 填充后羽化。"""
import cv2
import numpy as np

BASE = "/home/admin/tools/cuijin/public_article"
OUT = f"{BASE}/output_qwen/assets"

# 外框(预览坐标), 只包住设备本体, 不含天花板/大片地面
BOXES = {
    "rmd01": (140, 320, 1705, 1270),
    "rmd02": (48, 372, 945, 1170),
    "rmd03": (110, 445, 1555, 1370),
    "rmd04": (150, 485, 1550, 1500),
}
S = 2304 / 2000.0


def estimate_bg(img):
    # 大核中值对大块平滑区域有效, 设备边缘处取中值也接近背景
    bg = cv2.medianBlur(img, 51)
    bg = cv2.GaussianBlur(bg, (31, 31), 10)
    return bg


def extract(name, box):
    img = cv2.imread(f"{BASE}/{name}.jpg")
    h, w = img.shape[:2]
    x1, y1, x2, y2 = [int(v * S) for v in box]
    x1, y1 = max(0, x1 - 12), max(0, y1 - 12)
    x2, y2 = min(w, x2 + 12), min(h, y2 + 12)

    sub = img[y1:y2, x1:x2]
    bg = estimate_bg(img)[y1:y2, x1:x2]

    # 差分 (设备 vs 背景)
    diff = np.abs(sub.astype(np.int16) - bg.astype(np.int16)).max(axis=2).astype(np.uint8)
    # 局部纹理: 拉普拉斯幅度
    lap = cv2.Laplacian(cv2.cvtColor(sub, cv2.COLOR_BGR2GRAY), cv2.CV_32F)
    tex = np.abs(lap).astype(np.uint8)
    tex = cv2.medianBlur(tex, 7)

    mask = ((diff > 26) | (tex > 40)).astype(np.uint8) * 255

    # 形态学: 先闭运算连成面, 再开运算去噪点
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
    k2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k2)

    # 保留最大连通域 + 面积>2%的部件
    m = (mask > 0).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    if n > 1:
        main = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        m2 = np.zeros_like(m)
        thr = stats[main, cv2.CC_STAT_AREA] * 0.02
        for i in range(1, n):
            if i == main or stats[i, cv2.CC_STAT_AREA] > thr:
                m2[labels == i] = 1
        m = m2

    # 洞填充 (设备内部平滑区域可能没被差分覆盖)
    ff = (1 - m) * 255
    # 从边缘洪水填充背景
    ff2 = ff.copy()
    H, W = ff2.shape
    cv2.floodFill(ff2, None, (0, 0), 0)
    cv2.floodFill(ff2, None, (W - 1, 0), 0)
    cv2.floodFill(ff2, None, (0, H - 1), 0)
    cv2.floodFill(ff2, None, (W - 1, H - 1), 0)
    holes = (ff2 > 0)
    m = np.where(holes, 1, m)

    # 边缘清理
    k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k3)

    # 羽化
    alpha = (m * 255).astype(np.float32)
    alpha = cv2.GaussianBlur(alpha, (5, 5), 1.4)
    hard = (m * 255).astype(np.uint8)
    edge = cv2.dilate(hard, k2, iterations=1)
    alpha = np.where((edge == 255) & (hard == 0), alpha * 0.45, alpha)

    rgba = np.dstack([sub, alpha.astype(np.uint8)])
    out = f"{OUT}/{name}_cutout.png"
    cv2.imwrite(out, rgba)
    ys, xs = np.where(m == 1)
    print(f"{name}: kept {m.sum()} px, bbox x[{xs.min()}-{xs.max()}] y[{ys.min()}-{ys.max()}] (in crop)")


for k, v in BOXES.items():
    extract(k, v)
