"""多窗口生命周期与 Island 状态机（Island V2 阶段 2 · 规格 §1.1–§1.3）。

主窗口之外还有两个 Island 窗口（触发把手 + 完整面板），"谁负责显示/隐藏它"必须
**只有一个**答案，否则会出现"点了没反应""隐藏了又自己冒出来"这类鬼故事。
所以这里把窗口引用与两个正交状态收在一处，所有入口（前端 JS API、Alt+I、Esc）都走它。

## 两个正交状态（规格 §2.3）

    displayMode: auto_hide | pinned     （用户偏好，重启保留，存 desktop-config.json）
    visibility:  hidden   | expanded    （当前是否展开）

| displayMode | visibility | 用户看到什么 |
|---|---|---|
| auto_hide | hidden | 只有顶部触发把手 |
| auto_hide | expanded | 完整面板，可收起 |
| pinned | expanded | 完整面板常驻置顶 |

## pywebview 的线程约束（很重要）

GUI 事件循环跑在**主线程**上，而 `webview.start()` 会阻塞在那里。
窗口的 `show()/hide()/resize()` 属于 GUI 操作，**不能从主线程调用**，
否则要么没反应要么直接崩。本模块的所有窗口操作都保证从"非 GUI 线程"进入：
- 前端通过 `window.pywebview.api.*` 调进来 —— pywebview 把它放在工作线程执行，天然合规；
- Alt+I / Esc 由前端转发到同一个 api —— 走的还是工作线程。
"""

from __future__ import annotations

import logging
import threading
from typing import Any

import config as desktop_config
from config import next_visibility

log = logging.getLogger("miniplane.windows")

#: 观测钩子：由 launcher 注入 `_log`（冻结版没有控制台，logging 的输出没人看得到）。
#: 每个窗口 API 调用都记一行 —— "点击没反应"这类问题必须先能看见调用有没有到。
_notify: Any = None


def set_notify(fn: Any) -> None:
    global _notify
    _notify = fn


def _say(message: str) -> None:
    if _notify is not None:
        try:
            _notify(message)
        except Exception:
            pass
    log.info(message)


class DesktopApi:
    """暴露给前端的 `window.pywebview.api`（三个窗口共用同一个实例）。

    方法名用下划线（`toggle_island`）而不是驼峰：pywebview 会把 Python 属性
    原样挂到 JS 上，前端 `lib/desktopBridge.ts` 与之对应。
    """

    def __init__(self, manager: WindowManager) -> None:
        self._manager = manager

    def toggle_island(self) -> dict:
        _say("[api] toggle_island")
        return self._manager.toggle_island()

    def show_island(self) -> dict:
        _say("[api] show_island")
        return self._manager.show_island()

    def hide_island(self) -> dict:
        _say("[api] hide_island")
        return self._manager.hide_island()

    def pin_island(self) -> dict:
        _say("[api] pin_island")
        return self._manager.pin_island()

    def unpin_island(self) -> dict:
        _say("[api] unpin_island")
        return self._manager.unpin_island()

    def island_state(self) -> dict:
        return self._manager.island_state()

    def move_window_by(self, target: str, dx: float, dy: float) -> dict:
        return self._manager.move_window_by(target, int(dx), int(dy))

    def resize_window_by(self, target: str, edge: str, dx: float, dy: float) -> dict:
        return self._manager.resize_window_by(target, edge, int(dx), int(dy))

    def end_window_drag(self, target: str) -> dict:
        return self._manager.end_window_drag(target)


