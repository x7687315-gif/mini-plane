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
| `GitHub Skyline contributions 3D city skyline isometric contributions extension stars`（用户指定的主流设计调研） | 官方 [gh-skyline CLI](https://github.com/orgs/community/discussions/129740) · [GitCity](https://github.com/rishabhbhartiya/GitCity) · [Isometric Contributions 扩展 4.9★](https://chromewebstore.google.com/detail/isometric-contributions/mjoedlfflcchnleknnceiplgaeoegien) · [等距贡献 API](https://dev.to/spec_psx/i-built-an-api-that-turns-your-github-contributions-into-a-3d-isometric-graph-43dk) |
| `Excalidraw hand-drawn diagram style why popular rough sketch aesthetic stars` | [MakeUseOf：手绘风消除完美主义](https://www.makeuseof.com/making-diagrams-hand-drawn-style-tool) · [D2 的手绘美学实践（填充要克制）](https://d2lang.com/blog/hand-drawn-diagrams) · [draw.io sketch 模式](https://www.drawio.com/docs/manual/styles/rough-style) · [xyflow 社区讨论](https://github.com/xyflow/xyflow/discussions/3591) |

### 借鉴落地（原型 v2 已并入，均为主流验证过的元素）

| 来源 | 借什么 | 怎么借（不违背 DESIGN.md 红线） |
|---|---|---|
| GitHub Skyline / Isometric Contributions（4.9★） | 「盖楼=进度」的大众认知 + 等距深度 | 楼层背后 6px 偏移的**轴测幽灵线**（纯线稿，不渲染 3D、不加阴影/渐变） |
| 建筑手绘制图惯例（用户定向，替代初版的 Excalidraw 抖动） | 严谨手绘=几何精确+人味在细节 | **线粗分级**（剖切粗实线 1.4 / 投影细线 0.9 / 幽灵线 0.7）+ **转角微出头**（运笔过交点 3px，当前层 4px）——丁字尺与针管笔的工程伦理，不做随机抖动；断面填充保持 45° 精确 |
| GitHub 贡献格（辨识度最高的进度视觉） | 密度格语言 | 图纸底部「证据格」：Worklog 密度带（蓝=手动 / 绿=Agent），空格如实留空 |

结论：同类产品的可视化=甘特/看板二选一；「以结构而非时间为主轴」的剖面图在个人工程管理里没有直接同类——属本产品差异化（借用的是建筑制图惯例 + 上述三个已被大众接纳的视觉语言）。
