# 06 · Activity（活动流）契约

> 状态：**待前端确认 → 确认后冻结**
> 公共约定见 [00-conventions.md](00-conventions.md)。
> 计划依据：[BACKEND_PLAN.md](../../BACKEND_PLAN.md) §Sprint 4、§7.7。
> 本文件同时是**活动文案映射表**的定稿（前端拼时间线文案的依据）。

## 定位

本模块做的是 **Audit Trail（审计留痕）**，不是 Domain Event：只回答"谁在什么时候把什么改成了什么"。
**只读**，没有创建/修改/删除接口；所有记录都由业务代码在服务层写入。

## 端点总览

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `…/projects/{pid}/issues/{iid}/activities/` | 生效角色 ≥ Viewer | 该 Issue 的时间线；**倒序**分页 |
| GET | `…/projects/{pid}/activities/` | 生效角色 ≥ Viewer | 项目级活动流（跨 Issue）；**倒序**分页 |

Issue 时间线 = 该 Issue 自身的变更记录 **+ 挂在该 Issue 下的评论事件**（评论创建/删除），
因此前端一个接口就能画出完整的 Issue 时间线，不需要再合并评论列表。

非工作区成员一律 **404**。

**排序边界（前端请注意）**：两个列表都按 `created_at` 倒序。
`created_at` 是写入时刻，**同一时刻内的先后顺序不做保证**（例如一次 PATCH 之后紧接着发评论，
两者可能落在同一个时间戳上）。渲染时不要假设"数组上一项一定先发生"，
需要精确先后时请比较 `created_at` 并接受同值时并列展示。

## 对象结构

```json
{
  "id": "activity-uuid",
  "actor": {"id": "uuid", "username": "amiya", "avatar": null},
  "entity_type": "issue",
  "entity_id": "issue-uuid",
  "issue": "issue-uuid",
  "action": "updated",
  "old_value": {"state": "Todo"},
  "new_value": {"state": "Done"},
  "created_at": "2026-09-10T12:30:00Z"
}
```

| 字段 | 取值 |
|------|------|
| `entity_type` | `issue` / `comment` / `project`（MVP 实际产出这三个；`state` / `label` / `workspace` / `member` 已在枚举中预留） |
| `action` | `created` / `updated` / `deleted` |
| `issue` | 该留痕所属的 Issue id（评论事件也归到它所属的 Issue）；Issue 被删除后为 `null`。项目级活动流用它做跳转 |
| `old_value` / `new_value` | 字段级 diff 对象，键 = 字段名，值 = **可直接展示的字符串/数组/null**；无对应值时整体为 `null` |

- 单位：`old_value` / `new_value` 里**不会出现 UUID**——已经全部翻译成可展示值（见下表），
  前端不需要再回查用户或状态。顶层 `entity_id` / `issue` 是给程序用的 id，不参与拼句子。
- 多字段同时被改时，同一个活动记录里会带多个键（如 `{"state": "Todo", "priority": "low"}`）。

## 字段 diff 白名单与值格式（Sprint 4 定稿）

| 字段 | what 会记录 | 值的格式 | 示例 |
|------|------------|---------|------|
| `title` | 标题被改 | 标题全文 | `{"title": "登录页验证码不显示"}` |
| `description` | 描述被改 | **字数摘要**（`N 字`） | `{"description": "128 字"}` |
| `state` | 状态被改 | 状态名 | `{"state": "In Progress"}` |
| `priority` | 优先级被改 | 枚举值（非中文） | `{"priority": "urgent"}` |
| `assignee` | 指派被改/被清空 | 用户名，或 `null` | `{"assignee": null}` |
| `labels` | 标签集合变化 | 标签名数组（已排序） | `{"labels": ["bug", "p1"]}` |

**三条明确的产品决策**（计划 §Sprint 4 学习要点要求记录）：

1. **`description` 只存字数，不存全文。** 描述可能非常长（粘贴日志、复现步骤），
   全文进时间线会让整页无法阅读；字数的信息量足够回答"有没有动过、动了多少"。
   值格式统一成 `"N 字"`，前端直接拼进 `从 … 改为 …` 即可。
2. **只有真正变化的字段才记录。** PATCH 提交了但值没变（如把 `priority` 又设成 `high`）
   → 字段被忽略；一次 PATCH 里所有字段都没变 → **不产生活动记录**。
3. **`priority` 用枚举值而不是中文。** 与 04 契约的 priority 枚举保持一致，
   中文文案由前端映射（避免后端把展示语言写死在数据里）。

## 文案映射表（前端拼句子用）

`{actor}` = `actor.username`；`{fields}` = 按上表把 `old_value` → `new_value` 逐字段展开，
每个字段渲染成 `将 {字段中文名} 从 {old} 改为 {new}`。

| entity_type | action | 模板 | 备注 |
|-------------|--------|------|------|
| `issue` | `created` | `{actor} 创建了任务` | `new_value` 是创建时的初始字段快照，可按需展示 |
| `issue` | `updated` | `{actor} {fields}` | 例：`amiya 将 状态 从 Todo 改为 Done` |
| `issue` | `deleted` | `{actor} 删除了任务` | `old_value` 是删除前的字段快照 |
| `comment` | `created` | `{actor} 评论了任务` | `new_value` 为 `null`；正文走 05 契约的评论接口 |
| `comment` | `deleted` | `{actor} 删除了评论` | `old_value` 为 `null`（不存正文） |
| `project` | `created` | `{actor} 创建了项目` | `new_value = {"name": "Amiya Project"}` |
| `project` | `updated` | `{actor} 将 项目名称 从 {old} 改为 {new}` | `old_value/new_value` 键为 `name`（也支持 `identifier`） |

字段中文名（`title` → 标题 / `description` → 描述 / `state` → 状态 / `priority` → 优先级 /
`assignee` → 指派人 / `labels` → 标签 / `name` → 项目名称 / `identifier` → 项目标识）由前端维护，
本表是前后端共同确认的版本。

**项目级活动上的键**：`project` 事件用 `name` / `identifier` 两个键
（取值是字符串，不是 Issue 那套字段名），前端按 `entity_type` 分支渲染即可。

`{old}` 或 `{new}` 为 `null` 时的展示建议：
- `assignee` 为 `null` → 渲染成「未指派」，例如 `将 指派人 从 amiya 改为 未指派`。

## 有意不记录的事件（Sprint 4 范围）

| 事件 | 为什么不记 | 何时补 |
|------|-----------|--------|
| Comment 编辑（PATCH） | 评论编辑频繁，会把时间线冲淡 | 二期（如需，加 `comment.updated` 并在契约标注） |
| Label 的增删改 | 一期关注 Issue/Comment/Project 三条主线 | 二期 |
| State / Workspace / Member 变更 | 枚举已预留，暂未接线 | 二期 |
| 读操作、登录登出 | 不是内容变更 | 不计划 |

## 错误与权限速查

| 场景 | 状态码 | 响应体 |
|------|--------|--------|
| 未登录 | 401 | `{"detail": "身份认证信息未提供。"}` |
| 非工作区成员访问活动流 | 404 | `{"detail": "未找到。"}` |
| 尝试 POST / PATCH / DELETE 活动 | 405 | DRF 默认方法不允许 |

## 变更记录

| 日期 | 变更 | 状态 |
|------|------|------|
| 2026-09-10 | 初稿（后端起草，Sprint 4）：两个只读端点、对象结构、字段 diff 白名单与值格式、文案映射表、三条产品决策 | 待前端确认 |
