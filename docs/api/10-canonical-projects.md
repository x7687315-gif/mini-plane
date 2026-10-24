# 10 · 工程规范路由（Canonical Project API）

> 状态：**当前有效**（Phase 3，2026-10-24）。本文是 `/api/v1/projects/…` 规范路由的行为契约；
> OpenAPI（`openapi.yaml`）仍是机器可读的唯一权威，本文解释行为语义。
> 旧的工作区嵌套路由全部标记 **deprecated**（见 §3 迁移表），退役时间见 Phase 9。

## 0. 设计原则（ADR-001 / 计划 §3）

- **个人优先**：所有工程子资源只凭 `project_id` 定位，**不要求 workspace slug**；私人工程与团队工程同构。
- **同一实现**：规范路由与兼容路由委托同一视图实现（各 app views 里的 `_impl` 函数），不存在两套业务逻辑。
- **授权**：`resolve_project_by_id` —— owner → ADMIN；团队工程按 ProjectMember > WS Admin > WS Member(=VIEWER)；私人工程非 owner 一律 404（防枚举）。
- **对外命名**：业务工作项统一 **Task**（`/tasks/`）；后台异步操作统一 **JobRun**（`/jobruns/`）。

## 1. 工程集合：`GET/POST /api/v1/projects/`

| 项 | 语义 |
|---|---|
| `GET ?scope=owned`（默认） | 我拥有的工程（含已共享到团队的）；个人首页的默认数据源之一 |
| `GET ?scope=accessible` | 我可访问的全部工程（owner ∪ ProjectMember ∪ WS 成员） |
| `POST`（无 workspace_id） | **创建私人工程**：owner=当前用户，workspace=NULL；响应 201 |
| `POST`（带 workspace_id） | 创建团队工程：须为该 WS 的 Member+（Viewer 403、非成员 400 字段错误） |
| 分页 | StandardPagination（`results/count/previous/next`，page_size 50） |

## 2. 工程子资源（全部 `/api/v1/projects/{project_id}/…`）

| 资源 | 路径 | 说明 |
|---|---|---|
| 详情/改/删 | `/ , PATCH / , DELETE /` | GET 走版本化缓存（哨兵键）；写 ≥ Admin |
| 五态 | `GET /states/` | 预置只读 |
| Plan | `GET/POST /plan/` | POST 追加 Stage（**order 不可写**，服务端发号） |
| Stage | `PATCH/DELETE /plan/stages/{sid}/` | 删除置空关联 Task/Worklog 的 stage |
| Task | `GET/POST /tasks/` · `GET/PATCH/DELETE /tasks/{tid}/` | 过滤/搜索/排序语义同 04 契约；写请求可带 `stage_id`（跨项目 → 400 字段错误） |
| 批量标签 | `POST /tasks/bulk/labels/` | 202 + JobRun（覆盖式） |
| Label | `GET/POST /labels/` · `PATCH/DELETE /labels/{lid}/` | |
| 评论 | `GET/POST /tasks/{tid}/comments/` · `PATCH/DELETE …/{cid}/` | 时间正序；作者或项目 Admin |
| 工程活动流 | `GET /activities/` | 倒序分页 |
| Task 时间线 | `GET /tasks/{tid}/activities/` | 倒序分页 |
| 工程日志 | `GET/POST /worklogs/` · `PATCH/DELETE /worklogs/{wid}/` | `?date=today\|YYYY-MM-DD` |
| JobRun | `GET /jobruns/{id}/` | 批量任务进度轮询（1s × ≤30 次的既有约定） |
| 我的工程聚合 | `GET /api/v1/projects/mine/` | 原端点保持；`progress` 0-100 整数 + `progress_source: "plan"\|"tasks"`；私人工程 `workspace_slug/name = null` |

## 3. 迁移表（当前 → 规范；兼容路由在 Phase 9 评估退役）

| 兼容路由（deprecated） | 规范路由 |
|---|---|
| `GET/POST /workspaces/{ws}/projects/` | `GET/POST /api/v1/projects/`（POST 默认私人；团队显式 workspace_id） |
| `…/projects/{pid}/`（GET/PATCH/DELETE） | `/api/v1/projects/{pid}/` |
| `…/projects/{pid}/states|plan|plan/stages/{sid}/` | 同形（去 ws 前缀） |
| `…/projects/{pid}/issues…`（含 bulk/labels） | `…/tasks…`（命名统一 Task） |
| `…/projects/{pid}/issues/{iid}/comments…` | `…/tasks/{tid}/comments…` |
| `…/projects/{pid}/issues/{iid}/activities/` | `…/tasks/{tid}/activities/` |
| `…/projects/{pid}/labels|worklogs|activities…` | 同形（去 ws 前缀） |
| `…/projects/{pid}/tasks/{task_id}/`（TaskRun 轮询） | `…/jobruns/{id}/` |
| `GET/POST /api/v1/issues/mine/` | 保持原位（对外语义已是「我的工作」） |
| `GET /api/v1/agent/projects/{ws}/{pid}/…` | `/api/v1/agent/projects/{pid}/…` |
| `POST /api/v1/agent/tasks\|worklogs\|sessions/`（body 含 workspace_slug） | body 的 `workspace_slug` **可选**：省略即规范解析（私人工程可达）；传了按旧双重作用域校验 |
| `GET/PATCH/DELETE /workspaces/{ws}/projects/{pid}/members…` | **保留原位**（团队协作概念，属 Workspace namespace；计划 §3.2） |

## 4. 行为契约要点

1. **不可见统一 404**：私人工程对非 owner、越权 slug 组合、跨项目注入一律 404（防枚举）；请求体内引用字段（state/labels/stage）跨项目为 400 字段错误。
2. **幂等**：Agent 全部 8 个写动作（含本次补齐的 `session.end`）支持 `Idempotency-Key` 回放。
3. **缓存**：工程详情缓存存在两种作用域键（兼容 ws slug / 规范哨兵 `-`）；任何写路径经 `invalidate_all_scopes` 同时作废两种键。
4. **错误体/分页/snake_case/尾斜杠**：沿用 00 契约，无变化。
