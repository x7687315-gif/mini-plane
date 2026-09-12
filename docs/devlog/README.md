# 开发日志索引（后端）

每个 Sprint 一篇：**做了什么 → 怎么做的 → 验收结果 → 下一步 → 给同学的联调须知**。
计划依据见 [BACKEND_PLAN.md](../../BACKEND_PLAN.md)；接口契约见 [docs/api/](../api/)。

## 进度总览

| Sprint | 主题 | 状态 | 日志 | 主要提交 |
|--------|------|------|------|----------|
| 0 | 环境 + 项目骨架 | ✅ 已完成 | [sprint-0-backend.md](sprint-0-backend.md) | `ab3d4f6` |
| 1 | User / Auth | ✅ 已完成 | [sprint-1-backend.md](sprint-1-backend.md) | `4d79dff` → merge `a4971b7` |
| 2 | Workspace / Project | ✅ 已完成 | [sprint-2-backend.md](sprint-2-backend.md) | `0db06f6` → merge `d697462` |
| 3 | Issue 核心 | ✅ 已完成 | [sprint-3-backend.md](sprint-3-backend.md) | 本 Sprint 提交 |
| 4 | Comment + Activity | ✅ 已完成 | [sprint-4-backend.md](sprint-4-backend.md) | 本 Sprint 提交 |
| 5 | Search / Filter / Sort | ✅ 已完成 | [sprint-5-backend.md](sprint-5-backend.md) | 本 Sprint 提交 |
| 6 | Redis Cache + Celery | ✅ 已完成 | [sprint-6-backend.md](sprint-6-backend.md) | 本 Sprint 提交 |
| 7 | WebSocket Realtime | ✅ 已完成 | [sprint-7-backend.md](sprint-7-backend.md) | 本 Sprint 提交 |
| 8 | Docker / CI / 收尾 | ✅ 已完成 | [sprint-8-backend.md](sprint-8-backend.md) | 本 Sprint 提交 |

## 交付物形态（每个 Sprint 收尾时的固定动作）

1. 契约文件 `docs/api/0x-*.md` 更新并冻结；
2. 代码 + 迁移；
3. 测试（正常 / 非法 / 未登录 / 无权限 / 不存在 / 边界 六类）；
4. 一篇本目录下的 devlog；
5. `ruff check` + `ruff format --check` + 全量测试 + `spectacular --validate` 四绿；
6. **开发库执行 `manage.py migrate`**（测试库是从零新建的，不打开发库会让冒烟假绿）；
7. commit（`<type>(backend): …`）→ push。

## 现存待办（技术债，非阻塞）

- 除 `apps/issues`、`apps/activity` 外，其余 app 的测试仍是单文件 `tests.py`；待统一为 `tests/` 包（计划 §8）。
- `docs/devlog/` 目前靠本文件人工维护索引，暂不引入自动生成。
- `ActivityLog` 比计划 §3.2 多一个 `issue` 上下文外键（SET_NULL），理由见 [sprint-4-backend.md](sprint-4-backend.md) §2.1。
- Label 的增删改、Comment 编辑暂不产生活动记录（06 契约「有意不记录的事件」，二期再议）。
- Issue 索引在 Sprint 5 被实测修正：`(project, -created_at)` → `(project, -created_at, -sequence_id)`，
  理由见 [sprint-5-backend.md](sprint-5-backend.md) §2.2。
- `search` 仍是 `icontains` 顺序扫描；二期上 `pg_trgm`（5000 条实测 2.37ms，暂可接受）。
- 筛选不支持"未指派（assignee=none）"，二期补。
- Project 详情缓存**收益有限**（瓶颈在鉴权查询，不在项目行），详见
  [sprint-6-backend.md](sprint-6-backend.md) §2.1 与 [07 契约](../api/07-cache-and-tasks.md) §1.5；
  二期该缓存的是 Issue 列表的 `COUNT(*)` 与详情体统计聚合。
- 通知只落库（`Notification` 表占位），邮件/推送二期；Label 变更暂不产生活动记录。
- 实时推送只定义了 `issue.updated` / `comment.created` 两个事件（08 契约）；
  Redis channel layer 未在本机实测（无 Docker），多进程部署前必须配 `CHANNEL_REDIS_URL`。
- Dockerfile / compose 编排通过结构校验 + container 配置本机 daphne 实测，
  但**未在真实 Docker 里构建启动**（无 Docker）；有 Docker 的机器先跑
  `docker compose up --build` 验收，见 [sprint-8-backend.md](sprint-8-backend.md) §2.6。
- `seed_issues` 用伪随机造基准数据（安全扫描提示低危，已评审接受：可复现基准
  是伪随机+种子的正确用途，无安全语义，见 sprint-8 devlog §2.8）。
- 容器内 TLS/HSTS 等 `check --deploy` 加固项留到有真实域名的二期。
