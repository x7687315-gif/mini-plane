# 08 · Realtime（WebSocket 实时推送）契约

> 状态：**待前端确认 → 确认后冻结**
> 公共约定见 [00-conventions.md](00-conventions.md)；事件 payload 复用 [06-activities.md](06-activities.md) 的字段语义。
> 计划依据：[BACKEND_PLAN.md](../../BACKEND_PLAN.md) §Sprint 7。

## 一、连接

| 项 | 值 |
|----|-----|
| URL | `ws(s)://{host}/ws/workspaces/{workspace_slug}/projects/{project_id}/` |
| 鉴权 | **Session Cookie**（与 HTTP 完全同一套）：握手时带上 `sessionid`，浏览器同源下自动携带 |
| 心跳 | 客户端发 `{"type": "ping"}` → 服务端回 `{"event":"pong","payload":{}}` |
| 消息格式 | 全部 JSON 文本帧 |

**连接即鉴权**：握手阶段就按「生效角色」判定（03 契约，统一实现点在 `core/permissions`），
不通过直接关闭连接——**不会出现"连上了却什么都收不到"的隐性失败**。

### 关闭码（自定义，注意不是标准关闭码）

| 关闭码 | 含义 | 对应 HTTP 语义 |
|--------|------|----------------|
| `4401` | 未登录（没有有效会话） | 401 |
| `4404` | 已登录，但该项目不可见（非工作区成员 / 项目不存在） | 404（防枚举：不区分这两种情况） |

> 其他关闭码（1000/1006 等）是标准 WebSocket 语义（正常关闭/连接断开），前端照常处理重连即可。

### 握手确认帧

连接成功后服务端**立即**发一帧，前端收到它才算"就绪"：

```json
{ "event": "connected", "payload": { "project_id": "uuid", "role": 15 } }
```

`role` 是当前用户在该项目的生效角色（20/15/5），可用于隐藏无权限的操作入口。

## 二、服务端推送的事件（本期只有两个）

每一帧都是：`{ "event": "<事件名>", "payload": { ... } }`

### 2.1 `issue.updated`

**payload 与 06 契约的活动 diff 完全同构**，前端可以复用同一套字段文案渲染：

```json
{
  "event": "issue.updated",
  "payload": {
    "issue_id": "uuid",
    "sequence_id": 7,
    "old_value": {"state": "Todo"},
    "new_value": {"state": "Done"}
  }
}
```

- `old_value` / `new_value` 的字段白名单与值格式见 06 契约（同样不含 UUID、描述只给字数）；
- **没有变化就不推**（与活动留痕同一套 diff 规则），前端不会收到空更新的噪声。

### 2.2 `comment.created`

带正文与作者摘要，**前端不需要再回查评论接口**：

```json
{
  "event": "comment.created",
  "payload": {
    "issue_id": "uuid",
    "sequence_id": 7,
    "comment_id": "uuid",
    "author": {"id": "uuid", "username": "amiya"},
    "content": "看到推送了吗"
  }
}
```

### 2.3 明确不做（二期）

| 不做 | 原因 |
|------|------|
| 全站广播 / 用户私信频道 | 本期场景只有"项目内协作"，一个项目频道就够 |
| `issue.created` / `issue.deleted` / `comment.deleted` 事件 | 机制已就绪（`apps/realtime/broadcast.py` 的 `KNOWN_EVENTS`），等前端有真实需求再加，避免一次推一堆没人消费的事件 |
| 断线期间的事件补发 / 增量同步 | 前端重连后应**全量刷新**当前视图（事件只做"提示刷新"，不承载最终状态） |
| 在线人数 / 正在输入 | 二期 |

**推荐的前端用法**：收到事件 → 乐观地刷新对应 Issue/评论列表（或直接用 payload 更新本地状态），
不要把事件流当作唯一事实来源。

## 三、错误帧

客户端发送了协议之外的消息时，服务端回：

```json
{ "event": "error", "payload": {"detail": "不支持的消息，客户端只能发送 ping。"} }
```

连接**不会**因此断开。客户端唯一应该发送的就是 `{"type": "ping"}`。

## 四、部署与配置

| 项 | 值 |
|----|-----|
| channel layer | `CHANNEL_REDIS_URL` 未配 → `InMemoryChannelLayer`（**仅单进程可用**，本地开发/测试）；配了 → `channels_redis.core.RedisChannelLayer`（多进程/多实例必须） |
| ASGI 服务器 | 本地 `runserver` 由 daphne 接管（channels 已装）；生产用 `daphne`/`uvicorn` 跑 `config.asgi.application` |
| Redis | 复用 Sprint 6 的 `docker-compose.yml`（`docker compose up -d redis`），channel layer 建议用 `redis://127.0.0.1:6379/3` |

> **本地开发注意**：不配 `CHANNEL_REDIS_URL` 时用 InMemory layer，`runserver --noreload` 单进程下一切正常；
> 但如果起多个进程（例如 Celery worker 里也广播），InMemory 的两个进程**互相看不见**——
> 那种部署形态必须配 Redis。

## 五、变更记录

| 日期 | 变更 | 状态 |
|------|------|------|
| 2026-09-10 | 初稿（后端起草，Sprint 7）：连接 URL、Session 鉴权、4401/4404 关闭码、握手确认帧、`issue.updated` 与 `comment.created` 两个事件、心跳与错误帧、部署配置 | 待前端确认 |
