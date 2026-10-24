# Phase 0 · API 清单（后端路由 × 调用方）

> 图例：✅ 前端在用 ｜ ⛔ 端点存在但前端无消费者 ｜ 🤖 Agent 通道（设计上非前端） ｜ 🔧 基础设施
> 路径省略 `/api/v1`；`{ws}` = `workspaces/{slug}`，`{proj}` = `{ws}/projects/{pid}`。
> 后端形态：44 路径 / 66 操作，全部 DRF 函数视图（0 ViewSet/Router），Session 认证 + `core/permissions.py` 角色判定。

## 1. 路由挂载树（config/urls.py）

```text
/admin/  ·  /api/v1/health/  ·  /api/v1/auth/(users)  ·  /api/v1/issues/(仅 mine)
/api/v1/projects/(仅 mine)  ·  /api/v1/agent/(agents)  ·  /api/v1/(workspaces 根)
  workspaces/…                       → 工作区 CRUD + 成员
  workspaces/{ws}/projects/…         → 项目 + plan/stages/states/members
      <pid>/issues|labels|bulk       → 借挂 apps/issues.urls
      <pid>/activities|…/issues/<iid>/activities
      <pid>/worklogs/… · <pid>/tasks/<task_id>/   （jobs：TaskRun 轮询）
/api/schema/ · /api/docs/            → OpenAPI + Swagger
WS: ws/engineering/overview/ · ws/workspaces/{ws}/projects/{pid}/
```

## 2. 全量端点 × 调用方

### 认证（users）
| 端点 | 消费 |
|---|---|
| GET `auth/csrf/` | ⛔（`primeCsrf` 封装无调用；仅 api() 403 自愈内部直打） |
| POST `auth/register/` `auth/login/` `auth/logout/` `auth/bind/` · GET `auth/me/` | ✅ AuthGuard/LoginForm/MePage |

### 工作区（workspaces，8 操作）
GET/POST `workspaces` · GET/PATCH/DELETE `workspaces/{ws}` · GET/POST `workspaces/{ws}/members` · PATCH/DELETE `…/members/{mid}` —— **全部 ✅**（LeftRail/MembersPage/SettingsPage）

### 项目（projects，16 操作）
| 端点 | 消费 |
|---|---|
| GET `workspaces/{ws}/projects` · POST 同 | ✅ |
| GET `{proj}` | ✅（版本化缓存） |
| PATCH/DELETE `{proj}` | ⛔ hooks 已写无 UI |
| GET `{proj}/members` | ✅（assignee 候选） |
| POST `{proj}/members` · PATCH/DELETE `…/members/{mid}` | ⛔ hooks 已写无 UI |
| GET `{proj}/states` | ✅ |
| GET `{proj}/plan` · POST 同（追加 Stage）· PATCH/DELETE `{proj}/plan/stages/{sid}` | ✅ PlanPanel |
| GET `projects/mine/` | ✅ 首页/Island（单 SQL 聚合，不分页） |

### 任务/标签/评论（issues，16 操作）
| 端点 | 消费 |
|---|---|
| GET/POST `{proj}/issues` · GET/PATCH/DELETE `{proj}/issues/{iid}` | ✅ |
| GET `{proj}/labels` | ✅ |
| POST `{proj}/labels` · PATCH/DELETE `{proj}/labels/{lid}` | ⛔ hooks 已写无 UI |
| GET/POST `{proj}/issues/{iid}/comments` · PATCH/DELETE `…/comments/{cid}` | ✅ |
| POST `{proj}/issues/bulk/labels`（202+TaskRun） | ✅ BulkActionBar |
| GET `issues/mine/` | ✅ `/me/issues` |

### 工程日志（worklogs，4 操作）
GET/POST `{proj}/worklogs` ✅ · DELETE `{proj}/worklogs/{wid}` ✅ · PATCH `{proj}/worklogs/{wid}` ⛔

### 活动/任务轮询
GET `{proj}/activities` ⛔（Sprint 5 仪表盘预留）· GET `{proj}/issues/{iid}/activities` ✅ · GET `{proj}/tasks/{tid}` ✅（1s×≤30 次轮询）

