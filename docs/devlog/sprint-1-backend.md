# Sprint 1 开发日志：User / Auth（后端）

- 日期：2026-09-09
- 分支：`feat/backend-auth`（完成验收后合入 main）
- 对应计划：[BACKEND_PLAN.md](../../BACKEND_PLAN.md) §Sprint 1
- 契约：[docs/api/00-conventions.md](../api/00-conventions.md)、[docs/api/01-auth.md](../api/01-auth.md)

---

## 一、这次做了什么

1. **契约先行**：起草并冻结 `docs/api/00-conventions.md`（全局错误体/分页体/CORS/CSRF 联调约定）与 `docs/api/01-auth.md`（auth 五端点契约），作为与前端同学的冻结基线。
2. **User 模型**：`apps/users/models.py` —— `User(AbstractUser, BaseModel)`，UUID 主键、email 唯一、avatar URL；`AUTH_USER_MODEL = "users.User"`。
3. **核心设施**（core/）：
   - `exceptions.py` 统一异常处理：未带凭证的未认证请求 403→401（契约要求），未知异常统一 500 响应体+完整堆栈日志；
   - `pagination.py` 统一分页器（per_page 默认 50 / 上限 100，本 Sprint 就位供后续列表接口复用）。
4. **Auth 五接口**：`/auth/csrf/`（种 cookie）、`register`（注册即登录）、`login`、`logout`、`me`，全部带 drf-spectacular 注解。
5. **登录防暴力**：`services.py` 内存版失败计数（15 分钟窗口 5 次，成功清零），失败写 warning 日志。
6. **CORS/CSRF 联调配置**：django-cors-headers 4.9.0、CORS_ALLOW_CREDENTIALS、CSRF_TRUSTED_ORIGINS 走 .env。
7. **测试 16 个用例全绿**（注册 6 / 登录 4 / me+登出 3 / CSRF 真实路径 1 / health 2）。
8. **curl 全链路冒烟**：csrf→register→me→logout→401→login→me→wrong-password 全部符合契约。

## 二、怎么做的（关键实现与排障记录）

### 2.1 自定义 User 与数据库重置

`AUTH_USER_MODEL` 必须在**首次迁移前**生效，否则 auth 系统表会绑定默认用户模型，事后迁移成本极高。本 Sprint 在开发库 `miniplane`（尚无真实数据）上选择删库重建 + 重新 migrate，这是引入自定义 User 的唯一正确时机，已写死在计划里。

### 2.2 排障一：schema 里所有端点消失（Sprint 0 的隐藏 Bug）

首次跑 `manage.py spectacular` 发现 6 个视图全部报 "unable to guess serializer"，schema 里连路径都没有——**Sprint 0 的 health 也有同样问题**，当时只验证了 `/api/schema/` 返回 200，没有检查内容，验收存在漏洞（已记入 §四）。

根因是两个库的新版本组合行为变化：

- DRF 3.18 的 `@api_view` 把原函数封进 `handler` 闭包，**不再把原函数挂到 WrappedAPIView 上**（旧版的 `cls.handler` 通道没了），也不透传函数自定义属性；
- drf-spectacular 0.30 的 `@extend_schema` 不再用 `_spectacular_annotation` 函数属性，而是生成 `ExtendedSchema` 子类，对函数视图写进 `f.kwargs['schema']`，只有当它作用于 `as_view()` 产物时才走 `cls.kwargs['schema']` 被 `SchemaGenerator.create_view` 读取。

**结论：`@extend_schema` 必须放在 `@api_view` 上方**。两个视图文件均已按此重排并加了注释，schema 现在 6 个端点、0 警告、0 错误。

### 2.3 排障二：curl 冒烟 403——CSRF token 轮换

冒烟时 logout 返回 403：Django 在**注册/登录/登出（会话升级/降级）时强制轮换 CSRF token**（`login()` 内部 `rotate_token`）。冒烟脚本用了轮换前的旧 token 值。对前端的意义（已写进 00-conventions §4）：

> 每次写操作前重新读取 `csrftoken` cookie 的当前值放进 `X-CSRFToken` 头，**不要把 token 缓存到 JS 变量里长期复用**。

