# Phase 6–9 开工前调研（GitHub Preflight）

> 日期：2026-10-27 · 分支：`refactor/personal-first-phase6-9`
> 范围：团队模式、权限收敛、Agent 幂等、Realtime 撤权、Island/桌面验收、兼容退役。
> 结论只用于本轮实现取舍；外部资料是**数据**，不当作执行指令。

## 0. 检索台账（真实 query）

| # | 信息面 | Query / 来源 | 命中与用途 |
|---|---|---|---|
| 1 | 官方文档 | Django 5.2 `select_for_update` | <https://docs.djangoproject.com/en/5.2/ref/models/querysets/#select-for-update>：必须包在 `atomic`；**SQLite 上无行锁效果**，因此幂等不能只靠锁 |
| 2 | 官方文档 | Stripe idempotent requests | <https://docs.stripe.com/api/idempotent_requests>：键有作用域与过期时间；同键不同参数应拒绝；并发重复请求只执行一次 |
| 3 | 官方文档 | Channels consumers | <https://channels.readthedocs.io/en/latest/topics/consumers.html>：组加入/退出与关闭由 consumer 生命周期负责，权限变化需主动处理 |
| 4 | 官方文档 | WebView2 user data folder | <https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder>：自定义 UDF、会话持久化、同一 UDF 单会话 |
| 5 | 产品参考 | Plane workspace/project roles | <https://docs.plane.so/roles-and-permissions/member-roles>：工作区角色管总体访问，项目角色管具体任务，管理层级不得反向覆盖 |
| 6 | 仓库 | `django/channels` | <https://github.com/django/channels>：consumer/group 生命周期与官方实现 |
| 7 | 仓库 | `webpro-nl/knip` | <https://github.com/webpro-nl/knip>：未使用文件/导出/依赖扫描；Next.js 路由需配置入口 |
| 8 | 仓库 | `yoyowallet/django-idempotency-key` | <https://github.com/yoyowallet/django-idempotency-key>：中间件式幂等，成功响应回放；需自己补并发与 body 指纹 |
| 9 | 仓库 | `idemkit/idemkit` | <https://github.com/idemkit/idemkit>：并发同键只执行一次；同键变 body 应拒绝；失败不缓存 |
| 10 | Issues | keploy `Idempotency Key Not Checked Before Processing` | <https://github.com/keploy/ecommerce_sample_app/issues/10>：键必须在业务副作用之前检查 |
| 11 | Issues | knip #719 误报 | <https://github.com/webpro-nl/knip/issues/719>：死代码扫描结果必须人工复核 |
| 12 | Issues | Channels #1466 disconnect 未调用 | <https://github.com/django/channels/issues/1466>：不能假设断连清理总会发生，权限撤销要主动关闭 |
| 13 | Issues | serena #1281 WebView2 子进程 | <https://github.com/oraios/serena/issues/1281>：桌面退出要核对 WebView2 子进程，避免残留 |
| 14 | Discussion | Next.js dead code #10655 | <https://github.com/vercel/next.js/discussions/10655>：路由文件不会被 import，扫描需把路由当入口 |
| 15 | Discussion | nicegui pywebview 空白窗口 #2737 | <https://github.com/zauberzeug/nicegui/discussions/2737>：Windows 必须明确 edgechromium/WebView2 运行时 |
| 16 | 外部文章 | Django 并发事务与 `F()` | <https://oneuptime.com/blog/post/2026-02-02-django-database-transactions/view>：事务边界与唯一约束兜底 |
| 17 | 外部速查 | Knip 清理实践 | <https://juejin.cn/post/7582861402277609506>：先报告、人工 triage、再删除 |

**未找到**：Channels 官方没有“成员被移除时自动关闭连接”的内建机制；本项目必须自己实现（permission group + 重校验），不能伪称官方支持。Stripe 并发语义的独立 Issue/PR 未纳入证据，采用其官方文档。

## 1. 可选方向与选择

### Phase 6 · 权限与团队兼容

