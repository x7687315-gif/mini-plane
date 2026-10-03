"""Mini Plane 桌面单机版启动器（pywebview 原生窗口）。

它把"前端 + 后端 + 数据库"合并成**一个**本地软件体验：

1. 首次运行在 SQLite 上建库（无需安装 / 运行 PostgreSQL）；
2. 子进程拉起后端（Django Daphne ASGI，HTTP + WebSocket）与前端
   （Next standalone 的 node server）；
3. 就绪后开一个 **pywebview 原生窗口**（Windows 上是 WebView2）载入界面，
   不再调用系统浏览器；
4. **额外登记一个 Island 独立窗口**（Sprint 15）：置顶、无边框可拖、顶部居中、
   隐藏启动，用 `Alt+I` 或界面里的「独立窗口」按钮唤出；
5. 关窗即**干净停服**（kill 整棵子进程树），不残留端口占用。

同一份代码既能 `python desktop/launcher.py` 直接跑（开发），也能被 PyInstaller 冻结成
`MiniPlane.exe`（打包）；路径按 `sys.frozen` 自动切换。

安全基线：只绑 127.0.0.1、DEBUG 关闭、SECRET_KEY 持久化于 runtime/、页面与 API 同 host
（127.0.0.1，端口 3000/8000）以规避会话 cookie / CSRF 跨站失效。
"""

from __future__ import annotations

import http.client
import os
import subprocess
import sys
import time
from pathlib import Path

# Sprint 15：Island 独立窗口的两个模块。放在同目录，PyInstaller 会按 import 自动跟进。
sys.path.insert(0, str(Path(__file__).resolve().parent))

from island import create_island_window, island_enabled  # noqa: E402
from window_manager import DesktopApi, WindowManager  # noqa: E402

APP_TITLE = "Mini Plane  ·  本地单机版"
HOST = "127.0.0.1"
BACKEND_PORT = int(os.environ.get("MINIPLANE_BACKEND_PORT", "8000"))
FRONTEND_PORT = int(os.environ.get("MINIPLANE_FRONTEND_PORT", "3000"))
READY_TIMEOUT_S = int(os.environ.get("MINIPLANE_READY_TIMEOUT", "180"))

IS_FROZEN = bool(getattr(sys, "frozen", False))

# Windows：让子进程不弹黑色控制台窗口（纯 app 观感）。老版本 Python 无此常量，故给字面量兜底。
CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)


def _candidate_roots() -> list[Path]:
    """按优先级列出"可能装着 backend/ + app/ 的根目录"。

    冻结版：先 exe 所在目录，再逐级向上找仓库根（打包 exe 放在仓库内任意层级、
    或放在自带 backend/ + app/ 的分发目录里，都能被定位）；脚本版：desktop/ 上一级。
    """
    if IS_FROZEN:
        exe = Path(sys.executable).resolve()
        return [exe.parent, *exe.parents]
    return [Path(__file__).resolve().parent.parent]


def repo_root() -> Path:
    """选出要用的仓库根：**优先选带可用 venv 的那个**。

    为什么必须这么挑：exe 位于 `dist/MiniPlane/` 时，候选根按顺序是
    `dist/MiniPlane` → `dist` → `C:/palne`……而 `dist/MiniPlane/backend/` 里
    有源码（打包时拷进去的）但**没有 `.venv`**（venv 不分发：体积大、且和目标机器的
    Python 版本绑定）。若按"第一个有 manage.py 的目录"来选，就会落到 dist/MiniPlane，
    然后报「后端虚拟环境不存在」——而本机的 venv 其实就在仓库里好好的。

    所以判据从"有 manage.py"升级为"有 manage.py **且** 有 .venv"；都没有时才退回旧判据
    （真正的分发场景：用户需按提示在分发目录里建一次 venv）。
    """
    cands = _candidate_roots()
    with_manage = [r for r in cands if (r / "backend" / "manage.py").exists()]
    for r in with_manage:
        if (r / "backend" / ".venv").is_dir():
            return r
    return with_manage[0] if with_manage else cands[0]


def base_dir() -> Path:
    return repo_root()


