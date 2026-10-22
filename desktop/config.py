"""桌面 Island 的偏好持久化（Island V3 · 单窗两态，2026-10-21 起）。

为什么用**原生配置文件**而不是前端 localStorage（2026-10-12 用户拍板）：
- 窗口位置与形态要在**页面加载之前**就能恢复 —— 原生窗口是 Python 侧创建的，
  localStorage 要等 WebView2 把页面跑起来才读得到，那期间窗口已经闪一下出现在旧位置了；
- 用户清浏览器数据不该丢掉"面板固定着"这个偏好；
- 与 `secret_key` 同目录（runtime/），本来就是本机数据。

文件：`runtime/desktop-config.json`。**损坏或缺失都退回默认值**，
绝不因为一个配置文件打不开软件（启动器的一贯原则：配置问题是降级，不是失败）。

## V3 记什么（V2 → V3 键位变化）

| 键 | 含义 | V2 对应 |
|---|---|---|
| `displayMode` | `auto_hide`（可收起，默认）/ `pinned`（固定保持展开） | 同 |
| `form` | `collapsed`（把手条）/ `expanded`（完整面板） | 取代 visibility |
| `panelX/panelY` | 窗口位置（DIP） | 同 |
| `panelWidth/panelHeight` | 展开态自由缩放尺寸（null = 用代码默认 520×420） | 新增 |

`form` 为 null = 未记录（首启）：此时由 `WindowManager.restore_preferences`
按 M1 规则决定（pinned 恒展开，否则默认展开）。V2 的 `onboarded` 布尔随之退役
——"表达过偏好"现在由 `form` 键是否存在表达，少一个布尔少一处漂移。
`triggerX` 也退役：把手窗口没了，把手条位置就是面板位置。
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

#: 两种显示模式。pinned = 固定保持展开，auto_hide = 可收起（默认）。
DISPLAY_MODES = ("auto_hide", "pinned")
DEFAULT_DISPLAY_MODE = "auto_hide"

#: 两种窗口形态（Island V3）。collapsed = 360×44 把手条；expanded = 完整面板。
FORMS = ("collapsed", "expanded")
DEFAULT_FORM = "expanded"  # M1 默认首展：第一次启动就给完整面板

#: 展开态尺寸的兜底范围（DIP）。与 island.py 的 MIN_SIZE 保持一致。
MIN_PANEL_SIZE = (360, 44)
#: 渐进动画参数（Spike 实测：15 步 × 16ms ease-out cubic ≈ 235–250ms，
#: 守 DESIGN「动效 ≤400ms」红线；可在测试里逐帧钉死）。
ANIM_STEPS = 15
ANIM_INTERVAL_S = 0.016


def config_path() -> Path:
    """配置文件路径。与 launcher 的 runtime_dir() 同一目录。"""
    return _runtime_dir() / "desktop-config.json"


def _runtime_dir() -> Path:
    # launcher.runtime_dir() 在同一个包里；延迟导入避免循环依赖
    try:
        from launcher import runtime_dir  # type: ignore

        return Path(runtime_dir())
    except Exception:
        # 单独跑（测试 / 脚本）时退回仓库约定位置
        return Path(__file__).resolve().parent.parent / "runtime"


def default_config() -> dict[str, Any]:
    """默认配置：可收起 + 形态未记录（None = 首启，由调用方按 M1 规则决定）。"""
    return {
        "displayMode": DEFAULT_DISPLAY_MODE,
        "form": None,
        "panelX": None,
        "panelY": None,
        # Island V3：自由缩放过的尺寸要记忆（None = 用 island.py 的默认 520×420）
        "panelWidth": None,
        "panelHeight": None,
    }


def load_desktop_config() -> dict[str, Any]:
    """读配置；任何异常都退回默认值（并保留现场供排查）。"""
    cfg = default_config()
    path = config_path()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return cfg
    except Exception as exc:  # 损坏的 JSON / 编码问题：降级而不是崩
        print(f"[config] desktop-config.json 读取失败，改用默认值：{exc!r}")
        return cfg

    if not isinstance(raw, dict):
        print("[config] desktop-config.json 不是对象，改用默认值")
        return cfg

    mode = raw.get("displayMode")
    if mode in DISPLAY_MODES:
        cfg["displayMode"] = mode
    form = raw.get("form")
    if form in FORMS:  # null / 非法值都按"未记录"处理（首启走 M1 默认首展）
        cfg["form"] = form
    for key in ("panelX", "panelY", "panelWidth", "panelHeight"):
        value = raw.get(key)
        # 只接受有限数值：NaN/inf/字符串都会让窗口定位出错
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            cfg[key] = int(value)
    return cfg


def save_desktop_config(cfg: dict[str, Any]) -> bool:
    """写配置。失败只警告不抛（写不进去不该影响窗口操作本身）。"""
    path = config_path()
    clean = {
        "displayMode": cfg.get("displayMode")
        if cfg.get("displayMode") in DISPLAY_MODES
        else DEFAULT_DISPLAY_MODE,
        "form": cfg.get("form") if cfg.get("form") in FORMS else None,
        "panelX": _int_or_none(cfg.get("panelX")),
        "panelY": _int_or_none(cfg.get("panelY")),
        "panelWidth": _int_or_none(cfg.get("panelWidth")),
        "panelHeight": _int_or_none(cfg.get("panelHeight")),
    }
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(clean, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, path)  # 原子替换：避免写一半被杀留下损坏文件
        return True
    except Exception as exc:
        print(f"[config] desktop-config.json 写入失败：{exc!r}")
        return False


def _int_or_none(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return int(value)


# ── 纯函数：形态状态机（规格 §2 的四宫格，V3 改写）───────────────────


def next_form(display_mode: str, form: str) -> str:
    """点把手条 / Alt+I 之后的形态。

    - `pinned` 模式下点击**不收起**（面板要一直可见，否则用户会以为按钮失灵）；
    - `auto_hide` 模式下在 collapsed/expanded 之间翻转。
    """
    if display_mode == "pinned":
        return "expanded"
    return "collapsed" if form == "expanded" else "expanded"


def esc_collapses(display_mode: str) -> bool:
    """`Esc` 是否收起面板（仅 auto_hide 时；pinned 常驻不收）。"""
    return display_mode == "auto_hide"


def clamp_panel_size(
    width: int,
    height: int,
    max_w: int | None = None,
    max_h: int | None = None,
) -> tuple[int, int]:
    """把展开态尺寸夹进合法范围（恢复记忆尺寸时用）。

    下界 MIN_PANEL_SIZE；上界给的是屏幕尺寸的调用方责任（`island._primary_screen_size`），
    这里只负责"别比屏幕还大"这一条纯算术。
    """
    w = max(MIN_PANEL_SIZE[0], int(width))
    h = max(MIN_PANEL_SIZE[1], int(height))
    if max_w is not None:
        w = min(w, int(max_w))
    if max_h is not None:
        h = min(h, int(max_h))
    return w, h


def ease_out_cubic(t: float) -> float:
    """ease-out cubic：起步快、收尾稳（Spike 实测 235/250ms 的那条曲线）。"""
    if t <= 0:
        return 0.0
    if t >= 1:
        return 1.0
    return 1 - (1 - t) ** 3


def resize_schedule(
    start: tuple[int, int],
    target: tuple[int, int],
    steps: int = ANIM_STEPS,
) -> list[tuple[int, int]]:
    """折叠/展开动画的尺寸序列（不含起点、含终点），共 `steps` 帧。

    抽成纯函数是为了用单测钉死三件事：终点必须精确命中（累计误差靠最后一步对齐）、
    逐帧单调（fold 时不能出现"先涨一点再跌"的抖动）、首帧就有可见位移
    （ease-out 的意义就是立刻响应）。
    """
    if steps <= 0:
        return [target]
    w0, h0 = int(start[0]), int(start[1])
    w1, h1 = int(target[0]), int(target[1])
    out: list[tuple[int, int]] = []
    for i in range(1, steps + 1):
        t = ease_out_cubic(i / steps)
        out.append((round(w0 + (w1 - w0) * t), round(h0 + (h1 - h0) * t)))
    out[-1] = (w1, h1)  # 终点对齐：浮点累计误差不许留在窗口尺寸里
    return out
