# Mini Plane 产品重构计划（PRODUCT_REFACTOR_PLAN）

> 状态：**已采纳，执行中**（2026-09-30 收束）
> 版本路线：v0.3.0 Personal Engineering Foundation → v1.0.0 Personal Engineering Management Platform
> Sprint 顺序：09 Product Foundation → 10 Project Plan → 11 Worklog → 12 Agent Local API →
> 13 Agent Session → 14 Island MVP → 15 Desktop Island → 16 Island Polish → 17 Team Mode
> 执行约定：每 Sprint 收尾 = 功能 + API 契约 + 后端测试 + 前端测试 + E2E + UI 验收 + Devlog + README 更新；
> 每阶段 commit + push 并核对远端 CI；全部完成后做一次全局安全性与全局代码检查。
> 附加架构约束（用户）：**轻量且高效**——从架构上降低本机占用（聚合查询避免 N+1、
> 默认不启 Redis/worker、桌面进程数最小化等，见各 Sprint 实现说明）。

---

我觉得现在已经可以把前面的讨论正式收束成一份**真正可执行的 Mini Plane 重构方案**了。

我重新对照了你仓库目前的 README、`DESIGN.md`、现有 `My Work`、Issue/Activity 服务以及桌面启动器之后，最重要的结论是：

> **不要重写 Mini Plane。**
>
> 应该把现在的 Mini Plane 从“Plane 的个人/团队简化复刻”，演进成一个以“个人工程管理”为第一体验、同时保留团队协作能力的本地工程管理系统。

下面这份可以直接作为下一阶段开发的总计划。建议未来落到仓库里的文件名就是：

`docs/PRODUCT_REFACTOR_PLAN.md`

---

# Mini Plane 产品重构计划

## 0. 重构目标

### 0.1 新产品定位

Mini Plane 不再以“仿 Plane 的迷你项目管理软件”作为最终产品定位。

新的核心定位：

> **面向个人开发者的工程项目管理与 AI Agent 协同平台。**

进一步概括为：

> **管理项目如何被推进，而不仅仅是管理项目有哪些任务。**

核心关键词：

```text
Personal Engineering
Project Planning
Engineering Log
Task Tracking
Agent Sync
Desktop Presence
```

---

# 1. 为什么不是推倒重来

当前系统实际上已经具备非常完整的基础设施：

```text
Auth
Workspace
Project
Issue
State
Label
Comment
Activity
Realtime
My Work
Command Palette
Desktop App
SQLite
PostgreSQL
Celery
WebSocket
Playwright
CI
```

这些能力并不因为产品转向个人工程管理而失去价值。

因此采用：

> **底层复用 + 领域扩展 + 信息架构重构 + UI 重心迁移**

而不是：

> 删除现有系统 → 重新写一个个人项目管理软件。

---

# 2. 最终产品结构

整体产品分成两个层次。

```text
                         Mini Plane
                              │
              ┌───────────────┴───────────────┐
              │                               │
       Personal Engineering            Collaboration
              │                               │
       我的工程 / My Engineering           Workspace
              │                               │
       Project / Plan / Stage              Project
              │                               │
       Task / Worklog / Agent              Issue
              │                               │
      Engineering Island              Activity / Comment
```

**个人工程模式是默认体验。**

团队协作模式作为现有能力保留下来，而不是删除。

---

# 3. 核心产品模型重新定义

这是本次重构最重要的一层。

以前：

```text
Workspace
  └── Project
       └── Issue
```

以后：

```text
My Engineering
  └── Project
       ├── Plan
       ├── Stage
       │    └── Task
       ├── Worklog
       ├── Blocker
       └── Activity
```

其中：

### Project

回答：

> 我正在做什么工程？

### Plan

回答：

> 这个工程最终准备做到什么程度？

### Stage

回答：

> 当前工程走到哪一个阶段？

### Task

回答：

> 当前阶段具体要做哪些事情？

### Worklog

回答：

> 今天实际完成了什么？

### Blocker

