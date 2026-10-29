# Personal-first 重构索引（Phase 0–9）

> 当前状态：Phase 0–9 已完成（2026-10-28）。
> 产品事实源：[`docs/PRODUCT_PRINCIPLES.md`](../PRODUCT_PRINCIPLES.md) ·
> 领域模型：[`docs/DOMAIN_MODEL.md`](../DOMAIN_MODEL.md) ·
> 机器契约：[`docs/api/openapi.yaml`](../api/openapi.yaml)。

| 阶段 | 记录 |
|---|---|
| 0 审查与基线 | [GLOBAL_REVIEW.md](GLOBAL_REVIEW.md) · [PHASE0_CURRENT_ARCHITECTURE.md](PHASE0_CURRENT_ARCHITECTURE.md) · [PHASE0_API_INVENTORY.md](PHASE0_API_INVENTORY.md) · [PHASE0_RISK_REGISTER.md](PHASE0_RISK_REGISTER.md) |
| 1 产品/领域冻结 | [docs/PRODUCT_PRINCIPLES.md](../PRODUCT_PRINCIPLES.md) · [docs/DOMAIN_MODEL.md](../DOMAIN_MODEL.md) · [ADR-001](../decisions/ADR-001-project-ownership.md) |
| 2 模型与迁移 | [PHASE2_REPORT.md](PHASE2_REPORT.md) |
| 3 API 契约统一 | [PHASE3_REPORT.md](PHASE3_REPORT.md) · [10-canonical-projects.md](../api/10-canonical-projects.md) |
| 4 前端数据层 | [PHASE4_REPORT.md](PHASE4_REPORT.md) |
| 5 个人流程 / 稳定化 | [PHASE5_REPORT.md](PHASE5_REPORT.md) · [devlog/2026-10-25-phase5-stabilization.md](../devlog/2026-10-25-phase5-stabilization.md) |
| 6 团队模式降级 | [PHASE6_REPORT.md](PHASE6_REPORT.md) |
| 7 Agent / Realtime | [PHASE7_REPORT.md](PHASE7_REPORT.md) · [08-realtime.md](../api/08-realtime.md) |
| 8 Island / 桌面 | [PHASE8_REPORT.md](PHASE8_REPORT.md) |
| 9 文档 / 发布 | [PHASE9_REPORT.md](PHASE9_REPORT.md) · [TECH_DEBT.md](TECH_DEBT.md) |
| **Anatomy V3（新构图）** | [v3/README.md](ui-design/anatomy/v3/README.md) · [Phase 1 审计](ui-design/anatomy/v3/PHASE1_AUDIT.md) · [Phase 2 原型](ui-design/anatomy/v3/PHASE2_PROTOTYPE.md) · [Phase 3 生产接入](ui-design/anatomy/v3/PHASE3_REPORT.md) · [Preflight](ui-design/anatomy/v3/PREFLIGHT.md) |

## 调研与输入

- 本轮开工前调研：[PHASE6_9_PREFLIGHT.md](PHASE6_9_PREFLIGHT.md)
- 用户原始计划/设计输入（只作溯源）：[inputs/](inputs/README.md)
- 决策记录：[docs/decisions/](../decisions/)

## 当前兼容状态

规范路径以 `docs/api/10-canonical-projects.md` 为准。旧 Workspace 嵌套/`issues/`/Agent slug
路由是 **deprecated 薄适配器**，前端零调用；退出条件见 10 号契约 §3。
