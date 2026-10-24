# Mini Plane 领域模型（唯一事实源）

> 建立：2026-10-24（Phase 1 冻结）。描述**目标模型**（Phase 2 起落地）；与现状的差异见各 Phase 报告。
> 命名约定：对外产品语义用 **Task**；后端历史表名 `Issue`/`apps/issues` 保留为存储实现细节，公共 API/类型/UI 一律 Task。

## 1. 实体职责与所有权

| 实体 | 回答的问题 | 归属 | 关键规则 |
|---|---|---|---|
| **User** | 谁拥有和操作工程 | — | 昵称唯一身份；密码/邮箱可选二级凭据 |
| **Project** | 哪个持续推进的工程 | **owner: User（必填）** | `workspace` **可空**（仅团队协作时设置）；`created_by` 是创建审计，不承担所有权语义 |
| **Workspace** | 哪些工程放进同一协作范围 | owner: User | 只服务团队协作；删除时若仍有项目 → 拒绝（显式脱离后才能删） |
| **ProjectPlan** | 工程最终要做到什么 | Project 1:1 | 创建 Project 时显式建立空 Plan（取消读时惰性创建） |
| **ProjectStage** | 路线上的阶段与目标 | Plan | `order`/`name` plan 内唯一；`is_current` plan 内最多一个（DB 部分唯一索引 + service 事务双保险）；**order 只读**（追加时服务端发号，重排未支持） |
| **Task**（表 Issue） | 计划中的工作项 | Project | `sequence_id` 项目内唯一（发号器）；**可选属于一个 Stage**（`stage` FK SET_NULL）；公共语义一律 Task |
| **Worklog** | 实际做了什么、结论 | Project | 可选关联 Stage；date 允许补记；source: manual/agent/imported |
| **AgentSession** | Agent 正在做什么 | Project | 可选关联 Task；STEP/HOW 四字段只由 Agent 写入 |
| **AgentToken** | Agent 凭据 | User | 哈希存储、明文只显一次、可吊销、scope 白名单 |
| **ActivityLog** | 系统发生了什么变更 | Project（workspace 冗余列可空） | 只由系统写入（与业务同事务）；entity_id 无外键保留删除后审计 |
| **JobRun**（表 TaskRun） | 后台异步操作状态 | Project | 与业务 Task 严格区分；术语决策见 ADR-002 |

## 2. 关系图

```mermaid
erDiagram
    USER ||--o{ PROJECT : "owner（PROTECT，必填）"
    USER ||--o{ PROJECT : "created_by（PROTECT，审计）"
    WORKSPACE |o--o{ PROJECT : "workspace（SET_NULL，可空）"
    USER ||--o{ WORKSPACE : "owner"
    WORKSPACE ||--o{ WORKSPACEMEMBER : ""
    PROJECT |||| PROJECTPLAN : "1:1（创建时建立）"
    PROJECTPLAN ||--o{ PROJECTSTAGE : "order/name 唯一"
    PROJECT ||--o{ TASK : "sequence 发号"
    PROJECTSTAGE |o--o{ TASK : "stage（SET_NULL，可选）"
    PROJECTSTAGE |o--o{ WORKLOG : "stage（SET_NULL，可选）"
    PROJECT ||--o{ WORKLOG : ""
    PROJECT ||--o{ AGENTSESSION : ""
    TASK |o--o{ AGENTSESSION : ""
    USER ||--o{ AGENTTOKEN : ""
    PROJECT ||--o{ ACTIVITYLOG : ""
    PROJECT ||--o{ JOBRUN : ""
```

## 3. 派生量：唯一定义（单一计算位置）

实现位置：`apps/projects` 的聚合服务（一个模块，禁止在 serializer/前端各算一份）。