回答：

> 为什么工程现在不能继续？

### Activity

回答：

> 系统发生过什么变化？

---

# 4. Task 与 Worklog 必须严格分开

这是产品从“普通任务管理”走向“工程管理”的核心。

## Task

表达计划。

```text
我要做：
修复 TTS 长文本漏字问题
```

## Worklog

表达实际工程过程。

```text
2026-10-01

完成：
- 更换参考音频
- 重新训练模型
- 测试 6 组长文本

结果：
217 字文本已稳定。
260 字文本仍偶尔出现 3~5 字漏读。

结论：
参考音频改善了音质，但没有完全解决长文本稳定性。

下一步：
继续测试 GPTTTS 推理参数。

关联任务：
AMI-27
```

因此：

> **Task 是计划，Worklog 是证据。**

这一点会让 Mini Plane 和 Todoist、Linear、Plane 一类产品产生真正的区别。

---

# 5. Global Plan / Stage 体系

建议新增 `ProjectPlan` 和 `ProjectStage` 两个概念。

例如 Amiya-Agent：

```text
Amiya-Agent

GLOBAL PLAN
──────────────────────────────

01 基础 Agent
02 UI
03 TTS
04 Emotion
05 Integration
06 Release
```

当前：

```text
● STAGE 03 · TTS
```

Stage 内：

```text
TTS
├── 完成基础 GPTTTS 接入       ✓
├── 完成训练                   ✓
├── 处理漏字                   ●
├── 情绪表现优化               ○
└── 长文本稳定性               ○
```

---

# 6. 项目进度不要单纯依赖一个百分比

你之前提出“岛里不能只放百分比”，这个问题其实在产品层面也应该解决。

不要让：

```text
72%
```

成为唯一的进度表达。

建议：

```text
PROJECT PROGRESS

STAGE 03 / 06
TTS STABILITY

██████████████░░░░ 72%
```

也就是说：

> **百分比是辅助信息，阶段和当前任务才是主信息。**

第一阶段实现可以比较简单：

```text
Project
 └── Stage
      ├── weight
      └── progress
```

项目总体进度：

```text
Σ StageWeight × StageProgress
```

后续再进一步：

```text
Stage
 └── Tasks
      └── completed / total
```

使 Stage Progress 可以部分自动计算。

---

# 7. 首页重构：从 Workspace Dashboard → My Engineering

这是前端最先需要改变的地方。

你目前的首页实际上还是：

```text
Workspaces
    ↓
Projects
```

这非常符合团队管理软件，但不符合你的真实使用方式。

应该变成：

# MY ENGINEERING

顶部：

```text
MY ENGINEERING

3 ACTIVE PROJECTS
2 TASKS TODAY
1 AGENT RUNNING
```

下面是项目。

```text
┌────────────────────────────────────────────┐
│ AMIYA-AGENT                                │
│ TTS Stability                              │
│                                            │
│ STAGE 03 · 72%                             │
│ ███████████████░░░░                        │
│                                            │
│ NOW                                        │
│ 验证长文本漏字                             │
│                                            │
│ NEXT                                       │
│ 整理实验结果                               │
└────────────────────────────────────────────┘
```

然后：

```text
EMOWAVE
MINI PLANE
```

形成你的个人工程总览。

---

# 8. Workspace 在 UI 中降级，而不是删除

这是这次重构很重要的取舍。

### 个人模式

默认用户看到：

```text
My Engineering
Projects
Today
Worklogs
```

而不是：

```text
Workspace
Members
Roles
```

### 团队模式

原有功能继续存在：

```text
Workspace
Members
Roles
Project
Issue
Comments
Activity
Realtime
```

换句话说：

> **Workspace 从“产品中心概念”下降成“协作基础设施”。**

后端完全可以先不动。

甚至可以默认创建一个：

```text
Personal Workspace
```

UI 把它隐藏掉。

这样可以极大降低数据迁移成本。

---

# 9. Project 页面重构

现在 Project 页面是典型的：

