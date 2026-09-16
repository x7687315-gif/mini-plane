# SCREEN_BLUEPRINTS.md — Mini Plane 屏幕蓝图

> 与 [DESIGN.md](./DESIGN.md) 配套；路由、组件清单、数据源（API endpoint）的唯一来源。
> 状态：v0.1 — 初稿；后续每个 Sprint 收尾会更新本文件
> 数据契约全部来自 [../docs/api/](../docs/api/)；不再重复 endpoint 字段定义

---

## 0. 路由总览

| Path | 屏幕 | 权限 | 主要数据 |
|------|------|------|---------|
| `/login` | 登录 | 匿名 | — |
| `/register` | 注册 | 匿名 | — |
| `/` | Workspace Dashboard（默认页） | 已认证 | `GET /workspaces/` |
| `/w/:slug` | Workspace 详情 | WS 成员 | `GET /workspaces/{slug}/` |
| `/w/:slug/projects` | Project 列表 | WS 成员 | `GET /workspaces/{slug}/projects/` |
| `/w/:slug/projects/new` | 新建 Project（modal） | WS MEMBER+ | `POST /workspaces/{slug}/projects/` |
| `/w/:slug/projects/:pid` | **Project 主页（Issue 列表）** | 项目成员 | `GET /projects/{pid}/issues/` + states + labels + members |
| `/w/:slug/projects/:pid/issues/new` | 新建 Issue（drawer） | 项目 MEMBER+ | `POST /projects/{pid}/issues/` |
| `/w/:slug/projects/:pid/issues/:iid` | Issue 详情（drawer / 路由） | 项目成员 | `GET /issues/{iid}/` + comments + activities |
| `/w/:slug/projects/:pid/labels` | Label 管理 | 项目 MEMBER+ | `GET/POST /projects/{pid}/labels/` |
| `/w/:slug/projects/:pid/members` | Project 成员 | WS 成员 | `GET /projects/{pid}/members/` |
| `/w/:slug/settings` | Workspace 设置 | WS Admin | `GET/PATCH /workspaces/{slug}/` |
| `/w/:slug/members` | Workspace 成员 | WS 成员 | `GET /workspaces/{slug}/members/` |
| `/me` | 个人设置 | 已认证 | `GET /auth/me/` |
| `/404` | 资源不存在 | 任何 | — |

> 抽屉（drawer）以路由形式实现：`/issues/:iid` 实际上是 `/{...path}?drawer=issue:iid`。点击 Issue 行 push 路由、关 drawer 仅删除 query 参数，**不重渲染列表**（参考参考图「从左往右滑入」）。

---

## 1. 公共布局（Layout Shell）

所有已认证页面共用一个 `AppShell`：

```
┌─────────────────────────────────────────────────────────────┐
│ TopBar · 56px                                               │
├──────┬───────────────────────────────────────────┬──────────┤
│      │                                           │          │
│      │                                           │          │
│      │ Main                                      │ Aside    │
│      │ flex 1                                    │ 168px    │
│      │                                           │          │
├──────┴───────────────────────────────────────────┴──────────┤
│ Footer · 28px                                               │
└─────────────────────────────────────────────────────────────┘
```

### 1.1 TopBar 组件清单

- `TopBarLogo`（左侧 · 装饰用 · Cormorant italic + 「mini · sheet N/12」）
- `Breadcrumb`（当前路径，e.g. `Amiya Workspace · Amiya Project · Issues`）
- `WSRoleBadge`（当前用户在当前 workspace 的角色 chip · 仅 Admin 显示）
- `AvatarMenu`（当前用户头像 + 下拉：My settings / Theme / Sign out）
- `ConnectionStatus`（WS 连接状态小点 · 1px 直径 · 灰/蓝/红三色）
- `SearchHotkeyHint`（右下角小字 `⌘K`）

### 1.2 LeftRail 组件清单

- `WorkspaceSwitcher`（点击展开抽屉 · 列表所有 membership）
- `WorkspaceAvatar`（单条 workspace · 96px 缩略字母 + 角标 role）
- `RailCrosshair`（底部装饰 · 18×18 十字标记 + label）
- `NavSection`（保留位：未来增加 Dashboard / Inbox / Cycles）

