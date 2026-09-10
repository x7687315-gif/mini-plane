# 07 · 缓存与异步任务契约

> 状态：**待前端确认 → 确认后冻结**
> 公共约定见 [00-conventions.md](00-conventions.md)。
> 计划依据：[BACKEND_PLAN.md](../../BACKEND_PLAN.md) §Sprint 6。
> 本文回答三个问题：**什么被缓存了？什么时候失效？异步任务怎么查进度？**

## 一、缓存

### 1.1 当前只缓存了一个东西

| 项 | 内容 |
|----|------|
| 对象 | `GET /api/v1/workspaces/{slug}/projects/{pid}/` 的**响应体片段**（不含 `current_user_role`） |
| 键 | `mini:project:{workspace_slug}:{project_id}:v{version}` |
| 版本键 | `mini:project:{workspace_slug}:{project_id}`（**不带 TTL**，必须活得比数据键久） |
| TTL | **300 秒**兜底（即使某个失效点被遗漏，最迟 5 分钟后缓存也会过期） |
| 后端 | `CACHE_URL` 未配 → LocMem（单进程）；配了 → Redis（`django-redis`，JSON 序列化） |

**为什么缓存的是响应体而不是 ORM 对象**：鉴权必须实时执行（成员被移除后缓存不能继续放行），
所以缓存里只放"角色无关"的字段；`current_user_role` 是**每用户**字段，每次从生效角色注入，
**绝不进缓存**（否则 A 的角色会泄露给 B，见测试 `test_per_user_field_is_never_cached`）。

### 1.2 一致性保证

- **序列化一致性**：写缓存前用 DRF 的 JSONEncoder 把响应体归一化（UUID → 字符串、时间 → ISO8601），
  因此"第二次读（命中缓存）"和"第一次读（查库）"的响应体**逐字段一致**；
- **防枚举不被缓存绕过**：键里带 `workspace_slug`，命中即隐含"这个 (slug, project_id) 组合曾经成立"；
  `/workspaces/ws-b/projects/{属于 ws-a 的项目}/` 在 ws-b 下永远是 miss，
  命中后仍要做成员校验，非成员 → **404**；
- **无陈旧窗口**：写路径在**同一事务里**失效缓存，"PATCH 改名 → 立即 GET"拿到的是新值
  （验收见冒烟脚本第 45 步）。

### 1.3 失效点（全部落在 services 写入口，视图层不手工失效）

| 触发 | 策略 | 说明 |
|------|------|------|
| PATCH 项目（name / identifier / description） | 版本号 +1 | 描述这类长文本也进了缓存体，所以任何字段变更都失效 |
| 删除项目 | 先失效再删 | 删完就拿不到 workspace slug 了 |
| 项目成员 增 / 改角色 / 移除 | 版本号 +1 | **防御性失效**：当前缓存体没有成员字段，但详情体二期几乎必然加成员数/成员列表，这个失效点现在就要预留 |
| 移除工作区成员 | 整个工作区的项目缓存全部作废 | 它会级联清掉项目成员身份，可能改变生效角色 |
| 删除工作区 | 整个工作区的项目缓存全部作废 | 项目全部级联消失 |

### 1.4 两种失效策略（计划要求对比，两种都已实现）

| 策略 | 做法 | 优点 | 缺点 | 当前采用 |
|------|------|------|------|---------|
| `version` | 自增版本号键，旧键变成孤儿靠 TTL 回收 | 一次自新作废"整个项目"的所有键；并发下不会"删了又被旧请求写回" | 版本键必须不设 TTL；孤儿键占用空间直到过期 | **默认** |
| `delete` | 直接删除当前键 | 直观、不占额外键 | 高并发下有"删了又被旧请求回填"的竞态（stale write-back） | 已实现，未启用 |

`manage.py check_cache` 会把两种策略各演示一遍（含 Redis 后端的 `delete_pattern` 能力验证）。

### 1.5 诚实的结论：这次缓存省了多少

**先核实前提（计划 §Sprint 6 前置）**：实测"Project 详情冷读"为 **2 条 SQL**
（1 条取项目行 + 1 条查项目成员身份），命中缓存后降到 **1 条**
（只剩鉴权那条成员查询）。收益是**省 1 条主键点查**，不是数量级提升。

原因：详情接口的**鉴权本身**就要查成员表，而权限不能缓存（缓存权限 = 成员被移除后仍能访问的安全洞）。
所以：

- ✅ 已按计划实现完整链路（Cache-Aside、版本/删除两种失效、TTL 兜底、5 个失效点、一致性测试），
  作为**缓存基础设施的落地与演练**；
- ⚠️ 但**不要**把"详情接口因此变快"当成结论——它的瓶颈在鉴权查询，不在项目行；
- 🎯 二期真正该缓存的是：**Issue 列表的 `count()`**（5000 条基准下它是最贵的一条 SQL）、
  详情体里的成员数/统计聚合、以及"生效角色"（需要可接受的失效延迟与安全评审）。

