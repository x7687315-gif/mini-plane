"""清理构建缓存（系统 TEMP 里的 miniplane-build-* + 仓库内的构建缓存）。

## 为什么要有这个脚本

`scripts/package.py` 每次构建都在系统 TEMP 里建一个 `miniplane-build-*` 目录
（约 0.85 GB），**成功之后从不清理**。2026-10-04 为了修桌面版反复重建，累积了 8 个，
占掉 5.9 GB —— 用户发现"硬盘平白少了十几个 G"就是它。

## 为什么不做进 package.py

这台机器上有"批量删除保护"：脚本里删目录会被**直接终止进程**（日志只有一行拦截记录、
没有 traceback），package.py 为此改成了零删除策略（临时目录唯一化）。
所以清理独立成一个脚本，人工执行。

用法：
    backend\\.venv\\Scripts\\python.exe scripts\\cleanup-build-cache.py
    backend\\.venv\\Scripts\\python.exe scripts\\cleanup-build-cache.py --dry-run   # 只看不删
"""

from __future__ import annotations

import ctypes
import os
import pathlib
import sys
from ctypes import wintypes

FOF_ALLOWUNDO = 0x0040  # 送回收站，可还原
FOF_NOCONFIRMATION = 0x0010
FOF_NOERRORUI = 0x0400
FOF_SILENT = 0x0004
FO_DELETE = 3


class SHFILEOPSTRUCTW(ctypes.Structure):
    _fields_ = [
        ("hwnd", wintypes.HWND),
        ("wFunc", wintypes.UINT),
        ("pFrom", wintypes.LPCWSTR),
        ("pTo", wintypes.LPCWSTR),
        ("fFlags", ctypes.c_uint16),
        ("fAnyOperationsAborted", wintypes.BOOL),
        ("hNameMappings", ctypes.c_void_p),
        ("lpszProgressTitle", wintypes.LPCWSTR),
    ]


ROOT = pathlib.Path(__file__).resolve().parent.parent
TEMP = pathlib.Path(os.environ.get("TEMP", pathlib.Path.home() / "AppData" / "Local" / "Temp"))


def size(p: pathlib.Path) -> int:
    if not p.exists():
        return 0
    if p.is_file():
        return p.stat().st_size
    try:
        return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
    except Exception:
        return 0


def human(n: int) -> str:
    return f"{n / 1024 / 1024 / 1024:.2f} GB" if n >= 1024**3 else f"{n / 1024 / 1024:.1f} MB"


def to_recycle_bin(p: pathlib.Path) -> int:
    """送回收站；返回 0 表示成功。逐个删，不要整批（整批时部分项会失败）。"""
    buf = str(p) + "\0\0"
    op = SHFILEOPSTRUCTW()
    op.wFunc = FO_DELETE
    op.pFrom = buf
    op.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI
    return int(ctypes.windll.shell32.SHFileOperationW(ctypes.byref(op)))


def targets() -> list[tuple[str, pathlib.Path]]:
    out: list[tuple[str, pathlib.Path]] = []
    for p in sorted(TEMP.glob("miniplane-build-*")):
        out.append(("TEMP 构建残留", p))
    for rel in (
        "dist/.build-frontend",
        "frontend/.next",
        ".ruff_cache",
        "frontend/test-results",
        "frontend/playwright-report",
    ):
        p = ROOT / rel
        if p.exists():
            out.append(("仓库构建缓存", p))
    return out


def main() -> int:
    dry = "--dry-run" in sys.argv
    items = targets()
    if not items:
        print("没有需要清理的构建缓存 ✓")
        return 0

    total = sum(size(p) for _, p in items)
    print(f"{'【只看不删】' if dry else '【执行清理】'} 共 {len(items)} 项，{human(total)}\n")
    for label, p in items:
        print(f"  {human(size(p)):>10}  [{label}] {p}")

    if dry:
        return 0

    freed = 0
    print()
    for _label, p in items:
        before = size(p)
        rc = to_recycle_bin(p)
        after = size(p)
        ok = after == 0
        print(f"  {'✓' if ok else '✗'} {p.name:28s} rc={rc}  {human(before - after)}")
        freed += before - after
    print(f"\n已送入回收站：{human(freed)}（可在回收站还原）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
