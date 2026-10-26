# Mini Plane 彻底重构任务计划书

> **用途：** 交给 AI Agent 作为本轮重构的执行总计划。  
> **项目：** https://github.com/x7687315-gif/mini-plane  
> **审查基线：** `main` 分支；审查到的最新公开提交为 `97a49bb11fc70769d01e0768a9c122b70ee2e9d1`（2026-10-22，README 重写与 Island V3 文档更新）。执行前必须再次确认 HEAD、工作区状态与 CI 状态。  
> **计划版本：** 1.0 · 2026-10-24  
> **执行原则：** 先审查与定规，再模型与契约，再前端数据层，再 UI；分阶段、可测试、可回退。

---

## 0. 给 Agent 的最高优先级指令

你正在参与的不是一次普通 UI 优化，而是一次**以个人工程管理为中心的产品与架构重构**。请先理解本计划，再检查仓库实际代码。不要只改 README，不要只根据既有规划文档做结论，也不要因为任务书写得详细就跳过代码核验。

### 0.1 产品的真实定位

Mini Plane 是一款**本地优先、个人优先的工程项目管理软件**。用户打开软件后，核心工作应该是：

1. 查看自己正在推进的工程；
2. 创建或打开一个工程；
3. 定义整体目标、阶段与阶段目标；
4. 添加和推进任务；
5. 记录今天真正做了什么、得出什么结论、下一步准备做什么；
6. 需要时让 AI Agent 读取工程上下文、执行受限操作、回报真实进度；
7. 在桌面悬浮窗里快速查看工程当前状态。

团队协作是辅助能力，不是决定个人用户数据模型、默认首页、日常操作路径和核心 API 的中心。个人用户不应为了创建私人工程而先理解 Workspace、成员、角色等概念。

### 0.2 核心原则

- **简单优先，不以抽象数量证明架构成熟。** 每个实体、接口、状态、抽象层都必须回答：解决什么真实问题？如果删掉会造成什么明确损失？
- **产品语义优先于历史实现。** 允许保留内部历史命名或数据库表名作为兼容手段，但不允许它们继续污染用户体验和公共契约。
- **一个事实只有一个权威来源。** 不允许 UI、前端 store、API Serializer、数据库各自维护互相漂移的同一业务状态。
- **先确定模型与契约，再改页面。** 不要先把 UI 做漂亮，再反向补后端接口。
- **先迁移，再删除。** 对旧 API、旧数据、已有 Agent 调用、桌面配置和现有测试，先列出依赖关系，确认替代路径与回退手段。
- **保留已验证资产。** 现有本地桌面运行、SQLite / PostgreSQL、权限检查、Agent Token、幂等写入、Worklog、实时同步和测试体系都应复用；只有证明其设计阻碍目标时才修改。
- **不能把“彻底重构”理解成“一次性全量重写”。** 目标是彻底整理产品边界和数据契约，以小步提交实现，不是抛弃现有有效代码。

### 0.3 Agent 执行纪律

1. 执行前确认 `git status`、当前分支、HEAD SHA、最近 CI；不得覆盖用户未提交改动。
2. 第一轮只做只读审查，交付报告后停止，不得直接开始数据库迁移或全量改写。
3. 报告经审阅并确认领域模型与迁移策略后，再按阶段实施。后续每个阶段均须先写小计划，再编码、测试、更新文档、提交。
4. 每个阶段独立提交，建议分支：`refactor/personal-first-domain`；不得直接绕过分支保护或 CI。
5. 不得在未备份的情况下操作真实本机数据库；不得将本地 `runtime/`、数据库、Token、Cookie、密钥或真实用户数据提交到仓库。
6. 任何无法证实的问题必须标成“待验证”或“设计决策”，不能写成确定 Bug。
7. 不增加新框架、状态管理库、任务队列、缓存层或其他依赖，除非能证明现有方案无法满足目标并说明代价。
8. 每次 push 后查看 GitHub Actions；任何 job 失败，先定位、修复并重跑，不得把红 CI 留给用户。
9. 每阶段结束输出：变更文件、核心决策、测试命令与实际结果、已知风险、回退方法、下一阶段前置条件。
10. 一旦发现数据迁移可能造成数据丢失、个人项目归属无法可靠推断、或现有外部 Agent 会被破坏，停止该项破坏性操作并交付具体证据与方案；不得猜测后直接执行。

---

## 1. 本轮自我审查结论与目标边界

### 1.1 哪些判断已有仓库证据

以下是已从当前仓库看到的结构事实，执行时仍要以最新代码复核：

- README 已把产品描述为个人工程管理，并将 Workspace 放在团队协作层；首页也已是 My Engineering。
- `Project` 当前由 `workspace` 外键归属；个人工程首页卡片仍用 `/w/{workspace_slug}/projects/{project_id}` 跳转。
- 核心项目详情、Plan / Stage、Issue、Worklog 等大部分接口仍以 `/workspaces/{slug}/projects/{id}/...` 为路径上下文。
- `/api/v1/projects/mine/` 是单独的个人聚合接口，与以 Workspace 为路径根的资源接口并存。
- 前端 `features/issue` 处理业务任务；`features/task` 处理后台异步任务 `TaskRun`；Agent API 中 `tasks/` 又代表业务任务。此命名增加理解成本。
- `Issue`（产品语义中的 Task）没有直接关联 `ProjectStage` 的外键；Worklog 可以关联 Stage。产品文档中的 `Stage → Task` 关系并未完整落实到模型。
- Plan、Worklog、Agent Session、Realtime 等能力是后续逐步添加的，早期项目/工作区接口文档仍有冻结语义，部分新接口说明散落在 Sprint 与 Island 文档中。
- 前端的请求地址约定与 `frontend/lib/api.ts` 默认 host 的说明有不一致，需要统一实际事实源。
- Island V3 最近已完成单窗两态壳层；这轮不要把主要时间重新花在尚未完工的 Island 美化上，应在后端与数据契约稳定后再验收桌面呈现。

### 1.2 不能简单下结论的事项

以下事项必须从代码、测试、迁移和实际数据中核实：

- 当前接口究竟有多少真正重复实现，多少只是合理的作用域路由；不能单凭 OpenAPI 路径数判断复杂度。
- 现有 Workspace 中哪些应视为个人空间、哪些应保留团队语义；不能仅凭 slug、创建者或成员数量猜测并自动转换。
- 外部 Agent 实际调用了哪些路径；不得在没有检索 Amiya-Agent 或其他消费者配置的情况下删除旧 Agent 路由。
- 删除 Workspace、移除成员、项目脱离 Workspace 时，Activity、ProjectMember、实时订阅和 Worklog 的级联语义是否会造成数据损失。
- 项目总进度在无 Plan / 有 Plan 时的回退规则是否符合用户当前实际使用；应把当前行为、理想规则和迁移影响明确列出。

