# Mini Plane 从 0 到真实开源贡献：前后端双人协作计划

> 项目定位：以成熟项目管理软件 Plane 为学习参照，从 0 开始共同实现一个“Mini Plane”，通过真实的前后端协作，逐步掌握 Web 全栈工程；项目成熟后，再进入 Plane 本体进行源码阅读、Issue 修复和 PR 贡献。
>
> 核心原则：**不是照抄 Plane，而是理解它解决的问题，然后自己设计、自己实现，再与真实项目进行对照。**

---

## 1. 项目总目标

### 1.1 第一目标：建立真正的工程能力

最终不是做到“页面能跑”，而是形成下面的完整闭环：

```text
需求分析
  ↓
产品/数据建模
  ↓
API Contract
  ↓
Backend / Frontend 并行开发
  ↓
联调
  ↓
测试
  ↓
Docker
  ↓
CI
  ↓
Code Review
  ↓
Release
  ↓
问题定位与迭代
```

### 1.2 第二目标：形成真实 GitHub 项目经历

项目最终应该具备：

- 清晰的 Git 历史
- Issue / Milestone / Project 管理
- Feature Branch
- Pull Request
- Code Review
- 自动化测试
- CI
- Docker 化运行
- 完整 README
- API 文档
- 前后端分工记录
- 实际版本发布

### 1.3 第三目标：从 Mini Plane 进入真实 Plane

路线不是：

```text
直接看 Plane 源码 → 看不懂 → 依赖 AI
```

而是：

```text
从 0
↓
Mini Plane
↓
理解 Web 全栈
↓
自己实现项目管理核心功能
↓
对照 Plane 架构
↓
阅读 Plane 某个子系统
↓
真实使用 Plane
↓
发现问题
↓
修复 Issue
↓
提交 PR
```

---

# 2. 双人角色定义

## 2.1 你：Backend Engineer

你承担：

- Python
- Django / Django REST Framework
- PostgreSQL
- 数据库建模
- ORM
- REST API
- Authentication
- Authorization / Permission
- Redis
- Celery / Background Task
- WebSocket / Realtime
- Backend Testing
- Docker 中的后端服务
- CI 中的后端检查
- API 文档
- 后端性能与安全基础

你的主要目标：

> **最终能够独立从数据库设计一路做到 API、权限、异步任务、实时通信和测试。**

---

## 2.2 你的同学：Frontend Engineer

你的同学承担：

- React
- TypeScript
- Next.js / 前端应用框架
- 页面结构
- Component Design
- UI / UX
- 状态管理
- 表单
- API 调用
- Error / Loading / Empty State
- WebSocket 客户端
- 前端测试
- E2E 测试
- 前端构建与 CI

他的主要目标：

> **最终能够独立把 API 转化成可靠、可维护、可交互的前端产品。**

---

# 3. 协作原则

## 3.1 不允许长期“各做各的”

错误模式：

```text
你写完后端
    ↓
“这是 API，你自己接”
    ↓
同学自己接前端
```

正确模式：

```text
需求
 ↓
双方讨论
 ↓
定义数据模型 / API Contract
 ↓
Backend + Frontend 并行开发
 ↓
联调
 ↓
双方测试
 ↓
合并
```

---

## 3.2 先约定接口，再写代码

每一个 Feature 都先产生一份简短的 API Contract。

例如：

```http
POST /api/projects/
```

Request：

```json
{
  "name": "Amiya Project",
  "identifier": "AMI"
}
```

Response：

```json
{
  "id": "project-id",
  "name": "Amiya Project",
  "identifier": "AMI",
  "created_at": "..."
}
```

必须提前确定：

- URL
- HTTP Method
- Request Body
- Query Parameters
- Response Body
- Status Code
- Authentication 要求
- Permission 要求
- Error Format

这样前后端可以真正并行开发。

---

## 3.3 Git 不直接乱推 main

推荐：

```text
main
├── develop（可选）
├── feat/backend-project-api
├── feat/backend-issue-api
├── feat/backend-auth
├── feat/frontend-project-page
├── feat/frontend-issue-page
└── feat/frontend-auth
```

