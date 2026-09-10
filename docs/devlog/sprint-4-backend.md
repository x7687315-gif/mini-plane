# Sprint 4 开发日志：Comment + Activity Log（后端）

- 日期：2026-09-10
- 分支：`main`（本地 `.git` 已在环境事故中丢失，本次经 GitHub Git Data API 直接写入）
- 对应计划：[BACKEND_PLAN.md](../../BACKEND_PLAN.md) §Sprint 4、§7.6、§7.7
- 契约：[docs/api/05-comments.md](../api/05-comments.md)、[docs/api/06-activities.md](../api/06-activities.md)

---

## 一、这次做了什么

1. **契约先行**：05（Comment）与 06（Activity）两份冻结，**06 同时是活动文案映射表的定稿**（计划要求与同学共同确认的那份）。
2. **两个模型 + 一个枚举族**：
   - `issues.Comment`：`author` PROTECT、`(issue, created_at)` 组合索引、正序；
   - `activity.ActivityLog`：`entity_type` × `action` 两个 TextChoices（7 类实体 / 3 种动作，MVP 实际产出 issue / comment / project）；
   - 三条索引：`(project, -created_at)` 项目流、`(issue, -created_at)` 时间线、`(entity_type, entity_id)` 通用回溯。
3. **留痕写入路径唯一**：`activity.services.record_activity(...)`，业务代码只调 `record_issue_event` / `record_comment_event` / `record_project_event` 三个便捷函数。
4. **四个记录点接线**（全部落在既有写入口，视图层一行未改）：
   Issue 创建 / 字段变更 / 删除，Comment 创建 / 删除，Project 创建 / 变更。
5. **字段 diff 提取**：`capture_issue_snapshot` 把 Issue 翻成"可直接展示"的值快照 → 更新前后对比 → **只记录真正变化的字段**。
6. **两个只读端点**：Issue 时间线（自身变更 + 其下评论事件）与项目级活动流，均倒序分页、无写接口。
7. **测试 121 → 181**（新增 60）：记录点形状、diff 各类边界（None / 空列表 / 字数 / 多字段 / 同值不记）、评论权限矩阵、时间线与活动流读取、**"写留痕失败必须回滚业务"**、`assertNumQueries` 防 N+1。
8. **冒烟脚本升级**：`scripts/smoke_sprint3_issue.py` → **`scripts/smoke_backend.py`**，18 步 → **34 步**（新增第三個冒烟身份 Member 与整条评论/活动流链路），真 HTTP + Session + CSRF 全绿且可重复运行。

## 二、怎么做的（关键实现与排障）

### 2.1 ActivityLog 为什么要多一个 `issue` 外键（偏离计划 §3.2）

计划 §3.2 的字段表里没有 `issue`。实现时发现两个绕不过去的需求：

- **时间线归属**：Issue 时间线要长成"Issue 自身的变更 + 挂在该 Issue 下的评论事件"。评论的留痕 `entity_type=comment, entity_id=评论id`，**用子查询反查所属 Issue 会失效**——评论一被删除，`Comment` 行就没了，它的 `created` 与 `deleted` 两条留痕会一起从时间线里消失，而那恰恰是最该留下的两条。
- **项目级活动流要能跳转**：前端在项目流里看到"某条评论事件"，得知道点进去是哪个 Issue。

所以加了一个**冗余的上下文外键** `issue`，并且刻意选 **SET_NULL 而不是 CASCADE**：删 Issue 时如果 CASCADE，会把它自己的 `issue.deleted` 留痕一起删掉——审计里最重要的一条记录被自己删掉，这显然不对。
`test_issue_timeline_survives_comment_deletion` 与 `test_delete_issue_records_snapshot_before_removal` 把这两条语义钉死了。

### 2.2 为什么不给 `record_activity` 加 `@transaction.atomic`

计划 §Sprint 4 测试清单要求"写活动失败时事务回滚"。这条的成立前提是**留痕与业务变更共用同一个事务**：

```text
create_issue()  ← @transaction.atomic（业务事务域）
   ├── 发号 + 落库
   └── record_activity()  ← 刻意不加 atomic，跟随调用方
```

如果给 `record_activity` 自己套一层 atomic，它就变成了内层 savepoint，外层业务照常提交，"留痕失败 = 业务也失败"的保证就没了。
测试用 `mock.patch` 让 `ActivityLog.objects.create` 抛异常，断言 **Issue 不存在、`project.issue_sequence` 也回到 0**（发号计数器同样回滚），比"活动数为 0"这句话有力得多。

### 2.3 值翻译：`old_value` / `new_value` 里不出现任何 UUID

前端如果拿到 `{"state": "3f2a…"}` 还得回查一次状态表，时间线渲染会变成 N+1 请求。所以 diff 在**写入时**就翻译好：

| 字段 | 值 |
|------|-----|
| `state` | 状态名（`"Todo"`） |
| `priority` | 枚举值（`"high"`，**故意不用中文**，中文交给前端映射，避免把展示语言写进数据） |
| `assignee` | 用户名或 `null` |
| `labels` | 标签名数组 |
| `description` | **字数摘要**（`"128 字"`） |

三条明确的产品决策都写进了 06 契约：① 描述只存字数不存全文（长文本会淹没时间线）；② 只有真变化的字段才记（PATCH 提交但值没变 → 不产生活动）；③ priority 用枚举不用中文。

### 2.4 排障一：Windows 墙钟粒度让"倒序"变得不确定

`test_issue_timeline_is_descending` 第一次跑就红了，实际顺序和预期不同。追下去是平台特性：

