"""桌面端：主窗口一关，整个应用立刻退出（用户 2026-10-03 明确要求）。

## 为什么不能只靠 pywebview 的 events.closed

实测（desktop/verify_quit.py）：主窗口属于 **exe 派生的子进程**（GUI 进程），
而 `create_window()` 返回的 Window 对象在父进程。给 `events.closed` 挂的回调
**在子进程里不会触发** —— 真机验证里 WM_CLOSE 送达了主窗口，进程与端口都纹丝不动。

## 现在用的机制：监视窗口标题

窗口标题是我们自己的常量（`APP_TITLE` / `ISLAND_TITLE`），用 Win32 `EnumWindows`
按标题找可见窗口，跨进程有效。标题消失 = 用户关掉了主窗口 → 销毁 Island 窗口 →
pywebview 的最后一个窗口没了 → `start()` 返回 → launcher 的 `finally` 停掉后端与前端。

`events.closed` 仍保留作为快路径（万一某个平台/版本它真的触发了，能更快退出）。
"""

from __future__ import annotations

import ctypes
import logging
import threading
import time
from collections.abc import Callable
from ctypes import wintypes
from typing import Any

log = logging.getLogger("miniplane.windows")

_user32 = ctypes.windll.user32
_EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)


def visible_window_exists(title: str) -> bool:
    """系统里是否还有一个**可见**且标题完全一致的窗口（跨进程有效）。"""
    hit = False

    def _cb(hwnd, _lparam):
        nonlocal hit
        if _user32.IsWindowVisible(hwnd):
            n = _user32.GetWindowTextLengthW(hwnd)
            if n:
                buf = ctypes.create_unicode_buffer(n + 1)
                _user32.GetWindowTextW(hwnd, buf, n + 1)
                if buf.value == title:
                    hit = True
                    return False  # 找到就停
        return True

    _user32.EnumWindows(_EnumWindowsProc(_cb), 0)
    return hit


def watch_main_window_gone(
    main_title: str,
    island_window: Any | None,
    *,
    interval: float = 1.0,
    on_quit: Callable[[], None] | None = None,
    notify: Callable[[str], None] | None = None,
) -> threading.Thread:
    """后台监视：主窗口消失 → 销毁 Island 窗口 → 通知退出。

    返回线程对象（daemon，进程退出时自动收尾，不会阻止退出）。
    """

    def _say(msg: str) -> None:
        # 冻结版没有控制台，logging 的输出没人看得到 —— 必须接到 launcher._log，
        # 否则这条链路在出问题时是"哑"的，只能靠猜。
        if notify is not None:
            notify(msg)
        log.info(msg)

    def _run() -> None:
        # **先等窗口出现，再监视它消失**。
        # 之前"固定睡 3 秒再看一眼"是个竞态：GUI 子进程建窗口偶尔比 3 秒慢，
        # 监视就会误判"窗口创建失败"而**整个放弃** —— 退出路径随之失效
        # （2026-10-05 真机抓到：日志出现"启动后未发现主窗口"，之后关窗无人响应）。
        appeared = False
        for _ in range(60):  # 最多等 60 秒
            time.sleep(1.0)
            if visible_window_exists(main_title):
                appeared = True
                break
        if not appeared:
            _say("[watch] 60 秒内未发现主窗口（窗口可能创建失败），本次不启用监视")
            return
        _say("[watch] 已启用主窗口监视：主窗口消失即退出整个应用")
        while visible_window_exists(main_title):
            time.sleep(interval)
        _say("[watch] 主窗口已关闭 → 退出整个应用")
        # **顺序至关重要**（pywebview 官方结论 + 本机实测）：
        #   - window.destroy() 在窗口相关上下文里会阻塞（GUI 线程重入死锁，见 PR #1844），
        #     放在 on_quit **之前**会让后面的退出动作永远没机会执行 ——
        #     本机日志里能反复看到"主窗口已关闭"却没有任何后续动作，就是它堵住了。
        #   - 程序化 destroy() 也不会触发 closed 事件（官方确认），所以不能指望它来收尾。
        #   因此：先停服退出，进程一结束窗口自然关闭；destroy() 只在没有 on_quit 时兜底。
        if on_quit is not None:
            try:
                on_quit()
            except Exception as exc:
                _say(f"[watch] 退出回调异常：{exc!r}")
        elif island_window is not None:
            try:
                island_window.destroy()
            except Exception as exc:
                _say(f"[watch] Island 窗口销毁跳过：{exc!r}")

    th = threading.Thread(target=_run, name="mp-window-watch", daemon=True)
    th.start()
    return th
