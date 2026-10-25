# 工程可视化提案 · 「图纸」视图（SHEET VIEW）

> 状态：**待用户评审**（原型已做，未动生产代码）。
> 原型：`ui-design/miniplane-sheet-viz.html`（结构剖面图 / 流水线两视图可切换）。
> 宗旨对齐：**零新操作、零新依赖、零后端改动**——图只读，数据全部现成。

## 一、为什么是「建筑剖面图」而不是甘特图/节点图

| 候选 | 判断 | 依据 |
|---|---|---|
| 甘特图（OpenProject 路线） | ❌ | 甘特需要**起止日期**；我们的 Stage 没有日期语义，硬套=逼用户填时间（增加操作复杂度，违背宗旨） |
| 节点图（[React Flow](https://reactflow.dev)） | ❌ | 阶段是**线性序列**（order 1..N），不是 DAG；且 DESIGN.md 红线禁止引 UI 库，React Flow 是重依赖 |
| **建筑剖面图（手绘 SVG）** | ✅ | 与 Blueprint Editorial 隐喻同构（「项目=一张施工图」）；线序结构天然是「楼层」；零依赖 |

制图语义映射（每个视觉元素 1:1 对应一个真实字段，无装饰性图形）：

| 图纸元素 | 数据字段 |
|---|---|
| 楼层自下而上 | `Stage.order` |
| **层高** | `Stage.weight`（权重大的阶段在图上更"厚"——权重第一次被"看见"） |
| 剖面填充线（断面线） | `Stage.progress`（建筑制图的 hatching，蓝图 DNA） |
| 脚手架 + ▲NOW | `is_current` + 该阶段挂着的进行中 Task（Task↔Stage 已落地） |
| 左侧标高符号 ▽ | 累计完成度刻度（0→100） |
| 右侧证据戳 | 该阶段 Worklog 的日期（Task 是计划，Worklog 是证据——图上分列） |
| 标题栏（图签） | 工程名 / identifier / 日期 / REV=当前阶段号 |

## 二、交互（刻意少）

- 悬停楼层 → 显示该阶段目标（goal）；
- 点击**当前层** → 展开它的任务清单（开合，无拖拽无编辑）；
- 编辑仍走工程台既有的「调整」态——图**永远是读的**，不新增任何写操作。

## 三、落地方案（用户确认后）

- 位置：工程台「路线」区升级为「图纸」视图（同一个数据源 `usePlan` + 任务列表按 `stage` 分组，纯前端）；
- 实现：手绘 SVG（原型代码可直接演进），复用 `--color-*` tokens，明暗主题自动跟随；
- 后端：**零改动**（tasks 已带 stage、worklogs 已带 stage_id、mine 聚合已有 progress_source）；
- Island 适配：Island 卡片后续可引用同一 SVG 的缩略版（一张楼栋小图），本期不做。

## 四、外部参考（检索台账）

| query | 主要命中 |
|---|---|
| `open source project roadmap visualization stages progress react-flow d3 mermaid github` | [React Flow 官网](https://reactflow.dev) · [Showcase](https://reactflow.dev/showcase) · [社区用例讨论 #3588](https://github.com/xyflow/xyflow/discussions/3588) |
| `self-hosted project management visual roadmap structure diagram stages tasks hierarchy open source` | [OpenProject](https://github.com/opf/openproject)（甘特/路线） · [Plane 自托管指南](https://plane.so/blog/self-hosted-project-management-jira-server-alternatives) · [Kanboard](https://kanboard.org) |

结论：同类产品的可视化=甘特/看板二选一；「以结构而非时间为主轴」的剖面图在个人工程管理里没有直接同类——属本产品差异化（借用的是建筑制图惯例，不是软件 UI 惯例）。
