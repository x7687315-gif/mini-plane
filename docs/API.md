# API 文档（drf-spectacular 生成）

> 本文件是入口说明；**权威的接口定义**有两份，均由代码自动生成/校验，不允许手改：
>
> 1. **在线交互文档（Swagger UI）**：<http://127.0.0.1:8000/api/docs/>
> 2. **OpenAPI 3.0 规范文件**：[docs/api/openapi.yaml](api/openapi.yaml)（仓库内快照，CI 保证与代码一致）

## 人工维护的契约文档

OpenAPI 描述"接口长什么样"，下面的手写契约解释"行为为什么是这样"（多值语义、
错误分支、防枚举约定、缓存与推送行为等），两者互补：

| 文档 | 内容 |
|------|------|
| [00-conventions.md](api/00-conventions.md) | 通用约定：认证、错误体、分页体、命名、幂等 |
| [01-auth.md](api/01-auth.md) | 注册 / 登录 / 登出 / 当前用户 |
| [02-workspaces.md](api/02-workspaces.md) | 工作区与成员管理 |
| [03-projects.md](api/03-projects.md) | 项目、项目成员、默认五态 |
| [04-issues.md](api/04-issues.md) | Issue / Label CRUD + 列表查询引擎（过滤/搜索/排序/分页） |
| [05-comments.md](api/05-comments.md) | 评论 |
| [06-activities.md](api/06-activities.md) | 活动流（含文案映射表） |
| [07-cache-and-tasks.md](api/07-cache-and-tasks.md) | 缓存行为说明 + 批量任务状态接口 |
| [08-realtime.md](api/08-realtime.md) | WebSocket：握手、关闭码、事件帧、心跳 |

## 重新生成 schema

代码改了接口之后（本地开发配置即可）：

```powershell
cd backend
python manage.py spectacular --settings=config.settings.test --validate --fail-on-warn --file ../docs/api/openapi.yaml
```

- `--validate --fail-on-warn`：schema 有警告即失败，警告会直接漏进前端联调；
- CI 会重复同样的生成动作并与仓库内快照 `diff`，**改了接口不重新生成会直接红**。

## 快速体验（本地起服务后）

```powershell
# 注册 → 登录（种 session cookie）→ 查看自己
curl -X POST http://127.0.0.1:8000/api/v1/auth/register/ -H "Content-Type: application/json" ^
  -d "{\"username\": \"amiya\", \"email\": \"amiya@example.com\", \"password\": \"Pw12345678\"}"
curl -c cookies.txt -X POST http://127.0.0.1:8000/api/v1/auth/login/ -H "Content-Type: application/json" ^
  -d "{\"username\": \"amiya\", \"password\": \"Pw12345678\"}"
curl -b cookies.txt http://127.0.0.1:8000/api/v1/auth/me/
```