def backend_dir() -> Path:
    return repo_root() / "backend"


def app_dir() -> Path:
    """Next standalone 前端目录（含 server.js），在候选根里就近找。

    优先级：MINIPLANE_APP_DIR 环境变量 → <根>/app → <根>/dist/*/app。
    """
    env = os.environ.get("MINIPLANE_APP_DIR")
    if env:
        return Path(env).resolve()
    for r in _candidate_roots():
        cand = r / "app"
        if (cand / "server.js").exists():
            return cand
        dist = r / "dist"
        if dist.is_dir():
            for p in sorted(dist.glob("*/app")):
                if (p / "server.js").exists():
                    return p
    return repo_root() / "app"


def venv_python() -> Path:
    scripts = "Scripts" if os.name == "nt" else "bin"
    return backend_dir() / ".venv" / scripts / ("python.exe" if os.name == "nt" else "python")


def runtime_dir() -> Path:
    d = repo_root() / "runtime"
    d.mkdir(parents=True, exist_ok=True)
    return d


def log_path(name: str) -> Path:
    p = runtime_dir() / f"{name}.log"
    return p


# ──────────────────────────────────────────────────────────────
# 子进程：Windows 下用 taskkill 杀整棵树（terminate 只杀直接子进程，node/daphne
# 可能再 fork），避免"关窗不停服"的老问题。
def _popen_kwargs(hide_console: bool) -> dict:
    # 仅放"额外"参数；cwd / env / stdout 等由各调用点显式传入，避免重复关键字
    kw: dict = {}
    if hide_console and os.name == "nt":
        # CREATE_NO_WINDOW：不弹黑色控制台窗口，纯 app 观感
        kw["creationflags"] = CREATE_NO_WINDOW
    return kw


def kill_tree(proc: subprocess.Popen | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/T", "/F", "/PID", str(proc.pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
        else:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
    except Exception:
        pass


def port_listening(port: int) -> bool:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.4)
        return s.connect_ex((HOST, port)) == 0


def http_ready(port: int, path: str) -> bool:
    try:
        conn = http.client.HTTPConnection(HOST, port, timeout=3)
        conn.request("GET", path)
        resp = conn.getresponse()
        conn.close()
        return 200 <= resp.status < 500
    except Exception:
        return False


def wait_ready(port: int, path: str, timeout: int = READY_TIMEOUT_S) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if http_ready(port, path):
            return True
        time.sleep(0.5)
    return False


# ──────────────────────────────────────────────────────────────
def first_run_migrate() -> None:
    """在 SQLite 上建表（幂等）。用 desktop 配置，无需 PostgreSQL。"""
    env = os.environ.copy()
    env["DJANGO_SETTINGS_MODULE"] = "config.settings.desktop"
    py = venv_python()
    logf = log_path("backend-setup").open("ab")
    subprocess.run(
        [str(py), "manage.py", "migrate", "--noinput"],
        cwd=str(backend_dir()),
        env=env,
        stdout=logf,
        stderr=subprocess.STDOUT,
        check=True,
        **({"creationflags": CREATE_NO_WINDOW} if os.name == "nt" else {}),
    )
    logf.close()


def start_backend() -> subprocess.Popen:
    env = os.environ.copy()
    env["DJANGO_SETTINGS_MODULE"] = "config.settings.desktop"
    env.setdefault("PYTHONUNBUFFERED", "1")
    py = venv_python()
    logf = log_path("backend").open("ab")
    # daphne 已接管 runserver（INSTALLED_APPS 首位），一条命令同时给 HTTP + WebSocket
    proc = subprocess.Popen(
        [str(py), "manage.py", "runserver", f"{HOST}:{BACKEND_PORT}", "--noreload"],
        cwd=str(backend_dir()),
        env=env,
        stdout=logf,
        stderr=subprocess.STDOUT,
        **_popen_kwargs(hide_console=True),
    )
    return proc


