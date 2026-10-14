"""Island 窗口圆角（阶段 7 实验）。

规格与调研：docs/research/2026-10-14-phase7-rounded-window-preflight.md。

两档互斥（微软官方约束：用 SetWindowRgn 的窗口**无法**再获得 DWM 圆角）：

- **dwm（默认）**：`DwmSetWindowAttribute(hwnd, 33, DWMWCP_ROUND)`。
  Windows 11 原生圆角（系统半径，抗锯齿 + 保留 DWM 阴影）；Win10 无此属性 → 静默降级方形。
- **region（实验）**：`CreateRoundRectRgn + SetWindowRgn`，半径贴合卡片 26px。
  代价：边缘锯齿 + 失去 DWM 阴影 + **窗口缩放后必须重设区域**（区域不会跟随窗口）。
  仅在 `MINIPLANE_ISLAND_RGN=1` 时启用。

返回值即"生效档"（dwm / region / none），全部写进 launcher.log —— 用户可从日志
确认自己机器上生效的是哪一档（API 只是提示，无法查询"是否真的圆了"）。
取 HWND 的失败原因也会写日志（`[window-style] …`），否则"圆角=none"无法归因。
"""

from __future__ import annotations

import ctypes
import os
from typing import Any

#: DWM 属性：DWMWA_WINDOW_CORNER_PREFERENCE（Win11+）
_DWMWA_WINDOW_CORNER_PREFERENCE = 33
#: DWM_WINDOW_CORNER_PREFERENCE：DWMWCP_ROUND = 2（标准圆角）
_DWMWCP_ROUND = 2
#: SetWindowRgn 的圆角半径（与 Island 卡片外圆角一致，Island V2 规格 §3.3）
_REGION_RADIUS = 26

_region_windows: set[int] = set()

#: 诊断钩子：launcher 注入 _log（冻结版没有控制台，print 无人可见）。
_notify: Any = None


def set_notify(fn: Any) -> None:
    global _notify
    _notify = fn


def _diag(message: str) -> None:
    if _notify is not None:
        try:
            _notify(f"[window-style] {message}")
        except Exception:
            pass


def _hwnd_of(window: Any) -> tuple[int | None, str]:
    """从 pywebview 窗口取 HWND（WinForms 的 native.Handle）。

    返回 (hwnd, 诊断)。取不到时 hwnd=None、诊断说明原因 —— 冻结版没有控制台，
    诊断信息经 launcher.log 输出，否则"圆角=none"无法归因（2026-10-14 实测踩过）。

    ⚠️ pythonnet 的 System.IntPtr **不支持** int() 直转（TypeError），必须走 ToInt64()。
    """
    try:
        native = getattr(window, "native", None)
        if native is None:
            return None, "native 属性为 None（GUI 尚未就绪？）"
        handle = getattr(native, "Handle", None)
        if handle is None:
            return None, "native.Handle 为 None"
        try:
            return int(handle), ""
        except TypeError:
            return int(handle.ToInt64()), ""
    except Exception as exc:  # noqa: BLE001 —— 诊断信息比静默吞掉更有用
        return None, f"取 Handle 异常：{exc!r}"


def _try_dwm(hwnd: int) -> str:
    """DWMWCP_ROUND；Win10 上 dwmapi 没有属性 33 → 返回错误码 → 降级。"""
    try:
        dwmapi = ctypes.windll.dwmapi
        preference = ctypes.c_int(_DWMWCP_ROUND)
        hr = dwmapi.DwmSetWindowAttribute(
            ctypes.c_void_p(hwnd), _DWMWA_WINDOW_CORNER_PREFERENCE, ctypes.byref(preference), 4
        )
        if hr != 0:
            _diag(f"DwmSetWindowAttribute 返回 {hr}（{hr & 0xFFFFFFFF:#x}）")
            return "none"
        return "dwm"
    except Exception as exc:  # noqa: BLE001
        _diag(f"DwmSetWindowAttribute 异常：{exc!r}")
        return "none"


def _apply_region(window: Any, hwnd: int) -> str:
    """SetWindowRgn 圆角区域（实验档）。窗口缩放后需调用 reapply_region()。"""
    try:
        gdi = ctypes.windll.gdi32
        user32 = ctypes.windll.user32
        w, h = int(window.width), int(window.height)
        region = gdi.CreateRoundRectRgn(0, 0, w + 1, h + 1, _REGION_RADIUS, _REGION_RADIUS)
        if not region:
            _diag("CreateRoundRectRgn 失败")
            return "none"
        if not user32.SetWindowRgn(ctypes.c_void_p(hwnd), ctypes.c_void_p(region), True):
            _diag("SetWindowRgn 失败")
            return "none"
        _region_windows.add(hwnd)
        return "region"
    except Exception as exc:  # noqa: BLE001
        _diag(f"SetWindowRgn 异常：{exc!r}")
        return "none"


def apply(window: Any) -> str:
    """按环境档位给窗口上圆角。返回生效档：dwm / region / none。

    - 默认 dwm 档；`MINIPLANE_ISLAND_RGN=1` 切 region 实验档（与 dwm 互斥，见模块 docstring）。
    - 任何失败都静默降级为 none（保持方形现状）—— 视觉增强不该能弄坏启动。
    """
    hwnd, diag = _hwnd_of(window)
    if hwnd is None:
        _diag(f"取 HWND 失败：{diag}")
        return "none"
    if os.environ.get("MINIPLANE_ISLAND_RGN") == "1":
        return _apply_region(window, hwnd)
    return _try_dwm(hwnd)


def reapply_region(window: Any) -> None:
    """region 档下窗口尺寸变化后重设区域（区域不跟随窗口，必须手动更新）。"""
    if os.environ.get("MINIPLANE_ISLAND_RGN") != "1":
        return
    hwnd = _hwnd_of(window)
    if hwnd is None or hwnd not in _region_windows:
        return
    _apply_region(window, hwnd)
