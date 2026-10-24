# P4 后全局检查报告（安全性 · 冗余清理 · 结构精简）

> 完成于 2026-10-24 · 分支 `refactor/personal-first-domain` · 用户指定的 UI 重构前置批次。
> 范围：Phase 0–4 全部改动的横切审查 + 全仓卫生。

## 一、全局安全性分析

### 1. 凭据与敏感数据

| 检查项 | 结果 | 动作 |
|---|---|---|
| 仓内凭据扫描（`ghp_` / `mpa_` 长串） | 源代码零命中 | — |
| 历史文档残留 | `docs/HANDOVER.md:311` 记录过一个**截断的 PAT 前缀**（自称已过期） | ✂️ 已改为不含凭据字符的表述（历史提交中的截断串无完整凭据价值，不做历史重写） |
| `runtime/`（SQLite/secret_key/WebView2 profile） | 未入库（gitignore 生效，`git ls-files runtime` 为空） | — |
| `frontend/.auth/`（Playwright 会话状态，含真实 cookie） | 未入库 | — |
| 本次重构的 GitHub 令牌 | 仅用于本次 push/PR/API 调用，未写入任何文件 | 建议用户任务结束后撤销轮换 |

### 2. 注入与查询安全（对应生成前约束）

- **SQL**：全部业务查询走 Django ORM（参数化）；仓库唯一裸 SQL 在 `benchmark_issues.py`（开发基准工具），已核实使用 `%s` 参数绑定 ✓。
- **SSRF**：后端零出站 HTTP（无 requests/urllib/httpx）——约束适用面为零 ✓。
- **XSS/序列化**：DRF 序列化输出，前端 React 转义；本轮无新增 `dangerouslySetInnerHTML`。

### 3. 授权面（Phase 2/3 新端点）

| 面 | 机制 | 验证 |
|---|---|---|
| 规范路由 `/api/v1/projects/{pid}/…`（21 端点） | 全部经 `resolve_project_by_id`：owner 短路 → 团队双层角色 → **非可见统一 404（防枚举）** | `tests_canonical_api.py` 9 用例（他人 404、越权 workspace_id 400/403、私人工程全链路） |
| 请求体引用字段（state/labels/**stage_id 新增**） | 同项目校验，跨项目 400 字段错误 | `tests/test_stage.py` 5 用例 |
| Agent 规范路径（无 slug） | 同一 resolver + token 可见集；`workspace_slug` 可选**不弱化**校验（省略=按 pid 解析，提供=双重作用域） | `tests_canonical_api.AgentCanonicalTests` |
| 缓存 | 规范/兼容双键 + `invalidate_all_scopes` 双键同废（无跨路由缓存越界面）；鉴权永远实时 | 既有 cache 测试 + 契约测试 |
| Workspace 删除 | 有工程 → 400 守卫（防级联清空个人工程，R-01 根除） | `workspaces.tests.test_delete_with_projects_rejected_400` |

### 4. 会话与 CSRF

- **R-16 收窄**：写请求 403 的自愈重试现在只对 DRF 的 `CSRF Failed` 特征触发——权限 403 不再被多余重放一次（尤其保护非幂等 POST）。
- `primeCsrf` 挂载期播种（R-15）：首个写请求不再依赖 403 绕路。
- Cookie 姿态（Lax/本机 origin/桌面 127.0.0.1）本轮未动，维持既有审计结论。

### 5. 完整性

- `session.end` 补幂等回放（R-06）后，Agent 全部 8 个写动作的 `Idempotency-Key` 语义对齐（重试不产生重复副作用）。
- 迁移幂等断言：owner 回填带零遗漏校验（有缺即中止，不猜归属）。

## 二、冗余 / 死代码清理（每项先验证零引用）

| 项 | 验证方式 | 处置 |
|---|---|---|
| `IslandCarousel.tsx`（V1 轮播） | 全仓 grep：仅 index.ts 注释提及，零代码引用 | ✂️ 删除 |
| `IslandSheet.tsx`（V2 单项目图纸） | 同上；`IslandSheetParts` 被 `ProjectSummaryCard` 复用故保留 | ✂️ 删除 |
| `apps/projects/urls_global.py` | mine/ 并入 urls_canonical 后无引用 | ✂️ 已于 Phase 3 删除 |
| 各 app 的 `_require_role` 本地定义 ×4 | 逐字重复 | ✂️ 归一为 `core.permissions.require_role`（别名导入，调用点零改动） |
| 预留 hooks（label 写、项目成员写、worklog PATCH、项目活动流） | UI 引用=0，但**有明确接线计划**（Phase 5/6，契约已含端点） | 保留并在 barrel 注释标注；Phase 9 复查未接线者再裁 |

## 三、结构精简

1. **前端查询键**：从 5 处各自手写（`["issues",slug,pid]` / `["labels",…]` / `["comments",…]` / `["activities",…]` / `["worklogs"]`）收敛为 `lib/queryKeys.ts` 单一工厂——键拼写漂移类 bug（R-03）失去土壤。
2. **前端命名**：`features/task`（业务任务）/ `features/jobrun`（后台异步）彻底分离，三个「task」语境消歧。
3. **后端视图**：兼容/规范双壳共享 `_impl`，无第二套业务逻辑；`_require_role` 全局唯一。
4. **类型**：`Task = Issue` 别名开启语义收敛通道，Phase 5 UI 批次完成组件级更名。

## 四、门禁复验（真实结果）

| 门禁 | 结果 |
|---|---|
| 后端 ruff check / format | ✅ All checks passed / 139 files unchanged |
| 后端全量测试 | ✅ **Ran 377 tests · OK** |
| makemigrations --check | ✅ 无漂移 |
| spectacular --validate --fail-on-warn | ✅ |
| 前端 typecheck / lint | ✅ |
| 前端单测 | ✅ **143 pass / 0 fail** |
| 前端 build | ✅ 0 错误 |
| Playwright E2E（完整栈，真实 Chrome） | 见提交信息与本文件「五」 |

## 五、遗留与建议

- **smoke 残留数据**（R-08）仍在真实运行库——属数据运维操作，未混入代码提交；建议用户确认后单独执行清理（备份 → 删 2 用户 + smoke-ws）。
- E2E 中 `Ctrl+K` 浏览器拦截等环境差异为既有已知项（HANDOVER 有记录），非本轮引入。
- 兼容路由（ws 嵌套 + `/issues/` 命名）前端已零调用、外部消费者已确认无——**Phase 9 可安全退役**，退役前保持现状（薄适配、CI 全绿）。
