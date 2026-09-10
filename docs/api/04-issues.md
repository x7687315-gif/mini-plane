# 04 · Issue（含 Label）契约

> 状态：**待前端确认 → 确认后冻结**
> 公共约定见 [00-conventions.md](00-conventions.md)。角色值：`20=Admin / 15=Member / 5=Viewer`。
> 项目作用域见 [03-projects.md](03-projects.md)「生效角色」表——本模块所有权限判定都基于**生效角色**。
> 计划依据：[BACKEND_PLAN.md](../../BACKEND_PLAN.md) §Sprint 3、§7.5。

## 端点总览

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/workspaces/{slug}/projects/{pid}/issues/` | 项目成员（生效角色 ≥ Viewer） | 列表（分页）；Sprint 3 支持 `ordering`，Sprint 5 补齐全量过滤 |
| POST | 同上 | 生效角色 ≥ Member | 创建；服务端发号 `sequence_id` |
| GET | `…/issues/{issue_id}/` | 生效角色 ≥ Viewer | 详情 |
| PATCH | 同上 | 生效角色 ≥ Member | 部分更新（支持 `null` 清空 assignee） |
| DELETE | 同上 | 生效角色 ≥ Member | 204 |
| GET | `…/labels/` | 生效角色 ≥ Viewer | 标签列表（分页） |
| POST | 同上 | 生效角色 ≥ Member | 创建标签 |
| PATCH | `…/labels/{label_id}/` | 生效角色 ≥ Member | 改 name / color |
| DELETE | 同上 | 生效角色 ≥ Member | 204；**不影响已引用它的 Issue**（M2M 自动清理） |
| GET | `…/states/` | 生效角色 ≥ Viewer | 见 03 契约（预置五态只读） |

**非工作区成员访问以上任意端点一律 404**（防枚举，BACKEND_PLAN §4.3）。

## 对象结构

**Issue**

```json
{
  "id": "issue-uuid",
  "sequence_id": 7,
  "project": "project-uuid",
  "title": "登录页验证码不显示",
  "description": "复现步骤：…",
  "priority": "high",
  "state": {"id": "uuid", "name": "Todo", "group": "unstarted", "color": "#eab308", "sort_order": 2},
  "assignee": {"id": "uuid", "username": "amiya", "avatar": null},
  "created_by": {"id": "uuid", "username": "kal tsit", "avatar": null},
  "labels": [{"id": "uuid", "name": "bug", "color": "#ef4444", "created_at": "…"}],
  "created_at": "2026-09-09T12:00:00Z",
  "updated_at": "2026-09-09T12:30:00Z"
}
```

- `assignee` 可为 `null`（未指派）；`state`、`created_by` 恒非空。
- 展示编号的推荐写法：`{project.identifier}-{sequence_id}` → `AMI-7`。`identifier` 来自 03 契约的 Project。

**Label**

```json
{ "id": "uuid", "name": "bug", "color": "#ef4444", "created_at": "…" }
```

**priority 枚举**（字符串，非数字）

| 值 | 含义 | 建议色（前端可选） |
|------|------|------|
| `none` | 无（默认） | `#94a3b8` |
| `urgent` | 紧急 | `#dc2626` |
| `high` | 高 | `#f97316` |
| `medium` | 中 | `#eab308` |
| `low` | 低 | `#3b82f6` |

## POST `…/issues/` — 创建

```json
{
  "title": "登录页验证码不显示",
  "description": "复现步骤：…",
  "state_id": "uuid",
  "priority": "high",
  "assignee_id": "uuid",
  "label_ids": ["uuid", "uuid"]
}
```

- 仅 `title` 必填；其余字段可省略。
  - `state_id` 省略 → 取该项目 `group=backlog` 的状态（即 **Backlog**）。
  - `priority` 省略 → `none`。
  - `assignee_id` 省略或 `null` → 未指派。
  - `label_ids` 省略 → 无标签。
- **`sequence_id` 由服务端发号**（项目内自增，`AMI-1`、`AMI-2`…），请求体中传 `sequence_id` / `created_by` / `project` 会被**忽略**（只读字段）。
- **201**：Issue 对象。
- **400**（字段级，前端可直接展示）：

```json
{ "title": ["该字段是必填项。"] }
{ "state": ["所选状态不属于该项目。"] }
{ "assignee": ["所选用户不是该项目成员。"] }
{ "labels": ["所选标签不属于该项目。"] }
```

- **403**：生效角色为 Viewer（含 WS Viewer、项目 Viewer、非项目成员的 WS Member）。

> **assignee 规则（重要）**：被指派者必须是该项目的 `ProjectMember`。仅在工作区层级是 Admin、但未加入该项目的人**不能**被指派——前端候选列表请用 `…/projects/{pid}/members/`（03 契约），不要用工作区成员列表。

## PATCH `…/issues/{issue_id}/` — 部分更新

请求体同创建，**只提交要改的字段**：

- 改状态 `{"state_id": "uuid"}`
- 清空指派 `{"assignee_id": null}`
- 清空标签 `{"label_ids": []}`
- 改优先级 `{"priority": "urgent"}`

- **200**：更新后的 Issue 对象。
- **400**：与创建同一套文案（`title` 空串同样是 400）。
- `sequence_id` / `created_by` / `project` 等只读字段传入即忽略，不报错。