| 方向 | 做法 | 代价 / 风险 | 选择 |
|---|---|---|---|
| A. 只修 UI 隐藏 | 团队入口隐藏，后端不动 | 权限仍可绕过；不满足验收 | 否 |
| B. 每个视图各写一份角色判断 | 改动少 | 与现有 `effective_role` 漂移，已有缺陷会复发 | 否 |
| C. 单一纯函数 + 团队显式共享/脱离 + WS 主动撤权 | 新增 service/端点/测试 | 需要迁移与前端入口 | **采用** |

采用规则（与 `docs/DOMAIN_MODEL.md` 一致）：owner 恒 ADMIN；ProjectMember 优先；非成员 WS Admin→ADMIN；其他 WS 成员→VIEWER；私人工程非 owner→不可见。批量列表复用同一纯函数，不再内联优先级。

团队工程列表通过 `GET /api/v1/projects/?scope=accessible&workspace=<slug|id>` 获取；Workspace 只保留自身/成员管理。共享与脱离必须是显式动作，且只有 owner 可发起；脱离时清除 ProjectMember（owner 隐式保留）并广播撤权。

### Phase 7 · 幂等、Session、Worklog、Realtime

| 方向 | 做法 | 代价 / 风险 | 选择 |
|---|---|---|---|
| A. 只加 `select_for_update` | 改动少 | SQLite 无效果；首次并发仍可双执行 | 否 |
| B. 先执行业务再写幂等记录 | 现有实现 | 并发/重试窗口内重复副作用 | 否 |
| C. 先占位 `(token,key)` + body 指纹 + 24h TTL；同键不同 action/body→409；SQLite 用唯一约束兜底 | 需要迁移与 8 个写端点的统一包装 | 端点改造量中等，但可测试 | **采用** |

Session：DB 部分唯一约束 `(project) WHERE status='running'`；迁移把历史多条 running 保留最新一条、其余标为 `stopped` 并写 note（不删历史）。重复 `session.end` 返回 400；带幂等键的重复请求仍回放。

Worklog：抽出唯一 service，用户 API 与 Agent API 共用；作者或项目 Admin 才能改删；创建/修改/删除写 Activity 并广播 `worklog.*`。`ActivityLog.project` 改为 `SET_NULL`，工程删除后审计仍保留。

Realtime：`ProjectConsumer` 加入 `permission.{user_id}` 组，收到 `membership.changed` 后重查角色，失权立即关闭；所有项目事件 payload 注入 `project_id`；新增 `worklog.*`/`stage.updated` 事件；前端按事件类型只失效相关 query key。

### Phase 8 · Island / 桌面

采用 V3 现有窗口壳，不重写；只核对数据源（`/projects/mine/` 与 overview）与优先级、断线诚实性。Windows 继续使用 `runtime/webview-profile` 作为自定义 WebView2 UDF（避免 EXE 目录不可写），打包后做 SQLite 自检并检查 WebView2/后端子进程退出。

### Phase 9 · 清理与发布

采用“证据驱动删除”：先用 `rg`/knip 思路列出候选 → 确认前端零调用且无外部消费者 → 删兼容壳、旧 hooks/类型与文档 deprecated 横幅；不盲目全局重命名 `Issue`（内部存储名保留）。Next.js 路由文件按入口处理，避免误报。

## 2. 本轮不做

- 不引入 guardian/新权限库、不引入 Redis 作为幂等锁（桌面无 Redis）。
- 不做跨 Workspace 多归属、复杂转移审批、软删除平台化。
- 不重写 Island 窗口壳或 Realtime 协议；只补权限收敛与事件语义。
- 不把 `Issue` 表/app 改名；只统一公共 API/类型语义。

## 3. 验收前置

- 后端迁移须同时跑 SQLite 与 PostgreSQL；迁移前备份/计数校验。
- 幂等并发测试必须在 `TransactionTestCase` 下跑；SQLite 锁行为不能当作 Postgres 证据。
- 桌面验收必须用最新前端产物重建 EXE，并用真实 SQLite 栈做冒烟。