原则：

- Feature 一个分支
- 一个功能尽量对应一个 PR
- 不直接向 main 推未经 review 的大改动
- PR 必须说明修改原因、测试方法和影响范围

---

# 4. 项目范围：Mini Plane MVP

第一期不要尝试复制 Plane 全部功能。

## 4.1 第一版必须有

```text
User
Workspace
Workspace Member
Project
Project Member
Issue / Work Item
Issue State
Issue Priority
Assignee
Label
Comment
Activity Log
```

核心流程：

```text
注册 / 登录
   ↓
创建 Workspace
   ↓
邀请 / 添加成员
   ↓
创建 Project
   ↓
创建 Issue
   ↓
修改状态
   ↓
分配 Assignee
   ↓
添加 Label
   ↓
发表评论
   ↓
记录 Activity
```

## 4.2 第二期再加入

- Search
- Filter
- Sort
- Board View
- Pagination
- Redis Cache
- Celery Background Task
- Email / Notification
- WebSocket Realtime Update

## 4.3 第三期再加入

- Advanced Permission
- Audit Log
- Optimistic Update
- Rate Limit
- Full-text Search
- Performance Optimization
- Observability
- Metrics
- Error Tracking

---

# 5. 数据模型设计

建议先由双方共同设计 ER 图，再分别实现。

基础模型：

```text
User
 │
 ├── WorkspaceMember ── Workspace
 │                         │
 │                         ├── Project
 │                         │      │
 │                         │      └── Issue
 │                         │            ├── State
 │                         │            ├── Assignee(User)
 │                         │            ├── Label
 │                         │            └── Comment
 │                         │
 │                         └── ProjectMember
 │
 └── Comment / ActivityLog
```

## 5.1 User

字段建议：

```text
id
username
email
password_hash
avatar
created_at
updated_at
```

## 5.2 Workspace

```text
id
name
slug
owner_id
created_at
updated_at
```

## 5.3 WorkspaceMember

```text
id
workspace_id
user_id
role
created_at
```

## 5.4 Project

```text
id
workspace_id
name
identifier
description
created_by
created_at
updated_at
```

## 5.5 Issue

```text
id
project_id
title
description
state_id
priority
assignee_id
creator_id
created_at
updated_at
```

## 5.6 Comment

```text
id
issue_id
author_id
content
created_at
updated_at
```

## 5.7 ActivityLog

```text
id
workspace_id
project_id
actor_id
entity_type
entity_id
action
old_value
new_value
created_at
```

---

# 6. 双人共同开发规范

每个 Feature 都按照同样的流程走。

## Feature 生命周期

```text
Issue
 ↓
需求确认
 ↓
数据库 / 数据结构确认
 ↓
API Contract
 ↓
Frontend Task + Backend Task
 ↓
分别开发
 ↓
联调
 ↓
测试
 ↓
Review
 ↓
Merge
 ↓
更新文档
```

---

# 7. Backend 开发流程（你）

每个后端功能必须经过：

```text
需求
 ↓
Model
 ↓
Migration
 ↓
Serializer / Schema
 ↓
View / API
 ↓
Permission
 ↓
Business Logic
 ↓
Test
 ↓
API Documentation
```

不要只做到：

```text
Model
 ↓
CRUD
 ↓
结束
```

---

# 8. Frontend 开发流程（同学）

每个前端功能必须经过：

```text
Page / Feature Design
 ↓
Component
 ↓
State
 ↓
API Integration
 ↓
Loading
 ↓
Error
 ↓
Empty State
 ↓
Permission UI
 ↓
Responsive / Interaction
 ↓
Test
```

---

# 9. 第一阶段：环境与 Git 基础

目标：两个人都能独立运行项目。

## 你

掌握：

- Python
- pip / uv
- Virtual Environment
- Git
- GitHub
- HTTP 基础
- JSON
- PostgreSQL 基础

## 同学

掌握：