### 1.3 Aside 组件清单（仅 desktop & wide 显示）

- `ThroughputCard`（7d 关闭数 · 28px Cormorant italic）
- `CycleTimeCard`（cycle time · 同上）
- `ActivityLedger`（4 条最近事件）
- `CoordReadout`（装饰：`WS / PROJ · SHEET 03/12 · DRIFT 0.0`）

### 1.4 Footer 组件清单

- 左：`N · 31° 14′ · W · 121° 28′`（装饰坐标）
- 中：`covenant · between user and system`
- 右：`REV · 0.1 · DRIFT 0.0`

---

## 2. 屏幕蓝图

### 2.1 `/login`（登录）

**目的**：注册用户登录

**布局**：居中卡片（不是「全屏背景」），宽 `min(420px, 90vw)`，垂直居中

```
┌─────────────────────────────────────────────┐
│ Logo "P" (120px Cormorant italic)           │
│                                             │
│ Sign in                                     │
│ Welcome back · please identify yourself    │
│ ─────────────────────────────────────────── │
│ [username ................................] │
│ [password ................................] │
│                                             │
│ [ sign in → ]                               │
│                                             │
│ No account? Register →                      │
│ ─────────────────────────────────────────── │
│ N · 31° 14′ · W · 121° 28′ · covenant · 0.1 │
└─────────────────────────────────────────────┘
```

**组件清单**：
- `Logo`
- `SignInForm`（`<Form>` 内含 `Input` × 2 + `Button`）
- `InlineError`（字段下方 · 红色 11px · 字段级错误从后端直接展示）
- `RateLimitBanner`（429 时显示）

**数据源**：
- 提交：`POST /api/v1/auth/login/`
- 错误处理：401（其实是 400 + 中文「用户名或密码错误」）→ 字段下方；429 → 顶部 banner；其他 → 全局错误

**状态**：
- `default` / `submitting`（按钮 disabled + 「signing…」）/ `error`（按错误类型）
- **没有**空状态、loading 状态（首次进入直接表单）

**特殊**：
- 登录前 `GET /api/v1/auth/csrf/` 种 cookie（页面 mount 时调一次）
- 成功后 push `?redirect=` 参数或 fallback 到 `/`
- 注册成功后已自动登录，不跳这里

### 2.2 `/register`（注册）

**布局**：与 `/login` 几乎一致，多一个 email 字段

**组件清单**：同 `/login`，多一个 `Input`（email）

**数据源**：
- 提交：`POST /api/v1/auth/register/`
- **注册即登录**（201 后服务端种 session，前端不用再调 login）

**字段级错误文案**（Django 校验）：
- 用户名已存在 / email 已存在 / 弱密码（≥ 8 位、非常见、不全数字）—— 直接展示后端文案

### 2.3 `/`（Workspace Dashboard）

**目的**：列出当前用户的所有 workspace；选一个进入

**布局**：无 TopBar / LeftRail 时显示居中大屏；否则作为 AppShell 的 Main 内容

```
┌──────────────────────────────────────────────────────┐
│ Workspaces                                           │
│ A list of every place you keep work · 03 sheets      │
│ ────────────────────────────────────────────────────│
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ A            │  │ K            │  │ R           │ │
│  │ Amiya ws     │  │ Kal'tsit ws  │  │ Rhodes ws   │ │
│  │ 3 projects   │  │ 1 project    │  │ 7 projects  │ │
│  │ ADMIN · 20   │  │ MEMBER · 15  │  │ VIEWER · 5  │ │
│  └──────────────┘  └──────────────┘  └─────────────┘ │
│                                                      │
│ [+ new workspace]                                    │
└──────────────────────────────────────────────────────┘
```

**组件清单**：
- `PageHeader`（`Workspaces` title + 副标）
- `MeasureLine`（`FIG · 01` + 装饰横线）
- `WorkspaceCard` × N（96×96 Cormorant italic 大写 + 名字 + 项目数 + role chip）
- `EmptyState`（无 workspace 时：「No workspace yet · Create your first」）