```text
Project
 ↓
Issue List
```

以后应该变成：

```text
PROJECT

Amiya-Agent
────────────────────────────────────────────

GLOBAL PLAN
06 stages

CURRENT STAGE
03 · TTS Stability

PROGRESS
72%

NOW
验证长文本稳定性

TODAY
完成参考音频实验

NEXT
测试新的推理参数

────────────────────────────────────────────

TASKS

AMI-27 ...
AMI-28 ...
AMI-29 ...

────────────────────────────────────────────

ENGINEERING LOG

2026-10-01
2026-09-30
2026-09-29
```

Issue List 不消失。

它变成项目中的一个区域：

> **Tasks**

而不是整个项目。

---

# 10. 新增 Worklog

建议新增：

```text
backend/apps/worklogs/
```

模型初步：

```python
Worklog
    id
    project
    stage
    author
    date
    title
    summary
    details
    conclusion
    next_step
    blocker
    created_at
    updated_at
```

后续可以加入：

```text
related_tasks
related_commit
source
agent_session
```

其中 `source` 可以：

```text
manual
agent
imported
```

这样将来可以明确知道：

> 这条工程日志是谁产生的。

---

# 11. Markdown 不要被数据库取代

这一点我非常建议坚持。

你现在的开发方式本身已经形成了：

```text
Agent
 ↓
执行工程
 ↓
写 Markdown Devlog
```

不要因为 Mini Plane 出现就把 Markdown 删除。

应该形成：

```text
Markdown
    ↓
原始工程记录
```

而：

```text
Mini Plane
    ↓
结构化工程索引 + 可视化
```

例如：

```text
docs/devlog/
└── 2026-10-01-tts-stability.md
```

Mini Plane 中显示：

```text
2026-10-01
TTS 稳定性实验

完成：
参考音频重新训练……

结论：
……

下一步：
……
```

并记录原始文件路径：

```text
source:
docs/devlog/2026-10-01-tts-stability.md
```

---

# 12. Agent Sync：Mini Plane 的真正核心能力

这是本项目后期最有价值的技术点之一。

不要让 Agent：

```text
打开浏览器
 ↓
找 Mini Plane
 ↓
点击按钮
 ↓
填写表单
```

这种 UI Automation 很脆弱。

应该：

```text
Agent
  ↓
Local REST API
  ↓
Mini Plane Backend
  ↓
Database
  ↓
Realtime
  ↓
UI
```

进一步可以支持：

```text
CLI
REST API
MCP
```

形成：

```text
Agent Integration Layer
```

---

# 13. Agent API 第一版

建议 API 以“工程动作”为中心，而不是简单 CRUD。

例如：

```text
GET    /api/v1/projects/:id
```

```text
POST   /api/v1/projects/:id/progress
```

```text
POST   /api/v1/tasks
```

```text
PATCH  /api/v1/tasks/:id
```

```text
POST   /api/v1/tasks/:id/start
```

```text
POST   /api/v1/tasks/:id/complete
```

```text
POST   /api/v1/worklogs
```

```text
POST   /api/v1/stages/:id/progress
```

```text
POST   /api/v1/blockers
```

---

# 14. 更进一步：Agent Event

后续不要让 Agent 只发送数据库 CRUD。

而是发送工程事件：

```json
{
  "event": "task.started",
  "project": "amiya-agent",
  "task": "AMI-27"
}
```

或者：

```json
{
  "event": "worklog.created",
  "project": "amiya-agent"
}
```

系统接收到 Event：

```text
Event
 ↓
Service
 ↓
DB
 ↓
Activity
 ↓
WebSocket
 ↓
Engineering Island
```

这样你目前已经做好的 Realtime 系统就有了新的用途。

以前：

> A 用户修改任务 → B 用户看到

以后：

> Agent 修改工程状态 → 你的桌面实时看到

这会让原有 WebSocket 架构重新焕发价值。

---

# 15. Agent 权限模型

这个一定要提前定死。

建议：

