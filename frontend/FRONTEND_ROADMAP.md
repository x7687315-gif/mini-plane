# FRONTEND_ROADMAP.md — Mini Plane 前端开发路线图

> 配套文档：
> - [DESIGN.md](./DESIGN.md)（设计系统）
> - [SCREEN_BLUEPRINTS.md](./SCREEN_BLUEPRINTS.md)（屏幕蓝图）
> - [../docs/api/](../docs/api/)（后端 API 契约 — 数据事实源）
> - 协作总计划 [plane_mini_collaboration_plan.md](../../xwechat_files/wxid_8sc87vk1o7cc22_6001/msg/file/2026-09/plane_mini_collaboration_plan.md)
>
> 本文件是前端同学（你 + 我）的执行手册：每个 Sprint 做什么、按什么顺序、DoD 是什么。
> 与后端 [BACKEND_PLAN.md](../../BACKEND_PLAN.md) Sprint 编号对齐，但可以前置/后置一个 Sprint 做并行联调。

---

## 0. 技术栈决策（v0.1 锁定，变更需 PR）

| 维度 | 选型 | 理由 |
|------|------|------|
| 框架 | **Next.js 14+ (App Router)** | SSR / 文件路由 / 字体优化内置；与后端 DRF 边界清晰 |
| 语言 | **TypeScript 5.x（strict）** | 类型安全；与 API 契约一致 |
| UI 库 | **Tailwind CSS + 自绘极简单线条 SVG** | 不引入组件库（shadcn / MUI）；DESIGN.md §11 已禁止 |
| 状态管理 | **Zustand + React Query** | Zustand 管 UI / 客户端状态；React Query 管服务端状态 + 缓存 + 重取 |
| 表单 | **react-hook-form + zod** | 类型安全的 schema 校验 |
| HTTP | **原生 fetch + 统一 `api()` 包装** | 见 [docs/api/09-frontend-integration.md §三](../../docs/api/09-frontend-integration.md) |
| WebSocket | **原生 WebSocket + Zustand wsStore** | 见 [SCREEN_BLUEPRINTS §4](./SCREEN_BLUEPRINTS.md) |
| 字体 | **Cormorant Garamond + Inter（Google Fonts）** | 见 [DESIGN.md §2](./DESIGN.md) |
| 测试 | **Vitest（单元）+ Playwright（E2E）** | Vitest 与 Vite 生态一致；Playwright 覆盖关键用户路径 |
| 代码质量 | **ESLint + Prettier + TypeScript strict** | 与后端 ruff 风格一致 |
| 部署 | **Docker 容器（Node 20 alpine）→ 与后端 docker compose 一致** | 见 Sprint 8 |

**目录结构**（与协作总计划 §10 约定一致）：

