# 技术债登记簿（UI 重构前挂起项）

> 建立：2026-10-24 · 全局检查批次结束时。
> 处置策略：**UI 重构期间不处理**；UI 重构完成、形成整体后回头集中分析修复，再跑全量验证并推送。
> 本文件是挂起项的唯一登记处；新债随发现随登记，避免散落在对话里。

## TD-01 · E2E 共享会话在完整套件运行中途失效（挂起·最高优先）

**现象（已复现 3 次，确定性）**：
- 全量 Playwright（34 用例）固定 **26 过 / 8 失败**，失败集中在套件**尾部的 4 个文件**（issue-thread / mode-switch / realtime / agent-island-loop）；
- 失败页快照全部显示**会话丢失被打回 /login**（顶栏变登录页、`polling` 态）；
- 隔离运行（setup + 任意单个 spec 组合）**全部通过**；
- 串行（--workers=1）**同样 26/34**——排除并行资源竞争，是**确定性的顺序型破坏**。

**已查明的硬事实**：
1. 全量跑完后，`.auth/user.json` 里的 `sessionid` 在 Postgres `django_session` 中**行已消失**（`SELECT … WHERE session_key = %s` 返回空）——会话行是被**服务端 logout 主动删除**的，不是过期/篡改；
2. demo 用户 `e2e_owner_e2e-2026-09` 带密码（pbkdf2），setup 每轮重建；
3. `auth.spec.ts` 显式 `test.use({ storageState: { cookies: [], origins: [] } })` 且登出的是自建账户；`island.spec.ts` 空态用例用自建账户独立 context（注释自述曾出过同类事故）；
4. 二分组合（auth+issue-thread / features+issue-thread / filter-bulk+issue-thread / island+issue-thread / setup+前三者）**两两全过**——失败需要「前序累积」条件，不是单一 spec 的简单副作用；
5. dev 栈日志无 Python 异常（曾出现的 `no such column: U0.current_step` 是**迁移前的旧日志**，迁移后已消除）。

**嫌疑（未证实，按可能性排序）**：
- S1：某用例在**共享登录态的 context** 里触达了 AvatarMenu → 退出登录（或未来 IsLand/快捷键路径误触等价动作）；
- S2：Django 会话轮换语义 + 多 worker 共享 cookie jar 的交互（某请求触发 `update_session_auth_hash`/session rotate，旧 sessionid 被删）——注意 demo 用户**带密码**，若某用例走了改密/bind 路径会轮换会话；
- S3：Phase 4 新增的 `primeCsrf()`（QueryProvider 挂载播种）或 R-16 CSRF 收窄改变了 403 时序（低嫌疑：二者均不触碰 session 行）。

**排查路径建议（回头做）**：
1. 在 `users.views.logout_view` / `login_view` 临时加日志（或用 django-debug 记 session_key），全量跑一次抓「谁删了这行」；
2. 或在 `global.setup` 保存 storageState **前后 + 每个测试文件 afterAll** 各探一次 `/auth/me/`，把死亡时刻定位到具体 spec 文件；
3. 定位后按根因修（隔离登录态 / 改用独立账户 / 修前端误触）。

**波及**：E2E 门禁当前不可作为全量验收信号；后端 377 + 前端 143 单测不受影响。

## TD-02 · Workspace 删除守卫引发的 E2E 工作区堆积（已修清理逻辑，存量待清）

Phase 2 的删除守卫（有工程 → 400）使旧版 `purgeE2EWorkspaces` 只删工作区必 400，残留工作区靠 slug 后缀无限堆积（实测已到 `-5`）。`helpers.ts` 已改为「先删工程再删工作区」；**dev Postgres 里已堆积的 `e2e-workspace-e2e-2026-09-{2..5}` 工作区待一次性清理**（可手动或下次 setup 顺带）。

## TD-03 · smoke 数据污染真实运行库（Phase 0 R-08，沿用）

`runtime/miniplane.sqlite3` 内混入 2 个 `smoke_*` 用户与 `smoke-ws` 工作区。处置：备份 → 删除（数据运维动作，不进代码提交）。

## TD-04 · 兼容路由退役清单（Phase 9）

- 前端已零调用兼容路由（`/workspaces/{ws}/projects/{pid}/…` 业务路径与 `/issues/` 命名）；
- 外部 Agent 消费者已确认不存在（Phase 0）；
- 退役动作：删各 views 的兼容壳 + `apps/projects/urls.py` 的业务段（保留 workspace 列表页所需的 `GET /workspaces/{ws}/projects/`）+ 契约迁移表更新。

## TD-05 · 旧契约文档 deprecated 横幅（Phase 9）

`docs/api/03–07` 未逐文件加 deprecated 横幅（索引层已在 `docs/API.md` 标注，10 号契约为当前事实源）。

## TD-06 · 预留 hooks 复查（Phase 9）

`createLabel/updateLabel/deleteLabel`、项目成员管理三件套、`useProjectActivities`、`updateWorklog` 至今无 UI 消费者（契约 10 号已声明）。UI 重构落地后复查：接线（项目设置页/标签管理）或裁剪。

## TD-07 · 组件级 Issue→Task 语义更名（随 UI 重构顺路做）

`useIssues/useIssue/CreateIssueModal/IssueRow/IssueDrawer` 等导出名与组件名仍用历史名 `Issue`；类型层已有 `Task` 别名。UI 重构动到这些组件时一并更名，避免专门返工。

## TD-08 · 私人工程独立路由（UI 重构核心依赖）

私人工程（workspace=null）目前**无独立详情路由**：首页卡片与「我的工作」对 `workspace_slug=null` 只能渲染不可跳转降级。UI 重构的「个人工程主页」必须提供 `/projects/{pid}`（或等价）路由并迁移卡片链接——这是设计方案的阻塞级依赖，需在方案评审时一并确认。