- Node.js
- 包管理器
- TypeScript 基础
- React
- Git
- HTTP / JSON

## 双人共同完成

```text
Clone Repo
↓
Install
↓
Run Backend
↓
Run Frontend
↓
Run Database
↓
完成第一次 Git Commit
```

验收标准：

> 两个人各自从一个全新的目录开始，可以在本地把项目跑起来。

---

# 10. 第二阶段：项目骨架

## Backend

创建：

```text
backend/
├── manage.py
├── config/
├── apps/
│   ├── users/
│   ├── workspaces/
│   ├── projects/
│   └── issues/
├── tests/
└── requirements/
```

要求：

- App 按业务划分
- 配置与业务代码分离
- 环境变量管理
- 数据库连接独立配置
- API versioning 预留

## Frontend

创建类似：

```text
frontend/
├── app/
├── components/
├── features/
├── lib/
├── hooks/
├── services/
├── types/
└── tests/
```

要求：

- 页面与业务组件分离
- API 请求统一封装
- 类型统一管理
- 状态管理保持边界

---

# 11. 第三阶段：User / Auth

## Backend 负责

实现：

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

学习：

- 密码哈希
- Authentication
- Token / Session
- Middleware / Authentication Class
- User Context
- Error Handling

测试：

```text
test_register

test_login

test_wrong_password

test_get_current_user

test_unauthenticated_request
```

## Frontend 负责

实现：

```text
Login Page
Register Page
Logout
Current User
Protected Route
```

必须考虑：

- Loading
- Error
- 登录成功跳转
- Token / Session 状态
- 未登录访问受保护页面

## 联调验收

```text
Register
 ↓
Login
 ↓
打开 Dashboard
 ↓
显示当前用户
 ↓
Logout
 ↓
重新访问受保护页面
 ↓
被拦截
```

---

# 12. 第四阶段：Workspace / Project

这是第一个真正的业务闭环。

## Backend

实现：

```text
Workspace CRUD
Workspace Member
Project CRUD
Project Member
```

关键学习：

- Foreign Key
- Many-to-Many
- Permission
- Serializer
- Query Optimization 基础

## Frontend

实现：

```text
Workspace Switcher
Workspace Settings
Project List
Project Create
Project Detail
```

## 联调

必须验证：

```text
User A
 ↓
Workspace A
 ↓
Project A
```

不能访问：

```text
Workspace B
Project B
```

这一步是双方第一次真正接触“业务权限”。

---

# 13. 第五阶段：Issue / Work Item

这是 Mini Plane 的核心。

## Backend

实现：

```text
POST   /projects/{id}/issues
GET    /projects/{id}/issues
GET    /issues/{id}
PATCH  /issues/{id}
DELETE /issues/{id}
```

支持：

- title
- description
- state
- priority
- assignee
- label
- creator

要求：

> 每个接口都必须检查当前用户是否具有访问对应 Workspace / Project 的权限。

## Frontend

实现：

```text
Issue List
Issue Detail
Create Issue
Edit Issue
Change State
Assign User
Set Priority
Add Label
```

## 联调验收

完整走通：

```text
打开 Project
 ↓
创建 Issue
 ↓
Issue 出现在列表
 ↓
打开 Issue
 ↓
修改 State
 ↓
修改 Priority
 ↓
Assign 用户
 ↓
刷新页面
 ↓
数据仍然正确
```

---

# 14. 第六阶段：Comment + Activity Log

这是从“CRUD”走向“业务系统”的关键一步。

## Comment

Backend：

```text
POST /issues/{id}/comments
GET  /issues/{id}/comments
PATCH /comments/{id}
DELETE /comments/{id}
```

Frontend：

```text
Comment List
Comment Input
Edit Comment
Delete Comment
```

## Activity Log

当发生：

```text
Create Issue
Change State
Change Priority
Assign User
Add Label
Comment
```

都记录事件。

例如：

```text
User A changed Issue #123
status: Todo → Done
```

这一阶段开始学习：

- Event
- Audit Trail
- History
- Domain Change Tracking

---