```
frontend/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout + 字体 + 全局样式
│   ├── globals.css               # CSS variables + 网格底纹
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── w/[slug]/
│   │   ├── layout.tsx            # AppShell
│   │   ├── page.tsx              # Workspace 详情
│   │   ├── projects/page.tsx
│   │   ├── projects/[pid]/
│   │   │   ├── page.tsx          # Issue 列表
│   │   │   ├── issues/[iid]/page.tsx  # Issue 详情（实际渲染在 drawer 中）
│   │   │   ├── labels/page.tsx
│   │   │   └── members/page.tsx
│   │   ├── settings/page.tsx
│   │   └── members/page.tsx
│   ├── me/page.tsx
│   └── 404/page.tsx
├── components/                   # 通用组件（与设计系统 §4 一一对应）
│   ├── Button.tsx
│   ├── Chip.tsx
│   ├── Card.tsx
│   ├── Input.tsx
│   ├── Avatar.tsx
│   ├── IssueId.tsx
│   ├── PriorityDot.tsx
│   ├── StateDot.tsx
│   ├── Drawer.tsx
│   ├── Modal.tsx
│   ├── Tab.tsx
│   ├── LabelTag.tsx
│   ├── MeasureLine.tsx           # FIG · 01 横线装饰
│   ├── Crosshair.tsx             # 十字标记装饰
│   ├── icons/                    # 自绘 inline SVG（DESIGN §11）
│   │   ├── Search.tsx
│   │   ├── Plus.tsx
│   │   └── ...
│   └── shell/                    # AppShell 子组件
│       ├── TopBar.tsx
│       ├── LeftRail.tsx
│       ├── Aside.tsx
│       ├── Footer.tsx
│       └── AppShell.tsx
├── features/                     # 业务特性
│   ├── auth/
│   │   ├── api.ts                # register/login/logout/me
│   │   ├── hooks.ts              # useMe, useLogin, useRegister
│   │   ├── pages/LoginForm.tsx
│   │   └── pages/RegisterForm.tsx
│   ├── workspace/
│   │   ├── api.ts
│   │   ├── hooks.ts
│   │   └── components/
│   ├── project/
│   ├── issue/
│   │   ├── api.ts
│   │   ├── hooks.ts
│   │   ├── components/
│   │   │   ├── IssueRow.tsx
│   │   │   ├── FilterBar.tsx
│   │   │   ├── IssueDrawer.tsx
│   │   │   ├── EditableField.tsx
│   │   │   ├── CommentComposer.tsx
│   │   │   ├── ActivityTimeline.tsx
│   │   │   └── ...
│   │   └── stores.ts             # 实时更新本地 store
│   ├── comment/
│   ├── activity/
│   └── realtime/
│       ├── ws.ts                 # WebSocket 客户端
│       ├── store.ts              # 连接状态 + 事件分发
│       └── hooks.ts
├── lib/                          # 通用工具
│   ├── api.ts                    # 统一 fetch 包装（带 CSRF、credentials）
│   ├── queryClient.ts            # React Query 配置
│   ├── url.ts                    # URL ↔ filters 双向同步
│   └── format.ts                 # 时间格式化 / 数字格式化
├── stores/                       # Zustand stores
│   ├── ui.ts                     # drawer / modal / toast
│   ├── filters.ts                # 当前筛选状态
│   └── ws.ts                     # WS 连接状态
├── hooks/                        # 通用 hook
│   ├── useFiltersFromUrl.ts
│   ├── useFiltersToUrl.ts
│   └── ...
├── services/                     # （如果需要，外部服务封装，目前没有）
├── types/                        # 类型定义
│   ├── api.ts                    # 与 openapi.yaml 对齐（手维护或 codegen）
│   └── domain.ts
├── tests/
│   ├── unit/                     # Vitest
│   └── e2e/                      # Playwright
├── public/
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── package.json
├── .env.example
└── Dockerfile
```

---

## 1. Sprint 总览

| Sprint | 主题 | 后端交付 | 前端交付 | 联调节点 |
|--------|------|---------|---------|---------|
| 0 | 脚手架 + 设计系统 | （已完成） | Next.js 项目 + AppShell + DESIGN 系统组件 + 404 | 前后端跑通 hello world |
| 1 | Auth | Auth API + Session | /login + /register + /me + AuthStore | 完整登录闭环 |
| 2 | Workspace + Project | WS / Project API | /, /w/:slug, /w/:slug/projects, /w/:slug/members, /w/:slug/settings | 创建 WS / Project / 加成员 |
| 3 | **Issue 核心** | Issue / State / Label API | /w/:slug/projects/:pid + IssueDrawer + IssueRow | 创建 / 列表 / 详情 / 改状态 |
| 4 | Comment + Activity | Comment / Activity API | Drawer 内 Comments + Activity tabs | 评论 / 活动时间线 |
| 5 | Search + Filter + Sort | Issue 列表过滤 API | FilterBar + URL 同步 | 刷新保留筛选 |
| 6 | BulkActionBar + 异步任务 | Bulk API + TaskRun | 批量操作 UI + 任务进度反馈 | 批量改 labels |
| 7 | WebSocket Realtime | Channels + WS API | wsStore + 实时增量更新 + 重连 | A 改 B 自动收到 |
| 8 | Docker + CI + 收尾 | Dockerfile + compose + CI | 前端 Dockerfile + Playwright CI + 文档 | `docker compose up` 全栈启动 |

