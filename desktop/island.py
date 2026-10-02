"""Island 独立窗口的规格（Sprint 15 · Desktop Island）。

把「当前工程状态」从主窗口里拎出来，做成一个**置顶、可拖、可随时收起**的小窗：
需要时瞄一眼工程推到哪儿了，不想看就收起来，主窗口继续干活。

为什么是"一个额外的原生窗口"而不是主窗口里的一个面板：
- 主窗口是工作面，上面堆着任务列表与编辑区，塞一个常驻悬浮层会挡住内容；
- 独立窗口可以被操作系统层置顶，切到别的程序（IDE/浏览器）时仍能看见 NOW。

窗口行为（pywebview 能力范围内）：
- **隐藏启动**：第一次只出现主窗口，用户按 `Alt+I` 或点 Island 页的「独立窗口」才唤出；
- **置顶**（`on_top=True`）、**无边框可拖**（`frameless` + `easy_drag`）；
- **顶部居中**：位置只能在创建时给（这版 pywebview 没有 `move_to`），所以先算好再创建；
- **可缩放但不设死**：最小 (360, 96)，最大交给用户拖。

> 重要：这版 pywebview 的 `create_window` 参数名是 **`easy_drag`**（不是 `draggable`，
> 后者是"用 HTML5 draggable 属性拖元素"），写错会静默变成不可拖。
"""

from __future__ import annotations

import os
from typing import Any

ISLAND_TITLE = "Mini Plane · Island"
#: 面板路由：它不套 AppShell（无顶栏/侧栏），否则在这个尺寸里全是"看起来能点其实不能点"的控件
ISLAND_PATH = "/island-panel"

ISLAND_WIDTH = int(os.environ.get("MINIPLANE_ISLAND_WIDTH", "520"))
ISLAND_HEIGHT = int(os.environ.get("MINIPLANE_ISLAND_HEIGHT", "420"))
ISLAND_MIN_SIZE = (360, 96)


def island_enabled() -> bool:
    """是否要开 Island 窗口（默认开；出问题可用环境变量一键关掉）。"""
    return os.environ.get("MINIPLANE_ISLAND", "1") != "0"


def island_url(frontend_port: int) -> str:
    return f"http://127.0.0.1:{frontend_port}{ISLAND_PATH}"


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


def create_island_window(webview_mod: Any, frontend_port: int, js_api: Any) -> Any:
    """创建 Island 窗口（**隐藏启动**）。

    返回 pywebview 的 Window 对象。必须在 `webview.start()` 之前调用——
    pywebview 要求所有窗口先登记、再统一启动。
    """
    sw, _sh = _primary_screen_size()
    x, y = top_center(sw, ISLAND_WIDTH)
    return webview_mod.create_window(
        ISLAND_TITLE,
        island_url(frontend_port),
        js_api=js_api,
        width=ISLAND_WIDTH,
        height=ISLAND_HEIGHT,
        x=x,
        y=y,
        min_size=ISLAND_MIN_SIZE,
        resizable=True,
        frameless=True,  # 无边框：这是一块"图纸"，不需要窗口装饰
        easy_drag=True,  # 整窗可拖（注意参数名是 easy_drag）
        on_top=True,  # 置顶：切到别的程序也看得见 NOW
        hidden=True,  # 首次不打扰，需要时用 Alt+I 唤出
        text_select=True,  # 任务标题要能选中复制
        background_color="#F4F1EA",  # 纸色，避免加载瞬间闪白
    )
