# Phase 5 报告 · 个人版 UI 重构（按已评审模板 v2 实施）

> **2026-10-25 补记**：Phase 5 之后的可见回归（首页双壳、项目 WS 未接线、成员地址、
> 批量轮询、工作台 URL 筛选）已在 Phase 5.5 稳定化批次修复，并补上完整 E2E 门禁。
> 当前状态见 [TECH_DEBT.md](TECH_DEBT.md) 与 [devlog/2026-10-25-phase5-stabilization.md](../devlog/2026-10-25-phase5-stabilization.md)。

> 完成于 2026-10-24 · 分支 `refactor/personal-first-domain` · 依据：`ui-design/miniplane-ui-template-v2.html`（用户已确认）+ `UI_REDESIGN_PROPOSAL.md`。
> 用户补充要求：**整体化、不突兀**——落实为「五屏共用一套 v2 原语」。

## 做了什么 / 怎么做的

### C1 · 后端（1964c39）

- `identifier` 可省略：`create_project` 自动生成（名称 ASCII 字母 → `NAPD` 式；中文回退 `PL` 系；唯一性按形态分流）。空串统一视作省略（POST=生成，PATCH=不改）。
- `/projects/mine/` 新增 `now_task_id`（与 now_task 同源）——首页「继续」行点击直达任务抽屉的唯一后端改动。
- 新增 4 测试；381 全绿；openapi 重生成。

### C2 · 壳层与首页（8c1f9d4）

- **globals.css「Blueprint v2 原语」**（整体化的锚）：`.v2-dim` 尺寸标注进度、`.v2-row` 横线行（整行即按钮，hover 浮现 ▸）、`.v2-wline` 手写横线输入、`.v2-sec` 区块标题、`.v2-ia` 墨水动作、`.v2-newline`/`.v2-inline-form` 就地新建、`.v2-fchip` 文字过滤——全部只用既有 design tokens（自动跟随明暗主题）。
- **首页重写**：空态=初见上手屏（一句话 + 手写横线，⏎ 建工程，全程无协作概念）；继续区（NOW 行 → `?issue=` 直达抽屉）；工程索引行（serif 名 + 标注线 + NOW + Agent + 计数）；`＋新的工程` 就地创建。
- **TopBar**：⇄ 切换退场；`✎ 记一笔` 上屏（⌘/Ctrl+Shift+L 同效）。
- **LeftRail v2**：个人四项常驻；团队收进底部「协作」虚线区（无工作区数据整块隐藏；aria-current 保留）。
- **QuickLogModal**：全局快速记录——默认 2 字段（标题+完成了什么），结论/下一步/阻塞收进「补全」；多工程时内嵌选择器；同一 Worklog 端点（`source=manual`）。
- `/me/issues` 链接改指 `/projects/{pid}`。

### C3 · 工程台（本提交）

- **新路由 `/projects/[pid]`**：个人/团队工程统一工作页——
  状态行（阶段 · 尺寸标注进度 · NEXT · AGENT·RUNNING · ✎记一笔，全内联无卡片）
  → 任务主区（状态文字过滤真实生效 + 搜索 + `＋新任务` 就地创建 + hover 多选 + BulkActionBar）
  → 路线（垂直站点图只读，点「调整」才出现进度输入与加阶段行）
  → 日志（页缘笔记，date/标题/摘要/AGENT·MANUAL）
  → 设置（页尾折叠：改名/标识符/删除——接线了 Phase 4 预留的 hooks）。
- **旧路由 `/w/{slug}/projects/{pid}` → 服务端重定向**（书签/外链兼容；slug 不参与定位鉴权）。
- **WS 双路由**：后端 `ws/projects/<pid>/`（同一 Consumer，owner 短路进握手判定）+ 前端 `buildProjectSocketUrlById`——**补上了私人工程没有项目级实时通道的缺口**；旧 slug 路径保留。
- **抽屉 v2 第一步**：META 与「删除任务」收进「详情」折叠（R6）；字段区/乐观更新逻辑不动。
- **删除孤儿组件**：PlanPanel / WorklogPanel / FilterBar / CreateIssueModal / IssueRow（旧页专属，验证零引用）。

### C4 · E2E 适配（尽力而为）

- helpers `projectUrl` → `/projects/{pid}`；mode-switch 三条用例改为侧栏协作区导航语义；issue-thread 建任务改为就地横线流程；features 的计划/日志两条改为「调整态 + 记一笔弹层」。
- **未适配**：filter-bulk（旧筛选 UI 断言）——登记 TD-10，与 TD-01 会话问题一起在 E2E 专项批次处理。

## 门禁（真实结果）

| 门禁 | 结果 |
|---|---|
| 后端测试 | ✅ 381（C1 后）；realtime 24 复验 OK |
| ruff / 迁移 / openapi | ✅ |
| 前端 typecheck / lint | ✅ |
| 前端单测 | ✅ 143 pass / 0 fail |
| 前端 build | ✅（`ƒ /projects/[pid]` 动态路由在产物中） |
| 真实栈冒烟 | ✅ 只填名称建工程（identifier=`NAPD` 自动生成）→ mine 返回 `now_task_id` |

## 已知边界与后续（登记 TECH_DEBT）

- **TD-09**：抽屉完整 v2 化（字段区改「手写横线行」样式）未做——本轮只收纳了 META/删除；EditableField 逻辑保持原样以稳住乐观更新。
- **TD-10**：filter-bulk E2E 未适配新筛选形态；全量 E2E 回归等 TD-01 修复后统一跑。
- 批量操作沿用既有 BulkActionBar（视觉统一待后续小改）；bulk 改状态仍是前端逐条循环（契约已声明）。
- Island 未动（窗口壳/数据投影不变）；其「继续」语义与新首页一致（同一 mine 数据源）。

## 回退

- 前端可整体 revert；后端两个改动均向后兼容（identifier 仍可显式传入；now_task_id 为新增字段）。
- 旧路由重定向保证任何旧链接不断。