### 1.3 重构成功的定义

重构成功不是代码文件变少或 API 数量单纯下降，而是：

- 新用户不理解 Workspace 也能建立并管理私人项目。
- Project 有明确的所有者；团队 Workspace 只是可选的协作范围，不再是个人工程存在的前置条件。
- Project、Stage、Task、Worklog、Agent Session 的语义、归属和状态流转一致。
- 同一资源只有一个规范 REST 资源路径与一套业务逻辑；兼容路由可以暂时存在，但必须调用同一服务，且有退出计划。
- 前端不再需要在每个个人项目查询中传递 `workspace_slug` 才能读取项目核心信息。
- 后端模型、Serializer、OpenAPI、TypeScript 类型、React Query 缓存键和 UI 数据含义保持一致。
- Agent 的权限与幂等机制继续有效；实时数据断线不会假报；桌面版仍可在 SQLite 下运行。
- 测试、CI、迁移与打包均有可验证证据，现有用户数据可安全升级或保留旧版回退路径。

---

## 2. 目标产品模型

### 2.1 默认用户流程

```text
启动 Mini Plane
    ↓
My Engineering（我的工程）
    ├── 新建工程
    ├── 打开工程
    ├── 查看 NOW / NEXT / 阶段 / 最近日志 / Agent 状态
    └── 查看今天要做什么
           ↓
        Project（工程）
           ├── Plan / Stage（目标与阶段）
           ├── Task（计划中的工作项）
           ├── Worklog（实际做过的事情与结论）
           └── Agent Session（执行中与执行结果）

需要协作时：
    Collaboration / Workspace（团队空间、成员、角色与共享）
```

### 2.2 建议采用的目标领域语义

| 概念 | 必须回答的问题 | 约束 |
|---|---|---|
| User | 谁拥有和操作工程？ | 本地单机是第一使用场景；账户与 Agent 凭据仍须安全隔离 |
| Project | 这是哪个持续推进的工程？ | 每个 Project 都有明确 `owner`；私人项目不需要 Workspace |
| Workspace | 哪些工程被放进同一协作范围？ | 只服务团队协作；可选，不应成为个人项目存在的前提 |
| Plan | 这个工程总体要做到什么？ | 一个 Project 最多一个 Plan；没有 Plan 时任务和日志仍可工作 |
| Stage | 工程路线里的阶段与阶段目标是什么？ | 属于一个 Plan；当前阶段最多一个；顺序和权重必须有明确规则 |
| Task | 有什么计划工作项需要推进？ | 产品/API 统一叫 Task；初期可继续沿用后端 `Issue` 表以控制迁移风险 |
| Worklog | 实际做了什么，结果与结论是什么？ | 不等价于 Task 完成；允许补记日期；与 Project 必须明确关联，Stage 可选关联 |
| Agent Session | Agent 正在做什么，怎样推进？ | 只记录 Agent 真实上报的状态；不能让 UI 推断 STEP/HOW |
| Activity | 系统发生了什么变更？ | 系统生成的审计事实，不让前端任意写入 |
| JobRun / TaskRun | 后台异步操作运行到了什么状态？ | 与业务 Task 明确区分，避免两个“task”概念混用 |

### 2.3 推荐的核心拥有权模型

目标方案：

```text
Project
  owner: User（必填，谁拥有这个工程）
  workspace: Workspace（可空，只有需要团队协作时才设置）

  Plan
    └── Stage
          └── Task（每个 Task 可选属于一个 Stage）

  Worklog（属于 Project，可选关联 Stage）
  AgentSession（属于 Project，可选关联 Task）
```

原则：

- **所有 Project 都有 owner。** `created_by` 仍保留为创建审计信息，不应默认为永远等于 owner。
- **Workspace 是可选协作上下文。** 私人 Project 的 `workspace` 可以为空；团队 Project 可有 Workspace。不能通过前端把 Workspace 隐藏后，继续要求创建私人项目时必须选 Workspace。
- 一个 Project 可以属于一个 Workspace；不要引入多 Workspace 共享、复杂项目转移工作流或任意多对多共享模型，除非有明确需求。
- 项目权限统一由一个后端访问/授权服务解析：owner 总能访问自己的 Project；有 Workspace 的 Project 再根据既有 Workspace / Project 角色规则授权；不可见项目仍按安全契约返回 404。
- Workspace 成员管理、Workspace 角色管理属于协作模块；个人 Project CRUD、Plan、Stage、Task、Worklog 与 Agent 的核心路径不应该依赖 Workspace slug。
- 若审查发现将 `workspace` 改为可空会产生尚未解决的 Activity / ProjectMember / 删除行为风险，先产出迁移决策记录，并按阶段解决；不得为抢进度跳过影响分析。

**为什么推荐这个方向：**它直接表达用户的目标：每个工程由个人拥有，协作只在需要时叠加。相比给每个人伪造一个隐形 Workspace，它不会把 Workspace 继续当作核心领域对象；相比完全删掉团队模块，它能复用已有协作代码。它会触及权限与迁移，所以必须先审查、先做迁移计划、后实施，而不是一次性改完。

### 2.4 Task 与 Stage 的关系

推荐首版是 **一个 Task 最多属于一个 Stage，允许不属于任何 Stage**。这样能覆盖常规工程路线，同时允许临时任务、跨阶段任务暂时不挂阶段。Stage 删除时必须明确处理其 Task：默认将任务的 `stage` 置空，不级联删除任务。

必须验证：

- Task 的 Project 与 Stage 的 Project 必须相同；跨项目 Stage 写入返回统一的字段校验错误或 404（按既有安全语义选定一种并写进契约）。
- 当前阶段最多一个；设置新当前阶段时，应在同一事务中清掉其他阶段的 `is_current`。
- 删改 Stage 不得意外删除 Task 或 Worklog。
- Stage 的 `progress` 暂时由用户/Agent 通过受限规则维护；任务完成度与 Stage Progress 不要同时互相反向写入，避免循环依赖。

### 2.5 进度与 NOW / NEXT 规则

保留“阶段与当前任务比百分比更重要”的产品原则。建议统一规则：

