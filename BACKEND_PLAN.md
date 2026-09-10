# Mini Plane 后端开发计划（BACKEND_PLAN）

> 配套文档：`plane_mini_collaboration_plan.md`（双人协作总计划）
>
> 本文档是后端工程师的执行手册：**做什么、按什么顺序做、做到什么程度算完成**。
> 使用方式：每进入一个 Sprint 前，先把该 Sprint 涉及的「API Contract」与前端同学确认并冻结，再开工。Contract 变更必须走 PR 更新文档。

| 版本 | 日期 | 说明 |
|------|------|------|
| v0.1 | 2026-09-09 | 初稿：技术基线、全局约定、数据模型、Sprint 0–8、核心 API Contract 草案 |

---

## 0. 与协作总计划的对应关系

| 协作总计划章节 | 本文档位置 |
|------|------|
| §5 数据模型设计 | §3 数据模型设计 |
| §7 Backend 开发流程 | §2.5 Feature 开发流水线 |
| §10 第二阶段项目骨架 | Sprint 0 |
| §11 第三阶段 User/Auth（Sprint 1） | Sprint 1 |
| §12 第四阶段 Workspace/Project（Sprint 2） | Sprint 2 |
| §13 第五阶段 Issue（Sprint 3） | Sprint 3 |
| §14 第六阶段 Comment/Activity（Sprint 4） | Sprint 4 |
| §15 第七阶段 Search/Filter（Sprint 5） | Sprint 5 |
| §16–17 第八/九阶段 Redis/Celery（Sprint 6） | Sprint 6 |
| §18 第十阶段 WebSocket（Sprint 7） | Sprint 7 |
| §20 第十二阶段 Docker/CI（Sprint 8） | Sprint 8 |
| §22 Code Review 分工 | §2.4 双向 Review 清单 |
| §42 后端能力验收 | §10 进入真实 Plane 的自检清单 |

---

## 1. 技术基线与环境

### 1.1 技术栈基线

| 组件 | 版本 | 说明 |
|------|------|------|
| Python | 3.12.x | Django 5.2 LTS 官方支持 3.10–3.13；本机需另装 3.12（现有 3.9 / 3.14 均不适用） |
| Django | 5.2 LTS | LTS 线，与真实 Plane（Django 4.x）同属传统大版本演进，学习资料稳定 |
| DRF | 3.18.1 | djangorestframework（v0.1 安装时上调至最新稳定线） |
| PostgreSQL | 16 | 主库 |
| psycopg | 3.2.x | `psycopg[binary]`，Django 5.x 推荐的 PostgreSQL 适配器 |
| django-environ | 0.14.0 | 环境变量管理 |
| drf-spectacular | 0.30.0 | 自动生成 OpenAPI 3.0 schema + Swagger UI，前端联调依据 |
| ruff | 最新 | Lint + Format 一个工具搞定（不引入 black/flake8/isort） |
| Redis | 7.x | Sprint 6 引入，Docker 运行，配 django-redis |
| Celery | 5.5.x | Sprint 6 引入，后台任务 |
| Channels | 4.2.x + channels-redis | Sprint 7 引入，WebSocket Realtime |
| gunicorn | 23.x | 仅 Sprint 8 容器内使用（Linux），Windows 本地跑 `runserver` |
| pytest / pytest-django | 可选 | MVP 用 Django 自带 `APITestCase`，Sprint 8 前不强求迁移 |

具体小版本以 `pip install` 时最新为准，锁定进 `requirements/base.txt`。

### 1.2 本机环境注意（Windows）

- pip 直连 PyPI 超时，先配置清华源（见附录 A）。
- Python 3.12 已由 uv 装好（3.12.13），调用要用完整标签 `py -V:Astral/CPython3.12.13`（`py -3.12` 匹配不到它）。
- PostgreSQL 用官网 Windows 安装器，安装时记好 postgres 密码；建库显式指定 UTF8。
- Docker Desktop 延后到 **Sprint 6 开工前**安装（Redis 是第一个真实使用者；v0.1 实际执行调整，避免过早折腾 WSL2/重启）。
- Windows 控制台默认 GBK，若 Django 管理命令输出中文报 `UnicodeEncodeError`，设 `PYTHONUTF8=1`。
- 每台机器（你 + 同学）都要能跑通后端，`.env.example` 是唯一环境契约，不许有"我机器上多了个文件"。

### 1.3 后端目录结构（Sprint 0 建立，后续不轻易动）

```text
backend/
├── manage.py
├── .env.example            # 环境变量样例（真实 .env 不进 Git）
├── requirements/
│   ├── base.txt            # 全环境共有依赖
│   ├── local.txt           # 本地开发（-r base.txt）
│   └── test.txt            # 测试（-r base.txt）
├── config/                 # 项目配置，与业务代码分离
│   ├── settings/
│   │   ├── base.py         # 公共配置
│   │   ├── local.py        # 本地开发：DEBUG、SQLite 不可用→仍用 PG
│   │   └── test.py         # 测试：快速密码哈希、独立测试库
│   ├── urls.py             # 根路由，仅 include 各 app 路由
│   ├── asgi.py             # Sprint 7 改造为 Channels 入口
│   └── wsgi.py
├── apps/
│   ├── users/              # User、Auth API
│   ├── workspaces/         # Workspace、WorkspaceMember
│   ├── projects/           # Project、ProjectMember
│   ├── issues/             # Issue、State、Label、Comment
│   └── activity/           # ActivityLog + 通用记录 service
├── core/                   # 跨 app 的通用设施
│   ├── models.py           # BaseModel（UUID 主键 + 时间戳）
│   ├── pagination.py       # 统一分页器
│   ├── permissions.py      # 权限基类
│   └── exceptions.py       # 统一异常处理器
└── docs/                   # ← 建议放仓库根目录 docs/，见 §2.6
```

约定：`config/` 只放配置；业务按 app 划分，跨 app 复用的放 `core/`；app 之间通过 `services.py` 里的函数调用，不直接互相 import Model 深层逻辑。

---

## 2. 全局工程约定

### 2.1 Git 约定

