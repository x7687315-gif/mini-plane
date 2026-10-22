"""Island 独立窗口的规格（Island V3 · 单窗两态，2026-10-21）。

## V3 与 V2 的区别：两个窗口 → 一个可折叠窗口

V2 是「触发把手 + 完整面板」两个原生窗口；V3 合并为**单个原生窗口、两种形态**：

    collapsed  360×44   顶部把手条（就是入口本身，点击 / Alt+I 展开）
    expanded   520×420  完整面板（可自由缩放，尺寸记忆，重启恢复）

理由（决策简报 `docs/research/2026-10-21-island-v3-preflight.md` §2）：
- 双窗有一条结构性裂缝：把手可见 ≠ 面板可见，两个窗口各自持一份位置偏好，
  用户拖了把手、面板从旧位置弹出，「记忆位置」这件事永远是半对的；
- pywebview 的窗口一旦隐藏就不再接收鼠标事件，V2 靠「把手常驻」兜底；
  单窗化后窗口**永不隐藏**，这条约束自然消失，状态从「两个正交布尔」
  退化为「一个形态值」，鬼故事少一半。

窗口行为（pywebview 能力范围内）：
- **置顶**（`on_top=True`）、**无边框**（`frameless`）；
- 位置只能在创建时给（这版 pywebview 没有 `move_to`），所以先算好再创建，
  运行时拖动后的新位置由 `events.moved` 收下来持久化；
- 初始形态经 URL `?form=collapsed|expanded` 下发给前端（页面加载即知道该渲染
  把手条还是完整面板），前端再用 `island_state()` 与 Python 侧对账。

> 重要：这版 pywebview 的 `create_window` 参数名是 **`easy_drag`**（不是 `draggable`，
> 后者是"用 HTML5 draggable 属性拖元素"），写错会静默变成不可拖。

## 尺寸单位：DIP

pywebview 创建/请求/自报窗口尺寸全用 DIP（设备无关像素），与 CSS 像素 1:1；
本机 125% DPI 下 Win32 `GetWindowRect` 返回的是物理像素（×1.25）——
**所有规格按 DIP 书写**，不要在 Python 侧做 DPI 换算（Spike 实测结论）。
"""

from __future__ import annotations

import os
from typing import Any

ISLAND_TITLE = "Mini Plane · Island"
#: 面板路由：它不套 AppShell（无顶栏/侧栏），否则在这个尺寸里全是"看起来能点其实不能点"的控件。
#: V3 起同一个路由承载两种形态：`?form=collapsed` 渲染把手条，`?form=expanded` 渲染完整面板。
ISLAND_PATH = "/island-panel"

#: 收起态（把手条）尺寸。高度 44 是"一行内容 + 呼吸感"的下限，再矮就点不准了。
COLLAPSED_SIZE = (360, 44)

#: 展开态默认尺寸（用户自由缩放后的值记在 desktop-config.json，优先级更高）。
EXPANDED_WIDTH = int(os.environ.get("MINIPLANE_ISLAND_WIDTH", "520"))
EXPANDED_HEIGHT = int(os.environ.get("MINIPLANE_ISLAND_HEIGHT", "420"))
EXPANDED_SIZE = (EXPANDED_WIDTH, EXPANDED_HEIGHT)

#: 最小尺寸**必须**显式给足：pywebview 的默认值是 (200, 100)（WinForms 的
#: MinimumSize），不显式给的话 44px 高的把手条会被夹成 100px，折叠就废了
#: （2026-10-13 真机量到过同一个坑，V3 只是换了受害者）。
MIN_SIZE = (360, 44)

#: URL 与 desktop-config.json 共用的形态取值
FORMS = ("collapsed", "expanded")


def island_enabled() -> bool:
    """是否要开 Island 窗口（默认开；出问题可用环境变量一键关掉）。"""
    return os.environ.get("MINIPLANE_ISLAND", "1") != "0"


def island_url(frontend_port: int, form: str = "expanded") -> str:
    """面板 URL。`form` 告诉前端首帧渲染哪种形态（见模块 docstring）。"""
    safe_form = form if form in FORMS else "expanded"
    return f"http://127.0.0.1:{frontend_port}{ISLAND_PATH}?form={safe_form}"


def size_for_form(
    form: str, width: int | None = None, height: int | None = None
) -> tuple[int, int]:
    """形态 → 窗口尺寸（DIP）。

    expanded 允许调用方传入记忆的宽高（None = 用默认 520×420）；
    collapsed 固定 360×44（把手条不接受自定义尺寸，否则"收起"没有稳定预期）。
    """
    if form == "collapsed":
        return COLLAPSED_SIZE
    w = width if isinstance(width, int) and width > 0 else EXPANDED_SIZE[0]
    h = height if isinstance(height, int) and height > 0 else EXPANDED_SIZE[1]
    return max(MIN_SIZE[0], w), max(MIN_SIZE[1], h)


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
    form: str = "expanded",
    width: int | None = None,
    height: int | None = None,
) -> Any:
    """创建 Island 单窗（V3）。返回 pywebview 的 Window 对象。

    必须在 `webview.start()` 之前调用——pywebview 要求所有窗口先登记、再统一启动。

    - `form`：初始形态（collapsed 以 360×44 把手条启动；expanded 以完整面板启动）；
    - `width/height`：仅 expanded 有意义，传入记忆的自由缩放尺寸（None = 默认 520×420）；
    - 窗口**永不隐藏启动**：V3 的把手条就是入口，没有"藏起来再唤出"的中间态。
    """
    w, h = size_for_form(form, width, height)
    px, py = _clamp_to_screen(x, y, w, h)
    return webview_mod.create_window(
        ISLAND_TITLE,
        island_url(frontend_port, form),
        js_api=js_api,
        width=w,
        height=h,
        x=px,
        y=py,
        min_size=MIN_SIZE,  # 见模块 docstring：不给足就把 44px 夹成 100px
        resizable=True,
        frameless=True,  # 无边框：这是一块"图纸"，不需要窗口装饰
        # easy_drag：Windows 后端没实现（整窗拖动改走页眉 JS 桥接，见 window_manager）
        easy_drag=True,
        on_top=True,  # 置顶：切到别的程序也看得见 NOW
        hidden=False,  # V3：窗口即入口，永远可见（ collapsed 是把手条，不是隐藏）
        text_select=True,  # 任务标题要能选中复制
        shadow=True,  # 原生窗口阴影（Windows only）：与桌面分层，替代被否决的 transparent
        background_color="#F4F1EA",  # 纸色，避免加载瞬间闪白
    )
