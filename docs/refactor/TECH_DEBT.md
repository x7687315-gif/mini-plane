# 技术债登记簿

> 建立：2026-10-24 · 最后更新：2026-10-25（Phase 5.5 稳定化后）
> 处置策略：稳定化批次先清“会让门禁失真/用户可见”的项；其余按 Phase 6–9 排期。

## TD-01 · E2E 共享会话在完整套件中途失效（✅ 已修复 2026-10-25）

**根因**：`apiClient()` 用 `request.newContext()` 时继承了测试的 `storageState`（共享登录态）。
Island 空态用例在同一上下文注册新账户；Django `login()` 发现当前会话已登录的是另一个用户，
按安全语义 `flush()` 旧会话，删掉了 `.auth/user.json` 指向的共享 session。后续所有 UI 用例被打回 `/login`。

**修复**：`frontend/tests/e2e/helpers.ts` 的 API 客户端显式使用空 cookie 罐
`storageState: { cookies: [], origins: [] }`；API 客户端自己 `ensureAccount`。
**证据**：完整套件 39/39 通过（setup 另计），后端 387 绿。

## TD-02 · Workspace 删除守卫引发的 E2E 工作区堆积（清理逻辑已修，存量待清）

`helpers.ts` 已改为“先删工程再删工作区”；dev Postgres 里历史 `e2e-workspace-e2e-2026-09-{2..5}`
仍建议一次性清理（数据运维动作，不进代码提交）。

## TD-03 · smoke 数据污染真实运行库（Phase 0 R-08）

`runtime/miniplane.sqlite3` 内混入 `smoke_*` 用户与 `smoke-ws` 工作区。处置：备份 → 删除。

## TD-04 · 兼容路由退役（Phase 9 已收敛为“显式退役条件”）

前端/桌面已零调用兼容业务路由；本机与工作区搜索未发现外部 Agent 消费者。
Phase 9 **保留**薄 deprecated 适配器（避免无法穷尽证明的远端消费者静默断裂），
退出条件写入 [`docs/api/10-canonical-projects.md`](../api/10-canonical-projects.md) §3：
一个发布周期内旧路径访问为零 + 外部 Agent 使用方确认迁移后删除。
当前所有兼容路由仍委托同一 service，OpenAPI 标记 deprecated。

## TD-05 · 旧契约文档 deprecated 横幅（✅ 已完成 2026-10-28）

`docs/api/03–07` 已逐文件加历史兼容横幅，指向 10 号规范契约；不再被误读为当前路径。

## TD-06 · 预留 hooks 复查（✅ 已完成 2026-10-28）

`createLabel/updateLabel/deleteLabel` 与项目成员写 hooks/API 无 UI 消费者，已从前端删除；
`useProjectActivities` 已接线；`useUpdateWorklog` 未存在（Worklog 仅创建/删除 UI）。
后端端点保留（Agent/未来管理界面可用），前端不再保留死接口。

## TD-07 · 组件级 Issue→Task 语义更名（保留历史命名）

`useIssues/useIssue/IssueDrawer` 等内部名仍用历史名；公共 API/类型/路由已统一 Task。
按计划 §6「不把后端 Issue 改名为新 app」，本轮只保证用户可见语义与契约统一；
组件内部重命名成本高、收益低，登记为可选的后续重构，不影响功能。

## TD-08 · 私人工程独立路由（✅ 已解决，Phase 5 C3）

`/projects/[pid]` 工程台已上线，旧 `/w/{slug}/projects/[pid]` 为服务端重定向。

## TD-09 · 任务抽屉完整 v2 化（UI 余项）

字段区仍是 `EditableField` 盒装样式，与模板的“手写横线行”不一致。
余项：状态/优先级/阶段/指派/标签改为 dfield 行样式（乐观更新逻辑保持不动）。

## TD-10 · E2E 适配清单（✅ 主体完成 2026-10-25）

- filter-bulk：搜索/状态筛选已改为 URL 状态；行内补状态名与标签；行定位 helper 改为
  `getByRole("button", name=/^select E2E-n\b/)`，不再依赖 xpath DOM 深度。
- 分页：工程台使用 `per_page=100` + `page` URL 参数，超过一页显示上一页/下一页。
- 新 E2E：完整 39 条已全绿（新增 Anatomy V2 2 条）；「初见上手屏」独立用例仍未单独覆盖。

## TD-11 · 后端一致性/安全余项（Phase 7 已完成 5/6）

已在本轮修复：Agent 写端点补角色 ≥ Member；session.progress 部分更新不再清空兄弟字段；
canonical 列表 WS Admin 角色；Agent 无 slug；非法 `workspace_id` 400；Workspace 角色变更广播。

Phase 7 追加完成：
1. 幂等改为 `(token,key)` 唯一 + 前置占位 + body 指纹 + 24h TTL；同键不同 action/body → 409；
   并发由唯一约束兜底（SQLite 无行锁，按 Django 文档保留约束方案）。✅
2. `AgentSession` 部分唯一约束 `(project) WHERE running`；迁移关闭历史重复 running（保留记录）；
   重复 end → 400。✅
3. Worklog 唯一 service（用户/Agent 共用）；创建/修改/删除写 Activity + 广播；作者或项目 Admin 才能改删；
   `ActivityLog.project` 改 SET_NULL，工程删除后审计保留。✅
4. Issue 增 `assignee/created_by` 索引；`AgentToken.touch()` 60s 节流。`/projects/mine/` 仍不分页
   （个人工程量级；首页需要全量），`_recent_done_titles/_latest_logs` 仍为批量取回后截断，
   登记为可接受的性能边界，等项目数显著增长再改用窗口函数。⚠️ 部分保留
5. `READ_TASK` 新增 `GET /agent/projects/{pid}/tasks/` 实际端点。✅
6. `add_stage` 锁 Plan 行 + 唯一约束转 400。✅

## TD-12 · 桌面产物与源码漂移（交付纪律）

`dist/MiniPlane/MiniPlane.exe` 曾是 2026-10-17 的 V2 双窗壳层，而 `dist/MiniPlane/app` 已是新前端。
Phase 8 已再次重建：`scripts/package.py` → `dist/mini-plane-1.0.0-local-20261028-010626`；
`desktop/build.py --portable` → `dist/MiniPlane/MiniPlane.exe`（旧 backend 备份为 `backend.old-1028-0110`），
并用 `MINIPLANE_NO_WINDOW=1 MiniPlane.exe` 完成 SQLite 栈自检
（`[selftest] stack ready …` + `services stopped`）。
纪律不变：**改前端后必须 `python scripts/package.py` + `desktop/build.py --portable`**。

## TD-13 · zod <4.6.6 生产依赖 high（2026-10-29）

- 审计：`GHSA-mrhx-c7xc-m3w5`（oversized constrained collections 内存耗尽）；
  实际使用在 5 个前端表单（登录/工作区/成员/项目/注册），没有 array/record 的 max 约束。
- 迁移尝试：zod 4.6.6 + `@hookform/resolvers` 5 会破坏成员表单
  `z.coerce.number().int()` 的类型推导（`typecheck` 失败），已回退。
- 处置：第一阶段保留 zod 3，记录影响范围；下一轮做 zod 4 + resolvers 5 的独立迁移与回归，
  不为了审计全绿强行升级。

## TD-14 · Phase I 14 天日常使用验收（时间门禁）

- 当前不能由开发/测试替代；模板见 [`docs/PHASE_I_DAILY_USE_LOG.md`](../PHASE_I_DAILY_USE_LOG.md)。
- 14 天结束后按「必须修复 / 值得优化 / 暂缓处理」分类，再正式关闭 Phase I。
