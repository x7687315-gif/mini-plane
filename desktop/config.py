"""桌面 Island 的偏好持久化（Island V2 阶段 2 · 规格 §1.3）。

为什么用**原生配置文件**而不是前端 localStorage（2026-10-12 用户拍板）：
- 窗口位置与 displayMode 要在**页面加载之前**就能恢复 —— 原生窗口是 Python 侧创建的，
  localStorage 要等 WebView2 把页面跑起来才读得到，那期间窗口已经闪一下出现在旧位置了；
- 用户清浏览器数据不该丢掉"面板固定着"这个偏好；
- 与 `secret_key` 同目录（runtime/），本来就是本机数据。

文件：`runtime/desktop-config.json`。**损坏或缺失都退回默认值**，
绝不因为一个配置文件打不开软件（启动器的一贯原则：配置问题是降级，不是失败）。
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

#: 两种显示模式（规格 §2.3）。pinned = 图钉固定，auto_hide = 隐藏式（默认）。
DISPLAY_MODES = ("auto_hide", "pinned")
DEFAULT_DISPLAY_MODE = "auto_hide"


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
    """默认配置：隐藏式 + 不记忆位置（None 交给调用方用屏幕居中兜底）。"""
    return {
        "displayMode": DEFAULT_DISPLAY_MODE,
        "triggerX": None,
        "panelX": None,
        "panelY": None,
        # Island V3（2026-10-21）：单窗折叠后窗口有收起/展开两个形态，
        # 自由缩放过的尺寸要记忆（None = 用 island.py 的默认 COLLAPSED/EXPANDED）
        "panelWidth": None,
        "panelHeight": None,
        # M1 默认首展（2026-10-14）：False = 用户还没表达过偏好 → 启动即展开完整面板，
        # 第一眼就看到"记忆中的悬浮窗"；一旦收起/固定过就置 True，之后按记住的偏好走
        "onboarded": False,
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
    if isinstance(raw.get("onboarded"), bool):
        cfg["onboarded"] = raw["onboarded"]
    for key in ("triggerX", "panelX", "panelY", "panelWidth", "panelHeight"):
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
        "triggerX": _int_or_none(cfg.get("triggerX")),
        "panelX": _int_or_none(cfg.get("panelX")),
        "panelY": _int_or_none(cfg.get("panelY")),
        "panelWidth": _int_or_none(cfg.get("panelWidth")),
        "panelHeight": _int_or_none(cfg.get("panelHeight")),
        "onboarded": bool(cfg.get("onboarded")),
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


# ── 纯函数状态机（规格 §2.3）────────────────────────────────────


def next_visibility(display_mode: str, visibility: str) -> str:
    """点把手 / Alt+I 之后的 visibility。

    - `pinned` 模式下把手点击**不收起**（面板要一直可见，否则用户会以为按钮失灵）；
    - `auto_hide` 模式下在 hidden/expanded 之间翻转。
    """
    if display_mode == "pinned":
        return "expanded"
    return "hidden" if visibility == "expanded" else "expanded"


def esc_collapses(display_mode: str) -> bool:
    """`Esc` 是否收起面板（规格 §2.3：仅 auto_hide + expanded 时）。"""
    return display_mode == "auto_hide"
