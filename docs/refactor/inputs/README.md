# 原始计划与设计输入（只作溯源）

本目录保存用户在本轮重构中提供的原始计划、探讨指令与设计包，**内容保持原样**，仅用于回溯“当时要求做什么”。这里不是当前事实源，发现冲突时以最新文档与 ADR 为准。

## 当前事实源

- 产品原则：[`docs/PRODUCT_PRINCIPLES.md`](../../PRODUCT_PRINCIPLES.md)
- 领域模型：[`docs/DOMAIN_MODEL.md`](../../DOMAIN_MODEL.md)
- 当前进度 / 门禁：[`README.md`](../../../README.md) · [`docs/HANDOVER.md`](../../HANDOVER.md)
- 解剖图规范副本：[`docs/refactor/ui-design/anatomy/MINI_PLANE_PROJECT_ANATOMY_SPEC.md`](../ui-design/anatomy/MINI_PLANE_PROJECT_ANATOMY_SPEC.md)
- 解剖图阶段记录：[`docs/refactor/ui-design/anatomy/v2/README.md`](../ui-design/anatomy/v2/README.md)

## 文件

- `MINI_PLANE_PROJECT_ANATOMY_SPEC.md`：解剖图设计包主说明。与 `docs/refactor/ui-design/anatomy/MINI_PLANE_PROJECT_ANATOMY_SPEC.md` 内容一致。
- `mini-plane-anatomy-design-pack/`：设计包原样快照，含概念方向图、旧方案与旧 HTML 原型。其中旧方案已同步至 [`references/01-previous-anatomy-proposal.md`](../ui-design/anatomy/references/01-previous-anatomy-proposal.md)。
- `mini-plane-refactor-plan.md`：2026-10-24 的彻底重构总计划 v1.0（Phase 0–9 的来源）。
- `mini-plane-personal-first-ui-prompt.md`：个人工程优先 UI 重构探讨指令。
- `plane_mini_collaboration_plan.md`：早期双人协作计划。

## 使用提醒

这些文档可能包含已被后续阶段取代的阶段编号、测试数字或页面方案；不要让它们覆盖 `docs/refactor/PHASE*_REPORT.md`、ADR 与当前代码的事实。执行前先读事实源与最新交接文档。
