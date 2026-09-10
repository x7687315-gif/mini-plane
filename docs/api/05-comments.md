# 05 · Comment 契约

> 状态：**待前端确认 → 确认后冻结**
> 公共约定见 [00-conventions.md](00-conventions.md)。角色值：`20=Admin / 15=Member / 5=Viewer`。
> 项目作用域与「生效角色」见 [03-projects.md](03-projects.md)；Issue 见 [04-issues.md](04-issues.md)。
> 计划依据：[BACKEND_PLAN.md](../../BACKEND_PLAN.md) §Sprint 4、§7.6。

## 端点总览

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/workspaces/{slug}/projects/{pid}/issues/{iid}/comments/` | 生效角色 ≥ Viewer | 列表；**按时间正序**（旧的在前），分页 |
| POST | 同上 | 生效角色 ≥ Member | 创建 |
| PATCH | `…/comments/{comment_id}/` | 作者本人，或生效角色 = Admin | 改内容 |
| DELETE | 同上 | 作者本人，或生效角色 = Admin | 204 |

**非工作区成员访问以上任意端点一律 404**（防枚举，BACKEND_PLAN §4.3）。

## 对象结构

**Comment**

```json
{
  "id": "comment-uuid",
  "issue": "issue-uuid",
  "author": {"id": "uuid", "username": "amiya", "avatar": null},
  "content": "复现步骤已补充到描述里。",
  "created_at": "2026-09-10T12:00:00Z",
  "updated_at": "2026-09-10T12:00:00Z"
}
```

- `author` 只含 `id / username / avatar`（与 02/03/04 的成员摘要同形），**不含 email**。
- 列表**正序**（`created_at` 升序）：评论区是对话，最老的在上——与 Issue 列表/活动流的倒序相反，前端渲染时注意。

## POST `…/comments/` — 创建

请求：`{"content": "复现步骤已补充到描述里。"}`

- **201**：Comment 对象。
- **400**（两种文案，前端按字段错误体统一展示即可）：
  - 没带 `content` 字段 → `{"content": ["该字段是必填项。"]}`
  - `content` 是空串或纯空白 → `{"content": ["该字段不能为空。"]}`
- **403**：生效角色为 Viewer（含 WS Viewer、项目 Viewer、非项目成员的 WS Member）。
- **404**：非工作区成员；或 `issue_id` 不属于该 project。

> 创建成功会**产生活动记录**（`entity_type=comment, action=created`），出现在该 Issue 的活动流里，见 [06-activities.md](06-activities.md)。

## PATCH / DELETE `…/comments/{comment_id}/`

- **PATCH** 请求：`{"content": "…"}`，**200**：Comment 对象；校验同创建。
- **DELETE** → **204**。
- 权限判定：

| 身份 | 可改/可删？ |
|------|------------|
| 评论作者 | ✅ |
| 生效角色 = Admin（项目 Admin，或 WS Admin 视同） | ✅（可以管理他人评论） |
| 其他项目 Member | ❌ **403** |
| 生效角色 = Viewer | ❌ 403 |
| 条评论属于别的 Issue / 不存在 | **404** |
| 非工作区成员 | **404** |

> **PATCH 不产生活动记录**（只记录创建与删除，避免时间线被编辑噪声淹没）。见 06 契约「有意不记录的事件」。

## 错误与权限速查

| 场景 | 状态码 | 响应体 |
|------|--------|--------|
| 未登录 | 401 | `{"detail": "身份认证信息未提供。"}` |
| 非工作区成员 | 404 | `{"detail": "未找到。"}` |
| Viewer 尝试创建 | 403 | `{"detail": "您没有执行该操作的权限。"}` |
| 非作者且非 Admin 尝试改删 | 403 | `{"detail": "您没有执行该操作的权限。"}` |
| comment_id 不属于该 issue | 404 | `{"detail": "未找到。"}` |

## 变更记录

| 日期 | 变更 | 状态 |
|------|------|------|
| 2026-09-10 | 初稿（后端起草，Sprint 4）：端点、对象结构、作者/Admin 双权限、正序列表、编辑不产生活动 | 待前端确认 |
