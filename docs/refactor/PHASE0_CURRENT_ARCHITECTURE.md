# Phase 0 · 当前架构事实核对（只读审查）

> 基线：main @ `97a49bb11fc70769d01e0768a9c122b70ee2e9d1`（2026-10-22）。
> 本文档只陈述**代码证据支持的事实**，区分「已确认」「待验证」「产品决策」。
> 审查方法：全量 models/services/views/serializers 精读 + 两个并行探索代理做路由与前端调用盘点 + 运行时 SQLite 只读实证 + 真实测试基线运行（见 PHASE0_BASELINE.md）。

## 1. 领域关系还原（实际代码，非文档推断）

17 张业务表 + User，全部继承 `core/models.py::BaseModel`（UUID 主键 + created_at/updated_at）。

### 1.1 实体与归属链

```text
User ──owner(PROTECT)──▶ Workspace ──CASCADE──▶ Project ──CASCADE──▶ Issue/Label/State/Comment/...
                     └─< WorkspaceMember(role)      └─< ProjectMember(role)
```

- **Workspace**（`apps/workspaces/models.py`）：slug 全局唯一；`owner` PROTECT。
- **Project**（`apps/projects/models.py:112`）：`workspace` **必填** FK(CASCADE)；`created_by` PROTECT（审计）；**没有 `owner` 字段**；`issue_sequence` 发号计数器；`identifier` 约束 `uniq_project_identifier_per_workspace`（workspace 为 NULL 时该约束不防重——当前 workspace 必填所以无洞）。
- **Issue**（`apps/issues/models.py:331`）：`sequence_id` 项目内唯一；`state` RESTRICT；`assignee` SET_NULL；`created_by` PROTECT；labels M2M。**没有 Stage 关联**——产品文档的「Stage → Task」关系未落到模型（已确认，非推测）。
- **ProjectPlan/ProjectStage**（`apps/projects/models.py:184,203`）：Plan 与 Project 1:1，**读时惰性创建**（`services.get_or_create_plan`）；Stage `order`/`name` plan 内唯一，`is_current` 唯一性仅由 service 保证（无 DB 约束）。
- **Worklog**（`apps/worklogs/models.py`）：project CASCADE + stage SET_NULL（可选关联 Stage）+ 结构化六字段 + source(manual/agent/imported)。
- **ActivityLog**（`apps/activity/models.py`）：workspace/project 双 FK 冗余 CASCADE + issue SET_NULL + entity_id 无外键；写入路径唯一 `activity.services.record_*`。
- **AgentToken / IdempotencyRecord / AgentSession**（`apps/agents/models.py`）：token 哈希存储、scope 白名单、(token,key,action) 唯一回放；Session 挂 project + 可选 task(=Issue)。
- **TaskRun / Notification**（`apps/jobs/models.py`）：异步任务状态机；Notification 只写不读（无 GET 端点，已确认）。

### 1.2 权限链（所有项目作用域请求的固定开销）

`core/permissions.py`：
- `resolve_workspace(user, slug)` → 非成员/不存在统一 404（防枚举）。
- `resolve_project(user, ws_slug, pid)` → 双重作用域校验（project 属于该 ws）→ 返回 (project, effective_role)。
- `effective_role`：ProjectMember.role > WS Admin ⇒ 项目 ADMIN > WS Member ⇒ 项目 VIEWER > 非成员 None → 404。
- `accessible_project_ids(user)`：ProjectMember ∪ WS 成员的项目集合，供 mine 聚合与 Agent 跨项目动作复用。

**已确认**：权限判定只有这一个实现点（无第二套）；视图层用 `_require_role(role, threshold)` 显式比较。**Owner 语义缺失**：项目创建者只是 ProjectMember.ADMIN 的一种，无独立所有者概念。

### 1.3 服务层与写路径

- 全部业务写走 `apps/*/services.py`（视图不做业务，抽样核对无绕过）。
- 留痕与业务同事务；WS 广播走 `transaction.on_commit`（`apps/realtime/broadcast.py`）。
- 发号：`issues.services.create_issue` 事务内 `select_for_update` 锁 Project 行。
- 幂等：Agent 7 个写动作有 `_replay/_remember` 封装；**`agent_session_end` 例外无幂等**（已确认缺陷）。

### 1.4 实时层