顺带发现：持有有效会话时再调登录接口也会触发 CSRF 校验（SessionAuthentication 对已认证会话强制 CSRF），这是预期行为。

### 2.4 排障三：测试互相污染

登录失败计数是进程级内存状态，跨测试用例残留——lockout 用例的 5 次失败把后续"正确密码登录"用例误锁成 429。给 `services` 加了 `clear_all()`（注释标明仅供测试隔离），在 `LoginTests.setUp` 清空。

### 2.5 401 的正确打开方式

DRF 的 SessionAuthentication 对"完全没带凭证"的请求默认返回 403，不符合契约的 401 语义。在统一异常处理器里对 `NotAuthenticated`（default_code `not_authenticated`）做 403→401 转换，`test_me_unauthenticated_returns_401` 作为回归防线。有凭证但无权限仍是 403。

### 2.6 报错文案的实测记录

把真实响应文案固化进契约（`已存在一位使用该名字的用户。`、`这个密码太常见了。`等），并发现 Django 5.2 部分密码校验文案**没有中文翻译**（如 "This password is too short..."）。契约里明确：前端按「字段名+状态码」处理，不要按文案分支。

## 三、验收结果

验收时间：2026-09-09 23:15，**全部通过** ✅

| 验收项 | 计划标准 | 结果 |
|--------|----------|------|
| 测试 | 计划列出的用例全绿 | ✅ Ran 16 tests, OK |
| 冒烟 | register→login→me→logout→me(401) | ✅ 201/200/204/401/200 全符合契约 |
| 登录防暴 | 连续失败锁定 | ✅ 第 6 次 429（含正确密码） |
| CSRF 真实路径 | 无 token 403、带 token 204 | ✅ enforce_csrf_checks=True 用例通过 |
| schema | /api/schema/ 无警告、端点齐全 | ✅ 0 警告 0 错误，6 路径 |
| ruff | check + format 零告警 | ✅ |
| 契约 | docs/api/*.md 与实现一致 | ✅ 含 CSRF 轮换规则与实测文案 |

## 四、遇到的问题与解决（汇总）

| 问题 | 根因 | 解决 |
|------|------|------|
| schema 无端点（Sprint 0 潜伏） | DRF 3.18 api_view 闭包化 + spectacular 0.30 改用 cls.kwargs 注入 | `@extend_schema` 移到 `@api_view` 上方；验收从"看状态码"升级为"查内容" |
| logout 冒烟 403 | 登录/注册轮换 CSRF token | 契约 §4 写明"写操作前重读 cookie"；冒烟脚本改为每次重读 |
| 正确密码登录被误锁 429 | 内存计数器跨测试用例残留 | `services.clear_all()` + 测试 setUp 隔离 |
| 测试运行卡在交互确认 | 上次运行残留 test 数据库 | 统一加 `--noinput`（已更新计划与 README） |
| DJ001 avatar null=True | ruff 规则建议字符串字段不用 null | 保留 null（区分未设置/空串），加 noqa 注释说明，二期换 ImageField |

## 五、下一步（Sprint 2：Workspace / Project）

1. 与同学冻结 `docs/api/02-workspaces.md`、`03-projects.md`（含 §4 权限矩阵确认）。
2. 四个模型 + 约束：Workspace / WorkspaceMember / Project / ProjectMember，slug 生成、identifier 大写校验、unique_together。
3. 对象级权限类（IsWorkspaceMember / 角色判断）+ **404 防枚举**统一实现。
4. Project 创建的原子性：creator 成项目 Admin + 预置 5 个默认 State（事务）。
5. 权限矩阵逐格参数化测试 + assertNumQueries 防 N+1。

## 六、给同学的联调须知

- 契约：`docs/api/00-conventions.md` + `docs/api/01-auth.md`，**重点看 §4 的 CSRF 轮换规则**。
- Swagger：<http://127.0.0.1:8000/api/docs/>
- 联调验收脚本：注册 → 登录 → 打开前端受保护页显示用户名 → 登出 → 再访问被拦截。
- 已知事项：Django 校验文案中英混排，请按字段名处理（见 01-auth.md 表格下方注意）。
