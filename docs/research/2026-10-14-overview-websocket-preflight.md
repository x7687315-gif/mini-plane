# 开工前调研：Island V2 阶段 4 跨项目实时总览 WebSocket

> 阶段 4 要做的：**一条**认证后的 overview WebSocket，覆盖用户可访问的全部项目；
> 任务 / 阶段 / 日志 / Agent 步骤变更 → Island 无刷新更新；断线不虚报 LIVE。
> 本文是开工前侦察（github-preflight），**先拍板再编码**。

---

## 0. 检索台账（真实执行的检索）

**检索方式说明**：本环境未装 gh CLI 的语义检索端点，语义召回用**自然语言整句 query**（Q1/Q3/Q5，非关键词堆砌）+ 网页相关性排序；评论区挖掘（`in:comments` 等价动作）在 Q4 的 Stack Overflow / GitHub Issue 页面**逐条读了评论区**并标注了评论者。

| # | 检索 query（原文） | 面 | 命中 |
|---|---|---|---|
| Q1 | `django channels websocket join multiple groups group_add many groups performance limit` | 语义（自然语言） | irurueta.com（组名校验/容量实测）、johal.in（生产架构）、php.cn FAQ |
| Q2 | `react-query invalidate queries on websocket event best practice` | 语义（自然语言） | itfamily.dev、real-time-websocket.com、reactz2h.com、arkashj.com、jamesst.one(PDF) |
| Q3 | `django channels single websocket connection subscribe user groups overview consumer best practice forum` | 语义（自然语言）+ Discussion 性质问答 | **forum.djangoproject.com/t/31705**（与本项目同构的提问）、channels 官方文档 |
| Q4 | `django channels broadcast not received transaction.on_commit group_send pitfall` | 语义 + **评论正文**（`in:comments` 等价：读了 issue/SO 全部评论） | **github.com/django/channels/issues/1244**（评论者 maurice-g：静默断线；tarikki：容量静默丢弃）、stackoverflow.com/questions/54572288（评论：漏 await group_add） |
| Q5 | `"django channels" broadcast to user groups vs subscribing consumer to project groups permission changes reconnect` | 语义（自然语言，短语精确匹配） | **gitlab.com/baserow/baserow websockets.md**（生产级同类实现）、djangozen、schoolofweb |
| Q6 | `github django channels-examples multichat repository andrewgodwin baserow stars websocket discussion group naming` | **仓库面** | **github.com/andrewgodwin/channels-examples**（官方示例，multichat = "all rooms multiplexed over a single WebSocket"）、gitlab.com/baserow（仓库）、github.com/jhnoor/docker-nginx-django-channels（32 stars，2026-10-14 观察到） |
| Q7 | Discussions 面检索 | **Discussions** | channels 仓库未开 Discussions 功能；forum.djangoproject.com 的 Async/Channels 版块即其官方讨论区（Q3 已覆盖）。**其余独立 Discussions 未找到有效来源，如实标注** |

外部权威源：Channels 官方文档（channel_layers 主题页）、Baserow 技术文档（生产级同类）。

## 1. 两个最相关的同类实现（仓库面）

### 1a. Baserow（生产级，GitLab 开源）
**来源**：https://gitlab.com/baserow/baserow/-/blob/develop/docs/technical/websockets.md
与我们的形态几乎同构，值得直接借鉴：

- **一条 `CoreConsumer` 连接服务全部前端**（不是每个页面一条连接）；
- 客户端**发消息订阅**（"pages" 概念）：服务端校验权限后 `group_add("table-{id}")`；
- 除页面组外还有**"权限导向组"**：用于在权限变化时把消费者**踢出它已无权收听的组**——
  正是我们 Option A 的已知短板的现成解法；
- 消息广播走 Redis 层，转发的也是"轻量事件 + 客户端拉取"。

### 1b. Multichat（Channels 作者 Andrew Godwin 的官方示例）
**来源**：https://github.com/andrewgodwin/channels-examples（multichat 示例）
README 原话：**"messages from all rooms a user is in multiplexed over a single
WebSocket connection"** —— 单连接、逐房间 `group_add`、加入时按 staff 权限校验、
`self.rooms` 记录成员以便断开时清理。这就是方向 A 的官方背书：
**一条连接订阅多个组不是野路子，是 Channels 官方示例的标准形态。**

## 2. 检索到的已知坑（每条都有来源）