- 2 条 WS 通道（Session 握手鉴权）：项目级 `ws/workspaces/{ws}/projects/{pid}/` 与跨项目 `ws/engineering/overview/`（订阅协议 + `membership.changed` 权限实时收敛）。
- 事件三类：issue.updated / comment.created / agent.session。**payload 只作展示 diff，前端收帧只失效缓存重取**（REST 是事实源）。

### 1.5 桌面与运行时

- `desktop/launcher.py`（pywebview + WebView2）拉起 Django(desktop settings：SQLite + eager Celery + InMemory channel layer) + Next standalone。
- `runtime/miniplane.sqlite3` 为真实个人库（只读统计）：真实用户 1（北归）、真实工作区 2、项目 1、Issue 16、Stage 5、Worklog 2、协作者 **0**；另有 smoke 残留用户 2 / 工作区 1。

## 2. 声明 vs 实际（抽样对照结论）

| README/文档声明 | 实际 | 判定 |
|---|---|---|
| 服务层唯一写入口 / 留痕同事务 / 发号加锁 | 一致 | ✅ |
| 首页 `/projects/mine/` 单 SQL 聚合无 N+1 | 一致（`projects/views.py:245`） | ✅ |
| Agent Token scope 白名单 + 幂等 | 一致，但 session_end 缺幂等 | ⚠️ |
| 「团队层降级为协作基础设施」 | 信息架构层已降级；模型/URL/权限仍是全量团队形态；新用户引导仍是「先建工作区」（`app/(protected)/page.tsx:88-92`） | ❌ 未落地 |
| 契约 00–09 与 openapi.yaml 一致 | CI 快照 diff 通过（本基线实测 MATCH） | ✅ |

## 3. 已确认的结构事实（Phase 1+ 的输入）

1. **Project 无 owner、workspace 必填**——个人工程存在的组织性前提（`projects/models.py:115`）。
2. **Issue 无 stage 关联**——Stage→Task 只存在于产品文档（`issues/models.py:331` 起）。
3. **核心资源路径全部嵌在 workspace 下**（44 路径中 30+ 条为 `/workspaces/{slug}/projects/{pid}/...`）；仅 `projects/mine/`、`issues/mine/`、`agent/*` 在顶层。
4. **前端每个项目查询都携带 workspace_slug**（features/*/api.ts 全部手拼前缀，无共享 projectBase）。
5. **命名重叠**：前端 `features/issue`（业务任务）、`features/task`（后台 TaskRun 轮询）、Agent API `agent/tasks/`（业务任务）——三个「task」语境并存。
6. **Plan 惰性创建**（读时 get_or_create）——写路径分散，迁移时需评估。
7. **ActivityLog.workspace 冗余列为「工作区活动流」预留但未实现**；workspace 删除会级联删除全部相关活动（审计损失面，Phase 2 决策输入）。
8. **Workspace 删除 = 级联删除全部项目**（当前 delete_workspace 直接删）——与「个人工程数据保护」目标冲突，Phase 2 必须处理。

## 4. 外部消费者排查（已确认，非推测）

| 嫌疑消费者 | 排查方式 | 结论 |
|---|---|---|
| Amiya-Agent（C:\amiya-agent） | 全仓 grep `mpa_`、`/api/v1/`、`MiniPlane`、`mini-plane`（排除 node_modules/.git） | **未消费**。仅有的 "8000" 命中是 TTS 端口与动画常量（`tts_web/tts_web.py:90`、`UI_DESIGN.md:195`） |
| scripts/import_progress.py | 精读 | **ORM 直连**（`AgentToken.mint`、`agent_services.start_session`，第 381-382 行），不走 HTTP；runtime 库中 4 个 "import-progress" 令牌源于它 |
| runtime 库 AgentToken | 只读查询 | 4 个令牌全部 name=import-progress、`last_used_at` 均为 NULL、未吊销 |

**推论**：Agent API 当前**无外部 HTTP 消费者**；兼容压力仅来自本仓库前端与 E2E。旧路由仍按计划保留适配器并标记废弃，但可以在本仓库前端迁移完成后安全退役（Phase 9 决策）。

## 5. 待验证 / 产品决策（不在 Phase 0 下结论）

- 存量 Workspace 中哪些视为「事实团队」：**不可自动判定**，按计划采用方案 B（owner + workspace 可空）后旧项目保持原 workspace 归属，不猜测、不搬移。
- `progress` 无 Stage 时的回退规则（plan vs tasks）：产品决策，Phase 1 冻结。
- Island V3 数据契约与新 Project API 的对齐：Phase 8 范围，本轮不动窗口壳层。
