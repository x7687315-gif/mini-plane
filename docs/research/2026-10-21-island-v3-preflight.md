# Island V3「工程浮页」开工前决策简报（github-preflight）

> 背景：用户已拍板采用外部建议的方向 A —— **Blueprint Dock 工程浮页**：
> 保留 Engineering Island 的产品定位与数据/实时同步架构，但把「把手窗口 + 面板窗口」
> 合并为**单个可折叠原生窗口**，视觉从「多层圆角卡片」改为「一张可收起展开的工程图纸」，
> 并注入现代化科技感（对标 GPT / Grok / Gemini 的界面气质），同时守住 Blueprint Editorial 红线。
> 本简报只做开工前侦察：给选项、给坑、给链接。**拍板权在用户。**

---

## 0. 检索台账（证据，必填）

| # | 查询原文 | 检索面 / 工具 | 命中数 | 采用的 URL |
|---|---------|--------------|-------|-----------|
| 1 | `github "dynamic island" desktop app windows floating widget always on top repo` | repos / web | 5 | https://github.com/khanhlabs/DynamicIsland ；https://github.com/warpirate/pillar-dynamic-island-for-windows ；https://hysenlabs.com/projects/jntmtmtm-eisland |
| 2 | `pywebview resize window dynamically collapse expand single window frameless` | code / web | 5 | https://pywebview.idepy.com/en/guide/api ；https://deepwiki.com/r0x0r/pywebview/5-window-management ；https://www.github.com/r0x0r/pywebview/discussions/1591 |
| 3 | `pywebview issue windows resize frameless always on top flicker problem winforms` | issues / web | 5 | https://github.com/r0x0r/pywebview/issues/1855 ；https://github.com/r0x0r/pywebview/issues/1857 |
| 4 | `pywebview discussion animate window resize smooth height transition expand collapse window animation` | discussions / web | 5 | https://pywebview.flowrl.com/examples/resize ；https://pywebview.flowrl.com/guide/usage.html |
| 5 | `ChatGPT Grok Gemini UI design language analysis 2026 minimal interface typography what makes it feel modern` | 外部 / web | 5 | https://designsorcery.com/sites/grok-com ；https://www.androidheadlines.com/2026/05/google-gemini-new-ui-rollout-overlay-gradients-pulsing.html ；https://en.androidsis.com/analysis-of-the-Gemini-interface-redesign/ ；https://www.androidauthority.com/gemini-new-design-makes-me-worried-future-of-android-ui-3677170/ |
| 6 | `search_and_install_skills: UI visual design redesign modern interface / design system style guide / frontend visual polish aesthetics` | skills 市场 | 4 | 见 §9 技能调研 |
| 7 | `in:comments` 挖掘：WebFetch 全文抽取 r0x0r/pywebview discussion #1591 的**全部评论** | discussions(评论正文) | 4 条评论 | https://www.github.com/r0x0r/pywebview/discussions/1591 ；评论区 linked repo：https://github.com/unigrated-solutions/example-pywebview-nicegui-tray |

本地实测（非检索，事实基线）：
- `backend/.venv` 内 pywebview **6.2.1**；`Window.resize(width, height, fix_point=FixPoint.NORTH|FixPoint.WEST)` **已支持**（`inspect.signature` 实测），`FixPoint` 四向枚举齐全。
- `desktop/island.py` / `window_manager.py` / `window_style.py` / `config.py` 与 `frontend/components/engineering-island/`（1069 行）现状已核对（见 §1）。

---

## 1. 待决策点（这次要定什么）

方向 A 已定，剩下三个**可独立决策**的点：

1. **单窗折叠的实现路线**：`resize(fix_point)` 渐进缩放 vs CSS 假折叠（窗口不动、内容缩放）vs 维持双窗只统一视觉（=原建议里的 C，已被用户排除）。
2. **「科技感」的注入范围**：在 Blueprint Editorial 红线内（禁渐变/毛玻璃/霓虹/暗色模式）能加到什么程度——是只加等宽字体数据层，还是连信息密度与微标签体系一起改。
3. **装哪些设计 skills**（见 §9，待用户勾选后才安装）。

约束条件（既定）：
- 技术栈：Python 3.12 + pywebview 6.2.1（WinForms/EdgeChromium）+ Next.js 16 + React 19；
- 设计红线：`frontend/DESIGN.md` §10（无组件库/图标库、无暗色模式、无渐变阴影毛玻璃、动效 ≤400ms、不用 spinner）；
- 非功能：必须真机可验（桌面冒烟要验数据，10-17 热修的教训）；改动分阶段独立提交，窗口生命周期与数据逻辑不混在一个提交。

