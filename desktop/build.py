"""把 desktop/launcher.py 冻结成单文件 MiniPlane.exe，并落到 dist/MiniPlane/。

用法：
    backend\\.venv\\Scripts\\python.exe desktop\\build.py           # 构建 exe
    ...python.exe desktop\\build.py --portable                     # 连 backend+app 拷成分发目录

说明：
- 冻结的只是"启动器"（pywebview 编排器）。它运行时仍会用**同级仓库里的** backend\\.venv
  python 起 Django、用 Node 跑前端 server.js —— 靠 launcher 的"向上找仓库根"定位。
  所以把 exe 放在仓库内任意层级都能双击运行（用本机的 backend / dist 前端产物）。
- 想要拷到别的干净机器上独立跑，加 --portable：会把前端 app 与 backend 源码一并放进
  dist/MiniPlane/，目标机器只需装 Node 20+ 并在 backend/ 里建一次 venv（见产物内 README）。

PyInstaller 会把 build 缓存写在 desktop/build/（已 gitignore），产物在 dist/MiniPlane/。
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAUNCHER = ROOT / "desktop" / "launcher.py"
BUILD = ROOT / "desktop" / "build"
OUT = ROOT / "dist" / "MiniPlane"
ICON = ROOT / "desktop" / "miniplane.ico"
NAME = "MiniPlane"


def venv_python() -> Path:
    scripts = "Scripts" if sys.platform == "win32" else "bin"
    exe = "python.exe" if sys.platform == "win32" else "python"
    return ROOT / "backend" / ".venv" / scripts / exe


def run(cmd: list[str]) -> None:
    print("$ " + " ".join(str(c) for c in cmd))
    r = subprocess.run(cmd, cwd=str(ROOT))
    if r.returncode != 0:
        sys.exit(f"[ERROR] 命令失败（退出码 {r.returncode}）")


def build_exe() -> Path:
    py = venv_python()
    if not py.exists():
        sys.exit(
            f"[ERROR] 找不到 venv python：{py}\n        请先建 venv 并装依赖（含 pyinstaller）"
        )

    args = [
        str(py),
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--windowed",
        "--name",
        NAME,
        "--collect-all",
        "webview",
        "--distpath",
        str(BUILD / "dist"),
        "--workpath",
        str(BUILD / "work"),
        "--specpath",
        str(BUILD),
    ]
    if ICON.exists():
        args += ["--icon", str(ICON)]
    args += [str(LAUNCHER)]
    run(args)

    exe = BUILD / "dist" / (f"{NAME}.exe" if sys.platform == "win32" else NAME)
    if not exe.exists():
        sys.exit(f"[ERROR] 构建后未找到产物：{exe}")

    OUT.mkdir(parents=True, exist_ok=True)
    dst = OUT / exe.name
    shutil.copy2(exe, dst)
    print(f"\n[OK] 已生成启动器：{dst}")
    return dst


def make_portable() -> None:
    """把前端 app + 后端源码拷进 dist/MiniPlane/，做成可分发目录（不含 venv / node）。"""
    # 前端：复用已构建的 standalone（launcher 的就近查找也能命中这里）
    # ⚠️ 必须取**修改时间最新**的那个：dist 里会积累多个带时间戳的包目录，
    #    按字母序取第一个会**默默选中旧的**（2026-10-05 抓到：刚构建完的新包排在其后，
    #    结果桌面版打进的是昨天的前端）。改前端后桌面版"怎么还是旧的"多半就是它。
    app_src = None
    app_candidates = (
        [
            (ROOT / "app"),
            *sorted(
                (ROOT / "dist").glob("*/app"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            ),
        ]
        if (ROOT / "dist").is_dir()
        else [(ROOT / "app")]
    )
    for cand in app_candidates:
        if (cand / "server.js").exists():
            app_src = cand
            break
    if app_src:
        shutil.copytree(app_src, OUT / "app", dirs_exist_ok=True)
        print(f"[portable] 前端 -> {OUT / 'app'}（源：{app_src}）")
    else:
        print("[portable] 警告：未找到已构建前端，先跑 python scripts/package.py")

    # 后端源码（不含 venv / 缓存 / 密钥）
    def ignore(_src: str, names: list[str]) -> set[str]:
        skip = {
            ".venv",
            "__pycache__",
            ".env",
            ".celery",
            "staticfiles",
            ".pytest_cache",
            ".ruff_cache",
        }
        return {n for n in names if n in skip or n.endswith(".pyc")}

    shutil.copytree(ROOT / "backend", OUT / "backend", ignore=ignore)
    print(f"[portable] 后端源码 -> {OUT / 'backend'}")
    print(
        "[portable] 目标机首次：装 Node20+ → cd backend && python -m venv .venv && "
        ".venv\\Scripts\\python -m pip install -r requirements/local.txt "
        "-r requirements/desktop.txt"
    )


def main() -> None:
    if not LAUNCHER.exists():
        sys.exit(f"[ERROR] 找不到启动器：{LAUNCHER}")
    build_exe()
    if "--portable" in sys.argv[1:]:
        make_portable()
    print("下一步：用 make_shortcut 指向该 exe，或直接双击运行。")


if __name__ == "__main__":
    main()