1. 若 Plan 中有至少一个有效 Stage，Project overall progress 使用 Stage 的加权进度；分母为权重和，权重必须为正数。
2. 若没有有效 Stage，暂时使用 Task 完成率作为兼容回退，并在 API 文档明确 `progress_source = "plan" | "tasks"`，或采用其他明确、稳定且不误导 UI 的字段设计。
3. 只有一个位置负责计算 overall progress；前端只展示，不重复计算。
4. NOW 优先取明确标记的进行中 Task；没有时再按已定义的回退排序选取。NEXT 选择待做队列中最早的项目；必须使用可测试、稳定的次级排序键。
5. `last_activity` 必须有清楚定义：是 Project 最后更新、Task 更新、Worklog 更新，还是其中最大值。不要名称叫“最近活动”却只读取某个 Issue 的 `updated_at`。

---

## 3. 目标架构与 API 约定

### 3.1 API 设计原则

- HTTP JSON 的唯一机器可读契约是实际后端代码生成的 OpenAPI；人工文档负责解释业务规则，不能与 OpenAPI 各自成为不同事实源。
- 公共产品概念使用 `Project / Stage / Task / Worklog / AgentSession`。
- 不以 Workspace slug 作为 Project 核心数据接口的必需上下文；授权通过 Project ID 对应的后端访问服务完成。
- 同一资源不得长期存在两套独立业务实现。迁移期可以保留旧路径，但必须委托给同一个 service，并标记废弃与预定移除阶段。
- 路径统一、尾斜杠统一、JSON 字段统一 snake_case、分页格式统一、错误体语义统一。
- 前端和 Agent 使用不同认证方式可以保留，但两者写入同一领域时必须复用后端业务服务和数据约束。
- 不为“REST 形式好看”过度拆分接口。每个端点应对应一个清晰的资源操作或有业务含义的动作。

### 3.2 推荐的规范路径

这是重构目标，具体迁移表必须在 Phase 0/1 中和当前 OpenAPI、全部前端调用及外部 Agent 消费者对照后冻结。

| 资源 | 目标规范路径（建议） | 说明 |
|---|---|---|
| 可访问 Project 列表 / 新建 | `/api/v1/projects/` | `GET` 默认返回当前用户拥有的工程（包括用户拥有且已共享到 Workspace 的工程）；通过显式 `scope=shared` / `scope=all` 或 Workspace 筛选查看他人拥有但自己可访问的工程。`POST` 默认创建 owner 是当前用户的私人 Project。若支持通过同一接口创建共享项目，必须明确通过 `workspace_id` 指定并授权；不允许隐式创建团队资源 |
| Project 详情 / 修改 / 删除 | `/api/v1/projects/{project_id}/` | 所有项目核心操作只根据 Project ID 与统一授权服务判断，不需要 Workspace slug |
| Plan | `/api/v1/projects/{project_id}/plan/` | 统一读写 Plan / Stage 的规则，避免项目核心路径嵌在 Workspace 下 |
| Stage 修改 / 删除 | `/api/v1/projects/{project_id}/stages/{stage_id}/` 或契约确定的单一形式 | 选一个，不长期保留多个等价形式 |
| Task 列表 / 创建 | `/api/v1/projects/{project_id}/tasks/` | 对外统一使用 Task；后端可暂时继续映射到 Issue model / table |
| Task 详情 / 修改 / 删除 | `/api/v1/projects/{project_id}/tasks/{task_id}/` | 项目归属通过数据库与服务校验；不能只信任客户端传的 Project ID |
| Task 的 Comments / Activities | `/api/v1/projects/{project_id}/tasks/{task_id}/comments/`、`.../activities/` | 保留嵌套关系，但统一为 Project ID 而不是 Workspace slug + Project ID |
| Labels / states | `/api/v1/projects/{project_id}/labels/`、`/states/` | 作为 Project 配置与 Task 支持资源 |
| Worklog | `/api/v1/projects/{project_id}/worklogs/` | 私人、共享工程使用同一套资源与验证规则 |
| Agent 受限动作 | `/api/v1/agent/projects/{project_id}/...` | 保留 Agent 独立认证 namespace，但命名与资源 ID 统一；避免路径里要求 workspace_slug 才能定位 Project |
| Workspace / 成员 / 角色 | `/api/v1/workspaces/...` | 只保留真正属于协作空间的功能 |
| Realtime Overview | 保留目前已实现的单条 overview WebSocket，除非审查证明存在真实问题 | 不要因为 REST 改路由就顺手重写 WebSocket 协议 |

### 3.3 业务 Task 与后台 JobRun 的术语

- 前端产品中业务工作项一律称为 **Task**。
- 后台异步操作对象建议称为 **JobRun**（或明确选定 `TaskRun`，但不得与业务 Task 混称）。
- 第一阶段不要为术语整洁而重命名数据库表、Django app label 或迁移历史。可以先将公共 API、TypeScript 类型、前端模块和 UI 文案统一，再单独评估后端目录重命名是否真正降低成本。
- 如果内部仍有 `apps/issues` / `Issue`，必须在模块边界解释这是历史存储实现，而不是继续让前端公共类型和 API 名称同时暴露 Issue/Task 两种语义。

### 3.4 API 迁移策略

- Phase 0 生成“当前路径 → 目标路径 → 调用方 → 迁移/删除策略”完整清单。
- Phase 2/3 先建立统一服务与新规范路由。
- 前端改用规范路由并有 E2E 验证后，再把旧路径标记 deprecated。
- Agent 旧路径要先检查 Amiya-Agent 仓库、配置文件、skill 文档与实际调用。不能假设只有本仓库使用它们。
- 兼容路由仅作为适配器调用同一个 service；不得复制一份业务逻辑。
- 在旧消费者完成迁移并通过端到端测试前不得删除其路径。
- 本产品是本地优先软件，但其 Agent API 可能已被独立仓库消费；不要以“还没正式对外发布”为由忽略兼容性。

---

## 4. 分阶段执行路线

## Phase 0 — 只读审查与架构事实核对（第一轮必须只执行本阶段）

**目标：** 在改代码前建立真实基线，确认问题和依赖，不凭印象重构。

### 任务