---

## 2. 可选方向（核心）

### 2.1 单窗折叠实现路线

| 方向 | 做法概要 | 适用条件 | 代价 / 风险 | 原始来源 | 置信度 |
|------|---------|---------|-----------|---------|--------|
| A1. `resize()` 渐进缩放（推荐） | 收起/展开 = 同一窗口 `resize(w,h, fix_point=NORTH\|WEST)` 多步逼近目标高度（~15 步 × 16ms ≈ 250ms，守住 ≤400ms 动效红线）；JS 侧 pointer capture 发增量，Python 侧自算（复用现有 `move_window_by` 同款节流桥接） | pywebview ≥5.x；WinForms 后端 | 每步 resize 有系统开销，低端机可能掉帧；frameless 尺寸存在实测偏差（见 §4 坑 1）；需处理动画中用户反手拖动 | pywebview API 文档 + DeepWiki（`resize(fix_point)` 默认左上锚定，正是「向下展开」所需） | ★★ |
| A2. CSS 假折叠 | 窗口尺寸固定为展开态，收起时内容 `transform: scale()` + `opacity` 缩成标题条 | 想完全避开原生 resize 的坑 | 「收起」时窗口仍占整块区域 → 鼠标穿透不了背后的应用，违背「自动隐藏不打扰」的初衷；Win11 上 frameless 命中测试由子窗口回答，穿透不可靠 | 无直接来源（基于 pywebview #1855 评论「web content child window answers the hit test」推导），标**待验证** | ★ |
| A3. 双窗保留只统一视觉 | 保留把手 + 面板两窗，统一圆角/底色/标题栏 | 想零窗口生命周期风险 | 用户已明确排除（「不能从根本上消除多个窗口之间的割裂感」） | 用户提供的外部建议（方向 C） | —（已排除） |

### 2.2 「科技感」注入范围（都在红线内）

| 方向 | 做法概要 | 代价 / 风险 | 原始来源 | 置信度 |
|------|---------|-----------|---------|--------|
| D1. 等宽字体数据层（推荐，最小步） | 把已在项目里的 **JetBrains Mono**（DESIGN.md §2.1 现仅用于 trace ID/commit hash）提升为 Island 的「仪表数据」字体：NOW/STEP/HOW/NEXT/百分比/时间戳/AGENT 状态一律 mono + `tabular-nums`；标题与叙述保持 Inter。收起条也用它 | 几乎零风险；不新增字体文件（已加载） | Grok 设计拆解：「IBM Plex Mono 用于技术/机器生成内容」是其科技感的核心信号 | ★★ |
| D2. 仪表盘微标签体系 | 全大写 + letterspacing 的 micro-label（`NOW` `STEP` `HOW` `NEXT` `DONE` `AGENT`），细线分隔代替卡片，钴蓝只标「进行中/运行中」 | 信息密度上升，需防「字段打架」——外部建议已定优先级三层（现发生了什么 > 如何推进 > 细节） | Gemini 改版教训（外部）：控件搬家/字重过薄会伤害熟悉感——微标签体系**不搬动**现有字段位置，只改表达 | ★★ |
| D3. 单色高对比 + 单一强调色 | 近黑 `#1B1A17` 文字 + 纸色底 + 钴蓝单一强调，去掉 Island 现有的圆角容器阴影 | 与 D1/D2 叠加才见效；单独做变化太微 | Grok：「#050505/#fcfcfc 20:1 对比 + 唯一彩色强调 #e76113」的结构同构 | ★★ |
| D4. 渐变/液态玻璃/脉冲动画 | Gemini 2026 改版路线 | **撞红线**（DESIGN.md §10 禁渐变/毛玻璃/霓虹；动效 ≤400ms）。仅记录为「用户若想突破红线需先改 DESIGN.md」的选项 | https://www.androidheadlines.com/2026/05/google-gemini-new-ui-rollout-overlay-gradients-pulsing.html | ★（合规冲突） |

---

## 3. 倾向与理由