> **Windows 上 `datetime.now()` 的墙钟粒度约 15.6ms**（系统计时器 tick）。测试里"改状态 → 发评论"两次写入相隔远小于 15ms，于是两条留痕拿到**完全相同**的 `created_at`；这时排序退化到兜底的 `-id`，而主键是**随机 UUID**，顺序自然不可预测。

这在 Linux 生产环境不会出现（粒度 ~1µs），但测试必须在任何平台都稳定。处理方式：

- 契约里**明确写出排序边界**——"同一时间戳内的先后不保证，需要精确先后时比较 `created_at` 并接受同值并列"，而不是假装倒序永远严格；
- 测试拆成两条：一条断言"`created_at` 非递增 + 事件集合正确"（平台无关），另一条在 `apps/activity/tests/test_services.py` 里**显式写入递增的时间戳**，专门验证排序逻辑本身。

顺带得到一条经验：**凡是"按时间排序"的断言，不要在 Windows 上依赖连续写入的自然时间戳。**

### 2.5 排障二：DRF 的"必填"与"不能为空"是两套文案

`{"content": "   "}` 返回的是 `该字段不能为空。`，而字段缺失返回 `该字段是必填项。`。计划 §7.1 只统一了错误体**形状**，没有约定到具体文案粒度，所以第一版测试写错了断言。已把两种情形分别写进 05 契约（前端本来就把字段错误体统一展示，不受影响，但契约必须说实话）。

### 2.6 权限：评论改删的"作者或 Admin"不是一道门槛而是两道

`作者本人 → 放行`；`否则 → 要求生效角色 ≥ Admin`。两种人走的是不同分支：

```python
if comment.author_id != request.user.id:
    _require_role(role, ProjectRoles.ADMIN)   # 否则 403
```

"WS Admin 视同项目 Admin"这条 03 契约的规则在这里自动生效（生效角色是统一实现），所以 `edit_by_ws_admin_200` 不需要任何特判就通过了——**这是生效角色映射设计的红利**。

## 三、验收结果

验收时间：2026-09-10 22:20，**全部通过** ✅

| 验收项 | 计划标准 | 结果 |
|--------|----------|------|
| 测试 | 全绿 | ✅ **181 用例**（本 Sprint 新增 60），`Ran 181 tests OK` |
| Comment 权限 | 作者 200 / 他人 403 / Admin 200 | ✅ 逐格覆盖（含 WS Admin 视同、Viewer 403、非成员 404） |
| 字段 diff | 真正变化才记录，含 None/空值边界 | ✅ 9 个用例：同值不记、只记变化项、`assignee: null`、`labels: []`、字数摘要、多字段合并 |
| 事务一致性 | 写留痕失败事务回滚 | ✅ Issue 不存在 **且** 发号计数器归零 |
| 时间线完整性 | 评论删除后历史仍在 | ✅ `comment.created` + `comment.deleted` 均保留 |
| 活动流读取 | 倒序 + 分页 + 非成员 404 | ✅ 含 405（无写接口）与 `assertNumQueries` 恒定 4 条 SQL |
| schema | 零警告零错误 | ✅ `spectacular --validate --fail-on-warn` 通过 |
| lint/format | 零告警 | ✅ `ruff check` / `ruff format --check` 全通过 |
| 迁移 | 可从零重放 | ✅ 测试库由全部迁移构建；`makemigrations --check` 无漂移；开发库已 `migrate`（`issues.0003`、`activity.0001`） |
| 冒烟 | 演示脚本跑通 | ✅ **34 步**真 HTTP 全绿，服务端 0 异常，可重复运行 |

### 关键数字

```text
测试：121 → 181（+60）
冒烟：18 步 → 34 步（新增第三个身份 Member）
记录点：Issue 创建/更新/删除、Comment 创建/删除、Project 创建/更新 = 7 处
活动流查询：恒定 4 条 SQL（解析项目 2 + count 1 + 取页 1，actor 已 select_related）
```

## 四、下一步（Sprint 5：Search / Filter / Sort 强化）

1. 把 `apps/issues/filters.py` 从"只有 ordering"扩成完整过滤：`state` / `priority`（多值）/ `assignee`（id 或 `me`）/ `labels` / `search`，ordering 白名单补全。
2. 冻结 04 契约的查询参数章节（多值语义、labels 交/并集二选一）。
3. **索引验证**：seed 5,000 条 Issue，用 `explain()` 对比建索引前后的执行计划——Sprint 3 已建好的 `(project, state)` / `(project, priority)` / `(project, -created_at)` 在这次要拿实证。
4. seed 脚本 + P95 耗时记录进 PR 描述。

## 五、给同学的联调须知

- **06 契约的文案映射表是这轮的重点**，请重点确认三件事：
  1. 字段中文名（标题/描述/状态/优先级/指派人/标签/项目名称）是否符合前端既有文案；
  2. `old` / `new` 为 `null` 时的展示（`将 指派人 从 amiya 改为 未指派`）；
  3. 描述只显示字数（`将 描述 从 0 字 改为 128 字`）是否可接受。
- **Issue 时间线一个接口就够**：`GET …/issues/{iid}/activities/` 已经包含评论事件，不需要再合并评论列表；
  评论**正文**不在活动流里（`new_value` 为 `null`），要展示正文请配合 05 的评论接口。
- **两个列表方向相反**：评论**正序**（对话），活动流**倒序**（最新在前）。别做成一样。
- 排序边界：同一时间戳内的顺序不保证，别写成"上一项一定先发生"。
- 权限速记：评论**改/删**只有 `作者` 或 `Admin`；项目 Member 之间互相不能改评论（403）。
- 冒烟脚本换成 `backend/scripts/smoke_backend.py`（旧名 `smoke_sprint3_issue.py` 已删除），34 步可反复跑。
