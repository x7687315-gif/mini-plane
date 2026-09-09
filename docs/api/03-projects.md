# 03 · Project（与成员 / 状态）契约

> 状态：**待前端确认 → 确认后冻结**
> 公共约定见 [00-conventions.md](00-conventions.md)。角色值：`20=Admin / 15=Member / 5=Viewer`。

## 端点总览

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/workspaces/{slug}/projects/` | WS Member+ | 创建；creator 自动成为项目 ADMIN；**自动预置 5 个默认状态** |
| GET | `/api/v1/workspaces/{slug}/projects/` | WS 成员 | 项目列表（分页，MVP 全量可见），每项含 `current_user_role` |
| GET | `/api/v1/workspaces/{slug}/projects/{project_id}/` | WS 成员 | 详情，含 `current_user_role` |
| PATCH | 同上 | 项目 Admin（WS Admin 视同） | 改 name / identifier / description |
| DELETE | 同上 | 项目 Admin（WS Admin 视同） | 级联删除项目全部数据 |
| GET | `…/projects/{project_id}/members/` | WS 成员 | 项目成员列表（分页） |
| POST | `…/projects/{project_id}/members/` | 项目 Admin | 从工作区成员中添加 |
| PATCH | `…/projects/{project_id}/members/{member_id}/` | 项目 Admin | 改角色 |
| DELETE | `…/projects/{project_id}/members/{member_id}/` | 项目 Admin | 移除；至少保留一位项目 Admin |
| GET | `…/projects/{project_id}/states/` | WS 成员 | 状态列表（只读，创建项目时预置 5 个） |

## 对象结构

**Project**

```json
{
  "id": "uuid",
  "workspace": "ws-uuid",
  "name": "Amiya Project",
  "identifier": "AMI",
  "description": "…",
  "created_by": "user-uuid",
  "current_user_role": 20,
  "created_at": "…",
  "updated_at": "…"
}
```

**ProjectMember / State**

```json
{ "id": "uuid", "user": {"id": "uuid", "username": "amiya", "avatar": null}, "role": 20, "created_at": "…" }
```

```json
{ "id": "uuid", "name": "Backlog", "group": "backlog", "color": "#94a3b8", "sort_order": 1 }
```

## POST /api/v1/workspaces/{slug}/projects/

请求：`{"name": "Amiya Project", "identifier": "AMI", "description": "…"}`（description 可省略）

- `identifier`：`^[A-Z][A-Z0-9]{1,4}$`（2–5 位大写开头字母数字，用于 Issue 前缀如 `AMI-1`），**同一工作区内唯一**；跨工作区允许重复。
- **201**：Project 对象（`current_user_role=20`）。预置状态（服务端行为，前端无需调用）：
  `Backlog/backlog` → `Todo/unstarted` → `In Progress/started` → `Done/completed` → `Cancelled/cancelled`。
- **400**：`{"identifier": ["identifier 格式不正确，应为 2-5 位大写字母数字。"]}` / `{"identifier": ["此字段必须唯一。"]}`。
- **403**：WS Viewer 尝试创建。

## 生效角色（重要，前端按此渲染权限 UI）

| 用户在项目中的身份 | 生效角色 |
|------|------|
| ProjectMember | 取项目角色 |
| 不是项目成员，但是 **WS Admin** | 视同项目 **Admin**（可写） |
| 不是项目成员，是 WS Member 或 WS Viewer | 只读（等效 Viewer） |
| 不是 WS 成员 | **404**（看不到该项目存在） |

工作区成员**可见**工作区内全部项目（MVP 无项目级隐藏）。

## PATCH / DELETE /api/v1/workspaces/{slug}/projects/{project_id}/

- 按「生效角色 ≥ Admin」判定：项目 Admin 或 WS Admin 通过；项目 Member/Viewer、WS Member → **403**；非 WS 成员 → **404**。
- **DELETE** 级联删除项目下全部成员/状态/（未来）Issue，**204**。

## 项目成员管理

- **POST** 请求：`{"user_id": "uuid", "role": 15}`。
  - 400：`{"user_id": ["该用户不是工作区成员，请先添加到工作区。"]}` / 已是项目成员。
- **PATCH**：`{"role": 5}` → 200。
- **DELETE**：**204**；`{"detail": "至少保留一位项目管理员。"}` 当移除后无 Admin（含创建者自行退出场景）。

## GET /api/v1/workspaces/{slug}/projects/{project_id}/states/

预置五态**只读**列表（分页返回，通常单页）；自定义状态的增删改放二期。

## 变更记录

| 日期 | 变更 | 状态 |
|------|------|------|
| 2026-09-09 | 初稿（后端起草）：生效角色映射表、identifier 规则、预置五态 | 待前端确认 |
