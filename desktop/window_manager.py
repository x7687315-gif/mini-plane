"""多窗口生命周期与 Island 状态机（Island V3 · 单窗两态，2026-10-21）。

主窗口之外只有一个 Island 窗口（V3 起触发把手退役，见 `island.py`）。
"谁负责它的形态/位置"必须**只有一个**答案，否则会出现"点了没反应"
"收起了自己又冒出来"这类鬼故事。所以这里把窗口引用与两个状态收在一处，
所有入口（前端 JS API、Alt+I、Esc）都走它。

## 两个状态（规格 §2）

    displayMode: auto_hide | pinned    （用户偏好，重启保留，存 desktop-config.json）
    form:        collapsed  | expanded （当前形态：把手条 / 完整面板）

| displayMode | form | 用户看到什么 |
|---|---|---|
| auto_hide | collapsed | 顶部把手条，点击 / Alt+I 展开 |
| auto_hide | expanded | 完整面板，Esc / Alt+I / 点把手条收起 |
| pinned | expanded | 完整面板常驻（toggle / Esc 不收起） |

## pywebview 的线程约束（很重要，两条都有真机教训）

1. GUI 事件循环跑在**主线程**上，`webview.start()` 阻塞在那里。
   窗口的 `show()/hide()/resize()/move()` 属于 GUI 操作，**不能从主线程调用**。
   本模块的所有窗口操作都保证从"非 GUI 线程"进入：
   - 前端通过 `window.pywebview.api.*` 调进来 —— pywebview 把它放在工作线程执行，天然合规；
   - Alt+I / Esc 由前端转发到同一个 api —— 走的还是工作线程；
   - 折叠动画跑在专用 daemon 线程上（不占住 api 的工作线程，连续切换不排队）。
2. **运行期禁止 `destroy()`**（Spike 新坑 8，2026-10-21 实测）：工作线程调
   `destroy()` 会与 GUI 线程互等挂死（主线程卡 `create_window`、worker 卡
   `destroy_window`，faulthandler 栈坐实）。关机走 launcher 的
   `stop_services(procs, hard_exit=True)`（taskkill 整棵树 + `os._exit(0)`），
   本模块不做任何 destroy。
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any

import island

import config as desktop_config

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
    """暴露给前端的 `window.pywebview.api`（Island 单窗共用这一个实例）。

    方法名用下划线（`toggle_island`）而不是驼峰：pywebview 会把 Python 属性
    原样挂到 JS 上，前端 `lib/desktopBridge.ts` 与之对应。
    所有方法都返回最终状态 dict（前端用它做乐观切换后的对账）。
    """

    def __init__(self, manager: WindowManager) -> None:
        self._manager = manager

    def toggle_island(self) -> dict:
        _say("[api] toggle_island")
        return self._manager.toggle_island()

    def expand_island(self) -> dict:
        _say("[api] expand_island")
        return self._manager.expand_island()

    def collapse_island(self) -> dict:
        _say("[api] collapse_island")
        return self._manager.collapse_island()

    def pin_island(self) -> dict:
        _say("[api] pin_island")
        return self._manager.pin_island()

    def unpin_island(self) -> dict:
        _say("[api] unpin_island")
        return self._manager.unpin_island()

    def island_state(self) -> dict:
        return self._manager.island_state()

    def move_window_by(self, dx: float, dy: float) -> dict:
        return self._manager.move_window_by(int(dx), int(dy))

    def resize_window_by(self, edge: str, dx: float, dy: float) -> dict:
        return self._manager.resize_window_by(edge, int(dx), int(dy))

    def end_window_drag(self) -> dict:
        return self._manager.end_window_drag()


class WindowManager:
    """持有 Island 单窗的引用与 displayMode × form 两个状态。"""

    def __init__(self) -> None:
        self._island: Any | None = None
        self._main: Any | None = None
        # 启动时由 restore_preferences() 用 desktop-config.json 的值初始化
        self._display_mode: str = desktop_config.DEFAULT_DISPLAY_MODE
        self._form: str = desktop_config.DEFAULT_FORM
        self._cfg: dict[str, Any] = desktop_config.default_config()
        self._rounded_mode: str = "none"  # 阶段 7：dwm / region / none（window_style.apply 写入）
        # 用户把 Island 窗口关掉了（Alt+F4）：pywebview 不允许 start() 之后再建窗，
        # 所以本次会话 Island 就此退场（主窗口不受影响），API 调用如实报"已关闭"。
        self._gone: bool = False
        # 动画代际：连续切换时只有最新一代的目标会被执行完（旧代逐帧自检作废）
        self._anim_gen: int = 0
        # 动画进行中：此刻不持久化"位置/尺寸"——那都是动画的中间态，不是用户意图。
        # **同步置位**（不等线程跑起来）：形态状态已切换、动画线程还没开跑的窗口期里，
        # 一个 moved 事件会把旧形态的尺寸当成"展开态尺寸"记下去（360×44 污染面板记忆）。
        self._animating: bool = False
        # 拖动落盘节流（monotonic 秒）：moved 事件每帧都触发，逐次原子写盘太吵；
        # end_window_drag 会强制补最后一次。
        self._last_persist: float = 0.0

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

    def _on_island_closed(self, *_args: Any) -> None:
        # Island 窗口被关掉 ≠ 退出应用（主窗口还在，工程管理照常）。
        # 但 pywebview 无法在 start() 之后重建窗口 → 本次会话 Island 退场。
        self._gone = True
        log.info("Island 窗口已关闭 → 本次会话不再显示（重启应用恢复）")

    # ── 启动时恢复偏好 ──────────────────────────────────────
    def restore_preferences(self, cfg: dict[str, Any] | None = None) -> dict:
        """按 desktop-config.json 恢复 displayMode / form，返回最终状态。

        form 的恢复规则（M1 默认首展的 V3 版）：
        - pinned 恒展开（固定模式没有"收起"这个状态）；
        - 记过 form → 按记住的来；
        - 没记过（首启）→ expanded，第一眼就看到完整面板。
        """
        self._cfg = cfg or desktop_config.load_desktop_config()
        mode = self._cfg.get("displayMode")
        self._display_mode = mode if mode in desktop_config.DISPLAY_MODES else "auto_hide"
        remembered = self._cfg.get("form")
        if self._display_mode == "pinned":
            # pinned 恒展开：顺手把配置里的 form 归一成 expanded（手改过的配置也要收敛）
            self._form = "expanded"
            self._cfg = {**self._cfg, "form": "expanded"}
        elif remembered in desktop_config.FORMS:
            self._form = remembered
        else:
            self._form = desktop_config.DEFAULT_FORM  # 首启：M1 默认首展
        desktop_config.save_desktop_config(self._cfg)  # 启动即落盘：自愈缺失/损坏，也便于用户查看
        log.info("Island 偏好已恢复：displayMode=%s form=%s", self._display_mode, self._form)
        return self.island_state()

    # ── 状态 ────────────────────────────────────────────────
    def island_state(self) -> dict:
        return {
            "registered": self._island is not None and not self._gone,
            "displayMode": self._display_mode,
            "form": self._form,
            "pinned": self._display_mode == "pinned",
            "expanded": self._form == "expanded",
        }

    # ── 位置 / 尺寸持久化 ───────────────────────────────────
    def _on_window_moved(self, *_args: Any) -> None:
        """窗口被拖动 → 记住新位置（规格 §4：panelX / panelY）。

        动画中间态不落盘：那既不是用户拖的位置，也不是用户缩的尺寸。
        展开态的宽高此时一并记忆（用户手动缩放过 → 下次展开回到这个尺寸）。
        """
        self._persist_geometry(force=False)

    def _persist_geometry(self, *, force: bool) -> None:
        if self._animating or self._gone or self._island is None:
            return
        now = time.monotonic()
        if not force and now - self._last_persist < 0.25:
            return  # 拖动中的高频 moved：节流，最后一次由 end_window_drag 强制补
        cfg = dict(self._cfg)
        try:
            cfg["panelX"] = int(self._island.x)
            cfg["panelY"] = int(self._island.y)
            if self._form == "expanded":
                cfg["panelWidth"] = int(self._island.width)
                cfg["panelHeight"] = int(self._island.height)
        except Exception:
            return
        self._cfg = cfg
        self._last_persist = now
        desktop_config.save_desktop_config(cfg)

    # ── 形态切换（V3 的核心）────────────────────────────────
    def toggle_island(self) -> dict:
        """点把手条 / Alt+I：按状态机推进 form（pinned 时永远展开）。"""
        target = desktop_config.next_form(self._display_mode, self._form)
        return self._apply_form(target)

    def expand_island(self) -> dict:
        return self._apply_form("expanded")

    def collapse_island(self) -> dict:
        if self._island is None:
            return self._fail("Island 窗口未启用")
        # 固定模式下拒绝收起（规格 §2：pinned + expanded 要常驻）。
        # Esc / 把手条点击都走这条路，护栏放在这里而不是各入口各判一遍。
        if self._display_mode == "pinned":
            return self._ok("已固定，不会收起", pinned=True, expanded=True)
        return self._apply_form("collapsed")

    def pin_island(self) -> dict:
        """图钉固定：displayMode → pinned 并展开；偏好落盘。"""
        self._display_mode = "pinned"
        self._cfg = {**self._cfg, "displayMode": "pinned", "form": "expanded"}
        desktop_config.save_desktop_config(self._cfg)
        log.info("Island 已固定（displayMode=pinned，重启后仍固定）")
        return self._apply_form("expanded")

    def unpin_island(self) -> dict:
        """取消固定：displayMode → auto_hide。

        **不自动收起**（规格 §2）：否则用户会以为图钉按钮失灵 ——
        "点了没变化"比"面板还在"更糟。收起交给用户自己点把手条 / Esc。
        """
        self._display_mode = "auto_hide"
        self._cfg = {**self._cfg, "displayMode": "auto_hide"}
        desktop_config.save_desktop_config(self._cfg)
        log.info("Island 已取消固定（displayMode=auto_hide，面板仍展开）")
        return self._ok("已取消固定", pinned=False, expanded=self._form == "expanded")

    def _apply_form(self, target: str) -> dict:
        """切换到目标形态：更新状态 → 落盘 → 起渐进动画改窗口尺寸。

        尺寸来源：collapsed 固定 360×44；expanded 用记忆的自由缩放尺寸
        （没有就用 island.py 的默认 520×420）。收起时**不动**记忆宽高 ——
        360×44 是把手的尺寸，不是用户选的面板尺寸。
        """
        if self._island is None:
            return self._fail("Island 窗口未启用")
        if self._gone:
            return self._fail("Island 窗口已关闭，重启应用后恢复")
        if target not in desktop_config.FORMS:
            return self._fail(f"未知形态：{target!r}")
        if target == self._form:
            # 幂等：已是目标形态（pinned 下点把手、展开态点展开）→ 不动窗口
            return self._ok("已是目标形态")
        self._form = target
        self._cfg = {**self._cfg, "form": target}
        desktop_config.save_desktop_config(self._cfg)
        w, h = self._size_for_form(target)
        _say(f"[island] 形态切换 → {target}（{w}×{h} DIP）")
        self._spawn_resize_animation(w, h)
        return self._ok("Island 已展开" if target == "expanded" else "Island 已收起")

    def _size_for_form(self, form: str) -> tuple[int, int]:
        if form == "collapsed":
            return island.COLLAPSED_SIZE
        # 展开态：记忆尺寸优先，但别比屏幕还大（显示器可能换过）
        sw, sh = island._primary_screen_size()
        w = self._cfg.get("panelWidth")
        h = self._cfg.get("panelHeight")
        w = w if isinstance(w, int) and w > 0 else island.EXPANDED_SIZE[0]
        h = h if isinstance(h, int) and h > 0 else island.EXPANDED_SIZE[1]
        return desktop_config.clamp_panel_size(w, h, max_w=sw, max_h=sh)

    # ── 渐进动画（Spike 2026-10-21 实测裁定）──────────────────
    # 15 步 × 16ms ease-out cubic，实测收起 235ms / 展开 250ms（≤400ms 红线内）。
    # fix_point 取左上锚定：收起条向下展开、向上收起，位置不漂。
    def _spawn_resize_animation(self, target_w: int, target_h: int) -> None:
        win = self._island
        if win is None:
            return
        self._anim_gen += 1
        gen = self._anim_gen
        self._animating = True  # 同步置位，见 __init__ 注释

        def _run() -> None:
            try:
                self._animate_size(win, target_w, target_h, gen)
            finally:
                if gen == self._anim_gen:
                    self._animating = False

        threading.Thread(target=_run, name="mp-island-anim", daemon=True).start()

    def _animate_size(self, win: Any, target_w: int, target_h: int, gen: int) -> None:
        """在工作线程里逐帧 resize。代裔过期（用户又切了）→ 本轮立即作废。"""
        fix = _fix_point()
        try:
            start = (int(win.width), int(win.height))
        except Exception:
            return
        for w, h in desktop_config.resize_schedule(start, (target_w, target_h)):
            if gen != self._anim_gen:
                return  # 有更新的目标了：旧动画剩下的帧不再执行
            if not _resize(win, w, h, fix):
                return  # 窗口没了/报错：安静退出，状态已由 _apply_form 记下
            time.sleep(desktop_config.ANIM_INTERVAL_S)
        if gen == self._anim_gen:
            _resize(win, target_w, target_h, fix)  # 终点对齐（schedule 末帧即终点，双保险）

    # ── 结果构造 ────────────────────────────────────────────
    def _ok(self, message: str, **extra: Any) -> dict:
        return {"ok": True, "message": message, **self.island_state(), **extra}

    def _fail(self, message: str) -> dict:
        log.warning("窗口操作失败：%s", message)
        return {"ok": False, "message": message, **self.island_state()}

    # ── 窗口拖动 / 缩放（M3，2026-10-14；V3 只服务展开态）────────
    # 路线说明：easy_drag 在 Windows 后端没实现，Win32 的 HTCAPTION 又会和
    # WebView2 的鼠标捕获互相干扰（按下时捕获在子窗口上，模态循环收不到 mousemove）。
    # 所以采用 JS pointer capture + 节流桥接：前端在 pointermove 里发**位移增量**，
    # Python 侧基于窗口当前位置自算绝对坐标（丢事件自愈），节流约 30fps。

    def move_window_by(self, dx: int, dy: int) -> dict:
        if self._island is None:
            return self._fail("Island 窗口未启用")
        if self._gone:
            return self._fail("Island 窗口已关闭，重启应用后恢复")
        try:
            self._island.move(int(self._island.x) + dx, int(self._island.y) + dy)
            return self._ok("已移动")
        except Exception as exc:
            return self._fail(f"移动失败：{exc}")

    def resize_window_by(self, edge: str, dx: int, dy: int) -> dict:
        if self._island is None:
            return self._fail("Island 窗口未启用")
        if self._gone:
            return self._fail("Island 窗口已关闭，重启应用后恢复")
        if self._form != "expanded":
            return self._fail("收起态不可缩放（先展开）")  # 把手条不接受自定义尺寸
        try:
            x, y = int(self._island.x), int(self._island.y)
            w, h = int(self._island.width), int(self._island.height)
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
            w, h = desktop_config.clamp_panel_size(w, h)
            self._island.move(x, y)
            self._island.resize(w, h)
            return self._ok("已缩放")
        except Exception as exc:
            return self._fail(f"缩放失败：{exc}")

    def end_window_drag(self) -> dict:
        """拖动/缩放结束 → 立即持久化（拖动过程中的高频 move 不逐次写盘）。"""
        self._persist_geometry(force=True)
        # 阶段 7：region 档下窗口缩放后区域不跟随窗口，必须重设
        if self._rounded_mode == "region":
            import window_style

            if self._island is not None:
                window_style.reapply_region(self._island)
        return self._ok("位置已保存")

    # ── 生命周期：主窗口关闭即退出整个应用 ──────────────────────
    def bind_main_window(self, main_window: Any, on_app_quit: Any) -> None:
        """主窗口关闭 → 退出整个应用（停服务，见 launcher.stop_services）。

        **为什么必须显式做**（2026-10-03 用户被这个坑到第二次）：
        pywebview 的 `start()` 只有在**所有**窗口都关闭后才返回，而启动器的
        `finally: kill_tree(...)`（停后端/前端）挂在它返回之后。
        只关主窗口的话，Island 窗口（哪怕是把手条）仍存在 → start() 不返回 →
        后端与前端**继续占着 8000/3000**，界面上看着"关掉了"，后台其实还在跑。

        用户的要求很明确：**关掉界面，后台进程直接全退。** 这就是这条绑定的意义。

        **为什么回调里不 destroy 窗口**（Spike 新坑 8）：工作线程 `destroy()`
        与 GUI 线程互等挂死。退出走 `on_app_quit`（launcher 的
        `stop_services(procs, hard_exit=True)`：taskkill 整棵树 + os._exit(0)），
        进程没了窗口自然没了。Windows 上这条事件其实不触发（GUI 在子进程，
        见 window_watch 文档），真正的退出通路是标题监视；这里只是其他平台的快路径。
        """

        def _on_main_closed(*_args: Any) -> None:
            log.info("主窗口已关闭 → 退出整个应用（走 stop_services 硬退出）")
            try:
                on_app_quit()
            except Exception as exc:
                log.warning("退出回调异常：%r", exc)

        try:
            main_window.events.closed += _on_main_closed
        except Exception as exc:  # 老版本没有 events
            log.warning("无法绑定主窗口关闭事件：%r", exc)


def _fix_point() -> Any:
    """FixPoint.NORTH|WEST（左上锚定）；拿不到就 None（resize 默认即左上，见 Spike）。"""
    try:
        from webview import FixPoint  # type: ignore

        return FixPoint.NORTH | FixPoint.WEST
    except Exception:
        return None


def _resize(win: Any, w: int, h: int, fix: Any) -> bool:
    """改窗口尺寸。失败（窗口已没了等）返回 False，让动画安静收手。"""
    try:
        if fix is None:
            win.resize(w, h)
        else:
            win.resize(w, h, fix_point=fix)
        return True
    except Exception as exc:
        log.debug("resize 跳过：%r", exc)
        return False
