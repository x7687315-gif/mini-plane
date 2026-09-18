# Mini Plane

仿 [Plane](https://github.com/makeplane/plane) 的迷你项目管理软件（双人学习项目）：从 0 实现用户、工作区、项目、任务（Issue）管理的完整业务链路，最终目标是具备阅读并贡献真实 Plane 源码的能力。

<p align="center">
  <img src="frontend/docs/assets/real-issue-list.png" width="820" alt="Mini Plane — Issue list（真实截图：真实数据 · 生产构建 · 右上角 ● live 是已建立的 WebSocket 连接）">
</p>

<p align="center">
  <sub>真实产品截图（生产构建 + 真实后端数据）—— 不是设计稿。
  设计稿见 <a href="frontend/docs/assets/">frontend/docs/assets/</a></sub>
</p>

## 当前进度

| 模块 | 状态 | 进度 | 对应 Sprint |
|------|------|------|------------|
| 后端 MVP（含 Auth / WS / Realtime / Cache） | ✅ 完成 | ▓▓▓▓▓▓▓▓▓▓ | [Sprint 0–8](docs/devlog/) |
| 后端 CI + Docker + Release v0.1.0 | ✅ 完成 | ▓▓▓▓▓▓▓▓▓▓ | Sprint 8 |
| 前端设计语言 + 屏幕蓝图 | ✅ 完成 | ▓▓▓▓▓▓▓▓▓▓ | [DESIGN.md](frontend/DESIGN.md) |
| 前端 Sprint 0：脚手架 + 设计系统 | ✅ 完成 | ▓▓▓▓▓▓▓▓▓▓ | [Sprint 0 devlog](frontend/docs/devlog/sprint-0-frontend.md) |
| 前端 Sprint 1：Auth 闭环 | ✅ 完成 | ▓▓▓▓▓▓▓▓▓▓ | [Sprint 1 devlog](frontend/docs/devlog/sprint-1-frontend.md) |
| 前端 Sprint 2：Workspace + Project | ✅ 完成 | ▓▓▓▓▓▓▓▓▓▓ | [Sprint 2 devlog](frontend/docs/devlog/sprint-2-frontend.md) |
| 前端 Sprint 3：Issue 核心 | ✅ 完成 | ▓▓▓▓▓▓▓▓▓▓ | [Sprint 3 devlog](frontend/docs/devlog/sprint-3-frontend.md) |
| 前端 Sprint 4：Comments + Activity | ✅ 完成 | ▓▓▓▓▓▓▓▓▓▓ | [Sprint 4 devlog](frontend/docs/devlog/sprint-4-frontend.md) |
| 前端 Sprint 5：Search + Filter + Sort | ✅ 完成 | ▓▓▓▓▓▓▓▓▓▓ | [Sprint 5 devlog](frontend/docs/devlog/sprint-5-frontend.md) |
| 前端 Sprint 6：批量操作 + 异步任务 | ✅ 完成 | ▓▓▓▓▓▓▓▓▓▓ | [Sprint 6 devlog](frontend/docs/devlog/sprint-6-frontend.md) |
| 前端 Sprint 7：WebSocket Realtime | ✅ 完成 | ▓▓▓▓▓▓▓▓▓▓ | [Sprint 7 devlog](frontend/docs/devlog/sprint-7-frontend.md) |
| 前端 Sprint 8：Docker + CI + 收尾 | ✅ 完成 | ▓▓▓▓▓▓▓▓▓▓ | [Sprint 8 devlog](frontend/docs/devlog/sprint-8-frontend.md) |
| **前端 MVP 收口（Sprint 0–8 全绿）** | ✅ 完成 | ▓▓▓▓▓▓▓▓▓▓ | [frontend/docs/devlog/](frontend/docs/devlog/) |

> 实时进度详见 [docs/devlog/README.md](docs/devlog/README.md)（后端）+ [frontend/docs/devlog/](frontend/docs/devlog/)（前端）。

## 设计语言：Blueprint Editorial

<p align="center">
  <img src="frontend/docs/assets/real-issue-drawer-activity.png" width="300" alt="抽屉 · Activity 审计时间线">
  &nbsp;&nbsp;
  <img src="frontend/docs/assets/real-issue-drawer-comments.png" width="300" alt="抽屉 · Comments 对话">
  &nbsp;&nbsp;
  <img src="frontend/docs/assets/real-bulk-actions.png" width="300" alt="批量操作条">
</p>

<sub>左：Activity 审计时间线（倒序）· 中：Comments 对话（正序）—— **同一个抽屉里两个列表顺序相反是故意的**，
理由见 [sprint-4 devlog](frontend/docs/devlog/sprint-4-frontend.md)。右：多选后的批量操作条。</sub>

整套 UI 走 **Blueprint Editorial（蓝图编辑风）**：暖灰白底 `#F4F1EA` + 钴蓝细线高亮 `#1F3FA8` + 古典衬线 Cormorant Garamond italic 做装饰 + Inter 做正文 + 0.5px 直角边框 + 32px 网格底纹 + 坐标轴 / 十字标记 / 装饰词。完整规格见 [frontend/DESIGN.md](frontend/DESIGN.md)。

> **反 AI 模板**：不引入组件库（shadcn/MUI 都拒）、不引入图标库（14 个图标全部自绘 SVG）、不做暗色模式（CSS variables 已抽象，二期可加）、不使用渐变 / 阴影 / 毛玻璃 / emoji。

## 文档导航

| 你想知道 | 看这里 |
|---------|--------|
| 项目目标与协作原则 | [plane_mini_collaboration_plan.md](plane_mini_collaboration_plan.md) |
| 后端执行计划 | [BACKEND_PLAN.md](BACKEND_PLAN.md) |
| 前端执行计划 | [frontend/FRONTEND_ROADMAP.md](frontend/FRONTEND_ROADMAP.md) |
| 设计系统 | [frontend/DESIGN.md](frontend/DESIGN.md) |
| 屏幕蓝图 | [frontend/SCREEN_BLUEPRINTS.md](frontend/SCREEN_BLUEPRINTS.md) |
| 设计决策日志 | [frontend/DESIGN_DECISIONS.md](frontend/DESIGN_DECISIONS.md) |
| 架构总览（请求/推送/任务三条链路） | [ARCHITECTURE.md](ARCHITECTURE.md) |
| 接口契约（前后端唯一事实源） | [docs/API.md](docs/API.md) 与 [docs/api/](docs/api/) |
| 前端接入手册（含 CSRF 自愈 / 错误分流 / WS 重连） | [docs/api/09-frontend-integration.md](docs/api/09-frontend-integration.md) |
| 后端开发日志 | [docs/devlog/](docs/devlog/) |
| 前端开发日志 | [frontend/docs/devlog/](frontend/docs/devlog/) |

## 技术栈

| 端 | 技术 |
|------|------|
| Backend | Python 3.12 · Django 5.2 LTS · Django REST Framework · PostgreSQL 16 |
| 异步与实时 | Redis · Celery · WebSocket（Channels / daphne） |
| 工程化 | Docker Compose · GitHub Actions CI · ruff · drf-spectacular |
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS v4 |
| Frontend 状态 | Zustand (UI 状态) · TanStack Query (服务端状态) · react-hook-form + zod |
| Frontend 字体 | Cormorant Garamond (装饰) · Inter (正文) · JetBrains Mono (等宽) — `@fontsource` 自托管 |

## 目录结构

```text
mini-plane/
├── backend/                          # Django + DRF + Channels + Celery（已完成 MVP）
├── frontend/                         # Next.js（开发中）
│   ├── DESIGN.md · SCREEN_BLUEPRINTS.md · FRONTEND_ROADMAP.md · DESIGN_DECISIONS.md
│   ├── app/                          # App Router
│   ├── components/{ui,shell,icons,providers,issue,activity}
│   ├── features/                     # 业务特性（auth / workspace / project / issue / comment / activity）
│   ├── lib/api.ts                    # 统一 fetch（CSRF 自愈 / 错误分流）
│   ├── stores/                       # Zustand stores
│   ├── tests/unit/                   # node:test 纯函数用例（契约映射表 / 权限 / 查询）
│   ├── docs/devlog/                  # 每个 Sprint 一份
│   └── docs/assets/                  # 设计稿与真实 build 截图
├── docs/
│   ├── API.md · api/                 # 接口契约（手维护 + openapi.yaml 校验）
│   └── devlog/                       # 后端 Sprint 日志
├── docker-compose.yml                # web / db / redis / worker / asgi
├── BACKEND_PLAN.md · ARCHITECTURE.md
└── plane_mini_collaboration_plan.md  # 双人协作总计划
```

## 快速开始

### 后端（任选其一）

#### A. Docker 一键起全套（推荐）

```bash
docker compose up --build -d
```

| 入口 | 地址 |
|------|------|
| 健康检查 | <http://127.0.0.1:8000/api/v1/health/> |
| Swagger | <http://127.0.0.1:8000/api/docs/> |
| WebSocket | `ws://127.0.0.1:8001/ws/...`（分开的端口） |

#### B. 本地开发

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate
pip install -r requirements/local.txt
cp .env.example .env  # 填入 SECRET_KEY / DATABASE_URL
python manage.py migrate
python manage.py runserver  # daphne 接管，HTTP + WS 同端口 8000
```

### 前端

```bash
cd frontend
pnpm install
cp .env.example .env.local
pnpm dev  # 默认 http://localhost:3000
```

### 本地一键启动（推荐给"想直接点开测试"的你）

```bash
scripts\dev.cmd          # 双击也行：起后端+前端，等就绪，自动开浏览器
scripts\dev.cmd e2e      # 起栈 → 跑 Playwright 14 用例 → 报结果
scripts\dev.cmd status   # 两个端口各是什么状态
scripts\dev.cmd down     # 全部停掉
```

（逻辑在 `scripts/dev.ps1`；`dev.cmd` 只是双击入口。前置：`backend/.venv` 存在、`pnpm` 在 PATH。）

### 本地一键启动（推荐给"想直接点开测试"的你）

```bash
scripts\dev.cmd          # 双击也行：起后端+前端，等就绪，自动开浏览器
scripts\dev.cmd e2e      # 起栈 → 跑 Playwright 14 用例 → 报结果
scripts\dev.cmd status   # 两个端口各是什么状态
scripts\dev.cmd down     # 全部停掉
```

（逻辑在 `scripts/dev.ps1`；`dev.cmd` 只是双击入口。前置：`backend/.venv` 存在、`pnpm` 在 PATH。）

> 也可以交给编排：`docker compose up --build -d` 会一起起 `frontend`（见下）。
> 前端镜像用 Next 的 standalone 产物，所以 `NEXT_PUBLIC_*` 是**构建期**常量 ——
> 改后端地址要 `docker compose build frontend` 重新构建，改环境变量没用。

环境变量 `NEXT_PUBLIC_API_BASE` 默认 `http://127.0.0.1:8000`，`NEXT_PUBLIC_WS_BASE` 默认 `ws://127.0.0.1:8000`
（本地 `runserver` 由 daphne 接管，HTTP 与 WS 同端口；compose 里 WS 走独立的 asgi 8001 端口）。

> **compose 下请用 <http://localhost:3000> 打开，不要用 127.0.0.1:3000**：
> Session Cookie 与 CSRF 按来源校验，两者在 CORS 白名单里是不同的来源。

> **首次接入建议**：先跑后端，再启前端，打开 <http://localhost:3000> 应看到 Blueprint Editorial 风格的占位首页（[preview-sprint0-home.png](frontend/docs/assets/preview-sprint0-home.png)），证明字体 / 网格 / 组件全部加载成功。

## 运行测试

后端：

```bash
cd backend
python manage.py test --settings=config.settings.test --noinput
ruff check . && ruff format --check .
```

前端（Sprint 4 起）：

```bash
cd frontend
pnpm test        # node --test "tests/unit/**/*.test.mts"（98 用例，零依赖）
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm build       # next build
```

> 前端单元测试目前只覆盖**纯函数**（契约文案映射表 / 评论权限判定 / 查询序列化与排序白名单），
> 组件测试与 Playwright E2E 尚未落地 —— 原因与迁移路径见
> [sprint-4-frontend.md §3.1](frontend/docs/devlog/sprint-4-frontend.md)。

## 协作约定

- 分支：`feat/backend-<模块>-<简述>` / `feat/frontend-<模块>-<简述>`，不直接推 main
- Commit：`<type>(backend|frontend): <简述>`
- PR 按模板（What / Why / How / Testing / Breaking Changes）
- main 受 branch protection：CI 全绿 + 双向 Review 通过才可合并
- API 先冻结契约（[docs/api/](docs/api/)）再开发；契约变更走 PR；改接口必须重生成 `openapi.yaml`（CI 校验一致性）
- 每个 Sprint 收尾写一份 devlog（后端放 [docs/devlog/](docs/devlog/)，前端放 [frontend/docs/devlog/](frontend/docs/devlog/)），记录做了什么 / 怎么做的 / 踩坑 / 下一步
- AI 是工具不是作者：每个 Sprint 的 DoD 里有一条"能脱离 AI 讲清楚每段代码为什么存在"