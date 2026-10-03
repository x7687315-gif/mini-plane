"""带诊断的真机验证：关掉主窗口 → 整个应用必须退出。

上一版失败原因：① 脚本结束时工具清理了进程树（所以"端口释放"不能作为证据）
② 没枚举到可见窗口（不知道 WM_CLOSE 有没有送达）。
这一版把窗口枚举结果**打出来**，并在同一进程内完成"启动 → 关闭 → 检查"，
不依赖脚本结束后的任何状态。
"""

import ctypes
import subprocess
import sys
import time
from ctypes import wintypes

sys.path.insert(0, "C:/palne/desktop")
from window_watch import visible_window_exists  # 与桌面端实际逻辑同一份代码

WM_CLOSE = 0x0010
EXE = r"C:\palne\dist\MiniPlane\MiniPlane.exe"
user32 = ctypes.windll.user32
EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)


def count(image: str) -> int:
    out = subprocess.run(
        ["tasklist", "/FI", f"IMAGENAME eq {image}", "/FO", "CSV", "/NH"], capture_output=True
    ).stdout.decode("gbk", "replace")
    # tasklist 在没有匹配时会返回一句提示（"信息: 没有运行的任务…"），它不是进程行
    return len([x for x in out.splitlines() if x.strip().startswith(chr(34))])


def busy_ports() -> list[str]:
    out = subprocess.run(["netstat", "-ano"], capture_output=True).stdout.decode("gbk", "replace")
    return [
        ln.split()[1]
        for ln in out.splitlines()
        if len(ln.split()) >= 5
        and "LISTENING" in ln
        and (":8000" in ln.split()[1] or ":3000" in ln.split()[1])
    ]


def list_windows() -> list[tuple[int, int, str, bool]]:
    """(hwnd, pid, title, visible)"""
    found: list[tuple[int, int, str, bool]] = []

    def cb(hwnd, _l):
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        n = user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(n + 1)
        user32.GetWindowTextW(hwnd, buf, n + 1)
        title = buf.value
        if pid.value and title:
            found.append((hwnd, pid.value, title, bool(user32.IsWindowVisible(hwnd))))
        return True

    user32.EnumWindows(EnumWindowsProc(cb), 0)
    return found


def main() -> int:
    subprocess.run(["taskkill", "/IM", "MiniPlane.exe", "/T", "/F"], capture_output=True)
    time.sleep(2)
    print("启动前：", {"MiniPlane": count("MiniPlane.exe"), "端口": busy_ports()})

    proc = subprocess.Popen([EXE], cwd=r"C:\palne\dist\MiniPlane")
    print(f"已启动（pid={proc.pid}），等 40 秒…")
    time.sleep(40)
    print("运行中：", {"MiniPlane": count("MiniPlane.exe"), "端口": busy_ports()})

    wins = [w for w in list_windows() if "Mini Plane" in w[2]]
    for w in wins:
        state = "visible" if w[3] else "hidden"
        print(f"  窗口 hwnd={w[0]} pid={w[1]} [{state}] {w[2]}")
    if not wins:
        print("  ⚠️ 没找到窗口 —— 无法验证关闭路径")
        return 2

    target = next((w for w in wins if w[3]), wins[0])
    print(f"  向 hwnd={target[0]}（{target[2]}）投 WM_CLOSE")
    user32.PostMessageW(target[0], WM_CLOSE, 0, 0)

    # 关键测量：WM_CLOSE 是异步投递，"投递了"不等于"窗口已关闭"。
    # 必须先确认窗口真的消失，否则测不到"进程是否随之退出"这件事。
    gone = False
    for i in range(20):
        time.sleep(1)
        if not visible_window_exists(target[2]):
            print(f"  窗口在 +{i + 1}s 消失 ✓")
            gone = True
            break
    if not gone:
        print("  WM_CLOSE 20 秒内未关闭窗口 —— 本次无法验证退出路径")
        return 2

    deadline = time.time() + 45
    while time.time() < deadline:
        if count("MiniPlane.exe") == 0 and not busy_ports():
            break
        time.sleep(2)

    after = {"MiniPlane": count("MiniPlane.exe"), "端口": busy_ports()}
    print("\n关闭后：", after)
    ok = after["MiniPlane"] == 0 and not after["端口"]
    print("结论：", "✅ 关掉主窗口后整个应用退出、端口释放" if ok else "❌ 仍有残留")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
