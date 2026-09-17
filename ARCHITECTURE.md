# Mini Plane 架构（全栈）

> 目标读者：刚接手的同学。读完后应该能回答：一个 HTTP 请求从进来到返回，穿过了哪些层？
> 一次状态变更如何同时产生活动记录、实时推送和异步任务？
> 前端从点击到数据落屏走了哪几段？
>
> §0–§6 是后端视角，§7–§8 是前端视角（Sprint 8 补齐，协作总计划 §37 约定共同维护）。

## 0. 一张图（后端视角）

> 前端不在这个框里：`[frontend]` 容器只提供 SSR 壳与静态资源，
> **所有业务数据都由浏览器直接打 `/api/v1/**`**（不走 Next 的服务端中转）。前端链路见 §7。

```text
                        ┌────────────────────── 容器/进程边界 ──────────────────────┐
 浏览器（React）         │                                                          │
   │ fetch + cookie     │  [web] gunicorn (WSGI)          [asgi] daphne (ASGI)     │
   ├──── HTTP API ──────┼──▶ CORS → Session/CSRF → DRF Permission ──┐               │
   │                    │       → Serializer 校验 → services.py     │               │
   │                    │       → ORM ─────────────────────────────▶│──▶ PostgreSQL │
   ├──── WebSocket ─────┼──────────────────────────────────────────▶│               │
   │                    │   AuthMiddlewareStack → ProjectConsumer   │               │
   │                    │   （进组 project.{id}，收广播帧）           │               │
   │                    │                                           │               │
   │                    │  [worker] celery ← broker ← 任务投递 ──────┼──▶ Redis      │
   │                    │   （通知落库 / Issue 批量操作）             │   ├ db0 缓存  │
   └────────────────────┘                                           │   ├ db1 broker│
                                                                    │   ├ db2 result│
                                                                    │   └ db3 层    │
                                                                    └──────────────┘
```

## 1. HTTP API 请求链路（自上而下）

```text
gunicorn / runserver(daphne)
  └─ Django 中间件栈（config/settings/base.py MIDDLEWARE，自上而下）
       SecurityMiddleware → CORS → Session → Common → CSRF → Auth → Message → XFrameOptions
  └─ config/urls.py（只挂路由）→ apps/<模块>/urls.py（作用域嵌套：
       /api/v1/workspaces/{slug}/projects/{pid}/issues/{iid}/，每层路径都在做授权作用域）
  └─ DRF 视图（APIView）
       1. 认证：SessionAuthentication（强制 CSRF 校验）
       2. 权限：core/permissions.py 对象级权限——从 URL 参数解析作用域对象，
          非成员一律 404（防枚举），可见但角色不够才 403
       3. 限流/分页/过滤：core/pagination.py、core/filtering.py（Sprint 5 手写 FilterBackend）
       4. Serializer 校验（字段级 validate_xx → 对象级 validate）
  └─ services.py（业务唯一入口，视图不做业务）
       transaction.atomic 包裹：
         - 发号（select_for_update，Sprint 3）
         - 写业务表
         - record_activity(...)（Sprint 4，与业务同事务，失败即回滚）
         - defer_issue_updated / defer_comment_created（Sprint 7，transaction.on_commit 后广播）
         - 触发 Celery 任务（通知等，Sprint 6）
  └─ ORM → PostgreSQL 16（psycopg 3）
  └─ 异常统一出海口：core/exceptions.py（§00 契约的错误体；404 防枚举也在这里兜底）
```

两条硬规则（BACKEND_PLAN §4.3）：**权限不写在前端也不只写在 URL**；**"存在但不可见"返回 404 而不是 403**。

## 2. WebSocket 链路（Sprint 7）

```text
ws://…/ws/workspaces/{slug}/projects/{pid}/
  └─ daphne（config/asgi.py ProtocolTypeRouter）
       websocket → AuthMiddlewareStack（session 换 user，握手期完成认证）
       → apps/realtime/routing.py → ProjectConsumer
            握手校验项目可见性：非成员/不存在 → close 4404；未登录 → 4401
            进组 project.{id}（组名只允许字母数字-_.，不能用冒号）
            心跳 ping/pong；错误帧不断开
```

广播与事实的关系：**推送只是提醒，不是事实来源**。帧体只带 `old_value/new_value`
摘要（与活动 diff 同构），一致性由前端拉详情保证；断线重连后全量刷新兜底。

## 3. 异步任务链路（Sprint 6）

```text
services.py 投递 → broker（Redis db1）→ worker（celery -A config）
   任务 A：评论通知（落 Notification 表占位；Retry 3 次指数退避 + task_id 幂等）
   任务 B：Issue 批量操作（返回 task_id，前端轮询 /projects/{pid}/tasks/{task_id}/）
本地无 Redis/Docker 时：CELERY_BROKER_URL=filesystem://（.celery/ 落盘队列）
或 CELERY_TASK_ALWAYS_EAGER=True（同步执行，测试默认此模式）
```

## 4. 缓存（Sprint 6，读多写少场景）

- 模式：Cache Aside——读时回填、写路径主动失效、TTL 300s 兜底。
- 键规范：`mini:{entity}:{id}:v{N}`；两种失效策略（版本号 vs 直接 delete）都在
  `core/cache.py`，`manage.py check_cache` 可实测对比。
- 诚实结论：Project 详情缓存收益有限（瓶颈在鉴权查询），二期缓存对象见 07 契约 §1.5。

## 5. 容器拓扑（Sprint 8，docker-compose.yml）