# 15. 第七阶段：Search / Filter / Pagination

## Backend

实现：

```text
Search
Filter
Sort
Pagination
```

例如：

```http
GET /projects/{id}/issues?
    state=todo&
    priority=high&
    assignee=123&
    search=bug&
    page=1
```

学习：

- Query Parameters
- ORM Filtering
- Index
- Pagination
- Query Performance

## Frontend

实现：

```text
Search Box
Filter Dropdown
Sort
Pagination
Clear Filter
```

重点不是“做一个漂亮筛选框”，而是理解：

```text
UI Filter
 ↓
URL / State
 ↓
HTTP Query
 ↓
Backend Query
 ↓
Database
```

---

# 16. 第八阶段：Redis

注意：Redis 不应该为了“增加技术栈”而加入。

必须有实际问题。

例如：

```text
Project Detail
 ↓
频繁读取
 ↓
Redis Cache
 ↓
减少数据库读取
```

需要学习：

- Cache Key
- TTL
- Cache Hit / Miss
- Invalidation
- 一致性问题

双方协作：

Backend：负责 Cache。

Frontend：验证缓存导致的数据更新问题，并配合刷新策略。

---

# 17. 第九阶段：Celery / Background Task

选择真正适合异步执行的任务，例如：

```text
创建大量 Activity
发送通知
批量处理数据
异步生成报告
```

架构：

```text
Frontend
   ↓
API
   ↓
Database
   ↓
Task Queue
   ↓
Worker
   ↓
Background Job
```

你负责：

- Task
- Retry
- Failure Handling
- Idempotency 基础

同学负责：

- Job 状态展示
- Notification
- Loading / Success / Error UI

---

# 18. 第十阶段：WebSocket Realtime

这是 Mini Plane 的高级阶段。

目标：

> 两个浏览器打开同一个 Project，其中一个人修改 Issue，另一个页面可以实时收到更新。

例如：

```text
Browser A
   ↓
PATCH Issue
   ↓
Backend
   ↓
Database
   ↓
Event
   ↓
WebSocket
   ↓
Browser B
```

Backend 重点：

- Connection
- Authentication
- Channels / Rooms
- Event Payload
- Broadcast
- Reconnect 思路

Frontend 重点：

- WebSocket Client
- Connection State
- Reconnect
- Optimistic / Server State
- Conflict 基础处理

这一阶段已经进入非常有价值的工程能力区间。

---

# 19. 第十一阶段：Testing

## Backend 必须有

```text
Unit Test
Integration Test
API Test
Permission Test
```

最低要求：

```text
正常请求
非法请求
未登录
无权限
不存在资源
边界条件
```

## Frontend 必须有

```text
Component Test
Interaction Test
E2E Test
```

至少覆盖：

```text
Login
Create Project
Create Issue
Edit Issue
Permission
```

## 双人要求

任何 Bug Fix：

```text
Bug
 ↓
Reproduce
 ↓
Add Regression Test
 ↓
Fix
 ↓
Run Test
```

不要只修代码，不补测试。

---

# 20. 第十二阶段：Docker / CI

## Docker

最终达到：

```text
docker compose up
```

启动：

```text
Frontend
Backend
PostgreSQL
Redis
Worker
```

## CI

每个 PR 自动运行：

```text
Lint
Format Check
Type Check
Backend Test
Frontend Test
Build
```

PR 没通过 CI，不合并。

---

# 21. GitHub Issue / PR 协作制度

## Issue 创建格式

```markdown
## Problem

描述问题。

## Expected Behavior

期望行为。

## Actual Behavior

当前行为。

## Scope

Backend / Frontend / Full-stack

## Acceptance Criteria

- [ ] xxx
- [ ] xxx
- [ ] xxx
```

## PR 描述格式

```markdown
## What

做了什么。

## Why

为什么做。

## How

怎么实现。

## Testing

如何验证。

## Screenshots / API Example

如有需要附上。

## Breaking Changes

是否存在破坏性修改。
```

---

# 22. Code Review 分工

## 你 Review 同学的后端关联代码时

