# 阶段 7 开工前调研：原生圆角窗口实验 —— 2026-10-14

> 目标：Island 面板/把手的窗口**本体**圆角化（远期实验转正）。
> 红线回顾：`transparent=True` 不做（官方 Not supported on Windows + #1388 点击穿透）。

---

## 0. 检索台账

| # | 检索 query（原文） | 面 | 命中 |
|---|---|---|---|
| R1 | `DWMWA_WINDOW_CORNER_PREFERENCE frameless popup window Windows 11 rounded corners WebView2 winforms`（语义检索） | 外部 | **https://learn.microsoft.com/zh-cn/windows/apps/desktop/modernize/apply-rounded-corners**（官方：API 定义、适用条件、互斥约束）、https://stackoverflow.com/questions/15243463（WinForms P/Invoke 完整代码）、**https://github.com/MicrosoftDocs/windows-dev-docs/blob/docs/hub/apps/desktop/modernize/ui/apply-rounded-corners.md**（仓库面：官方文档源；关键细节——**最大化/贴靠/VM 时按设计不圆**；无框窗需 opt-in；DWM 三类判定）、https://www.bbccb.com/html/20260806/35979.html（无边框 + DWM 圆角 + HTCAPTION 组合实例）、https://umatechnology.org/how-to-enable-or-disable-rounded-corners-in-windows-11（"borderless/layered 可能被忽略"） |
| R2 | `pywebview transparent window Windows WebView2 rounded corners issues click-through`（上轮 master-plan 台账 R2，本轮沿用其结论作为红线依据） | Issues + **评论正文（in:comments 等价：读尽 #1388 与 WebView2Feedback#1004 全部评论）** | **https://github.com/r0x0r/pywebview/issues/1388**（transparent 点击穿透）、**https://gitmemories.com/index.php/MicrosoftEdge/WebView2Feedback/issues/1004**（未修，2025-10 仍追踪）、https://gitcode.csdn.net/69ddfc1254b52172bc699495.html（ClaudeWatch：SetWindowRgn 原生圆角先例） |
| R3 | `in:comments` 检索 `DWMWCP_ROUND frameless borderless not rounded ignored`（Issues/评论面） | Issues | **未找到独立 issue 讨论该组合**（官方文档即最权威来源，R1 的 GitHub 文档源覆盖）；相关评论证据沿用 R2（WebView2Feedback#1004 评论区）。如实标注：本主题在 issue 评论区无额外发现 |
| R4 | 代码面（本地 grep `backend/.venv/Lib/site-packages/webview`） | 代码 | pywebview 6.2.1：`window.native` → WinForms Form（`native.Handle` 可取 HWND）；实施中实测 **System.IntPtr 不支持 int() 直转**（TypeError）→ 必须 `ToInt64()`；诊断 print 在冻结版不可见 → 必须走 `_log` 通道 |

**Discussions / PR 面**：DWM 圆角是 Windows OS 能力（非库能力），无对应仓库 PR/Discussions 可考——如实标注；
核心结论来源为 **Microsoft Learn 官方文档**（最高置信）。

## 1. 关键事实（官方文档）

1. **官方 API**：`DwmSetWindowAttribute(hwnd, 33 /*CORNER_PREFERENCE*/, DWMWCP_ROUND=2, 4)` ——
   Windows 11 的正式选择加入机制；Win10 无此属性（返回错误码，需优雅降级）。
2. **互斥约束（重要）**：使用**窗口区域（SetWindowRgn）**或**每像素 alpha 分层**的窗口
   **无法**采用 DWM 圆角 —— 两条路线互斥，不能叠加。
3. **"适当时"才生效**：API 只是提示；部分 borderless/非标准窗口可能被系统忽略——
   无法可靠查询"是否真的圆了"，只能**运行时落日志 + 用户目检**。
4. 区域裁剪（SetWindowRgn）路线的已知代价（上轮调研 R2/ClaudeWatch）：**边缘锯齿**
   （无抗锯齿）+ 失去 DWM 阴影 + 缩放后需重设区域。

## 2. 方案（两档，互斥）

| 档 | 机制 | 视觉 | 代价 | 决策 |
|---|---|---|---|---|
| **dwm（默认）** | `DWMWCP_ROUND`，面板 + 把手都设 | Win11 原生圆角（系统半径 ~8px，非 26px）+ **保留阴影与抗锯齿** | Win10 无效（静默降级方形）；半径不可调 | **默认启用**，config 可关 |
| region（实验） | `CreateRoundRectRgn + SetWindowRgn`，半径=卡片 26px | 像素级贴合卡片圆角 | 锯齿 + 无阴影 + 缩放需重设 + 与 dwm 互斥 | 仅 `MINIPLANE_ISLAND_RGN=1` 时启用，实验性质 |

`none`：config `roundedWindow:false` 或 Win10 上 dwm 失败 → 保持方形（现状），静默降级。

## 3. 开工 checklist

1. `desktop/window_style.py`：`apply(window, mode, radius)` → 返回生效档（dwm/region/none）；
   `reapply_region(window)`（缩放结束重设区域）
2. `window_manager`：show 后 5s 的延迟线程应用（HWND 在 GUI 启动后才有效）；
   `end_window_drag` 在 region 档重设区域
3. config：`roundedWindow: true`（默认 dwm 档）；env `MINIPLANE_ISLAND_RGN=1` 切 region 档
4. 日志：`[island] 窗口圆角=dwm|region|none`（可观测，用户能从 launcher.log 看到档位）
5. 门禁 + 打包 + 产物冒烟（日志确认档位）→ commit/push/CI → 文档 + 记忆
