# 项目解剖图 · Phase 0 审查 + Phase 1 三方案报告

> 依据：`MINI_PLANE_PROJECT_ANATOMY_SPEC.md`（设计包指令）+ `references/00-concept-direction.png`（概念方向图）。
> 状态：**概念阶段交付，零生产代码改动**。等待用户确认方案后进入 Phase 3（实施计划）。
> 本轮产出：3 张独立 HTML/SVG 概念草图（`sketches/sketch-a|b|c.html`，已经浏览器实测渲染通过）。

## 1. 我查到了什么（Phase 0 · 仓库事实）

**数据获取路径（全部现成，零后端改动）：**

| 数据 | 获取路径（既有） |
|---|---|
| Project + 当前角色 | `useProject("", pid)` → `GET /api/v1/projects/{pid}`（含 `owner`/`identifier`/`progress` 派生） |
| Plan + Stages（order/weight/progress/is_current/goal + `current_stage`/`next_stage` 派生） | `usePlan("", pid)` → `GET /projects/{pid}/plan` |
| Tasks（含 `stage` FK、`state.group`、`priority`、`sequence_id`） | `useIssues("", pid, {})` → `GET /projects/{pid}/tasks` |
| Worklogs（date/title/summary/`stage_id`/source） | `useWorklogs("", pid)` |
| NOW / NEXT / Agent 运行态 | `useMyProjects()`（`now_task_id`、`next_task`、`agent_running`，单 SQL 聚合） |

**可复用资产**：`components/ui/v2.tsx` 原语（DimProgress/SectionHead/InkAction）、DESIGN.md 全套 token（`--color-*`，明暗主题自动跟随）、IssueDrawer（任务详情，`?issue=` URL 语义）、React Query 键工厂、`.wrap/.abs` 布局模式。

**与 DOMAIN_MODEL 的差异核对**：无冲突；`Task.stage` 可空（Phase 2 已落地）→ 散件区有真实数据支撑；`progress_source` 已在 mine 响应中。

**可复用组件清单**：`useProjectRealtime`（聚焦视图后续可接实时）、`IssueDrawer`（详情不重写）、`QuickLogModal`（记录入口不动）。

## 2. 我确认了哪些硬约束

1. **Task↔Task 依赖不存在**——绝不画依赖线/箭头；相邻=同阶段分组。
2. **Stage.progress ≠ 任务完成率 ≠ Project 总进度**——总进度以后端 `progress_source` 权威口径为准（本示例 83% · source: PLAN），三者图上分列不混算。
3. **Task.stage 可空是业务状态**——散件区中性可见（虚线托盘/散件架），不用红色警报或"孤儿"羞辱性暗示；无散件时空态收敛。
4. **NOW/NEXT/Agent 只用权威真值**——NOW=started 最新（`now_task_id`）、NEXT STAGE=`plan.next_stage`、Agent=运行中会话；缺数据不伪造。
5. **Worklog 只在真实 stage 关联时挂靠**；无关联的进项目级区域，不硬连。
6. **不引入 Three.js/WebGL/图形库**——React + 手绘 SVG；不新增依赖。

## 3. 当前原型为什么失败（对照规格 §8，逐条确认）

旧原型（`references/02-legacy…`，即我的 anatomy-ab）失败在**几何与构图**，不是配色：

1. 五个阶段是**同型同宽的斜切板**——只有 6px 偏移的伪 2.5D，没有真正的轴测几何；
2. 任务是**排成行的迷你卡片**——"普通 UI + 等距滤镜"（规格 §8.2 原话命中）；
3. 制图语言停留在网格/字体/标注等表面装饰，没有建立"每个阶段有自己建筑原型"的几何结构；
4. 标注/文字/构件竞争注意力，留白与主从关系缺失；
5. 固定画布 + 手写百分比定位（本次实测还暴露了双除法、标识符冲突两类实现 bug——已修）；
6. 示例数据未按真实 API 形状组织。

概念方向图（`00-concept-direction.png`）给出的正确语言：**每个阶段的建筑原型由其任务密度/性质决定**（开敞箱体/门式框架/多翼体/翼基座各不相同），任务是从结构里长出的立方体细胞（自然散布，不成行），投影虚线落回地面网格，编辑式版式组织全部信息。