重点检查：

- API Contract 是否一致
- 错误状态是否正确处理
- Permission 是否可靠
- 数据结构是否合理
- 是否产生不必要的数据库查询
- 是否有测试

## 同学 Review 你的 API 时

重点检查：

- Frontend 是否容易调用
- Response 是否稳定
- Error Format 是否统一
- 字段命名是否清楚
- 是否需要额外请求才能完成一个页面

## 双人共同遵守

Review 不是“找毛病”，而是：

> **让代码在别人接手时仍然容易理解。**

---

# 23. AI 使用规则

AI 可以用，但不能把整个项目交给 AI 生成。

## 推荐用法

### 1. 解释

```text
“解释这个 Django Serializer 为什么这样设计。”
```

### 2. 提问

```text
“这个数据库关系有什么潜在问题？”
```

### 3. Debug

```text
“这是我的报错和相关代码，帮我定位原因，不要直接重写。”
```

### 4. Review

```text
“帮我检查这个 PR 有没有权限和事务一致性问题。”
```

### 5. 学习真实项目

```text
“请告诉我阅读这个 Plane 模块时应该重点看什么。”
```

## 不推荐

```text
“帮我把整个 Issue 模块写完。”
```

然后直接复制粘贴。

判断自己是否真正掌握的标准：

> **没有 AI 时代码也能自己解释，并且能定位 Bug。**

---

# 24. 从 Mini Plane 进入真实 Plane

当 Mini Plane 达到以下条件后，再进入 Plane：

```text
✅ 能自己写 CRUD API
✅ 能解释数据库关系
✅ 能实现登录
✅ 能实现权限
✅ 能写测试
✅ 能理解 Redis
✅ 能理解异步任务
✅ 能理解 WebSocket 基础
✅ 能阅读一个中型 Django 项目
✅ 能看懂一个完整 Feature 的请求链路
```

然后开始：

```text
运行 Plane
 ↓
使用 Plane
 ↓
选择一个子系统
 ↓
找到对应 Backend Code
 ↓
画调用链
 ↓
阅读 Model
 ↓
阅读 Serializer
 ↓
阅读 View / Service
 ↓
阅读 Task / Event
 ↓
找到 Test
```

---

# 25. Plane 源码学习策略

不要从整个仓库开始。

采用：

```text
Feature First
```

例如选择：

```text
Issue
```

然后问：

```text
用户点击创建 Issue
 ↓
前端调用哪个 API？
 ↓
API 在哪里？
 ↓
Serializer 在哪里？
 ↓
Model 在哪里？
 ↓
Permission 在哪里？
 ↓
数据库怎么变化？
 ↓
有没有 Event / Task？
 ↓
有没有测试？
```

最终画成：

```text
Browser
 ↓
Frontend API Client
 ↓
Django Endpoint
 ↓
Serializer
 ↓
Business Logic
 ↓
ORM
 ↓
PostgreSQL
 ↓
Event / Background Task
 ↓
Response
```

---

# 26. 第一个真实 Plane PR 的目标

不要追求“大功能”。

第一个 PR 的理想形态：

```text
发现 Issue
 ↓
成功复现
 ↓
定位源码
 ↓
理解原因
 ↓
写修复
 ↓
补测试
 ↓
本地通过
 ↓
提交 PR
 ↓
接受 Review
 ↓
根据反馈修改
 ↓
Merge
```

成功标准不是“PR 一发出去”。

而是：

> **你真正理解自己修改的每一行代码为什么存在。**

---

# 27. 推荐开发节奏

不按“学完再做”推进。

采用：

```text
学一点
 ↓
马上用
 ↓
遇到问题
 ↓
查资料
 ↓
解决
 ↓
总结
```

每周项目节奏可以是：

```text
周初：需求 / Issue
 ↓
中期：Backend + Frontend 并行
 ↓
中后期：联调
 ↓
周末：测试 / Review / Merge
```

---

# 28. 每个 Sprint 的固定会议

建议每次只进行短时间同步，不需要复杂 Scrum。

