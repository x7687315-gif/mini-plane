# Sprint 09 — Product Foundation（我的工程首页）

> 依据：[docs/PRODUCT_REFACTOR_PLAN.md](../PRODUCT_REFACTOR_PLAN.md) §7/§8/§9 + Sprint 09 定义。
> 目标：完成个人工程模式的信息架构——打开即"我的工程"，不必先理解 Workspace。
> 本 Sprint **不**引入 Worklog（留 Sprint 11）、**不**引入 Plan/Stage 模型（留 Sprint 10）。

## 做了什么

### 后端：一条聚合查询的「我的工程」数据源

- 新增 `GET /api/v1/projects/mine/`（`apps/projects/views.my_projects_summary`，路由
  `apps/projects/urls_global.py` 挂 `/api/v1/projects/`）。
- 返回当前用户**可访问**的每个项目的工程摘要：`total/open/done/started` 任务数、
  `progress`（done/total）、`current_stage`（NOW 任务所在状态名）、`now_task`、`next_task`、
  `last_activity`、归属 `workspace_slug/name`。
- **轻量且高效（用户架构约束）**：整页数据由**一条 SQL** 产出——计数与 NOW/NEXT/最近活动全部用
  correlated `Subquery` + `Coalesce` 注解，不按项目循环查询（无 N+1），SQLite/PostgreSQL 通用。
  可见性复用 `core.permissions.accessible_project_ids`（与单项目读取同一套规则）。
- NOW 语义：优先"进行中(started)"里最近更新的；无则退到任意未关闭里最近更新的。
  NEXT 语义：队列(backlog/unstarted)里最早的；无则取进行中里最早的。
- 序列化器 `ProjectEngineeringSerializer`（只读，progress 由计数派生）。

### 前端：首页从 Workspace Dashboard → My Engineering

- `app/(protected)/page.tsx` 重写为 **My Engineering**：顶部统计（活跃工程/待办/进行中）+
  项目"工程图纸"卡片（标识+名称、当前阶段、细蓝图进度条、NOW/NEXT、open/done、悬停箭头）。
  完全沿用 Blueprint Editorial（0.5px 边、直角、衬线标题、无渐变/阴影/圆角）。
- 原 Workspace Dashboard **整体迁到 `/workspaces`**（团队模式入口，未删除任何能力）。
- 命令面板新增「我的工程」「管理工作区」两条命令，保证降级后的 Workspace 仍易达。
- 数据层：`types/project.ProjectEngineering`、`features/project` 的 `listMyProjects`/`useMyProjects`。

### 测试

- 后端 `MyProjectsSummaryTests` 3 例：聚合字段正确（4 任务/2 完成/progress 0.5/now/next/stage）、
  不可见项目被排除、未登录 401。
- E2E 新增 2 例：首页默认 My Engineering 且渲染演示项目卡片与进度；`/workspaces` 仍可访问。

## 怎么做的（关键取舍）

- **不删 Workspace**：按重构计划"降级不删除"，仅把默认首页换成个人视图，团队能力原样保留在
  `/workspaces` 与原有 `/w/[slug]` 路由，零数据迁移。
- **进度先做派生值**：Sprint 09 的 progress 由任务完成度派生；Sprint 10 引入 ProjectPlan/Stage 后
  改为 Σ StageWeight × StageProgress，接口字段保持稳定以便平滑替换。
- **单查询聚合**是本轮对"轻量高效"约束的直接回应：首页一次请求、一条 SQL 拿全所有项目的摘要。

## 验证

- 后端：ruff check/format 全绿；`MyProjectsSummaryTests` 3/3；spectacular --fail-on-warn 0 警告；
  `docs/api/openapi.yaml` 已重生成（含 /projects/mine/）。
- 前端：tsc 0 error、eslint 0 error、`pnpm build` 成功、单测 98/98、E2E 全量（含新增 2 例）通过。
- 桌面版：`scripts/package.py` 重建 dist 后自检 rc0。

## 下一步（Sprint 10）

引入 `ProjectPlan` / `ProjectStage` 模型与接口，把 current_stage/progress 从派生值升级为
真正的 Global Plan / Stage 体系（§5/§6），首页卡片改读 Stage 数据。