class WindowManager:
    """持有三个窗口的引用与 Island 的两个正交状态。"""

    def __init__(self) -> None:
        self._island: Any | None = None
        self._trigger: Any | None = None
        self._main: Any | None = None
        # 启动时由 restore_preferences() 用 desktop-config.json 的值初始化
        self._display_mode: str = desktop_config.DEFAULT_DISPLAY_MODE
        self._visibility: str = "hidden"
        self._cfg: dict[str, Any] = desktop_config.default_config()

    # ── 登记 ────────────────────────────────────────────────
    def register_island(self, window: Any) -> None:
        self._island = window
        try:
            window.events.moved += self._on_window_moved
        except Exception:
            pass
        try:
            window.events.closed += self._on_island_closed
        except Exception:  # 老版本没有 events，不影响主流程
            pass

    def register_trigger(self, window: Any) -> None:
        self._trigger = window
        try:
            window.events.moved += self._on_window_moved
        except Exception:
            pass

    def _on_island_closed(self, *_args: Any) -> None:
        # 面板被关掉（无边框窗口也有 Alt+F4）≠ 退出应用：退回隐藏式，把手还在
        self._visibility = "hidden"
        log.info("Island 面板已关闭 → 退回隐藏式（触发把手仍在）")

    # ── 启动时恢复偏好 ──────────────────────────────────────
    def restore_preferences(self, cfg: dict[str, Any] | None = None) -> dict:
        """按 desktop-config.json 恢复 displayMode / visibility，返回最终状态。"""
        self._cfg = cfg or desktop_config.load_desktop_config()
        mode = self._cfg.get("displayMode")
        self._display_mode = mode if mode in desktop_config.DISPLAY_MODES else "auto_hide"
        self._onboarded = bool(self._cfg.get("onboarded"))
        # M1 默认首展：用户从未表达过偏好（没收起/固定过）→ 启动即展开完整面板，
        # 第一眼看到"记忆中的悬浮窗"；表达过之后按记住的偏好走（pinned 恒展开）
        if self._display_mode == "pinned" or not self._onboarded:
            self._visibility = "expanded"
        else:
            self._visibility = "hidden"
        desktop_config.save_desktop_config(self._cfg)  # 启动即落盘：自愈缺失/损坏，也便于用户查看
        log.info(
            "Island 偏好已恢复：displayMode=%s visibility=%s", self._display_mode, self._visibility
        )
        return self.island_state()

    # ── 状态 ────────────────────────────────────────────────
    def island_state(self) -> dict:
        return {
            "registered": self._island is not None,
            "trigger": self._trigger is not None,
            "displayMode": self._display_mode,
            "visibility": self._visibility,
            "pinned": self._display_mode == "pinned",
            "visible": self._visibility == "expanded",
        }

    def _mark_onboarded(self) -> None:
        """用户表达过一次偏好（收起/固定）→ 此后启动按记住的偏好走（M1）。"""
        if not self._onboarded:
            self._onboarded = True
            self._cfg = {**self._cfg, "onboarded": True}
            desktop_config.save_desktop_config(self._cfg)
            _say("[island] 用户已表达窗口偏好，此后按记住的模式启动")

    # ── 位置持久化 ──────────────────────────────────────────
    def _on_window_moved(self, *_args: Any) -> None:
        """窗口被拖动 → 记住新位置（规格 §1.3：首版同时记忆窗口位置）。"""
        cfg = dict(self._cfg)
        if self._trigger is not None:
            try:
                cfg["triggerX"] = int(self._trigger.x)
            except Exception:
                pass
        if self._island is not None:
            try:
                cfg["panelX"] = int(self._island.x)
                cfg["panelY"] = int(self._island.y)
            except Exception:
                pass
        self._cfg = cfg
        desktop_config.save_desktop_config(cfg)

    # ── 操作 ────────────────────────────────────────────────
    def show_island(self) -> dict:
        if self._island is None:
            return self._fail("Island 窗口未启用")
        try:
            self._island.show()
            self._visibility = "expanded"
            _say("[island] 面板已展开")
            return self._ok("Island 已展开", visible=True)
        except Exception as exc:  # GUI 线程状态异常时不能把前端带崩
            return self._fail(f"展开失败：{exc}")

    def hide_island(self) -> dict:
        if self._island is None:
            return self._fail("Island 窗口未启用")
        # 固定模式下拒绝收起（规格 §2.3：pinned + expanded 要常驻）。
        # Esc / 把手点击都走这条路，护栏放在这里而不是各入口各判一遍。
        if self._display_mode == "pinned":
            return self._ok("已固定，不会收起", pinned=True, visible=True)
        try:
            self._island.hide()
            self._visibility = "hidden"
            self._mark_onboarded()
            _say("[island] 面板已收起")
            return self._ok("Island 已收起", visible=False)
        except Exception as exc:
            return self._fail(f"收起失败：{exc}")

    def toggle_island(self) -> dict:
        """点把手 / Alt+I：按状态机推进 visibility（pinned 时永远展开）。"""
        target = next_visibility(self._display_mode, self._visibility)
        return self.show_island() if target == "expanded" else self.hide_island()

    def pin_island(self) -> dict:
        """图钉固定：displayMode → pinned 并展开；偏好落盘。"""
        self._display_mode = "pinned"
        self._visibility = "expanded"
        self._mark_onboarded()
        self._cfg = {**self._cfg, "displayMode": "pinned", "onboarded": True}
        desktop_config.save_desktop_config(self._cfg)
        log.info("Island 已固定（displayMode=pinned，重启后仍固定）")
        return self._ok("已固定，面板常驻", pinned=True, visible=True)

    def unpin_island(self) -> dict:
        """取消固定：displayMode → auto_hide。

        **不自动收起**（规格 §2.3）：否则用户会以为图钉按钮失灵 ——
        "点了没变化"比"面板还在"更糟。收起交给用户自己点把手 / Esc。
        """
        self._display_mode = "auto_hide"
        self._cfg = {**self._cfg, "displayMode": "auto_hide", "onboarded": True}
        desktop_config.save_desktop_config(self._cfg)
        log.info("Island 已取消固定（displayMode=auto_hide，面板仍展开）")
        return self._ok("已取消固定", pinned=False, visible=self._visibility == "expanded")

    # ── 结果构造 ────────────────────────────────────────────
    def _ok(self, message: str, **extra: Any) -> dict:
        return {"ok": True, "message": message, **self.island_state(), **extra}

    def _fail(self, message: str) -> dict:
        log.warning("窗口操作失败：%s", message)
        return {"ok": False, "message": message, **self.island_state()}

    # ── 窗口拖动 / 缩放（M3，2026-10-14）──────────────────────
    # 路线说明：easy_drag 在 Windows 后端没实现，Win32 的 HTCAPTION 又会和
    # WebView2 的鼠标捕获互相干扰（按下时捕获在子窗口上，模态循环收不到 mousemove）。
    # 所以采用 JS pointer capture + 节流桥接：前端在 pointermove 里发**位移增量**，
    # Python 侧基于窗口当前位置自算绝对坐标（丢事件自愈），节流约 30fps。

    _PANEL_MIN = (360, 96)

    def _win(self, target: str) -> Any | None:
        return self._island if target == "panel" else self._trigger

    def move_window_by(self, target: str, dx: int, dy: int) -> dict:
        win = self._win(target)
        if win is None:
            return self._fail(f"窗口 {target} 未启用")
        try:
            win.move(int(win.x) + dx, int(win.y) + dy)
            return self._ok("已移动")
        except Exception as exc:
            return self._fail(f"移动失败：{exc}")

    def resize_window_by(self, target: str, edge: str, dx: int, dy: int) -> dict:
        win = self._win(target)
        if win is None:
            return self._fail(f"窗口 {target} 未启用")
        try:
            x, y = int(win.x), int(win.y)
            w, h = int(win.width), int(win.height)
            if "right" in edge:
                w += dx
            if "bottom" in edge:
                h += dy
            if "left" in edge:
                x += dx
                w -= dx
            if "top" in edge:
                y += dy
                h -= dy
            w = max(self._PANEL_MIN[0], w)
            h = max(self._PANEL_MIN[1], h)
            win.move(x, y)
            win.resize(w, h)
            return self._ok("已缩放")
        except Exception as exc:
            return self._fail(f"缩放失败：{exc}")

    def end_window_drag(self, target: str) -> dict:
        """拖动/缩放结束 → 立即持久化（拖动过程中的高频 move 不逐次写盘）。"""
        self._on_window_moved()
        return self._ok("位置已保存")

    # ── 生命周期：主窗口关闭即退出整个应用 ──────────────────────
    def bind_main_window(
        self, main_window: Any, island_window: Any | None, trigger_window: Any | None
    ) -> None:
        """主窗口关闭 → 连带销毁 Island 与把手，让 `webview.start()` 返回。

        **为什么必须显式做**（2026-10-03 用户被这个坑到第二次）：
        pywebview 的 `start()` 只有在**所有**窗口都关闭后才返回，而启动器的
        `finally: kill_tree(...)`（停后端/前端）挂在它返回之后。
        只关主窗口的话，另外两个窗口（哪怕是隐藏的）仍存在 → start() 不返回 →
        后端与前端**继续占着 8000/3000**，界面上看着"关掉了"，后台其实还在跑。

        用户的要求很明确：**关掉界面，后台进程直接全退。** 这就是这条绑定的意义。
        """

        def _on_main_closed(*_args: Any) -> None:
            log.info("主窗口已关闭 → 退出整个应用（销毁 Island 与把手，停服务）")
            self._main = None
            for win in (island_window, trigger_window):
                if win is None:
                    continue

                # 窗口操作不能在 GUI 线程里同步做（会重入 GUI 循环），放工作线程
                def _destroy(w: Any = win) -> None:
                    try:
                        w.destroy()
                    except Exception as exc:  # 已经被关掉等情况
                        log.debug("窗口销毁跳过：%r", exc)

                threading.Thread(target=_destroy, daemon=True).start()

        try:
            main_window.events.closed += _on_main_closed
        except Exception as exc:  # 老版本没有 events
            log.warning("无法绑定主窗口关闭事件：%r", exc)
