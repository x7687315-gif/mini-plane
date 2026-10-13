# 阶段 3：Agent 执行进度 API + /projects/mine/ 摘要扩充（2026-10-13）

> Island V2 规格 §6 阶段 3。后端为阶段 1 的诚实占位补上真实数据源。

---

## 一、做了什么

| 项 | 内容 |
|---|---|
| `AgentSession` 四字段 | `current_step`(200) / `step_index` / `step_total` / `method_summary`(300) + 迁移 `0003` |
| 新端点 | `POST /api/v1/agent/sessions/<id>/progress/`（Token 认证 + `task:write` scope + 归属校验 + 幂等 + 事务后广播） |
| 序列化器 | `AgentSessionProgressSerializer`（四字段全可选；`step_index ≤ step_total` 校验）—— 注意与既有的 `AgentProgressSerializer`（项目阶段进度）是**两个东西** |
| service | `update_progress()`：只允许运行中会话；写库与广播同事务（失败一起回滚） |
| `/projects/mine/` 扩充 | `recent_done`（最近完成 3 条任务标题）/ `latest_log`（最新日志 title+summary）/ `agent_step` / `agent_step_index` / `agent_step_total` / `agent_method` / `agent_session_title` |
| 测试 | 新增 `apps/agents/tests_island_v2.py` **12 条**（归属 404 / 已结束拒绝 / scope 403 / 幂等 / 序号上限 / DONE 真实记录 / 日志与完成不混 / 步骤来自运行中会话 / 无 N+1 / 不串项目 / 空库） |
| OpenAPI | 快照已重生成（含新端点），`--validate --fail-on-warn` 通过 |

## 二、关键实现决策

**① 为什么 STEP/HOW 用子查询而不是额外查询**：沿用 mine/ 既有风格（correlated subquery），
一个请求仍是固定次数的 SQL。

**② 为什么 DONE/日志用"两条批量查询 + Python 分组"**：
`ArrayAgg` 是 PostgreSQL 专属，桌面版跑 SQLite 不能用；"每项目一条查询"就是规格明令
禁止的 N+1。折中：两条 `IN` 批量查询 + Python 分组 = **O(1) 次查询**，双后端通吃。

**③ 命名撞车**：项目里已有 `AgentProgressSerializer`（§13 的阶段进度端点），
新序列化器改名 `AgentSessionProgressSerializer`（中途误改了旧端点的两处引用，已还原）。

## 三、验证（有证据）

| 门禁 | 结果 |
|---|---|
| 新测试 | **12/12**（含 `assertNumQueries(5)`：10 个项目仍是 5 条固定查询） |
| 全量后端 | **346 OK**（334 + 12） |
| lint / format | 全绿 |
| 迁移 | `makemigrations --check` 无漂移 |
| OpenAPI | 重生成 + validate 通过，`session.progress` 已入快照 |

**"无 N+1"的证据**：捕获的 5 条查询里，10 个项目全部走 `IN (...)` 子查询，
没有一条随项目数增长。这 5 条是：①可见性 ②DONE 批量 ③日志批量 ④主注解查询 ⑤Plan prefetch。

## 四、踩坑记录

1. `apps/worklogs` **没有 services.py**——造数直接 `Worklog.objects.create`（作者字段必填）。
2. `create_issue` 是关键字参数（`state=states["completed"]`），且项目自带 states 可直接取。
3. Django 的 `TestCase` 用 `force_login`，DRF 的 `APITestCase` 才有 `force_authenticate`。
4. `assertNumQueries` 的预期值必须先实测（捕获 SQL 数一数）再写死，别拍脑袋。

## 五、下一步

阶段 4：跨项目实时闭环 —— overview WebSocket 通道 + 事务后广播 + 前端缓存失效 + 重连重取。
完成后 Island 的 STEP/HOW/DONE/NOW 将**无刷新自动更新**。