def start_frontend() -> subprocess.Popen:
    env = os.environ.copy()
    env["HOST"] = HOST
    env["PORT"] = str(FRONTEND_PORT)
    env.setdefault("NODE_ENV", "production")
    ad = app_dir()
    logf = log_path("frontend").open("ab")
    node = _which_node()
    proc = subprocess.Popen(
        [node, "server.js"],
        cwd=str(ad),
        env=env,
        stdout=logf,
        stderr=subprocess.STDOUT,
        **_popen_kwargs(hide_console=True),
    )
    return proc


def _which_node() -> str:
    import shutil

    n = shutil.which("node") or shutil.which("node.exe")
    if n:
        return n
    bundled = base_dir() / "node" / ("node.exe" if os.name == "nt" else "node")
    if bundled.exists():
        return str(bundled)
    raise RuntimeError(
        "找不到 node：请把 Node.js 20+ 加入 PATH，或将便携 node 放到 <软件根>/node/。"
    )


# ──────────────────────────────────────────────────────────────
def _log(msg: str) -> None:
    """把关键信息同时打到 stderr 和 runtime/launcher.log。

    冻结版（--windowed）没有控制台，崩溃若只 print 到 stderr 用户完全看不到——
    表现就是"双击→闪一下没了"。所以一切失败都要落这份日志文件，方便事后定位。
    """
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    try:
        print(line, file=sys.stderr)
    except Exception:
        pass
    try:
        with (runtime_dir() / "launcher.log").open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except Exception:
        pass


def _fatal(msg: str, exc_text: str | None = None) -> int:
    _log("启动失败：\n" + msg + (("\n--- 详细堆栈 ---\n" + exc_text) if exc_text else ""))
    # Windows 一律弹窗（冻结版没控制台，弹窗是用户唯一能看到的错误渠道）
    if os.name == "nt":
        try:
            import ctypes

            body = msg + f"\n\n详细日志：{runtime_dir() / 'launcher.log'}" if exc_text else msg
            ctypes.windll.user32.MessageBoxW(0, body, "Mini Plane 启动失败", 0x10)
        except Exception:
            pass
    return 1


def _probe_webview_gui() -> int:
    """真正的 GUI 自检：开一个空白窗口再自动关掉。

    只做 `import webview` 不足以验证冻结包可用——Windows 的窗口后端
    （EdgeChromium/WebView2 + pythonnet）是 create_window/start 时才**惰性加载**的，
    冻结包里缺 DLL/程序集正是在这一步炸。这里逼它真跑一遍，失败即回真实堆栈。
    """
    import threading

    try:
        import webview  # type: ignore
    except Exception as e:
        _log(f"[webview-FAIL] import 失败：{e!r}")
        return 2
    try:
        win = webview.create_window("Mini Plane 自检", "about:blank", width=320, height=200)

        def _close() -> None:
            time.sleep(2.5)
            try:
                win.destroy()
            except Exception:
                pass

        threading.Thread(target=_close, daemon=True).start()
        webview.start()
        _log("[webview-ok] GUI 后端可初始化、窗口创建/关闭正常")
        return 0
    except Exception as e:
        import traceback

        _log(f"[webview-FAIL] GUI 初始化失败：{e!r}\n{traceback.format_exc()}")
        return 2


