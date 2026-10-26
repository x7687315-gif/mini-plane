# 2026-10-25 · Phase 5.5 稳定化（回归修复 + E2E 门禁）

> 分支：`fix/phase5-stabilization`（从 `origin/main` `2bba371` 起）
> 范围：Phase 5 / 解剖图之后暴露的可见回归、安全一致性、E2E 失真与交付漂移。
> 结果：后端 **387** 绿、前端 **143** 单测 + typecheck/lint/build 绿、Playwright **34/34** 绿。

## 1. 为什么要做这一轮

Phase 5 把个人版 UI 与工程台一次性换掉后，单测与构建仍然绿，但“看起来绿”掩盖了几类问题：

- 首页在 layout 的 AppShell 外又套了一层 AppShell（双 TopBar / Alt+I 双触发）；
- 工程台重写后没有接 `useProjectRealtime`，项目通道形同虚设；
- canonical 路由没有项目成员端点，工程台用空 slug 打兼容路由；
- 批量任务轮询被 `slug` 非空条件挡住；
- 解剖图用字符串拼 SVG + `dangerouslySetInnerHTML`，阶段名未转义；
- 完整 E2E 在套件中段集体被打回 `/login`（TD-01），CI 又不跑 E2E。

## 2. 前端修复

| 问题 | 修复 |
|---|---|
| 首页双壳 | 移除页面内 `AppShell`，统一由 `(protected)/layout` 提供 |
| 工程实时失联 | 工程台挂载 `useProjectRealtime("", pid)`，走 `ws/projects/{pid}/` |
| 成员 404 | 成员 API 切 canonical `/projects/{pid}/members/` |
| 批量轮询 | `useTaskRun` 只要求 `projectId + jobRunId`，slug 不再参与 |
| 首页聚合 stale | `useUpdateProject/useDeleteProject` 失效 `projectKeys.mine()` |
| AuthGuard 丢深链 | redirect 带上 `window.location.search` |
| 工作台筛选退化 | 状态/搜索写回 URL；`per_page=100` + `page`；行显示状态名与标签；分页按钮 |
| 抽屉关不干净 | 关闭时同时删 `issue` 与 `tab`；非法 tab 走 `normalizeDrawerTab` |
| 解剖图安全/交互 | 用户文本 `esc()` 转义；越界 focus 退化；SVG 阶段/任务点击接线；索引行键盘可达 |

## 3. 后端修复

- **canonical 项目成员**：`GET/POST /projects/{pid}/members/`、`PATCH/DELETE /members/{mid}/`。
  私人工程 GET 返回 owner 的隐式 ADMIN 成员，任务指派允许 owner；私人工程成员写操作 400。
- **Agent 角色门槛**：所有 Agent 写端点补 `require_write_role`（≥ Member），
  团队 WS Viewer 不能借 Token 绕过 HTTP 权限矩阵。
- **session.progress**：serializer 不再用 `default=""`，只更新请求中出现的字段；
  部分上报不会清空 current_step / method_summary / step_total。
- **canonical 列表角色**：`scope=accessible` 批量取 workspace roles，WS Admin 不再被标成 VIEWER。
- **Workspace 角色变更**：补 `membership.changed` 广播；删除工作区也通知成员收敛订阅。
- **非法 workspace_id**：捕获 Django `ValidationError`，400 而不是 500。
- **实时总览根因**：`broadcast()` 组消息补顶层 `project_id`。OverviewConsumer 按它过滤，
  缺字段导致 Island 永远收不到项目事件（Agent → Island / worklog 刷新都不动）。

## 4. E2E 根因与门禁

**TD-01 根因**：`apiClient()` 的 API 上下文继承了测试的 `storageState`。Island 空态用例
用同一上下文注册新账号，Django `login()` 检测到会话已登录另一个用户 → `flush()` 旧会话，
删掉共享 session。修复为 API 客户端始终使用空 cookie 罐（自己 `ensureAccount`）。

**LIVE 语义**：overview 的 `connected` 只代表握手，`subscriptions` 回执才代表订阅生效；
`useEngineeringOverview` 改为只在 `subscriptions` 后置 live，避免“看起来已连接但事件丢失”。

**测试适配**：`issueRow` 改为按行按钮 aria-label 定位；首页进度断言改用 progressbar；
Island 断开断言看 Island 自己的 LIVE，而不是主窗口 TopBar（Island 不建项目通道）。

**CI**：新增 `e2e` job（Postgres + 真实后端 + Next dev + Chromium，跑完整 34 条）；
backend job 增加 desktop 状态机单测（零依赖）。CI 现在三个 job。

## 5. 门禁结果（本机真实运行）

| 门禁 | 结果 |
|---|---|
| 后端全量 | 387 OK |
| ruff check / format | 通过（本轮改动文件已格式化） |
| makemigrations --check | 无漂移 |
| spectacular --validate --fail-on-warn | 通过（OpenAPI 已重生成） |
| 前端 typecheck / lint | 通过 |
| 前端单测 | 143 pass / 0 fail |
| 前端 build | 通过 |
| Playwright | 34/34 pass（setup 另计，合计 35/35） |
| desktop 单测 | 13/13 + 7/7 |
| 桌面产物 | `package.py` + `build.py --portable` 重建；`MINIPLANE_NO_WINDOW=1` SQLite 栈自检 ready，退出后端口释放 |

## 6. 未完成 / 下一步

- TD-09 抽屉字段区完整 v2 化（视觉）；
- TD-11 的幂等原子性、Session 唯一 running、审计级联、Worklog 权限等（Phase 7）；
- Phase 6 脱离协作/转私人、Phase 9 兼容路由退役与文档批次；
- TD-12 桌面产物重建与真机 V3 冒烟（本轮收尾执行）。
