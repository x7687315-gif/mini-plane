"""Island V3 开工前 Spike（2026-10-21，决策简报 §7 checklist 项 1/2）。

测三件事（对应 docs/research/2026-10-21-island-v3-preflight.md 的坑与待验证项）：

1. **尺寸偏差**（pywebview #1855，Win10 22H2 实测请求 1280×820 得 1264×781）：
   本机 Win11 + pywebview 6.2.1 是否仍有偏差？用 GetWindowRect 量真矩形，
   与 pywebview 自报的 window.width/height 三方对照。
2. **min_size 陷阱**（项目 10-13 真机踩过，island.py:144-148）：
   默认 min_size=(200,100) 时请求 360×44 的收起条高度会不会被夹断；
   显式 min_size=(360,44) 是否恢复正常。V3 收起态高度 <100，这是硬前提。
3. **fix_point 折叠动画**（V3 方向 A1 的核心）：
   360×44 → 520×420 分 15 步 × 16ms 渐进 resize（FixPoint.NORTH|WEST），
   测每步耗时/总时长/抖动，并验证左上角锚点稳定（x,y 不变，只有 w,h 变）。

不需要起后端/前端——窗口加载 inline HTML，纯桌面层验证。
结果同时打印与落盘 C:\\temp\\island_v3_spike.json。
"""

from __future__ import annotations

import ctypes
import json
import time
from ctypes import wintypes
from pathlib import Path

import webview
from webview.window import FixPoint

OUT = Path(r"C:\temp\island_v3_spike.json")
LOG = Path(r"C:\temp\island_v3_spike.log")

user32 = ctypes.windll.user32
COLLAPSED = (360, 44)  # V3 收起态目标（标题条）
EXPANDED = (520, 420)  # V3 展开态目标（与现 Island 面板同尺寸）
DEVIATION_PROBE = (1280, 820)  # 复刻 #1855 的实测请求值
STEPS = 15
STEP_MS = 16

results: dict = {"pywebview_resize_sig": None, "windows": {}}


def log(msg: str) -> None:
    """带时间戳写日志文件（stdout 经管道会被缓冲，挂起时全丢——落盘才能归因）。"""
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def hwnd_of(window) -> tuple[int | None, str]:
    """取 HWND（与 desktop/window_style.py 同款；pythonnet IntPtr 走 ToInt64）。"""
    try:
        native = getattr(window, "native", None)
        if native is None:
            return None, "native 为 None"
        handle = getattr(native, "Handle", None)
        if handle is None:
            return None, "Handle 为 None"
        try:
            return int(handle), ""
        except TypeError:
            return int(handle.ToInt64()), ""
    except Exception as exc:  # noqa: BLE001
        return None, f"{exc!r}"


def rect_of(hwnd: int) -> tuple[int, int, int, int] | None:
    rect = wintypes.RECT()
    if user32.GetWindowRect(ctypes.c_void_p(hwnd), ctypes.byref(rect)):
        return rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top
    return None


def dpi_of(hwnd: int) -> int:
    try:
        return int(user32.GetDpiForWindow(ctypes.c_void_p(hwnd)))
    except Exception:  # noqa: BLE001
        return 0


def measure(window, label: str) -> dict:
    """三方对照：pywebview 自报 vs Win32 真矩形。"""
    hwnd, diag = hwnd_of(window)
    entry = {"hwnd_ok": hwnd is not None}
    if hwnd is None:
        entry["hwnd_diag"] = diag
        return entry
    entry["dpi"] = dpi_of(hwnd)
    try:
        entry["pywebview_reports"] = [int(window.width), int(window.height)]
    except Exception as exc:  # noqa: BLE001
        entry["pywebview_reports"] = f"{exc!r}"
    rect = rect_of(hwnd)
    entry["win32_rect_xywh"] = list(rect) if rect else None
    if rect:
        wx, wy, ww, wh = rect
        try:
            px, py = int(window.x), int(window.y)
            entry["pywebview_pos"] = [px, py]
            entry["pos_delta"] = [px - wx, py - wy]
        except Exception as exc:  # noqa: BLE001
            entry["pywebview_pos"] = f"{exc!r}"
        if isinstance(entry["pywebview_reports"], list):
            rw, rh = entry["pywebview_reports"]
            entry["size_delta"] = [rw - ww, rh - wh]
    entry["label"] = label
    return entry


def animate(window, frm: tuple[int, int], to: tuple[int, int]) -> dict:
    """15 步 × 16ms 渐进 resize（ease-out cubic），返回时序统计。"""
    x0, y0 = int(window.x), int(window.y)
    steps = []
    t_start = time.monotonic()
    for i in range(1, STEPS + 1):
        t = i / STEPS
        ease = 1 - (1 - t) ** 3  # ease-out cubic：快起慢收，像图纸展开
        w = round(frm[0] + (to[0] - frm[0]) * ease)
        h = round(frm[1] + (to[1] - frm[1]) * ease)
        t0 = time.monotonic()
        window.resize(w, h, fix_point=FixPoint.NORTH | FixPoint.WEST)
        t1 = time.monotonic()
        steps.append({"step": i, "wh": [w, h], "ms": round((t1 - t0) * 1000, 2)})
        remaining = STEP_MS / 1000 - (t1 - t0)
        if remaining > 0:
            time.sleep(remaining)
    total = (time.monotonic() - t_start) * 1000
    after = measure(window, "after_animate")
    per_step = [s["ms"] for s in steps]
    return {
        "anchor_start_xy": [x0, y0],
        "anchor_after_xy": [int(window.x), int(window.y)],
        "total_ms": round(total, 1),
        "per_step_ms": per_step,
        "per_step_max": max(per_step),
        "per_step_avg": round(sum(per_step) / len(per_step), 2),
        "readback": after,
    }


