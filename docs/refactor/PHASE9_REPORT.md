# Phase 9 报告 · 文档、兼容状态、质量门禁与发布

> 完成于 2026-10-28 · 分支 `refactor/personal-first-phase6-9`
> 依据：Phase 9 计划 + TD-04/05/06/07/09/11/12 + `PHASE6_9_PREFLIGHT.md`
> 范围：契约文档、兼容路由状态、前端死代码、OpenAPI、全量门禁与桌面交付。

## 1. 文档索引与事实源

- 规范契约：[`docs/api/10-canonical-projects.md`](../api/10-canonical-projects.md)
  - 增补 `?workspace=` 过滤、`share/detach`、Worklog 权限、`/tasks/mine/`、Agent `read_task` 端点；
  - 增补 Phase 6–9 行为要点（权限优先级、幂等、Session、实时事件）。
- 实时契约：[`docs/api/08-realtime.md`](../api/08-realtime.md)
  - 事件从 4 个扩展到 9 个：worklog.* / stage.updated / project.updated；
  - payload 统一带 `project_id`；项目通道加入 permission 组并在撤权时主动 close(4404)。
- 历史契约 [`docs/api/03`–`07`](../api/) 全部加“历史兼容”横幅，路径以 10 号为准。
- 领域模型 [`docs/DOMAIN_MODEL.md`](../DOMAIN_MODEL.md)：共享/脱离、Project 删除审计保留、
  Session/幂等唯一约束、Worklog 改删权限同步。
- 使用指南 [`docs/使用指南.md`](../使用指南.md)：个人工程无需 Workspace、显式共享/脱离、
  生效角色说明、个人工程不展示负责人。
- README / HANDOVER 更新门禁数字（406 / 172 / 39 + setup 40）与 Phase 6–9 状态。

## 2. 兼容路由状态（明确保留，不盲删）

Phase 9 的结论不是“所有旧路径已删除”，而是**有证据的退役条件**：

- 前端与桌面已零调用 `/workspaces/{ws}/projects/…`、`/issues/…` 业务壳、Agent slug 路径。
- 本机与工作区搜索未发现 Mini Plane 的 Agent 外部消费者；但无法证明远端不存在。
- 因此保留薄 deprecated 适配器（委托同一 service），并在 10 号契约 §3 写明退出条件：
  一个发布周期内旧路径访问为零 + 外部 Agent 使用方确认迁移。
- 旧 `/api/v1/issues/mine/` 保留别名；新前端使用 `/api/v1/tasks/mine/`。
- OpenAPI 中旧路径均标 `deprecated`，CI 快照与实现一致。

这保留了“同一实现、可退役、不破坏外部消费者”的重构成功定义；没有为了路径数量牺牲兼容性。

## 3. 前端死代码清理

- 删除无 UI 消费者的 `createLabel/updateLabel/deleteLabel` API + hooks；
- 删除无 UI 消费者的项目成员写 API/hooks（保留成员读取，供指派/抽屉）；
- 删除对应未使用类型 `CreateLabelPayload/UpdateLabelPayload/AddProjectMemberPayload`；
- `/api/v1/tasks/mine/` 切换后，`listMyIssues` 不再走旧 `/issues/mine/`。
- `TaskRun` 仅保留为 JobRun 的历史存储/序列化名；公共契约使用 JobRun。

## 4. 测试与发布门禁（真实运行）

| 门禁 | 结果 |
|---|---|
| 后端全量 | **406 pass / 0 fail** |
| ruff check + format --check | 通过 |
| 迁移漂移 `makemigrations --check` | 无变化 |
| OpenAPI `spectacular --validate --fail-on-warn` | 通过；`docs/api/openapi.yaml` 已重生成 |
| 前端 typecheck / lint | 通过 |
| 前端单测 | **172 pass / 0 fail** |
| 前端生产构建 | 通过 |
| Playwright 全量 | **40/40 pass（含 setup；业务 39）**（真实 Postgres + 后端 + Next dev） |
| 桌面 SQLite 自检 | `stack ready` + `services stopped` |
| 桌面包 | `dist/MiniPlane/MiniPlane.exe` + app/backend，源包 `20261028-010626` |

E2E 期间修正了两类**真实回归**：

1. dev 栈启动不自动迁移 → Agent session 500；已应用迁移并登记为发布步骤。
2. Agent E2E 把同一个 `Idempotency-Key` 同时用于 `session.start` 和 `session.end`；
   新语义下同键不同 action 必须 409。测试改为每个动作独立 key——这正是契约要防的误用。
3. Anatomy E2E 私人工程固定 identifier，重复跑会 400；改为每轮随机 3 位后缀。

## 5. 最终验收对照

- 全新用户不建 Workspace 即可完成个人工程闭环：✅ 首页直接建工程；E2E 与 API 测试覆盖。
- 核心 API 不把 Workspace 当 Project 必需上下文：✅ 规范路由只凭 `project_id`。
- 规范 API/OpenAPI/前端类型/文档一致：✅ schema 校验 + 快照 diff 通过。
- 旧数据迁移无丢失：✅ Phase 2 迁移 + 本轮 Activity/SET_NULL、Session/幂等迁移；SQLite/Postgres 均有测试。
- Agent 权限/幂等/Realtime/桌面仍通过：✅ scope、409、撤权、E2E 39（+setup 40）、桌面自检。
- 所有测试结果如实记录：✅ 见上表。
- 文档冲突收敛：✅ 03–07 已标历史；10 号为路径事实源；README/HANDOVER 数字更新。

## 6. 已知限制 / 后续可选项

1. 兼容路由未删除（外部消费者无法穷尽证明）；退出条件已写入契约。
2. `/projects/mine/` 仍不分页；个人工程量级可接受，项目数显著增长后再改窗口函数/分页。
3. `TaskRun` 内部命名与 `Issue` app 名保留（计划明确不为术语整洁重写迁移历史）。
4. 桌面自检无窗口视觉；原生窗口的视觉回归仍需人工双击验收。
5. TD-09 抽屉完整 v2 视觉、DOM/动画帧率基准仍为可选后续项，不影响 Phase 9 发布门禁。

## 7. 回退

- 代码按 Phase 6–9 提交可逐段 revert；迁移回退注意：
  - ActivityLog.project 回 CASCADE 会丢失已置空审计，不建议；
  - Session 幂等迁移只改状态/删幂等缓存，业务历史保留。
- 桌面包可回退到 `dist/MiniPlane/backend.old-1028-0110` 与上一版 frontend 包。
