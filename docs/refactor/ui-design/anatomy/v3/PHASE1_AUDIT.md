# Anatomy V3 · Phase 1 现状审查

> 日期：2026-10-28 · 分支 `feat/anatomy-v3`
> 目标：在重画构图前确认哪些能力可直接复用、哪些要重构、哪些暂不做。
> 依据：用户《Mini Plane「项目过程可视化」详细规划》与现有 Anatomy V2 代码。

## 1. 现有实现盘点

| 层 | 文件 | 现状 | 本轮判断 |
|---|---|---|---|
| 数据映射 | `frontend/features/anatomy/model.ts` | Project/Stage/Task → 只读 ViewModel；NOW 只取传入值；进度不重算；未归属任务可见 | **保留**，作为双视图共同数据源 |
| 空间状态 | `frontend/features/anatomy/state.ts` | `overview / focus / exploded` 三态；URL 只保存空间焦点 | **扩展**：增加成长/结构视图维度，保留选中 Stage 的稳定身份 |
| 几何原语 | `frontend/features/anatomy/geometry.ts` | 30° 等距投影、盒子三面、包围盒、文本估算、截断 | **保留**，补齐“层叠/水平展开”所需锚点与排序工具 |
| 布局 | `frontend/features/anatomy/layout.ts` | 3–4 列网格铺开 Stage；focus 时放大一个、缩小其他 | **重构**：网格 → 成长堆叠 / 水平结构两套确定性布局 |
| 绘图层 | `frontend/components/anatomy/AnatomyScene.tsx` | React SVG；StageModule + TaskCell + LooseTray；局部坐标 + CSS transform | **重构**：模块语法更克制，统一立面/顶面/轮廓；保留键盘与安全文本 |
| 页面编排 | `frontend/components/anatomy/AnatomyPlate.tsx` | 左图右栏；Stage Index、详情、Recent Activity、记录浏览；抽屉由页面打开 | **调整**：主图居中、索引与详情固定；双视图切换；复用详情/记录 |
| 变更痕迹 | `features/anatomy/changes.ts` | 挂载后真实 `issue.created/updated` 标记 NEW/UPD | **保留** |
| 记录浏览 | `features/anatomy/history.ts` + `AnatomyHistory` | Worklog/Activity 分栏只读；明确不是完整历史 | **保留**，文案继续诚实 |
| URL | 页面 query `?view=plate&stage=&expand=` | 视图 + 空间焦点 | **扩展**：增加 `?view=growth|structure`（或 `mode`），保持可分享 |

## 2. 代码层面的真实问题

### 2.1 当前构图读起来像“模块网格”，不是整体工程

`layout.ts` 用 3–4 列网格铺开 Stage（`gridSpec`），focus 时把一个 Stage 放大并重排其他 Stage。
从远处看是一组离散模块，缺少用户要求的“同一整体在生长”与“沿水平方向拆开”的两种整体轮廓。

### 2.2 图纸实际可能只拿到 100 个 Task

`frontend/app/(protected)/projects/[pid]/page.tsx:139` 用
`useIssues("", pid, { per_page: 100, page })`，`:175` 只把当前页 `taskPage.results` 传给
`AnatomyPlate`；后端 `StandardPagination.max_page_size = 100`。
因此 **Task > 100 时，图纸缺失构件，Stage 任务数、未归属数、NOW 归属也可能错误**。
V3 生产接入前必须为图纸取全量 Task（分页循环）或由后端提供专用轻量全量端点；
原型阶段先用完整演示数据验证构图。

### 2.3 记录区也是当前页

`:141` 的 `useProjectActivities("", pid)` 与 `:268` 的 `useWorklogs("", pid)` 都是默认分页；
目前“记录 · N”是当前页数量，不是全量。V3 继续把它定义为**浏览当前已加载记录**，或后续改成
显式分页/全量；不能悄悄冒充完整历史。

### 2.4 状态机没有“视图”维度

`state.ts` 只有空间三态，切到“图纸”后无法区分成长/结构；V3 需要把
`mode: growth | structure` 放进 URL 与状态机，且切换视图时保留选中的 Stage。

### 2.5 文档存在概念阶段与生产实现的混用

- `docs/refactor/ui-design/anatomy/AGENT_START_HERE.md` 仍要求“只做三个概念草图、不要接生产”；
- `MINI_PLANE_PROJECT_ANATOMY_SPEC.md` 是早期设计包主说明；
- `ANATOMY_IMPLEMENT_REPORT.md` 是 Round 2–4 的实现记录；
- `v2/README.md` 才是当前 Phase 0–5 的状态。

V3 开始前应新增 V3 设计决策，并把上述文件标注为历史/前序，避免 Agent 同时遵循冲突指令。

## 3. 必须保留的能力

- Stage 记录进度、Task 状态统计、Project progress/`progress_source` **三者分列**；
- NOW 只用 `now_task_id`；NEXT 只用 `plan.next_stage`；Agent 只显示真实运行态；
- `stage=null` 的 Task 可见、中性，不隐藏、不羞辱；
- 不画 Task↔Task 依赖；不把 Worklog/Activity 当完整历史；
- React + SVG，不引入 3D 引擎/图形库；
- 键盘可达、文本由 JSX 渲染、`prefers-reduced-motion`；
- 相同数据生成相同布局；新增 Stage 不无故移动既有构件。

## 4. 需要重构/新增

1. **双视图布局纯函数**：`layoutGrowth()` / `layoutStructure()`，共享 Stage/Task 身份与详情数据。
2. **几何锚点**：为每个 Stage 固定 `slot index` 与 `anchor`，新增 Stage 只追加，不重排旧槽位。
3. **视图状态**：`mode: growth | structure` + `selectedStageId`，URL 可分享。
4. **绘图层**：统一“楼板 + 立面 + 顶面 + 轮廓”语法；选中用抬升/轮廓/辅助线，不只换背景色。
5. **页面编排**：主图优先；索引可纵向滚动/拖动；详情固定；移动端改为上下布局并允许结构图横向滚动。
6. **数据完整性**：生产接入时取全量 Task；记录区明确“当前已加载”或做分页。

## 5. 暂不做

- 不增加多种项目类型造型（齿轮/城市等）；
- 不引入 Three.js/WebGL/Canvas 渲染；
- 不做按日历史回放（无快照）；
- 不改后端模型/API/数据库；
- 不重构工程台其他区域；
- 不在本阶段删除 V2 组件；V3 原型确认后再切换生产实现。

## 6. Phase 2 交付定义

独立 `prototype.html`（不接生产路由、不改 API），包含：

- 成长视图：Stage 垂直累积，当前 Stage 明确；
- 结构视图：Stage 水平分离，少量垂直错位；
- 固定详情区：选中的 Stage 目标、记录进度、任务真实计数、任务列表、记录入口；
- 选中状态：鼠标点击 + 键盘 Enter/Space；切换视图保留选中；
- 响应式：桌面三栏，移动端单栏 + 结构图横向滚动；
- 明确“演示数据/不是历史回放”的标注。

验收：用户先看样稿；确认空间感后再进入 Phase 3 布局模型与生产接入。
