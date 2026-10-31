# Phase 1 · Anatomy V3 桌面视觉验收

> 日期：2026-10-29 · 分支 `feat/anatomy-v3`
> 依据：[`NEXT_CYCLE_PLAN.md`](../NEXT_CYCLE_PLAN.md) · DESIGN.md §3.3/§6 · Anatomy V3 Phase 3 报告
> 原则：先验收、再最小修复；不改数据模型，不重写图纸结构。

## 1. 截图与验收对象

- Before：`baseline/anatomy-growth.png`、`baseline/anatomy-structure.png`
- After：`phase1/anatomy-structure-after.png`
- 大数据：`phase1/large-growth.png`、`phase1/large-structure.png`（120 Task 临时项目）
- 真机视口：1440×1200；浏览器真实运行态；Next 16.4.3。

## 2. 问题分级

| 级别 | 问题 | 证据 | 处理 |
|---|---|---|---|
| **阻碍理解** | Structure 的模块标题 16px 被缩放到约 10px，第二行 8px 缩到约 5px；进度/任务数又与左侧索引重复 | before 截图 | ✅ 标题放大到 19/20px，移除重复小字；索引/详情继续承载精确信息 |
| **状态/清晰度** | 120 Task 时 `+N` 在 SVG 里只有 7.5–8px，缩放后几乎不可见；用户可能误以为任务丢失 | 120 Task 验收 | ✅ `+N` 并入 Stage 标题（Growth 标题行 / Structure 标题行），保持 19px 可见；索引/详情仍显示总数 |
| 状态错误 | Growth ↔ Structure 快速反向（同一事件循环）后选中 Stage/最终 URL | 自动化复现 | ✅ 通过：最终 growth、选中 Stage 保留；无需全局状态重构 |
| 视觉不协调 | Anatomy 主面板无大圆角/阴影，符合 DESIGN；Island 仍有 14/26px 卡片是 Phase 2 范围 | 代码审查 | 📌 不在 Phase 1 偷改 Island |
| 细枝末节 | Structure 长名称 + 大 `+N` 时标题会截断；索引/详情显示全名 | 120 Task 截图 | ✅ 接受；标签宽度从 step−20 调到 step−10，尽量减少截断 |

## 3. 改动

- `frontend/features/anatomy/layout.ts`
  - Growth：`hiddenTaskCount` 前移；`+N` 作为标题后缀，标题宽度先扣除后缀；label 宽度仍 250。
  - Structure：label 最大宽度 `step−10`；`+N` 作为标题后缀并先扣除宽度。
- `frontend/components/anatomy/AnatomyScene.tsx`
  - `StageLabel` 支持 `showProgress={false}`；Structure 只画标题，不画重复的 progress 行。
  - Structure 标题字体 19/20px；移除旧的 7.5px `+N` 小字。
- `frontend/tests/unit/anatomy-layout.test.mts`：仍验证每个 Stage 的 `tasks + hiddenTaskCount == tasks.length`、包围盒在 viewBox 内。

## 4. 验证

| 项目 | 结果 |
|---|---|
| typecheck / lint | 通过 |
| 前端单测 | 175 / 175 |
| Anatomy E2E | 9 / 9（选中、双视图、URL、抽屉焦点、空态、滚动恢复、错误态、记录、NEW/UPD、安全文本） |
| 120 Task | 主图/索引/详情均 120；Growth `+106`、Structure `+108` 可见；无 console error |
| 快速反向切换 | 最终 URL 为 growth，选中 Stage 保持「工作台与协作」 |
| 结构标签 | 正常 5 Stage 下名称可读；精确进度/计数在索引与详情 |

## 5. 三项基准如何改善

- **轻量化**：Structure 去掉重复的 progress 小字，只保留一个可读标题；信息回到索引/详情，减少视线竞争。
- **流畅性**：未加动画或新状态；快速切换仍由 URL 单一事实源控制，最终状态正确。
- **日常便捷性**：120 Task 时 `+N` 明确，用户不会误判任务丢失；选中 Stage/详情保持一致。

## 6. 未做与风险

- 没有改变 Growth/Structure 的布局几何、数据模型或任务上限；`+N` 只影响标签呈现。
- Structure 长名称在极窄空间仍会截断；索引/详情是完整事实源。
- Island 的 14/26px 圆角/阴影与 DESIGN 冲突，按计划留到 Phase 2 独立原型，不在本阶段改生产。
- 下一阶段仍需验证：原生桌面窗口内的真实观感、快速连续点击的视觉节奏（Phase 4）。