```text
LEVEL 1
Global Plan
↓
Human only

LEVEL 2
Stage Goal
↓
Human defines
Agent may propose

LEVEL 3
Task
↓
Human / Agent

LEVEL 4
Worklog
↓
Agent can automatically create

LEVEL 5
Activity
↓
System generated
```

尤其是：

> **Agent 不允许静默修改 Global Plan。**

否则最后会变成 Agent 自己决定项目要做什么。

---

# 16. Engineering Island 正式成为产品功能

建议正式命名：

# Engineering Island

它不是普通 Notification。

它是：

> **当前工程状态的桌面实时投影。**

---

# 17. Engineering Island 的核心信息结构

单项目岛：

```text
┌───────────────────────────────────────────┐
│ AMI · SHEET 03 / 08              ● LIVE  │
│                                           │
│ TTS Stability                     72%    │
│ ███████████████░░░░                      │
│                                           │
│ NOW                                       │
│ 验证 216–260 字长文本                    │
│                                           │
│ TODAY                                     │
│ ✓ 参考音频重新训练                       │
│ ✓ 推理参数调整                           │
│ ✓ 6 组测试                               │
│                                           │
│ NEXT                                      │
│ 整理实验结果                             │
│                                           │
│ AGENT · RUNNING                           │
└───────────────────────────────────────────┘
```

这就是一个 Project Sheet。

---

# 18. 灵动岛的三种状态

## Resting

最小状态。

```text
┌─────────────────────────────────┐
│ AMI · TTS STABILITY       72% ●│
└─────────────────────────────────┘
```

大约：

```text
40–48px
```

尽量不打扰工作。

---

## Focus

鼠标靠近 / 点击。

```text
┌─────────────────────────────────────────┐
│ AMI · SHEET 03 / 08             ● LIVE │
│                                         │
│ TTS Stability                     72%  │
│                                         │
│ NOW                                     │
│ 验证长文本漏字                         │
│                                         │
│ TODAY                                   │
│ ✓ 参考音频                             │
│ ✓ 推理参数                             │
│                                         │
│ NEXT                                    │
│ 整理实验结论                           │
│                                         │
│ AGENT · RUNNING                         │
└─────────────────────────────────────────┘
```

---

## Expanded

需要操作时展开成真正的工程 Sheet。

这里可以出现：

```text
Task
Worklog
Stage
Agent Session
Blocker
```

---

# 19. 左右滑动不是“切换任务”，而是“翻工程图纸”

这是 Engineering Island 最核心的交互。

例如：

```text
        Emowave       Amiya-Agent       Mini Plane
           │              │                │
           └──────────────┼────────────────┘
                          ↑
                       current
```

当前：

```text
┌──────────────┐ ┌─────────────────────────┐ ┌──────────────┐
│ EMOWAVE      │ │ AMI · SHEET 03          │ │ MINI PLANE   │
│              │ │                         │ │              │
│ 68%          │ │ TTS Stability     72%  │ │ 31%          │
└──────────────┘ └─────────────────────────┘ └──────────────┘
```

用户左右滑动。

整张 Sheet 换掉。

因此：

> **一个 Project = 一个 Island Page。**

---

# 20. 视觉设计必须继承 Blueprint Editorial

这一点作为硬约束加入设计规范。

Engineering Island **禁止突然变成黑色科技胶囊**。

继续使用：

```text
#F4F1EA
#EBE7DD
#D9D4C2
#1B1A17
#1F3FA8
```

继续：

```text
0.5px border
Blueprint Grid
Cormorant Garamond
Inter
JetBrains Mono
```

继续：

```text
直角
细线
十字准星
工程编号
sheet
fig
rev
坐标
```

不使用：

```text
渐变
毛玻璃
大圆角
霓虹
发光
厚重阴影
Emoji
```

这样用户看到 Island 时应该产生的感觉是：

> **“Mini Plane 的一块纸从屏幕顶部垂下来了。”**

而不是：

> “我电脑上突然出现了一个别的 App。”

