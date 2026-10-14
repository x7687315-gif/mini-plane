"""Island 独立窗口与触发把手的规格（Sprint 15 → Island V2 阶段 2）。

## 两个窗口，两种职责（规格 §1.1 / §1.2）

- **触发把手（trigger）**：隐藏模式下唯一可见的东西。顶部居中、约 120×12 的小胶囊，
  置顶、无边框、不可缩放。点击它展开完整面板；`Alt+I` 与它等价。
- **完整面板（island）**：多项目总览。置顶、无边框可拖，可缩放。

> 为什么触发把手必须是**原生窗口**而不是"隐藏主窗口等鼠标悬停"：
> pywebview 的窗口一旦隐藏就不再接收鼠标事件，届时没有任何东西能把它唤回来。
> 留一个小的原生窗口当把手，是"默认隐藏"唯一可靠的实现方式（规格 §2.1 实现注意）。

窗口行为（pywebview 能力范围内）：
- **触发把手常驻可见**；完整面板按 `displayMode × visibility` 决定显隐（见 window_manager）；
- **置顶**（`on_top=True`）、**无边框**（`frameless`）；
- **顶部居中**：位置只能在创建时给（这版 pywebview 没有 `move_to`），所以先算好再创建，
  运行时拖动后的新位置由 `events.moved` 收下来持久化。

> 重要：这版 pywebview 的 `create_window` 参数名是 **`easy_drag`**（不是 `draggable`，
> 后者是"用 HTML5 draggable 属性拖元素"），写错会静默变成不可拖。
"""

from __future__ import annotations

import os
from typing import Any

ISLAND_TITLE = "Mini Plane · Island"
#: 面板路由：它不套 AppShell（无顶栏/侧栏），否则在这个尺寸里全是"看起来能点其实不能点"的控件
ISLAND_PATH = "/island-panel"

#: 触发把手路由：一个只负责"点我展开"的极小页面（见 frontend/app/(panel)/island-trigger）
TRIGGER_TITLE = "Mini Plane · Island Trigger"
TRIGGER_PATH = "/island-trigger"

ISLAND_WIDTH = int(os.environ.get("MINIPLANE_ISLAND_WIDTH", "520"))
ISLAND_HEIGHT = int(os.environ.get("MINIPLANE_ISLAND_HEIGHT", "420"))
ISLAND_MIN_SIZE = (360, 96)

#: 触发把手尺寸（规格 §1.2：约 120×12；悬停加宽由前端 CSS 做，窗口本身给足宽度）
TRIGGER_WIDTH = int(os.environ.get("MINIPLANE_TRIGGER_WIDTH", "200"))
TRIGGER_HEIGHT = int(os.environ.get("MINIPLANE_TRIGGER_HEIGHT", "32"))


def island_enabled() -> bool:
    """是否要开 Island 窗口（默认开；出问题可用环境变量一键关掉）。"""
    return os.environ.get("MINIPLANE_ISLAND", "1") != "0"


def island_url(frontend_port: int) -> str:
    return f"http://127.0.0.1:{frontend_port}{ISLAND_PATH}"


def trigger_url(frontend_port: int) -> str:
    return f"http://127.0.0.1:{frontend_port}{TRIGGER_PATH}"


def top_center(screen_w: int, width: int = ISLAND_WIDTH) -> tuple[int, int]:
    """顶部居中坐标。y 取 0：置顶窗贴上屏幕边缘，最符合"随时瞄一眼"的直觉。"""
    return max(0, (screen_w - width) // 2), 0


def _primary_screen_size() -> tuple[int, int]:
    """主屏尺寸；拿不到就退回一个保守的默认值（不影响启动，只是位置可能偏）。"""
    try:
        import webview  # type: ignore

        screens = webview.screens or []
        if screens:
            return int(screens[0].get("width", 1920)), int(screens[0].get("height", 1080))
    except Exception:
        pass
    return 1920, 1080


def _clamp_to_screen(x: int | None, y: int | None, w: int, h: int) -> tuple[int, int]:
    """把记忆的位置夹回屏幕内（显示器配置可能变，别把窗口放到看不见的地方）。"""
    sw, sh = _primary_screen_size()
    if x is None:
        x = max(0, (sw - w) // 2)
    if y is None:
        y = 0
    return max(0, min(int(x), max(0, sw - w))), max(0, min(int(y), max(0, sh - h)))


def create_island_window(
    webview_mod: Any,
    frontend_port: int,
    js_api: Any,
    *,
    x: int | None = None,
    y: int | None = None,
    hidden: bool = True,
) -> Any:
    """创建 Island 完整面板窗口（默认**隐藏启动**，由触发把手唤出）。

    返回 pywebview 的 Window 对象。必须在 `webview.start()` 之前调用——
    pywebview 要求所有窗口先登记、再统一启动。
    """
    px, py = _clamp_to_screen(x, y, ISLAND_WIDTH, ISLAND_HEIGHT)
    return webview_mod.create_window(
        ISLAND_TITLE,
        island_url(frontend_port),
        js_api=js_api,
        width=ISLAND_WIDTH,
        height=ISLAND_HEIGHT,
        x=px,
        y=py,
        min_size=ISLAND_MIN_SIZE,
        resizable=True,
        frameless=True,  # 无边框：这是一块"图纸"，不需要窗口装饰
        # easy_drag：Windows 后端没实现（整窗拖动改走页眉 JS 桥接，见 window_manager）
        easy_drag=True,
        on_top=True,  # 置顶：切到别的程序也看得见 NOW
        hidden=hidden,  # 首次不打扰，需要时用触发把手 / Alt+I 唤出
        text_select=True,  # 任务标题要能选中复制
        shadow=True,  # 原生窗口阴影（Windows only）：与桌面分层，替代被否决的 transparent
        background_color="#F4F1EA",  # 纸色，避免加载瞬间闪白
    )


def create_trigger_window(
    webview_mod: Any,
    frontend_port: int,
    js_api: Any,
    *,
    x: int | None = None,
) -> Any:
    """创建触发把手（Island V2 阶段 2 · 规格 §1.2）。

    - 约 140×14 的小胶囊，纸色填充 + 钴蓝细边（配色在前端页面里做）；
    - 置顶、无边框、**不可缩放**（`resizable=False`，否则用户能把它拉成一条看不见的线）；
    - 常驻可见：隐藏模式下它是唯一入口；
    - 位置取记忆值，夹回屏幕内；拿不到就顶部居中。
    """
    tx, ty = _clamp_to_screen(x, 0, TRIGGER_WIDTH, TRIGGER_HEIGHT)
    return webview_mod.create_window(
        TRIGGER_TITLE,
        trigger_url(frontend_port),
        js_api=js_api,
        width=TRIGGER_WIDTH,
        height=TRIGGER_HEIGHT,
        x=tx,
        y=ty,
        # ⚠️ 必须显式给 min_size：pywebview 的默认值是 **(200, 100)**，
        # WinForms 会把它设成 MinimumSize，于是 140×14 的把手被夹成 200×100
        # （2026-10-13 真机量到）。不给就等于请求了一个大窗口。
        min_size=(TRIGGER_WIDTH, TRIGGER_HEIGHT),
        resizable=False,
        frameless=True,
        easy_drag=True,
        on_top=True,
        hidden=False,  # 把手必须可见，否则"默认隐藏"就没有入口了
        text_select=False,
        background_color="#F4F1EA",
    )
