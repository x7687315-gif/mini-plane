# Anatomy V2 · Phase 1 安全、稳定的静态对象

> 日期：2026-10-26 · 分支：`feat/anatomy-v2`
> 依据：[技术调研报告](MINI_PLANE_ANATOMY_TECHNICAL_RESEARCH.md) Phase 1 + [ADR-003](../../../../decisions/ADR-003-anatomy-v2-object-language.md)
> 范围：只做静态 React SVG 对象、纯模型/布局、测试与门禁；**未引入 Motion、未做历史/快照、未改后端领域模型**。

## 1. 做了什么

| 文件 | 变更 |
|---|---|
| `frontend/features/anatomy/geometry.ts` | 等距投影、盒子三面、包围盒、文本宽度估算/按宽度截断 |
| `frontend/features/anatomy/model.ts` | `selectAnatomyViewModel`：Stage 分组、散件、NOW/next/agent/progress 只读映射 |
| `frontend/features/anatomy/layout.ts` | `computeAnatomyLayout`：确定性网格、动态画布、聚焦/幽灵态、包围盒、散件托盘 |
| `frontend/features/anatomy/index.ts` | 纯函数 barrel |
| `frontend/components/anatomy/AnatomyScene.tsx` | React JSX SVG：统一 Stage 模块、Task 构件、散件托盘、可聚焦 Stage、任务点击 |
| `frontend/components/anatomy/AnatomyPlate.tsx` | 独立 Index 侧栏（不再覆盖主图）、聚焦详情、图例、图签；无 `dangerouslySetInnerHTML` |
| `frontend/app/(protected)/projects/[pid]/page.tsx` | plate 视图加宽（`max-w-6xl`），传入 `now_task_id` / `progress` / `progress_source` |
| `frontend/tests/fixtures/anatomy-fixtures.mts` | F0–F10 数据矩阵 |
| `frontend/tests/unit/anatomy-model.test.mts` | 11 条模型/布局测试 |
| `frontend/tests/e2e/anatomy-v2.spec.ts` | 2 条真实栈 E2E（聚焦/抽屉、特殊字符安全） |
| `frontend/tests/alias-loader.mjs` | 测试运行时支持相对扩展名省略 + 目录/as index 区分 |
| `frontend/scripts/capture-anatomy-v2-*.mjs` | 基线与 Phase 1 演示数据截图 |

## 2. 关键实现

### 2.1 Stage 统一语法

所有 Stage 使用同一套等距板体（top/right/front 三面）；任务数量只改变内部构件的
排布密度，不再按 0/1–3/4–6/7+ 切换建筑类别。当前 Stage 用钴蓝描边；空 Stage 有
内嵌虚线轮廓；`weight` 与记录进度只出现在标签，不用体量暗示未定义指标。

### 2.2 布局与画布

- 纯函数、稳定 ID、`order` 排序；相同输入输出完全一致。
- 画布宽度按 Stage 数量分档（760/900/1000/1050/1200），高度随行数/散件托盘增长；
  没有固定“唯一构图”常量。
- Stage 包围盒包含模块、标签与 Task 构件；单测断言 F2/F8/F16 两两不重叠且全部在 viewBox 内。
- HTML Index 是独立侧栏（窄屏落到主图下方），不再覆盖 SVG。
- 散件托盘独立虚线底座，中性可见；不与 Stage 包围盒重叠。

### 2.3 安全与语义

- **移除**动态 SVG 字符串与 `dangerouslySetInnerHTML`；Stage/Task 文本由 React JSX 转义。
- 不绘制 Task↔Task 依赖线；图例明确“位置与体量只表达结构”。
- Stage.progress、Task 状态统计、Project progress + `progress_source` 分列。
- NOW 只用 `/projects/mine/` 的 `now_task_id`；NEXT 只用 `plan.next_stage`；Agent 只显示真实会话。
- `now_task_id` 所在的 Stage / 散件标签追加 `NOW`，Task 构件加粗描边。

### 2.4 既有行为兼容

- `?view=plate`、Stage Index、任务抽屉、read-only、图签、Blueprint Editorial 全部保留。
- 工程台切到图纸时页面放宽到 `max-w-6xl`；工作台视图仍 `max-w-4xl`。

## 3. 验证（真实运行）

| 门禁 | 结果 |
|---|---|
| 前端 typecheck / lint | 通过（0 error / 0 warning） |
| 前端单测 | **154 pass / 0 fail**（新增 11 条 anatomy） |
| 生产构建 | 通过 |
| Playwright 全量 | **36/36 pass**（+ setup = 37/37） |
| 专项 E2E | 聚焦→抽屉、特殊字符无注入：3/3（含 setup） |
| 后端 | 未改后端；沿用稳定化 **387** 绿 |

### 截图

- [Phase 0 baseline](baseline/overview.png)（旧实现）
- [Phase 1 overview](phase1/overview-demo.png)（3 Stage + 8 Task + 2 散件）
- [Phase 1 focus](phase1/focus-demo.png)（聚焦 Stage 02）

截图由 `frontend/scripts/capture-anatomy-v2-phase1.mjs` 用临时私人项目生成，结束后删除项目；
不是真实用户数据，也不是测试截图伪造。

## 4. 已知边界（留到后续阶段）

1. 聚焦时非选中 Stage 以 `opacity .12` 的幽灵态保留位置，但没有可见轮廓/锚点；
   Phase 2 会正式做 spatial state + 幽灵轮廓 + 可逆分解。
2. 没有动画；快速切换/展开/收拢的最终一致性由 Phase 2 状态机与测试覆盖。
3. 16+ Stage 的画布会纵向变长；当前只验证包围盒/不重叠，尚未做真实性能基准。
4. 聚焦详情面板是静态 HTML；Phase 2 再统一键盘焦点与 `prefers-reduced-motion`。
5. 历史/快照完全未实现；ActivityLog 仍只是审计，不是完整事件流。

## 5. 下一阶段（Phase 2）

- `SpatialState` 判别联合 + action/reducer；overview → focus → exploded → restore。
- 独立 Motion for React Spike（transform/opacity/viewBox、快速中断、减少动态效果）；
  通过后才接入主组件。
- SVG Stage 可见焦点、键盘 Enter/Space、Esc 返回；Index 保留为等价路径。
- 增加 F9 快速交互与 F10 reduced-motion 测试；补视觉截图。
