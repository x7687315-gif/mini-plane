# 阶段 4：跨项目实时闭环（overview WS · C-lite）—— 2026-10-14

> 规格 §7.2 修订版（客户端订阅协议 + 权限重校验 + 心跳）。清单已于开工前评审。
> 提交：`df6fd33`。

---

## 一、做了什么

### 后端

| 文件 | 内容 |
|---|---|
| `realtime/consumers.py` | 新增 `OverviewConsumer`（`/ws/engineering/overview/`）：订阅协议（逐项回执 subscribed/denied，上限 200）、`permission.{user_id}` 组、`membership.changed` 重校验、30s 心跳、事件转发注入 `project_id`、**已收敛订阅的事件不再转发**、`reject_with` 先 accept 再 close |
| `realtime/broadcast.py` | `permission_group()` / `EVENT_MEMBERSHIP_CHANGED` / `defer_membership_changed()`（on_commit） |
| `projects/services.py` | `add_member` / `change_role` / `remove_member` 挂成员变化广播 |
| `workspaces/services.py` | `remove_member` 挂广播——**关键补漏**：成员的项目访问权也可能来自 workspace 成员身份，只挂 project 侧会漏 |
| `realtime/routing.py` | 注册 overview 通道 |
| `tests/test_overview.py`（新） | 6 条：匿名 4401（accept-then-close 断言）/ 订阅权限分流 / 事件转发注入 project_id / **成员变化订阅收敛** / 心跳 pong |

### 前端

| 文件 | 内容 |
|---|---|
| `features/realtime/overview.ts`（新） | `useEngineeringOverview`：单连接 + 订阅 + **90s 无帧判定死连接**（服务端 30s ping；应对浏览器静默断线不抛 close）+ 等值抖动退避重连 + 重连全量失效 + 按事件/项目失效 `mine/` 与 worklog 缓存 |
| `EngineeringIslandOverview.tsx` | 替换阶段 1 的临时单项目订阅；页眉 **LIVE/离线诚实指示**（规格 §7.2：不虚报 LIVE） |
| `desktopBridge.ts` | 与 M3 的窗口桥接共存于同一 `DesktopApi` |

### 契约

`docs/api/08-realtime.md`：新增 §2.0 Engineering Overview 通道（订阅协议 / 权限重校验 /
心跳 / 事件转发），事件清单扩为 4 个（`membership.changed` 入列），变更记录补条目。

## 二、实施中修正的三个认知（测试写出来的）

1. **成员的项目访问权可能来自 workspace 成员身份**（`accessible_project_ids` =
   ProjectMember **或** WorkspaceMember）——只删 ProjectMember **不会失访**，
   "订阅收敛"测试场景必须用 workspace 移除；相应地，权限广播钩子也要挂到
   **workspace 的 remove_member**（首版只挂了 project 侧，是漏的）。
2. `reject_with` 定义在 `ProjectConsumer` 上——OverviewConsumer 需要**自己的副本**
   （先 accept 再 close 的 08 契约教训）。
3. 匿名拒绝的断言形态：`connected=True`（先 accept）+ 显式收 close 帧
   （`closed["type"]=="websocket.close"`、`code==4401`）——与既有 consumer 测试一致。

## 三、验证

| 项 | 结果 |
|---|---|
| overview consumer 测试 | **6/6**（含核心验收：移出项目 → `membership.changed` 帧 removed=[项目] → 后续事件不再送达） |
| realtime 全量 | 24 OK |
| 后端全量 | **352 OK** · lint/format 全绿 |
| 前端门禁 | tsc 0 · eslint 0 · 单测 139 |
| 契约 | 08-realtime.md 更新（§2.0 + 事件清单 + 变更记录） |

## 四、已知边界（如实）

- 进程内 Communicator 测不到真 daphne 的关闭码行为（项目既定教训）——
  `smoke_realtime.py` 的 overview 真机条目留待阶段 5 补；
- `channels_redis` 每通道容量 100，满后静默丢弃 —— 靠重连重取兜底（规格已写明）。
