# Sprint 12 — Agent Local API（Agent Token + 幂等 + 工程动作）

> 依据：[docs/PRODUCT_REFACTOR_PLAN.md](../PRODUCT_REFACTOR_PLAN.md) §12–§15/§24/§25 + Sprint 12 定义。
> 目标：给 Agent 一条**不碰 UI、不拿全库权限**的本地 REST 通道：以"工程动作"为中心的端点、
> 独立 Agent Token（权限白名单）、Idempotency-Key 幂等。

## 做了什么

### 后端：新 app `apps/agents`

- 模型（迁移 `agents/0001_initial`）：
  - `AgentToken`：owner / name / `token_hash`(SHA-256, unique) / `scopes`(JSON 白名单) /
    `last_used_at` / `revoked_at`。明文 `mpa_…` **只在创建时返回一次**，库中只存哈希。
  - `IdempotencyRecord`：(token, key, action) 唯一；存首次 status_code + 响应体，重复请求回放。
- 权限白名单 `AgentScopes`：read_project / read_task / write_task / write_worklog /
  update_progress。**刻意不含** delete_workspace / manage_members / change_roles（§24）。
- 认证 `AgentTokenAuthentication`：只认 `Authorization: Bearer mpa_…`；命中→request.user=持有人、
  request.auth=Token；无效/已吊销→401。配套 `OpenApiAuthenticationExtension` 让 schema 把它
  描述成 Bearer 安全方案。
- 动作端点（`/api/v1/agent/`，全部 Agent Token 认证 + scope 校验 + 写动作幂等）：
  - `GET  projects/<slug>/<pid>/` project.get（项目 + Global Plan 快照）
  - `POST tasks/` task.create；`POST tasks/<id>/start|complete/` 推进到 started/completed 组首态
  - `POST worklogs/` worklog.create（`source=agent`）
  - `POST projects/<slug>/<pid>/progress/` progress.update（改阶段进度 / 切当前阶段）
  - 任务类动作复用 `issues.services.create_issue/update_issue` → **自动写 Activity 留痕**（§23）。
- Token 管理走**用户会话**（非 Agent）：`GET/POST /agent/tokens/`、`POST /agent/tokens/<id>/revoke/`。
  Agent Token 调这些端点会被拒（认证类不含 Agent 认证）。

### 幂等实现（§25）

- 请求带 `Idempotency-Key` 头时：先查 `(token,key,action)` 记录，命中直接回放首次响应；
  未命中则执行并落记录。
- 踩坑：`response.data` 含 UUID/datetime 原生对象，`JSONField` 默认编码器不认 → 存前用
  `DjangoJSONEncoder` 落成 JSON 安全结构（与线上响应格式一致）。

### 前端

- `types/agent.ts` + `features/agents/api.ts`（list/create/revoke）。
- `/me` 新增 **Agent Token 卡**：创建（明文一次性展示 + 提醒保存）、列表（名称/权限/状态/最近使用）、吊销。

### 测试

- 后端 `apps/agents/tests.py` 9 例：坏 Token 401、project.get、task 生命周期(start/complete)、
  scope 不足 403、**幂等键去重（同 key 两次只建一条）**、worklog source=agent、progress.update、
  吊销后 401、Agent Token 不能管 Token。全量 **332** 通过。
- E2E 新增 1 例：设置页创建 Token 并一次性展示明文。
- 门禁：ruff / spectacular --fail-on-warn（0 警告，含 Bearer 安全方案）/ openapi 重生成 / 迁移双库。

## 关键取舍

- **Token 与 Session 分离**：Agent 拿不到用户会话能力，用户会话也调不了 Agent 动作端点；
  泄漏 Token 的损害被 scopes 限死（§24）。
- **动作端点而非整库 CRUD**：Agent 只能做"推进工程"这件事，不能任意改数据。
- **幂等放在视图内**（而非装饰器包在 api_view 外）：因为认证发生在 api_view 内部，
  外层装饰器拿不到 request.auth。

## 下一步（Sprint 13）

`AgentSession`（开始/状态/耗时）+ 把 Agent 事件接进现有 WebSocket，让桌面端实时看到
"Agent 正在跑"。
