# Sprint 6 开发日志：Redis Cache + Celery（后端）

- 日期：2026-09-10
- 分支：`feat/backend-cache-jobs`
- 对应计划：[BACKEND_PLAN.md](../../BACKEND_PLAN.md) §Sprint 6
- 契约：[docs/api/07-cache-and-tasks.md](../api/07-cache-and-tasks.md)

---

## 一、这次做了什么

1. **契约先行**：07 契约把"什么被缓存 / 何时失效 / 任务怎么查进度"一次写清，
   并按计划 §Sprint 6 的前置要求，**先核实了两个"真实痛点"是否成立**（见 §2.1，结论部分不成立）。
2. **缓存基础设施**：`core/cache.py`（键规范 `mini:{entity}:{scope}:v{N}`、
   版本号失效与直接删除两种策略、JSON-safe 归一化、TTL 兜底）；
   `apps/projects/cache.py`（Project 详情的读写与失效）。
3. **5 个失效点全部落在 services 写入口**，视图层只多了一次"读缓存"分支。
4. **异步任务**：新 app `apps/jobs`——
   - `TaskRun`（任务状态机 pending→running→success/failure，前端轮询）；
   - `Notification`（通知占位表，幂等键 `dedupe_key` 唯一约束）；
   - 两个任务：`notify_comment_created`（重试 3 次指数退避）、`bulk_assign_labels`（批量改标签）。
5. **新端点**：`POST …/issues/bulk/labels/`（202 + task_id）、`GET …/tasks/{task_id}/`（状态查询）。
6. **健康检查加 `cache` 字段**（Sprint 0 的雏形 + Sprint 6 的缓存探测）。
7. **本地零依赖通道**：`docker-compose.yml`（仅 Redis）+ 无 Docker 的 `filesystem://` broker 配置；
   `manage.py check_cache` 一条命令验证缓存后端与两种失效策略。
8. **测试 216 → 259**（新增 43）：缓存原语、详情缓存一致性/鉴权不绕过/三个失效点、
   通知幂等与收件人规则、重试策略（含"业务错误不重试"）、批量任务状态机与幂等。

## 二、怎么做的（关键决策与实测）

### 2.1 先核实"痛点"——结论：一半成立，一半不成立

计划 §Sprint 6 的前置写得很清楚：**与同学共同确认两个"真实痛点"成立，再引入 Redis**。
于是我先实测，再动工。

**痛点 1：Project 详情高频读 → 缓存它。实测结论：收益有限。**

| 读取方式 | SQL 条数 | 说明 |
|---------|---------|------|
| 冷读（查库 + 序列化） | 2 | 项目行 1 条 + 项目成员身份 1 条 |
| 热读（命中缓存） | 1 | 只剩鉴权那条成员查询 |

省下的那一条是**主键点查**，不是瓶颈。根本原因：**详情接口的鉴权本身就要查成员表**，
而"生效角色"不能缓存——成员被移除后若继续命中旧缓存，就是越权访问的安全洞。

所以详情缓存的价值是**基础设施演练**（Cache-Aside、两种失效策略、失效纪律、一致性测试），
而不是性能。这个结论写进了 07 契约 §1.5，避免后人误以为"详情接口因此变快"。
二期真正该缓存的是：**Issue 列表的 `COUNT(*)`**（Sprint 5 基准里它是最贵的一条）、
详情体的统计聚合、以及（需要安全评审的）生效角色。

**痛点 2：批量操作 / 通知不该阻塞请求线程 → 成立，做了。**
批量改标签是"逐条 set 标签"的写循环，评论通知要写库——这两类都不该让前端等。

### 2.2 缓存为什么是"响应体片段"而不是 ORM 对象

两个理由，都直接对应事故场景：

- **`current_user_role` 是每用户字段**：整包缓存会把 A 的角色发给 B。
  所以缓存体里**没有**这个字段，每次从生效角色注入
  （测试 `test_per_user_field_is_never_cached` 钉死）；
- **鉴权必须实时**：缓存 ORM 对象意味着"先查缓存再鉴权"或"鉴权用缓存里的身份"，
  两者都有越权风险。现在的顺序是"缓存命中 → 仍实时算生效角色 → 非成员 404"，
  防枚举规则不受缓存影响（`test_non_member_gets_404_even_on_cache_hit`）。

**键里带 `workspace_slug`** 也是同一个目的：命中即隐含"这个 (slug, project_id) 组合曾成立"，
跨工作区访问（`/ws-b/projects/{ws-a 的项目}`）永远是 miss（`test_cache_hit_cannot_bypass_workspace_scoping`）。

### 2.3 失效策略：两种都实现，默认用版本号

