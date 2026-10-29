# Anatomy V3 · Phase 3 生产接入记录

> 日期：2026-10-29 · 分支 `feat/anatomy-v3`
> 范围：桌面版双视图接入生产 `AnatomyPlate`；手机端按用户要求暂缓。
> 样稿：[`prototype.html`](prototype.html) · 审计：[`PHASE1_AUDIT.md`](PHASE1_AUDIT.md) · 原型记录：[`PHASE2_PROTOTYPE.md`](PHASE2_PROTOTYPE.md)

## 1. 结论

生产图纸已从 V2 的「网格 + focus/exploded」切换为 V3 的「生长 / 结构」双视图：

- 左侧固定 Stage 索引，中间主图，右侧固定详情；
- 生长视图：旧下新上、大图 + 纵向滑轨，Task 画在前缘密度线上；
- 结构视图：左侧 ghost 整体堆叠 + 右侧爆炸 Stage 模块，虚线回连原始层位；
- 选中 Stage 在两视图间共享，写入 `?mode=&stage=`；
- 图纸读取**全量 Task**，不再只取 `per_page=100` 的第一页。

## 2. 做了什么

### 2.1 全量 Task 数据边界

- `features/task/api.ts` 新增 `listAllIssues()`：按 100/页顺序翻页、按 id 去重，
  最多 50 页（5000 条），超限时返回 `truncated: true`，不假装拿到了全量；
- `features/task/hooks.ts` 新增 `useAllIssues()`，查询键挂在 `taskKeys.list(pid)` 前缀下，
  沿用既有创建/更新/删除后的失效；
- 工程台列表继续用原来的分页 `useIssues`，互不影响；
- 图纸未取完时显示「正在加载完整任务 / 加载失败 / 任务过多」提示，页脚标注
  `partial task projection`；取完后才是 `full task projection`。

验证：用独立项目造 **120 条 Task**，页面主图、索引和详情都显示 120；
`node` 验证脚本输出 `metaHas120/indexHas120/detailHas120 = true`，无 console error。

### 2.2 双视图状态与 URL

- `state.ts` 只保留 `mode: growth | structure` + `selectedStageId`；
- 选中 Stage 在切换视图时保留；非法 id 退化为当前 Stage → 第一个 Stage → null；
- URL 用 `?view=plate&mode=structure&stage=<id>`；growth 是默认值，不写 `mode`；
- 兼容 V2 分享链接：`?stage=…&expand=1` 读作结构视图，下一次交互会清掉 `expand`。

### 2.3 布局纯函数

- `layout.ts` 拆成 `computeGrowthLayout()` / `computeStructureLayout()`，
  二者共享 Stage/Task 身份、选中状态和详情数据；
- growth：Stage 沿 z 累积，`z` 随 order 递增；Task 前缘最多 14 条线，其余 `+N`；
- structure：ghost 层固定总高度（Stage 再多也不会把整体堆到画布外），
  爆炸模块最多 12 个任务立方体，其余 `+N`；虚线从 ghost 右缘连到模块左前侧，
  避开模块下方标签；
- 5 阶段结构图自适应容器宽度；模块特别多（viewBox > 1600）时才启用横向滚动；
- 视觉上限只影响画入 SVG 的构件数量，Stage 计数与详情仍按全量 Task 计算。

### 2.4 SVG 场景与三栏界面

- `AnatomyScene.tsx`：生长/结构两套渲染；Stage 与 Task 都是
  `role=button` / `tabIndex=0` / Enter/Space；SVG 焦点环用显式 polygon，
  不依赖 `box-shadow`；装饰元素 `pointerEvents="none"`；
- `AnatomyPlate.tsx`：桌面三栏（160px 索引 / 主图 / 270px 详情）；
  生长画布 `max-h-[70vh] overflow-auto`，内容超高时出现纵向滑轨；
  详情固定显示目标、记录进度、权重、任务总数/完成/进行中/待办/取消、
  任务清单、NEW/UPD、Recent Activity 与记录浏览；
