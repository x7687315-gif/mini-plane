# Anatomy V2 · Phase 2 空间交互与渐进分解

> 日期：2026-10-26 · 分支：`feat/anatomy-v2`
> 依据：[技术调研报告](MINI_PLANE_ANATOMY_TECHNICAL_RESEARCH.md) Phase 2 + [ADR-003](../../../../decisions/ADR-003-anatomy-v2-object-language.md)
> 范围：空间状态机、focus/exploded/restore、键盘/减少动效、URL 空间状态；未做历史/快照、未改后端。

## 1. 做了什么

| 文件 | 变更 |
|---|---|
| `frontend/features/anatomy/state.ts` | `SpatialState`（overview/focus/exploded）+ transition/normalize/URL helpers |
| `frontend/features/anatomy/layout.ts` | exploded 布局：任务抬升、锚点、幽灵 Stage；bounds 保持 |
| `frontend/components/anatomy/AnatomyScene.tsx` | 局部坐标 + CSS transform；任务锚点虚线；可聚焦 Stage |
| `frontend/components/anatomy/AnatomyPlate.tsx` | 状态机、展开/收拢/整体、Esc、URL 回调、焦点详情 |
| `frontend/app/(protected)/projects/[pid]/page.tsx` | `?stage=` / `?expand=1` 与 `?view=plate` 同步 |
| `frontend/app/globals.css` | `.an-stage/.an-cell` CSS 过渡 + reduced-motion |
| `frontend/tests/unit/anatomy-state.test.mts` | 5 条状态机/URL/exploded 测试 |
| `frontend/tests/e2e/anatomy-v2.spec.ts` | 追加展开/收拢/Esc/减少动效 |

## 2. 行为

- **overview**：全部 Stage 稳定网格；点击 Stage（SVG 或 Index）→ focus。
- **focus**：选中 Stage 居中，其他 Stage 以低透明度幽灵态保留位置；焦点面板显示目标/记录进度/权重/构件。
- **exploded**：选中 Stage 的 Task 构件从 top face 抬升，带虚线锚点；再次展开按钮变“收拢”。
- **restore**：点击“整体”、再次点当前 Stage、按 Esc（无抽屉/输入框时）→ overview。
- **URL**：`?view=plate&stage=<id>&expand=1` 可恢复空间状态；使用 `router.replace`，不刷历史。
- **键盘**：SVG Stage 可 Tab/Enter/Space；Index 行是等价入口；Esc 返回。
- **减少动效**：`prefers-reduced-motion: reduce` 下关闭 transform/opacity 过渡，信息仍完整。

## 3. Motion 决策

Motion 依赖安装被工作区策略拦截；按报告 §6.2 的允许路径，Phase 2 使用 CSS 过渡
（仅 transform/opacity），未加入 `motion` 依赖。详见 [MOTION_SPIKE.md](MOTION_SPIKE.md)。
如果 Phase 3/4 需要 viewBox/path/错峰编排，再走独立 Spike 并请求批准。

## 4. 验证（真实运行）

| 门禁 | 结果 |
|---|---|
| typecheck / lint | 通过 |
| 单测 | **159 pass / 0 fail**（新增 5 条状态机） |
| 生产构建 | 通过 |
| Playwright 全量 | **37/37 pass**（+ setup = 38/38） |
| Anatomy E2E | SVG 聚焦 → 展开 → 收拢 → Esc → 抽屉；减少动效：通过 |

截图：

- [focus](phase2/focus-demo.png)
- [exploded](phase2/exploded-demo.png)
- [overview](phase2/overview-demo.png)

## 5. 已知边界

1. CSS 过渡只处理位置与透明度；模块尺寸/形状在状态切换时是瞬时变化，不做形变插值。
2. 没有 viewBox 动画/路径 morph；Motion Spike 未安装依赖。
3. 幽灵 Stage 仍极低透明度且不可点击；Index 是切换入口（Phase 5 可再评估）。
4. 未做真实性能基准（16/20 Stage、100+ Task 的帧表现）。
5. 时间状态仍只有 `current`；历史/快照在 Phase 4 决策。

## 6. 下一阶段（Phase 3）

- 定义 `AnatomyChange`：只使用真实 Activity/Worklog/Agent 来源；
- 新增真实 Stage/Task 时显示变化痕迹，冷启动不演“全量新建”；
- 不把 Activity 当完整历史；不做快照回放；
- 用真实 API 数据 + E2E 验证；补 F8 相关边界。
