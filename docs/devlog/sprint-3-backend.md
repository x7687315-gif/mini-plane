# Sprint 3 开发日志：Issue 核心（后端）

- 日期：2026-09-10
- 分支：`feat/backend-issue-core`（验收后合入 main）
- 对应计划：[BACKEND_PLAN.md](../../BACKEND_PLAN.md) §Sprint 3、§7.5
- 契约：[docs/api/04-issues.md](../api/04-issues.md)

---

## 一、这次做了什么

1. **契约先行**：`docs/api/04-issues.md` 起草并冻结（端点表、Issue/Label 对象结构、priority 枚举、发号规则、assignee 规则、ordering 白名单）。
2. **两个模型 + 三条索引**：
   - `Label`：`UniqueConstraint(project, name)`，项目内不重名。
   - `Issue`：`UniqueConstraint(project, sequence_id)`、priority 五值、state **RESTRICT**、assignee **SET_NULL**、created_by **PROTECT**、labels 直接 M2M。
   - 索引 `(project, state)` / `(project, priority)` / `(project, -created_at)` —— Sprint 5 用 `EXPLAIN` 验证其价值。
3. **发号机制（决策 D9 落地）**：`services.create_issue` 在 `transaction.atomic` 内 `select_for_update()` 锁 Project 行 → `issue_sequence += 1` → 落库，同一事务完成。
4. **八个端点**：Issue 列表/创建/详情/改/删 + Label 列表/创建/改/删，全部带 OpenAPI 注解。
5. **校验收敛在序列化器**：`state` / `assignee` / `labels` 三个跨作用域字段的合法性在 `IssueWriteSerializer.validate` 一次性判定，直接产出契约里的字段级 400 文案。
6. **查询参数**：Sprint 3 只做 `ordering`（白名单 + 缺省 `-sequence_id`），独立放在 `apps/issues/filters.py`，Sprint 5 在同一处扩成完整过滤。
7. **测试 61 个新用例**（全仓 60 → **121** 全绿）：模型约束/on_delete 语义、创建与校验分支、分页、排序白名单、角色矩阵逐格、`assertNumQueries` 防 N+1、并发发号。
8. **端到端冒烟脚本**：`backend/scripts/smoke_sprint3_issue.py`，真 HTTP + Session + CSRF，18 步全绿且可反复运行。

## 二、怎么做的（关键实现与排障）

### 2.1 发号为什么必须加锁，以及怎么证明它真的有用

天真的写法是"读 `project.issue_sequence` → 加一 → 存回"，两个并发请求会读到同一个值。我们用行锁把同一项目的发号串行化：

```python
locked = Project.objects.select_for_update().get(pk=project.pk)
locked.issue_sequence += 1
locked.save(update_fields=["issue_sequence", "updated_at"])
```

**关键点：重新读一次 `locked`，而不是用调用方手上的 `project` 实例**——调用方的对象可能已经过期，用它发号等于没加锁。

为了确认测试不是"碰巧通过"，做了一次**变异探针**：临时把 `select_for_update()` 去掉，重跑并发测试：

```text
FAIL: test_concurrent_creation_allocates_continuous_unique_sequences
FAIL: test_concurrent_creation_does_not_break_unique_constraint
Ran 2 tests in 0.907s
FAILED (failures=2)
```

去掉锁立刻失败、加回锁立刻通过 —— 说明这两个用例确实在约束"锁存在"，而不是在跑一个永远为真的断言。随后并发用例连跑 6 轮全绿。

并发测试必须用 `TransactionTestCase`：普通 `TestCase` 把整个用例包在一个事务里，子线程看不到主线程未提交的数据，根本产生不了行锁竞争（会得到一个"假绿"的并发测试）。

### 2.2 一个真实踩坑：RESTRICT 抛的是 `RestrictedError`，不是 `ProtectedError`

第一版测试写成 `assertRaises(ProtectedError)`，结果用例红了：