- **实现走 A1**：`resize(fix_point)` 在已安装的 pywebview 6.2.1 上实测可用，是「同一窗口两种形态」唯一不骗人的路线（A2 的收起态挡鼠标、A3 已被否）。掉帧风险用「步长自适应 + 可一键关动画」兜底。
- **设计走 D1+D2+D3 组合**：科技感的主要载体是**字体角色分工 + 信息密度 + 单一强调色**，不是材质特效。这既贴 Grok 的可验证手法，又完全不碰 DESIGN.md 红线——**不需要修改 §3.3 的 Island 大圆角例外的合法性，只需要把例外数值从 26px 改到 4–8px**（这正是外部建议的修订点）。
- 若用户后续想要更强的「未来感」（暗色/玻璃），那是**先改 DESIGN.md 再动 Island**的独立决策，不建议本次夹带。

---

## 4. 已知坑与 workaround

| 坑 | 现象 | workaround | 来源 |
|----|------|-----------|------|
| 1. frameless 窗口尺寸偏差 | 请求 1280×820，实测 1264×781（Win10 22H2 实测） | 展开/收起的目标尺寸**不能信请求值**：动画结束后回读 `window.width/height` 并夹回持久化；修复 PR #1858 已存在但**是否进了 6.2.1 待验证** | https://github.com/r0x0r/pywebview/issues/1855 （PR 拆分见 issue 正文评论区） |
| 2. frameless 丢失贴靠与 Win+方向键 | 无边框窗失去系统贴靠；Win+Up 连任务栏一起盖 | pywebview 侧提案 `KEEP_FRAME_STYLES`（保留 WS_THICKFRAME + WM_NCCALCSIZE 返回 0）——**上游未合入，勿等**； Island 是置顶小窗，贴靠丢失可接受，但要在验收清单里写明「已知不支持」 | https://github.com/r0x0r/pywebview/issues/1857 |
| 3. frameless 无原生缩放手柄 | WebView2 子窗口包办整个客户区命中测试，顶窗永远收不到 HTCAPTION 边缘带；**维护者在 discussion #1591 评论区原话："Frameless windows are not resizable"**（该需求反复被提但上游不做） | 缩放手柄必须**页面侧**自绘（项目 M3 已实现 JS pointer capture + 桥接，可直接复用给展开态） | https://github.com/r0x0r/pywebview/issues/1855 评论区 + https://www.github.com/r0x0r/pywebview/discussions/1591 评论区 |
| 4. `min_size` 默认值陷阱 | pywebview 默认 `(200,100)`，小窗会被夹大 | 本项目 10-13 真机已踩并显式给 `min_size`（见 `island.py` 注释）；V3 收起态高度 <100 时**必须重设 min_size**，否则收起动画被夹断 | `desktop/island.py:144-148`（项目内实证） |
| 5. region 圆角不跟随缩放 | `SetWindowRgn` 区域在窗口 resize 后不更新 | 项目阶段 7 已有 `reapply_region`；V3 若保留 region 实验档，resize 动画每步都要重设区域（性能差）→ **建议 V3 默认只用 dwm 档**，region 档冻结 | `desktop/window_style.py:89-107` |
| 6. 收起态窗口仍可被 Alt+F4 | 无边框窗也收 Alt+F4 | 现有 `_on_island_closed` 已处理（退回隐藏式而非退出）；V3 单窗化后语义变为「关闭 = 收起」 | `desktop/window_manager.py:134-137` |
| 7. Gemini 式改版的熟悉感代价 | 搬动常用控件、字重过薄，被媒体与社区批评 | V3 **不搬动** Island 现有字段与按钮语义（图钉/收起/主程序入口位置保持），只改视觉表达与窗口形态 | https://www.androidauthority.com/gemini-new-design-makes-me-worried-future-of-android-ui-3677170/ |

---

## 5. 可选实现参考（供深挖，不是必选）