- **版本号失效**：自增 `mini:project:{scope}`（不带 TTL）→ 旧键瞬间读不到（成了孤儿，靠 TTL 回收）。
  优点是**并发安全**：不会出现"删除了缓存、紧接着旧请求又把旧值写回去"的竞态。
- **直接删除**：直观，但有上述 stale write-back 风险。

默认采用版本号（`invalidate(..., strategy=STRATEGY_VERSION)`），删除策略保留用于对比与特定场景。
`manage.py check_cache` 把两种各演示一遍。

失效点的一个细节：**"先失效再删"**。删项目时如果先 `project.delete()`，就拿不到 workspace slug，
没法拼失效键——所以顺序是 `invalidate()` → `delete()`。

另一个诚实的标注：**成员变更目前是"防御性失效"**——当前缓存体里没有成员字段，
严格说它不影响缓存内容；但详情体二期几乎必然加成员数/成员列表，这个失效点现在就要预留
（计划把 `member_change_invalidates` 列为验收项，已实现并在测试与服务层注释里说明）。

### 2.4 幂等为什么不用 task_id

Celery 的投递语义是 **at-least-once**：重试、worker 重启、手动重投都会让同一逻辑事件到达多次。
`task_id` 只是"这一次执行"的标识，同一逻辑事件可能带着不同 task_id 到达（手动重投时尤其如此）。
所以通知的幂等键用的是**业务事件本身**：

```text
Notification.dedupe_key = "comment.created:{comment_id}:{recipient_id}"   # 唯一约束
```

重复投递走 `get_or_create` 的"已存在"分支，返回 `skipped`，不报错、不重复落库
（测试 `test_is_idempotent_under_redelivery`：第二次 `{"delivered": 0, "skipped": 2}`）。

### 2.5 重试：策略本身可测，而不是靠"跑起来看"

`max_retries=3`、指数退避（第 n 次等 `2**n` 秒 → 2s/4s/8s）、**只有 `TransientJobError` 才重试**。
业务错误（参数非法）重试不会变好，所以不重试（`test_business_error_does_not_retry`）。

为了让这些能脱离 worker 单测，把纯业务逻辑抽成普通函数
（`_deliver_comment_notification` / `_run_bulk_assign_labels`），Celery 任务只是薄壳；
测试里用 `mock.patch.object(task, "retry")` 断言"会不会重试、退避几秒、带的是什么异常"。

**任务对"对象消失"是容忍的**：评论被删后任务正常返回
`{"delivered": 0, "skipped": 0, "reason": "comment_missing"}`——at-least-once 的现实约束，
任务必须能优雅处理，而不是把重试队列塞满。

### 2.6 投递时序：`transaction.on_commit` 不是可选的

在事务里直接 `.delay()`，worker 可能抢在提交前读数据 → 通知丢失。
所有投递点都包在 `transaction.on_commit(...)` 里。

**代价是测试姿势变了**：`TestCase` 把用例包在事务里，`on_commit` 不会触发。
需要验证"投递后真的执行了"的用例必须用 `self.captureOnCommitCallbacks(execute=True)`。
这是这次踩到并解决的一个 Django 细节，值得记下来。

### 2.7 无 Docker 的本地通道（Windows 上踩了两个坑）

本机没有 Docker（WSL 又被安全策略拦截），但"worker 可本地起并处理任务"是计划验收项。
解法是 **Celery 的 filesystem broker**（跨进程可用，不需要 Redis），期间踩了两个坑：

1. **Windows 需要 `pywin32`**：kombu 的 filesystem transport 用 Windows 文件锁（`pywintypes`），
   缺它会直接 `ModuleNotFoundError`。已加入 `requirements/local.txt`（仅 win32）。
2. **`store_processed` 必须关掉**：它靠 `os.rename` 把消息挪进 processed 目录，
   Windows 上因文件被占用而失败，报 `ChannelError: Cannot read file 'processed\xxx.celery.msg' from queue.`
   关掉后消息读完即删，链路立刻通了。

最终实测：`CELERY_BROKER_URL=filesystem://` + `python -m celery -A config worker --pool=solo`，
**真 worker 进程**消费了 `notify_comment_created`，`Notification` 表出现一条
`('comment.created', 's6-member')` —— "worker 可本地起并处理任务"这条验收**在没有 Docker 的情况下也跑通了**。

### 2.8 配置分层（谁负责什么）

| 环境 | 缓存 | 任务执行 | 说明 |
|------|------|---------|------|
| `test.py` | **强制 LocMem** | **强制 eager** | 测试不依赖任何外部服务；否则开发机 `.env` 配了 Redis 会让测试失败 |
| `local.py` | 按 `.env`（默认 LocMem） | 默认 eager（`.env` 可关） | 本地零依赖即可跑通全链路 |
| `base.py` / 生产 | 按 `CACHE_URL` | 按 `CELERY_BROKER_URL` | Redis + 真 worker |

