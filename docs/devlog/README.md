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
| 5 | Search / Filter / Sort | ⬜ 下一个 | — | — |
| 6 | Redis Cache + Celery | ⬜ 待开始 | — | — |
| 7 | WebSocket Realtime | ⬜ 待开始 | — | — |
| 8 | Docker / CI / 收尾 | ⬜ 待开始 | — | — |

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
