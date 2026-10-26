# Mini Plane

> **本地运行的个人工程管理系统。** 前端、后端、数据库都在你自己的机器上，数据不出本机。
> 双击一个图标就是一个原生窗口应用，不装 PostgreSQL，不联网也能用（除 AI Agent 功能外）。

<p align="center">
  <img src="frontend/docs/assets/real-my-engineering.png" width="880" alt="Mini Plane 首页 · My Engineering">
</p>

<p align="center">
  <sub>真实运行截图 · 真实数据（本机账户「北归」、真实项目「Mini Plane / MP」，由 <code>frontend/scripts/capture-real.mjs</code> 自动采集）</sub>
</p>

<p align="center">
  <b>Python 3.12</b> · <b>Django 5.2 LTS</b> · <b>Next.js 16</b> · <b>React 19</b> · <b>TypeScript</b> · <b>Tailwind v4</b> · <b>Channels/WebSocket</b> · <b>pywebview</b><br>
  <b>后端 387</b> 用例 · <b>前端 169</b> 单测 · <b>39</b> 个浏览器 E2E · <b>CI 三 job</b>
</p>

---

## 目录

- [1. 这是什么](#1-这是什么)
- [2. 界面导览（逐屏）](#2-界面导览逐屏)
- [3. 功能清单](#3-功能清单)
- [4. 给 AI Agent 的接入](#4-给-ai-agent-的接入)
- [5. 快速开始](#5-快速开始)
- [6. 架构](#6-架构)
- [7. 测试与质量](#7-测试与质量)
- [8. 设计语言](#8-设计语言)
- [9. 路线图](#9-路线图)
- [10. 文档索引](#10-文档索引)

---

## 1. 这是什么

它最初是「仿 [Plane](https://github.com/makeplane/plane) 的迷你项目管理软件」。做到一半改了主意：

> **大多数人不是来「排期」的，是来「记住我今天把工程推到哪儿了」的。**

于是产品重构成两层——**但没有推倒重来**，底层（认证 / 权限 / 任务 / 评论 / 动态 / 实时 / 桌面 / 测试）全部复用，只把「产品中心」从**任务**移到**工程**：

```text
                         Mini Plane
                              │
              ┌───────────────┴───────────────┐
              │                               │
         MY ENGINEERING                 WORKSPACE
              │                               │
     我的工程总览 / Island                    │
              │                          工作区 · 成员 · 角色
             Plan                             │
              │                            Project
            Stages                            │
              │                             Task
             Task                        Comment · Activity
              │                          Realtime
           Worklog
              │
        Agent Sync
```

三层产品信条（贯穿全部代码与文档）：

| # | 信条 | 含义 |
|---|------|------|
| 1 | **Task 是计划，Worklog 是证据** | 任务写"打算做"，工程日志写"实际做了什么、结论如何"。这是与 Todoist / Linear 一类产品最本质的区别 |
| 2 | **百分比是辅助，阶段与 NOW 才是主信息** | 所以 Island 上最显眼的是「当前阶段 / NOW / NEXT / TODAY」，百分比只占一行 |
| 3 | **Markdown 是原始事实，Mini Plane 是结构化索引** | AI 写的 devlog 不会被数据库取代；系统负责把散落的 Markdown 汇总成"今天这个工程进行到哪了" |

**形态**：本地运行的单机软件。服务只绑 `127.0.0.1`、DEBUG 关闭、SECRET_KEY 首跑随机生成并存本机、桌面版用内嵌 SQLite（无需安装数据库）。

---

## 2. 界面导览（逐屏）

界面为中文，衬线大标题按设计语言保留英文。以下截图全部来自**真实运行态**——本机账户「北归」登录、真实项目「Mini Plane（MP）」，不是测试夹具。

### 2.1 进入 —— 记住"上次是谁"

<p align="center">
  <img src="frontend/docs/assets/real-login-quick.png" width="440" alt="登录页 · 直接进入">
</p>

**昵称优先的免密入口**：输入昵称即可开始（本地单机版不该在第一次打开时逼你注册），密码与邮箱可在设置里自助绑定。

若本机已有账户，登录页会**直接显示该账户的用户名与头像，点一下就进**：

| 情况 | 行为 |
|------|------|
| 免密账户（默认） | 直接进入 |
| 设过密码 | 落到密码步，昵称已填好，只需输密码 |
| 账户已被删除 | 清掉记忆并提示换昵称 |

会话 cookie 跨启动保留，所以**重开应用免登录**。

### 2.2 我的工程（首页 `/`）

<p align="center">
  <img src="frontend/docs/assets/real-my-engineering.png" width="760" alt="My Engineering 首页">
</p>

跨项目聚合视图，不再以"工作区列表"开头：顶部是**今日工程状态条**（活跃工程 / 待办任务 / 进行中 / 今日日志数），下面是每个项目一张卡片——进度、**NOW**（当前在做的事）、**NEXT**（队列里下一件）、开关数与 **AGENT** 运行态。

`/projects/mine/` 由**一条 SQL 聚合**返回（correlated subquery + Coalesce + Exists），无 N+1。

### 2.3 顶栏的 ⇄ 按钮 —— 个人 ⇄ 团队

顶栏（logo 与搜索之间）一个按钮切换两层：

- 在**个人层**点它 → 去**你上次停留的那个工作区**（没有记录则去工作区列表）
- 在**团队层**点它 → 回「我的工程」

切换时 URL 跟着变（链接可分享），左侧竖栏按层换内容但**宽度不变**（主区域零抖动）。"上次在哪"记在 localStorage 的 `mp-last-team-path`。

### 2.4 项目页 —— Global Plan / Stage / Worklog / Task 一屏

<p align="center">
  <img src="frontend/docs/assets/real-issue-list.png" width="880" alt="项目页 · 阶段路线 + 工程日志 + 任务列表">
</p>

项目页分四段，一屏读完"这个工程进行到哪了"：

- **GLOBAL PLAN**：阶段路线，每个阶段有 `weight` / `progress` / `is_current`（同一计划仅一个当前阶段）。进度不是单一百分比，而是 `Σ(阶段权重 × 阶段进度) / Σ权重`
- **当前状态**：当前阶段 / 进度 / NOW / TODAY / NEXT
- **ENGINEERING LOG**：工程日志（date / 标题 / 摘要 / 详情 / 结论 / 下一步 / 阻塞 / 关联阶段 / 来源 `MANUAL·AGENT`）
- **TASKS**：任务列表（下方 2.5 与 2.6 展开）

新建项目自动预置五状态：`Backlog → Todo → In Progress → Done → Cancelled`。

### 2.5 任务列表 —— 筛选即 URL

支持状态 / 优先级 / 指派人 / 标签多选、标题搜索、按时间 / 编号 / 优先级排序、分页。**所有筛选都写进 URL**——复制链接给同事，对方看到完全相同的视图；非法参数被静默丢弃而不是报错。

### 2.6 任务抽屉 —— 动态审计 + 评论对话

<p align="center">
  <img src="frontend/docs/assets/real-issue-drawer-activity.png" width="300" alt="动态审计">
  &nbsp;&nbsp;
  <img src="frontend/docs/assets/real-issue-drawer-comments.png" width="300" alt="评论对话">
</p>

同一个抽屉里两个列表**顺序相反是故意的**：动态（Activity）**倒序**——审计要看"最新发生了什么"；评论（Comments）**正序**——评论是对话。

- 四个字段**就地编辑**（状态 / 优先级 / 指派人 / 标签），乐观更新、失败自动回滚
- 动态记录"谁在何时把什么改成了什么"（含可显示的旧值/新值，不是 UUID）
- 评论可编辑自己的；**作者优先于角色**——管理员也不改别人的评论
- 改动会**产生活动留痕**，因此前端写操作会同时失效活动缓存

### 2.7 批量操作

<p align="center">
  <img src="frontend/docs/assets/real-bulk-actions.png" width="720" alt="批量操作条">
</p>

勾选多行 → 底部浮出操作条：改状态 / 优先级 / 指派（逐条下发，**部分失败如实汇报**并支持「重试失败项」）、改标签（覆盖式，走异步任务）、删除（二次确认）。

### 2.8 团队层（工作区 · 成员 · 角色）

<p align="center">
  <img src="frontend/docs/assets/real-workspace-rail.png" width="760" alt="团队层 · 工作区首页">
</p>

团队能力完整保留，只是从"产品中心"降级为"协作基础设施"：工作区列表、成员管理、三级角色（管理员 / 成员 / 只读）、工作区设置、项目与任务、评论、动态、实时协作。

### 2.9 Engineering Island —— 单窗两态「工程浮页」（V3）

**Island 是当前工程状态的实时投影。** V3 把它做成**一张可收起 / 展开 / 固定在桌面上的工程图纸**——原来的「触发把手窗口」已退役，**同一窗口只有两种形态**：

<p align="center">
  <img src="frontend/docs/assets/real-island-expanded.png" width="330" alt="Island 展开态 520×420">
  &nbsp;&nbsp;&nbsp;
  <img src="frontend/docs/assets/real-island-dock.png" width="330" alt="Island 收起态把手条 360×44">
</p>

<p align="center">
  <sub>左：<code>expanded</code> 520×420（默认，可缩放）· 右：<code>collapsed</code> 360×44（把手条，即入口）</sub>
</p>

| 形态 | 尺寸（DIP） | 内容 |
|---|---|---|
| `collapsed` | **360×44** | 把手条：标题 + 项目数 + LIVE 点 + 图钉 + 「展开」 |
| `expanded` | **520×420**（默认，可自由缩放） | 多项目总览（V2 一号位不变） |

**窗口永不隐藏**——收起态就是把手条本身，不是隐藏。两态经同一路由 `/island-panel` 承载，用 `?form=collapsed\|expanded` 区分首帧。

| 能力 | 说明 |
|------|------|
| 多项目总览 | 全部项目**同时可见**（面板内滚动），不翻页、不轮播 |
| 六问信息设计 | Progress / Stage / NOW / STEP / HOW / NEXT / DONE + AGENT 八项；缺数据**诚实占位**（"Agent 尚未报告步骤"），不用任务描述冒充 |
| 单一实时连接 | `ws/engineering/overview/` **一条连接覆盖全部项目**（订阅协议 + 权限重校验 + 30s 心跳）；Agent 上报步骤（`session.progress`）→ 卡片**无刷新更新** |
| 诚实状态 | 页眉 **LIVE / 离线**——断线不虚报；90s 无帧自动重连，重连后以 REST 为事实来源重取 |
| 权限实时收敛 | 被移出项目 → 订阅**立即**退出该项目组（`membership.changed`），后续事件不再送达 |
| 视觉 | Island 专属圆角例外（外壳 26px / 卡片 14px / 单层淡阴影）；配色与动效仍守 Blueprint Editorial |

### 2.10 桌面 App 的窗口行为（V3 单窗两态）

桌面 App（pywebview + WebView2）有两个原生窗口：**主窗口**（完整应用）+ **Island 窗口**（同一窗口的两种形态）。行为全部持久化在 `runtime/desktop-config.json`，重启恢复：

| 行为 | 说明 |
|------|------|
| **首启默认展开** | 第一眼就看到 520×420 完整面板；你收起 / 固定过一次，之后按记住的模式启动 |
| **展开 / 收起** | 点把手条或 `Alt+I` → 250ms 平滑切换（15 步 × 16ms ease-out，左上锚定零漂移）；`Esc` 收起 |
| **图钉固定** | `pinned` 后面板常驻置顶，`Esc` 与关闭都不收起（防止误关）；取消固定**不自动收起** |
| **拖动 / 缩放** | 把手条整条是拖动区；展开态边缘热区缩放（`easy_drag` 在 Windows 后端未实现，故为 JS 桥接） |
| **位置记忆** | 拖动后位置、展开态尺寸都落盘；收起态**不**被 360×44 污染 |
| **退出干净** | 关掉主窗口 → Island、后端、前端**全部退出**，端口释放（运行期不 `destroy()`，避免工作线程互等挂死） |

---

## 3. 功能清单

| 模块 | 能力 | 状态 |
|------|------|------|
| **认证** | 昵称优先免密登录 · 记住上次账户一键进入 · 密码/邮箱自助绑定 · 会话持久化 | ✅ |
| **个人工程** | 跨项目总览（单条 SQL 聚合）· NOW / NEXT / 今日日志 / Agent 运行态 | ✅ |
| **项目** | 标识符 · 预置五状态 · 懒创建 | ✅ |
| **Global Plan / Stage** | 阶段路线 · 权重 · 加权进度 · 当前/下一阶段 | ✅ |
| **任务** | 状态 / 优先级 / 指派人 / 标签 · 就地编辑 · 搜索 · 6 种排序 · 分页 | ✅ |
| **工程日志** | date/标题/摘要/详情/结论/下一步/阻塞 · 关联阶段 · 来源标记（MANUAL / AGENT） | ✅ |
| **评论** | 对话流 · 编辑自己的 · 作者优先于角色 | ✅ |
| **动态审计** | 谁在何时改了什么 · 倒序时间线 | ✅ |
| **批量操作** | 改状态/优先级/指派/标签 · 异步任务 · 部分失败重试 | ✅ |
| **实时协作** | WebSocket 广播（issue.updated / comment.created / agent.session）· 断线退避重连 | ✅ |
| **Engineering Island** | 单窗两态（360×44 把手条 / 520×420 面板）· 多项目总览（六问 + AGENT）· 单一实时连接（LIVE/离线）· 诚实占位 · 权限实时收敛 | ✅ |
| **桌面窗口（V3）** | 首启展开 · 折叠动画（250ms）· 图钉常驻 · 拖动/缩放 · 位置与尺寸持久化 · 关主窗即全退 | ✅ |
| **Agent Local API** | Token（只显示一次明文）· scope 白名单 · 幂等键 · Session 与实时投影 | ✅ |
| **个人 ⇄ 团队切换** | 顶栏 ⇄ 按钮 · URL 即状态 · 记住上次团队位置 | ✅ |
| **桌面 App** | pywebview 原生窗口 · 内嵌 SQLite · 会话持久化 · 关窗停服 · PyInstaller 单文件 exe | ✅ |
| **工程化** | GitHub Actions 三 job（backend / frontend / e2e）· 契约 + OpenAPI 快照 · ruff 全目录 · Playwright E2E | ✅ |
| Markdown → Worklog 自动导入 | 解析 `docs/devlog/*.md` 写入 Worklog | ⏳ 二期 |
| Blocker 独立实体 | 目前是 Worklog 的字段，尚未升为一级概念 | ⏳ 待定 |
| MCP 包装层 | 等 REST API 稳定后再做 | ⏳ 二期 |

---

## 4. 给 AI Agent 的接入

**不要求 Agent 去开浏览器点按钮**——那条路太脆弱。Agent 直接调本地 REST API：

```text
AI Agent ──Bearer mpa_…──▶ Local REST API ──▶ Django ──▶ DB
                                        └── 事务内广播 ──▶ WebSocket ──▶ 界面 / Island
```

| 能力 | 端点（`/api/v1/agent/`） |
|------|---------------------------|
| 建 Token（用户会话，明文只返回一次） | `POST tokens/` → `{ "token": "mpa_…" }` |
| 读项目 / 推进任务 | `POST tasks/` · `tasks/<id>/start/` · `tasks/<id>/complete/` |
| 写工程日志 | `POST worklogs/` |
| 更新阶段进度 | `POST projects/<slug>/<id>/progress/` |
| 起 / 结束会话 | `POST sessions/` · `sessions/<id>/end/` |

**三条设计约束**（都是为了安全与可重放）：

1. **权限独立**：Agent Token 与用户 Session 是两套认证；scope 只有 5 项（读项目 / 读任务 / 写任务 / 写日志 / 更新阶段进度）——**没有删除、没有成员管理、没有角色变更，也不能改 Global Plan 的结构**。Token 泄漏时损害范围有限。
2. **幂等**：所有写操作接受 `Idempotency-Key`，重复请求（例如 Agent 重试）不会产生重复数据。
3. **实时投影**：会话状态在事务内广播 `agent.session`，界面与 Island 立刻变 `AGENT · RUNNING`，不需要刷新。

**这条链路有端到端测试兜底**（`tests/e2e/agent-island-loop.spec.ts`）：建 Token → 换身份起会话 → **Island 不刷新就变成 RUNNING**。因为 `/projects/mine/` 没有轮询，这条用例只有 WebSocket 真把事件推到界面才会通过。

---

## 5. 快速开始

> ⚠️ **host 一致性铁律**：页面与 API 必须同 host，端口可不同。开发模式统一 `localhost`（页面 3000 / API 8000），桌面版统一 `127.0.0.1`（已内置）。混用会导致会话 Cookie 与 CSRF 全部失效。

### 方式一：桌面 App（推荐给"只想用起来"）

```bat
python scripts\package.py                                   :: 构建单机产物
backend\.venv\Scripts\python.exe desktop\build.py           :: 打包 dist\MiniPlane\MiniPlane.exe
```

双击即用：原生窗口、内嵌 SQLite（**不用装 PostgreSQL**）、首跑自动建库、会话持久化、关窗干净停服。
`Alt+I` 唤出置顶的 Island（同一窗口在把手条 / 面板两态间切换）。**改过前端源码后必须重跑这两条命令**，否则桌面版仍是旧界面。

### 方式二：开发模式

```bat
scripts\dev.cmd          :: 起后端+前端，等就绪，自动开浏览器
scripts\dev.cmd e2e      :: 起栈 → 跑 Playwright 用例 → 报结果
scripts\dev.cmd status   :: 两个端口各是什么状态
scripts\dev.cmd down     :: 全部停掉
```

手工：后端 `python manage.py migrate && python manage.py runserver`（daphne 接管 8000，HTTP 与 WS 同端口）；前端 `pnpm install && pnpm dev`（3000）。

### 方式三：Docker Compose

```bash
docker compose up --build -d
```

健康检查 <http://127.0.0.1:8000/api/v1/health/> · Swagger <http://127.0.0.1:8000/api/docs/> · WS `ws://127.0.0.1:8001/ws/...`

---

## 6. 架构

```text
        ┌──────────── 浏览器 / 桌面 WebView2 ────────────┐
        │              Next.js 16 (App Router)            │
        │  TanStack Query ─ 服务端状态   Zustand ─ 客户端 │
        └───────┬───────────────────────────┬────────────┘
                │ ① HTTP 读写                │ ③ WebSocket 推送
                ▼                            ▼
     ┌────────────────────┐      ┌───────────────────────────┐
     │ Django REST (DRF)  │      │ Channels + daphne         │
     │ 权限唯一判定点      │      │ 只广播三类工程事件：        │
     │ core/permissions   │      │ issue.updated             │
     └─────────┬──────────┘      │ comment.created           │
               │                 │ agent.session             │
               ▼                 └───────────────────────────┘
     ┌────────────────────┐
     │ ② Celery 异步任务  │  默认 eager 同步执行，不强制起 worker
     └─────────┬──────────┘
               ▼
     ┌────────────────────┐
     │ PostgreSQL 16      │  桌面单机版用内嵌 SQLite
     └────────────────────┘
```

后端应用：`users` · `workspaces` · `projects`(+plan/stage) · `issues` · `activity` · `worklogs` · `agents`(token/idempotency/session) · `realtime` · `jobs`，外加 `core`（权限判定、序列化、缓存、测试基类）。

**四条贯穿全局的架构约束**：

1. **轻量**：聚合查询单条 SQL 杜绝 N+1 · 默认不启 Redis / Celery worker（eager 同步）· HTTP 与 WS 同端口 · 前端产物 `standalone`（Docker 镜像 22MB）
2. **实时只广播工程事件**：刻意收窄为三类，不做全站广播
3. **URL 是唯一事实来源**：筛选、抽屉、标签页、Island 形态全在 URL
4. **契约先行**：接口契约 `docs/api/00–09` 是前后端唯一事实源，改接口必须重生成 `openapi.yaml`（CI 校验一致性）

```text
mini-plane/
├── backend/
│   ├── apps/            users · workspaces · projects(+plan,stage) · issues · activity
│   │                    worklogs · agents(token,idempotency,session) · realtime · jobs
│   ├── config/          settings(local/test/desktop/container) · asgi · urls
│   ├── requirements/    base / local / test / prod / desktop
│   └── scripts/         smoke_backend.py（54 步）· smoke_realtime.py（25 步）
├── frontend/
│   ├── app/             (protected) 个人层 · (auth) · (panel) 桌面 Island
│   ├── components/      ui · shell · icons(自绘) · auth · engineering-island
│   ├── features/        auth · workspace · project · issue · comment · activity
│   │                    worklog · agent · realtime · engineering-island
│   ├── lib/ stores/ types/
│   ├── tests/           unit（143，零依赖）· e2e（34，Playwright）
│   ├── scripts/         capture-real.mjs（真实数据截图）· capture-screenshots.mjs（E2E 演示数据）
│   ├── DESIGN.md · SCREEN_BLUEPRINTS.md · FRONTEND_ROADMAP.md
│   └── docs/devlog/     前端各 Sprint 日志
├── desktop/             launcher.py · island.py · window_manager.py · config.py · build.py
├── scripts/             dev.cmd / dev.ps1 · package.py · import_progress.py
├── docs/                PRODUCT_REFACTOR_PLAN.md · HANDOVER.md · 使用指南.md
│                        ISLAND_V2_SPEC.md · ISLAND_V3_SPEC.md
│                        api/（契约 + openapi.yaml）· devlog/ · releases/
├── runtime/             本机运行态（SQLite / SECRET_KEY / desktop-config.json / WebView2 profile）——不进仓库
└── dist/                打包产物——不进仓库
```

---

## 7. 测试与质量

| 类别 | 数量 | 命令 |
|------|------|------|
| 后端 | **387** | `cd backend && .venv\Scripts\python.exe manage.py test --noinput --settings=config.settings.test` |
| 前端单测 | **169** | `cd frontend && pnpm test`（`node --test`，零依赖） |
| 浏览器 E2E | **39** | `scripts\dev.cmd e2e`（Playwright + 真实 Chrome） |

CI（`.github/workflows/ci.yml`，三个 job 全绿才可合并）：

- **backend**：`ruff check` / `ruff format --check`（覆盖 `backend/`、`desktop/`、`scripts/`）→ desktop 状态机单测 → `makemigrations --check` → `spectacular --validate --fail-on-warn` → 与 `docs/api/openapi.yaml` 快照 diff → 全量测试 → Redis 缓存后端实测
- **frontend**：`pnpm install --frozen-lockfile` → `lint` → `typecheck` → `test` → `build` → 断言 standalone 产物存在
- **e2e**：起 Postgres + 真实后端 + Next dev，安装 Chromium，跑完整 39 条 Playwright（不 mock 后端）

> 设计原则：**先跑最便宜最能拦的**（lint / 类型 / 迁移漂移 / schema diff），最后才跑慢的（测试 / build）。
> 单测刻意只覆盖"算错了但界面看着还挺正常"的地方（进度量纲、翻页边界、计时进位、脏数据、URL 形态）。

---

## 8. 设计语言

**Blueprint Editorial（蓝图编辑风）**：工程图纸的视觉语言，用在个人工程管理上。

- 纸底 `#F4F1EA` · 墨 `#1B1A17` · 钴蓝细线 `#1F3FA8` · 尺线 `#C8C3B4`
- 0.5px 直角边框 · 32px 蓝图网格 · 十字准星 · 裁切标记 · FIG / SHEET / REV 标注
- 字体：西文 Cormorant Garamond（装饰衬线）/ Inter（正文）/ JetBrains Mono（等宽），中文思源宋体 / 思源黑体（`@fontsource` 自托管，OFL）
- 明暗主题 + 显示大小可调，首屏无闪白

**红线**（`frontend/DESIGN.md`）：不引组件库 · 不引图标库（图标全部自绘 SVG）· 不用渐变 / 毛玻璃 / 大圆角 / 多层阴影 / emoji · 字重不超过 500 · **动效只允许 `transform`/`opacity` 且 150–250ms** · 不用 loading spinner（一律骨架屏）。

> Island V3 的折叠动画是受控例外：15 步 × 16ms、实测 235–250ms，仍守住 ≤400ms 红线。

规格：[`frontend/DESIGN.md`](frontend/DESIGN.md) · [`frontend/SCREEN_BLUEPRINTS.md`](frontend/SCREEN_BLUEPRINTS.md) · [`frontend/DESIGN_DECISIONS.md`](frontend/DESIGN_DECISIONS.md)

---

## 9. 路线图

```text
v0.3.0 Personal Engineering Foundation   ✅ Sprint 09
v0.4.0 Project Plan & Stage              ✅ Sprint 10
v0.5.0 Engineering Worklog               ✅ Sprint 11
v0.6.0 Agent Local API                   ✅ Sprint 12
v0.7.0 Agent Session & Realtime Sync     ✅ Sprint 13
v0.8.0 Engineering Island MVP            ✅ Sprint 14
v0.9.0 Engineering Island Desktop        ✅ Sprint 15
      Island Polish                       ✅ Sprint 16
v1.0.0 Personal ⇄ Collaboration         ✅ Sprint 17（已发版）
      Island V3 单窗两态（壳层）            ✅ 2026-10-21
      Phase 5.5 稳定化（回归/E2E/安全）      ✅ 2026-10-25
      Anatomy V2 Phase 0–5（对象/空间交互）  ✅ 2026-10-26
      ── 下一周期：Phase 6–9 重构收尾 + Blueprint Dock + Anatomy 后续演进
      ── 可选：组件测试（Vitest）· Lighthouse 90 · Markdown → Worklog 导入
         Blocker 独立实体 · MCP 包装层 · 任务截止日期与逾期
```

**非目标**（防止再次失控）：不删工作区 · 不删团队权限 · 不重写任务系统 · 不重写实时层 · 不重写桌面启动器 · 不立即做 MCP · 不做复杂 AI 自动规划 · 不做多人实时编辑 · 不做失焦自动收起。

---

## 10. 文档索引

| 你想知道 | 看这里 |
|---------|--------|
| **产品原则**（唯一事实源） | [`docs/PRODUCT_PRINCIPLES.md`](docs/PRODUCT_PRINCIPLES.md) · 领域模型 [`docs/DOMAIN_MODEL.md`](docs/DOMAIN_MODEL.md) |
| **个人优先重构**（Phase 0–5 + 稳定化已完成，Phase 6–9 待排期） | [`docs/refactor/`](docs/refactor/) · 决策记录 [`docs/decisions/`](docs/decisions/) |
| **项目解剖图 V2**（Phase 0–5 完成：React SVG 对象 / 空间交互 / 演进痕迹 / 记录浏览 / 性能基线） | [`docs/refactor/ui-design/anatomy/v2/README.md`](docs/refactor/ui-design/anatomy/v2/README.md) |
| 产品重构计划（历史档案，Sprint 09–17 已完成） | [`docs/PRODUCT_REFACTOR_PLAN.md`](docs/PRODUCT_REFACTOR_PLAN.md) |
| **Engineering Island V3 规格**（单窗两态 / 工程浮页，窗口模型唯一事实源） | [`docs/ISLAND_V3_SPEC.md`](docs/ISLAND_V3_SPEC.md) |
| **Engineering Island V2 规格**（信息设计 / 实时方案；窗口模型部分已被 V3 取代） | [`docs/ISLAND_V2_SPEC.md`](docs/ISLAND_V2_SPEC.md) |
| **接手本项目 / 当前进度 / 踩坑** | [`docs/HANDOVER.md`](docs/HANDOVER.md) |
| **v1.0.0 目标达成审计**（计划逐条对照） | [`docs/v1.0.0-goal-audit.md`](docs/v1.0.0-goal-audit.md) |
| 分角色使用说明 | [`docs/使用指南.md`](docs/使用指南.md) |
| 接口契约（前后端唯一事实源） | [`docs/API.md`](docs/API.md) 与 [`docs/api/`](docs/api/) |
| 前端接入手册（CSRF 自愈 / WS 重连 / 常见坑） | [`docs/api/09-frontend-integration.md`](docs/api/09-frontend-integration.md) |
| 后端 / 前端执行计划 | [`BACKEND_PLAN.md`](BACKEND_PLAN.md) · [`frontend/FRONTEND_ROADMAP.md`](frontend/FRONTEND_ROADMAP.md) |
| 各 Sprint 开发日志 | [`docs/devlog/`](docs/devlog/) · [`frontend/docs/devlog/`](frontend/docs/devlog/) |
| 发布说明 | [`docs/releases/`](docs/releases/) |

---

## 协作约定

- 分支 `feat/<模块>-<简述>`，不直接推 main；提交 `<type>(<域>): <简述>`
- **接口先冻结契约再开发**；改接口必须重生成 `docs/api/openapi.yaml`（CI 校验一致性）
- 每个 Sprint 收尾写 devlog：做了什么 / 怎么做 / 踩了什么坑 / 下一步；并更新本 README 的状态
- 每次推送后**核对远端 CI**，爆红自行修完再推，不留红灯
- 改了前端记得**重建桌面版产物**（`scripts\package.py` + `desktop\build.py`）；
  打包会在系统 TEMP 留下 `miniplane-build-*` 构建目录（约 0.85 GB/次，从不清），
  打包后跑一次 `scripts\cleanup-build-cache.py` 清掉（送回收站，可还原）
- **AI 是工具不是作者**：任何一段代码都应能讲清「为什么这样写、不那样写」

> 这个项目也是学习产物：每一天的取舍与踩坑都留在 `docs/devlog/` 里，
> 包括**做错的地方**（例如曾违反自己的动效红线、曾让桌面版产物停滞 10 天）。