| 名称 | 类型 | 对口方向 | 来源链接 | 注意（License / 维护度） |
|------|------|---------|---------|------------------------|
| khanhlabs/DynamicIsland | 同类产品（Tauri+React） | A1 交互模型：**悬停展开、移出收起、位置记忆、全局快捷键、托盘控制**——单窗两态的原型参照 | https://github.com/khanhlabs/DynamicIsland | Tauri 非 pywebview，只借鉴交互；2026-09 活跃 |
| warpirate/PILLAR | 同类产品（Tauri 2+Rust，~3MB） | A1：「hover to peek, click to expand」单胶囊两态；任务/notes/agenda 的信息组织可参照 | https://github.com/warpirate/pillar-dynamic-island-for-windows | 同上，仅交互参考 |
| JNTMTMTM/eIsland | 同类产品（Electron+React，~320★） | A1：六屏一岛的模块化组织 | https://hysenlabs.com/projects/jntmtmtm-eisland | **GPL-3.0 + 禁 macOS 移植条款**——只读思路，勿拷代码 |
| pywebview discussions #1591 | 代码样板 | A1/A2 的 JS resize handles 注入式实现（`evaluate_js` 注入 CSS+JS） | https://www.github.com/r0x0r/pywebview/discussions/1591 | 社区方案，作者自承 "totally gross"；项目已有更干净的 M3 桥接，优先复用 |
| unigrated-solutions/example-pywebview-nicegui-tray | 示例应用（评论 linked） | 页面侧三向 resize handles（left/right/bottom 6px）+ set_bounds 桥接 + 托盘，最接近 V3 展开态缩放需求的完整可读实现 | https://github.com/unigrated-solutions/example-pywebview-nicegui-tray | 从 #1591 评论区挖到；含作者自用复杂度（OS 通知/托盘），只取缩放部分；维护度**待验证** |
| pywebview Frameless boilerplate | boilerplate | 无边框拖拽+缩放 | https://awesomeopensource.com/project/DizzyduckAR/pywebview-Frameless-boilerplate | StackOverflow 答主推荐；未验证维护度，标**待验证** |

---

## 6. 参考论文 / 文档 / awesome

- pywebview 官方 API（`create_window` 全参数、`min_size` 默认值实证）：https://pywebview.idepy.com/en/guide/api
- pywebview 窗口管理全景（`resize(fix_point)`、`@_shown_call` 语义、属性等待事件）：https://deepwiki.com/r0x0r/pywebview/5-window-management
- Grok 设计系统拆解（等宽字体=技术内容、单一强调色、0/4px 实用半径）：https://designsorcery.com/sites/grok-com
- Gemini 2026 改版报道（渐变脉冲/液态玻璃——红线外，仅作对照）：https://www.androidheadlines.com/2026/05/google-gemini-new-ui-rollout-overlay-gradients-pulsing.html
- AI 产品 UX 模式库（shape of AI）：https://www.shapeof.ai/
- 项目内既有：`docs/research/2026-10-14-phase7-rounded-window-preflight.md`（DWM/region 互斥的微软官方约束）

---

## 7. 风险与下一步 checklist

- [ ] **用户确认**：A1 路线 + D1/D2/D3 设计组合 + §9 技能勾选（本简报等这个确认）
- [ ] **Spike 1（动手前必做）**：真机量 frameless 尺寸偏差——请求 1280×820 后 `GetWindowRect` 回读，确认 6.2.1 是否已含 #1858 修复；据此决定「目标尺寸回读夹取」逻辑
- [ ] **Spike 2**：`resize(fix_point)` 在 15 步 ×16ms 动画下的帧率实测（本机 + 125%/150% 显示缩放各一轮）
- [ ] 修订 `frontend/DESIGN.md` §3.3：Island 圆角例外 22–30px → **4–8px**；补「等宽字体=仪表数据层」条款
- [ ] `desktop/config.py` 持久化补 `panelWidth` / `panelHeight`（外部建议点名：自由缩放要记忆尺寸）
- [ ] 窗口壳改动与前端视觉改动**分两个独立提交**（外部建议 + 项目铁律）
- [ ] 桌面冒烟必须验数据：mine/ 200 + 面板两态切换 + 重启恢复位置/尺寸/固定态（10-17「只验窗口放跑 500」的教训）
- [ ] License 核对：eIsland 为 GPL-3.0，**不拷代码只读思路**（本简报已按此处理）

---

## 8. 来源汇总

- 仓库：https://github.com/khanhlabs/DynamicIsland ；https://github.com/warpirate/pillar-dynamic-island-for-windows ；https://hysenlabs.com/projects/jntmtmtm-eisland
- Issues / Discussions（含评论）：https://github.com/r0x0r/pywebview/issues/1855 ；https://github.com/r0x0r/pywebview/issues/1857 ；https://www.github.com/r0x0r/pywebview/discussions/1591 （评论区挖出 WindowAPI 完整实现 + linked 示例仓库）
- 代码样板 / 示例应用：https://github.com/unigrated-solutions/example-pywebview-nicegui-tray ；https://awesomeopensource.com/project/DizzyduckAR/pywebview-Frameless-boilerplate
- 文档：https://pywebview.idepy.com/en/guide/api ；https://deepwiki.com/r0x0r/pywebview/5-window-management ；https://pywebview.flowrl.com/examples/resize
- 设计分析：https://designsorcery.com/sites/grok-com ；https://www.androidauthority.com/gemini-new-design-makes-me-worried-future-of-android-ui-3677170/ ；https://www.shapeof.ai/