**数据源**：
- 列表：`GET /api/v1/workspaces/`
- 创建：`POST /api/v1/workspaces/`（在 workspace 卡片旁的 + 按钮触发 modal）

**交互**：
- 点击卡片 → push `/w/{slug}`
- 卡片 hover：左边出现 accent 色 1px bar

### 2.4 `/w/:slug`（Workspace 详情）

**目的**：workspace 概览 + 项目网格

**布局**：与 Dashboard 类似但 title 是 workspace 名

```
┌──────────────────────────────────────────────────────┐
│ Amiya Workspace                                      │
│ You are ADMIN · 3 projects · 5 members                │
│ ────────────────────────────────────────────────────│
│ Recent projects                                      │
│  ┌─────────────────┐  ┌─────────────────┐           │
│  │ AMI             │  │ ARD             │           │
│  │ Amiya Project   │  │ Aramis Project  │           │
│  │ 128 issues      │  │ 64 issues       │           │
│  └─────────────────┘  └─────────────────┘           │
│                                                      │
│ Members · 5                                          │
│  [avatar] [avatar] [avatar] [avatar] [avatar]        │
│                                                      │
│ [+ new project]    [settings]    [manage members]    │
└──────────────────────────────────────────────────────┘
```

**组件清单**：
- `WSHeader`（workspace 名 + role badge + 副标）
- `RecentProjectsGrid`（ProjectCard × N）
- `MembersStrip`（avatar 列表）
- `ActionsRow`（按钮组 · 按 current_role 控制显隐）
- `EmptyState`（无项目时）

**数据源**：
- `GET /workspaces/{slug}/`（含 current_role）
- `GET /workspaces/{slug}/projects/?per_page=6`
- `GET /workspaces/{slug}/members/?per_page=10`

**交互**：
- `+ new project`：WS MEMBER+ 才显示，点击 push `/w/:slug/projects/new`（modal）
- `settings`：WS Admin 才显示，push `/w/:slug/settings`
- `manage members`：WS Admin 才显示，push `/w/:slug/members`

### 2.5 `/w/:slug/projects`（Project 列表完整页）

**目的**：workspace 内全部项目列表（Dashboard 只列 6 个）

**布局**：表格化的项目列表

```
┌──────────────────────────────────────────────────────┐
│ Projects in Amiya Workspace                          │
│ All sheets · 3 projects · sortable                  │
│ ────────────────────────────────────────────────────│
│ Identifier  Name              Issues   Role    …    │
│ AMI         Amiya Project     128      ADMIN         │
│ ARD         Aramis Project    64       MEMBER        │
│ RMD         Rhodes Med        32       VIEWER        │
└──────────────────────────────────────────────────────┘
```

**组件清单**：
- `ProjectsTable`（表格 + 列：identifier / name / issues / role）
- `RoleCell`（基于 current_user_role 显示 chip）
- `Pagination`

**数据源**：
- `GET /workspaces/{slug}/projects/?page=N`

### 2.6 `/w/:slug/projects/new`（新建 Project，Modal）

**目的**：WS MEMBER+ 创建项目

**布局**：Modal（不跳路由），宽 `min(480px, 90vw)`

```
┌─────────────────────────────────────────────┐
│ New project                       ×          │
│ ───────────────────────────────────────────  │
│ Sheet for work, not for show                │
│                                             │
│ Name *                                      │
│ [Amiya Project ..........................] │
│                                             │
│ Identifier * (2-5 uppercase letters)        │
│ [AMI ............................]          │
│                                             │
│ Description                                 │
│ [multiline textarea ......................] │
│                                             │
│             [ cancel ]   [ create → ]       │
└─────────────────────────────────────────────┘
```

**组件清单**：
- `Modal`（焦点陷阱 + Esc 关闭 + 点击遮罩关闭）
- `Form`（`Input` × 2 + `Textarea` × 1）
- `InlineError`（identifier 冲突时显示「该工作区内已存在 AMI」）

**数据源**：
- 提交：`POST /workspaces/{slug}/projects/`
- 201 后 modal 关闭 + push `/w/:slug/projects/{newId}`

