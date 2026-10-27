# 10 · 工程规范路由（Canonical Project API）

> 状态：**当前有效**（Phase 3 建立；Phase 6–9 增补团队边界、Agent 幂等与事件语义，2026-10-28）。
> 本文是 `/api/v1/projects/…` 规范路由的行为契约；
> OpenAPI（`openapi.yaml`）仍是机器可读的唯一权威，本文解释行为语义。
> 旧的工作区嵌套路由全部标记 **deprecated**；前端已零调用，保留为薄适配器，退出条件见 §3。

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
| `GET ?scope=accessible&workspace=<slug>` | 该团队的工程列表；必须是该 WS 成员，否则 404（防枚举）。团队页现走此入口，不再使用 `…/workspaces/{slug}/projects/` |
| `POST`（无 workspace_id） | **创建私人工程**：owner=当前用户，workspace=NULL；响应 201 |
| `POST`（带 workspace_id） | 创建团队工程：须为该 WS 的 Member+（Viewer 403、非成员 400 字段错误） |
| `POST /projects/{pid}/share/` | **显式共享**：仅 owner 可发起；body `{workspace_id}`；目标 WS 需 Member+；已在其他 WS → 400（先 detach） |
| `POST /projects/{pid}/detach/` | **显式脱离协作**：仅 owner 可发起；清空 workspace 与全部 ProjectMember，工程转为私人；返回更新后的 Project |
| 分页 | StandardPagination（`results/count/previous/next`，page_size 50） |

## 2. 工程子资源（全部 `/api/v1/projects/{project_id}/…`）

| 资源 | 路径 | 说明 |
|---|---|---|
| 详情/改/删 | `/ , PATCH / , DELETE /` | GET 走版本化缓存（哨兵键）；写 ≥ Admin |
| 成员 | `GET/POST /members/` · `PATCH/DELETE /members/{mid}/` | 团队工程按 Admin 管理；**私人工程 GET 返回 owner 的隐式 ADMIN 成员**（供指派），写操作 400 |
| 五态 | `GET /states/` | 预置只读 |
| Plan | `GET/POST /plan/` | POST 追加 Stage（**order 不可写**，服务端发号） |
| Stage | `PATCH/DELETE /plan/stages/{sid}/` | 删除置空关联 Task/Worklog 的 stage |
| Task | `GET/POST /tasks/` · `GET/PATCH/DELETE /tasks/{tid}/` | 过滤/搜索/排序语义同 04 契约；写请求可带 `stage_id`（跨项目 → 400 字段错误） |
| 批量标签 | `POST /tasks/bulk/labels/` | 202 + JobRun（覆盖式） |
| Label | `GET/POST /labels/` · `PATCH/DELETE /labels/{lid}/` | |
| 评论 | `GET/POST /tasks/{tid}/comments/` · `PATCH/DELETE …/{cid}/` | 时间正序；作者或项目 Admin |
| 工程活动流 | `GET /activities/` | 倒序分页 |
| Task 时间线 | `GET /tasks/{tid}/activities/` | 倒序分页 |
| 工程日志 | `GET/POST /worklogs/` · `PATCH/DELETE /worklogs/{wid}/` | `?date=today\|YYYY-MM-DD`；写 ≥ Member，改删仅作者或项目 Admin；创建/修改/删除写 Activity + 广播 `worklog.*` |
| JobRun | `GET /jobruns/{id}/` | 批量任务进度轮询（1s × ≤30 次的既有约定） |
| 我的工程聚合 | `GET /api/v1/projects/mine/` | 原端点保持；`progress` 0-100 整数 + `progress_source: "plan"\|"tasks"`；私人工程 `workspace_slug/name = null` |
| 我的工作聚合 | `GET /api/v1/tasks/mine/` | 规范入口；旧 `/api/v1/issues/mine/` 保留为 deprecated 别名 |
| Agent 任务读取 | `GET /api/v1/agent/projects/{pid}/tasks/` | Agent Token + `read_task` scope；只读分页 |

## 3. 迁移表（当前 → 规范；兼容路由保留为 deprecated 适配器）

> **退役状态（2026-10-28）**：前端与桌面已零调用下列兼容路由；本机/工作区搜索未发现
> 外部消费者。由于无法穷尽证明远端 Agent 消费者不存在，本轮**不删除**兼容壳，只保证它们
> 仍委托同一 service。删除条件：至少一个发布周期的 404/访问日志为零 + 外部 Agent 使用方
> 确认迁移到 `/projects/{pid}/…` 与 `/tasks/…`。旧路径的 OpenAPI 均标记 `deprecated`。

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
| `GET/POST /api/v1/issues/mine/` | `/api/v1/tasks/mine/`（旧别名保留 deprecated） |
| `GET /api/v1/agent/projects/{ws}/{pid}/…` | `/api/v1/agent/projects/{pid}/…` |
| `POST /api/v1/agent/tasks\|worklogs\|sessions/`（body 含 workspace_slug） | 规范解析只凭 `project_id`；旧 body 的多余 `workspace_slug` 会被忽略 |
| `GET/PATCH/DELETE /workspaces/{ws}/projects/{pid}/members…` | 规范路由 `/projects/{pid}/members…` 已提供（私人工程返回 owner 隐式成员）；旧路径保留为团队兼容壳 |

## 4. 行为契约要点

1. **不可见统一 404**：私人工程对非 owner、越权 slug 组合、跨项目注入一律 404（防枚举）；请求体内引用字段（state/labels/stage）跨项目为 400 字段错误。
2. **幂等**：Agent 全部 8 个写动作（含本次补齐的 `session.end`）支持 `Idempotency-Key` 回放。
3. **缓存**：工程详情缓存存在两种作用域键（兼容 ws slug / 规范哨兵 `-`）；任何写路径经 `invalidate_all_scopes` 同时作废两种键。
4. **错误体/分页/snake_case/尾斜杠**：沿用 00 契约，无变化。
5. **私人工程成员语义**：`GET /projects/{pid}/members/` 对 `workspace=null` 返回 owner 的
   隐式 ADMIN 成员视图；任务指派允许 owner（即使没有 ProjectMember 行）。成员写操作
   （POST/PATCH/DELETE）对私人工程返回 400——私人工程没有成员管理。
6. **实时**：项目通道新增规范路径 `ws/projects/{pid}/`（私人工程唯一入口）；
   旧 `/ws/workspaces/{ws}/projects/{pid}/` 保留。Overview 通道要求项目组消息带顶层
   `project_id`，否则 Island 不会转发（2026-10-25 修复）；Phase 7 起 payload 内也带
   `project_id`，并新增 `worklog.*` / `stage.updated` / `project.updated`。
7. **团队边界**：owner 恒 ADMIN；ProjectMember 显式 override 优先于 Workspace 角色；
   非成员 WS Admin→ADMIN、其他 WS 成员→VIEWER。列表与详情使用同一 `combine_effective_role`。
8. **Agent 幂等**：`Idempotency-Key` 以 `(token,key)` 唯一；同键不同 action/body → 409；
   先占位再执行，24h TTL；失败不缓存。SQLite 无行锁，唯一约束兜底。
9. **Session**：同一工程最多一个 `running` 会话（DB 部分唯一约束）；重复 `end` 返回 400；
   Agent 会话的 STEP/HOW 只来自真实上报。
