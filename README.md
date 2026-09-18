# Mini Plane

仿 [Plane](https://github.com/makeplane/plane) 的迷你项目管理软件（双人学习项目）：从 0 实现用户、工作区、项目、任务（Issue）管理的完整业务链路，含实时协作、异步任务、审计留痕。**产品定位：本地运行的单机软件**（前端 + 后端 + 数据库都跑在你自己的机器上，数据不出本机）。

<p align="center">
  <img src="frontend/docs/assets/real-issue-list.png" width="820" alt="Mini Plane — 任务列表（真实截图）">
</p>

<p align="center">
  <sub>真实产品截图（生产构建 + 真实后端数据）—— 不是设计稿。
  更多截图见 <a href="frontend/docs/assets/">frontend/docs/assets/</a></sub>
</p>

---

## 目录

- [使用指南](#使用指南) ← 想知道"这个应用怎么用"看这里
- [快速开始](#快速开始)（单机版软件包 / 开发模式 / Docker）
- [当前进度](#当前进度) · [设计语言](#设计语言blueprint-editorial) · [测试与质量](#测试与质量)
- [技术栈](#技术栈) · [目录结构](#目录结构) · [文档导航](#文档导航) · [协作约定](#协作约定)

---

## 使用指南

> 界面为中文；部分衬线大标题（Workspace / Recent projects / Members 等）按设计语言保留英文艺术字体。

### 1. 注册与登录

- 打开首页会自动跳到 **/register（注册）**：填 **用户名 / 邮箱 / 密码（≥ 8 位）**，提交后**立即自动登录**。
- 已有账号走 **/login（登录）**：用户名（或邮箱）+ 密码。连续失败会触发限流提示。
- 右上角头像菜单：**my settings（个人设置）** 与 **退出登录**。会话过期时访问任何页面都会被送回登录页，登录后回到原页面。

### 2. 工作区（Workspace）—— 一切从这里开始

工作区 = 你和协作者的独立空间，彼此数据完全隔离。

| 操作 | 怎么做 |
|------|--------|
| 创建 | 首页 **Workspaces** 列表 → 新建；名称随意，**slug** 是地址栏标识（重名会自动加 `-2` 后缀） |
| 切换 | 左侧竖栏（每行 = 头像缩写 + 角色徽章），点一下整站切换 |
| 成员管理 | 工作区页 → **Members**：按用户名添加成员、改角色、移除 |
| 改名 / 删除 | 工作区设置：改名即时生效；删除是危险操作，需**手动输入 slug** 确认 |

**三级角色**（生效角色 = 工作区角色与项目角色取高者）：

| 角色 | 能做什么 |
|------|---------|
| 管理员 | 一切：管理成员、建删项目、增删改任何任务 |
| 成员 | 参与项目：建任务、改任务、评论、打标签 |
| 只读 | 只能看：浏览列表与详情，不显示任何写按钮 |

### 3. 项目（Project）与预置状态

进入工作区 → **Recent projects → 新建项目**：名称 + **标识符**（如 `AMI`，会出现在每个任务编号前，如 `AMI-1`）。

创建即自动预置五个状态：**Backlog → Todo → In Progress → Done → Cancelled**（顺序即看板语义）。

### 4. 任务列表 —— 筛选、搜索、排序

列表页每行：任务编号（`AMI-1`）、标题、状态、优先级、标签、指派人、更新时间。

| 能力 | 用法 |
|------|------|
| 搜索 | 顶部搜索框，标题模糊匹配（250ms 防抖） |
| 状态筛选 | 状态 chip 单排（可多选） |
| 优先级 / 指派人 / 标签 | 三个下拉多选；指派人支持「指派给我」 |
| 排序 | 更新时间（默认倒序）/ 创建时间 / 优先级（urgent → high → medium → low → none） |
| 分页 | 底部翻页，每页 50 条 |
| **URL 即状态** | 所有筛选都写进地址栏 —— **复制链接发给同事，对方打开看到完全相同的筛选结果**；非法参数会被静默丢弃，页面照常渲染 |

### 5. 任务详情抽屉

点任意行打开右侧抽屉，所有编辑都在这里完成：

- **就地编辑**：状态、优先级、指派人、标签四个字段**点开即改**（乐观更新——界面立即变化，失败自动回滚并提示）
- **描述**：详情上方只读展示（字数折算），编辑走任务描述字段
- **动态（Activity）**：这个任务的**全部变更历史**，倒序（最新在上）——谁在什么时候把状态从什么改成什么、谁加了标签、谁评论了。编辑评论**不会**产生记录（避免噪声）；删除评论会留下「删除」痕迹
- **评论（Comments）**：对话流，正序（旧的在上）；支持**编辑自己的评论**（管理员可改任何人的）；删除需二次确认
- **删除任务**：底部危险操作，需确认

### 6. 批量操作

列表中**勾选多行**（≥1）→ 底部浮出批量操作条：

- 改状态 / 改优先级 / 改指派 / 删除：**逐条下发**，结果如实汇报（例如「3/5 成功 · 2 个失败（首个原因：…）」）；有失败时出现 **重试失败项**，只重试没成功的那几条
- 改标签：**覆盖式**（勾选的标签 = 最终标签集），走**异步任务**（界面提示受理，完成后列表与详情自动刷新）
- 多选时列表仍可滚动翻页；选中的行高亮

### 7. 实时协作

同一个项目的所有打开页面**自动保持同步**（右上角 ● live 表示连接正常）：

- A 改了任务状态 → B 的列表**几秒内自动更新**（无需刷新）
- A 发了评论 → B 的抽屉里评论数自动 +1
- 断网自动指数退避重连，恢复后全量刷新兜底；会话过期自动跳登录、无权限的项目停止重连（不会无限重试）

### 8. 个人设置（/me）

查看当前账号的用户名 / 邮箱 / 加入的工作区与角色。

---

## 快速开始

> 前置：Windows 10/11；Python 3.12+；Node.js 20+；PostgreSQL 16（本机服务）。
> **host 一致性规则（重要）**：页面与 API 必须同 host，端口可不同——
> 开发模式统一用 `localhost`（页面 3000 / API 8000）；
> 单机版软件包统一用 `127.0.0.1`（已内置，无需配置）。
> 混用（页面 localhost + API 127.0.0.1）会话 Cookie 与 CSRF 会全部失效。

### 方式一：本地单机版软件包（推荐给"只想用起来"的场景）

```bash
python scripts/package.py     # 组装 dist/mini-plane-<版本>-local/（约 40MB）
```

产物目录：

```
dist/mini-plane-0.2.0-local/
├── setup.cmd    # 首次运行：随机 SECRET_KEY → 写配置 → 建 venv → 装依赖 → 迁移
├── start.cmd    # 日常启动：daphne(8000) + Next standalone(3000)，自动开浏览器
├── stop.cmd     # 一键停止
└── README-本地版.md
```

首次：双击 `setup.cmd`（按提示填一次 PostgreSQL 连接串）→ 之后每次：双击 `start.cmd`。
安全基线：全部服务**只绑 127.0.0.1**（不暴露局域网）、DEBUG 关闭、SECRET_KEY 随机生成存本机。

### 方式二：开发模式（改代码用这个）

```bash
# 后端（HTTP + WebSocket 同端口 8000）
cd backend
python -m venv .venv && .venv/Scripts/activate
pip install -r requirements/local.txt
cp .env.example .env          # 填 SECRET_KEY / DATABASE_URL
python manage.py migrate
python manage.py runserver    # daphne 接管

# 前端（热更新，3000）
cd frontend
pnpm install
cp .env.example .env.local
pnpm dev
```

或者用一键脚本：

```bash
scripts\dev.cmd          # 起后端+前端，等就绪，自动开浏览器
scripts\dev.cmd e2e      # 起栈 → 跑 Playwright 14 用例 → 报结果
scripts\dev.cmd status   # 两个端口各是什么状态
scripts\dev.cmd down     # 全部停掉
```

### 方式三：Docker Compose（后端全家桶）

```bash
docker compose up --build -d
```

| 入口 | 地址 |
|------|------|
| 健康检查 | <http://127.0.0.1:8000/api/v1/health/> |
| Swagger | <http://127.0.0.1:8000/api/docs/> |
| WebSocket | `ws://127.0.0.1:8001/ws/...`（compose 里与 HTTP 分端口） |

> compose 下前端也一并起（`frontend` 服务）。`NEXT_PUBLIC_*` 是**构建期**常量——改后端地址要重新 build，改环境变量没用。

## 运行测试

```bash
# 后端
cd backend
python manage.py test --settings=config.settings.test --noinput   # 299 用例
ruff check . && ruff format --check .

# 前端
cd frontend
pnpm test        # 单元测试 98 用例（node --test，零依赖）
pnpm typecheck && pnpm lint
pnpm build       # 生产构建（standalone）

# 浏览器端到端（14 用例；需栈已起，见 scripts/dev.cmd e2e）
cd frontend && pnpm test:e2e
```

## 当前进度

| 模块 | 状态 |
|------|------|
| 后端 MVP（Auth / 工作区 / 项目 / Issue / 评论 / 动态 / 缓存 / 异步 / 实时） | ✅ [Sprint 0–8](docs/devlog/) |
| 后端 CI + Docker + Release v0.1.0 | ✅ |
| 前端设计系统 + Sprint 0–8（Auth / 工作区 / 项目 / 任务 / 评论 / 动态 / 筛选 / 批量 / 实时 / 工程化） | ✅ [devlog](frontend/docs/devlog/) |
| 前端单元测试 98 + 浏览器 E2E 14 | ✅ |
| 界面全面中文化 + 思源字体匹配 | ✅ |
| 本地单机版软件包（`scripts/package.py`） | ✅ v0.2.0 |
| 组件测试（Vitest）/ Lighthouse 90 / 内嵌 PostgreSQL | ⏳ 二期 |

每个 Sprint 的取舍、踩坑与验收清单见开发日志：后端 [docs/devlog/](docs/devlog/)、前端 [frontend/docs/devlog/](frontend/docs/devlog/)。

## 设计语言：Blueprint Editorial

<p align="center">
  <img src="frontend/docs/assets/real-issue-drawer-activity.png" width="300" alt="抽屉 · 动态审计时间线">
  &nbsp;&nbsp;
  <img src="frontend/docs/assets/real-issue-drawer-comments.png" width="300" alt="抽屉 · 评论对话">
  &nbsp;&nbsp;
  <img src="frontend/docs/assets/real-bulk-actions.png" width="300" alt="批量操作条">
</p>

<sub>左：动态审计时间线（倒序）· 中：评论对话（正序）—— **同一个抽屉里两个列表顺序相反是故意的**（审计 vs 对话）。
右：多选后的批量操作条。</sub>

整套 UI 走 **Blueprint Editorial（蓝图编辑风）**：暖灰白底 `#F4F1EA` + 钴蓝细线 `#1F3FA8` + 古典衬线 Cormorant Garamond italic 做装饰 + 思源宋体/黑体承接中文 + Inter 做西文正文 + 0.5px 直角边框 + 32px 网格底纹。完整规格见 [frontend/DESIGN.md](frontend/DESIGN.md)。

> **反模板**：不引入组件库（shadcn/MUI 都拒）、不引入图标库（14 个图标全部自绘 SVG）、不做暗色模式、不使用渐变 / 阴影 / 毛玻璃 / emoji。

## 技术栈

| 端 | 技术 |
|------|------|
| Backend | Python 3.12 · Django 5.2 LTS · Django REST Framework · PostgreSQL 16 |
| 异步与实时 | Redis（可降级 LocMem/filesystem）· Celery · WebSocket（Channels / daphne） |
| 工程化 | Docker Compose · GitHub Actions CI（双 job）· ruff · drf-spectacular · Playwright |
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS v4 |
| Frontend 状态 | Zustand (UI) · TanStack Query (服务端) · react-hook-form + zod |
| 字体 | 西文 Cormorant Garamond / Inter / JetBrains Mono · 中文 思源宋体 / 思源黑体（`@fontsource` 自托管，OFL） |

## 目录结构

```text
mini-plane/
├── backend/                          # Django + DRF + Channels + Celery（MVP 完成）
├── frontend/                         # Next.js 16（MVP 完成，界面中文）
│   ├── app/ components/ features/ lib/ stores/ types/
│   ├── tests/unit/                   # 单元测试 98（node --test 零依赖）
│   ├── tests/e2e/                    # Playwright 浏览器端到端 14 用例
│   ├── docs/devlog/                  # 每个 Sprint 一份 + 集成验收报告
│   └── docs/assets/                  # 真实截图 + 设计稿
├── scripts/
│   ├── dev.cmd / dev.ps1             # 一键开发启动器（up/down/status/e2e）
│   └── package.py                    # 组装本地单机版软件包
├── dist/                             # 打包产物（gitignore）
├── docs/
│   ├── API.md · api/                 # 接口契约 00–09（前后端唯一事实源）
│   └── devlog/                       # 后端 Sprint 日志
├── docker-compose.yml                # db / redis / web / asgi / worker / frontend
├── ARCHITECTURE.md · BACKEND_PLAN.md
```

## 文档导航

| 你想知道 | 看这里 |
|---------|--------|
| 使用中的已知边界与二期计划 | [docs/releases/v0.2.0.md](docs/releases/v0.2.0.md) |
| 后端 / 前端执行计划 | [BACKEND_PLAN.md](BACKEND_PLAN.md) · [frontend/FRONTEND_ROADMAP.md](frontend/FRONTEND_ROADMAP.md) |
| 设计系统 / 屏幕蓝图 / 设计决策 | [frontend/DESIGN.md](frontend/DESIGN.md) 等（见上方目录结构） |
| 架构总览（请求 / 推送 / 任务三条链路 + 前端链路） | [ARCHITECTURE.md](ARCHITECTURE.md) |
| 接口契约（前后端唯一事实源） | [docs/API.md](docs/API.md) 与 [docs/api/](docs/api/) |
| 前端接入手册（CSRF 自愈 / 错误分流 / WS 重连 / 常见坑） | [docs/api/09-frontend-integration.md](docs/api/09-frontend-integration.md) |
| 开发日志 | [docs/devlog/](docs/devlog/) · [frontend/docs/devlog/](frontend/docs/devlog/) |
| 集成验收报告（端到端实测 + 安全审计） | [frontend/docs/devlog/integration-verification.md](frontend/docs/devlog/integration-verification.md) |

## 协作约定

- 分支：`feat/backend-<模块>-<简述>` / `feat/frontend-<模块>-<简述>`，不直接推 main
- Commit：`<type>(backend|frontend): <简述>`
- PR 按模板（What / Why / How / Testing / Breaking Changes）
- main 受 branch protection：CI 全绿 + 双向 Review 通过才可合并
- API 先冻结契约（[docs/api/](docs/api/)）再开发；改接口必须重生成 `openapi.yaml`（CI 校验一致性）
- 每个 Sprint 收尾写 devlog，记录做了什么 / 怎么做的 / 踩坑 / 下一步
- AI 是工具不是作者：每个 Sprint 的 DoD 里有「能脱离 AI 讲清楚每段代码为什么存在」