**字段级错误**（来自后端）：
- `identifier`：必须 `^[A-Z][A-Z0-9]{1,4}$` 且 workspace 内唯一
- `name`：必填
- 描述：可空

### 2.7 `/w/:slug/projects/:pid`（**核心页**：Project 主页 / Issue 列表）

**目的**：展示项目内全部 Issue，支持筛选 / 排序 / 搜索 / 批量操作 / 实时更新

**布局**：AppShell 内 Main 是 Issue 列表，Aside 显示项目统计

```
┌──────────────────────────────────────────────────────────┐
│ Amiya Project · AMI · 128 issues                          │
│ 3 members · ADMIN · 5 states · 7 labels                  │
│ ──────────────────────────────────────────────────────── │
│ [All 128] [Backlog 42] [Todo 31] [In Progress 18] [Done 29] [Cancelled 08] │
│ [+ filter] [+ sort] [search box]                  [+ new issue] │
│ ──────────────────────────────────────────────────────── │
│ AMI-07  登录页验证码不显示      bug  ■urgent  A  12:30   │
│ AMI-06  重构 Auth CSRF 自愈    tech  ■medium  K  yest    │
│ AMI-05  设计侧拉 wireframe     des   □none   —  3d       │
│ AMI-04  补 EXPLAIN 报告         docs  ■low    R  5d       │
│ AMI-03  WS 心跳超时测试         bug   ■high   K  1w       │
│ ──────────────────────────────────────────────────────── │
│ Showing 5 of 128                       Page 1/3  ‹ ›    │
└──────────────────────────────────────────────────────────┘
```

**Aside 区域**：
- `ProjectStats`（throughput 7d / cycle time / open count）
- `StateBreakdown`（5 个状态 + 计数）
- `MemberStrip`（项目成员头像）
- `RealtimeIndicator`（WebSocket 连接状态 + 最近推送时间）

**组件清单**：
- `ProjectHeader`（name + identifier + 副标 + role chip）
- `FilterBar`
  - `StateChipRow`（6 个 chip：All + 5 态；来自 `GET /projects/{pid}/states/`）
  - `FilterDropdown`（priority / labels / assignee 多选）
  - `SortMenu`（created_at / -created_at / sequence_id / -sequence_id / priority / -priority）
  - `SearchInput`（icontains title/description）
- `IssueList`
  - `IssueRow` × N（包含 `IssueId` + `PriorityDot` + `StateDot` + `LabelTag` + `Assignee` + `UpdatedAt`）
  - `Pagination`（page · per_page · showing N of M）
- `NewIssueButton`（项目 MEMBER+ 才显示）
- `BulkActionBar`（多选后浮出：改 state / 改 priority / 改 labels / 改 assignee / 删除）
- `EmptyState`（无 issue 时）

**数据源**（首屏加载序列）：
1. `GET /workspaces/{slug}/`（拿 role）
2. `GET /workspaces/{slug}/projects/{pid}/`（拿 project，含 current_user_role）
3. `GET /projects/{pid}/states/`（5 态只读）
4. `GET /projects/{pid}/labels/`（筛选器用）
5. `GET /projects/{pid}/members/`（assignee 候选）
6. `GET /projects/{pid}/issues/?ordering=-created_at&page=1&per_page=50`（主列表）
7. 建立 WS 连接（见 §4）

**交互**：
- 点击 IssueRow → 打开 drawer（push `?drawer=issue:{iid}`）
- 双击 IssueRow 任意位置 = 进入 inline 编辑（仅 title 可行；其他进 drawer）
- FilterChip 点击 = 立即触发查询（无需「Apply」按钮）
- 排序切换 = 立即触发
- 搜索框 debounce 250ms
- 所有列表参数与 URL 双向同步（刷新保留筛选）

**URL 状态**：
```
/w/amiya/projects/{pid}?
  state=uuid1,uuid2&
  priority=high,urgent&
  assignee=me&
  labels=uuid1&
  search=bug&
  ordering=-priority&
  page=2&
  per_page=50&
  drawer=issue:uuid
```

### 2.8 `/w/:slug/projects/:pid/issues/new`（新建 Issue，Drawer）

**目的**：项目 MEMBER+ 创建 Issue

