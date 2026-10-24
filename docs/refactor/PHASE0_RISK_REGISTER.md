# Phase 0 · 风险登记表

> 分级：Critical（数据丢失/安全）· High（用户可感故障/结构阻碍）· Medium（质量债）· Low（卫生）。
> 每项附代码证据。「已确认」= 有代码级复现路径；「潜在」= 条件触发；「产品」= 决策项非缺陷。

## Critical

| ID | 类型 | 风险 | 证据 | 验证方法 |
|---|---|---|---|---|
| R-01 | 潜在（条件=新模型落地后不处理） | **Workspace 删除级联清空个人工程**：当前 `DELETE workspaces/{ws}` 直接级联删除其下全部 Project 及 Issue/Worklog/Plan——一旦项目转为「个人拥有但挂在工作区」，删除工作区即销毁个人数据 | `workspaces/views.py` delete 分支（无项目存在性守卫）+ Project.workspace CASCADE | 契约测试：有项目的 ws DELETE → 应 4xx；Phase 2 落地 |
| R-02 | 潜在 | **ActivityLog 随 Workspace/Project 删除级联消失**：审计数据无独立生命周期 | `activity/models.py` workspace/project 双 CASCADE | 迁移决策记录（Phase 2） |

## High

| ID | 类型 | 风险 | 证据 | 验证方法 |
|---|---|---|---|---|
| R-03 | 已确认 | Island overview WS 失效 worklog 缓存 queryKey 前缀失配（`["worklogs"]` vs `["projects","worklogs",slug,pid,date]`）→ Agent 写日志后面板不刷新 | `features/realtime/overview.ts:60,105` vs `features/project/hooks.ts:90` | E2E：agent 写 worklog → Island 无刷新出现 |
| R-04 | 已确认 | React Query 4xx 不重试谓词永不命中（regex `/^\d{3}$/` vs message `"API 404"`）→ 4xx 重试 2 次 | `components/providers/QueryProvider.tsx:30` vs `lib/api.ts:35` | 单测 |
| R-05 | 已确认 | Stage `order` 可写但 `uniq_stage_order_per_plan` 冲突未捕获 → 500；无重排服务 | `projects/serializers.py:179` + `services.py` | 单测：PATCH order 撞号 → 应 400 |
| R-06 | 已确认 | `agent_session_end` 无幂等回放（其余 7 个写动作都有） | `agents/views.py:350-361` | 单测：同 key 重复 end → 回放 |
| R-07 | 已确认（产品层） | 个人冷启动断层：注册后引导「先去创建一个工作区」；workspace 是个人工程的组织性前提 | `app/(protected)/page.tsx:88-92` + `projects/models.py` workspace 必填 | Phase 2/5 验收场景 |
| R-08 | 已确认 | smoke 测试数据污染真实运行库（2 用户 + smoke-ws 工作区） | runtime SQLite 只读统计 | 数据清理（Phase 9 或独立运维动作，不混入代码提交） |

## Medium

| ID | 类型 | 风险 | 证据 |
|---|---|---|---|
| R-09 | 潜在 | 作用域税：每请求 resolve_workspace→双层成员查询→effective_role（真实规模 1 用户 0 协作者） | `core/permissions.py` |
| R-10 | 潜在 | 三表只增不删：IdempotencyRecord / TaskRun / Notification（只写不读） | `jobs/models.py`、`agents/models.py` |
| R-11 | 潜在 | `NEXT_PUBLIC_API_BASE`/`NEXT_PUBLIC_WS_BASE` 独立默认值，改一漏一 WS 静默指错 | `lib/api.ts` + `realtime/policy.ts` |
| R-12 | 潜在 | 批量写双语义（202+TaskRun vs 前端逐条循环）契约表述分裂 | BulkActionBar vs issues/bulk/labels |
| R-13 | 结构 | 三个「task」语境并存（features/issue、features/task、agent/tasks） | 前端目录 + Agent urls |
| R-14 | 已确认 | Alt+I 双注册（AppShell + EngineeringIsland），桌面 `/island` 一次按键两次 toggle | layout.tsx + useIslandHotkey.ts |
| R-15 | 已确认 | `primeCsrf` 死代码；agents feature 无 hooks 层、queryKey 散落组件 | lib/api.ts、AgentTokenCard.tsx |
| R-16 | 潜在 | CSRF 自愈对所有 403 重试一次（含权限 403），多余往返 | lib/api.ts |

## Low

| ID | 类型 | 风险 | 证据 |
|---|---|---|---|
| R-17 | 卫生 | IslandCarousel/IslandSheet V1/V2 遗留无引用 | engineering-island/index.ts |
| R-18 | 卫生 | `User.date_joined` 与 `created_at` 并存 | users/models.py |
| R-19 | 潜在 | 登录限流为进程内存版，多 worker 部署不共享（README 已自知） | users/services.py |

## 产品决策项（非缺陷，Phase 1 冻结）

| ID | 决策 |
|---|---|
| D-01 | 所有制模型：方案 B（Project.owner 必填 + workspace 可空）——用户已拍板，Phase 1 出 ADR |
| D-02 | Task↔Stage：可选单关联（多 Task 归属一 Stage，允许无 Stage）；删 Stage 置空不删 Task |
| D-03 | progress 无 Stage 时回退：`progress_source = "plan" | "tasks"` 字段化 |
| D-04 | NOW/NEXT/last_activity 的唯一定义与计算位置（单一函数） |
| D-05 | JobRun 术语：对外 `tasks→tasks`（业务）与后台轮询端点命名是否改 `jobruns`（Phase 3 ADR） |

## 结论（一页版）

**必须改**（阻碍目标模型）：R-01/R-02（删除级联策略）、workspace 必填（模型）、Issue↔Stage 关联缺失、API workspace 嵌套、前端 slug 硬依赖、R-07 冷启动。
**应修**（独立缺陷，顺各阶段修）：R-03/R-04/R-05/R-06（Phase 2/3 内完成）、R-11/R-14/R-15/R-16（Phase 4）。
**保留不动**：权限唯一判定点结构、幂等机制、实时层协议（推送非事实源）、桌面壳层、测试体系。
**暂不值得改**：R-17/R-18/R-19；R-09 在新 resolver 内自然缓解（owner 短路）；R-10 保留策略放 Phase 9。