| 派生量 | 冻结定义 | 备注 |
|---|---|---|
| **progress** | 有 Plan 且 ≥1 个 Stage 且 Σweight>0 → `Σ(weight×progress)/Σweight`（0-100 整数）；否则 → 任务完成率 `done/total×100` | 响应必带 `progress_source: "plan" \| "tasks"`；无任务无阶段 → 0，source="tasks" |
| **NOW** | `state.group=started` 中 `(-updated_at, -sequence_id)` 最新者；无 → 未关闭组（backlog/unstarted/started）同序 | 维持现状语义，补稳定次级键 |
| **NEXT** | 队列组（backlog/unstarted）中 `(created_at, sequence_id)` 最早者；无 → started 组同序 | 同上 |
| **last_activity** | `max(最新 Task.updated_at, 最新 Worklog.updated_at, Project.updated_at)` | **修订**：现状只看 Task.updated_at（Phase 0 已确认），Phase 2 统一 |
| **today_logs** | `Worklog.date == 当地今天` 的条数 | 维持 |

## 4. 所有权与权限（统一 resolver，Phase 2 落地）

```text
resolve_project(user, project_id):
  project 不存在                       → 404（防枚举）
  project.owner == user                → ADMIN（owner 恒可访问、恒可写）
  project.workspace 非空:
      ProjectMember(user)              → 其角色（20/15/5）
      WS Admin                         → 项目 ADMIN
      WS Member                        → 项目 VIEWER
  其余                                 → 404
```

- 个人项目（workspace 为空）：**只有 owner 可见**（本地单机语义）；无 ProjectMember 概念。
- 团队项目：沿用既有双层角色与防枚举语义，不变。
- Agent：`accessible = owner==token.owner ∪ 既有规则`；scope 校验照旧。

## 5. 删除与脱离行为

| 动作 | 行为 |
|---|---|
| 删除 Workspace | **仍有项目 → 400 拒绝**；项目全部显式脱离（转私人/删除）后才可删。DB 层 `Project.workspace` SET_NULL 兜底（不级联清空工程）；ActivityLog.workspace 同步改可空 SET_NULL |
| 删除 Stage | 其 Task.stage 与 Worklog.stage 置空（SET_NULL）；**不删任务/日志**；若删的是当前阶段，`is_current` 归空（不自动迁移） |
| 删除 Project | 级联删除其 Task/Worklog/Plan/Stage/JobRun/活动（现状不变；个人数据删除是显式动作） |
| 删除 Task | 保留 deleted 活动留痕（现状不变） |
| 脱离协作（转私人） | workspace 置空 + 清理该项目的 ProjectMember（owner 保留）+ 缓存失效 + 实时 membership 广播（Phase 6 完整实现） |

## 6. 唯一性约束（数据库层）

| 约束 | 范围 |
|---|---|
| Project.identifier | **私人：owner 内唯一（workspace IS NULL）**；**团队：workspace 内唯一（workspace IS NOT NULL）**——条件唯一索引，SQLite/Postgres 均支持 |
| ProjectStage.order / name | plan 内唯一（不变） |
| ProjectStage.is_current | `(plan) WHERE is_current` 部分唯一索引（新增，service 之外的第二道保险） |
| Task.sequence_id | 项目内唯一（不变） |

## 7. 校验语义（跨项目注入防护）

- 请求体中的引用字段（Task 的 `stage_id`/`state_id`/`label_ids`）若不属于本项目 → **400 字段错误**（既有 state/labels 同语义，Phase 2 已按此实现）。
- URL 路径中的 ID 越界（如 Stage 详情/删除路径）→ **404**（防枚举语义）。
- Worklog 的 `stage_id` 历史实现为 404（`_resolve_stage`），Phase 3 契约统一时对齐为 400 字段错误。
- Agent 写入的 workspace_slug/project_id 组合不存在或不属于该 token 可见集 → 404。

## 8. 现状 → 目标的差异清单（Phase 2 实施项）

1. `Project.owner` 新增（回填 `= created_by`），必填，PROTECT。
2. `Project.workspace` 可空 + SET_NULL；workspace 删除守卫。
3. `ActivityLog.workspace` 可空 + SET_NULL。
4. `Issue.stage` 新增 FK（SET_NULL，可空）+ 同项目校验。
5. `ProjectPlan` 创建时机：`create_project` 显式建（保留 get_or_create 兼容读）。
6. identifier 条件唯一约束替换现有 workspace 约束。
7. `is_current` 部分唯一索引。
8. `resolve_project`（无 ws 版）+ owner 短路；`accessible_project_ids` 并入 owner。
9. `last_activity`/`progress_source` 聚合修订。