**布局**：从右侧滑入的 drawer，宽 `min(480px, 90vw)`

```
┌─────────────────────────────────────────────┐
│ New issue                            ×      │
│ ───────────────────────────────────────────  │
│ Title *                                     │
│ [______________________________________]    │
│                                             │
│ State      Priority  Labels                   │
│ [Backlog ▾] [None ▾] [+ add]               │
│                                             │
│ Assignee                                   │
│ [Unassigned ▾]                              │
│                                             │
│ Description                                │
│ [multiline textarea ......................]│
│                                             │
│             [ cancel ]   [ create → ]       │
└─────────────────────────────────────────────┘
```

**组件清单**：
- `Drawer`
- `Form`（title input + 4 个 select/multi-select + textarea）
- `InlineError`（字段级）
- `MemberPicker`（候选来源：`/projects/{pid}/members/`，**不**用 workspace 成员列表）

**数据源**：
- 提交：`POST /projects/{pid}/issues/`
- 201 → 关闭 drawer + 自动打开新 issue 的详情 drawer（push `?drawer=issue:{newId}`）
- 失败：drawer 内联错误，**不**关闭

**字段级错误**：
- title 必填
- state_id 必须属于该项目
- assignee_id 必须为项目成员（不报错为空）
- label_ids 必须属于该项目（最多 50 个）

### 2.9 `/w/:slug/projects/:pid/issues/:iid`（Issue 详情，Drawer）

**目的**：展示 Issue 完整信息，支持编辑 / 评论 / 查看活动

**布局**：从右滑入 drawer，宽 `min(640px, 90vw)`，覆盖列表上方

```
┌─────────────────────────────────────────────┐
│ AMI / WORK ITEM · AMI-07 · OPENED IN DRAWER × │
│ ───────────────────────────────────────────  │
│ AMI-07                                       │
│ 登录页验证码不显示                          │
│                                              │
│ State   Priority  Assignee  Labels           │
│ Backlog ■ urgent  A       ● bug             │
│                                              │
│ Description                                  │
│ 复现 Chrome 125 ...                         │
│                                              │
│ [Activity 06] [Comments 02] [Refs]           │
│ ───────────────────────────────────────────  │
│ 12:30  Amiya  将 状态 从 Todo 改回 Backlog   │
│ 12:18  Kal'tsit 评论了任务  → Comments       │
│ 11:54  Amiya  将 状态 从 Backlog 改为 Todo   │
│ ...                                          │
│ ───────────────────────────────────────────  │
│ [avatar A] [leave a note ...     ] [post ↗] │
└─────────────────────────────────────────────┘
```

**组件清单**：
- `Drawer`（与新建共用外壳）
- `EditableField` × 4
  - State：下拉（值变化立即 PATCH）
  - Priority：5 选 1（值变化立即 PATCH）
  - Assignee：MemberPicker（清空 = null）
  - Labels：MultiSelect（清空 = []）
- `EditableTitle`（点击 → 文本框 → blur 提交）
- `DescriptionBlock`（Markdown 渲染 + 编辑模式）
- `TabBar`（Activity / Comments / Refs）
- `ActivityTimeline`（倒序 + 时间戳 + 字段 pill）
- `CommentList`（正序 · 包含编辑/删除按钮）
- `CommentComposer`（textarea + post 按钮）

**数据源**：
- 详情：`GET /issues/{iid}/`
- 评论：`GET /issues/{iid}/comments/`
- 活动：`GET /issues/{iid}/activities/`
- 修改：`PATCH /issues/{iid}/`（所有字段改动都用这个）
- 评论：`POST/PATCH/DELETE /comments/`
- WS：`issue.updated` 与 `comment.created` 推送后增量更新（patch 本地 store）

**实时更新**：
- `issue.updated`：比对 payload 中的 old/new，更新本地 issue；ActivityTimeline 自动追加一条
- `comment.created`：直接追加到 CommentList（payload 含 content）