这一层的取舍：**测试必须确定性**，所以外部依赖一律关掉；
Redis 后端专有的行为（`delete_pattern`）进不了单测，就放到 `check_cache` 命令里手工验证。

## 三、验收结果

验收时间：2026-09-10 23:40，**全部通过** ✅

| 验收项 | 计划标准 | 结果 |
|--------|----------|------|
| 测试 | 全绿（eager + 不依赖 worker） | ✅ **259 用例**（本 Sprint 新增 43），`Ran 259 tests OK` |
| 缓存行为 | 二次读不发项目行查询 | ✅ 冷读 2 条 SQL → 热读 1 条（省掉的是主键点查，见 §2.1 的诚实结论） |
| 缓存一致性 | JSON 反序列化后与直读一致 | ✅ 冷读与热读响应体逐字段相等（`test_cold_and_warm_reads_return_the_same_body`） |
| 失效点 | patch / delete / member change | ✅ 三者 + 移除工作区成员 + 删除工作区，共 5 处 |
| 两种失效策略 | 都实现并对比 | ✅ 版本号（默认）+ 直接删除；`check_cache` 演示；结论见 07 契约 §1.4 |
| 缓存不越权 | 防枚举不被缓存绕过 | ✅ 三个专项测试（每用户字段 / 跨工作区 / 非成员） |
| 通知任务 | Retry 3 次退避 + 幂等 | ✅ 退避 2s/4s/8s、业务错误不重试、幂等键挡住重复投递 |
| 批量任务 | 异步 + 状态可查 | ✅ `pending → success` 流转 + 结果摘要；失败态与错误信息有测试 |
| 无陈旧窗口 | 改完立即读拿到新值 | ✅ 冒烟第 45 步：PATCH 改名 → 立即 GET 拿到新名 |
| worker | 本地起 worker 处理任务 | ✅ **真 worker 进程**（filesystem broker）消费 `notify_comment_created`，落库 1 条通知 |
| schema / lint | 零警告零告警 | ✅ `spectacular --validate --fail-on-warn` 通过；`ruff check`/`format --check` 全绿 |
| 迁移 | 可从零重放 | ✅ `jobs.0001_initial` 已应用；`makemigrations --check` 无漂移 |
| 冒烟 | 演示脚本跑通 | ✅ **54 步**真 HTTP 全绿（新增 8 步缓存与任务），服务端 0 异常 |

### 关键数字

```text
测试：216 → 259（+43）
冒烟：46 → 54 步
详情接口 SQL：冷读 2 → 热读 1（诚实结论：省的是主键点查，瓶颈在鉴权）
失效点：5 处（PATCH / DELETE 项目、成员 增改删、工作区侧 2 个级联场景）
重试：3 次，指数退避 2s/4s/8s，仅 TransientJobError
新表：jobs_taskrun、jobs_notification
```

## 四、下一步（Sprint 7：WebSocket Realtime）

1. Django Channels + Redis channel layer（这时 Redis 就是硬依赖了，与 Sprint 6 的 compose 片段正好接上）。
2. 事件范围先收窄：`issue.updated` / `comment.created` 两个事件推到项目频道即可，
   不做"全站广播"这种用不上的能力。
3. 鉴权：WebSocket 握手沿用 Session（`AuthMiddlewareStack`），并复用 `resolve_project` 的生效角色，
   非成员在握手阶段就拒绝（而不是连接后悄悄收不到消息）。
4. 前端约定：频道名、事件包体（entity_type + action + 载荷）写进 08 契约后再动手。

## 五、给同学的联调须知

- **批量改标签是异步的**：`POST …/issues/bulk/labels/` 返回 **202 + `id`**，
  拿 `id` 去 `GET …/tasks/{id}/` 轮询 `status`；`status=success` 后再刷新列表。
  语义是**覆盖式**：`label_ids: []` 表示清空这些 Issue 的标签。
- **项目详情有缓存**：任何写操作（改项目 / 成员增删改）后端都会主动失效，
  前端**不需要**自己"写完强制刷新"；TTL 300 秒是兜底。
- **健康检查多了 `cache` 字段**：`{"status":"ok","database":"ok","cache":"ok"}`，
  部署排查时先看它。
- **通知只是落库**：`Notification` 表有数据，但没有任何推送通道（二期）。
  前端要展示"未读通知"，可以直接用它的查询接口（二期补契约）。
- **任务失败可见**：`status=failure` 时 `error` 是人类可读的中文原因，前端直接展示即可。
- 冒烟脚本已扩到 54 步（含缓存一致性与批量任务），跑法见 `backend/scripts/smoke_backend.py` 文件头。
