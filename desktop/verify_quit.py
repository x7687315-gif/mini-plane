"""真机验证：关闭/强杀主窗口后，桌面应用与整棵子进程树都必须退出。

用法（Windows，需先构建 dist/MiniPlane/MiniPlane.exe）：
    python desktop/verify_quit.py
    python desktop/verify_quit.py --force      # 模拟任务管理器强杀

检查项：
- 主窗口消失后，启动时记录的**所有后代进程**（后端 python、前端 node、
  WebView2 的 msedgewebview2.exe）都必须在超时内退出；
- 8000/3000 端口释放；
- MiniPlane.exe 镜像不再存活。

2026-10-29 加严：旧版只检查 MiniPlane.exe 与端口，会漏掉复用的 node/python；
现在按启动前记录的 PID 逐项核对。
"""

from __future__ import annotations

import argparse
import ctypes
import json
import subprocess
import sys
import time
from ctypes import wintypes
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXE = ROOT / "dist" / "MiniPlane" / "MiniPlane.exe"
# 必须与 launcher.APP_TITLE 完全一致：浏览器标签里也可能出现 "Mini Plane"，
# 用子串匹配会把浏览器窗口当成主窗口（2026-10-29 实测踩到）。
MAIN_TITLE = "Mini Plane  ·  本地单机版"
WM_CLOSE = 0x0010
user32 = ctypes.windll.user32
EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def process_table() -> list[dict]:
    script = (
        "Get-CimInstance Win32_Process | "
        "Select-Object ProcessId,ParentProcessId,Name,CommandLine | "
        "ConvertTo-Json -Compress"
    )
    out = subprocess.run(
        ["powershell", "-NoProfile", "-Command", script],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    ).stdout.strip()
    if not out:
        return []
    value = json.loads(out)
    return value if isinstance(value, list) else [value]


def descendants(root_pid: int, table: list[dict]) -> dict[int, str]:
    ids = {root_pid: "root"}
    changed = True
    while changed:
        changed = False
        for item in table:
            pid = int(item["ProcessId"])
            parent = int(item["ParentProcessId"])
            if parent in ids and pid not in ids:
                ids[pid] = str(item.get("Name") or "")
                changed = True
    return ids


def pid_alive(pid: int) -> bool:
    out = subprocess.run(
        ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
        capture_output=True,
        text=True,
        encoding="gbk",
        errors="replace",
    ).stdout
    return any(line.strip().startswith('"') for line in out.splitlines())


def count_image(image: str) -> int:
    out = subprocess.run(
        ["tasklist", "/FI", f"IMAGENAME eq {image}", "/FO", "CSV", "/NH"],
        capture_output=True,
        text=True,
        encoding="gbk",
        errors="replace",
    ).stdout
    return len([line for line in out.splitlines() if line.strip().startswith('"')])


def busy_ports() -> list[str]:
    out = subprocess.run(
        ["netstat", "-ano"],
        capture_output=True,
        text=True,
        encoding="gbk",
        errors="replace",
    ).stdout
    return [
        line.split()[1]
        for line in out.splitlines()
        if len(line.split()) >= 5
        and "LISTENING" in line
        and (":8000" in line.split()[1] or ":3000" in line.split()[1])
    ]


def windows() -> list[tuple[int, int, str, bool]]:
    found: list[tuple[int, int, str, bool]] = []

    def cb(hwnd, _lparam):
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


def wait_main_window(timeout: float) -> tuple[int, int, str] | None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        hits = [w for w in windows() if w[2] == MAIN_TITLE and w[3]]
        if hits:
            hwnd, pid, title, _visible = hits[0]
            return hwnd, pid, title
        time.sleep(0.5)
    return None


def kill_pid(pid: int) -> None:
    subprocess.run(
        ["taskkill", "/T", "/F", "/PID", str(pid)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )


def main() -> int:
    if sys.platform != "win32":
        print("verify_quit.py 只能在 Windows 真机运行。")
        return 2

    parser = argparse.ArgumentParser()
    parser.add_argument("--exe", type=Path, default=EXE)
    parser.add_argument(
        "--force",
        action="store_true",
        help="用 taskkill /F 强杀窗口进程，模拟任务管理器；用作 Job Object 兜底验证",
    )
    args = parser.parse_args()
    if not args.exe.exists():
        print(f"找不到 exe：{args.exe}（先运行 python desktop/build.py）")
        return 2

    for pid_row in process_table():
        if "MiniPlane" in str(pid_row.get("Name")):
            kill_pid(int(pid_row["ProcessId"]))
    time.sleep(1)
    before_ports = busy_ports()

    proc = subprocess.Popen([str(args.exe)], cwd=str(args.exe.parent))
    print(f"已启动 pid={proc.pid}，等待主窗口…")
    found = wait_main_window(60)
    if found is None:
        print("[FAIL] 60 秒内未找到主窗口")
        kill_pid(proc.pid)
        return 1
    hwnd, window_pid, title = found
    print(f"主窗口 hwnd={hwnd} pid={window_pid} title={title!r}")

    table = process_table()
    tracked = descendants(proc.pid, table)
    tracked.update(descendants(window_pid, table))
    print(f"启动时记录后代 {len(tracked) - 1} 个；其中 WebView2:", end=" ")
    print(sum(1 for name in tracked.values() if name.lower() == "msedgewebview2.exe"))

    if args.force:
        print(f"强杀窗口进程 pid={window_pid}")
        kill_pid(window_pid)
    else:
        print("向主窗口发送 WM_CLOSE")
        user32.PostMessageW(hwnd, WM_CLOSE, 0, 0)

    gone = False
    for _ in range(30):
        time.sleep(1)
        alive = [pid for pid in tracked if pid != proc.pid and pid_alive(pid)]
        if not alive and not busy_ports() and count_image("MiniPlane.exe") == 0:
            gone = True
            break
    after = {
        "MiniPlane": count_image("MiniPlane.exe"),
        "ports": busy_ports(),
        "alive_descendants": [
            f"{pid}:{name}" for pid, name in tracked.items() if pid != proc.pid and pid_alive(pid)
        ],
    }
    print("关闭后：", after)
    if gone and not before_ports:
        print("结论：[OK] 窗口关闭，整棵进程树退出，端口释放")
        return 0

    print("结论：[FAIL] 仍有残留")
    for pid in tracked:
        if pid != proc.pid:
            kill_pid(pid)
    kill_pid(proc.pid)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
