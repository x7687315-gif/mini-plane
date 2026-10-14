# Engineering Island V2 规格（唯一事实来源）

> 状态：**已冻结**（2026-10-12）
> 替代关系：本文档取代 `docs/PRODUCT_REFACTOR_PLAN.md` §16–§20 中关于
> 「一个项目一张图纸、左右轮播是核心」的描述 —— 那部分是**历史实现说明**，不再是目标形态。
> 来源：`mini-plane-island-v2-action-plan.md`（用户确认版）。

---

## 0. 一句话目标

Engineering Island 从「单项目轮播图纸」升级为**默认隐藏、可一键固定、跨项目实时总览**的
桌面工程状态面板：顶部一个小把手随时可唤出，展开后所有项目同时可见，Agent 的当前步骤与
执行方法由接口主动上报，界面只展示真实记录。

---

## 1. 交互规格

### 1.1 三种形态与两个正交状态

```
displayMode: auto_hide | pinned      （用户偏好，重启保留）
visibility:  hidden   | expanded     （当前是否展开）
```

| displayMode | visibility | 用户看到什么 | 收起方式 |
|---|---|---|---|
| `auto_hide` | `hidden` | **只有顶部中央触发把手** | —— |
| `auto_hide` | `expanded` | 完整多项目面板 | 点把手 / `Esc` / `Alt+I` |
| `pinned` | `expanded` | 完整面板，常驻置顶 | 再点图钉才回到 `auto_hide` |

规则：
- 启动时按保存的 `displayMode` 恢复；`pinned` 启动即展开，`auto_hide` 启动即只显示把手。
- **取消固定不自动收起**：从 `pinned` 点图钉 → 变 `auto_hide` 但面板仍展开，
  否则用户会以为按钮失灵；收起交给用户自己点（把手 / `Esc`）。
- 失焦自动收起：**首版不做**（避免读到一半被收走）。
- `Esc` 仅在 `auto_hide + expanded` 时收起；`pinned` 时 `Esc` 不收起（可给出轻微提示）。

### 1.2 触发把手（已定：顶部中央胶囊）

- 原生小窗口：屏幕顶部水平居中，**约 120 × 12 px**，纸色填充 + 钴蓝细边，胶囊形（全圆角）。
- 悬停：加宽至约 140 px 并显示「工程 Island」小字（150–250ms 过渡，遵守 `motion-reduce`）。
- 点击：切换 `visibility`。
- `Alt+I`：与把手点击**等价**（同一函数），主窗口与面板窗口都监听。
- 把手窗口本身置顶、无边框、可拖（拖到屏幕顶部任意水平位置；位置随偏好持久化）。

### 1.3 图钉固定（已定：原生配置文件持久化）

- 面板页眉右侧一个图钉按钮（未固定为空心、固定为实心钴蓝）。
- 点击图钉 → `displayMode = pinned`，面板保持可见与置顶。
- 再点 → `displayMode = auto_hide`（面板不收起，见 1.1）。
- 持久化内容写入 **`runtime/desktop-config.json`**（与 `secret_key` 同目录，本机数据）：
  ```json
  {
    "displayMode": "auto_hide | pinned",
    "triggerX": 1234,
    "panelX": 640,
    "panelY": 24
  }
  ```
  由 Python 侧在启动时读取、窗口移动/模式切换时写回；页面通过 `desktopBridge`
  读取与修改（`window.pywebview.api.*`），**不依赖页面加载完成**才能恢复位置。
- 网页版（非桌面）无把手与图钉窗口控制，图钉按钮不渲染；`displayMode` 概念在网页版不存在。

### 1.4 项目范围

- 首版复用 `GET /api/v1/projects/mine/` 返回的项目集合，**不新增关注项目模型**。
- 面板内项目卡片**纵向滚动**；窗口不无限增高，主窗口内容不跟着滚。
- 项目过多时的排序沿用现有 `last_activity`；关注 / 隐藏 / 分组列为后续。

---

## 2. 信息设计：每个项目必须回答六个问题

摘要卡片固定展示以下七项（前六个是问题，第七项是运行状态）：

| # | 字段 | 回答什么 | 数据来源（首选） | 缺失时展示 |
|---|---|---|---|---|
| 1 | **Progress** | 整体进展到哪里 | `ProjectPlan`/`ProjectStage` 加权进度；无 Plan 回退已完成任务占比 | `0%` 或「尚无任务」 |
| 2 | **Stage** | 当前阶段与目标 | `is_current=True` 的 Stage | 「未设置阶段」 |
| 3 | **NOW** | 正在解决什么问题 | 进行中的 Task；结合当前 Agent Session 标题 | 「当前没有进行中的任务」 |
| 4 | **STEP** | 执行到哪个具体步骤 | `AgentSession.current_step`（+ `step_index/step_total`） | 「Agent 尚未报告步骤」 |
| 5 | **HOW** | 用什么方法推进 | `AgentSession.method_summary` | 「尚未记录执行方法」 |
| 6 | **NEXT** | 接下来做什么 | 任务队列下一个；回退 Worklog `next_step` | 「尚未安排下一步」 |
| 7 | **DONE** | 最近完成了什么 | 最近完成的 Task + 最新 Worklog 结论 | 「暂无完成记录」 |
| 8 | **AGENT** | Agent 是否在跑、在跑什么 | `AgentSession`（状态 / 标题 / 运行时长） | IDLE |