- [x] 检查 `git status`、当前分支、HEAD SHA、最近 commits、GitHub Actions；记录是否存在未提交变更。
- [x] 运行/记录当前后端测试、前端测试、typecheck、lint、build、桌面测试与 OpenAPI 生成命令；如果某个环境不可运行，明确记录阻塞与原因，不伪造通过结果。
- [x] 还原当前完整领域关系：User、Workspace、WorkspaceMember、Project、ProjectMember、Plan、Stage、Issue、Comment、Label、State、Worklog、ActivityLog、AgentToken、AgentSession、JobRun/TaskRun。
- [x] 逐项审查模型字段、外键、`on_delete`、唯一约束、索引、迁移依赖和数据库差异（SQLite 与 PostgreSQL）。
- [x] 从所有前端 `features/*/api.ts`、React Query hooks、desktopBridge、WebSocket hooks 和后端 `urls.py` 抽取当前接口表。
- [x] 比对后端路由、Serializer、OpenAPI 快照、`docs/api/*.md`、README、产品计划和前端 TypeScript 类型。
- [x] 检查权限入口：`accessible_project_ids`、`resolve_project`、`resolve_workspace`、Workspace 与 Project 角色判定，以及 Agent Token scope 验证。
- [x] 检查所有写路径是否通过统一 service；是否有业务规则只在 Serializer、只在 View 或只在前端实现。
- [x] 查明 `ActivityLog.workspace`、Project/Workspace 删除、ProjectMember、Worklog、Realtime membership updates 的依赖和级联风险。
- [x] 搜索外部消费者（至少检查 Amiya-Agent 中 Mini Plane URL、端点名、字段名与重试/幂等实现；若 Agent 无法直接访问该仓库，列出需要本地搜索的命令与文件范围）。
- [x] 检查当前 Island V3：只核实数据契约与主窗口的集成情况，不进行视觉重构。
- [x] 汇总明确重复、历史兼容、低价值抽象、真实风险、待验证项；禁止把所有“看起来不同”的代码都算作冗余。

### 交付物

1. `docs/refactor/PHASE0_CURRENT_ARCHITECTURE.md`：当前真实架构与数据关系。
2. `docs/refactor/PHASE0_API_INVENTORY.md`：当前所有 HTTP / Agent / WebSocket 接口、调用方、数据结构来源。
3. `docs/refactor/PHASE0_RISK_REGISTER.md`：风险按 Critical / High / Medium / Low 分类，列出代码证据、影响、概率、验证方法。
4. `docs/refactor/PHASE0_BASELINE.md`：测试与 CI 基线（只记录真实运行结果）。
5. 一页结论：哪些必须改、哪些应保留、哪些暂不值得改。

### 验收门槛

- [x] 每个结论都有文件路径、函数/类/路由证据或测试证据。
- [x] 区分“确认问题”“潜在问题”“产品决策”，不混为一谈。
- [x] 当前 API 路径、前端调用方、Agent 消费者不存在未解释的大面积遗漏。
- [x] **完成报告后停止，不修改任何业务代码或迁移。**

---

## Phase 1 — 冻结产品原则、目标模型与架构决策

**目标：** 用一套简短、明确、唯一的文档收束产品方向，避免后续每个 Agent 再创造一套理念。

### 任务

- [x] 创建 `docs/PRODUCT_PRINCIPLES.md`，明确个人优先、本地优先、工程状态优先、团队辅助、Agent 受限、简约实现六条原则。
- [x] 创建 `docs/DOMAIN_MODEL.md`，定义 Project/Plan/Stage/Task/Worklog/AgentSession/Workspace 的职责、关系、所有权、删除行为和真相源。
- [x] 创建 `docs/decisions/ADR-001-project-ownership.md`，比较：
  - 方案 A：隐藏的 Personal Workspace，Project 仍必须属于 Workspace；
  - 方案 B：Project 必须有 owner，Workspace 可选，仅作为团队协作关系。
- [x] 依据用户目标采用方案 B 作为首选目标；如代码审查证明存在无法安全化解的重大风险，必须提供完整证据与成本对比后再提替代方案，不能自行悄悄改成方案 A。
- [x] 冻结 Task 与 Stage 关系（建议 Task 可选关联一个 Stage）、Stage 删除策略、进度计算、NOW/NEXT、最近活动定义。
- [x] 冻结 Project owner、created_by 与 Workspace 的区别：owner 是当前所有者，created_by 是创建审计，不默认永远相等。
- [x] 定义个人项目、团队项目和共享/转移行为。第一版不实现复杂的多 Workspace 共享；每个 Project 最多属于一个 Workspace。
- [x] 明确哪些功能是 MVP 核心，哪些属于团队协作，哪些暂停开发。
- [x] 更新 README 与旧产品计划的指向关系：只指定一个当前产品事实源；明显过时的规格标注历史，不可让 Agent 误把历史方案继续实现。

### 必须冻结的产品原则

- 默认首页是 My Engineering。
- 新建私人 Project 不要求用户创建/选择 Workspace。
- 每个 Project 有明确 owner；Workspace 可选。
- Task 表达计划，Worklog 表达实际事实，两者不可合并。
- Stage 与 Task 的关联有明确模型与校验。
- Agent 只能在 scope 允许范围内推进工程，不得无权改所有者、成员、权限或 Plan 结构。
- 实时与悬浮窗只是同一领域数据的投影，不应各自保存一份业务状态。
- 不在本轮加入 MCP、AI 自动规划、复杂工作流 DAG、跨 Workspace 任意共享、通知中心、甘特图等新能力。

### 交付物与验收

- [x] 产品原则、领域模型、ADR、能力范围表完整。
- [x] `README.md`、`PRODUCT_REFACTOR_PLAN.md`、`HANDOVER.md`、当前 API 文档之间的状态与链接不互相矛盾。
- [x] 关键数据关系和删除行为有简洁的 Mermaid 图或表格。
- [x] 领域模型获得确认后再进入迁移；不得直接在 Phase 1 改业务代码。

---

## Phase 2 — 后端领域模型与迁移

**目标：** 让数据库真正表达个人优先的所有权和任务关系，而不是只在前端伪装个人模式。

### 2.1 Project 所有权

- [x] `Project.owner` 作为必填 FK，指向 User；`created_by` 保留审计意义。
- [x] `Project.workspace` 改为可空，仅在团队协作时有值。具体删除策略必须基于 Phase 0 对 Activity、ProjectMember 等依赖的审查决定。
- [x] 对 `Project.owner`、`Project.workspace`、`created_by` 定义清楚 `on_delete` 规则，避免删除用户或 Workspace 意外丢失工程数据。
- [x] 所有旧 Project 先以 `owner = created_by` 回填；保留原 workspace 关联，**不自动猜测哪些旧 Workspace 是私人 Workspace**。
- [x] 为私人项目与团队项目分别定义标识符唯一规则。例如私人项目在 owner 范围内唯一、团队项目在 workspace 范围内唯一。通过数据库约束保障，而不是只靠前端查重。
- [x] 明确 Workspace 删除策略。优先保护 Project 数据；如要把 Project 脱离 Workspace，必须同时处理项目成员、ActivityLog、缓存、实时订阅和权限。不得只改外键而忽略关联数据。
- [x] 对私人 Project：owner 永远可以访问；不能因没有 WorkspaceMember / ProjectMember 而误判为 404。
- [x] 对团队 Project：保留既有 Workspace / Project 角色体系与 anti-enumeration 语义；所有权限逻辑集中在单一 resolver / policy service。