| # | 坑 | 来源 | 对我们的影响 |
|---|---|---|---|
| P1 | **`group_send` 对满容量的通道静默丢弃**（channels_redis 每通道容量默认 100，满了不报错直接跳过） | channels#1244 评论区（tarikki 提到 PR 加日志） | Island 是长驻面板，若客户端卡顿不消费，后续事件全丢。**缓解**：事件只是通知（规格 §7.2 本来就这么定），丢了靠重连重取兜底 |
| P2 | **静默断线**：断网/锁屏时浏览器**不抛 close 事件**，客户端以为还连着；服务端 ~50s 后才关 | channels#1244（maurice-g 评论区） | 桌面 Island 可能"看起来 LIVE 实际死了几小时"。**缓解**：心跳（见 §3 可选项） |
| P3 | **`type` 名点号→下划线映射对不上时静默跳过**（`chat.message` → `chat_message`，写错不报错） | stackoverflow 54572288、trdm.cn 案例 | 转发既有事件到 overview 时沿用现有 `project.event` 处理器即可，不引入新 type 映射 |
| P4 | **`group_add` 必须 await**，漏了就静默不生效 | stackoverflow 54572288 评论区 | 逐项目 group_add 时注意（AsyncJsonWebsocketConsumer 里天然 await） |
| P5 | **广播必须事务提交后发**，否则消费者读到不存在的数据 | schoolofweb（on_commit 模式）、volcengine 案例 | 我们已有 `defer_*`（`transaction.on_commit`），**直接复用**，零改动 |
| P6 | **连接是长活的，权限会变**——"authorize on connect **and** check permission for each action" | djangozen 教程 | Option A 的核心短板，见 §3 |
| P7 | 组名只允许 ASCII 字母数字/连字符/点号，≤100 字符 | irurueta（实测 4.2.1） | 我们已踩过并解决（`project.{uuid}` 无冒号），沿用 |
| P8 | 断线期间的消息**没人收**——纯 WebSocket 不补发 | djangozen（"WebSocket for liveness, database for durability"） | 与规格 §7.2 完全一致：重连后以 REST 为事实来源重取 |

## 3. 可选方向（需要你拍板）

### 方向 A：connect 时订阅全部可访问项目组（规格 §7.2 原案）⭐ 倾向

连接建立时查 `accessible_project_ids(user)`，逐个 `group_add(project.{id})`；
写路径**零改动**（服务层继续只广播到 project 组）；断开时逐个 discard。

- 优点：实现最小；写路径不变；事件天然带既有 payload（issue diff / agent session）；
  转发时 consumer 补一个 `project_id` 进 payload 即可让前端定向失效。
- 短板：连接存续期间**权限/成员变化感知不到**（被移出项目仍会收到"有变化"信号直到重连）。
  风险很小：事件不含内容，客户端收到后拉 REST，REST 有完整权限校验——
  泄漏的只是"某项目有变更"这个信号。
- 来源：规格原案 + Baserow 的"subscribe pages"同构 + Django Forum 同问的社区共识。

### 方向 B：用户组（`overview.{user_id}`）

每个用户一个组；写路径在广播项目变更时**额外查出可访问该项目的用户**并逐个
`group_send` 到用户组。

- 优点：权限天然实时（用户组跟人走）。
- 短板：**写路径变重**（每次写都要查成员表）；组数量=用户数；与既有 project 组并存，
  同一次写要发两路广播。对"项目级变更"这个场景是杀鸡用牛刀。
- 来源：Django Forum 31705 里"1-1 chat 用 group-per-user"的适用边界讨论。

### 方向 C：客户端订阅式（Baserow 完整版）

connect 后客户端发 `{type:"subscribe", pages:[...]}`，服务端校验后按需 `group_add`，
配权限导向组在权限变化时踢人。

- 优点：权限最实时、订阅最精准（未来 Island 只订阅面板上显示的项目）。
- 短板：实现最重（注册表 + 订阅协议 + 踢人机制），首版 Island 本来就是"全部项目"，
  用不上这层灵活性。**建议作为方向 A 的后续演进**，不进首版。

### 独立小决策：要不要心跳？

P2（静默断线）对长驻桌面面板是真实风险：客户端以为 LIVE、实际已死几小时。
- **做**：服务端每 30s 发 `{"type":"ping"}`；前端超过 90s 没收到就主动断开重连。
  成本很低（consumer 里一个 asyncio task），且规格"断线不虚报 LIVE"正好需要这个检测手段。
- **不做**：靠前端已有的 backoff 重连兜底；代价是静默断线期间 Island 停止更新且无提示。

## 4. 与现有代码的对齐（不用改的部分）

- 鉴权：现有 `AuthMiddlewareStack` + `scope["user"]` 会话鉴权、角色校验、4401/4404
  关闭码、**accept 再 close** 的教训——全部直接沿用；
- 广播：`defer_*`（on_commit）已有，写路径零改动（P5）；
- 前端：`features/realtime` 已有 close-code policy、等值抖动 backoff、
  "重连 → 失效该项目全部缓存"——overview 只需把"该项目"换成"全部项目"；
- 组名规则（无冒号）、`database_sync_to_async` 包 ORM——沿用。

## 5. 若拍板方向 A 的开工 checklist

1. `OverviewConsumer`：会话鉴权 → 查可访问项目 → 逐个 `group_add` → accept →
   发 `connected`（含项目数）；disconnect 逐个 discard；
2. 处理器沿用 `project_event`（含 P3 的 type 映射），转发时把 `project_id` 补进 payload；
3. `routing.py` 注册 `/ws/engineering/overview/`；
4. 前端 `useEngineeringOverview`：一条连接挂 Island 总览；事件 → 失效 `mine/` 与
   对应 worklog 缓存（P9：按事件类型映射 key，避免每次全量失效造成 refetch 风暴）；
5. （可选）服务端心跳 30s + 前端 90s 超时重连；
6. 测试：consumer 单测（鉴权拒绝 / 只订阅可访问项目 / 转发带 project_id）+
   `smoke_realtime.py` 加真机条目（用真 daphne，不用 WebsocketCommunicator——
   项目教训：进程内测试看不见 accept/close 行为）；
7. 更新 08 契约与 OpenAPI（WS 通道清单）。

---

**请拍板**：① 方向 A / B / C？② 心跳做不做？拍板后我按 checklist 开工。
