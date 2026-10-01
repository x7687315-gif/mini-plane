# Sprint 10 — Project Plan & Stage（Global Plan 体系）

> 依据：[docs/PRODUCT_REFACTOR_PLAN.md](../PRODUCT_REFACTOR_PLAN.md) §5/§6 + Sprint 10 定义。
> 目标：引入 `ProjectPlan` / `ProjectStage`，把进度从 Sprint 09 的"任务完成度派生值"升级为
> **Σ StageWeight × StageProgress** 的真正工程路线；首页与项目页读 Plan 数据（无 Plan 时回退派生值）。

## 做了什么

### 后端

- 模型（迁移 `projects/0002_projectplan_projectstage`）：
  - `ProjectPlan`：项目 OneToOne，`title` 默认 "GLOBAL PLAN"。一个项目一份计划。
  - `ProjectStage`：`order`（图纸先后）、`name`、`goal`、`weight`（进度权重）、
    `progress`（0-100，MaxValueValidator）、`is_current`（同 plan 唯一，service 保证）。
    约束：`(plan,order)` 与 `(plan,name)` 唯一；索引 `(plan,order)`。
- 服务层 `apps/projects/services.py`：
  - `get_or_create_plan`（读时惰性建，免给老项目补数据迁移）；
  - `add_stage` / `update_stage`（`is_current` 互斥：置真时同 plan 其余清假，事务内）；
  - `plan_progress`（Σ weight×progress / Σ weight）、`current_stage`、`next_stage`。
- 接口（03 契约扩展）：
  - `GET  /workspaces/<slug>/projects/<pid>/plan/` → Plan（stages 有序 + progress + current/next）；读 ≥ Viewer。
  - `POST .../plan/` → 追加 Stage；写 ≥ Member（§15：Global Plan 结构由人维护）。
  - `PATCH/DELETE .../plan/stages/<sid>/` → 改/删 Stage；stage 必须属该项目（跨项目 404 防越权）。
- Sprint 09 的 `/projects/mine/` 升级：`progress`/`current_stage` **优先读 Plan**
  （prefetch `plan__stages`，2 条额外查询，仍无 N+1），无 Plan 时回退任务派生值——接口字段不变，前端零改动平滑升级。

### 前端

- `types/project.ts`：`ProjectStage` / `ProjectPlan` / `StagePayload`。
- `features/project`：`getPlan/addStage/updateStage` + `usePlan/useAddStage/useUpdateStage`
  （mutate 后失效 plan 与 mine 两个 key，首页卡片随之刷新）。
- 新组件 `components/project/PlanPanel.tsx`：工程路线列表（序号/名称/细进度条/百分比/权重），
  current 高亮；可写角色可"添加阶段 / 设为当前 / 失焦提交进度"。沿用 Blueprint Editorial（细线、直角、mono 编号）。
- 项目页（`projects/[pid]`）在任务列表上方挂 `PlanPanel`。

### 测试

- 后端 `PlanStageTests` 4 例：加权进度（(1*100+3*0)/4=25）、`is_current` 互斥、Viewer 写 403、
  跨项目改 stage 404。全量 **317** 通过。
- E2E 新增 1 例：项目页显示 GLOBAL PLAN 并可添加阶段。
- 门禁：ruff / spectacular --fail-on-warn（0 警告）/ openapi 快照重生成 / tsc / eslint 全绿。

## 关键取舍

- **Plan 惰性创建**而非数据迁移补建：老项目首次读 plan 时才建行，避免一次性迁移风险。
- **进度双源回退**：有 Plan 用加权进度，无 Plan 用任务完成度——保证 Sprint 09 首页在存量项目上
  不出现"进度突然归零"。
- **is_current 用 service 互斥**而非数据库约束：数据库层难表达"至多一个 true"，放在事务里清假再置真，
  并用测试钉住。

## 下一步（Sprint 11）

引入 `Worklog`（工程日志：完成/结果/结论/下一步/关联任务），Project 页形成
Plan → Stage → Task → Worklog 完整链路；`/projects/mine/` 增加 today 维度。