## 开始前

回答三个问题：

```text
1. 这次做什么？
2. API 怎么设计？
3. 谁负责什么？
```

## 联调前

回答：

```text
1. Backend 是否完成？
2. Frontend 是否完成？
3. API Contract 有没有变化？
```

## 合并前

回答：

```text
1. 测试通过了吗？
2. 有没有权限问题？
3. 有没有明显回归？
4. 文档是否更新？
```

---

# 29. 第一阶段具体任务清单

## Sprint 0：准备

### 共同

- [ ] 建立 GitHub Repository
- [ ] 建立 README
- [ ] 建立 Issue Template
- [ ] 建立 PR Template
- [ ] 建立项目目录
- [ ] 建立开发规范
- [ ] 建立 `.env.example`
- [ ] 约定 Branch Naming
- [ ] 约定 Commit Message

### Backend

- [ ] 安装 Python
- [ ] 安装 Django
- [ ] 安装 DRF
- [ ] 安装 PostgreSQL
- [ ] 创建项目
- [ ] 成功连接数据库
- [ ] 建立第一个 API

### Frontend

- [ ] 安装 Node.js
- [ ] 创建前端项目
- [ ] 配置 TypeScript
- [ ] 建立 Router
- [ ] 建立基础 Layout
- [ ] 完成一个测试页面

### 验收

```text
Backend 跑起来
Frontend 跑起来
Database 跑起来
GitHub 正常协作
```

---

# 30. Sprint 1：Auth

### Backend

- [ ] User
- [ ] Register
- [ ] Login
- [ ] Logout
- [ ] Current User
- [ ] Authentication
- [ ] Tests

### Frontend

- [ ] Register
- [ ] Login
- [ ] Logout
- [ ] Protected Route
- [ ] Current User

### 联调

- [ ] 注册
- [ ] 登录
- [ ] 获取当前用户
- [ ] 登出
- [ ] 未登录访问拦截

---

# 31. Sprint 2：Workspace / Project

### Backend

- [ ] Workspace Model
- [ ] Workspace Member
- [ ] Project Model
- [ ] Project Member
- [ ] CRUD API
- [ ] Permission
- [ ] Tests

### Frontend

- [ ] Workspace UI
- [ ] Workspace Switch
- [ ] Project List
- [ ] Project Create
- [ ] Project Detail

### 联调

- [ ] 创建 Workspace
- [ ] 创建 Project
- [ ] 添加 Member
- [ ] 权限验证

---

# 32. Sprint 3：Issue

### Backend

- [ ] Issue Model
- [ ] State
- [ ] Priority
- [ ] Assignee
- [ ] Label
- [ ] CRUD API
- [ ] Permission
- [ ] Tests

### Frontend

- [ ] Issue List
- [ ] Issue Detail
- [ ] Issue Create
- [ ] Issue Edit
- [ ] State Change
- [ ] Assignee
- [ ] Priority
- [ ] Label

### 联调

- [ ] 创建 Issue
- [ ] 修改 Issue
- [ ] 刷新保持正确
- [ ] 无权限用户无法访问

---

# 33. Sprint 4：Comment / Activity

### Backend

- [ ] Comment
- [ ] ActivityLog
- [ ] Event Recording
- [ ] Tests

### Frontend

- [ ] Comment List
- [ ] Comment Create
- [ ] Comment Edit
- [ ] Activity Timeline

### 验收

```text
Issue 修改
 ↓
Activity 自动出现
```

---

# 34. Sprint 5：Search / Filter

### Backend

- [ ] Search
- [ ] Filter
- [ ] Sort
- [ ] Pagination
- [ ] Index 基础
- [ ] API Tests

### Frontend

- [ ] Search Box
- [ ] Filter
- [ ] Sort
- [ ] Pagination
- [ ] URL Sync

---

# 35. Sprint 6：Redis / Celery

### Backend

- [ ] Redis
- [ ] Cache
- [ ] Cache Invalidation
- [ ] Celery
- [ ] Background Task
- [ ] Retry / Failure Handling

