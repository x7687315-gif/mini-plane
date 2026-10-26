# 技术债登记簿

> 建立：2026-10-24 · 最后更新：2026-10-25（Phase 5.5 稳定化后）
> 处置策略：稳定化批次先清“会让门禁失真/用户可见”的项；其余按 Phase 6–9 排期。

## TD-01 · E2E 共享会话在完整套件中途失效（✅ 已修复 2026-10-25）

**根因**：`apiClient()` 用 `request.newContext()` 时继承了测试的 `storageState`（共享登录态）。
Island 空态用例在同一上下文注册新账户；Django `login()` 发现当前会话已登录的是另一个用户，
按安全语义 `flush()` 旧会话，删掉了 `.auth/user.json` 指向的共享 session。后续所有 UI 用例被打回 `/login`。

**修复**：`frontend/tests/e2e/helpers.ts` 的 API 客户端显式使用空 cookie 罐
`storageState: { cookies: [], origins: [] }`；API 客户端自己 `ensureAccount`。
**证据**：完整套件 37/37 通过（setup 另计），后端 387 绿。

## TD-02 · Workspace 删除守卫引发的 E2E 工作区堆积（清理逻辑已修，存量待清）

`helpers.ts` 已改为“先删工程再删工作区”；dev Postgres 里历史 `e2e-workspace-e2e-2026-09-{2..5}`
仍建议一次性清理（数据运维动作，不进代码提交）。

## TD-03 · smoke 数据污染真实运行库（Phase 0 R-08）

`runtime/miniplane.sqlite3` 内混入 `smoke_*` 用户与 `smoke-ws` 工作区。处置：备份 → 删除。

## TD-04 · 兼容路由退役（Phase 9）

前端已零调用兼容业务路由；外部 Agent 消费者已确认不存在。退役动作：
删各 views 的兼容壳 + `apps/projects/urls.py` 的业务段（保留工作区列表所需端点）+ 契约迁移表更新。

## TD-05 · 旧契约文档 deprecated 横幅（Phase 9）

`docs/api/03–07` 尚未逐文件加 deprecated 横幅；索引层与 10 号契约已标注。

## TD-06 · 预留 hooks 复查（Phase 9）

`createLabel/updateLabel/deleteLabel`、项目成员写、`useProjectActivities`、`updateWorklog`
仍无 UI 消费者。UI 重构已落地，复查后接线或裁剪。

## TD-07 · 组件级 Issue→Task 语义更名（未完成）

`useIssues/useIssue/IssueDrawer` 等导出名与组件名仍用历史名；类型层已有 `Task` 别名。

## TD-08 · 私人工程独立路由（✅ 已解决，Phase 5 C3）

`/projects/[pid]` 工程台已上线，旧 `/w/{slug}/projects/[pid]` 为服务端重定向。

## TD-09 · 任务抽屉完整 v2 化（UI 余项）

字段区仍是 `EditableField` 盒装样式，与模板的“手写横线行”不一致。
余项：状态/优先级/阶段/指派/标签改为 dfield 行样式（乐观更新逻辑保持不动）。

## TD-10 · E2E 适配清单（✅ 主体完成 2026-10-25）

- filter-bulk：搜索/状态筛选已改为 URL 状态；行内补状态名与标签；行定位 helper 改为
  `getByRole("button", name=/^select E2E-n\b/)`，不再依赖 xpath DOM 深度。
- 分页：工程台使用 `per_page=100` + `page` URL 参数，超过一页显示上一页/下一页。
- 新 E2E：完整 37 条已全绿（新增 Anatomy V2 2 条）；「初见上手屏」独立用例仍未单独覆盖。

## TD-11 · 后端一致性/安全余项（Phase 7）

已在本轮修复：Agent 写端点补角色 ≥ Member；session.progress 部分更新不再清空兄弟字段；
canonical 列表 WS Admin 角色；Agent 无 slug；非法 `workspace_id` 400；Workspace 角色变更广播。

仍开放（按优先级）：
1. Agent 幂等 `_replay`/`_remember` 非原子（并发同 key 可执行两次）；`IdempotencyRecord` 无 TTL。
2. `AgentSession` 可同时存在多个 running；`session.end` 重复结束会刷新 `ended_at`。
3. `ActivityLog.project=CASCADE`：删工程会丢审计；Worklog 变更不写审计/广播；
   团队工程任意 Member 可改删他人 Worklog。
4. `/projects/mine/` 不分页；`_recent_done_titles`/`_latest_logs` 全量拉回 Python 再截断；
   Issue 缺 assignee/created_by 索引；`AgentToken.touch()` 每请求一写。
5. `AgentScopes.READ_TASK` 未被任何端点使用。
6. `add_stage` max(order)+1 并发冲突未转 400。

## TD-12 · 桌面产物与源码漂移（交付纪律）

`dist/MiniPlane/MiniPlane.exe` 曾是 2026-10-17 的 V2 双窗壳层，而 `dist/MiniPlane/app` 已是新前端。
已在 2026-10-26 稳定化批次重建：`package.py` → `build.py --portable`（exe 09:00 后时间戳），
并用 `MINIPLANE_NO_WINDOW=1 MiniPlane.exe` 完成 SQLite 栈自检（ready + services stopped）。
纪律不变：**改前端后必须 `python scripts/package.py` + `desktop/build.py --portable`**。