### 2.2 Task 与 Stage

- [x] 给业务 Task（当前后端可能是 `Issue`）增加可选 `stage` 关系；数据库关系为 Task → Stage，多 Task 可属于同一 Stage。
- [x] 校验 Stage 与 Task 必须属于同一个 Project。
- [x] 删除 Stage 时 Task 的 stage 置空；不得级联删除 Task。
- [x] Worklog 的 Stage 关联继续可选，并进行同 Project 校验。
- [x] `is_current` 的唯一规则在 service 事务内实现，并由数据库可表达的约束尽量兜底；检查 SQLite / PostgreSQL 行为一致性。
- [x] 定义空 Plan、空 Stage、零任务、无当前阶段、删除当前阶段、Stage 顺序冲突的行为与测试。

### 2.3 领域服务收敛

- [x] 统一 Project 查询与授权服务：根据 Project ID 查到 Project，再根据 owner 或 Workspace/Project 权限判定访问；View 不再各写一份权限分支。
- [x] 统一 Project 创建、转为团队协作、脱离团队协作的 service。所有相关外键/成员/活动/缓存/事件变更同事务或使用 `transaction.on_commit`。
- [x] 统一 Task 创建、更新状态、完成、批量操作的业务服务；Agent API 与用户 API 复用服务，避免两份业务实现。
- [x] 统一 Worklog 写入服务，确保 manual / agent / imported source 合法且可审计。
- [x] 审查 `get_or_create_plan()` 读取时写入的行为。优先改为显式创建 Plan 或在创建 Project 时建立空 Plan；若保留惰性创建，必须证明不会造成副作用、竞争问题和测试困难。
- [x] 为 `progress`、NOW、NEXT、`last_activity` 建立单一计算函数或查询层，不能在首页、Project Detail 与 Island 各自实现不同语义。
- [x] 不为了“分层”额外添加无业务价值的 service / manager / repository 抽象；只抽取确实被多个入口复用或需要独立测试的规则。

### 迁移要求

- [x] 先写 migration plan 和数据影响模拟；对旧库复制件运行迁移，包含 SQLite 与 PostgreSQL 两种测试。
- [x] `Project.owner` 回填应覆盖所有存量项目；无法推断的记录必须报告出来，不得丢弃或默认错误归属。
- [x] 增加迁移前后对象数量与关键关系校验：Project、Issue/Task、Stage、Worklog、Comment、ActivityLog、AgentSession、WorkspaceMember、ProjectMember。
- [x] 迁移必须可从备份恢复；如果涉及不可逆转换，提供导出/快照与明确的回滚说明。
- [x] 不在真实 `runtime/` 数据库上直接测试迁移；先用拷贝和 CI 数据库完成验证。

### 交付物与验收

- [x] 新迁移文件及迁移说明。
- [x] 领域服务/权限测试。
- [x] SQLite 与 PostgreSQL 迁移、CRUD 和权限测试通过。
- [x] 个人 Project 无 Workspace 时可访问，团队 Project 权限仍正确。
- [x] 删改 Stage 不会丢失 Task / Worklog。
- [x] 没有 N+1 回归；首页聚合查询仍符合性能目标，但不要以牺牲可维护性为由把所有计算塞进一个难以维护的 SQL。

---

## Phase 3 — API 契约统一与后端路由重构

**目标：** 公共 API 反映业务领域，不再把 Workspace 当作读取个人工程的必经路径。

### 任务

- [x] 根据 Phase 0 API 清单建立目标路由映射表，列清当前端点、目标端点、HTTP 方法、认证、scope、request/response、调用方、兼容策略。
- [x] 建立规范 Project 资源接口：列表/创建、详情、更新/删除、Plan/Stage、Tasks、Comments、Activity、Labels/States、Worklogs 均使用 Project ID 作为核心作用域。
- [x] Project 列表支持明确筛选：owned / accessible / workspace；默认行为应符合 My Engineering 需求，不要依赖前端先拼接所有 Workspace 请求。
- [x] 私人 Project 的创建请求不得要求 `workspace_slug`；如果创建共享 Project，必须明确指定 Workspace 并通过权限检查。
- [x] 对外使用 `/tasks/` 命名业务任务；旧 `/issues/` 路由作为短期兼容适配器时，必须委托给相同 service，并标记废弃计划。
- [x] 后台异步操作统一使用 `JobRun`（或经 ADR 确定的名字），相关查询不再与业务 Task 混淆。
- [x] 对 Agent API 做一致性收敛：项目 ID 统一、动作名统一、认证与 scope 仍独立、幂等写入不削弱。
- [x] 保留统一的分页格式、snake_case、尾斜杠、错误码语义。校验失败、权限不足、资源不可见、冲突与内部错误要有明确区分。
- [x] REST 返回的 Progress、NOW/NEXT、最近日志、Agent 状态字段使用统一命名与单位。不能同一个 `progress` 在不同端点有时为 0–1、有时为 0–100 而不显式说明。
- [x] Workspace/成员/角色 API 仍放在 Workspace namespace；不要为它们发明新的个人化副本。
- [x] 每次改变 Serializer 后重新生成 OpenAPI snapshot；校验 `--validate --fail-on-warn`，并确认 CI 中的 schema diff 通过。
- [x] 更新 `docs/api/*.md` 与 `docs/API.md` 索引；旧契约要标记 deprecated / historical，而不是保留“冻结”状态却已经不对应代码。

### API 验收测试

- [x] owner 可读取自己的私人 Project；其他用户不能读取并得到统一的不可见响应。
- [x] 私人 Project 上所有核心端点无需 Workspace slug 即可工作。
- [x] Workspace 成员与 Project 角色规则仍按契约运行。
- [x] 跨 Project Stage / Task / Worklog ID 注入被拒绝。
- [x] Agent Token 只能访问授权 scope 内的 Project / Task / Worklog；不能管理成员、改 owner 或自行改变权限。
- [x] Idempotency-Key 对重复写请求仍能回放第一次结果、不创建重复记录。
- [x] 兼容路由与规范路由写入同一数据、遵守相同权限；移除兼容路径前有消费者迁移证明。

