# Phase 0 · 测试与 CI 基线（真实运行结果）

> 环境：Windows 11 · Git Bash · backend/.venv（Python 3.12.13，uv 管理）· Node v24.20.0 · pnpm 11.25.0
> 基线 commit：`97a49bb11fc70769d01e0768a9c122b70ee2e9d1`（main）
> 运行时间：2026-10-24。以下全部为**实际执行输出**，非推断。Redis 缓存后端实测（check_cache）依赖 Redis 服务容器，本机未运行 Redis，该项由 CI 覆盖（见 §2 备注）。

## 1. 后端

| 门禁 | 命令 | 结果 |
|---|---|---|
| ruff check | `ruff check .`（backend/） | ✅ All checks passed |
| ruff format | `ruff format --check .` | ✅ 136 files already formatted |
| ruff（desktop/+scripts/） | `ruff check --config backend/pyproject.toml desktop/ scripts/` | ✅ |
| 迁移无漂移 | `manage.py makemigrations --check --settings=config.settings.test` | ✅ No changes detected |
| OpenAPI 校验 | `manage.py spectacular --validate --fail-on-warn --settings=config.settings.test` | ✅ 零警告 |
| OpenAPI 快照一致 | 与 `docs/api/openapi.yaml` diff | ✅ MATCH |
| 全量测试 | `manage.py test --noinput --settings=config.settings.test` | ✅ **Ran 352 tests in 37.594s · OK**（README 记 334，套件已增长） |

测试数据库：SQLite（test settings 默认；CI 另跑 Postgres 16 容器，双引擎由 CI 覆盖）。

## 2. 前端

| 门禁 | 命令 | 结果 |
|---|---|---|
| typecheck | `pnpm typecheck` | ✅ |
| lint | `pnpm lint` | ✅ |
| 单元测试 | `pnpm test` | ✅ **143 pass / 0 fail**（31 suites，536ms） |
| 构建 | `pnpm build` | ✅（standalone 产物生成，路由表完整） |

## 3. CI 工作流事实（.github/workflows/ci.yml）

- 触发：`push: branches:[main]` + `pull_request`（**任意分支 push 不触发**，需开 PR 才有 CI 信号）。
- backend job：Postgres 16 + Redis 7 服务容器 → ruff ×4 → makemigrations --check → spectacular 校验 → openapi 快照 diff → 全量测试（Postgres）→ check_cache（Redis）。
- frontend job：install --frozen-lockfile → lint → typecheck → test → build → standalone 产物断言。
- 本基线与 CI 的差异：本机测试跑 SQLite、无 Redis check_cache；其余门禁等价。**SQLite/Postgres 双引擎验证依赖 CI 的 PR 流水线**（重构分支将以 PR 形式获取 CI 信号）。

## 4. 桌面/E2E（本轮未跑，如实记录）

- Playwright E2E（34 用例）需要起完整栈（后端+前端+真实 Chrome），未在本基线运行；由 Phase 2/4 的验收阶段按需执行 `scripts/dev.cmd e2e`。
- 桌面打包验证（PyInstaller）属 Phase 8/9 范围。

## 5. 基线结论

**全部门禁绿。** 以此为重构起点：任何阶段提交前，本地必须复现 §1/§2 全绿 + `makemigrations --check` 无漂移 + openapi 快照一致；CI 红灯即阻塞下一阶段。