---

## 2. Sprint 详细计划

### Sprint 0：脚手架 + 设计系统

**目标**：跑通「前端 hello world + 设计系统组件库 + AppShell + 后端 health 200」

**前置**：后端已完成 Sprint 0/8（项目已能 `python manage.py runserver`）

**任务清单**：

- [ ] 初始化 Next.js 14 App Router 项目 + TypeScript strict
- [ ] 安装 Tailwind + 配置 DESIGN.md 附录 A 的 token
- [ ] 集成 Cormorant Garamond + Inter 字体（next/font/google）
- [ ] 写 `globals.css`：CSS variables + 全局网格底纹 + 默认样式
- [ ] 写 AppShell（TopBar + LeftRail + Main + Aside + Footer）骨架
- [ ] 写 404 屏幕
- [ ] 写 `lib/api.ts` 统一 fetch（带 credentials + CSRF）
- [ ] 写 DESIGN 系统基础组件：`Button` / `Chip` / `Card` / `Input` / `Avatar` / `Modal` / `Drawer` / `MeasureLine` / `Crosshair`
- [ ] 自绘 SVG 图标（DESIGN §11 清单）
- [ ] 配置 ESLint + Prettier + tsconfig strict
- [ ] `.env.example` 写好：`NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000` + `NEXT_PUBLIC_WS_BASE=ws://127.0.0.1:8000`
- [ ] 跑通 `/api/v1/health/` 显示 backend status

**学习要点**：Next.js App Router 文件约定；Server vs Client Component；next/font 字体加载优化；CSRF 在浏览器与跨端口请求下的行为。

**验收**：
- [ ] `pnpm dev` 起 Next.js，`pnpm build` 无错
- [ ] 后端 `runserver` 起，前端能拿到 health 200
- [ ] DESIGN 系统组件在 Storybook 或单独 demo 页跑通
- [ ] ESLint + Prettier + `tsc --noEmit` 零错误

**联调节点**：把 demo 页面给后端同学看，确认设计语言一致。

### Sprint 1：Auth（与后端 Sprint 1 并行）

**前置**：后端 Contract `docs/api/01-auth.md` 冻结

**任务清单**：
- [ ] `features/auth/api.ts`：`csrf()` / `register()` / `login()` / `logout()` / `me()`
- [ ] `features/auth/hooks.ts`：`useMe()` / `useLogin()` / `useRegister()` / `useLogout()`
- [ ] `stores/auth.ts`：Zustand 存当前用户
- [ ] `<AuthGuard>`：未登录访问受保护页 → push `/login?redirect=...`
- [ ] `/login` 屏幕（DESIGN + 蓝图）
- [ ] `/register` 屏幕
- [ ] `/me` 个人设置屏幕（基础版，编辑 username/email）
- [ ] `<TopBar.AvatarMenu>`：登出下拉
- [ ] `react-hook-form + zod` 接入 login/register 表单
- [ ] 错误分流：400 字段级 / 401 跳登录 / 429 banner

**测试**（Vitest + Playwright）：
- [ ] unit: api 包装在 403 时自动重取 csrf 再发
- [ ] unit: `useMe` 在 401 时清空 store
- [ ] e2e: register → 自动登录 → 显示用户名 → logout → me 401 → 重定向 login

**验收**：
- [ ] 完整跑通协作总计划 §11 联调验收清单
- [ ] 后端 curl 流走通的，前端 e2e 也走通
- [ ] cookie + CSRF 一次配通（不需要第二次重试）

**联调**：后端 Sprint 1 收尾时跑 register → login → /me → logout 端到端。

### Sprint 2：Workspace + Project（与后端 Sprint 2 并行）

