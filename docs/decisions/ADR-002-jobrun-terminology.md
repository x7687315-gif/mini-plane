# ADR-002 · 业务 Task 与后台 JobRun 的术语分离

> 状态：**已采纳**（2026-10-25）
> 关联：`docs/DOMAIN_MODEL.md` §1、`docs/api/10-canonical-projects.md` §2

## 背景

项目里同时存在三个容易混淆的 “task”：

1. 产品语义的业务工作项（历史表/模块名 `Issue` / `apps/issues`）；
2. 后台异步操作状态（历史模型 `TaskRun`，表 `jobs_taskrun`）；
3. Agent API 的 `tasks/`（实际也是业务工作项）。

在 Phase 3 统一规范路由时，前两者都曾出现在 `/tasks/` 路径下，前端也并存
`features/issue` 与 `features/task`，导致“点开任务”和“轮询后台任务”难以区分。

## 决策

| 层 | 术语 | 实现 |
|---|---|---|
| 产品 / UI / 公共 API 的业务工作项 | **Task** | 规范路由 `/api/v1/projects/{pid}/tasks/`；模型仍为 `Issue`（存储细节） |
| 后台异步操作 | **JobRun** | 规范路由 `/api/v1/projects/{pid}/jobruns/{id}/`；模型/表名保持 `TaskRun` / `jobs_taskrun`，不做迁移重命名 |
| 旧兼容路径 | 保留但 deprecated | `/workspaces/{ws}/projects/{pid}/tasks/{id}/` 仍是 **JobRun 状态轮询**，禁止用于业务 Task |

## 理由

- 公共契约必须无歧义；数据库重命名/迁移历史没有用户价值，成本却很高。
- 后台任务只是实现细节，未来可替换为其他队列实现，不应污染领域词汇。
- 不引入新表/新 app；现有服务层和测试继续复用。

## 后果

- 新增代码：业务工作项一律用 `Task` 类型/路由；异步轮询一律 `JobRun`。
- 旧 `/tasks/{id}/` 兼容路由仅作为退役期适配器，Phase 9 删除。
- 管理后台/内部代码仍可见 `TaskRun`，这是有意保留的存储名。
