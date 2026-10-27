# Phase 7 报告 · Agent API 与 Realtime 收敛

> 完成于 2026-10-28 · 分支 `refactor/personal-first-phase6-9`
> 依据：`docs/refactor/inputs/mini-plane-refactor-plan.md` Phase 7 + [PHASE6_9_PREFLIGHT.md](PHASE6_9_PREFLIGHT.md)
> 范围：幂等原子性/TTL、Session 唯一、Worklog 唯一 service、Activity 留存、Realtime 事件与缓存失效。

## 1. 幂等：先占位，再执行

- `IdempotencyRecord` 唯一键从 `(token,key,action)` 改为 `(token,key)`，新增
  `request_hash`、`expires_at`（24h TTL）。
- 新增 `agents/idempotency.py`：
  1. 事务内查 `(token,key)`；过期记录删除后视为新请求；
  2. 同键不同 action / body → **409**；
  3. 先插入 `status_code=0` 占位，再执行业务；并发同键只能一个插成功；
  4. 成功响应 JSON-safe 落库；业务异常或 4xx 回滚/删除占位，允许修正后重试。
- 8 个 Agent 写动作全部切到 `execute_idempotent`（task.create/start/complete、worklog.create、
  progress.update、session.start/end/progress）。
- SQLite 无行锁（Django 文档明确 `select_for_update` 无效），因此用唯一约束 + SAVEPOINT 兜底；
  PostgreSQL 路径用 `select_for_update` 串行化。
- 迁移先按 `(token,key)` 去重（保留最新，删除重复幂等记录），再建唯一约束；旧的 action 唯一键删除。

## 2. AgentSession：一个工程一个 running

- 模型新增部分唯一约束 `(project) WHERE status='running'`。
- 迁移把历史重复 running 保留最新一条，其余置 `stopped` 并写 note；不删除会话历史。
- `start_session` 锁 Project 行 + 友好 400；`end_session` 对非 running 返回 400，不再刷新 ended_at。
- 重复 `session.end` 若带同一 Idempotency-Key 仍回放首次成功响应（符合幂等语义）。

## 3. Worklog：唯一写 service + 审计 + 广播

- 新增 `apps/worklogs/services.py`：`create_worklog` / `update_worklog` / `delete_worklog`。
- 用户 API 与 Agent API 共用；Agent 写入 `source=agent`，补上 `details` 字段。
- **改删权限**：作者本人，或项目 Admin；团队普通 Member 不能改删他人日志。
- 创建/修改/删除均写 Activity（新增 `EntityTypes.WORKLOG`）并广播
  `worklog.created/updated/deleted`。
- `ActivityLog.project` 改为 `SET_NULL`：工程删除后审计留痕保留（迁移 0003）。
- 删除工程时先写 `project.deleted` 审计，再级联业务数据。

## 4. Realtime 事件与前端缓存

- `broadcast()` 的 payload 也注入 `project_id`；新增 `worklog.*`、`stage.updated`、
  `project.updated`，`KNOWN_EVENTS` 同步扩充。
- `ProjectConsumer` 收到 `membership.changed` 重查角色；失权主动 `close(4404)`。
- Stage 增删改由 `projects.services` 统一 `defer_stage_updated`；工程共享/脱离发 `project.updated`。
- 前端：
  - `planRealtimeEffect` 增加 worklog/stage/project/membership 四类效果；
  - 项目通道按事件只失效 `worklogs/plan/detail` 等对应键；
  - Overview 通道按事件失效 `mine + task/plan/worklog/detail`，不再对所有事件一律刷 worklogs；
  - 重连仍全量失效（REST 补齐）。

## 5. Agent 能力与性能

- `READ_TASK` scope 新增真实端点：`GET /api/v1/agent/projects/{pid}/tasks/`（只读分页）。
- `add_stage` 在事务内锁 Plan 行，`IntegrityError` 转 400（并发 order 冲突）。
- Issue 增 `(assignee, project)` / `(created_by, project)` 索引；`AgentToken.touch()` 60s 节流。

## 6. 门禁

| 门禁 | 结果 |
|---|---|
| 后端全量 | **406 pass / 0 fail**（新增 Phase 7 11 条） |
| Agent 定向 | 11 pass（幂等冲突/TTL/失败重试/Session/READ_TASK/Worklog 权限与审计） |
| Realtime | 27 pass（新事件、payload project_id、撤权关闭） |
| 前端 typecheck / lint / 单测 | 通过 · 172 pass |
| OpenAPI | `spectacular --validate --fail-on-warn` 通过，快照已更新 |
| E2E | 见 Phase 9 最终门禁 |

## 7. 已知边界

1. `/projects/mine/` 仍不分页（个人工程量级；首页需要全量）；`recent_done/latest_log` 为批量取回后截断，
   未改窗口函数，登记为可接受性能边界。
2. `TaskRun` 仍是 JobRun 的存储/序列化历史名；对外契约使用 JobRun。
3. 旧 Agent slug 兼容路由保留为 deprecated 适配器；body 中多余 `workspace_slug` 被忽略。

## 8. 回退

- 幂等迁移会删除重复的 `(token,key)` 记录（仅幂等缓存，24h TTL 数据）；Session 迁移只改状态不删历史。
- `ActivityLog.project` 改 SET_NULL 可逆迁移（回 CASCADE 会丢已置空的审计，不建议）。
- 代码可整体 revert；旧 Agent 兼容路由未删，回退风险低。

## 9. 主要文件

- `backend/apps/agents/{models,idempotency,views,services,serializers,urls}.py` · migrations 0004
- `backend/apps/worklogs/{services,views,serializers}.py`
- `backend/apps/activity/{models,services}.py` · migration 0003
- `backend/apps/realtime/{broadcast,consumers}.py`
- `backend/apps/projects/services.py`（stage 事件 / add_stage 锁）
- `backend/apps/issues/models.py` · migration 0006
- `frontend/features/realtime/{policy,hooks,overview}.ts`
- `frontend/types/project.ts` · `frontend/components/engineering-island/ProjectSummaryCard.tsx`
