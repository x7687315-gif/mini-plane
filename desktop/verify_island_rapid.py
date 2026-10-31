"""真机验证：最终 exe 中的 Island 快速反向展开/收起。

前置：桌面配置可以是 collapsed 或 expanded；脚本会先确保展开，最后恢复原配置。
运行：backend\\.venv\\Scripts\\python.exe desktop\\verify_island_rapid.py
"""

from __future__ import annotations

import ctypes
import json
import subprocess
import sys
import time
from ctypes import wintypes
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXE = ROOT / "dist" / "MiniPlane" / "MiniPlane.exe"
CONFIG = ROOT / "runtime" / "desktop-config.json"
MAIN_TITLE = "Mini Plane  ·  本地单机版"
ISLAND_TITLE = "Mini Plane · Island"
WM_CLOSE = 0x0010
VK_MENU = 0x12
VK_I = 0x49
KEYUP = 0x2
user32 = ctypes.windll.user32
EnumProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)


def window_title(hwnd: int) -> str:
    n = user32.GetWindowTextLengthW(hwnd)
    buf = ctypes.create_unicode_buffer(n + 1)
    user32.GetWindowTextW(hwnd, buf, n + 1)
    return buf.value


def find_window(title: str) -> int | None:
    found: int | None = None

    def cb(hwnd, _lparam):
        nonlocal found
        if user32.IsWindowVisible(hwnd) and window_title(hwnd) == title:
            found = hwnd
            return False
        return True

    user32.EnumWindows(EnumProc(cb), 0)
    return found


def rect(hwnd: int) -> tuple[int, int, int, int]:
    r = wintypes.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(r))
    return r.right - r.left, r.bottom - r.top, r.left, r.top


def click(x: int, y: int) -> None:
    user32.SetCursorPos(x, y)
    user32.mouse_event(0x0002, 0, 0, 0, 0)
    user32.mouse_event(0x0004, 0, 0, 0, 0)


def alt_i() -> None:
    user32.keybd_event(VK_MENU, 0, 0, 0)
    user32.keybd_event(VK_I, 0, 0, 0)
    user32.keybd_event(VK_I, 0, KEYUP, 0)
    user32.keybd_event(VK_MENU, 0, KEYUP, 0)


def wait_island(timeout: float = 60) -> int | None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        hwnd = find_window(ISLAND_TITLE)
        if hwnd:
            return hwnd
        time.sleep(0.5)
    return None


def ensure_expanded(hwnd: int) -> tuple[int, int]:
    w, h, x, y = rect(hwnd)
    # 第一次点击可能只用于把无边框窗口激活，事件不会传到 WebView2；
    # 等窗口就绪后最多点两次，第二次才是有效点击（真机实测）。
    for _ in range(2):
        if w >= 400:
            break
        user32.SetForegroundWindow(hwnd)
        user32.BringWindowToTop(hwnd)
        time.sleep(0.25)
        click(x + w // 2, y + h // 2)
        time.sleep(0.8)
        w, h, x, y = rect(hwnd)
    return w, h


def focus_content(hwnd: int) -> None:
    w, _h, x, y = rect(hwnd)
    user32.SetForegroundWindow(hwnd)
    click(x + w // 2, y + 120)
    time.sleep(0.2)


def main() -> int:
    if sys.platform != "win32":
        print("verify_island_rapid.py 只能在 Windows 真机运行。")
        return 2
    if not EXE.exists():
        print(f"找不到 exe：{EXE}")
        return 2
    if find_window(ISLAND_TITLE):
        print("已有 MiniPlane 在运行；为避免干扰，先关闭它再运行本脚本。")
        return 2

    original = None
    if CONFIG.exists():
        try:
            original = json.loads(CONFIG.read_text(encoding="utf-8-sig"))
        except (OSError, json.JSONDecodeError):
            original = None
    proc = subprocess.Popen([str(EXE)], cwd=str(EXE.parent))
    try:
        hwnd = wait_island()
        if hwnd is None:
            print("[FAIL] 未找到 Island 窗口")
            return 1
        w, h = ensure_expanded(hwnd)
        print(f"初始展开尺寸：{w}x{h}")
        if w < 400:
            print("[FAIL] 无法展开 Island")
            return 1
        focus_content(hwnd)

        # 展开 → 收起 → 展开：连续两次，最终应为展开。
        alt_i()
        time.sleep(0.06)
        alt_i()
        time.sleep(0.9)
        w, h, _, _ = rect(hwnd)
        print(f"快速反向（收起→展开）最终：{w}x{h}")
        if w < 400:
            print("[FAIL] 最终状态不是展开")
            return 1

        # 展开 → 收起 → 展开 → 收起：三次，最终应为收起。
        for _ in range(3):
            alt_i()
            time.sleep(0.06)
        time.sleep(0.9)
        w, h, x, y = rect(hwnd)
        print(f"快速三次最终：{w}x{h}")
        if w > 400 or h > 100:
            print("[FAIL] 最终状态不是收起")
            return 1

        # 从收起点击展开，再快速反向两次，最终应为展开。
        click(x + w // 2, y + h // 2)
        time.sleep(0.8)
        w, h, _, _ = rect(hwnd)
        if w < 400:
            print("[FAIL] 点击收起条未能展开")
            return 1
        focus_content(hwnd)
        alt_i()
        time.sleep(0.06)
        alt_i()
        time.sleep(0.9)
        w, h, _, _ = rect(hwnd)
        print(f"收起条展开后快速反向最终：{w}x{h}")
        if w < 400:
            print("[FAIL] 收起条展开后的快速反向状态错误")
            return 1

        print("结论：[OK] Island 快速反向操作最终状态正确")
        return 0
    finally:
        main_hwnd = find_window(MAIN_TITLE)
        if main_hwnd:
            user32.PostMessageW(main_hwnd, WM_CLOSE, 0, 0)
        # 等窗口/子进程真正退出再恢复配置，避免 app 最后写回覆盖测试前的值。
        for _ in range(20):
            if find_window(ISLAND_TITLE) is None and proc.poll() is not None:
                break
            time.sleep(0.5)
        if proc.poll() is None:
            subprocess.run(
                ["taskkill", "/T", "/F", "/PID", str(proc.pid)],
                capture_output=True,
                check=False,
            )
        time.sleep(1)
        if original is not None:
            # 统一写成无 BOM 的标准 JSON；PowerShell 的 UTF8 可能带 BOM，
            # 应用读取失败后会回落到默认配置（测试曾踩到）。
            CONFIG.write_text(
                json.dumps(original, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )


if __name__ == "__main__":
    raise SystemExit(main())