**交互细节**：
- Title 失焦或按 Cmd+Enter 提交
- State / Priority 改动**乐观更新**（PATCH 失败回滚 + 提示）
- Comments 编辑只能作者 + Admin（按钮按 `current_role` + `comment.author.id === me.id` 控制）
- Drawer 关闭：× 按钮 / Esc / 点击遮罩（如有未发送评论会二次确认）
- Drawer 关闭 = `router.push({ pathname, query: rest })`，移除 `drawer` 参数

### 2.10 `/w/:slug/projects/:pid/labels`（Label 管理）

**目的**：管理 label 列表 + 增删改

**布局**：Main 列是表格（与 Project 列表类似），右侧 Aside 展示标签云

```
┌──────────────────────────────────────────────┐
│ Labels in Amiya Project                      │
│ 7 labels · create · delete · rename          │
│ ──────────────────────────────────────────── │
│ ● bug        #dc2626   12 issues   [edit][×] │
│ ● tech-debt  #f59e0b   5 issues    [edit][×] │
│ ● design     #3b82f6   3 issues    [edit][×] │
│ ...                                          │
│                                              │
│ [+ new label]                                │
└──────────────────────────────────────────────┘
```

**组件清单**：
- `LabelsTable`
- `NewLabelButton`（inline 展开表单：name + color picker）
- `EditLabelRow`（inline 编辑）
- `DeleteLabelButton`（带确认 modal）
- `LabelCloud`（Aside · 按颜色聚合 · 大小按 issue 数）

**数据源**：
- 列表：`GET /projects/{pid}/labels/`
- 创建：`POST /projects/{pid}/labels/`
- 改：`PATCH /labels/{lid}/`
- 删：`DELETE /labels/{lid}/`（**已挂该 label 的 issue 不受影响**——契约明确）

### 2.11 `/w/:slug/projects/:pid/members`（Project 成员）

**布局**：表格

```
┌──────────────────────────────────────────────┐
│ Members in Amiya Project                     │
│ 3 members · 1 admin · 1 member · 1 viewer   │
│ ──────────────────────────────────────────── │
│ Avatar  Name         WS Role  Proj Role  …   │
│ [A]     Amiya        ADMIN    ADMIN     [×]  │
│ [K]     Kal'tsit     MEMBER   MEMBER    [×]  │
│ [R]     Rhodes       VIEWER   VIEWER    [×]  │
│                                              │
│ [+ add from workspace]                       │
└──────────────────────────────────────────────┘
```

**组件清单**：与 Workspace 成员页几乎一致；加成员时只能从 workspace 成员中选

**数据源**：
- 列表：`GET /projects/{pid}/members/`
- 加：`POST /projects/{pid}/members/`
- 改：`PATCH /members/{mid}/`
- 删：`DELETE /members/{mid}/`（最后一位 admin 不可删）

### 2.12 `/w/:slug/settings`（Workspace 设置）

**布局**：纵向表单

```
┌──────────────────────────────────────────────┐
│ Workspace settings                           │
│ ──────────────────────────────────────────── │
│ Name *                                       │
│ [Amiya Workspace .........................]  │
│                                              │
│ Slug                                         │
│ [amiya-ws ............................]      │
│ ⚠ Slug 改了会改变所有 URL；不可撤销           │
│                                              │
│ Owner  Amiya (you, last admin)               │
│                                              │
│ [ save changes ]   [delete this workspace]   │
└──────────────────────────────────────────────┘
```

**组件清单**：
- `SettingForm`（name + slug）
- `DangerZone`（删除 workspace · 二次确认 modal · 要求输入 workspace slug）

**数据源**：
- `GET/PATCH /workspaces/{slug}/`
- `DELETE /workspaces/{slug}/`

### 2.13 `/w/:slug/members`（Workspace 成员）

**布局**：与 Project 成员类似

**数据源**：
- 列表：`GET /workspaces/{slug}/members/`
- 加：`POST /workspaces/{slug}/members/`（按 email）
- 改：`PATCH /members/{mid}/`
- 删：`DELETE /members/{mid}/`（owner 与最后一个 admin 不可删）

### 2.14 `/me`（个人设置）

**布局**：简单表单 + 登出按钮

