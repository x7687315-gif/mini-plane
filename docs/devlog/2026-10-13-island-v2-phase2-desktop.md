# 阶段 2：桌面隐藏触发窗 + 图钉固定 + 配置持久化（2026-10-13）

> Island V2 规格 §6 阶段 2。本阶段只做桌面窗口与桥接，不动后端数据模型。
> **有一项需要你亲手验证**（见第五节），原因写清楚了。

---

## 一、做了什么

| 文件 | 改动 |
|---|---|
| `desktop/config.py`（新） | `runtime/desktop-config.json` 读写：损坏/缺失一律降级到默认值，**原子写入**（tmp + `os.replace`） |
| `desktop/island.py` | 新增 `create_trigger_window()`（约 140×14 胶囊把手）与 `TRIGGER_TITLE` / `TRIGGER_PATH`；`create_island_window` 支持传入位置与初始显隐 |
| `desktop/window_manager.py` | 从"只管一个 Island 窗口"扩为**三窗口 + 两正交状态**；新增 `pin_island` / `unpin_island`；`hide_island` 在 pinned 下拒绝收起；窗口拖动 → 位置落盘；`bind_main_window` 现在同时销毁把手与面板 |
| `desktop/launcher.py` | 启动时 `restore_preferences()` 读配置 → 按 `displayMode` 决定面板是否隐藏启动；创建把手；**把手消失也触发退出** |
| `desktop/tests/test_island_config.py`（新） | 6 条零依赖单测：默认值 / 读写往返 / 损坏 JSON 降级 / 非法值丢弃 / 状态机四宫格 / Esc 规则 |
| `desktop/verify_island_v2.py`（新） | 真机验证脚本：把手出现、配置合法、关窗全退 |
| `frontend/app/(panel)/island-trigger/page.tsx`（新） | 把手页面：悬停加宽显字、点击 `toggleIsland()`、浏览器里安全 no-op |
| `frontend/lib/desktopBridge.ts` | 新增 `pinIsland` / `unpinIsland` / `readIslandState` 与 `IslandState` 类型 |
| `frontend/components/engineering-island/IslandHeader.tsx` | 桌面面板渲染图钉按钮（自绘 SVG），本地立即纠正状态 |
| `frontend/features/engineering-island/useIslandHotkey.ts`（新） | Alt+I 提升为**全局快捷键**（规格原话"备用快捷键"），挂在 AppShell 与 Island 面板各一份 |
| `frontend/components/engineering-island/EngineeringIsland.tsx` | 面板窗口新增 `Esc` 收起（仅 auto_hide；pinned 由 Python 侧护栏拒绝） |
| `frontend/components/shell/AppShell.tsx` | 挂全局 Alt+I |
| `frontend/tests/e2e/island.spec.ts` | 新增两条：把手路由可渲染且点击不抛错；浏览器里**不渲染**图钉（无桥） |

## 二、过程中的三个真发现

**① 把手被夹成 200×100** —— pywebview 的 `min_size` 默认值就是 `(200, 100)`，
WinForms 会把它设成 `MinimumSize`。我请求 140×14 却拿到 200×100，真机量到。
**修法**：显式传 `min_size=(TRIGGER_WIDTH, TRIGGER_HEIGHT)`。
（查的是 `webview/window.py:92` 与 `platforms/winforms.py:210`，不是猜的。）

**② `easy_drag` 在 Windows 后端是空操作** —— 全仓库只有 cocoa / gtk / mshtml / qt
四个后端实现了它，`winforms.py` 与 `edgechromium.py` 里**没有**。
也就是说 Island 面板现在**拖不动**。这是既存缺口（Sprint 15 起就这样），
本阶段不扩范围，登记为技术债。

**③ 每个窗口 API 调用都可观测** —— 加了 `set_notify(_log)`，
`toggle_island` / `show_island` / … 每次都写进 `runtime/launcher.log`。
没有它，"点击没反应"这类问题只能靠猜（今天就靠它排除了半个错误假设）。

## 三、已验证（有证据）

| 项 | 证据 |
|---|---|
| 配置模块 6 条单测 | 默认值 / 往返 / 损坏降级 / 非法值丢弃 / 四宫格 / Esc 规则全过 |
| 启动后只出现把手 + 主窗口，面板默认隐藏 | `verify_island_v2.py` 真机：`主窗口=True 把手=True 面板=False` |
| `runtime/desktop-config.json` 启动即生成且合法 | 真机读到的内容 `{"displayMode":"auto_hide", …}` |
| 关掉主窗口 → 把手、面板、后端、前端全退，端口释放 | 真机：`{'MiniPlane': 0, '端口': []}` ✅ |
| 把手路由生产构建可渲染、点击是安全 no-op | E2E 6 条全过（含新增两条） |
| 前端门禁 | tsc 0 · eslint 0 · 单测 **139** |
| 后端门禁 | **334** OK · ruff 全绿 · 迁移无漂移 |
| 桌面脚本 lint | ruff check + format 全绿 |

## 四、**未能自动验证的一项（需要你亲手点一下）**

"点击把手 → 面板展开"我**没法用合成输入验证**，原因已证实不是应用问题：

- 我用 `SetForegroundWindow` / `AttachThreadInput` 都抢不到焦点，
  `GetForegroundWindow()` 始终返回 **OpenCode（编辑器）**——
  Windows 的前台锁禁止后台进程抢焦点；
- 于是我的合成点击/Alt+I 全都打到了编辑器窗口上，自然没有 `[api] toggle_island` 记录；
- 作为对照，我从 Python 直接调 `api.toggle_island()` 时，日志**确实出现了**
  `[api] toggle_island` —— 说明前端到桥接到 Python 这条链是通的。

**请你双击桌面版后点一下顶部把手**，然后看 `runtime/launcher.log`：
- 出现 `[api] toggle_island` → `[island] 面板已展开` 就是通的；
- 只有 `[api]` 没有 `[island] 面板已展开`，说明 `show()` 卡住了（pywebview 的
  `Invoke` 等 GUI 线程），把那两行日志发我，我继续修。

## 五、技术债（本阶段不扩范围）

1. **Island 面板拖不动**：`easy_drag` 在 Windows 后端未实现（见发现②）。
   规格 §1.2 要求"可拖"，需要自绘拖动（标题条 + `mouse_move` 桥接）或在窗口上加一个
   可见拖动区。留待单独一轮。
2. **把手被用户关掉**（无边框窗口也有 Alt+F4）：当前处理是**整个应用退出**
   （因为 pywebview 不允许 `start()` 之后新建窗口，把手没了 Island 就再也唤不出来）。
   更友好的做法是重新弹出把手，但需要窗口重建能力，同样留待后续。

## 六、下一步

阶段 3：后端 `AgentSession` 增加 `current_step` / `step_index` / `step_total` /
`method_summary` 四字段 + 迁移 + `POST /api/v1/agent/sessions/<id>/progress/` +
`/projects/mine/` 扩充 `recent_done` / `latest_log`（禁止 N+1）+ OpenAPI 快照。
