"""多窗口生命周期管理（Sprint 15 · Desktop Island）。

主窗口之外多一个 Island 窗口后，"谁负责显示/隐藏它"必须**只有一个**答案，
否则会出现"点了没反应""隐藏了又自己冒出来"这类鬼故事。所以这里把
Island 窗口的引用与可见状态收在一处，两个入口（前端 JS API、Alt+I）都走它。

## pywebview 的线程约束（很重要）

GUI 事件循环跑在**主线程**上，而 `webview.start()` 会阻塞在那里。
窗口的 `show()/hide()/resize()` 属于 GUI 操作，**不能从主线程调用**，
否则要么没反应要么直接崩。本模块的所有窗口操作都保证从"非 GUI 线程"进入：
- 前端通过 `window.pywebview.api.*` 调进来 —— pywebview 把它放在工作线程执行，天然合规；
- Alt+I 由前端转发到同一个 api —— 走的还是工作线程。

这也是为什么**没有**再加一个"键盘监听线程"：多一条通路就多一种竞态。
"""

from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger("miniplane.windows")


class DesktopApi:
    """暴露给前端的 `window.pywebview.api`（主窗口与 Island 窗口共用同一个实例）。

    方法名用下划线（`toggle_island`）而不是驼峰：pywebview 会把 Python 属性
    原样挂到 JS 上，前端 `lib/desktopBridge.ts` 与之对应。
    """

    def __init__(self, manager: WindowManager) -> None:
        self._manager = manager

    def toggle_island(self) -> dict:
        return self._manager.toggle_island()

    def show_island(self) -> dict:
        return self._manager.show_island()

    def hide_island(self) -> dict:
        return self._manager.hide_island()

    def island_state(self) -> dict:
        return self._manager.island_state()

    # pywebview 会把返回的 dict 序列化给 JS；出错时也让前端拿到原因而不是 undefined
    def _result(self, ok: bool, message: str, **extra: Any) -> dict:
        if not ok:
            log.warning("窗口操作失败：%s", message)
        return {"ok": ok, "message": message, **extra}


class WindowManager:
    """持有窗口引用与 Island 可见状态。"""

    def __init__(self) -> None:
        self._island: Any | None = None
        self._island_visible = False

    # ── 登记 ────────────────────────────────────────────────
    def register_island(self, window: Any) -> None:
        self._island = window
        self._island_visible = False
        # 关掉 Island 窗口 ≠ 退出应用：这里只标记为隐藏，不碰主窗口
        try:
            window.events.closed += self._on_island_closed
        except Exception:  # 老版本没有 events，不影响主流程
            pass

    def _on_island_closed(self, *_args: Any) -> None:
        self._island_visible = False

    # ── 状态 ────────────────────────────────────────────────
    def island_state(self) -> dict:
        return {
            "registered": self._island is not None,
            "visible": self._island_visible,
        }

    # ── 操作 ────────────────────────────────────────────────
    def show_island(self) -> dict:
        if self._island is None:
            return {"ok": False, "message": "Island 窗口未启用"}
        try:
            self._island.show()
            self._island_visible = True
            return {"ok": True, "message": "Island 已显示", "visible": True}
        except Exception as exc:  # GUI 线程状态异常时不能把前端带崩
            return {"ok": False, "message": f"显示失败：{exc}", "visible": self._island_visible}

    def hide_island(self) -> dict:
        if self._island is None:
            return {"ok": False, "message": "Island 窗口未启用"}
        try:
            self._island.hide()
            self._island_visible = False
            return {"ok": True, "message": "Island 已隐藏", "visible": False}
        except Exception as exc:
            return {"ok": False, "message": f"隐藏失败：{exc}", "visible": self._island_visible}

    def toggle_island(self) -> dict:
        return self.hide_island() if self._island_visible else self.show_island()
