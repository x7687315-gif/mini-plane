# Island V2 总体落地规划（长期版 · 2026-10-14）

> 把已完成的阶段 0–3、阶段 2 的 UX 遗留问题、阶段 4 实时闭环、以及"界面/操作手感做全面">   
> 合并成**一张长期路线图**。本文是唯一规~~划~~源；各阶段的执行细节看对应的 devlog 与规格。>   
> 调研台账见 §6（本轮新增检索 3 组，全部带链接）。

---

## 一、现状盘点（截至 2026-10-14）

| 阶段         | 状态       | 提交        | 说明                                          |
| ---------- | -------- | --------- | ------------------------------------------- |
| 0 规格冻结     | ✅        | `6aa45fc` | `docs/ISLAND_V2_SPEC.md`（§7.2 已按 C-lite 修订） |
| 1 多项目总览 UI | ✅        | `33ade82` | 总览组件 + 诚实占位 + E2E 6 条                       |
| 2 桌面隐藏/固定  | ✅（带遗留）   | `2dd37d5` | 把手/图钉/配置持久化；**遗留 UX 问题见下**                  |
| 3 后端数据     | ✅        | `8c16ed5` | AgentSession 四字段 + progress 端点 + mine/ 扩充   |
| 4 实时闭环     | 📋 清单已评审 | —         | C-lite（订阅协议 + 权限重校验 + 心跳）                   |
| 5 回归交付     | ⏳        | —         |                                             |
| 6 打磨       | 🆕 本次新增  | —         |                                             |

**阶段 2 实测暴露的四个 UX 问题**（诊断：`docs/devlog/2026-10-14-island-handle-diagnosis.md`）：

1. **启动只见一根 140×14 的细线**（把手），完整面板默认藏起 —— 与用户心智模型冲突；
2. **面板拖不动**：`easy_drag` 在 Windows 后端是空操作（源码证实：winforms.py 无实现）；
3. **面板缩放存疑**：无边框窗没有系统缩放边，`resizable=True` 大概率不起作用（待实测）；
4. **"点击把手→展开"缺一锤定音的证据**（结果日志已补，待用户下次实测）。

## 二、本轮调研结论（回答"操作手感怎么补全"）

### 2.1 拖动：两条成熟路线（都有生产实践）

| 路线                    | 做法                                                                                             | 优                                                 | 劣                            |
| --------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------- |
| **A. JS 驱动 move**     | 页眉 mousedown → mousemove 事件里调 `pywebview.api.move_window(dx,dy)` → Python `window.move(x,y)`   | 实现直白；跨平台                                          | 每次 mousemove 一次桥接调用（高频）      |
| **B. Win32 原生拖放（推荐）** | 页眉 mousedown → 桥接一次 → Python 用 ctypes 发 `WM_NCLBUTTONDOWN(WM_NCLBUTTONDOWN=0xA1, HTCAPTION=2)` | **系统级流畅**（进入 OS 自己的拖动循环，零桥接开销）；连双击最大化等标题栏行为都能免费获得 | Windows 专属（本项目桌面版只跑 Windows） |

来源：掘金 pywebview 窗口移动方案（路线 A 完整代码）、XDir 项目（deepwiki，路线 B：  
`drag_window` 用 `WM_NCLBUTTONDOWN+HTCAPTION`，**还实现了边缘 resize hitboxes**  
发 `WM_SYSCOMMAND`）。  
**依赖确认**：pywebview 6.2.1 的 `Window.move(x,y)` / `Window.resize(w,h,fix_point)`  
在 winforms 后端**都有实现**（`platforms/winforms.py:600-620`）——两条路线的地基都在。

### 2.2 缩放：无边框窗**没有**系统缩放边

XDir 的做法是**自绘边缘 resize hitboxes**（鼠标贴边 6px → 发 `WM_SYSCOMMAND` 对应  
边缘参数）。我们要"自由拉尺寸"就必须做这个；好消息是和拖动共用同一套桥接。

### 2.3 透明/圆角窗口：**红线，不做** ❌

- pywebview 官方文档明确：`transparent` — "**Not supported on Windows**"；
- pywebview#1388：`transparent=True` 时**点击穿透**（点哪都穿到下面的窗口）——    
  对一个要交互的面板是致命的；WebView2Feedback#1004 至今未修（2025-10 仍在追踪）；
- GitCode 案例：Win11 下透明还涉及 hide/show 时序 hack、WndProc 钩子。

**结论**：维持现状——方形窗口 + 内部 26px 圆角卡片 + 纸色底。视觉上的"悬浮感"改用  
**原生窗口阴影**：`create_window(shadow=True)`（pywebview 官方参数，Windows only，  
我们目前没开）。真正的原生圆角裁剪（Win32 `SetWindowRgn`，ClaudeWatch 案例）列为  
远期实验，不进任何近期阶段。

### 2.4 顺手可得的两个官方能力

- `shadow=True`：原生窗口阴影（一行参数）；
- `window.resize(w, h, fix_point)`：程序化缩放（可用于"内容自适应尺寸"，ClaudeWatch    
  同款思路——前端算出内容高度反调 resize；列为远期可选项）。

## 三、修订后的路线图（长期项目节奏）

### 阶段 2.5：悬浮窗交互补全（**下一个执行**，先于阶段 4）

> 理由：用户实测基线必须先稳住，否则阶段 4 的"无刷新更新"验收没有可信的观察面。

