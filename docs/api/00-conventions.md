# 00 · API 通用约定（Contract Conventions）

> 状态：**已冻结**（随 BACKEND_PLAN §2.2/§7.1，变更需 PR）
> 本文件是所有 `docs/api/*.md` 的公共前缀，各模块契约不再重复这些内容。

## 1. 基础约定

| 项 | 约定 |
|------|------|
| 版本前缀 | 全部 API 以 `/api/v1/` 开头 |
| URL 风格 | 复数名词 + trailing slash（`/api/v1/workspaces/`） |
| 多租户作用域 | 资源路径全程带作用域：`/workspaces/{slug}/projects/{pid}/issues/{iid}/` |
| 字段命名 | JSON 一律 snake_case |
| ID | UUID v4（不可枚举） |
| 时间 | ISO 8601 UTC，如 `2026-09-09T12:00:00Z` |
| 认证 | Session + CSRF（HttpOnly sessionid cookie；写操作需 `X-CSRFToken` 头，token 取自 `csrftoken` cookie） |
| 文档 | `/api/schema/`（OpenAPI 3.0）、`/api/docs/`（Swagger UI），以 schema 为实现事实源 |

## 2. 统一错误格式（无信封，语义由 HTTP 状态码承载）

```json
// 400 校验失败 —— 字段级
{ "title": ["该字段是必填项。"], "assignee": ["所选用户不是该项目成员。"] }

// 400 非字段级
{ "non_field_errors": ["identifier 必须为大写字母。"] }

// 401 未认证（未登录或 session 失效）
{ "detail": "身份认证信息未提供。" }

// 403 已认证但无权操作
{ "detail": "您没有执行该操作的权限。" }

// 404 不存在，或存在但对当前用户不可见（防资源枚举，统一 404）
{ "detail": "未找到。" }

// 429 触发频控（当前仅登录接口有失败锁定）
{ "detail": "尝试次数过多，请 15 分钟后再试。" }

// 500 服务端异常（不泄漏堆栈）
{ "detail": "服务器内部错误。" }
```

错误码速查：400 参数校验失败 / 401 未认证 / 403 无权限 / 404 不存在或不可见 / 405 方法不允许 / 429 频控 / 500 服务异常。

## 3. 统一分页格式（所有列表接口）

请求：`?page=1&per_page=50`（per_page 默认 50，上限 100）

```json
{
  "count": 128,
  "next": "http://…?page=2",
  "previous": null,
  "results": []
}
```

## 4. 前端联调要求（CORS / CSRF）

- 前端所有请求必须带 `credentials: "include"`（fetch）或 `withCredentials: true`（axios），否则 sessionid cookie 不会被保存。
- 调任何**写接口前**（POST/PATCH/DELETE），读 `csrftoken` cookie 的当前值放进请求头 `X-CSRFToken: <值>`（必要时可先 GET `/api/v1/auth/csrf/` 确保拿到 cookie）。
- ⚠️ **CSRF token 会轮换**：注册 / 登录 / 登出都会让服务端下发新的 `csrftoken`（Django 在会话升级时强制轮换）。所以**不要把 token 缓存到 JS 变量里长期复用**，每次写操作前重新读取 cookie 当前值即可（cookie 里始终是最新的）。
- 本地端口约定：前端 `http://localhost:3000`，后端 `http://127.0.0.1:8000`（跨端口但同 site，SameSite=Lax 的 cookie 可以带上）。