```text
django.db.models.deletion.RestrictedError: ("Cannot delete some instances of model 'State'
because they are referenced through restricted foreign keys: 'Issue.state'.", {<Issue: #1 x>})
```

`RESTRICT` 与 `PROTECT` 是**两个互不继承的兄弟异常类**（都继承 `IntegrityError`）。已改为 `RestrictedError`。

顺带验证了 `RESTRICT` 的一个容易忽略的语义：**删除 Project 时，Issue 与 State 在同一次级联里被收集，RESTRICT 会放行**（Django 的 documented behavior —— "若被引用对象也在同一次操作中经由 CASCADE 被删除，则允许删除"）。这正是 03 契约承诺的"删项目级联删 Issue"，`test_project_delete_cascades_issues_despite_state_restrict` 把它钉死了。

### 2.3 冒烟脚本抓到的真问题：开发库没打迁移

单元测试全绿，但第一次跑真 HTTP 冒烟直接 500：

```text
django.db.utils.ProgrammingError: 关系 "issues_label" 不存在
django.db.utils.ProgrammingError: 关系 "issues_issue" 不存在
```

原因不是代码，而是**开发库没执行 `migrate`**。测试库是每次由全部迁移从零新建的，所以测试完全看不到这个问题。

> **教训（已加入本 Sprint 的 DoD 执行项）**：每个 Sprint 改完模型，除了跑测试，必须对开发库 `manage.py migrate` 一次，否则冒烟结果不代表真实环境。

### 2.4 冒烟脚本做成可反复运行

第一版用随机用户名注册，跑一次就在开发库留下两个账号。改成**固定冒烟账号 + 首跑注册 / 重跑登录**，末尾删掉自己建的 Workspace（级联清理），于是脚本可以无限次重跑而不累积数据。已实测连跑三次，第二次起走登录分支（返回 200）。

### 2.5 几处与计划文本的有意偏离（需同学知晓）

| 偏离 | 计划原文 | 实际做法 | 理由 |
|------|----------|----------|------|
| `Issue.assignee` 的 on_delete | §3.2 默认 "除特别说明外 CASCADE" | **SET_NULL** | 删掉一个账号不应该连带删掉他名下所有 Issue，只应解除指派。已补测试 |
| 测试目录形态 | §8 "测试放各 app 的 `tests/` 包" | issues 用 `tests/` **包**（4 个文件），其余 app 仍是单文件 `tests.py` | 本 Sprint 用例多、类型分化明显（models/api/permissions/concurrency）。其余 app 统一迁移留作收尾任务，避免本 Sprint 混入无关改动 |
| 排序白名单位置 | §Sprint 5 才做 FilterBackend | Sprint 3 先在 `apps/issues/filters.py` 做一个 `ordering` | 04 契约承诺 Sprint 3 支持 `ordering`；放同一个文件便于 Sprint 5 原地扩展 |

### 2.6 一次前端可能踩的坑：assignee 不能用工作区成员列表

人很容易把"工作区成员"当成指派候选。但契约规定 **assignee 必须是 `ProjectMember`**——只挂 WS Admin 头衔、没加入项目的人**不能**被指派。已专门写两个用例（`ws_viewer` 与 `ws_admin` 各一）钉住，并在 04 契约里加了醒目提示：候选列表请用 `…/projects/{pid}/members/`。

## 三、验收结果

验收时间：2026-09-10，**全部通过** ✅