**语义边界（红线）**：
- **Task = 计划与工作项**；**Worklog = 实际做过什么、结论如何**。二者不得合并为一个字段，
  也不得用 Worklog 结论冒充 Task 完成情况。
- STEP / HOW 只能来自 **Agent 通过接口上报的值**，界面**不得推测或生成**。
  没有就是「尚未记录」，不填假数据。

---

## 3. 视觉规格：Blueprint Editorial 的 Island 专属柔和版

### 3.1 保留（不动的部分）

- 纸色 `#F4F1EA`、墨色 `#1B1A17`、钴蓝 `#1F3FA8`、辅助纸色 `#EBE7DD`
- 衬线标题 / 正文 / 等宽小标注 / 细分隔线 / 留白节奏
- 150–250ms 克制动效 + `prefers-reduced-motion`

### 3.2 Island 专属例外（仅 Island 窗口内生效）

| 元素 | 规则 |
|---|---|
| Island 面板外框 | 胶囊 / 大圆角矩形，圆角 **22–30px** |
| 项目摘要卡片 | 圆角 **12–16px** |
| 进度条 / 状态点 / 小控件 | 完整圆角 |
| 阴影 | 允许**单层很淡**阴影用于与桌面背景分离；禁渐变 / 毛玻璃 / 霓虹 / 重阴影 |
| 装饰 | 减少锐利外框、重复双线框、密集标记；用间距与细线分层 |

### 3.3 规范边界（写进 DESIGN.md）

- 普通应用页面继续遵守现有 Blueprint Editorial 规则（**直角为主，圆角 ≤ 4px**）。
- 桌面 Island 是**唯一例外区域**：圆角外壳 + 柔和卡片 + 轻量阴影，
  但继续共享配色、字体、线条与排版原则。
- **不得**因为 Island 改了圆角，就把全应用 UI 一并圆角化。

---

## 4. 后端数据方案

### 4.1 复用优先

- 复用：`/projects/mine/`、`ProjectPlan`/`ProjectStage`、Task（库内为 Issue）、Worklog、
  Agent Token + scope 白名单 + `Idempotency-Key`、`AgentSession`、既有实时基础设施。
- **不新增**通用工作流引擎、步骤 DAG、多 Agent 编排。

### 4.2 AgentSession 扩展（新增字段）

| 字段 | 类型 | 含义 |
|---|---|---|
| `current_step` | CharField(200)，可空 | 当前执行步骤描述 |
| `step_index` | PositiveInt，可空 | 当前步骤序号 |
| `step_total` | PositiveInt，可空 | 总步骤数 |
| `method_summary` | CharField(300)，可空 | 执行方法简述 |

### 4.3 进度上报端点

`POST /api/v1/agent/sessions/<session_id>/progress/`

- 认证：现有 Agent Token；scope 取现有写权限集合中最小必要项（沿用 `agent:write` 语义）。
- 校验：会话存在、未结束、**属于该 token 有权访问的项目**（跨项目写入一律拒绝）。
- 幂等：遵守现有 `Idempotency-Key` 约定。
- 广播：**事务提交后**广播（沿用现有 `agent.session` 事件通道）。

### 4.4 摘要扩充（`/projects/mine/`）

新增：`recent_done`（最近完成任务标题 + 完成时间）、`latest_log`（最新 Worklog 标题 +
结论摘要）。必须用 correlated subquery / 已有 prefetch 批量取，**查询数不随项目数线性增长**。

---

## 5. 实时同步

> 2026-10-14 修订：原"连接时订阅全部可访问项目"升级为**客户端订阅协议 + 权限重校验**
> （C-lite，Baserow 同构的成熟架构）。调研依据：`docs/research/2026-10-14-overview-websocket-preflight.md`。

- 新增**一条**认证后的 Engineering Overview WebSocket 通道（`/ws/engineering/overview/`）。
  Island **所有项目共用这一条连接**，不按卡片建连接。
- **订阅协议**：connect 后客户端发 `{type:"subscribe", project_ids:[...]}`；服务端逐个
  校验"该用户可访问该项目"，通过则 `group_add(project.{id})`，逐项回执
  `subscribed` / `denied`；`unsubscribe` 对称。服务端在连接内存中记录订阅集。
- **权限重校验**：每个连接额外加入 `permission.{user_id}` 组。项目成员增删/角色变更
  （`add_member` / `change_role` / `remove_member`，事务提交后）向受影响用户的
  permission 组广播 `membership.changed` → 消费者重查订阅集并**退出无权项目的组**，
  同时向客户端发 `subscriptions.updated`（客户端据此失效缓存）。
