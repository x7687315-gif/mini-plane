# Anatomy V2 · Motion Spike 记录（Phase 2）

> 日期：2026-10-26 · 结论：**Motion 依赖安装被当前工作区策略拦截；Phase 2 采用 CSS 过渡降级**。
> 依据：[技术调研报告](MINI_PLANE_ANATOMY_TECHNICAL_RESEARCH.md) §4.3 / §6.2。

## 计划中的 Spike（4 项）

1. SVG `<g>` 的 translate/opacity 过渡；
2. `viewBox` 全景 ↔ 聚焦；
3. 快速连续切换时可中断、最终状态正确；
4. `prefers-reduced-motion` 下关闭动画仍能理解。

## 实际执行

- 尝试 `pnpm add motion` 时被当前策略拦截（要求先完成设计 Spike，不允许提前引入依赖）。
- 未把 Motion 加入 `package.json` / lockfile。
- 按报告 §6.2 的边界：“如果目标只需 2–3 个 CSS 属性，先用 CSS 过渡就足够。”
  Phase 2 的动画只需要 **transform（位置）+ opacity**，不需要 viewBox 插值/路径 morph/
  进入退出编排，因此使用 CSS 过渡是符合报告允许路径的最小实现。

## Phase 2 的动画实现

- Stage `<g>` 用局部坐标 + CSS `transform: translate(...)`，切换 focus/exploded 时位置过渡 250ms；
- 任务构件抬升（exploded）由布局纯函数计算，带虚线锚点；
- `.an-stage` / `.an-cell` 使用现有 `cubic-bezier(0.2,0.8,0.2,1)`，只动 transform/opacity；
- `@media (prefers-reduced-motion: reduce)` 直接将 transition 置 none；
- 快速切换由 React 最终状态决定，CSS 过渡自然接管，不存在旧动画抢回控制权。

## 实测

- Playwright：`plate → focus → exploded → collapse → Escape → overview` 通过；
- 减少动效：`page.emulateMedia({reducedMotion:"reduce"})` 下聚焦/展开仍完成；
- 截图：[focus-demo.png](phase2/focus-demo.png)、[exploded-demo.png](phase2/exploded-demo.png)。

## 何时重新评估 Motion

出现以下任一需求时，再走独立 Spike 并请求批准依赖：

- 需要 `viewBox` 连续缩放/平移动画；
- 需要 SVG path 绘制/morph；
- 需要多个构件错峰进入/退出的复杂编排；
- CSS 无法在目标 WebView2 上稳定保持最终状态。

届时按报告 §4.3 的 4 项 Spike 执行，不直接重写主组件。