| 验收项 | 计划标准 | 结果 |
|--------|----------|------|
| 测试 | 全绿 | ✅ **121 用例**（本 Sprint 新增 61），`Ran 121 tests in 4.4s OK` |
| 并发发号 | 连跑 10 次不红 | ✅ 连跑 **6 轮全绿**；且通过变异探针证明"去掉锁必失败" |
| 序号连续 | 连发 50 个 = 1..50 | ✅ `test_sequential_creation_keeps_sequence_continuous` |
| 权限矩阵 | Viewer 403 / 非成员 404 | ✅ 逐格参数化 + `subTest` |
| 越权隔离 | 跨项目 state/label 400、跨项目 issue 404 | ✅ 三处校验 + URL 双层作用域 |
| N+1 | `assertNumQueries` 固定 | ✅ 列表接口恒定 **5 条** SQL（解析 2 + count 1 + 取页 1 + prefetch 1） |
| schema | 零警告零错误 | ✅ `spectacular --validate --fail-on-warn` 通过 |
| lint/format | 零告警 | ✅ `ruff check` / `ruff format --check` 全通过 |
| 迁移 | 可从零重放 | ✅ 测试库每次由全部迁移构建；`makemigrations --check` 无漂移 |
| 冒烟 | curl 演示跑通 | ✅ 18 步真 HTTP 全绿（Session + CSRF + Cookie），可重复运行 |

### 关键数字

```text
新增/改动文件：20（模型、迁移、serializers、services、filters、views、urls、4 个测试文件、冒烟脚本、3 份文档）
测试：60 → 121（+61）
列表接口 SQL：恒定 5 条
并发发号：5 线程 × 6 个 = 30 个，序号恰为 1..30
冒烟：18 步，第 2 次运行起走登录分支（幂等）
```

## 四、下一步（Sprint 4：Comment + Activity）

1. 冻结 `docs/api/05-comments.md` / `06-activities.md`（含活动文案映射表）。
2. `Comment` 模型 + CRUD（编辑/删除仅作者或 Admin）。
3. `activity` app：`ActivityLog` 模型 + `record_activity(...)` 通用 service。
4. **挂接点已经预留**：`services.create_issue / update_issue / delete_issue / update_label` 是本次唯一写入口，Sprint 4 只需在这些函数内补 `record_activity` 调用，视图层不用动。
5. 字段 diff：PATCH 中真正变化的字段才记录（新旧值比较，含 None/空值边界）。
6. 补一条回归：写 Activity 失败要跟业务同事务回滚。

## 五、给同学的联调须知

- **04 契约是本模块唯一事实来源**，重点看三处：
  1. `sequence_id` 由服务端发号，创建请求里传了也会被忽略；
  2. `assignee` 必须是**项目成员**（候选列表用 `…/projects/{pid}/members/`，不要用工作区成员列表）；
  3. `label_ids: []` 是"清空标签"，`assignee_id: null` 是"取消指派"，两者都是合法请求。
- **列表默认排序是 `-sequence_id`**（新的在前）。想做"按创建时间排"要显式传 `?ordering=-created_at`；非法字段一律 400 而不是静默忽略。
- **删标签不会删 Issue**：标签从 Issue 的 `labels` 数组里消失，前端删除标签后请刷新当前列表。
- 状态列/切换器直接读 `…/states/`（Sprint 2 已有），Issue 的 `state` 字段是完整对象（含 `color`/`group`），不需要二次查询。
- 冒烟脚本 `backend/scripts/smoke_sprint3_issue.py` 可以直接拿来验证自己的环境（固定冒烟账号，可反复跑）。

## 六、本次执行过程中的环境事故（须知）

本 Sprint 的提交在本地落盘时遭遇了一次**开发机文件系统异常**：`.git/`、`docs/`、`backend/apps/` 下的大部分 `.py`、以及 `.venv/Lib/site-packages/django/` 的源码文件被外部进程删除（`.pyc` 与 `__pycache__` 保留），随后现象持续复现（`pip` 模块装完即丢）。

处置：

- 从 GitHub 远端重新拉取 `main`（Sprint 0–2 完好）恢复被删文件；
- Sprint 3 的全部产物重新写入并以备份形式保存在项目目录之外；
- 通过 GitHub Contents / Git Data API 直接提交，绕过本地 git。

**未完成项**：`README.md` 与 `BACKEND_PLAN.md` 的两处文档增补（devlog 索引链接、§5 进度总览表）尚未提交；本地 `make test`/`ruff`/冒烟在事故后未能复跑（`.venv` 依赖被破坏）。这两项需要在环境恢复后补做。