- 分支：`feat/backend-<模块>-<简述>`，如 `feat/backend-issue-crud`、`fix/backend-issue-permission`。
- Commit：`<type>(backend): <简述>`，type ∈ feat / fix / test / docs / refactor / chore。例：`feat(backend): workspace 成员角色变更接口`。
- 不直接向 main 推未经 Review 的大改动；Contract 变更（docs/api/*）单独成 PR 或在 Feature PR 中显著标注。
- PR 描述使用协作总计划 §21 的模板（What / Why / How / Testing / Breaking Changes）。

### 2.2 API 通用约定

| 项 | 约定 |
|------|------|
| 版本前缀 | 所有 API 以 `/api/v1/` 开头；预留版本号但 MVP 不做多版本 |
| URL 风格 | 资源用复数名词；带 Django 风格 trailing slash（`/api/v1/workspaces/`） |
| 嵌套深度 | 多租户资源全程带作用域：`/workspaces/{slug}/projects/{pid}/issues/{iid}/`（见 D6） |
| 认证 | Session + CSRF（对齐 Plane），见 D2 |
| 字段命名 | JSON 一律 snake_case（`created_at`，非 `createdAt`） |
| 时间格式 | ISO 8601 UTC（`2026-09-09T12:00:00Z`），`USE_TZ=True` |
| ID 格式 | UUID v4，主键不可枚举 |
| 成功响应 | 不包信封，直接返回资源 JSON 或列表；语义由 HTTP 状态码承载（200/201/204/400/401/403/404） |
| 错误响应 | 统一格式见 §7.1 |
| 分页 | 列表接口一律分页，响应 `{count, next, previous, results}`，参数 `page` + `per_page`（默认 50，最大 100） |
| 幂等 | POST 创建天然幂等可重复提交由前端防抖 + 唯一约束兜底；PATCH/PUT/DELETE 天然幂等 |
| API 文档 | drf-spectacular 生成 `/api/schema/` 与 `/api/docs/`（Swagger UI），每个 Sprint 收尾必须无警告 |

### 2.3 关键技术决策记录（与同学同步后再动手）

| # | 决策 | 理由 | 备注 |
|------|------|------|------|
| D1 | 主键用 UUID v4 | 不可枚举、URL 安全、与 Plane 一致；代价是索引略大 | `core.BaseModel` 统一实现 |
| D2 | 认证用 Session + CSRF | 对齐 Plane；无 token 存储/XSS 泄露问题；学习 CSRF 是真实工程必修课 | 跨端口联调需配 CORS（credentials）+ CSRF_TRUSTED_ORIGINS，Sprint 1 一次配好；SimpleJWT 作为对比实验，不做主方案 |
| D3 | JSON 字段 snake_case + trailing slash | Django/DRF/Plane 生态惯例 | 前端同学需知晓，接口文档中已体现 |
| D4 | 响应不包 `{code,message,data}` 信封 | DRF/Plane 均以 HTTP 状态码承载语义；信封是 Java 侧常见风格，此处不采用，改为统一**错误体**与**分页体** | 见 §7.1 |
| D5 | 分页格式 `{count,next,previous,results}` | DRF PageNumberPagination 默认结构，前端理解成本低 | `core/pagination.py` 统一实现 |
| D6 | 多租户 URL 全作用域嵌套（超两层） | 每一层路径都在做授权作用域校验（slug → project → issue），这是有意义的嵌套，与通用"嵌套≤2层"准则的取舍已在评审中说明 | 非成员访问一律返回 404（防枚举），见 §4 |
| D7 | MVP 不做软删除 | 先把硬删除 + Activity 留痕做对；归档/软删到二期再议 | State 用 RESTRICT 防止误删有 Issue 的状态 |
| D8 | Project 创建时自动预置 5 个默认 State | 对齐 Plane，前端开箱可用；自定义 State 管理放二期 | Backlog/Todo/In Progress/Done/Cancelled，带 group 字段 |
| D9 | Issue 带 per-project 序号 `sequence_id` | 显示 `#1 #2` 是项目管理软件的基本体验，也是 select_for_update + 事务的绝佳练习 | 并发创建安全性在 Sprint 3 验收 |

### 2.4 双向 Review 清单（评审对方代码时逐条过）

我 Review 同学前端代码时重点看：API Contract 是否一致（含错误分支处理）、401/403/404 是否正确分流、是否发了多余的重复请求、Loading/Empty/Error 状态是否齐全、字段命名与文档是否一致。

同学 Review 我的 API 时重点看：Response 是否稳定、Error Format 是否统一、字段命名是否清楚、完成一个页面需要的请求次数是否合理、文档是否与实现一致。

### 2.5 Feature 开发流水线（每个功能固定走）

```text
需求确认（对齐协作总计划 §28 三问）
  → 数据模型/迁移确认
  → API Contract 草案（docs/api/xx.md）→ 与前端冻结
  → Model + Migration
  → Serializer
  → View/Router + Permission
  → 业务逻辑（services.py）
  → 测试（正常/非法/未登录/无权限/不存在/边界）
  → API 文档生成无警告
  → PR → Review（双向）→ Merge
  → 联调
```

### 2.6 Contract 文档的存放与冻结机制

仓库根目录 `docs/api/`，每个模块一个文件，**Contract 是前后端的唯一事实来源**：

```text
docs/api/
├── 00-conventions.md   # 通用约定（§2.2、§7.1 的副本）
├── 01-auth.md
├── 02-workspaces.md
├── 03-projects.md
├── 04-issues.md
├── 05-comments.md
└── 06-activities.md
```

规则：Sprint 开工前产出/更新对应文件并请前端确认（评论或 PR approve 即视为冻结）；开发中发现 Contract 需要变更，先改文档提 PR，再改代码。本文档 §7 是这些文件的初始草稿。

---

## 3. 数据模型设计（后端实现版）

### 3.1 关系总览

```text
User
 │
 ├── WorkspaceMember ── Workspace
 │                         │
 │                         ├── Project ──── ProjectMember(User)
 │                         │      │
 │                         │      ├── State（创建项目时预置 5 个默认状态）
 │                         │      ├── Label
 │                         │      └── Issue ── Comment
 │                         │                └── ActivityLog
 │                         └──（ActivityLog 也挂 workspace 维度）
 └── Comment / ActivityLog（actor 维度）
```

### 3.2 字段定义

约定：所有表继承 `core.BaseModel`（`id UUID pk` + `created_at` + `updated_at`）；外键 on_delete 除特别说明外为 CASCADE。

**users.User**（继承 `AbstractUser`，主键替换为 UUID）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | pk | BaseModel 提供 |
| username | varchar(150) | unique（继承） | 登录凭据 |
| email | varchar(254) | unique | 必填，用于二期通知 |
| avatar | URLField | null/blank | 头像 URL |
| password | — | 继承 | Django 哈希器自动处理，禁止明文/自造哈希 |

**workspaces.Workspace**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| name | varchar(80) | 非空 | |
| slug | varchar(32) | unique | 正则 `^[a-z0-9-]{2,32}$`，未传时从 name 自动生成并查重 |
| owner | FK User | PROTECT | 创建者；Admin 角色转移是二期议题 |

**workspaces.WorkspaceMember**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| workspace | FK Workspace | CASCADE | |
| user | FK User | CASCADE | unique(workspace, user) |
| role | IntegerChoices | 非空 | ADMIN=20 / MEMBER=15 / VIEWER=5 |
| created_at | datetime | | 加入时间 |

**projects.Project**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| workspace | FK Workspace | CASCADE | 索引 (workspace) |
| name | varchar(120) | 非空 | |
| identifier | varchar(5) | UniqueConstraint(workspace, identifier) | 2–5 位大写字母，如 `AMI`，用于 Issue 前缀 |
| description | text | blank | |
| created_by | FK User | PROTECT | |
| issue_sequence | int | default 0 | sequence_id 发号计数器（D9），只在事务内更新 |

**projects.ProjectMember**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| project | FK Project | CASCADE | |
| user | FK User | CASCADE | unique(project, user) |
| role | IntegerChoices | 非空 | ADMIN=20 / MEMBER=15 / VIEWER=5 |

约束：ProjectMember.user 必须已是该 workspace 的 WorkspaceMember（service 层校验，数据库层不表达跨表约束）。

**issues.State**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| project | FK Project | CASCADE | |
| name | varchar(60) | 非空 | 默认五态：Backlog / Todo / In Progress / Done / Cancelled |
| group | CharChoices | 非空 | backlog / unstarted / started / completed / cancelled（对齐 Plane） |
| color | varchar(9) | default `#94a3b8` | `#RRGGBB` |
| sort_order | positive int | 非空 | 列表排序 |

MVP 只读（无增删改接口），自定义状态管理放二期。

**issues.Label**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| project | FK Project | CASCADE | |
| name | varchar(60) | unique(project, name) | |
| color | varchar(9) | default `#64748b` | |

**issues.Issue**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| project | FK Project | CASCADE | |
| sequence_id | positive int | unique(project, sequence_id) | 项目内自增编号 #1 #2…（D9） |
| title | varchar(255) | 非空 | |
| description | text | blank | |
| priority | CharChoices | default none | none / urgent / high / medium / low |
| state | FK State | RESTRICT | 防止误删仍有 Issue 的状态 |
| assignee | FK User | null | 必须是该项目成员（service 校验） |
| created_by | FK User | PROTECT | |
| labels | M2M Label | blank | 直接 M2M，后续需要扩展再加 through |

索引：`(project, state)`、`(project, priority)`、`(project, -created_at)`（Sprint 3 建，Sprint 5 用 EXPLAIN 验证效果）。

**issues.Comment**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| issue | FK Issue | CASCADE | |
| author | FK User | PROTECT | |
| content | text | 非空 | |

索引：`(issue, created_at)`。

**activity.ActivityLog**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| workspace | FK Workspace | CASCADE | 便于后续工作区级活动流 |
| project | FK Project | CASCADE | 索引 (project, created_at) |
| actor | FK User | PROTECT | 谁做的 |
| entity_type | CharChoices | 非空 | issue / comment / state / label / project / workspace / member |
| entity_id | UUID | 非空 | 对象 id；索引 (entity_type, entity_id) |
| action | CharChoices | 非空 | created / updated / deleted |
| old_value | JSONField | null | 如 `{"state": "Todo"}` |
| new_value | JSONField | null | 如 `{"state": "Done"}` |
| created_at | datetime | | 排序键，倒序展示 |

写入路径唯一：`activity.services.record_activity(...)`，由 Issue/Comment/Project 的变更代码调用，不暴露创建 API。

---

## 4. 权限模型

### 4.1 角色定义

Workspace 级：ADMIN(20) 管理成员与工作区设置；MEMBER(15) 创建项目、参与协作；VIEWER(5) 只读。
Project 级：ADMIN(20) 管理项目设置与项目成员；MEMBER(15) 读写 Issue/Comment；VIEWER(5) 只读。
推定规则：是 ProjectMember 则必是 WorkspaceMember；用户在项目内的实际角色取「项目角色」，项目内未单独建成员但为 Workspace ADMIN 的，视同项目 ADMIN。

### 4.2 权限矩阵（MVP）

| 操作 | WS Admin | WS Member | WS Viewer | 非成员 |
|------|----------|-----------|-----------|--------|
| 查看 Workspace / 成员列表 | ✅ | ✅ | ✅ | 404 |
| 修改/删除 Workspace | ✅ | ❌ 403 | ❌ 403 | 404 |
| 管理 Workspace 成员（增/改角色/移除） | ✅ | ❌ 403 | ❌ 403 | 404 |
| 创建 Project | ✅ | ✅ | ❌ 403 | 404 |
| 查看 Project / Issue / Comment / Activity | ✅ | ✅ | ✅ | 404 |
| 修改/删除 Project | ✅（WS Admin 视同） | 项目 Admin 才可 | ❌ 403 | 404 |
| 管理 Project 成员 | ✅（视同） | 项目 Admin 才可 | ❌ 403 | 404 |
| 创建/修改/删除 Issue | ✅ | 项目 MEMBER+ 可，VIEWER 403 | ❌ 403 | 404 |
| 创建 Comment | ✅ | 项目 MEMBER+ 可 | ❌ 403 | 404 |
| 修改/删除 Comment | ✅ | 仅作者（Admin 也可） | ❌ 403 | 404 |
| 删除他人 Comment | ✅ | ❌ 403 | ❌ 403 | 404 |

### 4.3 两条硬规则

1. **404 防枚举**：对"存在但我无权查看"的资源，一律返回 404 而不是 403（403 等于告诉攻击者资源存在）。"存在且可见但无权操作"才返回 403。权限矩阵中已按此标注。
2. **权限校验不写在前端，也不只写在 URL**：DRF Permission Class 分两层——`IsWorkspaceMember`（对象级，从 URL 参数解析作用域）+ 角色判断；Serializer 层做字段级校验（如 assignee 是否项目成员）。

---

## 5. Sprint 总览

规模：S=一次周末协作可完成；M=2–3 次协作；L=3 次以上或需专门攻坚。

| Sprint | 主题 | 规模 | 后端交付物 | 联调节点（给前端什么） | 前置 |
|--------|------|------|-----------|----------------------|------|
| 0 | 环境 + 项目骨架 | M | 可运行的 Django 项目 + `/api/v1/health/` + schema/docs | 健康检查接口、OpenAPI 地址 | 无 |
| 1 | User / Auth | M | register/login/logout/me + Session 认证 + CORS 配置 | 4 个 Auth 接口 + 联调环境配置说明 | Sprint 0 |
| 2 | Workspace / Project | L | 双 CRUD + 成员管理 + 权限 | Workspace/Project/成员 全套接口 | Sprint 1 |
| 3 | Issue 核心 | L | Issue/State/Label CRUD + sequence_id + 权限 | Issue 全套接口 | Sprint 2 |
| 4 | Comment + Activity | M | Comment CRUD + Activity 记录与查询 | Comment/Activity 接口 + 活动流文案规则 | Sprint 3 |
| 5 | Search / Filter / Sort / Pagination 强化 | M | Issue 列表过滤排序 + 索引验证 | 查询参数契约（含排序字段白名单） | Sprint 4 |
| 6 | Redis Cache + Celery | M | 详情缓存 + 异步任务（通知/Activity 批量） | 缓存失效行为说明 + 任务状态接口 | Sprint 5 |
| 7 | WebSocket Realtime | L | Channels + project room 广播 | WS 端点 + 事件 payload 契约 | Sprint 6 |
| 8 | Docker / CI / 收尾 | M | Dockerfile + compose + GitHub Actions + 文档 | `docker compose up` 一键起 | Sprint 7 |

**进度总览**（详细索引与交付物形态见 [docs/devlog/README.md](docs/devlog/README.md)）

| Sprint | 状态 | 日志 |
|--------|------|------|
| 0 环境 + 项目骨架 | ✅ 已完成 | [sprint-0-backend.md](docs/devlog/sprint-0-backend.md) |
| 1 User / Auth | ✅ 已完成 | [sprint-1-backend.md](docs/devlog/sprint-1-backend.md) |
| 2 Workspace / Project | ✅ 已完成 | [sprint-2-backend.md](docs/devlog/sprint-2-backend.md) |
| 3 Issue 核心 | ✅ 已完成 | [sprint-3-backend.md](docs/devlog/sprint-3-backend.md) |
| 4 Comment + Activity | ⬜ 下一个 | — |
| 5–8 | ⬜ 待开始 | — |

进入 Sprint 9/10（阅读真实 Plane 源码、开源贡献）的条件见 §10。

---

## 6. Sprint 详细计划

每个 Sprint 固定包含：目标 → 前置 → 任务清单 → 学习要点 → 验收标准 → 联调节点 → DoD（完成定义）。DoD 通用项不重复写，见 §6.9。

### Sprint 0：环境与项目骨架

**目标**：两人都能从全新目录把"数据库 + 后端 + 前端"跑起来。

**前置**：GitHub 仓库已建（可由同学发起，后端推送 `backend/`）；Issue/PR 模板已建。

**任务清单**

- [ ] 安装 PostgreSQL 16（本机注意项见 §1.2，命令见附录 A）；Docker Desktop 延后至 Sprint 6 前（Sprint 0 已完成：Python 3.12 + PG 16 + 骨架 + health + schema）
- [ ] 配置 pip 清华源；建库 `miniplane`（UTF8）
- [ ] `django-admin startproject config .`；settings 拆 base/local/test；`django-environ` 接入
- [ ] 产出 `.env.example`（SECRET_KEY、DATABASE_URL、ALLOWED_HOSTS、CORS_ORIGINS）
- [ ] requirements 拆分 base/local/test 并锁定版本
- [ ] 建立 `apps/`（users, workspaces, projects, issues, activity）+ `core/` 骨架
- [ ] `core.BaseModel`（UUID pk + created_at + updated_at）
- [ ] `GET /api/v1/health/` 返回 `{"status": "ok", "database": "ok"}`（真实探测 DB）
- [ ] drf-spectacular 接入：`/api/schema/` + `/api/docs/`
- [ ] ruff 配置（lint + format）+ `.gitignore`（.env / .venv / __pycache__）
- [ ] 建一个 `apps/health` 或并入 config，最简原则

**学习要点**：virtualenv 隔离原理；settings 分层与环境变量（为什么 SECRET_KEY 不进 Git）；Django 的 WSGI/ASGI 概念；migration 是什么、为什么进版本库。

**验收标准**

- [ ] 同学或陌生环境按 README + `.env.example` 能在 30 分钟内跑通后端
- [ ] `/api/v1/health/` 200 且 database=ok；数据库停止时返回 503
- [ ] `python manage.py test --settings=config.settings.test --noinput` 通过（health 探测 2 用例）
- [ ] `ruff check .` 与 `ruff format --check .` 零告警
- [ ] Swagger 页面可访问且无警告

**联调节点**：给同学健康检查接口地址 + Swagger 地址 + 一份"前端本地调用后端的 CORS/Cookie 配置预告"（正式配置在 Sprint 1 落地）。

### Sprint 1：User / Auth

**目标**：完成注册/登录/登出/当前用户，确立 Session 认证与统一错误格式，前后端联调跑通登录闭环。

**前置**：Sprint 0 合并；Contract `docs/api/01-auth.md` 冻结。

**任务清单**

- [ ] User 模型（AbstractUser + UUID pk + email unique）+ migration
- [ ] 统一异常处理器（core/exceptions.py）：400 字段错误 / 401 / 403 / 404 / 500 格式固化（§7.1）
- [ ] 统一分页器（core/pagination.py）在本 Sprint 就位（me 接口虽不分页，列表接口后续直接复用）
- [ ] register / login / logout / me 四个接口（契约见 §7.2）
- [ ] CSRF 与 CORS：CSRF_TRUSTED_ORIGINS、CORS_ALLOW_CREDENTIALS、SessionCookie 属性（HttpOnly / SameSite=Lax）配置并写入联调说明
- [ ] 登录接口防暴力：失败计数内存版即可（正式 Rate Limit 二期），记录失败日志
- [ ] API 文档：01-auth.md 落库 + schema 注解齐全

**学习要点**：密码哈希（PBKDF2/Argon2，为什么不能自造 MD5+盐）；Session 机制与 Cookie 属性；CSRF 原理与 DRF 的 SessionAuthentication 强制 CSRF 行为；DRF Authentication vs Permission 的区别；自定义异常处理器如何改变错误响应。

**测试清单**（`apps/users/tests/`）

- [ ] test_register_success / duplicate_username / duplicate_email / weak_password / missing_fields
- [ ] test_login_success（密码正确，返回用户信息 + session cookie）/ wrong_password / unknown_user
- [ ] test_logout_then_me_401
- [ ] test_me_authenticated / test_me_unauthenticated_401
- [ ] test_register_password_not_in_response（响应与日志都不出现明文/哈希）

**验收标准**

- [ ] 上述测试全绿；`python manage.py test --settings=config.settings.test --noinput` 整体全绿
- [ ] curl 走通：register → login → me → logout → me(401)
- [ ] 前端同学按联调说明，10 分钟内完成前端 login + me 对接（CORS/CSRF 一次配通是本 Sprint 的硬指标）
- [ ] schema/docs 无警告

**联调节点**：交付 01-auth.md + 联调配置说明（含前端请求需 `credentials: 'include'`、CSRF 获取方式）。演示脚本：注册 → 登录 → 打开前端受保护页显示用户名 → 登出 → 再访问被拦截。

### Sprint 2：Workspace / Project

**目标**：第一个业务闭环 + 多租户权限落地：用户只能看到自己的 Workspace/Project。

**前置**：Sprint 1 合并；Contract 02/03 冻结（含 §4 权限矩阵确认）。

**任务清单**

- [ ] Workspace / WorkspaceMember / Project / ProjectMember 模型 + migration + 约束
- [ ] slug 自动生成（slugify + 查重重试）与校验
- [ ] Workspace CRUD：创建（owner 自动成为 ADMIN 成员）、我的列表（只含我是成员的）、详情、PATCH（Admin）、DELETE（Admin）
- [ ] Workspace 成员管理：列表 / 添加（按 email 或 user_id，Admin）/ 改角色 / 移除；禁止移除 owner 或最后一个 ADMIN
- [ ] Project CRUD：创建（identifier 大写校验 + workspace 内唯一；creator 自动成为项目 ADMIN；**自动预置 5 个默认 State**，D8）、列表、详情、PATCH、DELETE（级联测试要点）
- [ ] Project 成员管理：从 Workspace 成员中添加（service 校验 workspace 身份）、改角色、移除
- [ ] 权限类落地：`IsAuthenticated` + 对象级 `IsWorkspaceMember` / 角色判断（core/permissions.py），404 防枚举统一实现
- [ ] 查询优化第一课：members 列表 select_related(user)，避免 N+1（用 assertNumQueries 写进测试）
- [ ] 删除策略：Workspace 删除级联所有下级（写清 PR 中的风险说明，D7）

**学习要点**：FK / M2M / unique_together(Constraints)；on_delete 各取值含义（CASCADE/PROTECT/RESTRICT 的实际后果）；DRF Serializer 的 create/update 如何做嵌套写入；对象级权限 has_object_permission 的调用时机（为什么列表接口要手动过滤 queryset 而不能只靠 has_object_permission）；select_related vs prefetch_related；事务 atomic 的第一次使用（创建 Project + 默认 States + 创建者成员记录必须是原子的）。

**测试清单**（workspaces + projects 两包）

- [ ] Workspace：create_auto_admin / create_slug_conflict_400 / list_only_mine / detail_as_member_200 / detail_as_outsider_404 / patch_by_admin_200 / patch_by_member_403 / delete_by_admin_204_cascades
- [ ] WS 成员：add_existing_user / add_by_non_admin_403 / change_role / remove_owner_400 / remove_last_admin_400 / remove_member_204
- [ ] Project：create_with_default_states_5 / identifier_duplicate_400 / identifier_lowercase_400 / list_scoped_to_workspace / outsider_404 / patch_delete 角色矩阵各一例
- [ ] Project 成员：add_requires_workspace_membership_400 / role_matrix
- [ ] 权限矩阵 §4.2 全表逐格覆盖（参数化测试）
- [ ] assertNumQueries：workspace 详情、project 列表（防 N+1 回归）

**验收标准**

- [ ] 测试全绿，权限矩阵逐格可指认对应测试用例
- [ ] 演示：用户 A 建 WS1+Project；用户 B 不在 WS1，API 访问 WS1/项目全部 404；B 加入 WS1 后可见
- [ ] 默认五态在创建 Project 后立即可查（前端依赖此行为渲染状态列）

**联调节点**：交付 02/03 契约 + 演示账号两个（A/B），前端做 Workspace 切换、Project 列表/详情时直接用 A/B 验证越权场景。

### Sprint 3：Issue 核心

**目标**：Mini Plane 的心脏——Issue 全生命周期 CRUD + 并发安全的编号发放 + 字段级校验。

**前置**：Sprint 2 合并；Contract 04 冻结。

**任务清单**

- [ ] State / Label / Issue 模型 + migration + 索引（§3.2）
- [ ] Issue 创建：title 必填；state 缺省取项目 Backlog；assignee 必须是项目成员（400）；labels 必须属于本项目（400）；sequence_id 用 `select_for_update` 在事务内发号（D9）
- [ ] Issue 列表：仅项目成员可见，按 `sequence_id` 倒序，基础分页（page/per_page）
- [ ] Issue 详情 / PATCH（部分更新：state/priority/assignee/labels/title/description）/ DELETE
- [ ] State 只读列表接口（前端渲染状态列/切换器）
- [ ] Label CRUD（项目内 name 唯一）+ Issue 的 labels 读写
- [ ] assignee/labels 校验错误信息规范化（前端能直接展示）
- [ ] priority 枚举文档化（none/urgent/high/medium/low）

**学习要点**：ModelForm/Serializer 校验分层（validate_xx 字段级 vs validate 对象级）；select_for_update 与竞态条件（写一个并发发号测试证明不会重号）；RESTRICT 约束下删除 State 的 400 反馈；queryset 级过滤与对象级权限的配合；partial update（PATCH）与 PUT 的区别。

**测试清单**

- [ ] create_minimal（默认 state=Backlog，sequence_id=1）/ create_full / title_blank_400 / state_foreign_400 / assignee_not_member_400 / label_foreign_400
- [ ] sequence：连发 50 个 issue 序号 1..50 连续；并发（TransactionTestCase + 多线程或两条并行事务模拟）不重号
- [ ] list_pagination（51 条 → count=51, next 非 null, page_size 上限 100）
- [ ] detail/patch/delete 的角色矩阵（WS Viewer 403、项目 VIEWER 403、非成员 404）
- [ ] patch_state_change_200 / patch_readonly_fields_ignored（如 sequence_id、created_by 不可改）
- [ ] delete_state_with_issues_400（RESTRICT）
- [ ] label CRUD：duplicate_name_400 / used_by_issue 不阻塞删除（M2M 自动清理）——注意此处行为要在 04 契约写明

**验收标准**

- [ ] 测试全绿；并发发号测试稳定通过（连跑 10 次不红）
- [ ] curl 演示：建 Issue → 列表出现（含 #1）→ PATCH 换状态 → assignee → 刷新仍正确
- [ ] 无权限用户（非项目成员）访问 Issue 列表/详情均 404

**联调节点**：交付 04 契约。前端演示脚本按协作总计划 §13：打开 Project → 创建 → 列表 → 详情 → 改状态 → 改优先级 → 分配 → 刷新数据正确。

### Sprint 4：Comment + Activity Log

**目标**：从 CRUD 走向"业务系统"——每一次变更都有痕迹，活动流可回放。

**前置**：Sprint 3 合并；Contract 05/06 冻结（含活动文案规则）。

**任务清单**

- [ ] Comment 模型 + CRUD 接口（创建 MEMBER+；编辑/删除仅作者或 Admin；列表按时间正序分页）
- [ ] activity app + ActivityLog 模型 + `record_activity(actor, workspace, project, entity, action, old, new)` 通用 service
- [ ] 挂接记录点：Issue 创建/字段变更（old→new）/ 删除、Comment 创建/删除、Project 创建/变更
- [ ] Issue 详情页数据聚合：activities 子资源接口（倒序分页）
- [ ] 活动展示契约：entity_type + action + old/new_value 的展示文案规则写进 06 契约（前端拼"张三 将 状态 从 Todo 改为 Done"）
- [ ] 字段 diff 提取：PATCH 中真正变化的字段才记录（含空值/None 的边界）

**学习要点**：Domain Event 与 Audit Trail 的区别（本阶段做的是后者）；为什么记录点放在 service 层而不是 serializer.save() 之后散落各处；JSONField 的查询与序列化；"哪些变更值得记录"的产品决策（title/description 的 old 值要不要全文存）。

**测试清单**

- [ ] comment：create_by_member_201 / create_by_viewer_403 / edit_by_author_200 / edit_by_others_403 / edit_by_ws_admin_200 / delete_author_204
- [ ] activity：create_issue_writes_created / patch_state_writes_old_new / patch_same_value_no_record / patch_untouched_fields_not_recorded / comment_created_recorded / issue_deleted_recorded
- [ ] activities 列表倒序 + 分页 + 非成员 404
- [ ] record_activity 不吞业务异常：写活动失败时事务回滚（与业务同事务，.atomic 包裹验证）

**验收标准**

- [ ] 测试全绿
- [ ] 演示：改状态 → 改优先级 → 评论 → 活动流按序出现且 old/new 正确
- [ ] 联调验收（协作总计划 §34）：Issue 修改后 Activity 自动出现，前端时间线文案正确

**联调节点**：交付 05/06 契约 + 一份"活动文案映射表"（action × entity 的中英文案模板，与同学共同定稿）。

### Sprint 5：Search / Filter / Sort / Pagination 强化

**目标**：把 `GET /issues?...` 做成真正的查询引擎，并验证索引价值。

**前置**：Sprint 4 合并；Contract 04 的查询参数部分冻结。

**任务清单**

- [ ] 自定义 FilterBackend（core/ 下手写，学习原理；django-filter 留作对比阅读）：
  - [ ] `state`（可多值逗号分隔）/ `priority`（多值）/ `assignee`（id 或 `me`）/ `labels`（label id 多值交集或并集，契约定死一种）
  - [ ] `search`：title + description `icontains`
  - [ ] `ordering` 白名单：created_at / -created_at / sequence_id / -sequence_id / priority / -priority，非法值 400
- [ ] 分页强化：per_page 上限、`page` 越界返回空 results 而非 500
- [ ] 索引验证：seed 脚本生成 5,000 条 Issue，用 `explain()` 对比建索引前后的计划，产出一份短结论（放 PR 描述）
- [ ] 明确本阶段不做的：全文检索（trigram/ES）、跨项目搜索（二期）

**学习要点**：QuerySet 惰性求值与链式过滤；icontains 的 LIKE '%..%' 为什么走不了普通索引（为二期 pg_trgm 埋点）；ordering 白名单为什么必须是白名单（注入/性能）；explain() 读执行计划入门。

**测试清单**

- [ ] filter_state_multi / filter_priority_multi / filter_assignee_me / filter_labels_and_or（按契约断言）/ filter_combination
- [ ] search_title_and_description / search_no_result_empty_results
- [ ] ordering_valid_values / ordering_invalid_400 / ordering_default_minus_created
- [ ] pagination_over_page_empty_results / per_page_over_max_400
- [ ] 权限回归：filter 不绕过成员校验（非成员带任意参数仍 404）

**验收标准**

- [ ] 测试全绿；5000 条数据下列表接口 P95 < 300ms（本机 PG，记入 PR）
- [ ] explain 结论进 PR：确认 (project, state) / (project, -created_at) 索引被命中

**联调节点**：交付查询参数契约；前端做 Search Box / Filter / Sort / 分页 + URL 同步（协作总计划 §15 的 UI→URL→HTTP→ORM→DB 链路联调）。

### Sprint 6：Redis Cache + Celery

**目标**：带着真实问题引入 Redis 与异步——不为了堆技术栈。

**前置**：Sprint 5 合并；与同学共同确认两个"真实痛点"（见下）成立；Contract 增补缓存行为说明。

**任务清单**

- [ ] Docker 起 Redis（dev compose 片段）；django-redis 接入 CACHES
- [ ] Cache 场景（痛点 1：Project 详情高频读）：`GET /projects/{id}/` 读缓存；写路径（PATCH/DELETE/成员变更）主动失效；TTL 300s 兜底
- [ ] 缓存键规范 `mini:project:{id}:v{N}`（版本号失效法 vs 直接 delete，两种都实现并对比写结论）
- [ ] Celery 接入（worker + 本地 dev 用 celery beat 不需要就不上）：
  - [ ] 场景 A：Comment 创建后的"通知任务"（MVP 只写日志/落一张 notification 表占位，邮件二期）——验证 Retry（失败重试 3 次退避）与幂等（task_id 去重）
  - [ ] 场景 B：Issue 批量操作（如批量改 label）走异步任务 + 状态可查询（task 状态接口给前端）
- [ ] dev 环境用 `CELERY_TASK_ALWAYS_EAGER` 保证测试不依赖 worker
- [ ] 缓存一致性演示脚本：改 Project 名 → 立即读详情 → 拿到新值（无陈旧窗口的验收）

**学习要点**：Cache Aside 模式；TTL/击穿/雪崩概念（本阶段只做主动失效 + TTL 兜底即可）；Celery 的 broker/backend 区别；Retry/幂等为什么是异步的生存底线；"缓存了什么就要在哪里失效"的清单意识。

**测试清单**

- [ ] cache：project_detail_cached（第二次读不发 SQL，用 assertNumQueries）/ patch_invalidates / delete_invalidates / member_change_invalidates
- [ ] cache 序列化一致性：JSON 反序列化后字段与直读一致
- [ ] celery：eager 模式下通知任务执行；模拟失败重试 3 次；幂等键重复投递只生效一次
- [ ] 批量任务状态接口：pending → success 状态流转

**验收标准**

- [ ] 测试全绿（eager 模式 + cache 测试）
- [ ] `docker compose up redis` 后 worker 可本地起并处理任务
- [ ] 一份 10 行内的结论：什么被缓存了、失效点在哪、为什么

**联调节点**：给前端"缓存行为说明"（哪些读是缓存读、变更后多快可见）+ 批量任务状态接口契约；前端做任务进度反馈 UI（协作总计划 §17 分工）。

### Sprint 7：WebSocket Realtime

**目标**：两个浏览器同开一个 Project，一端改 Issue，另一端实时收到。

**前置**：Sprint 6 合并；事件 payload 契约冻结（04/05 契约增补 WS 事件章节）。

**任务清单**

- [ ] Channels 4 接入：asgi.py 改造、redis channel layer（dev compose 增加）
- [ ] WS 端点：`/ws/projects/{project_id}/`，连接握手时用 session 校验用户 + 项目成员身份，非成员拒绝（close code 4403）
- [ ] 房间模型：`project.{id}`；连接/断开管理；同一用户多标签页多连接支持
- [ ] 事件广播点与 payload（契约冻结）：
  - `issue.created` / `issue.updated`（只带 issue_id + changed_fields 摘要，前端拉详情）
  - `issue.deleted`（issue_id）
  - `comment.created`（issue_id + comment_id）
- [ ] 广播在 service 层发出（与 record_activity 同位置），HTTP 响应返回后再广播（避免前端抢跑）
- [ ] 心跳：服务端 30s ping，客户端 pong 超时断开（防僵尸连接）
- [ ] 明确不做（二期）：断线期间的事件补发（前端重连后全量刷新兜底）

**学习要点**：HTTP 生命周期 vs WS 生命周期；ASGI/Channels 的 consumer 与 scope；channel layer 的 group_send/group_add；认证在握手期完成的原因；为什么 payload 发摘要而不是全量对象（一致性由拉取保证，推送只做提醒）。

**测试清单**

- [ ] Channels ApplicationCommunicator 测试：member 连接成功 / outsider 连接被拒 4403 / 未登录拒绝
- [ ] 广播：patch_issue 后 group 收到 issue.updated 且含 changed_fields
- [ ] 广播不含未变更字段；deleted 事件正确
- [ ] 心跳超时断开（用 communicator 推进时间模拟）

**验收标准**

- [ ] 测试全绿
- [ ] 双浏览器演示：A 改状态，B 无刷新列表更新（协作总计划 §36 验收原文）
- [ ] B 关掉网络 30s 再恢复，重连后能正常收新事件（重连兜底 = 全量刷新生效）

**联调节点**：交付 WS 契约（URL、握手、close code、事件表、心跳节奏）；前端做连接状态指示、重连、乐观更新基础处理（协作总计划 §18 分工）。

### Sprint 8：Docker / CI / 工程化收尾

**目标**：`docker compose up` 一键起全套；每个 PR 被 CI 把关；仓库文档达到开源水准。

**前置**：Sprint 7 合并；双方共同排期（本 Sprint 后端任务为主，CI 需同时配前端 job）。

**任务清单**

- [ ] 后端 Dockerfile：多阶段构建（builder 装 wheel → slim 运行镜像）、非 root 用户、gunicorn 启动、健康检查指令
- [ ] docker-compose.yml：web / db(postgres:16) / redis / worker / (Sprint 7 的 asgi 服务)；depends_on + healthcheck
- [ ] settings 容器化分支（env 驱动，无 local.py 依赖）
- [ ] GitHub Actions：backend job（ruff check → ruff format --check → migrate 检查 → test with postgres service + redis service）；前端 job 由同学配
- [ ] PR 模板 + CI 必绿才可合并（branch protection main）
- [ ] 文档收尾：README 后端章节（怎么跑/技术栈/目录）、API.md（由 drf-spectacular 生成）、ARCHITECTURE.md 后端部分（请求链路图）
- [ ] `v0.1.0` tag + GitHub Release（release notes 列 MVP 功能清单）

**学习要点**：镜像分层与缓存优化（依赖层与代码层分离）；容器内 12-factor 配置；CI 里数据库 service 容器的工作方式；为什么 CI 先 lint 再 test（失败成本排序）。

**验收标准**

- [ ] 陌生机器 `docker compose up` 后 health 200、前端可登录注册
- [ ] 提一个故意不合格 PR（缺测试），确认 CI 拦截
- [ ] README 四问可答：这是什么/怎么跑/技术栈/如何贡献

**联调节点**：compose 全家桶交给同学做前端容器化对齐；共同写 ARCHITECTURE.md 的端到端链路图（协作总计划 §37）。

### 6.9 通用 Definition of Done（每个 Sprint 结束逐条勾）

- [ ] 契约文档与实现一致（drf-spectacular 无警告，docs/api/*.md 无过期段落）
- [ ] `python manage.py test --settings=config.settings.test --noinput` 全绿；`ruff check` / `ruff format --check` 零告警
- [ ] 正常 / 非法 / 未登录 / 无权限 / 不存在 / 边界 六类测试齐备
- [ ] 迁移可从零重放（删库重建 + migrate 成功）
- [ ] PR 描述按模板填写，同学已 Review，我的 Review 意见全部闭环
- [ ] 能脱离 AI 讲清楚本 Sprint 每一段代码为什么存在（协作总计划 §23 的标准）
- [ ] 联调演示脚本在同学面前跑通

---

## 7. 核心 API Contract 草案

> 本节是 `docs/api/*.md` 的初始草稿。通用约定（认证、错误体、分页体、命名）见 §2.2 与 §7.1，各模块文档不再重复。

### 7.1 通用错误体与分页体

**错误响应统一格式**（D4：无信封，状态码承载语义）：

```json
// 400 校验失败 —— 字段级
{ "title": ["该字段是必填项。"], "assignee": ["所选用户不是该项目成员。"] }

// 400 非字段级
{ "non_field_errors": ["identifier 必须为大写字母。"] }

// 401 未认证
{ "detail": "身份认证信息未提供。" }

// 403 已认证但无权操作
{ "detail": "您没有执行该操作的权限。" }

// 404 不存在或无权查看（防枚举，见 §4.3）
{ "detail": "未找到。" }

// 500
{ "detail": "服务器内部错误。" }
```

**分页响应统一格式**（D5）：

```json
{
  "count": 128,
  "next": "http://localhost:8000/api/v1/...?page=2",
  "previous": null,
  "results": [ /* ... */ ]
}
```

**通用错误码表**：400 参数校验失败 / 401 未认证 / 403 无权限 / 404 不存在或不可见 / 405 方法不允许 / 429 限流（二期） / 500 服务异常。

### 7.2 Auth（docs/api/01-auth.md）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/auth/register/` | 匿名 | 注册 |
| POST | `/api/v1/auth/login/` | 匿名 | 登录，种 session cookie |
| POST | `/api/v1/auth/logout/` | 已认证 | 登出，销毁 session |
| GET | `/api/v1/auth/me/` | 已认证 | 当前用户 |
| GET | `/api/schema/` `/api/docs/` | 已认证 | OpenAPI + Swagger UI |

