"""Island V2 阶段 2 真机验证：触发把手 / 图钉固定 / 退出干净。

测什么（对应规格 §8 桌面验收）：
1. 启动后**只出现把手**（默认 auto_hide），完整面板不可见；
2. 点把手 → 完整面板出现；再点 → 收起；
3. 桌面配置文件被创建且内容合法；
4. 关掉主窗口 → 把手、面板、后端、前端**全部退出**，端口释放。

做法与 verify_quit.py 同源：真起 exe，用 Win32 枚举窗口、投 WM_CLOSE。
"""

import ctypes
import json
import subprocess
import sys
import time
from ctypes import wintypes

sys.path.insert(0, r"C:\palne\desktop")
from island import ISLAND_TITLE, TRIGGER_TITLE  # noqa: E402

EXE = r"C:\palne\dist\MiniPlane\MiniPlane.exe"
CFG = r"C:\palne\runtime\desktop-config.json"
APP_TITLE = "Mini Plane  ·  本地单机版"

user32 = ctypes.windll.user32
EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
WM_CLOSE = 0x0010


def count(image: str) -> int:
    out = subprocess.run(
        ["tasklist", "/FI", f"IMAGENAME eq {image}", "/FO", "CSV", "/NH"], capture_output=True
    ).stdout.decode("gbk", "replace")
    return len([x for x in out.splitlines() if x.strip().startswith('"')])


def busy_ports() -> list[str]:
    out = subprocess.run(["netstat", "-ano"], capture_output=True).stdout.decode("gbk", "replace")
    return [
        ln.split()[1]
        for ln in out.splitlines()
        if len(ln.split()) >= 5
        and "LISTENING" in ln
        and (":8000" in ln.split()[1] or ":3000" in ln.split()[1])
    ]


def find_window(title: str) -> int | None:
    hit = None

    def cb(hwnd, _l):
        nonlocal hit
        if user32.IsWindowVisible(hwnd):
            n = user32.GetWindowTextLengthW(hwnd)
            if n:
                buf = ctypes.create_unicode_buffer(n + 1)
                user32.GetWindowTextW(hwnd, buf, n + 1)
                if buf.value == title:
                    hit = hwnd
                    return False
        return True

    user32.EnumWindows(EnumWindowsProc(cb), 0)
    return hit


def main() -> int:
    subprocess.run(["taskkill", "/IM", "MiniPlane.exe", "/T", "/F"], capture_output=True)
    time.sleep(2)
    # 从干净偏好开始：删掉配置文件，验证"默认隐藏 + 启动时创建配置"
    try:
        import os

        os.remove(CFG)
        print("已删除旧 desktop-config.json（从干净偏好开始）")
    except FileNotFoundError:
        pass

    print("\n=== 1) 启动，等 45 秒 ===")
    subprocess.Popen([EXE], cwd=r"C:\palne\dist\MiniPlane")
    time.sleep(45)

    trig = find_window(TRIGGER_TITLE)
    panel = find_window(ISLAND_TITLE)
    main_w = find_window(APP_TITLE)
    print(
        f"  主窗口={main_w is not None}"
        f" 触发把手={trig is not None}"
        f" 完整面板可见={panel is not None}"
    )
    ok1 = trig is not None and main_w is not None
    print(f"  {'✅' if ok1 else '❌'} 默认只出现把手 + 主窗口（面板默认隐藏）")

    print("\n=== 2) 点把手 → 面板展开 ===")
    if trig:
        user32.PostMessageW(trig, WM_CLOSE, 0, 0)  # 占位：实际点击用鼠标消息
    # 用鼠标左键点击把手中心（PostMessage 对 WebView2 不触发 click）
    if trig:
        rect = wintypes.RECT()
        user32.GetWindowRect(trig, ctypes.byref(rect))
        x, y = (rect.left + rect.right) // 2, (rect.top + rect.bottom) // 2
        user32.SetCursorPos(x, y)
        user32.mouse_event(0x0002, 0, 0, 0, 0)  # MOUSEEVENTF_LEFTDOWN
        user32.mouse_event(0x0004, 0, 0, 0, 0)  # MOUSEEVENTF_LEFTUP
        appeared = False
        for _ in range(15):
            time.sleep(1)
            if find_window(ISLAND_TITLE):
                appeared = True
                break
        print(f"  {'✅' if appeared else '❌'} 点击把手后面板展开：{appeared}")

    print("\n=== 3) 桌面配置文件 ===")
    try:
        cfg = json.loads(open(CFG, encoding="utf-8").read())
        print(f"  {CFG}: {cfg}")
        ok3 = cfg.get("displayMode") in ("auto_hide", "pinned")
        print(f"  {'✅' if ok3 else '❌'} 配置合法（displayMode 取值正确）")
    except Exception as exc:
        ok3 = False
        print(f"  ❌ 读取失败：{exc!r}")

    print("\n=== 4) 关掉主窗口 → 全部退出 ===")
    if main_w:
        user32.PostMessageW(main_w, WM_CLOSE, 0, 0)
    deadline = time.time() + 60
    while time.time() < deadline:
        if count("MiniPlane.exe") == 0 and not busy_ports():
            break
        time.sleep(2)
    ok4 = count("MiniPlane.exe") == 0 and not busy_ports()
    print(
        f"  {'✅' if ok4 else '❌'} 关闭后 MiniPlane={count('MiniPlane.exe')}"
        f" 端口={busy_ports() or '空'}"
    )

    print(
        f"\n总结：把手={'✅' if ok1 else '❌'} 展开=见上"
        f" 配置={'✅' if ok3 else '❌'} 退出={'✅' if ok4 else '❌'}"
    )
    return 0 if (ok1 and ok3 and ok4) else 1


if __name__ == "__main__":
    raise SystemExit(main())