| 项        | 内容                                                     | 验收                                      |
| -------- | ------------------------------------------------------ | --------------------------------------- |
| M1 默认首展  | 首次启动（用户从未动过图钉）`visibility=expanded`；收起/固定后记住偏好         | 双击 exe 第一眼即见完整面板                        |
| M2 把手加大  | 140×14 → **200×32**，"工程 Island"文字常显（不只 hover）          | 不 hover 也能认出这是入口                        |
| M3a 面板拖动 | 页眉作为拖动区，路线 B（`WM_NCLBUTTONDOWN+HTCAPTION`，一次桥接进系统拖动循环） | 按住页眉可把面板拖到任意位置；位置持久化（已有 `events.moved`） |
| M3b 面板缩放 | 边缘 resize hitboxes（`WM_SYSCOMMAND`，四边 + 四角）            | 鼠标贴边出现缩放光标，可自由拉尺寸                       |
| M3c 原生阴影 | `create_window(shadow=True)`                           | 面板与桌面有层次感                               |
| 回归       | 把手点击收起/展开（结果日志判定）；关窗全退；配置持久化                           | 全部沿用阶段 2 验收                             |

提交切分：M1+M2 一个 commit（纯参数/默认值），M3 一个 commit（新桥接），各自可回退。

### 阶段 4：跨项目实时闭环（清单已评审，顺序不变）

C-lite：订阅协议 + 权限重校验 + 心跳（30s/90s）。唯一调整：**做完 2.5 再开工**，  
且 M3 的窗口桥接（move_window）与实时层的 JS 桥接共存于同一个 `DesktopApi`。

### 阶段 5：回归与交付（不变）

单测/E2E 更新、`package.py + build.py` 打包并核实产物、README/使用指南。

### 阶段 6：界面/动效/操作手感打磨（新增）

候选清单（守 DESIGN.md 红线：150–250ms、无渐变、reduced-motion）：  
卡片展开动画、进度条平滑过渡、AGENT 状态脉冲强化、空态插画、把手 hover 物理感、  
**内容自适应尺寸**（前端算高度反调 `resize()`）。开工前单独做一轮小调研。

### 阶段 7（远期实验）：原生圆角窗口

Win32 `SetWindowRgn` 裁剪（ClaudeWatch 案例）。深入 Win32，非必需，仅在阶段 6 之后  
仍对视觉不满意时立项。

## 四、技术红线（本轮确认，写进规格）

1. **不用 `transparent=True`**：Windows 不支持 + 点击穿透（#1388 / WebView2Feedback#1004）；
2. 拖动/缩放优先 **Win32 原生消息**（HTCAPTION / WM_SYSCOMMAND），桥接次数最少；
3. 窗口位置/尺寸的持久化沿用 `events.moved`（已实现）；
4. 所有窗口 API 调用保持可观测（`set_notify` → launcher.log）。

## 五、给用户的验证点（2.5 完成后）

1. 双击 exe → **直接看到完整面板**（不再是细线）；
2. 按住面板页眉 → 能拖到任意位置；松手后重启，位置保持；
3. 鼠标贴面板边缘 → 能自由拉尺寸；
4. 点把手/按 Esc → 收起成把手；再点 → 展开（launcher.log 出现     
   `[island] 面板已展开/已收起`）；
5. 图钉固定 → 面板常驻；重启后记住。

## 0. 检索台账（本轮新增 · 语义检索 + 评论正文检索已执行）

| #  | query（原文）                                                                                                                                                                                           | 命中                                                                                                                                                                                                                                                                                                                                                                                               |
| -- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1 | `pywebview frameless window drag move javascript mousedown api move_window Windows example`（语义检索：自然语言整句）                                                                                            | **<https://juejin.cn/post/7584730308751835186\*\*（路线> A 完整代码）、**<https://deepwiki.com/notvikke/XDir/2.2-windowapi-native-bridge\*\*（路线> B：WM_NCLBUTTONDOWN+HTCAPTION + 边缘 resize hitboxes）、<https://pywebview532.idepy.com/guide/api（move/resize/native）>                                                                                                                                        |
| R2 | `pywebview transparent window Windows WebView2 rounded corners issues click-through`（语义检索）+ 评论正文（**in:comments** 等价：读尽 #1388 与 WebView2Feedback#1004 全部评论，评论者 champnic/ItsCubeTime/gaetandezeiraud） | **<https://pywebview.idepy.com/en/guide/api\*\*（官方：transparent> — Not supported on Windows）、**<https://github.com/r0x0r/pywebview/issues/1388\*\*（点击穿透）、\*\*https://gitmemories.com/index.php/MicrosoftEdge/WebView2Feedback/issues/1004\*\*（未修，2025-10> 仍追踪）、<https://gitcode.csdn.net/69ddfc1254b52172bc699495.html（ClaudeWatch：SetLayeredWindowAttributes> + SetWindowRgn + api.resize 内容自适应） |
| R3 | 代码面（本地依赖源码 grep，等价 `path:` 结构检索）                                                                                                                                                                    | pywebview 6.2.1；`window.py:376 resize / :419 move`；`platforms/winforms.py:600-620` 两者的 Windows 实现；`:782` transparent 的 chromium hack；`shadow` 参数 Windows only                                                                                                                                                                                                                                    |

> 上轮台账（Q1–Q7，六面全覆盖）见 `docs/research/2026-10-14-overview-websocket-preflight.md`。

### 补充说明（六面覆盖）

- **仓库面**：<https://github.com/andrewgodwin/channels-examples（官方示例）、https://gitlab.com/baserow/baserow（生产级同构）、https://github.com/notvikke/XDir（无边框拖放+缩放> hitboxes 完整实现）
- **Discussions / PR 面**：channels 仓库未开 Discussions（forum.djangoproject.com 即官方讨论区，上轮台账 Q3 已覆盖）；本轮调研涉及的仓库未发现直接相关的已合并 PR——如实标注
- 上轮完整台账（Q1–Q7）：见 `docs/research/2026-10-14-overview-websocket-preflight.md` §0
