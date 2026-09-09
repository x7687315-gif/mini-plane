# 01 · Auth 契约（User / Register / Login / Logout / Me）

> 状态：**待前端确认 → 确认后冻结**
> 公共约定（错误格式/分页/CORS/CSRF）见 [00-conventions.md](00-conventions.md)。

## 端点总览

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/auth/csrf/` | 匿名 | 设置 `csrftoken` cookie，写操作前调用 |
| POST | `/api/v1/auth/register/` | 匿名 | 注册并自动登录（返回即持有 session） |
| POST | `/api/v1/auth/login/` | 匿名 | 登录，种 `sessionid` cookie |
| POST | `/api/v1/auth/logout/` | 已认证 | 登出，销毁 session（需 `X-CSRFToken`） |
| GET | `/api/v1/auth/me/` | 已认证 | 当前用户信息 |

## 用户对象（User）

```json
{
  "id": "3f2b8c1e-…",
  "username": "amiya",
  "email": "amiya@example.com",
  "avatar": null,
  "created_at": "2026-09-09T12:00:00Z"
}
```

- `username`：3–150 字符，仅字母数字及 `@ . + - _`，全局唯一。
- `email`：全局唯一。
- `avatar`：URL，可空。注册接口暂不接受（Sprint 2 起），默认 null。

## GET /api/v1/auth/csrf/

设置 `csrftoken` cookie（HttpOnly=false，供 JS 读取）。

- **200**：`{"detail": "CSRF cookie 已设置。"}` + `Set-Cookie: csrftoken=…`
- 联调节奏：登录前调一次即可；csrftoken 失效（403）时重新调一次。

## POST /api/v1/auth/register/

**请求**

```json
{ "username": "amiya", "email": "amiya@example.com", "password": "…" }
```

**201 Created**：用户对象（如上）+ `Set-Cookie: sessionid=…`（注册即登录）。

**400**（字段级，可同时报多个字段）：

| 场景 | 响应体示例 |
|------|-----------|
| 缺字段 | `{"username": ["该字段是必填项。"]}` |
| 用户名已存在 | `{"username": ["已存在一位使用该名字的用户。"]}` |
| 邮箱已存在 | `{"email": ["此字段必须唯一。"]}` |
| 弱密码 | `{"password": ["This password is too short. It must contain at least 8 characters."]}`、`{"password": ["这个密码太常见了。", "密码只包含数字。"]}` |
| 非法用户名 | `{"username": ["请输入有效的用户名。该值只能包含字母、数字和 @/./+/-/_ 字符。"]}` |

> **前端注意**：不同校验器的文案存在中英混排（Django 部分字符串尚无中文翻译）。
> 请按「字段名 + 400 状态码」处理，把数组内容直接展示，**不要按文案内容做逻辑分支**。

约束：响应与日志中不得出现密码（明文或哈希）。

## POST /api/v1/auth/login/

**请求**：`{"username": "amiya", "password": "…"}`

**200**：用户对象 + `Set-Cookie: sessionid=…; HttpOnly; SameSite=Lax`。

**400**（登录失败不区分"用户不存在/密码错误"，防用户名探测）：

```json
{ "detail": "用户名或密码错误。" }
```

**429**：失败锁定 —— 同一用户名 15 分钟内连续失败 5 次后，无论密码对错一律 429，成功登录会立即清零计数。

> 注：登录失败返回 **400**（而非 401）——401 保留给"已进入需认证接口但未登录/会话失效"的场景。

## POST /api/v1/auth/logout/

**要求**：已认证（sessionid 有效）且带 `X-CSRFToken` 头。

**204 No Content**：无响应体，服务端销毁 session 并使 `sessionid` 失效。

**403**：缺少/错误的 CSRF token（`{"detail": "CSRF 校验失败，请求被中断。"}`）。
**401**：未登录状态调用。

## GET /api/v1/auth/me/

**200**：用户对象。
**401**：`{"detail": "身份认证信息未提供。"}`（未登录或 session 已失效）。

## 变更记录

| 日期 | 变更 | 状态 |
|------|------|------|
| 2026-09-09 | 初稿（后端起草） | 待前端确认 |