## GET `…/issues/` — 列表（查询引擎）

所有参数可任意组合，彼此之间是 **AND** 关系。

| 参数 | 取值 | 说明 |
|------|------|------|
| `state` | 状态 id，逗号分隔多值 | 命中**任一**即入选（OR） |
| `priority` | `none`/`urgent`/`high`/`medium`/`low`，逗号分隔多值 | OR；枚举之外的值 → **400** |
| `assignee` | 用户 id，或 `me` | `me` = 当前登录用户；指向不存在或非项目成员的用户 → **空结果**（不报错） |
| `labels` | 标签 id，逗号分隔多值 | **OR（并集）**：命中任一标签即入选。**这是本 Sprint 冻结的语义**（Sprint 5 冻结） |
| `search` | 关键词 | `title` 或 `description` 模糊包含（`icontains`）；纯空白视为未传 |
| `ordering` | 见下「ordering 白名单」 | 非法值 → **400** |
| `page` / `per_page` | 分页 | `per_page` 默认 50、上限 100（超过**收敛**为 100，不报错）；`page` 越界 → **200 + `results: []`**；`page` 非整数 → **400** |

多值参数写法：`?state=<uuid1>,<uuid2>&priority=high,urgent`（逗号两侧空白会被裁掉）。

### 参数校验文案（400）

```json
{ "ordering": ["不支持的排序字段：title。"] }
{ "priority": ["不支持的优先级：urgentt。"] }
{ "state": ["state 参数必须是逗号分隔的 UUID。"] }
{ "labels": ["labels 参数必须是逗号分隔的 UUID。"] }
{ "assignee": ["assignee 参数必须是 UUID 或 me。"] }
{ "page": ["页码必须是整数。"] }
```

### ordering 白名单与语义

| 取值 | 实际排序键 | 说明 |
|------|-----------|------|
| `-created_at`（**缺省**） | `-created_at, -sequence_id` | 缺省排序在 Sprint 5 由 `-sequence_id` 改为 `-created_at`，见变更记录 |
| `created_at` | `created_at, sequence_id` | |
| `sequence_id` / `-sequence_id` | 同值 | 项目内唯一，无需次级键 |
| `priority` | 严重度：`urgent → high → medium → low → none` | **按严重度，不是字母序**；字母序会得到 high/low/medium/none/urgent，没有意义 |
| `-priority` | 上表倒序 | |

可逗号分隔多字段（如 `ordering=-priority,sequence_id`）；白名单之外一律 400。

**稳定排序（前端请注意）**：每个排序都会在末位追加 `sequence_id`（项目内唯一）作为次级键。
原因：`created_at` 的时间精度受系统时钟粒度限制（Windows 约 15ms），同一批创建的 Issue 时间戳可能完全相同；
没有唯一次级键时，**翻页会出现同一条记录重复出现或被跳过**。

**分页边界**：`page` 越界（比如筛选后结果变少、页码还停在旧值）返回 `200` + 空 `results`，
`count` 仍是真实总数，方便前端判断"是筛没了还是要回退页码"——不会给 404。

### 明确不做（二期）

- **全文检索**：当前 `search` 是 `icontains`（`LIKE '%x%'`），用不上普通 B-tree 索引；
  5000 条量级可接受，二期上 `pg_trgm` 或外部检索引擎。
- **跨项目搜索**：所有查询都在单项目作用域内。
- **保存筛选视图 / 复杂布尔组合**（`(A AND B) OR C`）：本期只支持同层 AND + 单字段 OR。

## Label 接口

- **POST** `…/labels/`：`{"name": "bug", "color": "#ef4444"}`；`color` 省略 → `#64748b`。
  - **400**：`{"name": ["该项目下已存在同名标签。"]}`（项目内 name 唯一）。
- **PATCH** `…/labels/{label_id}/`：可改 `name` / `color`，唯一性同上。
- **DELETE** `…/labels/{label_id}/`：204。**已挂该标签的 Issue 不受影响**，只是标签从它们的 `labels` 数组里消失——前端删除标签后请刷新列表。

## 错误与权限速查

| 场景 | 状态码 | 响应体 |
|------|--------|--------|
| 未登录 | 401 | `{"detail": "身份认证信息未提供。"}` |
| 非工作区成员 | 404 | `{"detail": "未找到。"}` |
| 生效角色 = Viewer 做写操作 | 403 | `{"detail": "您没有执行该操作的权限。"}` |
| issue_id 不属于该 project / 不存在 | 404 | `{"detail": "未找到。"}` |
| 字段校验失败 | 400 | 字段级错误体 |

## 变更记录

| 日期 | 变更 | 状态 |
|------|------|------|
| 2026-09-10 | 初稿（后端起草，Sprint 3）：端点、Issue/Label 结构、priority 枚举、发号规则、assignee 必须为项目成员、ordering 白名单 | 待前端确认 |
| 2026-09-10 | Sprint 5：补齐 `state`/`priority`/`assignee`/`labels`/`search`；**labels 定为 OR（并集）**；**缺省 ordering 由 `-sequence_id` 改为 `-created_at`**；`priority` 排序改为按严重度；所有排序追加 `sequence_id` 次级键保证翻页稳定；`page` 越界改为 200 + 空 results、非整数 400 | 待前端确认 |
