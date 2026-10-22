# Engineering Island V3 规格：单窗两态「工程浮页」

> 状态：**壳层已冻结**（2026-10-21，`feat/desktop-island-v3-shell` 落地）；
> 前端视觉重排（Blueprint Dock 细节）为下一周期，见 §9。
> 上游决策简报：`docs/research/2026-10-21-island-v3-preflight.md`（六面调研 + Spike 实测）。
> 本文取代 V2 规格中**窗口模型**部分（§1.1–§1.3）；信息设计（六问）、实时方案、
> 分阶段计划等未涉及的部分以 `docs/ISLAND_V2_SPEC.md` 为准。

---

## §0 定位

Island 是**当前工程状态的实时投影**：信息密度高、噪音低、默认不打扰。
V3 的设计方向（用户拍板，2026-10-21）：把 Island 做成**一张可收起 / 展开 / 固定在
桌面上的工程图纸**——触发把手窗口与完整面板窗口合并为单个可折叠原生窗口，
视觉从「多层圆角卡片」改为「细线分隔的统一纸面」，注入现代化科技感
（等宽字体仪表数据层 / 微标签体系），**不突破** Blueprint Editorial 红线
（`frontend/DESIGN.md` §3.3、§10）。

## §1 窗口模型：一个窗口，两种形态

| 形态 | 尺寸（DIP） | 内容 |
|---|---|---|
| `collapsed` | **360×44** | 把手条：标题 + 项目数 + LIVE 点 + 图钉 + 「展开」 |
| `expanded` | **520×420**（默认，可自由缩放） | 多项目总览（V2 一号位不变） |

- **窗口永不隐藏**。V2 靠「把手窗口常驻可见」兜底（pywebview 的窗口一旦隐藏就不再
  接收鼠标事件）；单窗化后这条约束自然消失——收起态就是把手段，不是隐藏。
- 两种形态经同一个路由 `/island-panel` 承载，用 `?form=collapsed|expanded` 区分首帧。
- 位置顶部居中为默认；用户拖动后的位置、展开态自由缩放的尺寸都记
  `runtime/desktop-config.json`，重启恢复（§4）。
- 尺寸单位一律 **DIP**（pywebview 创建/请求/自报全用 DIP，与 CSS 像素 1:1）。
  本机 125% DPI 下 Win32 `GetWindowRect` 返回物理像素（×1.25）——
  **规格按 DIP 书写，Python 侧不做 DPI 换算**（Spike 实测结论）。

### 1.1 已退役的东西

| V2 物件 | 退役原因 |
|---|---|
| 触发把手窗口（`/island-trigger` 路由、`create_trigger_window`、`triggerX` 配置键） | 收起态把手条就是入口；双窗有一条结构性裂缝——把手可见 ≠ 面板可见，两个窗口各持一份位置偏好，「记忆位置」永远是半对的 |
| `visibility`（hidden/expanded）与 `onboarded` 两个概念 | 折叠成单个 `form` 值：「表达过偏好」由 `form` 键是否存在表达，少一个布尔少一处漂移 |
| 运行期 `window.destroy()` | Spike 新坑 8：工作线程 `destroy()` 与 GUI 线程互等挂死（faulthandler 栈坐实）。关机走 `stop_services(hard_exit=True)`，进程没了窗口自然没了 |

## §2 状态机

两个状态，重启保留（存 `desktop-config.json`）：

    displayMode: auto_hide | pinned     （用户偏好）
    form:        collapsed  | expanded  （当前形态）

| displayMode | form | 用户看到什么 | toggle / Esc |
|---|---|---|---|
| auto_hide | collapsed | 顶部把手条 | → expanded |
| auto_hide | expanded | 完整面板 | → collapsed |
| pinned | expanded | 完整面板常驻 | 不收起（如实返回"已固定"） |

纯函数在 `desktop/config.py`（单测 `desktop/tests/test_island_config.py`）：

- `next_form(display_mode, form)`：pinned 恒 expanded；auto_hide 翻转。
- `esc_collapses(display_mode)`：仅 auto_hide。
- `restore_preferences()` 的 form 规则：pinned 恒展开 → 记过 form 按记住的来 →
  没记过（首启）默认展开（M1 默认首展：第一眼就看到完整面板）。

图钉语义（V2 阶段 2 延续）：`pin` → 恒展开；`unpin` → **不自动收起**
（"点了没变化"比"面板还在"更糟，收起交给用户自己点）。

## §3 折叠动画

Spike 实测裁定（2026-10-21，数据在决策简报 §10）：

- **15 步 × 16ms ease-out cubic**：实测收起 235ms / 展开 250ms，
  守住 DESIGN「动效 ≤400ms」红线；逐帧尺寸序列由纯函数
  `config.resize_schedule()` 生成（终点精确对齐、逐帧单调、首帧即动，
  单测钉死）。
- **左上锚定**：`resize(w, h, fix_point=FixPoint.NORTH|WEST)`——收起条向下展开、
  向上收起，窗口位置零漂移（Spike 量过锚点）。
- 动画跑在专用 daemon 线程（`mp-island-anim`），**不占住 pywebview 的 api 工作线程**；
  连续切换用**代际计数器**作废旧轮次（只认最新目标）。
- 动画进行中不持久化位置/尺寸——那是中间态，不是用户意图；
  用户手动拖动落盘有 0.25s 节流，松手时 `end_window_drag` 强制补最后一次。