健康检查 `/api/v1/health/` 新增 `cache` 字段（ok/error），用于快速验证缓存后端是否可用。

## 二、异步任务

### 2.1 端点

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `…/projects/{pid}/issues/bulk/labels/` | 生效角色 ≥ Member | 批量改标签；**202** + TaskRun 对象（含 `id`） |
| GET | `…/projects/{pid}/tasks/{task_id}/` | 生效角色 ≥ Viewer | 查询任务状态 |

请求体：`{"issue_ids": ["…"], "label_ids": ["…"]}`
语义是**覆盖式**：把选中 Issue 的标签整体替换为 `label_ids`；**空数组 = 清空标签**。
跨作用域校验在请求时就做完（400），任务执行阶段仍会二次校验（防御纵深）。

### 2.2 TaskRun 对象

```json
{
  "id": "task-run-uuid",
  "kind": "bulk_assign_labels",
  "status": "success",
  "params": {"issue_ids": ["…"], "label_ids": ["…"]},
  "result": {"issues": 1, "labels": 1, "label_ids": ["…"]},
  "error": "",
  "actor": {"id": "uuid", "username": "amiya", "avatar": null},
  "created_at": "2026-09-10T15:00:00Z",
  "updated_at": "2026-09-10T15:00:01Z"
}
```

`status` 状态机：`pending → running → success | failure`。
失败时 `error` 是人类可读的原因；`result` 是成功后的摘要（前端可直接展示"3 个任务已打上 2 个标签"）。

**为什么状态落在自家表而不是 Celery 的 `AsyncResult`**：
① 状态要能落库、可查、可审计；② `CELERY_TASK_ALWAYS_EAGER=True` 时 `AsyncResult`
恒为 SUCCESS，测不出 `pending → success` 的流转，而这是计划的验收项。

### 2.3 通知（占位实现）

评论创建后会投递 `notify_comment_created` 任务，给"指派人 + 任务创建者"（排除评论作者）落一条
`Notification` 记录。**MVP 只落库，不发邮件/推送**（二期接通知网关）。

**幂等实现**：`Notification.dedupe_key` 唯一约束，键 = `comment.created:{comment_id}:{recipient_id}`。
重复投递走 `get_or_create` 的"已存在"分支，返回 `skipped`，不算失败。
**为什么不用 task_id 去重**：Celery 是 at-least-once，同一逻辑事件可能因重试 / worker 重启 / 手动重投
到达多次；task_id 只是"这一次执行"的标识，业务幂等键才是稳定的。

### 2.4 重试策略

| 项 | 值 |
|----|-----|
| 最大重试 | 3 次 |
| 退避 | 指数 + 无抖动：第 n 次重试等 `2**n` 秒 → **2s / 4s / 8s** |
| 可重试的异常 | 仅 `TransientJobError`（下游超时、连接抖动、5xx） |
| 不可重试 | 业务错误（参数非法、对象消失）——重试不会变好，只会刷日志 |

任务对"对象在投递窗口内消失"是**容忍**的：评论被删后任务正常返回
`{"delivered": 0, "skipped": 0, "reason": "comment_missing"}`，不算失败。

### 2.5 投递时序：必须 `transaction.on_commit`

在事务里直接 `.delay()` 会让 worker 抢在提交前读数据（竞态）。
所以所有投递点都包在 `transaction.on_commit(...)` 里，消息只在数据可见后发出。
**测试注意**：`TestCase` 把用例包在事务里，`on_commit` 不会触发——
需要验证"投递后真的执行了"的用例，请用 `self.captureOnCommitCallbacks(execute=True)`。

## 三、本地怎么跑

| 场景 | 做法 |
|------|------|
| 零依赖（默认） | 什么都不配：缓存用 LocMem、任务 eager 同步执行，`python manage.py runserver` 即可 |
| 用 Redis | `docker compose up -d redis` → `.env` 里配 `CACHE_URL=redis://127.0.0.1:6379/0` |
| 真 worker（无 Docker） | `.env`：`CELERY_BROKER_URL=filesystem://`、`CELERY_TASK_ALWAYS_EAGER=False` → 另开终端 `python -m celery -A config worker -l info --pool=solo` |
| 真 worker（有 Redis） | 同上，但 `CELERY_BROKER_URL=redis://127.0.0.1:6379/1` |

**Windows 注意**：filesystem broker 依赖 `pywin32`（文件锁），已加进 `requirements/local.txt`。

## 四、变更记录

| 日期 | 变更 | 状态 |
|------|------|------|
| 2026-09-10 | 初稿（后端起草，Sprint 6）：Project 详情缓存（键规范 / 两种失效策略 / 5 个失效点 / TTL 300s）、批量改标签任务与状态接口、通知占位表与幂等键、重试策略、`transaction.on_commit` 投递时序；**附"详情缓存收益有限"的诚实结论** | 待前端确认 |
