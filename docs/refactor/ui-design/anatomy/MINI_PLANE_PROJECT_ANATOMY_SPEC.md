# Mini Plane — Project Anatomy 重新设计技术设计说明

> **文档类型：** 设计方向 / 产品语义 / 前端实现约束 / Agent 执行协议  
> **状态：** 概念阶段；尚未批准生产实现  
> **设计代号：** Project Anatomy / 空间解剖图  
> **仓库：** https://github.com/x7687315-gif/mini-plane  
> **最后整理：** 2026-10-25

---

## 0. 给执行 Agent 的最高优先级指令

本文件是本轮「项目解剖图」设计探索的执行基准。开始前先阅读本文件第 0、1、2、3、4、5、8、9、10、11 节，并检查仓库内列出的事实源。

### 0.1 当前阶段是设计探索，不是生产开发

**在用户明确认可新的概念方向之前，不得直接重写现有页面、不得把当前 HTML 原型改色后当作新设计、不得开始生产代码实现。**

第一轮只允许：

1. 检查仓库、现有页面、设计系统与领域模型，确认真实可用的数据与现有组件。
2. 阅读 `references/` 中的概念图和旧提案，理解方向和失败教训。
3. 产出 3 个彼此真正不同的静态概念草图/低保真方案，用来比较构图与空间表达；可以用独立 SVG 或独立 HTML 原型，但不得接入生产路由或改变现有业务代码。
4. 书面解释每个方案怎样映射 Project / Stage / Task / Worklog / NOW / NEXT / Agent 数据，怎样处理任务密集和未归属任务。
5. 提交推荐方案、取舍、仍需用户决策的问题；等待用户审核后再进入实现计划。

本轮草图可以是代码形式的设计产物，但它们不是生产实现。除非用户另行批准，不要改变数据库、API、路由、业务逻辑、生产 CSS 或现有交互。

### 0.2 必须先理解的项目事实源

请按下列优先级阅读，遇到冲突时不要自行猜测：