```
┌──────────────────────────────────────────────┐
│ My settings                                  │
│ ──────────────────────────────────────────── │
│ Avatar    [initial A]  (upload not yet)      │
│ Username  Amiya (read-only)                  │
│ Email     amiya@example.com                  │
│                                              │
│ [ save changes ]   [sign out]                │
└──────────────────────────────────────────────┘
```

**数据源**：
- `GET /auth/me/`
- `POST /auth/logout/`

### 2.15 `/404`

**布局**：极简单页（不用 AppShell）

```
┌──────────────────────────────────────────────┐
│                                              │
│                                              │
│         FIG · EMPTY ·                        │
│         Resource not found                   │
│                                              │
│         The sheet you asked for              │
│         is not in this archive               │
│                                              │
│         [ back to dashboard → ]              │
│                                              │
└──────────────────────────────────────────────┘
```

---

## 3. 路由切换动画

参考参考图「从左往右滑入」的暗示，我们用 **路由切换横向滑动**：

| 方向 | 触发 | 动画 |
|------|------|------|
| 进入更深层级 | push 到子路由 | 新页面从右滑入 + 透明度 0→1，**当前页面留在原位**（不滑出） |
| 返回上一层 | pop | 当前页面从右滑出 + 透明度 1→0 |
| 平行切换 | 切 workspace/project | 横切 cross-fade（200ms） |

Drawer 与路由切换是 **同一套动画** 的不同表现：
- Drawer 打开：`?drawer=issue:uuid` → drawer 从右滑入
- Drawer 关闭：移除 query 参数 → drawer 从右滑出

实现：Next.js App Router + `framer-motion` 的 `<AnimatePresence>` + view transitions API（实验性，备选）。

---

## 4. WebSocket 实时更新接入

**何时建连**：进入 `/w/:slug/projects/:pid` 时
**何时断连**：离开该页 / 关闭 tab
**重连**：自动重连（指数退避 1s → 2s → 5s → 30s 上限）；重连后**全量刷新当前列表**兜底

**连接状态指示**（TopBar 右上 ConnectionStatus 组件）：
- 灰：未连接 / 正在连接
- 蓝：已连（idle）
- 蓝闪烁：收到事件
- 红：连接错误（hover 显示原因）

**客户端事件处理**：

| WS event | 处理 |
|----------|------|
| `connected` | 标记连接成功；显示 `payload.role`；不重渲染列表 |
| `issue.updated` | 用 old/new 做 diff；本地 store 更新对应 issue；ActivityTimeline 自动追加 |
| `comment.created` | 直接用 payload 的 content 追加到 CommentList；自动滚动到底部 |
| `pong` | 忽略 |
| `error` | 不断开；log；最多重连 3 次 |
| close 4401 | push `/login?redirect={current}` |
| close 4404 | 提示「你不在这个项目里」+ 不自动重连 |

**客户端只发 `{"type": "ping"}`**，频率 25–30s。

---

## 5. 通用模式

### 5.1 Loading

- **所有**首屏用骨架屏（不显示 spinner）
- Issue 列表骨架：行 × 5，每行 5 列灰矩形
- Drawer 骨架：标题矩形 + 元信息矩形 × 4 + 描述矩形 + 列表 × 3

### 5.2 Empty

- 中央居中
- 衬线 italic 大字 + 副标 + CTA 按钮
- 保留网格底纹 + 十字装饰

### 5.3 Error

- 字段级错误：input 边框变 `--color-urgent`，下方 11px 红色文案
- 全局错误：顶部细线 banner，3s 后自动消失
- 401：自动跳登录页（带 redirect 参数）
- 403：toast 提示「无权限」 + 不要重试
- 404：按不存在处理（不重试，不弹窗）

### 5.4 二次确认

仅删除 / 危险操作才用 modal 二次确认（如删除 workspace、删除别人的 comment）。普通操作（如改 priority）不二次确认。

---

## 6. 屏幕清单（按 Sprint 落地）