### Agent Local API（agents，14 操作）
| 端点 | 说明 |
|---|---|
| GET/POST `agent/tokens/` · POST `agent/tokens/{id}/revoke/` | ✅ 前端 MePage（Session） |
| GET `agent/projects/{ws}/{pid}/` | 🤖 read_project |
| POST `agent/projects/{ws}/{pid}/progress/` | 🤖 update_progress（幂等） |
| POST `agent/tasks/` · `agent/tasks/{iid}/start/` · `agent/tasks/{iid}/complete/` | 🤖 write_task（幂等） |
| POST `agent/worklogs/` | 🤖 write_worklog（幂等） |
| GET `agent/projects/{ws}/{pid}/sessions/` | 🤖 read_project |
| POST `agent/sessions/` · `agent/sessions/{id}/progress/` | 🤖 write_task（幂等） |
| POST `agent/sessions/{id}/end/` | 🤖 write_task（**无幂等——唯一例外，已确认缺陷**） |

### WebSocket
`ws/engineering/overview/` ✅ Island（subscribe/unsubscribe/membership.changed）· `ws/workspaces/{ws}/projects/{pid}/` ✅ 项目页

## 3. 关键统计与失衡

| 统计 | 值 |
|---|---|
| 前端无消费者操作 | 11（label 写 3、项目改删 2、项目成员写 3、项目活动流 1、worklog 改 1、primeCsrf 1） |
| 幂等写端点 | 7/8（session_end 例外） |
| 服务端批量 | 仅 bulk/labels；批量改状态/优先级/指派/删除为前端 ≤200 次逐条循环 |
| workspace 嵌套路径 | 44 条路径中 30+ 条含 `{ws}` 段；评论路径 6 段深 |

## 4. 前端调用侧结构事实

- 唯一 HTTP 出口 `frontend/lib/api.ts`（Session + CSRF 自愈重试一次）；无第二处裸 fetch。
- 每个项目作用域调用都由各 feature 手拼 `/workspaces/${slug}/projects/${pid}` 前缀——**无共享构造器**。
- React Query keys：projectKeys 有工厂，其余散落；overview WS 失效 `["worklogs"]` 与真实键 `["projects","worklogs",slug,pid,date]` **前缀失配**（已确认缺陷，Island 日志不自动刷新）。
- 环境变量：`NEXT_PUBLIC_API_BASE` 与 `NEXT_PUBLIC_WS_BASE` 独立默认 localhost:8000（WS 指错风险）。
- 命名重叠：`features/issue`（业务）vs `features/task`（TaskRun 轮询）vs Agent `agent/tasks/`（业务）。

## 5. 迁移映射表输入（Phase 3 的种子）

按计划 §3.2 的目标路径，当前 → 目标的对应关系（**正式冻结在 Phase 3 产出**）：

| 当前 | 目标（计划书建议） | 迁移策略 |
|---|---|---|
| GET `projects/mine/` | GET `projects/`（scope=owned 默认） | 旧端点保留为兼容适配器，委托同一 service |
| POST `{ws}/projects` | POST `projects/`（私人默认；workspace_id 显式可选） | 同上 |
| GET/PATCH/DELETE `{proj}` | `{pid}` 顶级作用域 | 授权改走统一 resolver（owner 优先） |
| `{proj}/plan`、`…/stages/{sid}` | `projects/{pid}/plan/`、`…/stages/{sid}/` | 兼容挂载 |
| `{proj}/issues…`（列表/详情/评论/bulk） | `projects/{pid}/tasks…` | **对外更名 Task**，`/issues/` 旧路由保留适配器 |
| `{proj}/labels|states|worklogs|activities` | `projects/{pid}/…` 同名 | 兼容挂载 |
| `{proj}/tasks/{tid}`（TaskRun 轮询） | `projects/{pid}/jobruns/{id}/` 或维持（Phase 3 ADR） | 术语统一决策 |
| `agent/projects/{ws}/{pid}/…` | `agent/projects/{pid}/…` | 旧含 ws 路径保留适配器 |
| WS 两通道 | **不动**（计划 §3.2 明确） | 无 |