## §4 持久化（`runtime/desktop-config.json`）

| 键 | 含义 | 说明 |
|---|---|---|
| `displayMode` | auto_hide / pinned | 非法值退回 auto_hide |
| `form` | collapsed / expanded | null = 未记录（首启） |
| `panelX` / `panelY` | 窗口位置（DIP） | 夹回屏幕内；null = 顶部居中 |
| `panelWidth` / `panelHeight` | 展开态尺寸 | 收起时**不**被 360×44 污染；null = 默认 520×420 |

写盘用临时文件 + `os.replace` 原子替换；读取任何异常都降级到默认值
（配置问题是降级，不是失败）。拖动落盘节流见 §3。

## §5 线程约束与关机路径

1. GUI 事件循环在主线程，`webview.start()` 阻塞在那里；所有窗口操作
   （resize/move）从非 GUI 线程进入（pywebview 的 api 调用天然在工作线程；
   动画在专用 daemon 线程）。
2. **运行期禁止 `destroy()`**（§1.1 坑 8）。关机通路：
   - 主力：`watch_main_window_gone(APP_TITLE, …, on_quit=stop_services(hard_exit=True))`
     —— Win32 按标题监视，主窗口消失即 taskkill 整棵树 + `os._exit(0)`；
   - 快路径：`events.closed`（Windows 上不触发，GUI 在子进程），回调里同样走
     `on_app_quit`，**不 destroy**。
3. Island 窗口被用户关掉（Alt+F4）≠ 退出应用：pywebview 不允许 `start()` 之后
   建窗，故本次会话 Island 退场，API 调用如实返回「已关闭，重启应用后恢复」，
   主窗口不受影响。

## §6 前端契约（`frontend/lib/desktopBridge.ts`）

`IslandState`：`{ registered, displayMode, form, pinned, expanded }`
（字段与 `WindowManager.island_state()` 一一对应）。

API：`toggle_island` / `expand_island` / `collapse_island` / `pin_island` /
`unpin_island` / `island_state` / `move_window_by(dx, dy)` /
`resize_window_by(edge, dx, dy)` / `end_window_drag()`。

形态管线的三条规则（`EngineeringIsland.tsx`，单测在
`frontend/tests/unit/island-logic.test.mts`）：

1. **首帧形态来自 URL** `?form=`（`resolveIslandForm`：只认小写原值，垃圾值落回
   默认展开——URL 是用户可见可篡改的，宁可退回默认也不渲染四不像）；
2. **Python 是事实来源**：挂载即 `readIslandState()` 对账；
3. **乐观切换 + 对账**：用户操作先翻本地形态，Python 返回值到了再纠正；
   pinned 下的乐观收起被抑制（避免"闪一下又弹回"），护栏在 Python 侧。

收起态把手条（`IslandDockBar`）：整条是拖动区（pointer capture 桥接，
按钮不参与防误拖）；点空白处或「展开」→ toggle；图钉只在桌面面板渲染
（浏览器里没有桥，点了没反应比没有更糟）。

## §7 已知坑（摘要，全文在决策简报 §4）

1. `min_size` 必须显式给足——pywebview 默认 (200, 100)，不给就把 44px 把手条夹成 100px；
2. `create_window` 参数名是 `easy_drag`（不是 `draggable`），写错静默不可拖；
3. frameless 不可原生缩放，缩放手势必须页面侧（M3 热区桥接）；
4. 工作线程 `destroy()` 挂死（§1.1）；
5. pywebview 6.2.1 未复现 #1855 尺寸偏差，但 `GetWindowRect` 是物理像素（DIP ≠ 物理）；
6. 一次进程只能 `start()` 一次；窗口必须先登记再启动；
7. `start()` 要等所有窗口关闭才返回——只关主窗口不退服务，就是"界面关了后台还在跑"。

## §8 验收清单

**壳层（本周期，已过）**：ruff check/format（desktop/）+ 13/7 两条单测文件全绿 +
前端四绿（143 单测 / typecheck / lint / build）+ `/island-trigger` 路由移除。

**真机冒烟（壳层 + 前端视觉重排完成后，重建 exe 执行）**：

1. 启动 → 首启默认展开（520×420）；`?form=collapsed` 恢复时以 360×44 把手条回来；
2. 点把手条 / Alt+I → 250ms 内平滑展开，锚点零漂移；Esc / 再点 → 平滑收起；
3. 拖动把手条改变位置 → 展开从新位置长出；重启后位置/形态/固定态全部恢复；
4. 展开态手动缩放 → 收起 → 展开，回到缩放后的尺寸（不是默认 520×420）；
5. 图钉固定后 toggle/Esc 不收起；取消固定不自动收起；
6. 关主窗口 → 后端 / 前端 / 端口全部退出（`verify_quit` 同款断言）；
7. 关 Island 窗口 → 主窗口照常，API 返回「已关闭」不抛错。

## §9 非目标与下一周期

- **不做**：圆角/阴影/字体的最终视觉（下一周期「Blueprint Dock 细节」：
  项目卡 0px 细线分隔、JetBrains Mono 仪表数据层、微标签体系、信息三层优先级）；
- **不做**：overview WebSocket 覆盖全部项目的 Phase 4 方案（沿用 V2 阶段 4 现状）；
- **不做**：自动收起（失焦自动折叠）——未在需求内，不加。
