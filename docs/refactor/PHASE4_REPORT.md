# Phase 4 报告 · 前端数据层与类型收敛

> 完成于 2026-10-24 · 分支 `refactor/personal-first-domain` · UI 布局零改动（纯数据层/类型/基础设施）。

## 做了什么 / 怎么做的

### 1. 模块命名收敛（计划 §3.3 / Phase 4.2）

- `features/task`（原 TaskRun 轮询）→ **`features/jobrun`**（后台异步操作，与业务 Task 术语分离；api 切 `/projects/{pid}/jobruns/{id}/`）。
- `features/issue` → **`features/task`**（业务工作项；api 切规范路由 `/projects/{pid}/tasks|labels/…`）。
- `types/issue.ts`：新增 `Task = Issue` 别名（新代码用 Task，历史名 Phase 5 UI 批次退役）；`Issue` 增加 `stage: TaskStageRef | null`；写载荷增加 `stage_id`。
- 签名兼容策略：API 函数保留 `(slug, pid)` 形参（内部 URL 不再用 slug），把改动面控制在 feature 内部——Phase 5 页面去 slug 时一并移除参数。

### 2. 统一 Query Key 工厂（R-03 根治）

- 新增 `lib/queryKeys.ts`：`projectKeys`（mine/wsList/detail(pid)/members/states/plan/labels/activities/worklogs/jobrun）+ `taskKeys`（list/detail/comments/activities）+ `workspaceKeys` + `agentKeys`。
- **slug 全面退出缓存轴**（键按 project id 组织，与规范路由同构）。
- 全部 hooks（project/task/comment/activity/jobrun）与实时层改引工厂；`issueKeys/activityKeys/commentKeys/taskKeys` 保留导出名、内部委托工厂（调用面零改动）。
- Island overview WS 失效修复：`["worklogs"]` 字面量 → `projectKeys.worklogs(pid)` / 断线全量 → `projectKeys.all` 前缀（键拼写漂移从根上消灭）。

### 3. API 全量切规范路由

| feature | 变更 |
|---|---|
| task（原 issue） | tasks/labels → `/api/v1/projects/{pid}/…`（含 bulk/labels） |
| comment | → `/projects/{pid}/tasks/{tid}/comments/…` |
| activity | → `/projects/{pid}/(tasks/{tid}/)?activities/` |
| jobrun | → `/projects/{pid}/jobruns/{id}/` |
| project | 详情/改/删/plan/stages/worklogs/states → 规范路由；**成员管理与工作区工程列表保留兼容路由**（团队概念，10 号契约 §3） |

### 4. 基础设施修复（Phase 0 风险清单销项）

| 风险 | 修复 |
|---|---|
| R-04 4xx 被重试 2 次 | retry 谓词改 `error instanceof ApiError && 400≤status<500` |
| R-11 WS 指错风险 | 新增 `wsBaseUrl()`：从 `NEXT_PUBLIC_API_BASE` 推导（http→ws），`NEXT_PUBLIC_WS_BASE` 仅覆盖；ws.ts/overview.ts 统一走它 |
| R-14 Alt+I 双注册 | EngineeringIsland 的本地热键限定**仅面板窗口**（主窗口由 AppShell 全局注册，面板不套 AppShell） |
| R-15 primeCsrf 死代码 | QueryProvider 挂载时播种一次（失败无害，403 自愈仍兜底） |
| R-15b agents 破坏分层 | 补 `features/agents/hooks.ts`（api→hooks→组件三层对齐），AgentTokenCard 不再内联 useQuery |

### 5. 类型与量纲（DOMAIN_MODEL §3 对齐）

- `progress` 统一 0-100 整数：`logic.ts progressPercent` 改直通夹取（原 ×100 换算删除）；首页卡片 `×100` 移除；单测同步改写（143 全过）。
- `ProjectEngineering`/`MyIssue` 的 `workspace_slug/name` 可空（私人工程 null）；`Project` 增加 `owner`、`workspace: string | null`。
- 私人工程在旧路由页面的降级：首页卡片与「我的工作」对 `workspace_slug=null` 渲染为不可跳转（避免 `/w/null/…` 死链）——Phase 5 提供 `/projects/{pid}` 页后解除。

## 测试与门禁（真实结果）

| 门禁 | 结果 |
|---|---|
| `pnpm typecheck` | ✅（目录改名 + 键工厂 + 类型可空化一次通过） |
| `pnpm lint` | ✅ |
| `pnpm test` | ✅ **143 pass / 0 fail**（island-logic 量纲用例按新契约改写） |
| `pnpm build` | ✅（standalone 产物） |

## 已知事项

- E2E（Playwright）未在本阶段跑（需起完整栈）；因页面 URL 未变、API 行为等价（Phase 3 契约测试保证），E2E 回归安排在 P4 后的全局检查批次一并执行。
- 组件级 Issue→Task 重命名（useIssues/useIssue 等导出名）留 Phase 5（UI 批次反正要动组件）。
- 前端已不再调用任何「issue 路径」与「task 轮询旧路径」；兼容路由的退役评估（Phase 9）现在只取决于外部消费者（已确认无）。

## 下一阶段

**P4 后全局检查**（用户指定）：安全性分析 + 冗余/死代码清理 + 结构精简；随后停下与用户讨论 Phase 5（UI 重构）。