---

# 21. Desktop 架构扩展

你现在桌面版已经是：

```text
pywebview
   ↓
Django
   ↓
Next.js
   ↓
SQLite
```

这个基础很好，不需要推翻。

新增：

```text
MiniPlane.exe
   │
   ├── Main Window
   │
   └── Engineering Island Window
```

以后：

```text
Main Window
    ↓
完整项目管理
```

```text
Engineering Island
    ↓
始终置顶
    ↓
实时显示当前项目
```

两个窗口通过：

```text
WebSocket
```

保持同步。

---

# 22. Island 不应该只是一个 CSS 组件

工程上建议把它看成独立桌面能力：

```text
desktop/
├── launcher.py
├── island.py
└── window_manager.py
```

前端：

```text
frontend/features/engineering-island/
```

例如：

```text
EngineeringIsland
IslandProjectCard
IslandCarousel
IslandProgress
IslandNow
IslandToday
IslandNext
IslandAgentStatus
```

这样后续维护不会污染普通 App Shell。

---

# 23. 数据流

最终完整数据流：

```text
                 Human
                   │
                   ↓
             Global Plan
                   │
                   ↓
                Stage
                   │
                   ↓
                 Task
                   │
          ┌────────┴────────┐
          ↓                 ↓
        Human              Agent
          │                 │
          └────────┬────────┘
                   ↓
               Execution
                   │
                   ↓
               Worklog
                   │
                   ↓
               Activity
                   │
             ┌─────┴─────┐
             ↓           ↓
            Web           Island
             │
             ↓
        Project Dashboard
```

---

# 24. API 安全

Agent API 不应该直接暴露整个数据库权限。

建议：

```text
User Session
```

与：

```text
Agent Token
```

分开。

例如：

```text
Personal Agent Token
```

拥有：

```text
read_project
read_task
write_task
write_worklog
update_progress
```

但没有：

```text
delete_workspace
manage_members
change_roles
```

这样以后即使 Agent Token 泄漏，损害范围也有限。

---

# 25. 幂等性必须提前设计

Agent 很可能重复发送：

```text
task.completed
```

或者因为重试产生：

```text
worklog.create
```

因此 API 需要：

```text
Idempotency-Key
```

例如：

```text
agent-run-20261001-task27-complete
```

保证重复请求不会产生重复数据。

这个会是一个非常有工程含量的点。

---

# 26. Markdown → Mini Plane 的同步策略

第一阶段：

> Agent 主动调用 API。

例如：

```text
Agent
 ↓
完成任务
 ↓
写 devlog
 ↓
POST /worklogs
```

第二阶段：

增加 Markdown Import：

```text
docs/devlog/*.md
        ↓
parser
        ↓
Worklog
```

第三阶段：

可以让 Agent 同时提交：

```text
Markdown
+
Structured API
```

最终：

```text
Markdown = 原始事实记录
Mini Plane = 结构化状态
```

二者互为补充。

---

# 27. 现有功能怎么处理

| 现有能力             | 重构后的处理                     |
| ---------------- | -------------------------- |
| Workspace        | 保留，降低 UI 权重                |
| Workspace Member | 保留                         |
| Role             | 保留                         |
| Project          | 核心                         |
| Issue            | 重命名体验为 Task，但底层可以继续叫 Issue |
| State            | 保留                         |
| Label            | 保留                         |
| Comment          | 保留                         |
| Activity         | 核心                         |
| Realtime         | 升级为 Agent/桌面实时同步           |
| My Work          | 升级成 My Engineering         |
| Command Palette  | 保留并扩展                      |
| Desktop App      | 核心                         |
| SQLite           | 保留                         |
| PostgreSQL       | 保留开发模式                     |
| Celery           | Agent/异步任务继续使用             |
| Markdown Devlog  | 保留并接入 Worklog              |

这里有一个非常好的策略：

> **数据库内部甚至可以暂时继续使用 Issue。**

UI 层显示：

```text
Task
```

这样可以避免不必要的数据迁移。