## 4. 方案 A / B / C

### A · 空间爆炸图（sketch-a-exploded.html）——首选方向

- **主体构图**：五个阶段构件沿对角线错位悬浮（开敞箱体/门式框架/多翼体/翼基座/开敞箱体），投影虚线落回地面网格；右缘阶段索引 + 总进度面板；左下图例；图签条。
- **Stage/Task 造型**：任务=构件内部的等距立方体（done=钴蓝实心、进行中=钴蓝描边浅底+NOW、待办=空框）；体量与细胞数由阶段任务密度决定。
- **未归属**：独立虚线托盘悬浮于右下，中性可见（3 件）。
- **聚焦**：概念上= lifted-cells（本轮以静态示意；交互态进 Phase 3 细化）。
- **高密度**：Stage 03（8 细胞）密排于多翼体两翼——密度本身成为视觉信息。
- **优点**：与概念方向图最接近、空间张力最强、独特性最高。**风险**：2.5D 绘制代码量最大；标签防重叠需布局规则。

### B · 轴测剖切图（sketch-b-section.html）——可读性验证

- **主体构图**：五阶段连成一个建筑群；**Stage 03 沿 A—A 剖开**（顶面剖掉、前墙剖切、钴蓝剖切缘线），8 个任务构件第一次被看见；其余阶段以 45% 幽灵线框保留位置感。
- **聚焦行为**：剖切即聚焦；右栏给出状态统计与阅读顺序（①整体轮廓→②剖切层→③构件状态→④返回整体）。
- **高密度**：剖切层内 3×3 网格布置，密度可读。
- **优点**：剖切缘（钴蓝粗线）+ 构件阵列的"内景感"极强；实现比 A 简单。**风险**：一次只能深读一个阶段；"剖切"语义需要图例教育。

### C · 工程图纸版式（sketch-c-plate.html）——版式验证

- **主体构图**：编辑式 PLATE——主图（收敛注记的爆炸群）+ **DETAIL A 局部详图**（单阶段模块放大 + 严谨尺寸标注 120/60/44，延伸线+箭头+等宽数字）+ **STAGE INDEX 构件索引表** + 图例/摘要面板；留白按层级分配。
- **优点**：信息层级最清晰、最"可交付"；索引表天然承载高密度（表格不缩放构件）。**风险**：主图缩小后单任务不可辨（靠索引表补偿）；独特性弱于 A。

## 5. 推荐方案

**以 A 为主体、吸收 B 的剖切聚焦与 C 的版式秩序，构成最终 PLATE 视图**：

- 全景 = A（阶段构件 + 散件托盘 + 标高/投影线）；
- 点击阶段 = B 式剖切聚焦（该阶段剖开显示任务构件，其余 45% 幽灵化）；
- 页面骨架 = C 的版式（主图 + 索引/摘要右栏 + 图例 + 图签），任务详情走现有 `?issue=` 抽屉。

**放弃什么**：B 作为独立默认视图（并入 A 的聚焦态）；全量尺寸标注进主图（只在 DETAIL 面板出现，避免噪声——规格 §4.4 的装饰密度约束）。

## 6. 不确定项 / 需用户决策

1. **任务构件上的文字量**：全景里构件只显示状态色块（当前原型）还是加 sequence 编号（MP-16）？倾向：全景色块、聚焦态显示编号——请确认。
2. **PLATE 的入口位置**：工程台头部第三链接「图纸」（与 日志/设置 并列）还是独立 Tab？倾向：头部链接（不动 Tab 结构）。
3. **英文装饰标注**（SECTION A—A / DETAIL A / NOW 等图纸语汇）：保留英文+中文正文混排（当前原型，符合 Blueprint Editorial 既有惯例）还是全中文？倾向：保留英文微标注。

## 7. 改动边界声明

**本轮未修改任何生产代码、API、数据库、路由、生产 CSS 或现有交互。** 产出 = 3 张概念草图（`sketches/sketch-a|b|c.html`，浏览器实测渲染通过）+ 素材入库（规格/概念图/旧原型存档于 `anatomy/references/`）+ 本报告。已运行前端 typecheck/lint 单测确认无回归（143 绿）。
