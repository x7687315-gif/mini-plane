# 阶段 7：原生圆角窗口实验转正（2026-10-15）

> 调研：`docs/research/2026-10-14-phase7-rounded-window-preflight.md`（PASS 100）。
> 提交：`103da1f`；台账修正 `c15b91a`。

---

## 一、做了什么

`desktop/window_style.py`（新）：Island **面板与把手**的窗口本体圆角，两档互斥
（微软官方约束：SetWindowRgn 与 DWM 圆角互斥、叠加无效）：

| 档 | 机制 | 视觉 | 状态 |
|---|---|---|---|
| **dwm（默认）** | `DwmSetWindowAttribute(hwnd, 33, DWMWCP_ROUND)` | Win11 原生圆角（系统半径、抗锯齿、**保留 DWM 阴影**） | ✅ 本机（Win11 build 26200）日志确认 `窗口圆角=dwm` |
| region（实验） | `CreateRoundRectRgn + SetWindowRgn`，26px 贴合卡片 | 像素级贴合卡片圆角 | **锯齿 + 无阴影 + 缩放后需重设**；仅 `MINIPLANE_ISLAND_RGN=1` 启用 |

接线：launcher 在窗口 show 后 5s 的工作线程里应用（HWND 在 GUI 启动后才有效）；
`end_window_drag` 在 region 档重设区域；全部诊断走 `_log` 通道。

## 二、实施中排掉的三个坑（都有证据）

1. **print 在冻结版不可见**：圆角失败时日志只有 `none` 没有原因——诊断必须走
   `set_notify → launcher.log` 通道（与窗口 API 的 set_notify 同一机制）。
2. **pythonnet 的 `System.IntPtr` 不支持 `int()` 直转**（TypeError:
   int() argument must be a string…）——必须走 `handle.ToInt64()`。
3. **Win32 探针定位法**：先绕开 pywebview，用 EnumWindows 找到真 HWND 直接调
   `DwmSetWindowAttribute`（hr=0、读回偏好=2），证明 OS 侧可用，把问题锁定在
   pywebview 的句柄获取层——分层定位比盲改快。

## 三、诚实边界

- DWM 的圆角半径是**系统决定**（~8px），不是卡片的 26px——视觉是"Win11 原生窗口"
  而非"贴合卡片"；`region` 档可到 26px 但锯齿+无阴影，留作用户可选实验。
- API 是提示，**最大化/贴靠/VM 时按设计不圆**（官方文档明说）。
- "是否真的圆了"只能目检：日志记录的是"API 接受"（hr=0）。

## 四、验证

| 项 | 结果 |
|---|---|
| 真机（Win11 build 26200） | `面板窗口圆角=dwm` / `把手窗口圆角=dwm`（launcher.log）|
| Win32 探针 | hr=0、DwmGetWindowAttribute 读回 ROUND ✓ |
| 降级路径 | Win10 无属性 33 → 静默降级方形（代码路径覆盖） |
| 打包 | package + portable + exe 全过（含 window_style） |
| desktop ruff | 全绿 |

## 五、收尾状态

**Island V2 阶段 0–7 全部完成。** 新 exe 已就绪（含圆角 + 全部打磨），
等用户目检圆角观感——不满意可 `runtime/desktop-config.json` 或环境变量退回方形。
