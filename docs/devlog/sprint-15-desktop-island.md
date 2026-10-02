# Sprint 15 — Desktop Island（v0.9.0）

> 日期：2026-10-03 · 基线：`deb22cd` → 本 Sprint 产出见文末
> 产品事实源：[`docs/PRODUCT_REFACTOR_PLAN.md`](../PRODUCT_REFACTOR_PLAN.md) §Sprint 15
> 前一阶段：[`sprint-14-engineering-island.md`](sprint-14-engineering-island.md)

---

## 一、这一阶段做了什么

把 Island 从「浏览器里的一个页面」变成**桌面上的一个独立窗口**：

- **主窗口照旧**（1280×820，含 AppShell 全套）
- **Island 窗口**：置顶、无边框可拖、顶部居中、**隐藏启动**，`Alt+I` 或界面里的「独立窗口」按钮唤出
- 两个窗口**共享当前图纸**：在任一窗口翻页，另一窗口立刻跟着翻
- 数据同步**复用既有 WebSocket 广播**（`issue.updated` / `comment.created` / `agent.session`），
  两个窗口各自持有当前项目的一条连接——Sprint 14 已经把这条路走通了

新增/改动：

```text
desktop/island.py            Island 窗口规格：URL / 尺寸 / 置顶 / 顶部居中 / 隐藏启动
desktop/window_manager.py    窗口生命周期 + 暴露给前端的 js_api（DesktopApi）
desktop/launcher.py          登记第二个窗口并把 js_api 注入两个窗口
frontend/lib/desktopBridge.ts            浏览器/桌面双环境的桥接封装（无桥时静默降级）
frontend/app/(panel)/layout.tsx          面板路由：只有 AuthGuard，不套 AppShell
frontend/app/(panel)/island-panel/page.tsx
components/engineering-island/           + variant="panel"、跨窗口同步、桌面开关、Alt+I
.github/workflows/ci.yml                 + 把 desktop/ 纳入 ruff 门禁
```

---

## 二、关键决策

### 1. 面板为什么单独开一个路由组，而不是 `/island?mode=panel`

`(protected)/layout.tsx` **常驻 AppShell**，而 Island 窗口只有 520×420。
在那个尺寸里塞顶栏 + 96px 侧栏 + 页栏，剩下的图纸区不足一半，而且会出现
「看起来能点、其实点不到」的控件——这是最该避免的误导。
所以新开 `(panel)` 路由组：只保留 `AuthGuard`，不套任何外壳。

### 2. 跨窗口同步用 localStorage，不用 WebSocket

产品计划说「两窗口通过 WebSocket 同步」，但要分清两件事：

- **数据变化**（别人改了任务）→ 确实走 WebSocket：广播是服务端发起的，两个窗口都是订阅方，
  Sprint 14 已有
- **「当前看第几张图纸」这个 UI 状态** → 走 localStorage 的 `storage` 事件。
  两个 WebView2 窗口同源、同 profile，localStorage 是共享的，事件会跨窗口触发；
  绕一圈后端只为了传一个索引，既慢又污染契约

而且 `storage` 事件**不会在写入方自身触发**，天然没有回环——省掉了自己写防抖/去重的活。

### 3. 窗口的显示/隐藏只有一个负责人

`WindowManager` 持有 Island 窗口引用与可见状态；两个入口（前端 `js_api`、Alt+I）
最终都落到它。早期版本想过「再开个键盘监听线程」，后来否掉了：**多一条通路就多一种竞态**，
而 pywebview 的 `js_api` 方法本来就跑在工作线程上，直接复用即可。

### 4. pywebview 的两个实测坑

1. **参数名是 `easy_drag` 不是 `draggable`**：后者是「用 HTML5 draggable 拖元素」，
   写错会**静默变成不可拖**（不报错，只是窗框拖不动）。
2. **这版没有 `move_to`**：窗口位置只能在 `create_window(x=, y=)` 时给，
   所以顶部居中要**先算好坐标再创建**，不能事后再挪。

两者都是在动手前用 `inspect.signature(webview.create_window)` 查出来的，没有靠记忆。

### 5. `useSyncExternalStore` 而不是 `useState + useEffect`

pywebview 是在 React 挂载**之后**才注入 `window.pywebview.api` 的，
所以「是否桌面版」是个会变化的值。写在 effect 里 `setState` 会多渲染一轮并可能闪一下，
而且撞上本项目的 `react-hooks/set-state-in-effect` 规则（交接文档里点名过）。
`useSyncExternalStore` 的 subscribe/snapshot 正好就是"订阅这个外部对象的出现"。

---

## 三、顺带补上的一个门禁缺口

`desktop/`（pywebview 启动器）**此前不在任何门禁范围内**——CI 的 `ruff check .`
在 `backend/` 目录下跑，仓库根没有 ruff 配置。

这是 Sprint 15 加了第二个模块才暴露的：新写的代码没人管，写坏了也不会红。
现已把 `desktop/` 纳入 backend job（显式 `--config backend/pyproject.toml`，
否则 ruff 会退回默认规则、报出一堆假问题），并修掉了存量问题。

---

## 四、验证

| 项 | 结果 |
|----|------|
| 前端单测 | **111** 全绿（Island 逻辑未改动） |
| `tsc --noEmit` / `eslint` | ✅ |
| Playwright E2E | **27**（26 → +1 面板用例）全绿 |
| `desktop/` ruff check + format | ✅（新增门禁） |
| `backend/` ruff check + format | ✅ |
| 窗口状态机 | 无 GUI 实测：未启用→中文降级提示；show/hide/toggle 行为与 `Window.show/hide` 调用一致 |
| 三个桌面模块导入 | ✅ `top_center(1920) = (700, 0)`、`island_url(3000)` 正确 |
| 后端 | 未改动，334 用例与门禁沿用 |

**未验证的部分（如实记录）**：真实 WebView2 窗口的显示/隐藏、置顶、拖拽、顶部居中，
需要真机双击 exe 才能确认——本次只做了逻辑层验证。若窗口行为异常，
先看 `runtime/launcher.log`（启动器一切关键信息都落这里）。

---

## 五、踩坑

1. `python -c "..."` 里嵌双引号被 bash 吃掉 → 改用 Edit/Write 工具改代码，**不要在 shell 里拼代码**。
2. 用 `ruff`（不带 `--config`）检查 `desktop/` 会报 26 个问题，绝大多数是"没找到项目配置"
   导致的假阳性。**先确认配置来源再下结论**。
3. `set-state-in-effect` 规则不是"教条"：它提示的正是本 Sprint 真实会遇到的
   「外部值后到」问题，换成 `useSyncExternalStore` 才是正解，而不是加 eslint-disable。

---

## 六、下一步

- **Sprint 16 Island Polish**：Paper Sheet / Blueprint Grid / Crosshair / FIG / SHEET / REV
  图纸元素；动效严格 `transform`+`opacity`、150–250ms（DESIGN.md §6 红线）
- **Sprint 17 Team Mode Refinement**：个人 ⇄ 团队模式可切换，收束 v1.0.0
- 建议先做 Sprint 16：Island 已经有信息结构，缺的是"看起来像一张图纸"的表达
