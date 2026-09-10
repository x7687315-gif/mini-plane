# Sprint 7 开发日志：WebSocket Realtime（后端）

- 日期：2026-09-10
- 分支：`feat/backend-realtime`
- 对应计划：[BACKEND_PLAN.md](../../BACKEND_PLAN.md) §Sprint 7
- 契约：[docs/api/08-realtime.md](../api/08-realtime.md)

---

## 一、这次做了什么

1. **契约先行**：08 契约定稿——连接 URL、Session 鉴权、**4401/4404 两个自定义关闭码**、
   握手确认帧、两个事件、心跳与错误帧。
2. **ASGI 化**：`config/asgi.py` 用 `ProtocolTypeRouter` 分流（HTTP 走 Django、WebSocket 走 Channels）；
   `daphne` 进 INSTALLED_APPS，`runserver` 从此直接跑 ASGI（HTTP 冒烟实测通过）。
3. **消费者**：`ProjectConsumer`——握手即鉴权、进组、心跳、错误帧。
4. **广播层**：`apps/realtime/broadcast.py`——`defer_issue_updated` / `defer_comment_created`
   （内部 `transaction.on_commit`），payload 复用 06 契约的活动 diff。
5. **两个挂钩**：`update_issue`（有 diff 才推）、`create_comment`——全部在既有写入口，视图层零改动。
6. **配置分层**：`CHANNEL_REDIS_URL` 未配 → InMemory layer（本地/测试）；配了 → Redis（复用 Sprint 6 的 compose）。
7. **测试 259 → 277**（新增 18）：握手鉴权三种身份、关闭码、握手确认帧、心跳/错误帧、
   组广播一对多、广播包体 JSON-safe、服务层挂钩的 on_commit 与"无变化不推"。

## 二、怎么做的（关键决策与排障）

### 2.1 范围刻意收窄到两个事件（计划要求）

计划 §Sprint 7 明确写了"事件范围先收窄：issue.updated / comment.created 两个事件即可，
不做全站广播这种用不上的能力"。于是：

- `KNOWN_EVENTS = ("issue.updated", "comment.created")` 是契约 08 的权威清单；
- `issue.created` / `comment.deleted` 等**机制已就绪**（加一个函数 + 一处挂钩即可），但不推——
  在前端真的需要之前推事件，只会制造没人消费的噪声。

`issue.updated` 的 payload **刻意与活动 diff 同构**（`old_value`/`new_value`，无 UUID、描述只给字数），
前端一套字段文案映射同时喂活动流和实时推送。

### 2.2 关闭码是"协议级的状态码"，必须显式设计

HTTP 有 401/404，WebSocket 的 close code 是另一套语义（1000=正常关闭、1006=异常断开）。
如果鉴权失败时随手 `close()`（默认 1000），前端**无法区分"被拒绝"和"网络断了"**，
会傻傻地自动重连，形成无意义的重连风暴。

所以定义了两个自定义关闭码（契约 08）：

| 码 | 含义 | 前端行为 |
|----|------|---------|
| `4401` | 未登录 | 跳登录页 |
| `4404` | 已登录但项目不可见 | 提示无权限，**不要重连** |

并且 `4404` 对"项目不存在"与"不是成员"**不做区分**——跨协议延续防枚举语义
（`test_unknown_project_is_rejected_the_same_way` 与 HTTP 侧行为对齐）。

### 2.3 排障一：Channels 组名不允许冒号（这是真 bug，被测试抓住）

第一版组名写的是 `project:{uuid}`，测试直接红：

```text
TypeError: Group name must be a valid unicode string with length < 100 containing only
ASCII alphanumerics, hyphens, underscores, or periods.
```

**Channels 的组名只允许字母数字、连字符、下划线、点号**——我沿用了缓存键的 `:` 风格，
两套子系统的规则并不通用。已改为 `project.{uuid}` 并把规则写进代码注释。
这条的价值在于：**测试是唯一能抓住这类"协议约束"的地方**，`manage.py check` 不会报。

### 2.4 排障二：UUID 对象进 JSON 帧会炸（也是测试抓住）

`uuid` 路径转换器给的是 **UUID 对象**，直接放进 ack 帧后 `send_json` 抛
`TypeError: Object of type UUID is not JSON serializable`。
统一在消费者入口 `project_id = str(...)`，与 07/08 契约"推送体一律 JSON-safe"的规则一致。

### 2.5 排障三：asgiref 线程模型 —— 这次最大的坑（三连）

测试写成什么样，决定了能不能稳定驱动一个会访问数据库的消费者。踩了三步：

1. **async 测试方法里建会话** → `SynchronousOnlyOperation`（async 上下文里不能直接调 ORM）；
2. **改用线程池可见性** → consumer 的 ORM 调用经 `database_sync_to_async` 跑在线程池，
   开的是**另一个数据库连接**：
   - 在 `TestCase` 的事务里**看不到未提交数据**（session 查不到 → 一律变匿名用户，全被 4401 拒）；
   - 这些线程连接在测试结束后关不掉，导致 `destroy_test_db` 报
     `OperationalError: 其他用户正在使用数据库 "test_miniplane"`；
3. **最终方案（Channels 官方推荐形态）**：`TransactionTestCase` + async 测试方法——
   数据真实提交，线程怎么跳都能看到，测试库也能正常删除。