**前置**：Contract `02-workspaces.md` / `03-projects.md` 冻结

**任务清单**：
- [ ] `features/workspace/api.ts` + `features/project/api.ts`
- [ ] `stores/ui.ts`：create-workspace modal / create-project modal 显隐
- [ ] `/` Workspace Dashboard
- [ ] `/w/:slug` Workspace 详情（Recent + Members strip + Actions）
- [ ] `/w/:slug/projects` Project 完整列表
- [ ] `/w/:slug/projects/new` modal
- [ ] `/w/:slug/members` 成员列表 + add（按 email）+ 改 role + 删
- [ ] `/w/:slug/settings` 改 name / slug / 删 workspace（danger zone）
- [ ] `<ProjectCard>` + `<WorkspaceCard>`
- [ ] `<RoleBadge>` 组件（20/15/5）
- [ ] 按 `current_role` 控制 Actions 显隐（WS Admin 才显示 settings/manage members）

**验收**：
- [ ] A / B 两个账号演示：A 创建 WS → B 不在 WS1（404） → 加 B 为 MEMBER → B 加入后可见
- [ ] 删除 workspace 二次确认（输入 slug 才能确认）
- [ ] role chip 显示准确

### Sprint 3：Issue 核心（与后端 Sprint 3 并行）

> 这是 MVP 最重要的 Sprint。

**前置**：Contract `04-issues.md` 冻结

**任务清单**：
- [ ] `features/issue/api.ts`：list / create / patch / delete + states / labels / members
- [ ] `stores/filters.ts`：state / priority / labels / assignee / search / ordering
- [ ] `lib/url.ts`：`useFiltersFromUrl()` + `useFiltersToUrl()`
- [ ] `/w/:slug/projects/:pid` Issue 列表（核心页）
  - ProjectHeader + MeasureLine + FilterBar + IssueList + Pagination
- [ ] `<IssueRow>`：AMI-N + PriorityDot + StateDot + LabelTag + Assignee + UpdatedAt
- [ ] `<Drawer>` `<IssueDrawer>`：详情
- [ ] `<EditableTitle>` / `<EditableField>`（state / priority / assignee / labels）
- [ ] `<DescriptionBlock>`（Markdown 渲染 + 编辑模式）
- [ ] 创建 Issue drawer
- [ ] Issue 删除（二次确认）
- [ ] `useIssueDrawer()` 控制 drawer 路由：`?drawer=issue:uuid`

**测试**：
- [ ] unit: `EditableField` 乐观更新 + PATCH 失败回滚
- [ ] unit: URL ↔ filter 双向同步
- [ ] e2e: 创建 → 列表出现 → 点开 → 改 state → 列表 + 详情同步更新 → 刷新保留

**验收**：
- [ ] IssueRow 完整渲染所有字段
- [ ] 5 个默认 state 创建后立即可查（不调额外接口）
- [ ] assignee 候选列表用 `/projects/{pid}/members/`（不用 workspace 成员）
- [ ] URL 变化能恢复 filter 状态
- [ ] 401/403/404 三种错误分流正确

**联调**：A / B 账号演示所有路径。

### Sprint 4：Comment + Activity（与后端 Sprint 4 并行）

**前置**：Contract `05-comments.md` / `06-activities.md` 冻结（含文案映射表）

**任务清单**：
- [ ] `features/comment/api.ts` + `features/activity/api.ts`
- [ ] Issue drawer 内：
  - `<TabBar>`（Activity / Comments / Refs）
  - `<ActivityTimeline>`（倒序 · 复用 §6 文案映射表）
  - `<CommentList>`（正序 · 含编辑/删除按钮）
  - `<CommentComposer>`（textarea + post）
- [ ] 评论编辑（作者或 Admin 才能看 edit/delete 按钮）
- [ ] 评论删除二次确认
- [ ] `<EditableComment>` inline 编辑