---

## Phase 4 — 前端数据层与类型收敛（UI 大改之前完成）

**目标：** 前端只消费一套清楚的领域 API，不再到处传 Workspace slug 或维护重复状态。

### 任务

- [x] 统一公共类型语义：`Project`、`ProjectSummary`、`Stage`、`Task`、`Worklog`、`AgentSession`、`JobRun`。
- [x] 清理 `features/issue` 与 `features/task` 的命名重叠：业务工作项通过 Task feature 对 UI 暴露；后台异步执行记录移入 jobs / job-run 明确模块。迁移可渐进完成，不强制重命名数据库表。
- [x] 将 API 调用函数集中在对应 domain feature；React 组件不得直接拼 URL 或直接调用 `fetch` 绕过 `frontend/lib/api.ts`。
- [x] 统一 Query Key 工厂；项目列表、Project detail、Plan、Tasks、Worklogs、Activity 与 Agent 状态有一致 key 结构。
- [x] 统一 mutations 的 cache invalidation；同一项更新不能在多个组件中分别 invalidate 一大堆无关缓存，也不能因为漏 key 导致首页 / Island 不刷新。
- [x] 将 progress、NOW/NEXT 等计算从组件中移走，统一消费 API 返回的派生字段；若前端需要格式化，只允许表现层格式化，不重复业务计算。
- [x] 建立统一 API 错误适配方式：字段错误可定位到表单字段；401 / 403 / 404 / 409 / 5xx 有不同用户反馈；不要靠错误文案字符串判断错误类型。
- [x] 统一 `localhost` / `127.0.0.1` 与 HTTP / WebSocket 环境变量的来源，文档与实际 `api.ts` 一致；不可破坏 Cookie / CSRF / Session。
- [x] 如果 TypeScript 类型暂不自动生成，增加契约校验测试；每个高风险响应结构至少有后端 schema + 前端类型 + 联调断言三方约束。
- [x] 删除被证明无使用的旧 type、hook、API 函数和 store；每个删除都用 `rg` / IDE references / 测试证明无残留。

### 验收

- [x] 前端 API 调用没有个人核心页面对 Workspace slug 的硬依赖。
- [x] `pnpm typecheck`、lint、单测和 build 通过。
- [x] 查询缓存更新覆盖 Project 首页、详情、Task、Worklog 与 Island。
- [x] 不增加第二套请求封装、不新增重复状态管理库。

---

## Phase 5 — 个人模式主要流程重构

**目标：** 不进入团队模块也能完成完整的个人工程闭环。

### 5.1 首次使用与首页

- [ ] 登录后默认进入 My Engineering。
- [ ] 空状态只提供直接的新建 Project 行动；不要要求用户先创建 Workspace。
- [ ] 创建私人 Project 时只问必要信息：名称、简短说明、可选标识符。不要要求选团队、邀请成员、设角色。
- [ ] 首页以工程为单位展示：Project 名、当前 Stage、NOW、NEXT、最近 Worklog、待办数与 Agent 运行状态。
- [ ] 空 Plan / 无 Task / 无 Worklog / Agent 未连接的空态要简明、诚实，并提供下一步行动。
- [ ] 首页默认聚焦“我拥有的工程”（无论是否已经共享到团队）；可以提供“共享给我 / 全部”的显式筛选或独立入口，但不要让别人拥有的团队工程挤占个人默认首页。不要在 MVP 添加过多的自定义分组、排序配置、看板模式。

### 5.2 Project 详情

- [ ] Project 页先回答：目标是什么、现在处于什么阶段、正在做什么、下一步是什么、最近实际发生了什么。
- [ ] Plan / Stage 是工程路线，Task 是工作队列，Worklog 是执行记录；不要把 Task 列表设计成 Project 唯一的内容。
- [ ] Task 可以创建、编辑、设置状态、可选归属 Stage；默认不要求 Assignee（个人工程中通常就是 owner 自己）。
- [ ] Worklog 记录日期、标题、实际做了什么、结论、下一步、阻塞、来源；对用户提供合理默认值，不要求每个字段都必须填。
- [ ] 将评论、Activity、Label、复杂批量操作放到合适的二级位置，不要让团队审计能力挤占个人工程主流程。
- [ ] 任务筛选/排序保持可用，但优先支持常见需求。除非有实际场景，不要继续扩展大量参数组合。

### 5.3 Today / 日常推进

- [ ] 先明确 Today 是“今天的 Task 清单”“今天的 Worklog 记录”还是两者的组合。推荐 Today 页面包含计划动作与实际记录两个清晰分区，不混为一个状态。
- [ ] 允许在项目之间快速切换，查看当前状态与最近日志。
- [ ] 避免强迫用户进行繁琐的每日关闭流程；用户应可在需要时补记 Worklog。

### 验收：真实个人闭环

- [ ] 全新账户：创建私人 Project → 创建 Plan / Stage → 创建 Task 并关联 Stage → 推进 Task → 写 Worklog → 首页自动更新。
- [ ] 在没有任何 Workspace 的情况下，以上流程能完整通过。
- [ ] 重新启动桌面版，数据与 Session 按当前预期保留；SQLite 本地运行不依赖 Postgres / Redis / Celery worker。
- [ ] 使用真实数据手工走查，而不只通过 mocked E2E。

---

## Phase 6 — 团队模式降级与兼容

**目标：** 团队协作仍然工作，但不再决定个人产品的核心结构。

### 任务

- [ ] 保留 Workspace 首页、成员、角色、团队工程列表与共享 Project 的能力。
- [ ] 团队项目在 Project 列表/详情/Task/Worklog 上复用同样的 Project domain API，不另外维护一套业务逻辑。
- [ ] Workspace 路由只负责 Workspace 自身及成员管理；团队工程列表通过统一 Project 查询的 workspace filter 获取，或保留一个过渡适配路由。
- [ ] 统一权限决策：owner 权限、Workspace 角色、ProjectMember override 的优先级写入单一 policy 表和后端测试。
- [ ] 共享/转入团队操作需要明确用户主动确认；不允许仅因用户点进团队模式就移动或共享私人项目。
- [ ] 取消共享 / 删除 Workspace 时，行为必须明确并防止数据意外丢失；优先采取阻止危险删除或明确脱离协作的策略，不得默默级联删除个人工程。
- [ ] 原有成员、评论、Activity 与实时更新 E2E 必须继续测试。
- [ ] 团队特有设置（成员管理、角色、Workspace 配置）只在团队界面出现；个人项目不出现无意义的角色、指派人与团队状态字段。