| 服务 | 进程 | 职责 | 探活 |
|------|------|------|------|
| `init` | 一次性 | `migrate` + `collectstatic` | 跑完退出，其余服务等它成功 |
| `web` | gunicorn | HTTP API（8000） | health 探测 DB+缓存，503 即 unhealthy |
| `asgi` | daphne | HTTP + WebSocket（8001） | 同上，走 8001 |
| `worker` | celery | 异步任务 | 无 HTTP，显式禁用 healthcheck |
| `frontend` | node（standalone） | Next.js（3000） | `fetch /login`（唯一不依赖后端的页面） |
| `db` | postgres:16 | 主库（数据卷 pg-data） | `pg_isready` |
| `redis` | redis:7 | 缓存/broker/result/channel layer | `redis-cli ping` |

配置分支：`config/settings/{base,local,test,container}.py`——容器内全 env 驱动，
静态文件由 whitenoise 从 collectstatic 产物服务；`init` 单独成服务是为了避免
三个进程并发 `migrate` 互相抢锁。

**前端容器的两个坑（都在 docker-compose.yml 里写了）**：

1. `NEXT_PUBLIC_*` 是**构建期**常量（Next 会内联进客户端 bundle），所以走 `build.args`
   而不是 `environment`——改地址必须重新 build；
2. 打开页面请用 **http://localhost:3000**，因为 Session Cookie / CSRF 按来源校验，
   `localhost:3000` 与 `127.0.0.1:3000` 在 CORS 白名单里是两个不同来源
   （默认值已把两种写法都列上，自己改 `.env` 时留意）。

## 6. 目录速查（后端）

```text
backend/
├── config/            settings(base/local/test/container) · celery · asgi · urls
├── apps/              users · workspaces · projects · issues · activity · jobs · realtime
├── core/              BaseModel · permissions · pagination · filtering · exceptions · cache
├── requirements/      base / local / test / prod（prod 仅容器：gunicorn + whitenoise）
└── scripts/           smoke_backend.py（HTTP 冒烟） · check_compose.py（编排结构校验）
docs/
├── api/               00–08 手写契约 + openapi.yaml（生成物，CI 保证一致）
└── devlog/            每个 Sprint 一篇
```

## 7. 前端请求链路（Sprint 8）

```text
浏览器
  └─ Next.js App Router（[frontend] 容器，:3000）
       ① Server Component 只渲染"壳"（字体 / 网格 / 骨架屏），不发业务请求；
          鉴权是客户端行为：(protected)/layout.tsx 里的 <AuthGuard> 依据 /auth/me/
       ② Client Component 取数据，链路只有一条：
            features/<模块>/hooks.ts   （React Query：key、缓存、乐观更新）
              → features/<模块>/api.ts （端点封装，一条 API 一个函数）
                → lib/api.ts::api()    ← 统一出口；组件里不准直接 fetch
                     · credentials: "include"（Session Cookie）
                     · 写请求带 X-CSRFToken（读 csrftoken cookie）
                     · 403 → 重取 /auth/csrf/ 后**重放一次**（CSRF 自愈）
                     · 非 2xx → 抛 ApiError(status, body)，由调用方分流
       ③ 错误分流（09 契约）：400 字段级（flattenErrors 拆字段）/ 401 跳登录
          / 403 提示且不重试 / 404 按不存在处理 / 429 提示稍后
       ④ 缓存失效成对设计：写操作只要会产生活动留痕，就必须同时失效
          issueKeys 与 activityKeys（Sprint 4 修过的 bug 就是漏了后者）
  └─ WebSocket（同一份 Session Cookie，握手期鉴权）
       ProjectSocket（指数退避重连 + 心跳 + 僵尸检测）
         → stores/ws.ts（六态状态机 + 握手角色）
         → 收到帧只做"作废并重取"，**不**用 payload 重建本地对象
           （payload 是展示用 diff，不含 state.id / 标签对象 —— 08 契约 §2.3）
  └─ 异步任务轮询：useTaskRun（1s / 上限 30 次）→ 终态后失效列表与活动
```

前端侧的三条硬规则：

- **URL 是筛选 / 抽屉 / 抽屉 tab 的唯一事实来源**——不放第二份 Zustand 副本，
  两份状态必然漂移；默认值（`page=1`、`tab=activity`）不写进地址栏；
- **不显示按钮 > 显示禁用按钮 > 点了才报 403**——权限判定是 `types/*.ts` 里的纯函数
  （`canWrite` / `canManageComment`），有单测；
- **契约里没有的能力不做**：后端没有「未指派」筛选就不放那个选项，没有关联端点就
  不给 Refs 造假数据——UI 不提供后端兑现不了的按钮。

## 8. 前端目录速查

```text
frontend/
├── app/                App Router：(auth)/login|register · (protected)/…
├── components/         ui（设计系统）· shell（AppShell/TopBar）· icons（自绘 SVG）
│                       · issue（列表/抽屉/筛选/批量条）· activity（时间线）
├── features/           auth · workspace · project · issue · comment · activity · task · realtime
│                       每模块：api.ts（端点）· hooks.ts（React Query）
│                       · 失败模式复杂的模块带一个纯策略文件（realtime/policy.ts、task/polling.ts）
├── lib/                api.ts（统一 fetch + CSRF 自愈）· url.ts（筛选解析）· time.ts
├── stores/             auth · toast · ws（Zustand；不含筛选状态）
├── types/              与 docs/api/*.md 对齐的类型 + 可测的纯逻辑（文案映射、权限、序列化）
├── tests/unit/         node --test 用例（98 个）+ alias-loader.mjs（解析 @/ 别名）
├── docs/devlog/        每个 Sprint 一篇
└── Dockerfile          多阶段：deps → builder → runner（standalone 产物）
```

测试与 CI 的对应关系：`pnpm lint / typecheck / test / build` 四个动作在
`.github/workflows/ci.yml` 的 `frontend` job 里是四个 step ——「本地四绿 == CI 四绿」，
避免出现"本地绿 CI 红"。
