# Phase 2 报告 · 后端领域模型与迁移

> 完成于 2026-10-24 · 分支 `refactor/personal-first-domain` · 本阶段含数据库迁移（真实库副本演练通过）。

## 做了什么 / 怎么做的

### 1. 模型与迁移（ADR-001 方案 B 落地）

| 变更 | 实现 |
|---|---|
| `Project.owner` 必填 FK(PROTECT) | 迁移 0003 三步走：加可空列 → `RunPython` 回填 `owner = created_by`（带零遗漏断言，有遗漏即中止不猜）→ 收紧必填 |
| `Project.workspace` 可空 + SET_NULL | DB 层兜底；正常路径永远走 service 守卫 |
| `ActivityLog.workspace` 可空 + SET_NULL | 审计留痕永不因工作区兜底删除而消失（R-02 防御） |
| `Issue.stage` FK(SET_NULL) 可选单关联 | Task↔Stage 落地；同项目校验在 serializer（跨项目 → 400 字段错误，与 state/labels 同语义） |
| identifier 条件唯一索引 | 私人 `(owner, identifier) WHERE workspace IS NULL`；团队 `(workspace, identifier) WHERE workspace IS NOT NULL`——SQLite/Postgres 均为 partial unique index |
| `is_current` 部分唯一索引 | `(plan) WHERE is_current`；建索引前 `RunPython` 对历史数据去重兜底（保留最新） |
| 缓存作用域 | 私人工程用哨兵 slug `"-"`（`detail_scope`），与任何真实 slug 不冲突 |

### 2. 权限收敛（core/permissions.py）

- `effective_role` 增加 **owner 短路**（`owner == user → ADMIN`），含缓存命中路径（payload 携带 owner）。
- 新增 **`resolve_project_by_id(user, pid)`**：Phase 3 规范路由 / Agent 无 slug 路径的统一入口。
- 旧 `resolve_project(ws, pid)` 保留双重作用域校验，委托同一判定。
- `accessible_project_ids` 并入 `Q(owner=user)`——私人工程自动进入 mine 聚合。
- 附带收益：owner 请求的 resolve 少一次 ProjectMember 查询（issue 列表 5→4 查询，活动流 4→3，测试已按新计数断言）。

### 3. 服务层

- `create_project(owner, *, name, identifier, description="", workspace=None)`：私人/团队分支（成员记录、唯一性查重、显式建空 Plan——取消读时惰性创建的写路径分散）。
- `update_project`：唯一性按形态分流。
- **Workspace 删除守卫**（`workspaces/services.delete_workspace`）：仍有工程 → 400（附中文指引）；级联语义只作用于协作数据。根除 Phase 0 R-01「删工作区级联清空工程」。
- Stage 写序列化器移除 `order`（R-05：500 面 + 无重排服务，开放无意义）；追加由 service 发号。
- `my_projects_summary`：`last_activity` 修订为 **三元 max(Task.updated_at, Worklog.updated_at, Project.updated_at)**，Python 侧合成（SQLite 标量 MAX 的 NULL 传播不可用 `Greatest`）；`progress` 统一 **0-100 整数 + `progress_source: "plan"|"tasks"`**。
- 活动留痕：`TRACKED_ISSUE_FIELDS` 与快照加入 `stage`（阶段名，无 UUID）。

### 4. 迁移演练（真实库副本，SQLite）

对 `runtime/miniplane.sqlite3` 的**副本**执行 `migrate`（真实库未动）：

```text
Applying activity.0002_alter_activitylog_workspace... OK
Applying issues.0005_issue_stage... OK
Applying projects.0003_...and_more... OK
projects=1 缺 owner=0 owner≠created_by=0（MP 工程 owner=北归）
issues=16 worklogs=2 stages=5 activities=17（全部无损）is_current 重复=0
```

Postgres 侧：本地全量测试跑在 Postgres（迁移从零重放）+ CI 的 PR 流水线复验。

## 测试与门禁（真实结果）

| 门禁 | 结果 |
|---|---|
| 全量测试 | **368 通过 / 0 失败**（基线 352 + 新增 16：`projects/tests_personal.py` 13 + `issues/tests/test_stage.py` 5，合并删除 1） |
| 新覆盖 | 私人工程可见性（仅 owner）/ 旧路径 404 / identifier 按 owner 唯一 / owner 被移出工作区仍可访问（所有权优先）/ WS Member→VIEWER 不变 / is_current DB 约束 / 删 Stage 不删 Task / stage 留痕 / Worklog-only 工程的 last_activity / progress_source 两种来源 |
| ruff check + format | ✅（138 files formatted） |
| makemigrations --check | ✅ 无漂移 |
| spectacular --validate --fail-on-warn | ✅ 快照已重生成（+67/-17 行：owner/stage/progress_source 字段、order 移除） |

行为变更（有意，契约影响已在 OpenAPI 体现，前端 Phase 4 适配）：
1. `progress` 0-1 float → **0-100 int + progress_source**；
2. `mine` 的 `workspace_slug/workspace_name` 私人工程为 `null`；
3. `mine` 列表排序键从 SQL 改为等价的 Python 三元 max；
4. workspace DELETE 有工程时 400（原 204 级联）；
5. Stage `order` 不可写（POST/PATCH 均忽略）；
6. Issue 响应新增 `stage`，写请求接受 `stage_id`。

## 已知风险与回退

- **回退**：迁移全部 additive（加列/加约束/改 null），真实库未动；回退 = revert 提交 + 恢复旧 openapi.yaml。最低成本回退点在 Phase 3（前端切新路由）之前。
- 前端在本阶段与 mine 聚合契约暂不一致（progress 量纲）——**Phase 4 修复**，期间 CI 不受影响（前端测试不打真实后端）。
- smoke 残留数据仍在真实库（R-08，未动——数据操作不混入代码提交，留待用户确认后单独执行）。

## 下一阶段前置条件（Phase 3）

模型/权限/服务就绪 ✅；开始规范路由 `/api/v1/projects/{pid}/…` + 兼容适配 + Agent 无 slug 路径 + `session_end` 幂等补齐 + 契约文档更新。