### 验收

- [ ] 私人 Project 不会泄漏给其他账户。
- [ ] 共享 Project 对授权团队成员可见，角色边界不变或有明确版本化说明。
- [ ] 移除成员后，REST 与 Realtime 权限同步收敛。
- [ ] 个人与团队项目都通过同一套 Task / Stage / Worklog 业务服务。
- [ ] 删除 Workspace 不会因新所有权模型而意外丢失用户工程数据。

---

## Phase 7 — Agent API 与 Realtime 收敛

**目标：** Agent 作为工程操作参与者接入统一领域模型，不再为它维护另一套含糊的资源命名与逻辑。

### 任务

- [ ] 保留 Agent Token 的哈希存储、仅创建时展示明文、吊销机制和最小权限 scope。
- [ ] 复核每个 scope 与实际端点的映射；默认最小权限，不增加删除 Project、改 owner、管理成员或改 Workspace 角色的权限。
- [ ] 将 Agent 项目定位改为稳定的 Project ID；私人 Project 不应要求 workspace slug。
- [ ] Agent 创建/推进 Task、写 Worklog、更新 Stage 进度、报告 Session step 的写入都调用同一领域 service。
- [ ] 明确哪些 Agent 能力允许自动执行、哪些只能建议；至少保留人类控制 Project owner、Workspace 分享、角色与 Plan 结构的原则。
- [ ] 幂等覆盖所有可能被重试的写动作；检查相同 idempotency key 不同 action、同 key 不同 payload 的行为，避免错误重放。
- [ ] 保留现有 Overview WebSocket 的订阅协议、权限重校验、心跳、断线重连与 REST 事实源原则，除非 Phase 0 找到具体故障。
- [ ] 统一事件命名与 payload：Project ID 必须明确，Task 和 Worklog 事件不应依赖 workspace slug 才能路由。
- [ ] 收到实时通知后，只失效对应 query keys；重连后拉取 REST 数据修复漏事件，不虚报 LIVE。
- [ ] 修改前先搜索外部使用者。为旧 Agent API 写兼容路径与迁移说明，更新 Amiya-Agent 相关 skill / 配置 / 集成测试。

### 验收

- [ ] Agent 可以对私人 Project 执行允许的动作。
- [ ] Agent 不能越权访问或修改其他用户的 Project。
- [ ] Task 状态变更与 Worklog 写入实时更新 My Engineering 和 Island。
- [ ] 重试请求不产生重复 Task / Worklog / Session。
- [ ] 断线期间状态显示诚实；重连后通过 REST 恢复。
- [ ] 已知外部 Agent 调用无无声断裂。

---

## Phase 8 — Island 与桌面端最终对齐

**目标：** 只有在核心模型、API 与前端数据层稳定后，才把 Island 作为个人工程数据的桌面投影进行验收和必要调整。

### 任务

- [ ] 以 `docs/ISLAND_V3_SPEC.md` 为基线，但先确认它与新的 Product/Domain 文档一致。
- [ ] Island 不自行计算 Project 进度、NOW/NEXT、Stage 或 Agent 状态；只消费同一套 Project Summary / overview 数据。
- [ ] 展示所有必要信息时遵守优先级：NOW 与当前 Stage 优先；Task、Worklog 与 Agent 细节次之；百分比仅作辅助。
- [ ] 单窗两态、固定、拖动、缩放、重启恢复、退出清理按已有 V3 规格验收；不要重写已经通过单测的窗口壳层。
- [ ] 重点调整前端布局与信息层级，不再增添独立状态源或新的窗口架构。
- [ ] 真机验证 WebView2 + SQLite + 前后端进程退出；重建桌面包并确认 EXE 中确实包含最新前端产物。

### 验收

- [ ] 修改 Task / Stage / Worklog / Agent 状态后 Island 反映真实数据。
- [ ] 收起与展开不造成数据重复查询风暴或重复 WebSocket 连接。
- [ ] `Alt+I`、`Esc`、图钉与关闭行为符合规格。
- [ ] 断线时不显示伪 LIVE。
- [ ] 桌面版本在本地 SQLite 环境完成真实冒烟测试。

---

## Phase 9 — 文档、删除冗余、质量门禁与发布

**目标：** 清除重构期间产生的旧路径、旧类型和互相矛盾的文档，确保重构可持续维护。

### 任务

- [ ] 建立文档索引，明确一个产品事实源、一个领域模型事实源、一个机器接口事实源（OpenAPI）与必要的人工行为契约。
- [ ] 修订/标记过时文档：`PRODUCT_REFACTOR_PLAN.md`、`HANDOVER.md`、`BACKEND_PLAN.md`、`docs/API.md`、`docs/api/*.md`、Island V2/V3 文档与 README。
- [ ] 清理已经被规范路由取代的前端 API 函数、旧 hooks、旧类型、旧查询 key、废弃路由、死代码和过时测试。
- [ ] 搜索遗留字符串：`workspace_slug`、`/issues/`、`features/issue`、`TaskRun`、`/projects/mine/`、旧 Agent endpoints 等，逐项决定保留原因或删除证据，不做盲目全局替换。
- [ ] 更新使用指南，清楚说明个人项目如何创建、如何转入协作、如何备份、如何迁移旧数据。
- [ ] 更新 OpenAPI snapshot；确保生成命令、CI diff 与实际规范一致。
- [ ] 运行全量后端、前端、桌面测试与真实 E2E；在能运行的环境下同时验证 SQLite 与 PostgreSQL。
- [ ] 执行性能回归：My Engineering 项目列表查询数、Project detail、Task list、Worklog list、Realtime events；不要为了少一条 SQL 牺牲代码清晰度。
- [ ] 构建桌面包，验证最新产物、配置迁移、Session 持久化与关窗停服。
- [ ] push 后检查 GitHub Actions 全绿；修复所有失败后再汇报完成。

### 最终验收门槛

- [ ] 全新用户不建立 Workspace 即可完成个人工程闭环。
- [ ] 核心领域模型与公开 API 不把 Workspace 当作 Project 的必需上下文。
- [ ] 规范 API 与 OpenAPI、前端类型、文档一致。
- [ ] 旧数据迁移无丢失；所有旧路由都有明确兼容/退役状态。
- [ ] Agent 权限、幂等、Realtime、桌面运行仍通过测试。
- [ ] 所有测试结果如实记录；不以“理论上会通过”代替实际执行。
- [ ] 文档里不再存在将历史规格当作当前目标的冲突描述。
- [ ] 最终报告中列出已完成项、未完成项、已知限制、风险、回退方式与后续可选项。