- **心跳**：服务端每 30s 发 `{"type":"ping"}`；前端超过 90s 未收到任何帧即主动断开重连
  （应对"浏览器静默断线不抛 close"的已知行为，channels#1244）。
- 写操作（任务创建/状态、Stage 进度、Worklog 创建/修改、Agent 开始/结束/步骤更新）
  在事务提交后经既有 `defer_*` 广播到项目组，由 overview 通道转发给订阅者
  （转发时注入 `project_id`）。
- 前端收到事件 → 按事件类型失效 `/projects/mine/` 与相关 Worklog 查询缓存
  （避免每次事件全量失效造成 refetch 风暴）。
- **事件只是通知，不是事实数据**：断线重连后以 HTTP 摘要为准重新拉取，不依赖事件回放；
  断线期间界面显示非实时状态，**不虚报 LIVE**。
- 已知边界（登记技术债）：`channels_redis` 每通道容量默认 100，满后**静默丢弃**——
  靠"重连重取"兜底；客户端卡顿不消费导致丢事件属于可接受降级。

---

## 6. 分阶段实施（每阶段独立提交、可单独测试与回退）

| 阶段 | 内容 | 关键验收 |
|---|---|---|
| **0 规格冻结** | 本文档 + `frontend/DESIGN.md` Island 例外条款 | 只读规格不会再把 Island 实现成单项目轮播 |
| **1 多项目总览 UI** | `EngineeringIslandOverview` / `ProjectSummaryCard` 等；先用现有字段；STEP/HOW/DONE 缺数据时诚实占位 | ≥2 项目同时可见、无翻页依赖、长文本不撑破窗口、空态明确 |
| **2 桌面隐藏/固定** | 触发窗口 + 图钉 + `runtime/desktop-config.json` 持久化 + `Alt+I`/`Esc` | 默认只出现把手；固定后不自动收起；重启恢复偏好；退出无残留进程 |
| **3 摘要数据 + Agent 步骤 API** | `/projects/mine/` 扩充 + `AgentSession` 四字段 + 迁移 + progress 端点 + OpenAPI 快照 | DONE 来自真实记录；STEP/HOW 可经 API 更新；无 N+1；后端门禁全绿 |
| **4 跨项目实时闭环** | overview WS（**C-lite：订阅协议 + 权限重校验 + 心跳**）+ 事务后广播 + 缓存失效 + 重连重取 | Agent 更新步骤后卡片无刷新更新；两项目同时运行不串状态；单连接；**移出项目后订阅即时收敛** |
| **5 回归与交付** | 更新单测/E2E（去掉翻页验收）+ 桌面 smoke + 重新打包 + README/指南/路线 | 全部门禁绿；桌面包确实含 V2；无进程残留 |
| **6 打磨（新增 2026-10-14）** | 界面 / 动画 / 操作手感（守 DESIGN.md 红线：150–250ms、无渐变、reduced-motion；先做一轮小调研） | 交互反馈完整、无突兀跳变、动效可关 |

> 每阶段顺序：**先规格/验收 → 编码 → 便宜门禁（lint/typecheck）→ 单测 → 后端测试 → E2E
> → 生产构建 → 文档 → commit → push → 核对 CI**。
> 改前端源码后必须 `scripts\package.py` + `desktop\build.py`，并**核实打进包的是最新产物**。

---

## 7. 首版非目标（防止范围失控）

- 重写项目 / 任务 / Worklog / 团队权限模型
- 把 Island 变成完整任务编辑器；复杂 Kanban / 甘特图 / 自动排期 / AI 自动规划
- MCP 包装层；多 Agent 编排；步骤 DAG
- 每项目一条长期 WebSocket
- 全应用 UI 圆角化
- 多显示器自适应、复杂窗口动画

---

## 8. 验收清单（DoD）

**交互**
- [ ] 启动后默认只见顶部把手；点击展开；`Esc`/`Alt+I`/把手均可收起
- [ ] 图钉固定后切到别的程序面板仍在；取消固定回到隐藏式且**不自动收起**
- [ ] 重启后 `displayMode` 与窗口位置恢复

**信息**
- [ ] 每张卡片六问齐备：Progress / Stage / NOW / STEP / HOW / NEXT / DONE(+AGENT)
- [ ] 缺数据时展示约定文案，**不出现推测值**
- [ ] Task 与 Worklog 语义不混

**视觉**
- [ ] Island 外壳 22–30px 圆角、卡片 12–16px、控件全圆角、单层淡阴影
- [ ] 普通页面圆角仍 ≤4px（未被 Island 例外污染）

**工程**
- [ ] `/projects/mine/` 查询数不随项目数线性增长
- [ ] STEP/HOW 仅来自 Agent 上报；progress 端点拒绝跨项目与已结束会话
- [ ] 单条 overview WS；断线不虚报 LIVE
- [ ] 桌面包来自最新源码；关窗后无进程残留
- [ ] 后端 / 前端单测 / E2E / lint / 类型 / 构建全绿，CI 双绿
