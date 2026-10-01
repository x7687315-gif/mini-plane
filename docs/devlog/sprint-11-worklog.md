# Sprint 11 — Worklog（工程日志）

> 依据：[docs/PRODUCT_REFACTOR_PLAN.md](../PRODUCT_REFACTOR_PLAN.md) §4/§10/§11 + Sprint 11 定义。
> 核心信条：**Task 是计划，Worklog 是证据**。本 Sprint 让 Project 页形成
> Plan → Stage → Task → Worklog 的完整链路，并给首页加 Today 维度。

## 做了什么

### 后端：新 app `apps/worklogs`

- 模型 `Worklog`（迁移 `worklogs/0001_initial`）：
  `project`(CASCADE) / `stage`(SET_NULL, 可空) / `author`(PROTECT, 审计性) /
  `date`(日志归属日，默认今天，可补记) / `title` / `summary`(完成内容) /
  `details` / `conclusion` / `next_step` / `blocker` / `source`(manual|agent|imported)。
  索引 `(project,-date)`、`(author,-date)`；排序 date 倒序。
  `source` 为后续 Agent 写日志 / Markdown 导入预留（§10/§26）。
- 接口（项目作用域，挂在 `.../projects/<pid>/worklogs/`）：
  - `GET` 列表（倒序），支持 `?date=today` 或 `?date=YYYY-MM-DD`（非法格式 400）；读 ≥ Viewer。
  - `POST` 记一条；写 ≥ Member。`stage_id` 跨项目 → 404 防越权。
  - `PATCH/DELETE .../worklogs/<id>/`；写 ≥ Member。
- `/projects/mine/` 增加 `today_logs`（今日日志条数，correlated subquery 计入同一条聚合 SQL），
  供首页 Today 维度；仍无 N+1。

### 前端

- `types/project.ts`：`Worklog` / `WorklogPayload`；`ProjectEngineering` 增 `today_logs`。
- `features/project`：`listWorklogs/createWorklog/deleteWorklog` + `useWorklogs/useAddWorklog/useDeleteWorklog`
  （mutate 后失效 worklogs 与 mine 两个 key，首页 Today 随之刷新）。
- 新组件 `components/project/WorklogPanel.tsx`：Engineering Log 列表（日期/标题/阶段/来源/
  完成内容/结论/下一步/阻塞）+「仅今天」过滤 + 记一条表单 + 删除。沿用 Blueprint Editorial。
- 项目页在 Plan 面板下方挂 WorklogPanel，形成 Plan→Stage→Task→Worklog 链路。
- 首页 My Engineering 顶部统计加「今日日志」，卡片数据含 today_logs。

### 测试

- 后端 `apps/worklogs/tests.py` 6 例：创建+列表、today 过滤（含非法日期 400）、Viewer 写 403 读 200、
  跨项目 stage 404、PATCH/DELETE、`/projects/mine/` 含 today_logs。全量 **323** 通过。
- E2E 新增 1 例：项目页记一条日志并出现在 Engineering Log。

## 关键取舍

- **date 与 created_at 分离**：允许补记昨天的日志（工程记录常滞后），列表按 date 倒序更贴合"日志"语义。
- **author 用 PROTECT**：日志是审计证据，作者账号不可被删（与 Comment 同策略）。
- **source 字段先落地**：Sprint 12 Agent API 写日志时可直接标 `agent`，无需再改表。
- **不做 related_tasks/related_commit**：计划列为"后续"，本 Sprint 保持模型精简。

## 验证

- 后端：ruff / spectacular --fail-on-warn / 迁移双库（PG+SQLite）/ 323 测试全绿；openapi 快照重生成。
- 前端：tsc 0、eslint 0、build 成功；E2E 全量（含新增）通过。
- 桌面版：重建 dist 后自检 rc0。

## 下一步（Sprint 12）

Agent Local API 第一版：以"工程动作"为中心的端点（task.start/complete、worklog.create、
progress.update）+ **Agent Token**（独立于用户会话、权限白名单）+ **Idempotency-Key** 幂等。