def run_a(win_a) -> None:
    """窗口 A：默认 min_size（不显式给），验证收起态被夹断的坑。

    ⚠️ 不在这里 destroy()：实测 pywebview 6.2.1 WinForms 下从工作线程 destroy
    会挂死（主线程在 create_window、worker 在 destroy_window 互等，2026-10-21 实测）。
    两个窗口都留到最后，由 main() 统一 os._exit——与项目关机路径同款模式。
    """
    log("A: 等 1.5s 渲染")
    time.sleep(1.5)
    log("A: 请求 resize 360×44（默认 min_size=(200,100)）")
    win_a.resize(*COLLAPSED, fix_point=FixPoint.NORTH | FixPoint.WEST)
    time.sleep(0.4)
    results["windows"]["A_default_minsize"] = measure(win_a, "requested_360x44_default_min")
    log(f"A: 测量完 {results['windows']['A_default_minsize']}")


def run_b(win_b) -> None:
    """窗口 B：显式 min_size，跑偏差测量 + 完整折叠动画。"""
    log("B: 等 1.5s 渲染")
    time.sleep(1.5)

    # ── 测 1：尺寸偏差（复刻 #1855 请求值）────────────────────
    log(f"B: 请求 resize {DEVIATION_PROBE}（复刻 #1855）")
    win_b.resize(*DEVIATION_PROBE)
    time.sleep(0.4)
    results["windows"]["B_deviation"] = measure(win_b, "requested_1280x820")
    log(f"B: 偏差测量完 {results['windows']['B_deviation']}")

    # ── 回到收起态，测 2 的对照组（显式 min_size 应不被夹断）──
    log("B: 回到收起态 360×44")
    win_b.resize(*COLLAPSED, fix_point=FixPoint.NORTH | FixPoint.WEST)
    time.sleep(0.4)
    results["windows"]["B_collapsed"] = measure(win_b, "collapsed_360x44")
    log(f"B: 收起态测量完 {results['windows']['B_collapsed']}")

    # ── 测 3：折叠动画 ──────────────────────────────────────
    log("B: 开始展开动画（15 步 × 16ms）")
    results["windows"]["B_animate"] = animate(win_b, COLLAPSED, EXPANDED)
    log(f"B: 展开动画完 total={results['windows']['B_animate']['total_ms']}ms")

    # ── 附测：反向收起一遍（展开 → 收起）────────────────────
    log("B: 开始收起动画（反向）")
    results["windows"]["B_animate_reverse"] = animate(win_b, EXPANDED, COLLAPSED)
    log(f"B: 收起动画完 total={results['windows']['B_animate_reverse']['total_ms']}ms")


def make_window(title: str, bg: str, x: int, min_size: tuple[int, int] | None) -> object:
    kwargs = {} if min_size is None else {"min_size": min_size}
    return webview.create_window(
        title,
        html=f"<body style='margin:0;background:{bg};font-family:sans-serif'>"
        f"<div style='padding:6px'>{title}</div></body>",
        width=COLLAPSED[0],
        height=COLLAPSED[1],
        x=x,
        y=200,
        resizable=True,
        frameless=True,
        on_top=True,
        text_select=False,
        background_color=bg,
        **kwargs,
    )


def run_all(win_a, win_b) -> None:
    """一次 GUI 循环里依次测两个窗口（pywebview 的 start 只能调一次）。

    不 destroy：工作线程 destroy 在 pywebview 6.2.1 WinForms 下挂死（实测）。
    测完由 main() 直接 os._exit(0)——与 desktop/launcher.py 关机路径同款模式。
    """
    import traceback

    log("run_all 线程启动")
    try:
        log("=== Spike A：默认 min_size 陷阱 ===")
        run_a(win_a)
        log("=== Spike B：尺寸偏差 + fix_point 折叠动画 ===")
        run_b(win_b)
        log("两个窗口的测量全部完成")
    except Exception:
        import traceback

        traceback.print_exc()
        results["error"] = traceback.format_exc()
    finally:
        # start() 要等所有窗口关闭才返回，而我们不能 destroy（工作线程 destroy 挂死）。
        # 所以在这里落盘 + 强退——与 launcher 关机路径同款 os._exit 模式。
        import os

        print(json.dumps(results, ensure_ascii=False, indent=2))
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        log(f"结果已落盘：{OUT}")
        os._exit(0)


def main() -> int:
    import faulthandler
    import inspect

    from webview.window import Window

    # 90 秒没跑完就打印所有线程栈并退出——挂起归因用（本 Spike 专用，产品代码无此物）
    faulthandler.dump_traceback_later(90, exit=True)

    LOG.write_text("", encoding="utf-8")  # 清空旧日志
    results["pywebview_resize_sig"] = str(inspect.signature(Window.resize))
    results["version_note"] = "pywebview 6.2.1（backend/.venv pip show）"

    # pywebview 要求所有窗口先登记、再统一启动（start 前创建，GUI 循环起来即显示）
    log("创建窗口 A（默认 min_size）与 B（显式 min_size）")
    win_a = make_window("V3 Spike A", "#EBE7DD", x=160, min_size=None)  # 默认 min_size
    win_b = make_window("V3 Spike B", "#F4F1EA", x=620, min_size=COLLAPSED)  # 显式 min_size
    log("窗口已登记，调 webview.start()")

    webview.start(run_all, (win_a, win_b))
    # 正常不会走到这里：run_all 末尾 os._exit(0) 先退出（start 要等窗口全关才返回）
    log("webview.start() 已返回（异常路径）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