**测试**：
- [ ] unit: 文案映射表覆盖所有 entity_type × action
- [ ] e2e: 创建评论 → 活动流出现 → 编辑评论 → 时间线不增加条目

**验收**：
- [ ] 时间线文案符合 §6 文案映射表
- [ ] 作者编辑评论不产生活动记录（与后端契约一致）
- [ ] comments tab 切换不影响其他 tab 数据

### Sprint 5：Search + Filter + Sort + URL 同步

**前置**：Contract `04-issues.md` 查询参数部分冻结

**任务清单**：
- [ ] `<FilterBar>` 完整版：state 多选 / priority 多选 / assignee（含 me）/ labels 多选 / search / ordering
- [ ] URL 双向同步（issue list 与 filter state）
- [ ] filter chip 立即触发（无 Apply 按钮）
- [ ] sort dropdown 触发
- [ ] search 250ms debounce
- [ ] 排序选项严格使用后端白名单
- [ ] 非法参数后端返回 400 → 字段级提示

**测试**：
- [ ] unit: URL → filter 解析（含 `me` 关键字、多值逗号）
- [ ] unit: filter → URL 序列化（移除空值、保留合法值）
- [ ] e2e: 应用 filter → 复制 URL → 新窗口打开 → filter 一致

**验收**：
- [ ] URL 同步 100ms 内完成
- [ ] 非法参数不报错在前端（默默忽略或展示字段错误）
- [ ] 5000 条数据下列表流畅（首屏渲染 < 500ms）

### Sprint 6：BulkActionBar + 异步任务

**前置**：Contract `07-cache-and-tasks.md` 冻结

**任务清单**：
- [ ] IssueRow 多选 checkbox
- [ ] `<BulkActionBar>`（浮出）：改 state / 改 priority / 改 labels / 改 assignee / 删
- [ ] 批量操作调用 `POST …/issues/bulk/labels/`（202）
- [ ] `<TaskProgress>` 组件（轮询 `/tasks/{task_id}/`，建议 1s 间隔，最多 30 次）
- [ ] 任务完成 / 失败 toast
- [ ] 任务完成的 issue 自动收到 `issue.updated` 推送（已建好 wsStore）

**测试**：
- [ ] unit: TaskRun 轮询直到 success/failure，30 次后超时
- [ ] e2e: 多选 3 个 issue → 批量加 bug label → 列表 + 详情都更新

**验收**：
- [ ] 批量操作不阻塞 UI（乐观更新本地 state）
- [ ] 任务失败有清晰提示 + 重试入口

### Sprint 7：WebSocket Realtime

**前置**：Contract `08-realtime.md` 冻结

**任务清单**：
- [ ] `features/realtime/ws.ts`：自动重连（指数退避）
- [ ] `stores/ws.ts`：连接状态 + 事件分发
- [ ] `<ConnectionStatus>` 组件（TopBar 右上）
- [ ] 进入 `/w/:slug/projects/:pid` 时建连，离开时断
- [ ] `issue.updated` 事件 → 更新 issue store + 追加 activity
- [ ] `comment.created` 事件 → 追加到 CommentList + 自动滚动
- [ ] 重连后全量刷新当前列表兜底
- [ ] 4401 → push `/login`；4404 → 提示不自动重连

**测试**：
- [ ] unit: wsStore 处理所有事件类型 + close code
- [ ] e2e: 两个 browser context，A 改 issue，B 自动收到推送更新

**验收**：
- [ ] A 改状态 → B 列表 < 1s 内更新
- [ ] B 断网 30s → 恢复 → 自动重连 + 全量刷新
- [ ] 4401 触发时跳登录不报错

### Sprint 8：Docker + CI + 收尾

**前置**：所有 Sprint 已合并