---

## 5. 统一验收测试矩阵

| 层级 | 必测场景 | 通过条件 |
|---|---|---|
| Model / Migration | 旧 Project 回填 owner；私人 Project 无 workspace；共享 Project 有 workspace；删除/脱离 Workspace | 数据数量和关联可核验，无意外级联丢失 |
| Permission | owner、Workspace Admin、Workspace Member、Project Member、Viewer、非成员 | 访问/写入结果符合统一 policy；不可见资源不会被枚举 |
| Task / Stage | 新建 Task、关联 Stage、跨项目 Stage、删 Stage、切换 current Stage | 同项目约束正确；删除 Stage 不删 Task；current 唯一 |
| Worklog | 手工创建、补记日期、关联 Stage、Agent 创建、删除/编辑 | 语义与 source 正确；首页与 Island 更新 |
| Progress | 空 Plan、有 Stage、权重为 0/非法值、无 Task、Task 完成 | 只有一种规定的计算来源；API 单位固定且文档一致 |
| API Contract | 规范路径、旧兼容路径、错误体、分页、OpenAPI snapshot | 契约与实现一致，兼容路径委托同一 service |
| Frontend Data | Query keys、mutation invalidation、错误展示、Host/CSRF | 无重复状态源，不出现更新后 UI stale 或请求循环 |
| Agent | token scope、revoke、幂等重复写、私人/团队 Project、跨 Project ID | 无越权、无重复数据、旧消费者迁移明确 |
| Realtime | 建立订阅、无权限订阅、成员移除、掉线、重连 | 权限即时收敛；重连 REST 补齐；离线不虚报 LIVE |
| Desktop | SQLite、窗口双态、固定、移动、缩放、重启恢复、关窗退出 | 真机行为正确，端口与后台进程释放 |
| CI / Release | 后端、前端、desktop checks、E2E、OpenAPI、packaging | 所有可运行门禁绿，失败有修复与重跑记录 |

---

## 6. 禁止事项（避免把重构再次做复杂）

- 不把本轮变成 Plane 的功能追平项目。
- 不为未来假想场景提前添加通用工作流引擎、DAG、多 Agent 编排、多 Workspace 共享或复杂权限继承。
- 不在没有证据时引入 Repository Pattern、CQRS、事件总线或新的状态管理框架。
- 不同时保留两套正式 API 与两套业务实现；兼容代码必须薄、可测、可退役。
- 不让每个 UI 组件直接调用 API 或独立计算工程状态。
- 不把 Task、Worklog、Activity、AgentSession、JobRun 合并成一个泛化“事件/任务”实体。
- 不在本轮把后端 `Issue` 改名为新 Django app 并顺带重写表名、迁移历史；先统一公共语义，内部重命名只有在成本收益明确时单独立项。
- 不自动改变旧项目归属；Project owner 回填可以用可靠字段，但“Workspace 是个人还是团队”不能凭名字猜。
- 不删除 Agent API 或现有路径，直到证明没有外部消费者或兼容方案已通过集成测试。
- 不为了追求一个 SQL / 更少文件而写出难以阅读、难以验证的大型查询或巨大组件。
- 不先重构 Island 外观；先稳定领域模型和前后端数据契约。
- 不把“旧代码看起来不够优雅”本身当作删除理由。必须给出减少复杂度的具体证据。

---

## 7. 建议执行批次与提交顺序

每个阶段拆成可以 review 的小 PR / commit，不建议一个 commit 覆盖多个领域。

1. `docs: add phase-0 architecture audit` — 只读审查报告与事实基线。
2. `docs: freeze personal-first product and domain model` — 原则、模型、ADR、风险决策。
3. `refactor(models): add project ownership and optional collaboration scope` — 数据迁移与模型约束，暂不大改前端。
4. `refactor(api): add canonical project-scoped endpoints` — 新路由、统一 service、契约测试。
5. `refactor(api): migrate frontend to canonical contracts` — 统一 API 模块、类型、query keys、兼容路径。
6. `refactor(ui): make personal project flow workspace-independent` — 首页、项目创建与详情流程。
7. `refactor(collaboration): preserve workspace workflows on shared projects` — 团队流程、成员和权限回归。
8. `refactor(agent): align agent actions with project ownership` — Agent 接口与外部消费端联调。
9. `refactor(realtime): validate project-level ownership and subscription` — 只改有证据的问题。
10. `refactor(island): align engineering view to canonical project summary` — Island 数据与视觉验收。
11. `docs/test: remove obsolete contracts and verify release` — 删除旧契约、测试矩阵、打包与发布报告。

可以根据 Phase 0 的实际依赖调整批次，但不能跳过“先契约、后前端”和“先迁移验证、后删除旧路由”两个原则。

---

## 8. 第一条可以直接发给 Agent 的执行命令

> **请先只执行 Phase 0，不要修改业务代码。** 阅读本任务计划书，确认当前仓库 HEAD、工作区状态和 CI，然后依照 Phase 0 逐项审查真实实现。交付架构图、API 清单、风险登记表和测试基线。所有结论都必须附具体文件/类/函数/路由/测试证据，明确区分已确认问题、潜在风险和产品决策。尤其核对 Project ownership、Workspace 必需关系、Stage-Task 关系、API 路径重复与前端类型、Agent 外部调用以及 Activity/Realtime/删除级联风险。完成报告后停止，不要直接开始迁移或重写。报告必须提供一个可执行的 Phase 1 决策建议，并列出实现目标模型所需的最小迁移方案。

---

## 9. 重构完成后应留下什么

本任务不是只留下新代码。完成后应形成一套新 Agent、开发者或未来的你都能快速理解的维护基线：

- 一个当前产品事实源；
- 一份简洁的领域模型图；
- 一份规范 API 契约与 OpenAPI；
- 一份清楚说明 owner / collaboration scope / permission 的决策记录；
- 一套覆盖个人闭环、团队权限、Agent 与实时状态的回归测试；
- 一份 SQLite 桌面升级与备份说明；
- 一份旧接口退出清单；
- 一份记录真实测试结果、CI 结果与未解决问题的最终报告。

**最终判断标准：** 一个新加入项目的人不看几十份历史 Sprint 文档，也能在短时间内理解“Project 是什么、谁拥有它、Task 与 Worklog 有什么区别、前端要调用哪个 API、Agent 被允许做什么”。如果重构完成后仍然需要反复追溯历史文档才能解释这些基础问题，说明复杂度还没有真正收敛。
