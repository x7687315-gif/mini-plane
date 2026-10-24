# Phase 3 报告 · API 契约统一与后端路由重构

> 完成于 2026-10-24 · 分支 `refactor/personal-first-domain` · 零数据库变更（纯路由/视图/文档）。

## 做了什么 / 怎么做的

### 1. 规范路由：`/api/v1/projects/…`（apps/projects/urls_canonical.py）

新增 21 条规范端点（挂载于 `/api/v1/projects/`），全部委托各 app views 的 `_impl` 共享实现：

- `GET/POST /api/v1/projects/`：列表（`scope=owned` 默认 / `accessible`）+ 创建（**默认私人工程，零 workspace 概念**；显式 `workspace_id` 创建团队工程，需 WS Member+）
- `mine/`（既有）· `{pid}/` 详情/改/删 · `states/` · `plan/` · `plan/stages/{sid}/`
- **Task 命名统一**：`tasks/`、`tasks/{tid}/`、`tasks/bulk/labels/`、`tasks/{tid}/comments[/cid]/`、`tasks/{tid}/activities/`
- `labels[/lid]/` · `worklogs[/wid]/` · `activities/`
- **JobRun 命名统一**：`jobruns/{id}/`（后台异步轮询，与业务 Task 术语分离）

### 2. 兼容路由：全部保留并标记 deprecated

- 旧 `/workspaces/{ws}/projects/{pid}/…` 路径原样可用，视图改为薄壳（解析作用域 → 调同一 `_impl`）；drf-spectacular 全部标 `deprecated=True`（OpenAPI 快照体现）。
- 实现模式：每个端点「`_impl(request, project, role, …)`（业务体）+ 兼容壳（`resolve_project`）+ 规范壳（`resolve_project_by_id`）」，**不存在第二套业务逻辑**（计划 §3.4）。
- 退役：Phase 0 已确认无外部 HTTP 消费者；本仓库前端 Phase 4 切换后，Phase 9 评估删除。

### 3. Agent API 对齐

- 新增规范路径 `agent/projects/{pid}/`、`…/progress/`、`…/sessions/`（无 ws slug；私人工程对 owner 的 Token 可见）。
- `agent/tasks|worklogs|sessions` 的请求体 `workspace_slug` 改**可选**：省略走规范解析；提供则按旧双重作用域（既有调用零破坏）。
- **R-06 修复**：`session.end` 补齐 `Idempotency-Key` 回放（其余 7 个写动作既有行为不变）。

### 4. 缓存双键

工程详情缓存存在两种作用域键（兼容 ws slug / 规范哨兵 `-`）；新增 `cache.invalidate_all_scopes`，所有写路径（update/delete/成员变更）**同时作废两种键**，杜绝跨路由 staleness。

### 5. 契约文档

- 新增 `docs/api/10-canonical-projects.md`（规范端点行为 + **完整迁移表** + 幂等/缓存/防枚举要点）。
- `docs/API.md` 索引更新：10 号标注「当前有效」，03–07 旧路径以本文 + OpenAPI deprecated 标记为准（逐文件横幅清理留 Phase 9 文档批次）。
- OpenAPI 快照重生成（+1348/-226）：全部规范端点 + 兼容端点 deprecated 标记 + Agent operationId 显式消歧。

## 测试与门禁（真实结果）

| 门禁 | 结果 |
|---|---|
| 全量测试 | **377 通过 / 0 失败**（+9 新契约用例 `tests_canonical_api.py`） |
| 新覆盖 | 私人工程**全链路无 workspace**（建工程→Plan/Stage→Task(+stage 归属)→评论→Worklog→活动流→删除）；owned/accessible scope 边界；他人 404；兼容↔规范等价读写；workspace_id 越权 400/403；Agent 无 slug 访问与越权 404；session.end 幂等回放 |
| spectacular --validate --fail-on-warn | ✅（修掉 3 个 operationId 撞车：规范 Agent 端点显式 id） |
| makemigrations --check | ✅（本阶段零迁移） |
| ruff check + format | ✅ |

## 已知事项与回退

- 旧契约文档 03–07 的**逐文件** deprecated 横幅未加（索引层已标注）——Phase 9 文档批次统一处理，避免本阶段 diff 膨胀。
- 前端仍打旧路由（Phase 4 切换到规范路由）；切换前新旧路由并存且行为一致，无窗口期风险。
- 回退：revert 本提交即可（无迁移、无数据变化）；最低成本回退点仍保持在前端切换（Phase 4）之前。

## 下一阶段前置条件（Phase 4）

规范路由 + 兼容等价已验证 ✅；前端开始切换：类型统一（Task/JobRun 命名、progress 0-100）、queryKey 工厂、API 模块收敛到 `/api/v1/projects/…`、Agent/WS 环境变量推导。