1. 产品原则：[`docs/PRODUCT_PRINCIPLES.md`](https://github.com/x7687315-gif/mini-plane/blob/main/docs/PRODUCT_PRINCIPLES.md)
2. 领域模型：[`docs/DOMAIN_MODEL.md`](https://github.com/x7687315-gif/mini-plane/blob/main/docs/DOMAIN_MODEL.md)
3. 设计系统：[`frontend/DESIGN.md`](https://github.com/x7687315-gif/mini-plane/blob/main/frontend/DESIGN.md)
4. 页面蓝图：[`frontend/SCREEN_BLUEPRINTS.md`](https://github.com/x7687315-gif/mini-plane/blob/main/frontend/SCREEN_BLUEPRINTS.md)
5. API 契约：[`docs/api/`](https://github.com/x7687315-gif/mini-plane/tree/main/docs/api) 与 [`docs/api/openapi.yaml`](https://github.com/x7687315-gif/mini-plane/blob/main/docs/api/openapi.yaml)
6. 仓库总览：[`README.md`](https://github.com/x7687315-gif/mini-plane/blob/main/README.md)

建议同时搜索 `ProjectPlan`、`ProjectStage`、`Task`（后端历史存储名可能仍为 `Issue`）、`Worklog`、`AgentSession`、`progress_source`、`is_current`、`stage`、`NOW`、`NEXT`。

**不要把旧原型里的硬编码样例误认为当前数据库、API 或业务规则。**

---

## 1. 产品目标：把项目作为一个可被观察、拆解的工程对象

### 1.1 一句话定义

Project Anatomy 是 Mini Plane 内用于理解项目组成与状态的**独立只读观察视图**：它将真实的项目数据映射为一张具有空间感的爆炸轴测工程图，让用户先看见项目整体，再聚焦阶段与任务的内部组成。

### 1.2 目标用户体验

打开视图的第一眼，用户应当感到：

- 这是一件有整体结构的、正在构建的工程对象，而不是一组添加了等距阴影的卡片。
- 阶段是工程中的主要构件；任务是阶段内部可识别的工作单元。
- 构件被拆分、悬浮，但仍能理解哪些任务属于哪个阶段、阶段在全局中的位置。
- 视觉上兼具艺术性与实用性：远看有整体轮廓和空间张力，近看有清楚的数据、编号、状态和注释。
- 这是一张可以探索的工程图纸，而不是新的任务编辑器；原有项目管理流程仍然是主操作路径。

### 1.3 不是什么

它不是：

- 一组水平排列的矩形 Stage 卡片加上斜切、阴影或 `transform: skew(...)`。
- 看起来像建筑、但内部数据语义不清楚的纯装饰 3D 模型。
- 甘特图、任务依赖 DAG、自动排期器或自动规划器。
- 一个替代项目页、任务列表、Worklog 或 Engineering Island 的新主页面。
- 需要运行 WebGL / Three.js 才能成立的复杂 3D 场景。

### 1.4 设计成功标准

概念草图必须同时通过：

**视觉测试：** 隐去按钮和外围 UI 后，主体工程图仍然成立；有明确视觉重心、空间层级、轮廓节奏与留白；不像一般 Dashboard。

**语义测试：** 不看说明，至少可以辨认 Stage、Task、未归属任务和当前聚焦对象；构件之间没有虚构的依赖关系。

**实用测试：** 用户可以快速找到当前阶段、关键任务和未归属任务；选中一个阶段后能了解其构成；任务多时不靠无限缩小来塞内容。

**诚实性测试：** 每个状态、进度、注释和实时标识均能追溯到真实数据，或明确标为纯视觉辅助，不把示例数值作为真实值。

---

## 2. 主设计方向：爆炸轴测图 + 局部剖切 + 编辑式图纸编排

### 2.1 方向名称

**Exploded Axonometric / Spatial Anatomy（空间爆炸解剖）**

主方向是有空间感的立体工程图：阶段与构件在三维视觉空间中被拆开、错位、悬浮展示。局部可以借鉴剖切视图，图纸整体则借鉴精密工程制图与欧洲编辑式版面。

三者的职责不同：

1. **爆炸轴测图负责主体空间。** 先看到完整工程的整体构成，再看到被拉开的组成部分。
2. **剖切/局部展开负责内部解释。** 当聚焦某个 Stage 时，深入看到内部 Task 构件；不要把每个构件的所有细节同时展示出来。
3. **Editorial plate 负责整张画面的秩序。** 标题、图号、图例、尺寸/辅助标注和摘要信息围绕主体排布，而非堆成一圈抢夺注意力。

不要把 A/B/C 的所有装饰无差别叠加。主体始终是爆炸轴测图，剖切仅服务于查看局部，制图版式仅建立阅读秩序。

### 2.2 参考图如何阅读

打开 `references/00-concept-direction.png` 查看本次为讨论绘制的概念方向图。

它是**气质与构图关系示意**，不是像素级 UI 规范，也不是实际项目数据截图。图中的 `Initiation`、`Development`、`Testing`、`Deployment`、任务数量、进度、尺寸和百分比都是生成图里的示例/装饰信息，不得当作 Mini Plane 的真实实体、真实字段值或设计定稿。

从中只提取：

- 暖纸底上的精细线稿、冷静的蓝灰层次；
- 多个空间单元的错位，而不是统一高度的水平矩形排布；
- 一致的轴测方向、细的辅助投影线、轮廓遮挡和适度透明/浅色面；
- 主体与右侧信息、左侧标题、底部图例之间的视觉层级；
- 注释稀疏、留白充足、局部小图而非全页面板化。

不要照抄该图的阶段名称、数据值、构件数量、右侧统计栏位置或每一处建筑细节。真实构图应由 Mini Plane 数据结构、实际视口和任务密度共同决定。

### 2.3 三条探索路线（先做独立草图，再推荐）

**A — 空间爆炸图（首选方向）**

- 整个项目以一组悬浮、错位的阶段构件呈现。
- Stage 的位置可体现真实 `order` 或明确的视觉分层，但不得用箭头暗示任务依赖。
- Task 作为小型构件或内嵌工作单元出现。
- 未归属任务是独立、克制、可辨认的“待归属构件群”。
- 最适合建立与当前 UI 明显不同的视觉主体。

**B — 轴测剖切图（用于验证可读性）**

- 选择一个 Stage 展开或剖开，让任务内部组成可读。
- 未聚焦部分仍以轻量背景形态保留，以免用户失去整体位置感。
- 重点测试：聚焦后是否能更好地阅读密集任务，而不成为抽屉式列表。

**C — 工程图纸版式（用于验证整体编排）**

- 大型主图 + 少量局部详图/构件索引 + 有限摘要信息。
- 重点测试图纸整体如何拥有编辑式构图、标题层级和留白。
- 它不是一张普通卡片 Grid；主图必须占据版面主体。

建议最终以 A 为主体，吸收 B 的局部观察方式与 C 的版式秩序；只有概念草图证明这些组合成立后，再形成单一推荐方案。

---

## 3. 真实领域模型与视觉映射

这部分是硬约束。视觉可艺术化，但领域语义不能被美术修改。

### 3.1 实体语义

| 实体 | 产品语义 | 视觉角色 | 约束 |
|---|---|---|---|
| Project | 一个持续推进的工程 | 整张图的对象与标题上下文 | 不把 Workspace 当作 Stage；视图不重定义 Project 所有权 |
| ProjectPlan | 项目的目标/路线载体 | 结构依据，不一定画成实体 | 不用 UI 装饰新增并不存在的 Plan 层级 |
| ProjectStage | 路线上的阶段与目标 | 主要空间构件 | 使用服务端/模型的真实顺序；名称和记录进度如实显示 |
| Task（历史存储实体可能叫 Issue） | 计划中的工作项 | Stage 内的较小构件 | `Task.stage` 可空；不可假定所有任务都有 Stage |
| Worklog | 实际做了什么、结论、下一步/阻塞 | 真实日志的注释/局部标记 | 只有在确实关联到 Stage 时，才将其标注为 Stage 的关联日志 |
| AgentSession | Agent 当前/最近一次会话 | 真实运行状态标记 | 只有确实运行时显示 RUNNING；不得将 Task 文案伪装成 Agent 上报的 STEP/HOW |

### 3.2 不得画出来的数据关系

目前**不存在 Task 与 Task 之间的依赖实体**。因此：

- 绝不画 Task → Task、前置/后置、依赖网、箭头链、连线网络。
- 不以相邻、对齐、重叠或空间距离来暗示任务之间的先后/依赖。
- 不因为 Stage 在路线中有 `order` 就推导该 Stage 中每个 Task 依赖前一个 Stage 的 Task。
- 辅助虚线只能表达绘图对齐、空间投影或同一个构件的拆分定位，并应设计得不会误读为任务依赖。
- 如果画面需要明确指出“这是投影辅助线”，应使用低对比、短线/点线和几何对齐方式，而不是带箭头的连接线。

### 3.3 阶段进度不等于任务完成率

Mini Plane 的 `Stage.progress` 是阶段的记录进度，不得默认从 Stage 下任务状态计算得出。

项目总体进度的计算口径与 `docs/DOMAIN_MODEL.md` 一致：

- 有 Plan、至少一个 Stage 且总权重大于 0：按 `Σ(weight × stage.progress) / Σweight` 计算，进度来源为 `plan`。
- 否则按任务完成率 `done / total × 100` 计算，进度来源为 `tasks`。
- 无阶段且无任务时，总体进度为 0，来源为 `tasks`。
- API 若提供 `progress_source`，UI 必须尊重它；不要在前端另写一套不一致的计算。

视觉方案需要区分：

1. **Stage 记录进度**（如有权威字段）：可以作为阶段构件的进度标记。
2. **Stage 内 Task 状态统计**：是另一类数据，按实际任务状态统计。
3. **Project 总体进度**：使用后端返回的权威口径/值。

不能把任务 Done 数、Stage.progress 和 Project progress 混成一个百分比。

### 3.4 NOW / NEXT / Agent 语义

- **NOW：** 遵循仓库当前权威语义/服务端派生结果。领域模型当前定义优先级为 `state.group=started` 中最近更新的任务（稳定次级键）；没有 started 任务时才按定义回退到未关闭任务组。不要自行用“几何中心最近的任务”或“最新 Worklog”推断 NOW。
- **NEXT：** 按仓库现行权威实现和 API 语义展示；不要自行在前端重新排序任务来制造另一个 NEXT。请在概念阶段先查清当前 API 是返回下一任务、下一阶段，还是二者都有；分别命名，不要混淆 `NEXT TASK` 与 `NEXT STAGE`。
- **AGENT：** 仅显示真实 AgentSession 运行态。若没有活动会话，隐藏运行中状态或使用既有产品约定的诚实空状态。Agent 的 STEP/HOW 只能展示 Agent 实际上报的内容。
- **Worklog：** 使用真实关联关系。Worklog 若无 Stage 关联，可以放入项目级日志区域，不要人为连接到某个 Stage。

### 3.5 未归属任务

`Task.stage` 可空是有意义的业务状态，不是数据错误。

- 在全景中必须能找到未归属任务群，并有真实计数。
- 视觉语言建议中性、轻量、低对比，例如独立虚线底座、开放式构件托盘或没有封闭外框的松散构件群。
- 不用红色警报、错误图标、垃圾堆或“孤儿任务”式羞辱性视觉暗示。
- 即使目前没有未归属任务，也要在空态里谨慎处理，不要留下空白的大区域或虚构数量。

---

## 4. 视觉系统约束

### 4.1 与 Blueprint Editorial 保持一致

必须继承现有 `frontend/DESIGN.md`，不是另造一套通用科技风。

建议核心色板（以仓库设计 token 为准）：

- 纸底：`#F4F1EA`
- 次级纸面：`#EBE7DD`
- 网格/弱分割：`#D9D4C2` / `#C8C3B4`
- 主墨色：`#1B1A17`
- 次墨色：`#5A5851`
- 工程钴蓝：`#1F3FA8`
- 次级蓝：`#4F6FD6`
- 蓝色浅底：`#E2E7F5`

状态色应继续使用现有语义 token，并确保色彩以外还存在形状、边框、图案、标签或文字差异。不能为视觉炫酷引入青紫渐变、霓虹光、发光描边。

### 4.2 空间几何

- 使用一致的轴测/平行投影体系。推荐从常见 30°/30° 轴测基线开始，在概念草图中比较视角与层间距离；全图不得混用互相冲突的投影角度。
- 构件可以有不同宽、高、厚度、局部开口或被拆分的层，但几何变化必须服务于真实 Stage/Task 的组织，不得创造新的业务含义。
- 通过轮廓线、不同面明度、少量透明面、适度遮挡、错位和留白来建立深度。
- 虚线投影辅助线只在需要解释构件的相对位置时出现；不得把所有边都投影/连接，避免变成网格噪声。
- 避免所有 Stage 都是同大小、同高度、同模板的长方板。
- 避免将每个 Task 做成带完整标题、描边、阴影、圆角的微型卡片。
- 空间体量不自动等于任务重要性、复杂度、时间成本或进度。如果尺寸用 Task 数量/密度来调节，必须在草图中明确这是视觉编码，并控制其范围；更安全的默认是保持主体体量可比，以内部单元密度承载任务数量。
- 构件不能为了“像建筑”而凭空添入梁柱、楼层、管线、接口端口等带业务暗示的元素。若使用抽象支撑/底座，必须只是非语义绘图基准。

### 4.3 空间悬浮的含义

爆炸/悬浮表现“组成部分被分开呈现”，并不自动表示：

- 执行顺序；
- 任务依赖；
- 时间排期；
- 真实三维物理空间；
- 某个 Task 比其他 Task 更重要。

只有当信息有真实字段支撑时，才能给它增加可解读的语义；否则应把空间关系当作视觉排版。

### 4.4 制图语汇与装饰密度

可选择性使用：

- FIG / SHEET / REV 等微标签；
- 坐标标记、十字准星、少量尺寸线、比例/轴测指示；
- 构件编号、局部详图、短引线注释；
- 轻微纸面质感、低对比蓝图网格；
- Cormorant Garamond 的装饰标题、Inter 正文、JetBrains Mono 数据标记（遵循现有字体 token）。

不要求每一项都出现。每一种装饰必须回答“帮助定位、解释、分组，还是纯装饰？”如果只是纯装饰且增加了噪声，应删除。

### 4.5 必须保留的视觉红线

沿用 `frontend/DESIGN.md`：

- 不使用渐变、毛玻璃、霓虹、发光；
- 不做多层阴影、卡片套卡片；
- 不使用厚重阴影来假装空间；
- 普通 UI 元素保持直角/极小圆角，不擅自引入大圆角卡片；
- 不引入组件库或图标库，图标遵照项目自绘 SVG 约定；
- 字重、字体和配色不另立规范；
- 动效若未来进入实现，遵循现有 `transform` / `opacity` 约束与 150–250ms 时长，并尊重 `prefers-reduced-motion`。

---

## 5. 推荐画面构图与阅读层级

以下是概念骨架而非固定像素布局。不得把它硬写成在各种窗口下不变的固定坐标拼图。

### 5.1 全景（Overview）

目标：优先让用户理解完整工程结构；文字只承担解释，不主导画面。

建议构成：

1. **标题/图纸元信息区：** 项目名称、identifier、`PROJECT / ANATOMY`、FIG/SHEET 等克制标记。
2. **主体工程图：** 占据主要视觉面积；项目 Stage/Task 的空间构图；构件间有明确的分离与共同方向。
3. **必要的摘要信息：** 总体进度及其来源、阶段数、任务数、未归属任务数等。只展示有真实来源且有助于理解项目的信息。
4. **局部注释：** 选少数重要对象做短引线/编号，不要为每一个构件放长说明。
5. **图例：** 用极简图例说明 Stage、Task、未归属 Task、状态标记，以及辅助线代表什么。
6. **NOW/NEXT/Agent：** 作为状态注释出现，优先展示当前工作状态；缺数据就不显示或采用既有空状态，不造内容。

建议的注意力顺序：主体轮廓 → 当前/焦点 Stage → 任务分布与未归属任务 → 总体/局部状态 → 细小图纸元信息。

### 5.2 Stage 聚焦（Focus Stage）

- 点击 Stage 的可识别主体即可聚焦；提供键盘可达的等效操作。
- 通过局部展开、剖切、提高线条清晰度或放大该构件来体现聚焦，而不是只换一个背景色。
- 项目整体保持可感知，可用轻量轮廓/定位标记说明当前 Stage 在全景的位置。
- 显示真实 Stage 名称、记录进度、Task 统计与其真实关联的 Worklog（若有）。
- 不要把所有信息塞进图中；长描述可使用现有抽屉/侧栏模式。
- 可返回全景；聚焦/返回交互不改变数据。

### 5.3 Task 详情

- 点击 Task 构件显示现有任务详情模式（优先复用现有组件/抽屉，不重写任务编辑流程）。
- 任务几何表达要简洁，名称过长时允许视觉省略，但详情里保留完整文本。
- 不把评论、Activity、完整 Worklog 内容全写在构件表面。
- 选中状态需有可见的非颜色线索（如轮廓粗细、定位括号或局部标记），并支持键盘操作和可访问名称。

### 5.4 高密度任务

当 Task 数很多时，按以下原则处理：

- 全景优先保证 Stage 组成和任务密度可辨；每个 Task 不必在全景中显示完整标题。
- 保留真实任务数量/状态计数，必要时将可读文本留到聚焦视图。
- 不得无上限地缩小构件和文字；设置明确的最小可辨识尺寸。
- 不得简单裁掉超出画布的任务；需要局部滚动/聚焦视图/密度模式时，概念草图要展示它如何发生。
- 对任务很多的 Stage，优先用内部构件群、少量编号和状态标记表达密度；选中之后显示完整任务列表或可读的局部布局。

### 5.5 空态与异常数据

至少设计以下状态：

- 没有 Stage、没有 Task；
- 有 Stage、没有 Task；
- Task 全部未归属；
- 有正常关联 Task + 未归属 Task；
- 很多 Stage 或很多 Task；
- 没有 NOW / NEXT；
- Agent 未运行；
- Worklog 没有关联 Stage；
- 字段为空、某些资源加载失败或数据不完整。

空态应该仍然有设计完成度，但不能使用假数据填满画面。没有构件时可展示纸面底图、简洁说明、创建项目/阶段的现有入口（如该视图需要），但本轮概念草图不要求实现写操作。

---

## 6. 版面、响应式与技术建议

### 6.1 实现优先级：SVG + React，不要从 3D 引擎开始

当前仓库使用 Next.js / React / TypeScript / Tailwind。建议用 React 组件组织数据与交互，SVG 表达构件、轮廓、投影辅助线、引线和编号。

不建议在第一版引入 Three.js / WebGL / 物理引擎或复杂渲染依赖。项目目标是精致的静态轴测/2.5D 视图，不是允许用户自由绕物体旋转的真实 3D 软件。

SVG 的好处：

- 轮廓与细线适合工程制图；
- 可以基于 `viewBox` 保持缩放；
- 元素可拥有 hover、focus、点击、ARIA 名称；
- 可以分别维护 Stage、Task、label、leader line 等绘图层；
- 不需要高成本 Canvas/WebGL 栈。

参考资料：

- MDN SVG `viewBox`：https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/viewBox
- MDN SVG 坐标与位置：https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorials/SVG_from_scratch/Positions
- W3C SVG 坐标系统：https://www.w3.org/TR/SVG/coords.html

这些链接用于理解 SVG 几何与响应式坐标，不代表必须新加某个图形库。

### 6.2 数据层、布局层、绘图层分离

概念实现后如获批准，建议把逻辑分成：

1. **View model / data adapter：** 从真实 API 类型转换成纯显示数据；不在图形元素内再实现业务计算。
2. **Layout model：** 负责为 Stage/Task 分配可读位置、构件尺寸、遮挡顺序和局部视图位置。布局坐标是展示计算，不写入数据库。
3. **SVG rendering primitives：** 负责面、线、虚线、编号、任务构件、状态标记与注释；不调用 API，不推断业务状态。
4. **Interaction layer：** 负责聚焦 Stage、选中 Task、返回全景、详情呈现；不更改任务数据。
5. **Accessibility layer：** 可访问名称、键盘焦点、状态说明和非颜色提示。

不要把真实数据字段与 SVG 坐标混成一层。布局重排不能改变业务值，业务数据更新也不应要求复制一套几何规则。

### 6.3 响应式要求

- 不依赖固定绝对像素宽高来维持唯一构图；使用 SVG `viewBox` / 可计算坐标 / 容器观测等方式适配。
- 宽视口：展示完整工程对象和足够留白。
- 中等视口：可减少非关键标注，但主体结构仍保留。
- 窄视口：允许以全景缩略 + 当前阶段局部视图的方式呈现；不强迫整个大型轴测图被压缩到不可读。
- 不允许标题、注释、Task label 超出画布边界；长文本要有稳定省略或转入详情模式的规则。

### 6.4 绘图层级建议

建议至少区分以下绘图层，具体文件/组件名由仓库现状决定：

1. 背景纸面与低对比网格；
2. Stage 的远侧面/底面/支撑轮廓；
3. Stage 内 Task 构件；
4. Stage 的近侧面/轮廓高亮；
5. 爆炸投影辅助线；
6. 编号、短注释与引线；
7. 标题、图例、摘要、局部详图；
8. 键盘焦点、hover、selected 等交互态。

遮挡顺序应该符合投影，不能靠随机 DOM 顺序拼接；同一个 Stage 的不同面需要共享同一几何模型，避免描边错位。

### 6.5 性能与工程约束

- Stage/Task 数量变化后，布局应稳定、可预测，不因 React 重渲染导致构件随机换位。
- 优先保证数据正确、可读、响应式与可访问性，再追求复杂视觉效果。
- 不加新依赖，除非 Agent 能解释现有 SVG/React 为什么不足，并在方案中比较维护成本。
- 复用已有页面壳层、页面状态、API hooks、类型和任务详情组件。
- 未经批准，不创建数据库迁移、不修改 OpenAPI、不改变服务端进度算法。

---

## 7. 交互边界

### 本轮目标 MVP（经用户另行批准后才进入生产）

- 只读全景；
- Stage 聚焦与取消聚焦；
- Task 选择并打开现有详情；
- 未归属任务可见；
- 当前进度、状态、Worklog、NOW/NEXT/Agent 只展示真实存在的数据；
- 简单/标准/高密度/空状态均有设计；
- 图纸观感与 Blueprint Editorial 一致。

### 本轮明确不做

- 拖拽 Stage/Task、重排 Plan；
- 新建/编辑/删除 Task 或 Stage；
- Task-to-Task dependency / DAG / 自动排期；
- 3D 旋转相机、物理动画、WebGL；
- 自动生成任务或推测进度；
- Worklog 回放、时间旅行、导出图片/PDF；
- 用新的“解剖图”替换原项目页或更改首页产品定位；
- 任何超出本次设计的 UI 全面重构。

---

## 8. 现有原型的失败教训（必须理解）

请阅读 `references/02-legacy-html-prototype-do-not-copy-layout.html`，但它只是历史实验。

已识别的问题：

1. Stage 主要仍是同型、同宽、横向排列的板片；只是附加了轻微 2.5D 偏移。
2. Task 仍像排列在普通布局里的小卡片，因此整体像“常规 UI + 等距效果”。
3. 工程制图语言停留在网格、字体、标注等表面装饰，没有建立真正的几何结构和视觉重心。
4. 标题、标注、文字、构件竞争注意力；缺乏足够留白与主从关系。
5. 画布采用固定区域和硬编码样例，难以覆盖不同窗口宽度、长名称与任务密集情况。
6. 现有样例数据不能代表真实 API，也可能暗示并不存在的数据关系。

### 不要这样修

- 不要只换配色、增加边框粗细、加重阴影、增加玻璃感；
- 不要将所有构件旋转同样的角度后称为轴测图；
- 不要把现有水平板片换成更圆的“3D 卡片”；
- 不要用更多标题、注释、图标和网格弥补主体几何的不足。

### 应该怎么重新开始

- 先画出“项目整体的几何组织”，不写任何 UI 控件；
- 再把真实 Stage 作为主体构件放入空间；
- 再把 Task 以较小、清晰、可聚焦的单元纳入 Stage；
- 再加入未归属任务、真实状态与进度；
- 最后才添加标题、图号、图例和操作控件。

---

## 9. 分阶段执行协议与交付物

### Phase 0 — Repo / Domain / Visual Audit（只读审查）

**必须先做。** 不修改生产文件。

交付：

- 当前 Stage / Task / Worklog / Agent 数据在真实代码和 API 中的获取路径；
- 当前项目页可复用的 hooks、类型、详情组件与 UI token 清单；
- 与 `docs/DOMAIN_MODEL.md` 比较后，确认任何字段/语义差异；
- 当前 HTML 原型的失败点列表；
- 参考资料阅读摘要，逐项说明借鉴什么、不借鉴什么。

### Phase 1 — 三个独立概念方案（只做设计草图）

每个草图至少包含：

- 一个正常项目（若干 Stage、不同状态 Task、至少一个未归属 Task）；
- 一个 Stage 聚焦状态；
- 一种高密度 Task 的表现方式；
- 图例与信息层级；
- 如何避免依赖线和错误进度语义。

交付建议：三张 SVG 或独立 HTML 原型、每个方案一页说明、对比表、推荐理由。不要连接真实 API，不要修改生产组件。

### Phase 2 — 用户确认方案

提交给用户审阅，指出优点、缺点和风险。未经用户明确认可，不进入生产实现。

### Phase 3 — 实施计划（确认后）

制定精确的组件拆分、数据流、状态交互、测试与文件改动清单。先复用现有领域层和 API，不新增业务后端。

### Phase 4 — MVP 实现（确认后）

按最小范围实现全景、Stage 聚焦、Task 详情、未归属任务和诚实状态。工作日志标注、NOW/NEXT/Agent 的高级图纸注释可在主体可读性验收通过后加入。

### Phase 5 — 验证与回归

至少运行现有前端 lint/typecheck/unit/build，必要时跑 E2E；检查原有项目页、任务详情、导航和桌面 WebView 仍正常。新增视觉视图必须适配浏览器和桌面版。

---

## 10. 验收清单（Definition of Done）

### 视觉

- [ ] 第一眼看见的是空间工程主体，不是标题、卡片或数据表。
- [ ] Stage 不再是同一模板的水平矩形板片。
- [ ] 轴测投影角度、轮廓、遮挡和投影辅助线一致且有意义。
- [ ] 存在明显视觉重心、留白和构件尺寸层级。
- [ ] 蓝图纸感与工程蓝克制统一，没有渐变/毛玻璃/霓虹/重阴影。
- [ ] 删除大部分标签后，主图仍然能表达整体结构。

### 语义

- [ ] Task 永远只属于真实 `stage_id` 对应的 Stage；`stage = null` 的任务进入未归属区域。
- [ ] 没有任何 Task 与 Task 的依赖箭头/连线。
- [ ] Stage.progress、Task 状态统计、Project progress 三者没有混淆。
- [ ] NOW / NEXT / Agent 取自权威数据源，无数据则不伪造。
- [ ] Worklog 只在有真实 Stage 关联时挂靠该 Stage。
- [ ] 空状态不生成假数字、假阶段或假任务标题。

### 使用

- [ ] 能聚焦 Stage、回到全景、选中 Task 并进入现有详情。
- [ ] 被选中的对象不只靠颜色区分，且支持键盘访问。
- [ ] 常规与高密度任务情况下仍可辨识；窄视口不出现文字重叠或整体不可读。
- [ ] 原项目工作流、任务编辑和现有路由没有被这一视图替代。

### 工程

- [ ] 本轮概念阶段没有修改生产代码/接口/数据库。
- [ ] 通过用户审核后才实施生产变更。
- [ ] 复用现有样式 token、API、类型、组件和测试模式。
- [ ] 如果新加依赖，已说明必要性、替代方案和维护代价并获批准。

---

## 11. 视觉参考与技术参考（逐项标注用途）

以下是**研究参考**，用于理解视觉语言与几何表达，不是要求复刻作品。打开页面时要看具体图，而不是只看文章标题。尊重原作者版权；只学习空间表达、绘图原则和构图方法，不把参考作品直接嵌入最终产品。

### 11.1 爆炸轴测与空间拆分

1. **ArchDaily — Decomposition as Expression: Disassembled Axonometry as Design Tool**  
   https://www.archdaily.com/1037623/decomposition-as-expression-disassembled-axonometry-as-design-tool  
   看什么：爆炸轴测不只是视觉效果，它通过拆分层级帮助理解构成，也可以作为设计表达本身。  
   不要照抄：建筑结构、项目类型、颜色或具体图形。

2. **CUHK Morningside College — CommuniTEA (FLOAT)，Exploded Structure / Facade Modules**  
   文章：https://www.morningside.cuhk.edu.hk/news/evan-wu-wins-best-studio-design-award-for-his-project-communitea-float  
   图像参考：https://www.morningside.cuhk.edu.hk/f/news/1330/Evan%20Studio%20D%20Project4.jpg  
   看什么：以一张主爆炸图展示整体，再以小型构件图解释模块；线条和留白克制。  
   不要照抄：图里的编号、构件或建筑类型。

3. **Technical University of Munich — Water Ever III**  
   文章/项目页：https://www.arc.ed.tum.de/ap/teaching/master/water-ever-iii/  
   图像参考：https://www.arc.ed.tum.de/fileadmin/w00cgv/ap/Projects/MASTER/MA_WATER_EVER_III/Niklas_Murmann_WATEREVER_MA_G08_WEBSITE_AXON_243364.jpg  
   看什么：不同层被分离，但各层共同方向清楚；辅助线帮助理解对应位置。  
   不要照抄：把 Mini Plane 的 Stage 机械地理解成楼层。

4. **Wenzhou-Kean University — Exploded axonometric graduation project**  
   页面：https://news.wku.edu.cn/zh-hans/node/4576  
   图像参考：https://news.wku.edu.cn/sites/news.prod.dpmgr.wku.edu.cn/files/inline-images/%E5%BC%A0%E7%8F%82%E9%93%AD2.png  
   看什么：复杂构件之间的分解、编号和整体空间关系。  
   不要照抄：过密的编号方式；Mini Plane 应保持低噪声与高层级清晰度。

5. **Archtene — Axonometric Drawing: Styles & Examples**  
   https://archtene.com/axonometric-drawing-styles/  
   看什么：爆炸轴测、程序轴测与图例/标签如何一起工作；特别留意主图是否仍保持完整轮廓。  
   注意：这是二级整理文章，最终概念判断以图本身与更权威的技术资料为准。

### 11.2 剖切与轴测几何

6. **Aalto University — Drawing 3D: Axonometry**  
   https://digitaldesign.aalto.fi/digital-design-workflows/vector/2d-cad-drafting/drawing-3d-axonometry/  
   看什么：选择一种投影、保持坐标方向统一、正确处理遮挡；爆炸图可以通过分离部件展示结构。  
   对 Mini Plane 的意义：先确认投影和几何，再加纹理或标签。

7. **TeachBooks — Structural Design Essentials: Architectural drawings**  
   https://teachbooks.io/Structural_Design_Essentials/main/design_workflow/general_drawing/architectural_drawings.html  
   看什么：轴测图的作用是同时帮助理解结构的整体性和空间安排，而不是单纯装饰。

### 11.3 SVG 前端实现参考

8. **MDN — SVG `viewBox`**  
   https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/viewBox  
   看什么：SVG 逻辑坐标与实际视口映射，避免用固定像素画布导致缩放和裁切问题。

9. **MDN — SVG positions and coordinate system**  
   https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorials/SVG_from_scratch/Positions  
   看什么：坐标空间、用户单位和图形定位。

10. **W3C — SVG Coordinate Systems, Transformations and Units**  
    https://www.w3.org/TR/SVG/coords.html  
    看什么：SVG viewport、user coordinate system 与变换基础。

11. **Rough.js（可选视觉研究，不是实现必选项）**  
    https://github.com/rough-stuff/rough  
    它提供手绘风线条。Mini Plane 当前设计更偏精密、克制的工程编辑风，不建议因为“草稿纸”就默认引入；先用原生 SVG 实现，确有必要时再单独论证。

### 11.4 Mini Plane 内部事实源

12. **Mini Plane 仓库首页 / README**  
    https://github.com/x7687315-gif/mini-plane

13. **Product Principles**  
    https://github.com/x7687315-gif/mini-plane/blob/main/docs/PRODUCT_PRINCIPLES.md

14. **Domain Model**  
    https://github.com/x7687315-gif/mini-plane/blob/main/docs/DOMAIN_MODEL.md

15. **Design System**  
    https://github.com/x7687315-gif/mini-plane/blob/main/frontend/DESIGN.md

16. **Screen Blueprints**  
    https://github.com/x7687315-gif/mini-plane/blob/main/frontend/SCREEN_BLUEPRINTS.md

17. **API/OpenAPI contracts**  
    https://github.com/x7687315-gif/mini-plane/tree/main/docs/api

### 11.5 参考图版权和网络限制

- `references/00-concept-direction.png` 是本次生成的概念方向图，用于交流想法；其中数据均为虚构示意。
- 其他参考链接属于第三方作品；这里只列原始出处便于 Agent 查看和理解，不代表可将原图直接当作产品素材。
- 如果 Agent 无法联网加载图像，应在交付中明确报告无法访问的链接，并基于本地概念方向图继续，而不是悄悄用无关图片替代。

---

## 12. 给 Agent 的首次回复格式

Phase 0 与 Phase 1 完成后，请按以下结构汇报：

1. **我查到了什么：** 相关页面、数据接口、实际字段和可复用组件。
2. **我确认了哪些硬约束：** 进度来源、Task/Stage 可选关联、无 Task 依赖、NOW/NEXT/Agent 真值来源。
3. **当前原型为什么失败：** 指向几何、构图、层级、响应式和数据语义，不要只说配色问题。
4. **方案 A/B/C：** 每个方案的主体构图、Stage/Task 造型、未归属任务、聚焦行为、高密度处理、优点与风险。
5. **推荐方案：** 解释为什么更符合“空间感 + 艺术性 + 实用性”，列出放弃什么。
6. **不确定项/需用户决策：** 只问真正会改变设计的选择，避免把技术细节堆给用户。
7. **改动边界声明：** 明确本轮未修改生产代码、API、数据库或路由。

**请不要用“已完成 UI 重构”作为 Phase 0/1 的汇报。当前交付目标是找到正确的视觉语言与信息结构，不是尽快提交更多代码。**