| Sprint | 屏幕 |
|--------|------|
| 0 | 脚手架 + 设计系统 + AppShell + 404 |
| 1 | /login + /register + /me（基础） |
| 2 | / + /w/:slug + /w/:slug/projects + /w/:slug/projects/new + /w/:slug/members + /w/:slug/settings |
| 3 | /w/:slug/projects/:pid（核心 Issue 列表）+ /issues/new drawer + /issues/:iid drawer |
| 4 | Issue drawer 内 Comments + Activity tabs |
| 5 | Issue 列表的 Search + Filter + Sort + URL 同步 |
| 6 | BulkActionBar + 异步任务进度反馈 |
| 7 | WS 连接状态 + 实时更新（已在 Sprint 3 drawer 内建基础） |

详见 [FRONTEND_ROADMAP.md](./FRONTEND_ROADMAP.md)。

---

## 附录 A：每个屏幕的 React 组件树

```tsx
// /w/:slug/projects/:pid
<AppShell>
  <TopBar>
    <TopBarLogo />
    <Breadcrumb items={["Amiya WS", "Amiya Project", "Issues"]} />
    <WSRoleBadge role={20} />
    <AvatarMenu user={me} />
    <ConnectionStatus state="connected" />
  </TopBar>

  <LeftRail>
    <WorkspaceSwitcher current="amiya" />
    <RailCrosshair label="00° N · 00° E" />
  </LeftRail>

  <Main>
    <ProjectHeader project={project} role={20} />
    <MeasureLine label="FIG · 01" tag="AMI · ACTIVE" />
    <FilterBar
      states={states}
      currentState={currentState}
      priority={currentPriority}
      assignee={currentAssignee}
      labels={currentLabels}
      search={currentSearch}
      ordering={currentOrdering}
      onChange={...}
    />
    <IssueList>
      {issues.map(i => (
        <IssueRow
          key={i.id}
          issue={i}
          onClick={() => openIssueDrawer(i.id)}
        />
      ))}
    </IssueList>
    <Pagination ... />
  </Main>

  <Aside>
    <ProjectStats />
    <StateBreakdown states={states} counts={stateCounts} />
    <MemberStrip members={members} />
    <RealtimeIndicator />
  </Aside>

  <Footer />

  <Drawer open={drawerIssue !== null}>
    {drawerIssue && <IssueDetailDrawer issueId={drawerIssue} />}
  </Drawer>
</AppShell>
```

```tsx
// IssueDetailDrawer
<Drawer>
  <DrawerHeader crumb="AMI / WORK ITEM · AMI-07 · OPENED IN DRAWER" />
  <IssueHeader>
    <IssueId project="AMI" sequence={7} />
    <EditableTitle value={title} onChange={...} />
  </IssueHeader>

  <IssueMetaGrid>
    <EditableField type="state" options={states} value={state} onChange={...} />
    <EditableField type="priority" options={priorities} value={priority} onChange={...} />
    <EditableField type="assignee" options={members} value={assignee} onChange={...} />
    <EditableField type="labels" options={labels} value={labels} onChange={...} />
  </IssueMetaGrid>

  <DescriptionBlock value={description} onChange={...} />

  <TabBar tabs={[
    { id: 'activity', label: 'Activity', count: activities.length },
    { id: 'comments', label: 'Comments', count: comments.length },
    { id: 'refs', label: 'Refs' },
  ]} active={tab} onChange={...} />

  {tab === 'activity' && <ActivityTimeline items={activities} />}
  {tab === 'comments' && <CommentList items={comments} />}
  {tab === 'refs' && <RefsList />}

  <CommentComposer onSubmit={...} />
</Drawer>
```

## 附录 B：URL ↔ 状态映射

| URL 参数 | 前端 store key |
|---------|---------------|
| `state` | `filters.state: string[]` |
| `priority` | `filters.priority: Priority[]` |
| `assignee` | `filters.assignee: string \| 'me'` |
| `labels` | `filters.labels: string[]` |
| `search` | `filters.search: string` |
| `ordering` | `filters.ordering: Ordering` |
| `page` | `pagination.page: number` |
| `per_page` | `pagination.perPage: 50 \| 100` |
| `drawer` | `ui.drawer: 'issue:uuid' \| null` |

`useFiltersFromUrl()` + `useFiltersToUrl()` 两个 hook 双向同步；任何 state 变化 debounce 100ms 后 push 新 URL（不触发额外 fetch，只更新地址栏）。