# ADR-003 · Anatomy V2 统一工程对象语言

> 状态：**已采纳**（2026-10-26）
> 关联：[技术调研报告](../refactor/ui-design/anatomy/v2/MINI_PLANE_ANATOMY_TECHNICAL_RESEARCH.md)、
> [Phase 0 基线](../refactor/ui-design/anatomy/v2/PHASE0_BASELINE.md)、`docs/DOMAIN_MODEL.md`

## 背景

现有解剖图（Phase 5 复合 PLATE）已经能展示真实 Stage/Task/散件/进度与抽屉，但存在：

- Stage 外形由任务数量阈值决定（0/1-3/4-6/7+），语义不稳定；
- 固定 viewBox + 字符串拼接 SVG + `dangerouslySetInnerHTML`，布局与安全边界不可测；
- 视觉上更像“几个小模型 + 信息面板”，尚未成为一个统一、可阅读的工程对象；
- 历史能力没有区分 Worklog、ActivityLog 与真正的状态快照。

调研报告的结论是：**先做对，再逐步做大**；统一对象语法、确定性布局、React JSX SVG、
安全/可访问、空间状态机、真实时间痕迹，最后才讨论历史快照与构型扩展。

## 决策

1. **对象**：解剖图是同一个项目的结构、观察与时间表现，不是三个独立页面或三套对象。
2. **渲染**：React + TypeScript + SVG JSX。移除动态 `dangerouslySetInnerHTML`；
   用户文本由 React 转义。不引入 Three.js / React Flow / D3 Force 作为主渲染器。
3. **布局**：`computeAnatomyLayout()` 为纯函数；稳定 ID、`Stage.order` 排序、确定性输出、
   内容包围盒/面板避让；不推导 Task↔Task 依赖。
4. **Stage 语法**：第一版所有 Stage 共用一套基本模块；Task 数量只改变内部构件密度/排布，
   不再按任务数切换建筑类别。有限构型扩展留到 Phase 5 验证后。
5. **状态**：空间状态（overview / focus / exploded）与时间状态（current / event / snapshot）
   分开建模；不使用互相冲突的布尔值。
6. **动画**：Phase 2 先做 Motion for React Spike（transform/opacity/viewBox、可中断、
   `prefers-reduced-motion`）。通过后才用于核心交互；总时长遵守 DESIGN 红线（常规 150–250ms，
   渐进展开验证上限约 400ms）。
7. **历史**：Worklog = 人工工作记录（日期可补记）；ActivityLog = 有限审计；
   完整历史状态需要额外快照/完整事件流。没有真实数据时不提供“过去完整结构”回放。
8. **数据边界**：Project progress 用 `/projects/mine/` 的 `progress` + `progress_source`；
   Stage.progress 与 Task 状态统计分列；NOW 用 `now_task_id`；NEXT 用 `plan.next_stage`；
   Agent 只显示真实运行会话。

## 后果

- Phase 1 先交付**安全、稳定、可测试的静态对象**；不新增动画库、不改后端领域模型。
- Phase 2 再做空间交互与渐进分解；Phase 3 真实新增痕迹；Phase 4 事件列表/快照；
  Phase 5 构型与性能。
- 每阶段必须有：纯函数/组件/E2E 测试、截图评审、真实门禁、
  `docs/refactor/ui-design/anatomy/v2/PHASE*.md` 记录与 commit/push。
- 任何阶段不得引入 Task 依赖线、伪历史、假 Agent 状态或未经审计的 SVG 字符串注入。