---

## 10. Spike 实测结果（2026-10-21 当晚，`desktop/verify_island_v3_spike.py`）

真机环境：Windows 11 build 26200 · pywebview 6.2.1（backend/.venv）· **DPI 120（125% 显示缩放）**。
完整数据：`C:\temp\island_v3_spike.json`（本仓库只留脚本，数据留机）。

| 测项 | 请求（DIP） | pywebview 自报 | Win32 物理矩形 | 结论 |
|------|------------|---------------|---------------|------|
| A · 默认 min_size 陷阱 | 360×44 | 360×**100** | 450×125 | **坑 4 真机确认**：被 pywebview 默认 min_size=(200,100) 夹断 |
| B · #1855 偏差探测 | 1280×820 | **1280×820** | 1600×1025 | **偏差未复现**：#1858 修复已在 6.2.1；1600/1.25=1280 换算吻合 |
| B · 收起态 | 360×44 | **360×44** | 450×55 | 显式 `min_size=(360,44)` 生效，收起条不被夹断 |
| B · 展开动画 | 360×44→520×420 | 读回 520×420 | 650×525 | **235ms**（15 步×16ms+ease-out cubic），单步最大 16ms、均值 4.13ms |
| B · 收起动画 | 520×420→360×44 | 读回 360×44 | 450×55 | **250ms**，单步最大 16ms、均值 2.13ms |
| B · 锚点稳定性 | — | — | — | 两次动画起点/终点均为 **(620,200) 零漂移**，FixPoint.NORTH\|WEST 行为符合预期 |

**对 §7 checklist 的裁定**：
- ✅ **Spike 1 通过**：#1855 偏差在 6.2.1 不存在，「目标尺寸回读夹取」逻辑仍建议做（防御性），但不再是硬前提；
- ✅ **Spike 2 通过**：15 步 × 16ms 总时长 235–250ms，单步开销可忽略（均值 2–4ms），
  动画成本主要是 sleep 量化而非 resize 本身；125% 缩放下未测掉帧（视觉层面留待真机目检）；
- ⚠️ **坐标系统一为 DIP**：pywebview 全链路（创建/请求/自报）用 DIP，Win32 GetWindowRect 给物理像素
  （×1.25）。V3 的尺寸规格、持久化、动画目标值**全部按 DIP 书写**，与 CSS 像素 1:1。

**新发现的坑（简报外，2026-10-21 实测）**：

| 坑 | 现象 | workaround | 来源 |
|----|------|-----------|------|
| 8. 工作线程 `destroy()` 挂死 | 从 pywebview 工作线程（JS API/start 的 func 线程）调 `window.destroy()`：主线程卡在 `create_window` 事件循环、worker 卡在 `destroy_window`，互等至死（faulthandler 90s 强退才脱出） | **运行期不 destroy 任何 Island 窗口**——V3 单窗化后天然只有「常驻 + resize」两种操作，正好绕开；关机沿用项目既有 `os._exit(0)` 路径（`launcher.py` 已这么做） | 本 Spike 实测（winforms.py:808/834/1041 栈） |
| 9. `start()` 只在全部窗口关闭后返回 | 窗口常驻 → `start()` 永不返回 → 其后的代码不会执行 | 需要「测完即退」的逻辑放 start 的 func 线程末尾 + `os._exit(0)`；产品侧无此问题（事件循环本该常驻） | 本 Spike 实测 + pywebview 源码 `__init__.py:243` |

---

## 11. 设计 skills 调研（用户已勾选，2026-10-21 当晚安装完毕）

本地**已装**（无需重复）：`design-master`（央美博导·设计大师）、`设计品味-前端`、`ui-design-system`（专业 UI 生成与优化）。
**本次新装**：`ui-interface-design`（UI设计）+ `impeccable`（前端设计工具集）——用户确认装这两个。
未装（与已装重叠）：`ui-ux-design-system`、`ui-ux-design-pro-skill`。
