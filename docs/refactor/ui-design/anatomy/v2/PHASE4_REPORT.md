# Anatomy V2 · Phase 4 记录浏览与历史决策

> 日期：2026-10-26 · 分支：`feat/anatomy-v2`
> 依据：[技术调研报告](MINI_PLANE_ANATOMY_TECHNICAL_RESEARCH.md) Phase 4 + [ADR-003](../../../../decisions/ADR-003-anatomy-v2-object-language.md)
> 范围：真实 Worklog / Activity 的只读记录浏览；**不落库快照、不伪造旧结构**。

## 1. 做了什么

| 文件 | 变更 |
|---|---|
| `frontend/features/anatomy/history.ts` | Worklog/Activity 两套只读记录模型 + UTC 展示 |
| `frontend/features/anatomy/index.ts` | 导出记录模型 |
| `frontend/components/anatomy/AnatomyHistory.tsx` | “记录”面板：工程日志 / 审计事件两栏 |
| `frontend/components/anatomy/AnatomyPlate.tsx` | 记录入口 + 总数；传入 worklogs |
| `frontend/app/(protected)/projects/[pid]/page.tsx` | 将 worklogs 传入图纸 |
| `frontend/tests/unit/anatomy-history.test.mts` | 5 条日期/来源/同时间戳/删除实体/limit 测试 |
| `frontend/tests/e2e/anatomy-v2.spec.ts` | 记录浏览 E2E（Worklog + Audit 分栏） |

## 2. 语义（两类记录不合并）

| 来源 | 展示字段 | 时间语义 | 不能声称 |
|---|---|---|---|
| **Worklog** | date / title / summary / stage / source | `date` 是业务归属日，允许补记 | 不能当“精确发生时刻” |
| **Activity** | created_at / actor / action / text | `created_at` 是系统写入时间，倒序 | 不能当完整历史或回放源 |

- 同一时间戳的 Activity 保持服务端顺序，不添加“谁先谁后”的 UI 暗示；
- 已删除实体的 Audit 记录仍可阅读（`entity_id` 留痕），但不重建旧对象；
- 面板明确写：**Activity 是有限审计，不是完整历史；没有快照，不提供旧结构回放**；
- 记录入口显示真实总数（Worklog + Activity），单次最多展示 8 条；更多记录留待分页（Phase 5 可选）。

## 3. 历史快照决策（本轮不落库）

报告要求先决定“只看事件”还是“恢复当时结构”。本轮结论：

> **暂不实现 ProjectSnapshot / 状态回放。**

理由：

1. 当前没有经过验证的用户需求要求“把时间游标移回某天并看到完整结构”；
2. ActivityLog 字段范围有限（描述只记字数、部分实体未接线），不足以重放；
3. 快照涉及 schema/version、触发时机、删除实体、敏感字段、存储与迁移成本；
4. 在 Phase 5 的构型/性能验证前引入快照，会把“观察视图”扩大成新的数据子系统，违背本轮边界。

未来若确认需求，候选方案（仅记录，不实现）：`ProjectSnapshot { id, projectId, capturedAt, schemaVersion,
reason, state{project,stages,tasks}, checksum }`；需要先确定“恢复哪些字段”和“何时捕获”。
在此之前，UI 只提供记录浏览，不提供虚假的完整历史。

## 4. 验证（真实运行）

| 门禁 | 结果 |
|---|---|
| typecheck / lint | 通过 |
| 单测 | **168 pass / 0 fail**（新增 5 条 history） |
| 生产构建 | 通过 |
| Playwright 全量 | **39/39 pass**（+ setup = 40/40） |
| 记录 E2E | Worklog（补记日期/人工来源）与 Activity（审计/同时间戳说明）分栏通过 |

截图：[records-demo.png](phase4/records-demo.png)。

## 5. 已知边界

1. 只取 Worklog / Activity 第一页，展示最多 8 条；没有分页/无限滚动。
2. 没有跨源排序（因为业务日期与写入时间不可比）；两栏独立。
3. 没有快照、没有旧结构比较、没有 Worklog 回放。
4. Stage.created 仍无审计，因此不能展示 Stage 新增事件。

## 6. 下一阶段（Phase 5）

- 构型扩展：只在真实使用验证后决定是否引入有限变体；
- 性能：在真实硬件记录 1/3/8/16 Stage、30/100/300 Task 的渲染/交互数据；
- 布局/标注密度：极端文本、窄窗口、面板重排；
- 不引入 3D/力导向/新图形引擎；不动后端领域模型。
