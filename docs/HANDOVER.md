# Mini Plane 工作交接文档（HANDOVER）

> 生成日期：2026-10-02 · 交接基线 commit：`110e9d5`（远端 `origin/main` 已同步，工作树干净，CI 双绿）
> 仓库：`git@github.com:x7687315-gif/mini-plane.git` · 本地路径：`C:\palne`
> 本文档面向**接手本项目的人**，覆盖：产品定位、技术栈、已完成的全部工作、未完成计划、
> 环境搭建、测试与 CI、架构约束、已知问题、关键踩坑、上手清单。
> 唯一事实源（产品层面）仍是 [`docs/PRODUCT_REFACTOR_PLAN.md`](PRODUCT_REFACTOR_PLAN.md)，本文是它的执行快照 + 交接说明。

---

## 目录

1. [产品定位与总体思路](#1-产品定位与总体思路)
2. [技术栈](#2-技术栈)
3. [仓库结构](#3-仓库结构)
4. [环境与运行（三种方式）](#4-环境与运行三种方式)
5. [已完成工作全景](#5-已完成工作全景)
6. [测试与 CI 现状](#6-测试与-ci-现状)
7. [未完成计划（Sprint 14–17）](#7-未完成计划sprint-1417)
8. [架构约束：轻量高效](#8-架构约束轻量高效)
9. [已知问题与文档漂移](#9-已知问题与文档漂移)
10. [关键踩坑备忘（务必先读）](#10-关键踩坑备忘务必先读)
11. [提交 / 推送 / CI 规范](#11-提交--推送--ci-规范)
12. [接手上手清单](#12-接手上手清单)

---

## 1. 产品定位与总体思路

Mini Plane 起初是「仿 [Plane](https://github.com/makeplane/plane) 的迷你项目管理软件」，从 0 实现
用户 / 工作区 / 项目 / 任务（Issue）/ 评论 / 动态 / 实时协作 / 异步任务 / 审计留痕的完整业务链路。

在 Sprint 09 之前完成了一次**产品定位收敛**（见 `PRODUCT_REFACTOR_PLAN.md`），核心结论：

> **不重写，而是演进。** 把 Mini Plane 从「Plane 的个人/团队简化复刻」演进为
> **以「个人工程管理」为第一体验、同时保留团队协作能力的本地工程管理系统**。

产品被拆成两层：

- **Personal Engineering（我的工程 / My Engineering）** —— 默认体验：Project / Plan / Stage / Task / Worklog / Agent。
- **Collaboration（Workspace）** —— 保留但 UI 降级为「协作基础设施」，不删除、不重写。

一句贯穿全局的设计信条：

> **Task 是计划，Worklog 是证据。** 百分比是辅助信息，阶段（Stage）与当前任务（NOW）才是主信息。

形态约束：**本地运行的单机软件**——前端 + 后端 + 数据库都跑在用户自己机器上，数据不出本机；
服务只绑 `127.0.0.1`，DEBUG 关闭，SECRET_KEY 首跑随机生成存本机。

---

## 2. 技术栈

后端：

- Python 3.12 · Django 5.2 · Django REST Framework 3.18
- Channels + daphne（HTTP 与 WebSocket **同端口 8000**；Docker compose 下 WS 分 8001）
- Celery（**默认 eager 同步执行**，不强制起 worker）
- 数据库：PostgreSQL 16（开发 / CI）· SQLite（桌面单机版）
- drf-spectacular（OpenAPI 快照，CI 内 diff 把关）
- ruff（lint + format）· Redis（仅 CI 的 `check_cache` 实测缓存后端；本机默认不启）

前端：

- Next.js 16（App Router，`output: "standalone"`）· React 19 · TypeScript
- TanStack Query（服务端状态）· Zustand（客户端状态）· Tailwind v4
- 设计语言 **Blueprint Editorial**（工程图纸风：直角 / 细线 / 十字准星 / 工程编号 / Cormorant Garamond + Inter + JetBrains Mono；
  禁止渐变 / 毛玻璃 / 大圆角 / 霓虹 / 发光 / Emoji）
- 测试：`node --test`（零依赖单测）· Playwright（真实 Chrome E2E）

桌面：

- pywebview（WebView2 原生窗口）· PyInstaller（单文件 exe）
- `webview.start(private_mode=False, storage_path=runtime/webview-profile)` 实现会话持久化

---

## 3. 仓库结构

```text
C:\palne
├── backend/
│   ├── apps/
│   │   ├── users/        认证、昵称优先登录、可选密码/邮箱绑定
│   │   ├── workspaces/   工作区、成员、三级角色
│   │   ├── projects/     项目、预置状态、/projects/mine/ 单查询聚合、ProjectPlan/ProjectStage
│   │   ├── issues/       任务（Issue）、评论、筛选/排序/分页、批量操作
│   │   ├── activity/     动态留痕（审计）
│   │   ├── worklogs/     工程日志（Sprint 11）
│   │   ├── agents/       Agent Token / 幂等 / AgentSession（Sprint 12–13）
│   │   ├── realtime/     WebSocket 广播（broadcast.py：KNOWN_EVENTS 契约）
│   │   └── jobs/         Celery 异步任务
│   ├── config/           settings（local / test / prod / desktop）、asgi、urls
│   ├── requirements/     base / local / test / prod / desktop
│   └── .venv/            ★ 必须用 backend/.venv/Scripts/python.exe（见踩坑）
├── frontend/
│   ├── app/              路由（含 (protected)/layout 常驻 AppShell + CommandPalette）
│   ├── components/ features/ stores/ lib/ types/ tests/
│   ├── DESIGN.md / SCREEN_BLUEPRINTS.md / DESIGN_DECISIONS.md / FRONTEND_ROADMAP.md
├── desktop/              launcher.py · build.py（PyInstaller）· make_shortcut.ps1 · 图标
├── scripts/              dev.ps1 / dev.cmd（up|down|status|e2e）· package.py（组装单机包）
├── docs/
│   ├── PRODUCT_REFACTOR_PLAN.md   ★ 产品唯一事实源
│   ├── 使用指南.md                分角色使用说明
│   ├── api/                       契约文档（08-realtime.md 等）+ openapi.yaml 快照
│   ├── devlog/                    后端各 Sprint 开发日志
│   └── HANDOVER.md                本文档
├── frontend/docs/devlog/          前端各 Sprint 开发日志
├── runtime/                       本机运行态（SQLite 库 / SECRET_KEY / WebView2 配置）——不进仓库
├── dist/                          package.py 产物——不进仓库（.gitignore）
└── .github/workflows/ci.yml       CI（backend + frontend 两个 job）
```

---

## 4. 环境与运行（三种方式）

> **host 一致性规则（重要）**：页面与 API 必须同 host，端口可不同。
> 开发模式统一用 `localhost`（页面 3000 / API 8000）；桌面版统一用 `127.0.0.1`（已内置）。
> 混用会导致会话 Cookie / CSRF 失效。

### 方式一：桌面 App（推荐给「只想用起来」）

双击桌面「Mini Plane」图标即可——原生窗口、内嵌 SQLite（不用装 PostgreSQL）、首跑自动建库、
会话持久化（重开免登录）、关窗即干净停服。

换新机从零构建（需 Python 3.12+ / Node 20+ / WebView2，Win11 自带）：

```bat
cd backend && python -m venv .venv
.venv\Scripts\python -m pip install -r requirements\local.txt -r requirements\desktop.txt
cd ..
python scripts\package.py                                   :: 构建前端单机产物到 dist\
backend\.venv\Scripts\python.exe desktop\build.py           :: 打包 dist\MiniPlane\MiniPlane.exe
powershell -NoProfile -ExecutionPolicy Bypass -File desktop\make_shortcut.ps1 -Exe "%CD%\dist\MiniPlane\MiniPlane.exe"
```

### 方式二：开发模式（改代码用这个）

一键脚本（推荐）：

```bat
scripts\dev.cmd          :: 起后端+前端，等就绪，自动开浏览器
scripts\dev.cmd e2e      :: 起栈 → 跑 Playwright（23 用例）→ 报结果
scripts\dev.cmd status   :: 两个端口各是什么状态
scripts\dev.cmd down     :: 全部停掉
```

或手动：后端 `python manage.py migrate && python manage.py runserver`（daphne 接管 8000）；
前端 `pnpm install && pnpm dev`（3000）。

### 方式三：Docker Compose（后端全家桶）

```bash
docker compose up --build -d
```

健康检查 `http://127.0.0.1:8000/api/v1/health/` · Swagger `http://127.0.0.1:8000/api/docs/` ·
WS `ws://127.0.0.1:8001/ws/...`。注意 `NEXT_PUBLIC_*` 是**构建期**常量，改后端地址要重新 build。

---

## 5. 已完成工作全景

分两大阶段：**阶段 A（基础平台 + 桌面化 + 体验，Sprint 0–8 及若干专项）** 与
**阶段 B（产品重构，Sprint 09–13，进行中）**。下面每条附**代表 commit**与**开发日志**。

### 阶段 A：基础平台 → 桌面单机软件 → 体验打磨

| 工作块 | 内容要点 | 代表 commit | 日志 |
|--------|----------|-------------|------|
| 后端 MVP（Sprint 0–8） | Auth / 工作区 / 项目 / Issue / State / Label / 评论 / 动态 / 缓存 / 异步 / 实时；CI + Docker + Release v0.1.0 | `f8d5d7c` 等 | `docs/devlog/sprint-0..8-backend.md` |
| 前端设计系统 + Sprint 0–8 | Blueprint Editorial 设计系统；Auth / 工作区 / 项目 / 任务 / 评论 / 动态 / 筛选 / 批量 / 实时 / 工程化 | — | `frontend/docs/devlog/sprint-0..8-frontend.md` |
| 前后端合并为原生窗口本地软件 | pywebview + 内嵌 SQLite；数据不出本机 | `019b227` | `docs/devlog/desktop-local-app.md` |
| 单文件 exe + 桌面快捷方式 | PyInstaller onefile；`make_shortcut.ps1` | `62c20f0` | 同上 |
| 修桌面闪退 + 自定义图标 | 根因：`webview.start(window=...)` 非法参数在 frozen exe 静默闪退；改 `webview.start(debug=False)` + always-log/dialog + GUI probe | `f4911af` | 同上 |
| 界面全面中文化 + 思源字体 | 保留衬线英文艺术标题（设计语言），功能文案中文化 | `f5f47ba` `e5ffb02` | `hardening-02-frontend-onboarding.md` |
| 修 E2E「测试窗口」 | 评论保存/删除按钮中文化后 E2E 恢复 14/14 | `86753f2` | — |
| 昵称优先登录改造 | 首屏只填昵称→一键新建免密直入；密码/邮箱在 `/me → Security` 自助绑定；会话持久化重开免登录 | `400b3d3` `4de8a5e` | — |
| 特色 A 命令面板 | `Ctrl+K` 全局命令面板（跳转我的工作/设置/各工作区） | `4730e05` | — |
| 特色 B 我的工作 | 跨项目聚合视图 `/me/issues` | `4730e05` | — |
| 特色 H 暗色/显示大小 | 明暗主题 + 显示大小可调，持久化，首屏无闪白 | `a6bd137` | — |
| AppShell 上提常驻 | 移到 `(protected)/layout`，消除换页重挂外壳（修角色切换卡顿观感） | `6d77a48` | — |
| 性能/体验修补 | 成员页角色切换乐观更新（修卡顿）；左上角改本机日期 | `c488da8` | — |
| 单机版软件包 v0.2.0 | `scripts/package.py` 一键组装 dist | `3b5cad3` | — |
| 使用指南 + README 重写 | 分角色使用说明；README 更新到真实状态 | `d29f804` `00516cc` | `docs/使用指南.md` |

### 阶段 B：产品重构（Sprint 09–13，每 Sprint 均满足 Definition of Done）

> DoD = 功能 + API 契约 + 后端测试 + 前端测试 + E2E + UI 验收 + Devlog + README 更新 + commit/push + 核对远端 CI。

| Sprint | 版本 | 内容要点 | commit | 日志 |
|--------|------|----------|--------|------|
| 计划落地 | — | 把讨论收束为仓库唯一事实源 `PRODUCT_REFACTOR_PLAN.md`（Sprint 09–17） | `5442ced` | — |
| **09 我的工程首页** | v0.3.0 | 个人模式成默认首页 `/`，Workspace 降级到 `/workspaces`；`/api/v1/projects/mine/` **单条 SQL 聚合**（correlated Subquery/Coalesce/Exists，无 N+1） | `5788743` | `sprint-09-my-engineering.md` |
| **10 Global Plan / Stage** | v0.4.0 | `ProjectPlan` + `ProjectStage`；加权进度 Σw×p/Σw；当前/下一阶段；项目页 PlanPanel；懒创建 Plan | `a1591cb` | `sprint-10-project-plan.md` |
| **11 Worklog 工程日志** | v0.5.0 | `Worklog` 模型（date/title/summary/details/conclusion/next_step/blocker…）；项目页 Engineering Log；首页 Today 维度 | `9e1e3b1` | `sprint-11-worklog.md` |
| **12 Agent Local API** | v0.6.0 | `AgentToken`（token_hash SHA-256、scopes 白名单、`mint()` 一次性明文）；`Idempotency-Key` 幂等（`IdempotencyRecord`）；以「工程动作」为中心的端点；`/me` 可管理 Token | `ece96c1` | `sprint-12-agent-api.md` |
| **13 Agent Session** | v0.7.0 | `AgentSession` 模型（running/done/failed/stopped + `elapsed_seconds`）；`services.start_session/end_session`（事务内 on_commit 广播）；广播事件 **`agent.session`** 入 `KNOWN_EVENTS`（契约 08 两→三事件）；端点 `sessions/?active=1`、`POST sessions/`（幂等）、`end/`（跨项目 404）；`/projects/mine/` 增 `agent_running`（Exists 子查询，仍单 SQL）；前端 `stores/agentSession.ts` + policy effect + 项目页运行中横幅 + 首页角标 | `e537fa2` `110e9d5` | `sprint-13-agent-session.md` |

**Sprint 13 收尾验证（交接时点全绿）：**

- 后端 `Ran 334 tests OK`；ruff check/format、`spectacular --validate --fail-on-warn` rc0；openapi 快照已重生成；迁移双库（PG + SQLite）。
- 前端 tsc / eslint / 单测 **99** / 生产构建全绿；Playwright **E2E 23 passed**。
- 桌面版 `scripts/package.py` 重建 dist 成功（Next 生产构建 compiled，包组装 rc0）。
- 远端 CI：`e537fa2`、`110e9d5` 两次推送，backend / frontend 两 job 均 `success`；HEAD == origin/main == `110e9d5`。

---

## 6. 测试与 CI 现状

当前测试规模（交接时点）：

| 类别 | 数量 | 命令 |
|------|------|------|
| 后端 | **334** | `cd backend && .venv/Scripts/python.exe manage.py test --noinput --settings=config.settings.test` |
| 前端单测 | **99** | `cd frontend && pnpm test`（node --test，零依赖） |
| 浏览器 E2E | **23** | `scripts/dev.cmd e2e`（起栈后跑 Playwright，真实 Chrome） |

CI（`.github/workflows/ci.yml`，push main / PR 触发，两个 job 全绿才可 merge）：

- **backend job**（ubuntu + postgres:16 + redis:7 服务容器）：安装 `requirements/test.txt` → `ruff check` → `ruff format --check` → `makemigrations --check`（迁移无漂移）→ `spectacular --validate --fail-on-warn` → `diff docs/api/openapi.yaml`（快照一致）→ 全量测试 → `check_cache`（Redis 后端实测）。
- **frontend job**（pnpm 11.25.0 + node 22）：`pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build` → 断言 `.next/standalone/server.js` 存在。

> CI 失败成本排序设计：先最便宜最能拦的（lint / 类型 / 格式 / 迁移漂移 / schema diff），最后才跑慢的（测试 / build）。

---

## 7. 未完成计划（Sprint 14–17）

来源：`PRODUCT_REFACTOR_PLAN.md` §16–§22、§28、§33。**这是接手后要继续推进的主线。**

### Sprint 14 — Engineering Island MVP（v0.8.0）★ 下一步

目标：把「当前工程状态」做成桌面实时投影（Island），**先不追求复杂动画**。

- 三种状态先做两种：**Resting**（最小态，约 40–48px，不打扰）与 **Focus**（鼠标靠近/点击展开）。
- **左右滑动 = 翻工程图纸**（不是切任务）：**一个 Project = 一个 Island Page**。
- 单张 Sheet 信息结构：Project / Current Stage / Progress / **NOW** / **TODAY** / **NEXT** / Agent Status。
- 数据源即已完成的 Sprint 10/11/13：plan/stage + worklog + agent.session（实时经 WebSocket 投影）。
- 工程建议：前端放 `frontend/features/engineering-island/`（EngineeringIsland / IslandProjectCard /
  IslandCarousel / IslandProgress / IslandNow / IslandToday / IslandNext / IslandAgentStatus），
  不污染普通 App Shell。
- 硬约束：视觉**必须继承 Blueprint Editorial**（禁止突然变成黑色科技胶囊；色板 `#F4F1EA/#EBE7DD/#D9D4C2/#1B1A17/#1F3FA8`）。
- 验收：Island 能显示当前项目阶段/进度/NOW/TODAY/NEXT/Agent 运行态，并能左右切项目。

### Sprint 15 — Desktop Island（v0.9.0）

把 Island 从浏览器页面变成**独立桌面窗口**：

- `desktop/` 扩展：`launcher.py` + 新增 `island.py` + `window_manager.py`；主窗口之外再开一个 Island 窗口。
- 支持 Always on Top / 顶部居中定位 / 拖拽 / 隐藏 / 显示 / 项目切换。
- 两窗口通过 **WebSocket** 保持同步（复用现有 realtime）。

### Sprint 16 — Engineering Island Polish

做真正的设计表现（克制的动效）：

- Paper Sheet / Blueprint Grid / Crosshair / FIG / SHEET / REV 等工程图纸元素。
- 动效只用 `transform` + `opacity`，时长 **150–250ms**；**不加** bounce / glow / blur / 大幅位移。
- 完全遵守 Blueprint Editorial。

### Sprint 17 — Team Mode Refinement（→ v1.0.0）

不重写团队模块，而是让 **Personal Mode + Collaboration Mode 可切换**（`MY ENGINEERING` ⇄ `WORKSPACE`）。
到此个人工程管理已成熟，团队能力作为第二层出现，收束为 **v1.0.0 Personal Engineering Management Platform**。

### 后续可选（README「后续」清单，未排期）

组件测试（Vitest）/ Lighthouse 90 / 任务截止日期与逾期 / 数据导出备份 / Markdown→Worklog Import（计划 §26 第二阶段）/ MCP 包装层（计划 §31：REST 稳定后再做）。

### 版本路线对照

```text
v0.3.0 Personal Engineering Foundation   → Sprint 09 ✅
v0.4.0 Project Plan & Stage              → Sprint 10 ✅
v0.5.0 Engineering Worklog               → Sprint 11 ✅
v0.6.0 Agent Local API                   → Sprint 12 ✅
v0.7.0 Agent Session & Realtime Sync     → Sprint 13 ✅
v0.8.0 Engineering Island MVP            → Sprint 14 ⏳（下一步）
v0.9.0 Engineering Island Desktop        → Sprint 15 ⏳
v1.0.0 Personal Engineering Mgmt Platform→ Sprint 16–17 ⏳
```

### 第一阶段明确的 Non-goals（防止再次失控）

不删除 Workspace / 不删除团队权限 / 不重写 Issue 系统 / 不重写 Realtime / 不重写 Desktop launcher /
不立即做 MCP / 不立即做复杂 AI 自动规划 / 不立即做多人实时编辑 / 不立即做复杂 Kanban。
（数据库内部可继续叫 Issue，UI 层显示 Task，避免无谓迁移。）

---

## 8. 架构约束：轻量高效

用户明确要求：**从架构上降低本机占用，轻量且高效。** 已落地手段（继续 Sprint 时请保持）：

- `/projects/mine/` 用 **单条 SQL 聚合**（correlated Subquery / Coalesce / Exists），杜绝 N+1；`agent_running` 也是 Exists 子查询，不额外起查询。
- 列表查询 `.prefetch_related("plan__stages")`，避免逐项目回查。
- Plan **懒创建**（首次需要时才建），减少空数据。
- **默认不启 Redis / worker**：Celery eager 同步执行；Redis 仅 CI 的 `check_cache` 用到。
- 桌面进程数最小化：HTTP + WS 同端口（daphne），关窗即干净停服。
- 实时广播刻意**收窄**为工程状态事件（当前三个：`issue.updated` / `comment.created` / `agent.session`），不做全站广播。

---

## 9. 已知问题与文档漂移

- **README「运行测试」小节的用例数已过期**：写的是后端 310 / 前端 98 / E2E 18，实际已是 **334 / 99 / 23**（进度表已更新，速查段落未同步）。接手后可顺手订正。
- **`docs/devlog/README.md` 索引**：新增 devlog 时记得登记（若尚未自动化）。
- E2E 里 **Ctrl+K 在真实 Chrome 中被浏览器拦截**，命令面板用例改为点 TopBar「搜索」按钮触发；桌面 WebView2 无浏览器 chrome，`Ctrl+K` 在桌面版可正常工作（此为环境差异，非缺陷）。
- 提供的 **PAT `ghp_2dYg…` 已过期（401）**；推送走 **SSH**（`git@github.com`）正常。公共仓库 CI 状态可免鉴权读 `api.github.com/.../check-runs`。
- 仓库 main 开了 branch protection（要求 backend job 通过），但当前是直接 push main（提示 "Bypassed rule violations"）；若接手后改走 PR 流程，注意满足必需状态检查。

---

## 10. 关键踩坑备忘（务必先读）

环境与工具：

- **必须用 `backend/.venv/Scripts/python.exe`**：系统 `python` 是 WindowsApps 存根，直接调用会 exit 49（且 `/tmp` 路径 Windows Python 不认，写文件用 Windows 绝对路径）。
- **改后端 API 后**：跑 `ruff format`（不只是 `ruff check`）+ 重新生成 `docs/api/openapi.yaml` 快照，否则 CI 在 `ruff format --check` 或 schema diff 处爆红（历史上已因此红过一次，见 `15adbda`）。
- **改前端源码后**：必须 `python scripts/package.py` 重建 dist，桌面版才会生效（dist 不进仓库）。
- DRF 装饰器顺序：`@api_view` 必须在 `@authentication_classes` **之上**，否则 TypeError。
- `@authentication_classes([])` 会**连用户 session 一起挡掉**，慎用。
- import 位置：`Coalesce` 在 `django.db.models.functions`；`MaxValueValidator` 在 `django.core.validators`。
- ruff B026：星号参数要在关键字参数前（`filter(*conds, project=...)`）。
- 自定义 Bearer 认证需要 `OpenApiAuthenticationExtension`，否则 spectacular 报警。

数据与测试：

- `create_issue(priority=None)` 会违反 NOT NULL → 500；只有传了 priority 才带该字段。
- 幂等记录序列化 UUID 要用 `json.dumps(..., cls=DjangoJSONEncoder)`，否则「Object of type UUID is not JSON serializable」。
- 工作区 slug 校验最少 2 字符（测试里别用 "w"，用 "ww"）。
- **Windows 墙钟粒度约 15ms**：两条记录同 `created_at` 会导致排序 tie 按随机 UUID 打破 → 偶发 flaky；测试里显式把第二条 `created_at` 拉开（如 +1s）。

前端 / E2E：

- Playwright 用 `getByLabel` 子串匹配易触发 strict-mode 冲突（如「日志标题」撞「标题」）→ 用 `getByRole("dialog").getByLabel("标题")` 缩小范围；**改测试而非改 UI**。
- `react-hooks/set-state-in-effect` 规则：别在 effect 里直接 setState。
- 修行为问题时**不要顺手改 UI 视觉**；保留设计语言的英文衬线标题；按钮/标签要完整可见。

桌面：

- pywebview `private_mode` 默认 True 会丢 Cookie → 每次重开要重新登录；用 `private_mode=False, storage_path=runtime/webview-profile` 持久化。
- frozen exe 里 `webview.start(func=None, window=window)` 是非法参数会静默闪退；异常处理要 always-log + always-dialog（不能 frozen 时跳过 MessageBox）。
- 启动脚本含中文时若是 UTF-8 无 BOM，会被按 GBK 解析导致闪退（见 `7bef59e`）。

---

## 11. 提交 / 推送 / CI 规范

用户设定的标准工作流（每个 Sprint / 阶段都要走）：

1. 写 MD 开发日志（做了什么 / 怎么做 / 验证 / 下一步）→ `docs/devlog/sprint-XX-*.md`。
2. `git commit`（信息风格见历史：`feat(sprintNN): ...` / `fix(...)` / `docs(...)` / `perf(...)` / `refactor(...)`）。
3. `git push origin main`（走 SSH）。
4. **每次推送后核对远端 CI**；**若爆红，自行修复后再推**，不留红灯。
5. 全部代码完成后，做**一次全局安全性检查 + 全局代码检查**（可用 p3c-code-quality / analyze-code 类技能）。
6. 持续贯彻「轻量高效」的架构优化。

查远端 CI 状态（免鉴权，公共仓库）：

```bash
curl -s -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/x7687315-gif/mini-plane/commits/<sha>/check-runs"
# 期望两个 job：backend（lint + 静态检查 + 测试）、frontend（lint + 类型 + 单测 + 构建）→ conclusion: success
```

---

## 12. 接手上手清单

1. 克隆仓库到本地（如 `C:\palne`），确认 `git log -1` 为 `110e9d5` 或更新。
2. 建后端 venv：`cd backend && python -m venv .venv && .venv\Scripts\python -m pip install -r requirements\local.txt`。
3. 配 `.env`（`cp .env.example .env`，填 SECRET_KEY / DATABASE_URL）。
4. `python manage.py migrate`（开发用 PostgreSQL；桌面版首跑自动建 SQLite）。
5. 前端 `pnpm install`（Node 20+ / pnpm 11.25.0）。
6. 跑一遍全量验证，确认与本文一致：后端 334 / 前端单测 99 / `scripts\dev.cmd e2e` 23。
7. 通读 `docs/PRODUCT_REFACTOR_PLAN.md`（产品事实源）+ `docs/devlog/sprint-13-agent-session.md`（最新进度）。
8. 从 **Sprint 14 — Engineering Island MVP** 开始推进，遵守 §7 的验收与 Blueprint Editorial 约束、§8 的轻量约束、§11 的提交规范。

---

## 附：Definition of Done（每个新 Sprint 都要满足）

```text
功能完成 → API contract → Backend tests → Frontend tests → E2E
        → UI 验收 → Devlog → README 状态更新 → commit/push → 核对远端 CI
```

并牢记 README 的原则：**AI 是工具，不是作者。** 接手后你应能自己讲清：
为什么 API 以工程动作为中心、为什么 Agent 权限独立、为什么要幂等、为什么 Worklog ≠ Task、
为什么 WebSocket 适合 Island、为什么 Markdown 不该被数据库完全取代。