### Frontend

- [ ] Async State
- [ ] Background Task Feedback
- [ ] Notification

---

# 36. Sprint 7：Realtime

### Backend

- [ ] WebSocket
- [ ] Authentication
- [ ] Project Room
- [ ] Issue Event
- [ ] Broadcast
- [ ] Reconnect 思路

### Frontend

- [ ] WebSocket Client
- [ ] Reconnect
- [ ] Realtime Update
- [ ] Connection State

### 验收

```text
浏览器 A 修改 Issue
 ↓
浏览器 B 自动更新
```

---

# 37. Sprint 8：工程化

共同：

- [ ] Docker
- [ ] Docker Compose
- [ ] CI
- [ ] Lint
- [ ] Format
- [ ] Tests
- [ ] Build
- [ ] README
- [ ] Architecture Diagram
- [ ] Deployment Documentation

最终要求：

```bash
docker compose up
```

即可启动主要服务。

---

# 38. Sprint 9：真实 Plane 源码阅读

## 你重点研究

- Django Project Structure
- API Layer
- Model Layer
- Permission
- Background Task
- Redis
- Realtime
- Tests

## 同学重点研究

- Next.js / React Architecture
- Component Structure
- State Management
- API Client
- Realtime UI
- E2E

## 双方共同

选择同一个 Feature：

```text
Issue
```

你研究后端，他研究前端。

最后一起画：

```text
Frontend
   ↓
API
   ↓
Backend
   ↓
Database
   ↓
Event
   ↓
Realtime
```

---

# 39. Sprint 10：真实开源贡献

## 第一个 Issue

要求尽量满足：

- 范围明确
- 可以本地复现
- 后端边界清楚
- 能写测试
- 不涉及大规模重构

## 你的执行链

```text
Issue
 ↓
Reproduce
 ↓
Source Reading
 ↓
Root Cause
 ↓
Implementation
 ↓
Tests
 ↓
PR
 ↓
Review
 ↓
Revision
 ↓
Merge
```

## 你的同学

同时寻找适合前端的 Issue。

最终形成：

```text
你：Backend PR
同学：Frontend PR
```

然后共同处理一个跨前后端 Feature。

---

# 40. 项目最终产物

项目完成后，GitHub 仓库至少应该有：

```text
README.md
ARCHITECTURE.md
API.md
CONTRIBUTING.md
CHANGELOG.md
.env.example
Docker Compose
CI Workflow
Backend Tests
Frontend Tests
```

README 中应该能够回答：

```text
这是什么？
为什么做？
怎么运行？
技术栈是什么？
架构是什么？
目录怎么组织？
API 怎么调用？
如何贡献？
```

---

# 41. 简历目标

不要提前写“做过”没有完成的事情。

只有实际完成后，才可以根据真实工作内容整理成类似：

```text
Designed and implemented a full-stack collaborative project management platform with Django REST Framework, PostgreSQL, Redis, asynchronous background jobs and WebSocket-based realtime updates.
```

以及：

```text
Designed RESTful APIs, authentication and workspace/project-level authorization, with automated backend tests covering core business and permission scenarios.
```

以及：

```text
Collaborated through GitHub Issues, feature branches, pull requests and code review, and contributed fixes to an established open-source project.
```

这些内容的前提是：**确实完成，并且能够现场解释。**

---

# 42. 最终能力验收

## 你（Backend）达到以下程度才算第一阶段完成

### 基础

- [ ] 能解释 HTTP Request / Response
- [ ] 能独立写 Django API
- [ ] 能使用 PostgreSQL
- [ ] 能使用 ORM
- [ ] 能设计关系型数据库

### 工程

- [ ] 能做 Authentication
- [ ] 能做 Authorization
- [ ] 能写测试
- [ ] 能使用 Redis
- [ ] 能使用 Celery
- [ ] 能理解 WebSocket
- [ ] 能使用 Docker
- [ ] 能配置 CI

### 真实项目