**任务清单**：
- [ ] 前端 Dockerfile（多阶段：deps → builder → runner）
- [ ] `docker-compose.yml` 加入 frontend 服务
- [ ] GitHub Actions：frontend job（lint → typecheck → test → build → e2e）
- [ ] Playwright CI（headless）
- [ ] README 前端章节
- [ ] ARCHITECTURE.md 前端部分（请求链路图）
- [ ] v0.1.0 tag + GitHub Release notes
- [ ] Lighthouse 评分 ≥ 90（性能 / 可访问性 / 最佳实践）

**验收**：
- [ ] `docker compose up` 全栈启动
- [ ] CI 拦截不合格 PR
- [ ] README / API.md / ARCHITECTURE.md 三问可答

---

## 3. 通用 Definition of Done（每个 Sprint 末尾逐条勾）

- [ ] 该 Sprint 涉及的所有屏幕按 SCREEN_BLUEPRINTS 实现
- [ ] DESIGN.md 的所有规则遵守（颜色 / 字体 / 间距 / 圆角 / 动效）
- [ ] 涉及的组件已在 `components/` 或 `features/` 提取，不在页面文件里堆
- [ ] 涉及的 API endpoint 已在 `features/<module>/api.ts` 封装，**不**在组件里直接 fetch
- [ ] URL ↔ 状态同步已实现（filters / drawer / page）
- [ ] Loading / Empty / Error 三态齐全
- [ ] 401 / 403 / 404 三种错误正确分流
- [ ] CSRF 自动重试机制工作
- [ ] WebSocket 连接断开 / 重连有 UI 提示
- [ ] ESLint + Prettier + `tsc --noEmit` 零错误
- [ ] 单元测试覆盖核心业务逻辑（> 70%）
- [ ] 关键路径 e2e 测试通过（登录、创建 Project、创建 Issue、改状态）
- [ ] PR 描述按协作总计划 §21 模板填写
- [ ] 后端同学已 Review，Review 意见全部闭环
- [ ] 能脱离 AI 讲清楚本 Sprint 每一段代码为什么存在（协作总计划 §23 标准）

---

## 4. 学习路径

按 Sprint 推进，不按"学完再做"：

| Sprint | 推荐学习材料 |
|--------|------------|
| 0 | Next.js 官方 tutorial（App Router 部分） · Cormorant Garamond / Inter 字体介绍 |
| 1 | DRF Session 认证原理 · CSRF 攻击与防御 |
| 2 | ForeignKey / ManyToMany 在前端如何用 select / multi-select |
| 3 | Optimistic Update · React Query 的 useMutation + onMutate |
| 4 | Audit Trail 设计 · 时间线 UX |
| 5 | URL 状态管理 · useSearchParams + pushState |
| 6 | Celery / 异步任务 UX · 进度条 / toast / 轮询 |
| 7 | WebSocket 协议 · Reconnect 模式 · view transitions API |
| 8 | Docker 多阶段构建 · CI 优化 |

---

## 5. 与后端协作节奏

| 时点 | 必做 |
|------|------|
| **Sprint 开始前** | 后端 Contract 冻结 → 前端按 Contract 实现 mock，先不依赖真后端 |
| **Sprint 中期** | 后端 push Contract 变化 → 前端同步更新（PR 描述标注 Contract 变更） |
| **Sprint 末尾** | 联调：跑通协作总计划 §28「合并前」三个问题清单 |
| **Sprint 合并后** | 双人共同写 devlog（前端一份 + 后端一份），包含本次 Sprint 决策、踩坑、改进点 |

---

## 6. 评审清单（后端 Review 前端代码时重点）

按 BACKEND_PLAN §2.4：

- [ ] API Contract 是否一致（endpoint、字段、状态码）
- [ ] 错误分支是否正确处理（400 字段级 / 401 / 403 / 404）
- [ ] 是否发了多余的重复请求
- [ ] Loading / Empty / Error 三态齐全
- [ ] 字段命名与文档是否一致（snake_case vs camelCase）
- [ ] WebSocket 重连策略是否合理
- [ ] URL 同步是否正确（避免状态漂移）
- [ ] CSRF 重试是否生效（不会被 403 卡死）