def main() -> int:
    # 打包自检：验证冻结包能否真正创建窗口（含 GUI 后端惰性加载），随即退出。
    if os.environ.get("MINIPLANE_CHECK_WEBVIEW") == "1":
        return _probe_webview_gui()

    ad = app_dir()
    py = venv_python()

    if not py.exists():
        return _fatal(
            "后端虚拟环境不存在：\n"
            f"{py}\n\n"
            "请先安装 Python 依赖：\n"
            "  cd backend\n"
            "  python -m venv .venv\n"
            "  .venv\\Scripts\\python -m pip install -r requirements/local.txt"
        )
    if not (ad / "server.js").exists():
        return _fatal(
            "前端构建产物不存在：\n"
            f"{ad}\\server.js\n\n"
            "请先构建前端单机包：\n"
            "  python scripts\\package.py   （产物在 dist/，启动器会自动定位）"
        )

    procs: list[subprocess.Popen] = []
    try:
        runtime = runtime_dir()
        if not (runtime / "miniplane_migrated").exists():
            first_run_migrate()
            (runtime / "miniplane_migrated").write_text("ok", encoding="ascii")

        # 逐服务判断端口：半死时只补起缺的那一半，也兼容"复用已在跑的自己"
        if port_listening(BACKEND_PORT):
            print("backend already up, reuse")
        else:
            procs.append(start_backend())
        if port_listening(FRONTEND_PORT):
            print("frontend already up, reuse")
        else:
            procs.append(start_frontend())

        ok_b = wait_ready(BACKEND_PORT, "/api/v1/health/")
        ok_f = wait_ready(FRONTEND_PORT, "/login")
        if not (ok_b and ok_f):
            which = f"后端({BACKEND_PORT})" if not ok_b else f"前端({FRONTEND_PORT})"
            logs = f"{runtime / 'backend.log'} / {runtime / 'frontend.log'}"
            return _fatal(f"{which} 未能就绪，见日志：\n{logs}")

        url = f"http://{HOST}:{FRONTEND_PORT}/login"
        if os.environ.get("MINIPLANE_NO_WINDOW") == "1":
            # 自检模式：只验证栈能起、接口能应答，不开窗口（供 CI / 无桌面环境冒烟）
            print(f"[selftest] stack ready at {url} (window suppressed)")
            return 0
        print(f"ready, opening native window -> {url}")
        return open_window(url)

    except subprocess.CalledProcessError as e:
        return _fatal(f"迁移失败：{e}\n见 {log_path('backend-setup')}")
    except Exception as e:  # 兜底：窗口/子进程异常都要停服，且把堆栈落日志
        import traceback

        return _fatal(f"未预期错误：{e!r}", exc_text=traceback.format_exc())
    finally:
        for p in procs:
            kill_tree(p)
        print("services stopped")


def open_window(url: str) -> int:
    try:
        import webview  # type: ignore
    except Exception as e:
        import traceback

        return _fatal(
            "无法加载 pywebview。请安装：\n"
            "  .\\backend\\.venv\\Scripts\\python -m pip install pywebview\n\n"
            f"错误：{e!r}",
            exc_text=traceback.format_exc(),
        )
    try:
        # Sprint 15：窗口引用与 Island 可见状态统一由 WindowManager 持有，
        # 前端通过 window.pywebview.api（DesktopApi）操作，避免"谁负责隐藏"出现分歧。
        windows = WindowManager()
        api = DesktopApi(windows)

        # pywebview 6.x：create_window 登记的窗口由 start() 统一驱动；start() 不接 window 参数
        webview.create_window(
            APP_TITLE,
            url,
            width=1280,
            height=820,
            min_size=(900, 600),
            background_color="#F7FAFF",
            js_api=api,
        )

        # Island 独立窗口：置顶、无边框可拖、顶部居中、**隐藏启动**（Alt+I 唤出）
        if island_enabled():
            try:
                windows.register_island(create_island_window(webview, FRONTEND_PORT, api))
                _log("[island] 独立窗口已登记（隐藏启动，Alt+I 唤出）")
            except Exception as exc:
                # Island 开不出来是"降级"，不是"启动失败"：主窗口照常用
                _log(f"[island] 独立窗口创建失败，本次不带它启动：{exc!r}")

        # private_mode 默认 True → 不保留 cookie/localStorage，导致每次启动都要重新登录。
        # 关掉私有模式 + 指定持久 storage_path（runtime/ 下），sessionid cookie 跨启动保留，
        # 重开应用即直入已登录态。Windows 走 EdgeChromium(WebView2)，无则自行回退。
        profile_dir = runtime_dir() / "webview-profile"
        profile_dir.mkdir(parents=True, exist_ok=True)
        webview.start(debug=False, private_mode=False, storage_path=str(profile_dir))
        return 0
    except Exception as e:
        import traceback

        return _fatal(
            "打开本地窗口失败（WebView2 初始化异常）。\n"
            "请确认已安装「Microsoft Edge WebView2 运行时」（Win11 自带；Win10 可能需单独装）。\n\n"
            f"错误：{e!r}",
            exc_text=traceback.format_exc(),
        )


if __name__ == "__main__":
    sys.exit(main())