**POST /api/v1/auth/register/** — 请求：`{"username": "amiya", "email": "amiya@example.com", "password": "..."}`。校验：username 唯一、email 唯一、密码过 Django 校验器（≥8 位、非常见、不全数字）。
201 响应：`{"id": "uuid", "username": "amiya", "email": "amiya@example.com", "avatar": null, "created_at": "..."}`。400：字段错误体。

**POST /api/v1/auth/login/** — 请求：`{"username": "amiya", "password": "..."}`。
200：`{"id": "uuid", "username": "amiya", "email": "...", "avatar": null}` + `Set-Cookie: sessionid=...; HttpOnly; SameSite=Lax`。
401/400：`{"detail": "用户名或密码错误。"}`（不区分两种失败，防用户名探测）。

**GET /api/v1/auth/me/** — 200：同登录响应体；401：错误体。**POST /api/v1/auth/logout/** — 204 无体。

### 7.3 Workspace（docs/api/02-workspaces.md）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/workspaces/` | 已认证 | 创建；创建者自动成为 ADMIN 成员 |
| GET | `/api/v1/workspaces/` | 已认证 | **仅返回我是成员的**工作区 |
| GET | `/api/v1/workspaces/{slug}/` | WS 成员 | 详情；含我的 `current_role` |
| PATCH | `/api/v1/workspaces/{slug}/` | WS Admin | 改名/slug |
| DELETE | `/api/v1/workspaces/{slug}/` | WS Admin | 级联删除（D7，PR 需风险说明） |
| GET | `/api/v1/workspaces/{slug}/members/` | WS 成员 | 成员列表（分页） |
| POST | `/api/v1/workspaces/{slug}/members/` | WS Admin | 按 email 添加，body `{"email": "...", "role": 15}` |
| PATCH | `/api/v1/workspaces/{slug}/members/{member_id}/` | WS Admin | 改角色 |
| DELETE | `/api/v1/workspaces/{slug}/members/{member_id}/` | WS Admin | 移除；owner 与最后一个 ADMIN 不可移除 400 |

Workspace 响应体：`{"id": "uuid", "name": "...", "slug": "amiya-ws", "owner": "user-uuid", "current_role": 20, "created_at": "..."}`。
Member 响应体：`{"id": "member-uuid", "user": {"id": "uuid", "username": "amiya", "avatar": null}, "role": 20, "created_at": "..."}`。
角色值：20=Admin / 15=Member / 5=Viewer（文档中列出）。

### 7.4 Project + State（docs/api/03-projects.md）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/workspaces/{slug}/projects/` | WS MEMBER+ | 创建；creator→项目 ADMIN；**自动预置 5 态** |
| GET | `/api/v1/workspaces/{slug}/projects/` | WS 成员 | 项目列表（分页；MVP 全量可见） |
| GET | `/api/v1/workspaces/{slug}/projects/{project_id}/` | WS 成员 | 详情；含 `current_user_role` |
| PATCH | `/api/v1/workspaces/{slug}/projects/{project_id}/` | 项目 Admin（WS Admin 视同） | |
| DELETE | `/api/v1/workspaces/{slug}/projects/{project_id}/` | 同上 | 级联删除 |
| GET | `/api/v1/workspaces/{slug}/projects/{project_id}/members/` | 项目成员 | |
| POST | `/api/v1/workspaces/{slug}/projects/{project_id}/members/` | 项目 Admin | body `{"user_id": "...", "role": 15}`；校验是 WS 成员 |
| PATCH | `/api/v1/workspaces/{slug}/projects/{project_id}/members/{member_id}/` | 项目 Admin | |
| DELETE | `/api/v1/workspaces/{slug}/projects/{project_id}/members/{member_id}/` | 项目 Admin | |
| GET | `/api/v1/workspaces/{slug}/projects/{project_id}/states/` | 项目成员 | 默认五态只读列表（D8） |

Project 创建请求：`{"name": "Amiya Project", "identifier": "AMI", "description": "..."}`；identifier 规则 `^[A-Z][A-Z0-9]{1,4}$` 且 workspace 内唯一，400 报错体含提示。
Project 响应体：`{"id": "uuid", "workspace": "ws-uuid", "name": "...", "identifier": "AMI", "description": "...", "created_by": "user-uuid", "current_user_role": 20, "created_at": "...", "updated_at": "..."}`。
State 响应体：`{"id": "uuid", "name": "Backlog", "group": "backlog", "color": "#94a3b8", "sort_order": 1}`。

### 7.5 Issue + Label（docs/api/04-issues.md）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/workspaces/{slug}/projects/{project_id}/issues/` | 项目 MEMBER+ | 创建；发号 sequence_id（D9） |
| GET | `/api/v1/workspaces/{slug}/projects/{project_id}/issues/` | 项目成员 | 列表（分页）；Sprint 3 仅 page/per_page/ordering，Sprint 5 全量过滤 |
| GET | `/api/v1/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/` | 项目成员 | 详情 |
| PATCH | 同上 | 项目 MEMBER+ | 部分更新 |
| DELETE | 同上 | 项目 MEMBER+ | 删除并记 Activity |
| GET | `.../issues/{issue_id}/` 不变；标签走子资源 ↓ | | |
| GET/POST | `.../labels/` | 读：成员；写：MEMBER+ | Label 列表/创建 |
| PATCH/DELETE | `.../labels/{label_id}/` | MEMBER+ | label 删除不影响 issue（M2M 自动清理，契约明示） |

**Issue 创建请求**：

```json
{
  "title": "登录页验证码不显示",
  "description": "复现步骤：...",
  "state_id": "uuid-可选，默认 Backlog",
  "priority": "high",
  "assignee_id": "uuid-可选，必须是项目成员",
  "label_ids": ["uuid", "uuid"]
}
```

**Issue 响应体**：

```json
{
  "id": "issue-uuid",
  "sequence_id": 7,
  "project": "project-uuid",
  "title": "登录页验证码不显示",
  "description": "...",
  "priority": "high",
  "state": {"id": "uuid", "name": "Todo", "group": "unstarted", "color": "#f59e0b"},
  "assignee": {"id": "uuid", "username": "amiya", "avatar": null},
  "created_by": {"id": "uuid", "username": "kal tsit"},
  "labels": [{"id": "uuid", "name": "bug", "color": "#ef4444"}],
  "created_at": "2026-09-09T12:00:00Z",
  "updated_at": "2026-09-09T12:30:00Z"
}
```

校验错误（400）示例：`{"assignee": ["所选用户不是该项目成员。"], "state": ["所选状态不属于该项目。"]}`。
列表查询参数（Sprint 5 全量）：`state=uuid1,uuid2` / `priority=high,urgent` / `assignee=uuid|me` / `labels=uuid1,uuid2` / `search=bug` / `ordering=-created_at` / `page=1` / `per_page=50`（多值语义与 labels 交并集在 04 契约冻结，测试按契约断言）。

### 7.6 Comment（docs/api/05-comments.md）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `.../issues/{issue_id}/comments/` | 项目成员 | 正序分页 |
| POST | `.../issues/{issue_id}/comments/` | 项目 MEMBER+ | body `{"content": "..."}` |
| PATCH | `.../issues/{issue_id}/comments/{comment_id}/` | 仅作者（WS Admin 亦可） | |
| DELETE | `.../issues/{issue_id}/comments/{comment_id}/` | 仅作者（WS Admin 亦可） | |

响应体：`{"id": "uuid", "issue": "issue-uuid", "author": {"id": "uuid", "username": "amiya", "avatar": null}, "content": "...", "created_at": "...", "updated_at": "..."}`。

### 7.7 Activity（docs/api/06-activities.md）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `.../issues/{issue_id}/activities/` | 项目成员 | 倒序分页；只读，无创建接口 |

响应体：

```json
{
  "id": "uuid",
  "actor": {"id": "uuid", "username": "amiya", "avatar": null},
  "entity_type": "issue",
  "entity_id": "issue-uuid",
  "action": "updated",
  "old_value": {"state": "Todo"},
  "new_value": {"state": "Done"},
  "created_at": "2026-09-09T12:30:00Z"
}
```

文案映射（前端拼接用，Sprint 4 冻结）：`{actor} 创建了 {entity}` / `{actor} 将 {field} 从 {old} 改为 {new}` / `{actor} 删除了 {entity}` / `{actor} 评论了 Issue #{sequence_id}`。

---

## 8. 测试策略

- 框架：Django `APITestCase` 为主（与 DRF 教学一致）；Sprint 8 后评估迁 pytest-django（不强制）。
- 组织：测试放各 app 的 `tests/` 包内，按 `test_models.py` / `test_api.py` / `test_permissions.py` 拆分；权限矩阵用 `subTest` 参数化逐格覆盖。
- 分层：API 测试直接打 HTTP 层（APIClient），不做单元测试覆盖率表演；Model 级约束与 service 层逻辑用单元测试。
- 事务类测试（并发发号、缓存失效）用 `TransactionTestCase`，注意其比 `TestCase` 慢，集中放独立模块。
- 每次 Bug Fix 必须先补复现测试再修（协作总计划 §19 红线）。
- 回归防线：权限矩阵测试 + assertNumQueries 是两条不许退化的底线。

---

## 9. 工程纪律与 AI 使用规则（摘自协作总计划 §23，后端侧落地）

AI 用于：解释概念（"Serializer 的 validate 与 validate_xx 区别"）、提问评审（"这个权限设计有什么漏洞"）、Debug 定位（"报错+代码给 AI，定位原因而不是重写"）、Review 辅助（"检查这个 PR 的权限与事务一致性"）。

红线：整模块直接生成后粘贴不算完成；每个 Sprint 的 DoD 里有一条"能脱离 AI 讲清每段代码为什么存在"。判断标准：关掉 AI 能自己定位本 Sprint 代码的 Bug。

---

## 10. 进入真实 Plane 前的自检清单（Sprint 8 通过后逐条打勾）

对应协作总计划 §42，全绿才启动 Sprint 9（源码阅读）：

- [ ] 能不看资料写出一个带对象级权限的 DRF 资源（Model→Serializer→View→Test 全链）
- [ ] 能解释本项目每个 FK 的 on_delete 选择依据
- [ ] 能解释 Session 认证全流程（含 CSRF）与 JWT 的取舍
- [ ] 能解释 404 防枚举的适用边界（什么时候该用 403）
- [ ] 能读懂并解释一条 SQL 执行计划，说清索引是否生效
- [ ] 能解释缓存失效策略在本项目的落点与风险
- [ ] 能解释一个 Celery 任务的 Retry/幂等设计
- [ ] 能解释 Channels 的握手认证与 group 广播链路
- [ ] 能在 30 分钟内给本项目新增一个端到端小功能并附测试
- [ ] 以上每条都能"现场讲"，不是"AI 帮我写的我大概知道"

---

## 附录 A：Sprint 0 环境搭建命令清单（Windows）

```powershell
# 1. Python 3.12（官网安装包或 winget；与 3.9/3.14 共存）
winget install -e --id Python.Python.3.12
py -V:Astral/CPython3.12.13 --version

# 2. pip 清华源（本机直连 PyPI 超时）
py -V:Astral/CPython3.12.13 -m pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple

# 3. 项目虚拟环境（backend/ 目录下）
py -V:Astral/CPython3.12.13 -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip

# 4. PostgreSQL 16：官网 Windows 安装器安装，记好 postgres 密码
#    建库（psql 或 pgAdmin）：
psql -U postgres -c "CREATE DATABASE miniplane ENCODING 'UTF8';"

# 5. 安装后端依赖（Sprint 0 基线）
pip install "Django==5.2.17" "djangorestframework==3.18.1" "psycopg[binary]==3.3.5" "django-environ==0.14.0" "drf-spectacular==0.30.0" "ruff==0.16.6"

# 6. 创建项目（在 backend/ 内）
django-admin startproject config .

# 7. Docker Desktop：延后到 Sprint 6 开工前安装（Redis 才需要）
winget install -e --id Docker.DockerDesktop

# 8. Windows 控制台中文报 UnicodeEncodeError 时
set PYTHONUTF8=1
```

## 附录 B：Sprint 0 的 .env.example 内容

```env
SECRET_KEY=change-me-in-real-env
DEBUG=True
ALLOWED_HOSTS=127.0.0.1,localhost
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@127.0.0.1:5432/miniplane
CORS_ALLOWED_ORIGINS=http://localhost:3000
CSRF_TRUSTED_ORIGINS=http://localhost:3000
# Sprint 6 追加：REDIS_URL=redis://127.0.0.1:6379/0
# Sprint 7 追加：CHANNEL_LAYER_REDIS_URL=redis://127.0.0.1:6379/1
```