**另一个必须写下来的细节**：手工造会话不能只写 `_auth_user_id`。
channels 的 `get_user` 要求会话里有**三元组**：
`SESSION_KEY` / `BACKEND_SESSION_KEY` / `HASH_SESSION_KEY`（与 `django.contrib.auth.login()` 相同），
缺 `BACKEND_SESSION_KEY` 会直接 KeyError → 匿名用户（实测：一直 4401，找了很久）。

> 这一段是本 Sprint 最有价值的内容：**ASGI 下的"哪个线程、哪个连接"是真实的心智负担**，
> 写下来给后面做 Sprint 8（CI 里跑测试）的同学避坑。

### 2.6 广播必须在 on_commit 之后（Sprint 6 的教训直接沿用）

在事务里直接 `group_send`，消费者可能收到一条"数据库里还不存在"的变更。
`defer_*` 内部包了 `transaction.on_commit`，并用 `captureOnCommitCallbacks(execute=True)` 测试钉住。

`test_patch_without_change_defers_nothing` 同时确认：**与活动留痕同一套 diff 规则**——
值没变就不广播，不制造噪声。

### 2.7 配置分层与"诚实"的本地限制

| 环境 | channel layer | 说明 |
|------|---------------|------|
| `test.py` | 强制 InMemory | 测试不依赖 Redis |
| 本地默认 | InMemory | 单进程 `runserver` 下一切正常 |
| 生产/多进程 | `CHANNEL_REDIS_URL=redis://…` | **跨进程广播必须用 Redis** |

诚实标注：本机没有 Docker，Redis channel layer **没有被真实执行过**——
但它的配置是 channels-redis 的标准两行，风险点在"多进程部署时忘了配 URL"，
这一点已写进契约 08 §四的显式警告。

## 三、验收结果

验收时间：2026-09-10 23:55，**全部通过** ✅

| 验收项 | 计划标准 | 结果 |
|--------|----------|------|
| 测试 | 全绿 | ✅ **277 用例**（本 Sprint 新增 18），`Ran 277 tests OK` |
| 握手鉴权 | 非成员在握手阶段拒绝 | ✅ 三种身份逐一覆盖（Admin/Member/Viewer/匿名/非成员/项目不存在） |
| 关闭码 | 可区分"被拒"与"断线" | ✅ 4401（未登录）/ 4404（不可见，与不存在不区分） |
| 事件推送 | issue.updated / comment.created | ✅ 包体与契约一致；**无变化不推**有专项测试 |
| 组广播 | 同项目多客户端同收 | ✅ 两个连接同时收到同一帧 |
| 心跳 | ping → pong | ✅ 未知消息回 error 帧且不断开 |
| HTTP 不回归 | ASGI 化后 HTTP 正常 | ✅ `runserver`（daphne）+ `/api/v1/health/` → `{"status":"ok","database":"ok","cache":"ok"}`，服务端 0 异常 |
| schema / lint | 零警告零告警 | ✅ `spectacular --validate --fail-on-warn` 通过；`ruff check`/`format --check` 全绿 |
| 迁移 | 无漂移 | ✅ `makemigrations --check` 无漂移（本 Sprint 无表结构变更） |
| 冒烟 | 演示脚本 | ✅ 54 步 HTTP 冒烟保持全绿（WS 无浏览器端，暂不入冒烟，见下） |

### 关键数字

```text
测试：259 → 277（+18）
事件：2 个（issue.updated / comment.created），KNOWN_EVENTS 为契约权威清单
关闭码：4401 / 4404（自定义）
新模块：apps.realtime（consumers / broadcast / routing）、config/asgi.py
依赖：channels 4.3.2 / daphne 4.2.3 / channels-redis 4.3.0
```

### 关于"WS 冒烟"

HTTP 冒烟脚本用 urllib 手写，塞一套 WebSocket 帧编解码进去性价比很低；
WS 的验证由 18 个消费者/鉴权测试承担（它们直接驱动 `config.asgi.application`，
覆盖 ProtocolTypeRouter → 中间件 → 路由 → 消费者全链路）。
**浏览器侧的真连接**属于前端联调步骤（08 契约已给出 URL 与帧格式）。

## 四、下一步（Sprint 8：Docker / CI / 收尾）

1. `docker-compose.yml` 补齐 web / worker / db 三个服务（Sprint 6 只有 redis），
   healthcheck 串起来，`docker compose up` 一条命令起全套。
2. CI（GitHub Actions）：PostgreSQL + Redis 服务容器，跑四绿
   （test / ruff check / format --check / makemigrations --check / spectacular --validate）。
3. 收尾文档：README 快速开始、契约索引补 07/08、把 devlog 的"待办"清单过一遍。

## 五、给同学的联调须知

- **先看 08 契约**，URL 是 `ws://…/ws/workspaces/{slug}/projects/{pid}/`，带 session cookie 即可。
- **连上后先等 `connected` 帧**再订阅 UI 状态；`role` 字段可以直接用来隐藏无权限按钮。
- **4404 不要自动重连**（会一直失败）；4401 引导去登录。其余关闭码走正常重连逻辑。
- 收到 `issue.updated` 直接用 `old_value`/`new_value` 更新本地状态（字段文案与活动流共用一套映射）；
  收到 `comment.created` 直接把 `content` 追加到评论区，不用再请求。
- 事件是"提示"，不是事实来源：断线重连后请全量刷新。
- 本地联调时 `runserver` 已经是 ASGI（daphne），不需要额外起进程；
  如果你要在 worker/多进程环境里测试推送，先在 `.env` 配 `CHANNEL_REDIS_URL`（见 08 §四的警告）。