- 主图底部继续声明「不画 Task 依赖」；记录按钮标注「当前已加载」，
  不把当前页记录冒充完整历史。

### 2.5 页面接入

- `projects/[pid]/page.tsx` 解析/写回 `mode`/`stage`，删除 V2 `expand` 状态；
- 图纸模式使用全量任务，工作台模式保持分页；
- 图纸页宽从 `max-w-6xl` 调整为 `max-w-[1400px]`，给主图更多空间。

## 3. 验证结果

| 项目 | 结果 |
|---|---|
| `pnpm typecheck` | 通过 |
| `pnpm lint` | 0 error / 0 warning |
| `pnpm test` | 175 / 175 通过（含新增 `anatomy-layout.test.mts`） |
| `pnpm test:e2e` | 40 / 40 通过（setup + 39 业务） |
| 布局基准（16 Stage / 304 Task） | growth p95 0.25ms · structure p95 0.37ms（纯函数层） |
| 120 Task 项目 | 主图 120 / 索引 120 / 详情 120，无 console error |
| 1440×900 桌面 | 生长画布内容 787px、可视 630px，纵向滑轨生效；结构图 807/807 无横向滚动 |
| 键盘 | SVG Stage 聚焦 + Enter 切换详情；E2E 已覆盖 |
| 可访问性 | 严格文本渲染；`svg b` 与详情 `b` 均为 0（无注入） |
| 动效 | `prefers-reduced-motion` 下视图切换/选中仍完成 |

截图（2026-10-29，真实运行态，演示项目 AVXD4 / 22 Task）：

- [生长视图（桌面）](production-growth.png)
- [结构视图（桌面）](production-structure.png)

## 4. 与样稿的差异

1. 生产主图使用真实页面外框（左导航、顶栏、页脚），因此结构图在 1440px
   下可用宽度小于独立原型；5 阶段时仍完整显示，更多模块才横向滚动。
2. 生产详情保留 V2 已有的 Recent Activity 与记录浏览；这是真实记录入口，
   原型只展示了静态演示行。
3. Task 数量超过视觉上限（growth 14 / structure 12）时只裁图，不裁数据；
   详情任务列表仍列出该 Stage 的全部 Task。

## 5. 仍待处理 / 不冒充完成

- **手机端**：按用户要求暂缓。当前 AppShell 在 390px 仍有全站横向溢出，
  不属于本次图纸改动；手机结构图的纵向展开留到桌面稳定后实现。
- **记录区**：Worklog/Activity 仍是当前已加载分页，不是完整历史；
  未新增快照，也不提供旧结构回放。
- **超多 Stage**：结构视图模块很多时靠横向滚动；是否改成分行/分组，
  等真实项目出现 10+ Stage 后再判断。
- **主 README**：仍需在视觉验收后替换 V2 图纸截图与文案。

## 6. 变更文件

```
frontend/app/(protected)/projects/[pid]/page.tsx
frontend/app/globals.css
frontend/components/anatomy/AnatomyPlate.tsx
frontend/components/anatomy/AnatomyScene.tsx
frontend/features/anatomy/index.ts
frontend/features/anatomy/layout.ts
frontend/features/anatomy/model.ts
frontend/features/anatomy/state.ts
frontend/features/task/api.ts
frontend/features/task/hooks.ts
frontend/tests/e2e/anatomy-v2.spec.ts → anatomy-v3.spec.ts
frontend/tests/unit/anatomy-model.test.mts
frontend/tests/unit/anatomy-state.test.mts
frontend/tests/unit/anatomy-layout.test.mts（新增）
```

## 7. 下一步

1. 用户观看生产双视图，确认桌面视觉；
2. 手机端纵向结构视图（桌面稳定后）；
3. 主 README 截图/文案更新；
4. 大量 Stage/Task 的真实项目性能复测（布局已纯函数化，可直接跑基准）。