---

# 28. 开发 Sprint 顺序

## Sprint 09 — Product Foundation

目标：

> 完成个人工程模式的信息架构。

主要内容：

```text
My Engineering 首页
Project 卡片
Project 当前状态
Project progress
Current Stage
```

暂时不加入 Worklog。

验收：

```text
打开 Mini Plane
→ 第一眼看到我的工程
→ 能看到所有项目当前状态
→ 能看到项目进度
→ 不必理解 Workspace 才能开始使用
```

---

# Sprint 10 — Project Plan

新增：

```text
ProjectPlan
ProjectStage
```

完成：

```text
Global Plan
Stage
Progress
Current Stage
Next Stage
```

验收：

```text
Amiya-Agent
→ 能看到完整工程路线
→ 能明确当前处于 Stage 03
```

---

# Sprint 11 — Worklog

新增：

```text
Worklog
```

完成：

```text
Today
History
Conclusion
Next Step
```

Project 页面形成：

```text
Plan
↓
Stage
↓
Task
↓
Worklog
```

---

# Sprint 12 — Agent Local API

完成第一版：

```text
project.get
stage.update
task.create
task.start
task.complete
worklog.create
progress.update
```

加入：

```text
Agent Token
Idempotency-Key
Activity
```

---

# Sprint 13 — Agent Session

增加：

```text
AgentSession
```

例如：

```text
Agent Session
─────────────────

AMI-27
TTS Stability

Started
21:42

Status
RUNNING

Elapsed
02:14
```

然后：

```text
AgentSession
    ↓
Engineering Island
```

开始形成完整 Agent 体验。

---

# Sprint 14 — Engineering Island MVP

先不追求复杂动画。

完成：

```text
Resting
Focus
Project Switch
```

一个项目一个 Island 页面：

```text
Project
Current Stage
Progress
NOW
TODAY
NEXT
Agent Status
```

左右滑动切换项目。

---

# Sprint 15 — Desktop Island

将 Island 从浏览器页面变成：

```text
独立桌面窗口
```

支持：

```text
Always on Top
Top-center positioning
Drag
Hide
Show
Project Switch
```

并通过 WebSocket 与主窗口同步。

---

# Sprint 16 — Engineering Island Polish

开始做真正的设计表现：

```text
Paper Sheet
Blueprint Grid
Crosshair
FIG
SHEET
REV
```

增加非常克制的：

```text
transform
opacity
150–250ms
```

不加入：

```text
bounce
glow
blur
large movement
```

完全遵守 Blueprint Editorial。

---

# Sprint 17 — Team Mode Refinement

到这个阶段再处理团队。

不是重写团队模块。

而是：

```text
Personal Mode
        +
Collaboration Mode
```

让用户可以切换：

```text
MY ENGINEERING
WORKSPACE
```

这样你的“个人工程管理”已经是成熟产品，团队能力作为第二层出现。

---

# 29. 测试策略

现有：

```text
Backend 310
Frontend 98
E2E 18
CI
```

全部保留。

新增加：

### Backend

```text
ProjectPlan tests
ProjectStage tests
Worklog tests
Agent API tests
Agent Token tests
Idempotency tests
```

### Frontend

```text
My Engineering tests
Project summary tests
Worklog tests
Island state tests
Island swipe tests
```

### E2E

至少：

```text
创建项目
→ 创建 Stage
→ 创建 Task
→ 完成 Task
→ 创建 Worklog
→ Project 页面显示最新状态
```

再增加：

```text
Agent API
→ DB
→ WebSocket
→ Island
```

真正完成一次：

> **Agent → Mini Plane → Desktop UI**

的闭环测试。

这会是非常漂亮的一条 E2E 链路。

---

# 30. Definition of Done

以后每一个新 Sprint 都应该满足：

```text
功能完成
↓
API contract
↓
Backend tests
↓
Frontend tests
↓
E2E
↓
UI 验收
↓
Devlog
↓
README 状态更新
```

