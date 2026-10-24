# Phase 1 报告 · 冻结产品原则、目标模型与架构决策

> 完成于 2026-10-24 · 分支 `refactor/personal-first-domain` · 本阶段**零业务代码改动**（纯文档 + 索引更新）。

## 做了什么 / 怎么做的

| 交付物 | 内容要点 |
|---|---|
| `docs/PRODUCT_PRINCIPLES.md` | 六条原则：个人优先、本地优先、工程状态优先、Task/Worklog 二分、Agent 受限、简约实现；明确本轮不做清单与事实源层级 |
| `docs/DOMAIN_MODEL.md` | 实体职责/归属/删除行为/唯一约束/校验语义全表；目标关系 Mermaid 图；**派生量唯一定义**（progress+progress_source、NOW、NEXT、last_activity、today_logs）；现状→目标差异清单 9 项（Phase 2 实施项） |
| `docs/decisions/ADR-001-project-ownership.md` | 方案 A（隐藏个人 Workspace）vs 方案 B（owner 必填 + workspace 可空）对比；**采纳 B**；迁移与安全边界 6 条；回退点说明 |
| `README.md` | 文档索引改为新事实源（原则/模型/重构目录），旧计划标注历史档案 |
| `docs/PRODUCT_REFACTOR_PLAN.md` | 顶部加历史档案横幅（Sprint 09–17 已完成，不得再按其实施） |

## 冻结的关键决策（含依据）

1. **所有权 = 方案 B**（用户拍板；Phase 0 证实外部消费者为零，迁移窗口成本最低）。
2. **Task↔Stage**：可选单关联 FK(SET_NULL)；跨项目 stage_id → 404（与既有 Worklog.stage 防枚举语义一致）。
3. **Stage 删除**：置空关联、不删 Task/Worklog；删当前阶段则 is_current 归空。
4. **progress**：Plan 加权优先，任务完成率回退，响应带 `progress_source`。
5. **NOW/NEXT**：维持现有排序语义，补稳定次级键（NOW `-updated_at,-sequence_id`；NEXT `created_at,sequence_id`）——依据是 `projects/views.py:my_projects_summary` 的现有实现与既有测试。
6. **last_activity 修订**：`max(Task.updated_at, Worklog.updated_at, Project.updated_at)`——现状只看 Task.updated_at（Phase 0 确认的语义缺陷，计划书 §2.5 点名）。
7. **identifier 唯一性**：条件唯一索引（私人按 owner / 团队按 workspace），SQLite 与 Postgres 均用 partial index 表达。
8. **Workspace 删除**：service 守卫拒绝（仍有项目 → 400）+ DB 层 SET_NULL 兜底，根除「删工作区级联清空工程」（Phase 0 R-01）。
9. **命名**：对外公共语义一律 Task；后台异步对象对外称 JobRun（表名 TaskRun 保留）——细化决策留 ADR-002（Phase 3）。

## 明确不做（防失控，与计划书 §6 一致）

MCP、AI 自动规划、多人实时编辑、多 Workspace 共享、通知中心、甘特图；不重命名 Django app/表名；不动 Island 窗口壳层。

## 验收自查

- [x] 原则/模型/ADR/能力边界完整，互相无矛盾
- [x] README ↔ PRODUCT_PRINCIPLES ↔ DOMAIN_MODEL ↔ ADR 指向关系闭合，旧文档已标历史
- [x] 关键数据关系与删除行为有图有表（DOMAIN_MODEL §2/§5）
- [x] 未改任何业务代码（本阶段 diff 仅 .md）
- [ ] 领域模型获用户确认后进入 Phase 2 迁移（按用户指令连续推进，Phase 5 前统一停下）

## 下一阶段前置条件（Phase 2）

基线全绿（PHASE0_BASELINE）✓；ADR-001 迁移细则已写 ✓；开始模型迁移：owner 三步迁移、workspace 可空、Issue.stage、条件唯一索引、resolver 收敛、聚合修订。
