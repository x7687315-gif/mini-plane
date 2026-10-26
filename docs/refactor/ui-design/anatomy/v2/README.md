# Anatomy V2 · Interactive Engineering Plate

> 方向：同一个项目对象的结构、精密观察与演进痕迹，共用一套 React SVG 渲染系统。
> 最高约束：[技术调研报告](MINI_PLANE_ANATOMY_TECHNICAL_RESEARCH.md) + [ADR-003](../../../../decisions/ADR-003-anatomy-v2-object-language.md)。

## 阶段状态

| Phase | 内容 | 状态 | 交付物 |
|---|---|---|---|
| 0 | 基线、截图、设计决策、fixtures、审计 | ✅ 2026-10-26 | [PHASE0_BASELINE.md](PHASE0_BASELINE.md)、baseline/*.png、fixtures |
| 1 | 安全稳定的静态 React SVG 对象 | ✅ 2026-10-26 | [PHASE1_REPORT.md](PHASE1_REPORT.md) |
| 2 | 空间交互（focus/exploded/restore）+ CSS/Motion 决策 | ✅ 2026-10-26 | [PHASE2_REPORT.md](PHASE2_REPORT.md) · [MOTION_SPIKE.md](MOTION_SPIKE.md) |
| 3 | 真实新增/状态变化的演进痕迹 | ✅ 2026-10-26 | [PHASE3_REPORT.md](PHASE3_REPORT.md) |
| 4 | 事件时间线 / 历史快照决策 | ✅ 2026-10-26 | [PHASE4_REPORT.md](PHASE4_REPORT.md) |
| 5 | 构型扩展与性能验证 | ✅ 2026-10-26 | [PHASE5_REPORT.md](PHASE5_REPORT.md) |

## 硬约束（每阶段复查）

- 不画 Task↔Task 依赖/因果线；空间接近不代表关联。
- Stage.progress、Task 状态统计、Project progress/`progress_source` 三者分列。
- `stage=null` 的 Task 必须可见（中性散件，不隐藏、不羞辱）。
- NOW 用 `now_task_id`；NEXT 用 `plan.next_stage`；Agent 只显示真实运行态。
- Worklog ≠ ActivityLog ≠ 历史快照；没有保存快照不提供完整历史回放。
- 遵守 Blueprint Editorial：纸色、钴蓝、细线、克制留白；不引入渐变/毛玻璃/厚阴影。
- 动态文本不进原始 SVG 字符串；Phase 1 起移除 `dangerouslySetInnerHTML`。
- 每阶段：MD 记录、真实门禁、commit/push、密钥扫描。