同时继续保留你现在 README 中已经写下来的原则：

> AI 是工具，不是作者。

尤其新 Agent API 做出来之后，更需要你自己能讲清：

```text
为什么 API 要这样设计？
为什么 Agent 权限要独立？
为什么要幂等？
为什么 Worklog 不直接等于 Task？
为什么 WebSocket 适合 Island？
为什么 Markdown 不应该被数据库完全取代？
```

这些都是以后面试里非常有价值的工程问题。

---

# 31. 第一阶段不要做的事情

为了防止重构再次失控，建议暂时明确几个 Non-goals：

```text
❌ 不删除 Workspace
❌ 不删除团队权限
❌ 不重写 Issue 系统
❌ 不重写 Realtime
❌ 不重写 Desktop launcher
❌ 不立即做 MCP
❌ 不立即做复杂 AI 自动规划
❌ 不立即做多人实时编辑
❌ 不立即做复杂 Kanban
```

尤其：

> **MCP 放在 REST API 稳定之后。**

先把业务能力设计正确，再给 Agent 一个 MCP 包装层。

---

# 32. 最终产品形态

完成这一轮之后，Mini Plane 的完整逻辑应该是：

```text
                         Mini Plane
                              │
              ┌───────────────┴───────────────┐
              │                               │
         MY ENGINEERING                 WORKSPACE
              │                               │
          Projects                         Teams
              │                               │
             Plan                          Projects
              │                               │
            Stages                          Tasks
              │                               │
            Tasks                       Comments
              │                               │
          Worklogs                        Activity
              │
          Agent Sync
              │
      Engineering Island
              │
      ┌───────┼───────┐
      ↓       ↓       ↓
   Amiya   Emowave  Mini Plane
```

而你每天真实的工作流最终可以变成：

```text
① 人定义 Global Plan
        ↓
② 分解 Stage
        ↓
③ 定义 Task
        ↓
④ Agent 执行 Task
        ↓
⑤ Agent 写 Markdown Devlog
        ↓
⑥ Agent 调 Mini Plane API
        ↓
⑦ Worklog / Task / Progress 自动更新
        ↓
⑧ WebSocket 推送
        ↓
⑨ Engineering Island 实时变化
        ↓
⑩ 人一抬头就知道所有工程现在进行到哪里
```

这就是这次重构真正要完成的闭环。

---

# 33. 我建议的产品版本路线

可以直接把后续版本定义成：

```text
v0.3.0
Personal Engineering Foundation

v0.4.0
Project Plan & Stage

v0.5.0
Engineering Worklog

v0.6.0
Agent Local API

v0.7.0
Agent Session & Realtime Sync

v0.8.0
Engineering Island MVP

v0.9.0
Engineering Island Desktop

v1.0.0
Personal Engineering Management Platform
```

而你现在的：

```text
v0.2.x
```

就作为：

> **Plane-compatible foundation / collaboration foundation**

保留下来。

这样版本历史也很好讲。

---

## 最后，我认为这次重构最重要的不是新增多少功能

而是把整个产品的**中心从“任务”移动到“工程”**。

以前是：

```text
我有很多任务
```

现在变成：

```text
我有三个工程

Amiya-Agent
  → 当前阶段
  → 当前任务
  → 今天做了什么
  → 下一步
  → Agent 是否正在运行

Emowave
  → 当前阶段
  → 当前任务
  → 今天做了什么
  → 下一步

Mini Plane
  → 当前阶段
  → 当前任务
  → 今天做了什么
  → 下一步
```

然后屏幕最上方始终有一张：

```text
ENGINEERING SHEET
```

左右一划：

```text
Amiya-Agent
    ↓
Emowave
    ↓
Mini Plane
```

这时候 **Mini Plane 才真正从“Plane 仿制品”变成你的产品。**

而且这个重构方案最大的优势是：**你过去一个月做出来的大量后端、Realtime、桌面、测试、工程化工作几乎都不用浪费，只需要让它们服务于一个新的产品中心。**