- [ ] 能阅读一个大型 Django 项目
- [ ] 能跟踪一个 Feature 的完整调用链
- [ ] 能定位 Bug
- [ ] 能修改陌生代码
- [ ] 能提交 PR
- [ ] 能根据 Review 修改代码

---

# 43. 最终能力验收：Frontend

### 基础

- [ ] 能独立写 React 页面
- [ ] 能理解 TypeScript 类型
- [ ] 能调用 REST API
- [ ] 能管理页面状态

### 工程

- [ ] 能拆分组件
- [ ] 能处理 Loading / Error / Empty
- [ ] 能处理权限 UI
- [ ] 能做 WebSocket UI
- [ ] 能写 E2E
- [ ] 能使用 Docker
- [ ] 能使用 CI

### 真实项目

- [ ] 能读大型 React / Next.js 项目
- [ ] 能定位 UI Bug
- [ ] 能修改陌生组件
- [ ] 能写高质量 PR
- [ ] 能参与 Code Review

---

# 44. 整体路线总图

```text
                         从 0 开始
                              │
                              ▼
                    Git / HTTP / 基础环境
                              │
                              ▼
                     Mini Plane 设计
                              │
                              ▼
                ┌─────────────┴─────────────┐
                │                           │
                ▼                           ▼
             Backend                    Frontend
              你                           同学
                │                           │
                ▼                           ▼
           Django / DRF                 React / TS
                │                           │
                └─────────────┬─────────────┘
                              ▼
                         API Contract
                              │
                              ▼
                         Auth / User
                              │
                              ▼
                      Workspace / Project
                              │
                              ▼
                           Issue
                              │
                              ▼
                     Comment / Activity
                              │
                              ▼
                       Search / Filter
                              │
                              ▼
                           Redis
                              │
                              ▼
                           Celery
                              │
                              ▼
                         WebSocket
                              │
                              ▼
                        Testing / CI
                              │
                              ▼
                           Docker
                              │
                              ▼
                      Mini Plane 完成
                              │
                              ▼
                     对照真实 Plane
                              │
                              ▼
                       阅读真实源码
                              │
                              ▼
                         找到 Issue
                              │
                              ▼
                         修复 + 测试
                              │
                              ▼
                           PR
                              │
                              ▼
                       开源贡献经历
```

---

# 45. 最重要的三条纪律

## 第一条：不追求“做得像 Plane”

追求：

> **理解为什么这么做。**

## 第二条：不追求“技术栈越多越好”

每引入一种技术，都必须回答：

```text
为什么需要它？
它解决什么问题？
不用它有什么代价？
```

## 第三条：不追求“AI 生成得越快越好”

真正的目标是：

```text
AI 帮助你学习
        ↓
你自己理解
        ↓
你自己修改
        ↓
你自己 Debug
        ↓
你最终能够独立完成
```

---

# 46. 当前开工顺序

不要一次把整个项目全部做完。

现在只做下面这条链：

```text
① 建 GitHub Repo
        ↓
② 建 Issue / PR 规范
        ↓
③ 你搭 Django + PostgreSQL
        ↓
④ 同学搭 React + TypeScript
        ↓
⑤ 双方共同确定数据库 ER 图
        ↓
⑥ 双方共同确定 Auth API
        ↓
⑦ 你完成 Auth Backend
        ↓
⑧ 同学完成 Auth Frontend
        ↓
⑨ 第一次联调
        ↓
⑩ Code Review + Merge
```

**不要同时开始 Redis、Celery、WebSocket。**

先把：

```text
User
 ↓
Login
 ↓
Workspace
 ↓
Project
 ↓
Issue
```

这条最基本的业务链跑通。

跑通之后，再逐层加复杂度。

---

# 47. 终极目标

这个项目真正想培养的不是：

> “我会 Django / React。”

而是：

> **“我能和另一个开发者一起，把一个真实的软件系统从需求、数据模型、API、前端、测试、部署一路做出来；当面对一个陌生的大型开源项目时，我也能够读懂它、定位问题并贡献代码。”**

这就是从“AI 编程使用者”走向“真正的软件工程实践者”的核心路线。
