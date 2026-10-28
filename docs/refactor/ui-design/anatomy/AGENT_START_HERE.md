# 给 Mini Plane AI Agent 的执行指令

> **历史状态（2026-10-28）**：本文是 V1 概念阶段的启动指令，已被后续实现取代。
> 当前生产实现见 [`v2/README.md`](v2/README.md)；下一轮构图方向（生长/结构双视图）见
> [`v3/README.md`](v3/README.md)。不要继续按本文“只做三个草图、不接生产”的约束开工。

请先完整阅读 [`MINI_PLANE_PROJECT_ANATOMY_SPEC.md`](MINI_PLANE_PROJECT_ANATOMY_SPEC.md)，再打开 `references/00-concept-direction.png`，并阅读 `references/01-previous-anatomy-proposal.md` 和 `references/02-legacy-html-prototype-do-not-copy-layout.html`。

本轮严格处于**概念设计阶段**。用户明确要求不要沿用旧 HTML 构图，也不要立即开始生产代码。请先审查仓库真实的数据模型、API、设计系统和可复用组件，然后制作三个真正不同的静态概念草图（A 空间爆炸图、B 轴测剖切图、C 工程图纸版式），比较后提出推荐方向。草图可采用独立 SVG/HTML，但不得接入生产路由，不得修改现有生产代码、API、数据库或 CSS。

硬约束摘要：

- 不要把旧原型只换色/加阴影后作为新设计。
- 项目主体必须是有空间组织的工程图，不是卡片 Grid。
- 继承 Blueprint Editorial 的纸底、墨色、工程钴蓝、细线、克制排版。
- Task 的 `stage` 可以为空；未归属任务要被看见，但不应被污名化。
- Stage.progress、任务状态统计、Project 总体进度不能混为一谈。
- 目前没有 Task-to-Task 依赖实体，绝不画任务之间的依赖箭头或连线。
- NOW/NEXT/Agent/Worklog 注释都必须遵守真实数据关系，不得编造。
- 优先考虑 React + SVG，不要默认引入 Three.js/WebGL 或新增图形库。
- 先给用户概念草图和比较报告；只有用户认可后才进入生产实施计划。

完成后按技术说明第 12 节的汇报格式回复。
