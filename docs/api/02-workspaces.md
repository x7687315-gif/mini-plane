# 02 · Workspace 契约

> 状态：**待前端确认 → 确认后冻结**
> 公共约定见 [00-conventions.md](00-conventions.md)。角色值统一：`20=Admin / 15=Member / 5=Viewer`。

## 端点总览

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/workspaces/` | 已认证 | 创建；创建者自动成为 ADMIN 成员 |
| GET | `/api/v1/workspaces/` | 已认证 | **仅返回我是成员的**工作区（分页） |
| GET | `/api/v1/workspaces/{slug}/` | WS 成员 | 详情，含 `current_role` |
| PATCH | `/api/v1/workspaces/{slug}/` | WS Admin | 改 name / slug |
| DELETE | `/api/v1/workspaces/{slug}/` | WS Admin | **级联删除**全部项目/成员/状态 |
| GET | `/api/v1/workspaces/{slug}/members/` | WS 成员 | 成员列表（分页） |
| POST | `/api/v1/workspaces/{slug}/members/` | WS Admin | 按 email 添加 |
| PATCH | `/api/v1/workspaces/{slug}/members/{member_id}/` | WS Admin | 改角色 |
| DELETE | `/api/v1/workspaces/{slug}/members/{member_id}/` | WS Admin | 移除成员 |

## 对象结构

**Workspace**

```json
{
  "id": "uuid",
  "name": "Amiya 工作区",
  "slug": "amiya-ws",
  "owner": "user-uuid",
  "current_role": 20,
  "created_at": "…",
  "updated_at": "…"
}
```

**WorkspaceMember**

```json
{ "id": "uuid", "user": {"id": "uuid", "username": "amiya", "avatar": null}, "role": 20, "created_at": "…" }
```

## POST /api/v1/workspaces/

请求：`{"name": "Amiya 工作区", "slug": "amiya-ws"}`（slug 可省略）

slug 规则：`^[a-z0-9-]{2,32}$`。**缺省时由 name 自动生成；无论缺省还是显式提供，冲突时自动追加 `-2`、`-3`… 后缀**（最终 slug 以响应为准，不报错）。

**201**：Workspace 对象，`current_role=20`。**400**：name 缺失 / slug 非法字符。

## GET /api/v1/workspaces/

分页返回**我是成员**的工作区，按创建时间倒序；每项含 `current_role`。

## GET / PATCH / DELETE /api/v1/workspaces/{slug}/

- **GET**：成员 200（含 `current_role`）；非成员 **404**（防枚举，全局规则）。
- **PATCH**：仅 Admin。可改 `name`、`slug`（改 slug 同样走唯一性自动后缀）。非 Admin 成员 **403**。
- **DELETE**：仅 Admin。**级联删除**该工作区全部 Project / 成员 / 状态（MVP 无软删除，前端需二次确认）。**204** 无响应体。

## 成员管理（/members/）

- **POST** 请求：`{"email": "amiya@example.com", "role": 15}`。**201** 返回成员对象。
  - 400：`{"email": ["该邮箱尚未注册。"]}` / `{"email": ["该用户已是工作区成员。"]}` / role 非法值。
- **PATCH** 请求：`{"role": 5}`。**200** 返回成员对象。
  - 400：`{"detail": "不能修改工作区所有者的角色。"}`。
- **DELETE**：**204**。
  - 400：`{"detail": "工作区所有者不可移除。"}` / `{"detail": "至少保留一位管理员。"}`。

## 变更记录

| 日期 | 变更 | 状态 |
|------|------|------|
| 2026-09-09 | 初稿（后端起草）：slug 自动后缀规则、owner 双守卫 | 待前端确认 |
