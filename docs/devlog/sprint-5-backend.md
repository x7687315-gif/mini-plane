# Sprint 5 开发日志：Search / Filter / Sort / Pagination 强化（后端）

- 日期：2026-09-10
- 分支：`feat/backend-query-engine`
- 对应计划：[BACKEND_PLAN.md](../../BACKEND_PLAN.md) §Sprint 5、§7.5
- 契约：[docs/api/04-issues.md](../api/04-issues.md) 的「列表（查询引擎）」章节

---

## 一、这次做了什么

1. **契约先行**：把 04 契约的列表章节从"Sprint 3 已支持 / Sprint 5 待实现"改成完整的查询引擎规格，
   并冻结三处有争议的语义（见 §2.1）。
2. **通用原语下沉到 core**：新增 `core/filtering.py`（CSV 解析、UUID 列表解析、白名单排序），
   与业务无关，任何列表接口都能复用。
3. **Issue 域语义留在 app**：`apps/issues/filters.py` 把每个查询参数映射到字段，
   并维护排序白名单与优先级严重度表达式。
4. **分页边界收敛**：`core/pagination.py` 把 DRF 默认的两种 404 改成
   「非整数 page → 400」「越界 page → 200 + 空 results」。
5. **两个管理命令**：`seed_issues`（造可复现的基准数据）与 `benchmark_issues`（EXPLAIN 对比 + P95 计时）。
6. **索引被实测推翻并修正**：Sprint 3 建的 `(project, -created_at)` 因为 Sprint 5 引入的
   **稳定排序次级键**而不再被命中，已改为 `(project, -created_at, -sequence_id)`（§2.2）。
7. **测试 181 → 216**（新增 35）：过滤各类取值与非法值、labels 并集不重复、搜索三个分支、
   组合过滤、排序五个白名单值 + 注入面 + 稳定排序、分页八个边界。

## 二、怎么做的（关键决策与实测）

### 2.1 三处需要当场拍板的语义

计划只写了参数名，没写语义。这次定下来并写进契约：

| 问题 | 决定 | 理由 |
|------|------|------|
| `labels` 多值是交集还是并集？ | **并集（OR）** | 多选筛选器的用户预期是"任一命中"，交集更常用于"同时满足多个标签"的高级场景（二期） |
| 缺省排序是什么？ | **`-created_at`**（Sprint 3 是 `-sequence_id`） | 计划 §Sprint 5 明确要求；且 `-created_at` 是有索引意图的默认排序 |
| `ordering=priority` 怎么排？ | **按严重度**（urgent→high→medium→low→none），不是字母序 | 字母序会得到 `high/low/medium/none/urgent`，没有任何产品含义 |

另外引入一条**稳定排序**规则：所有排序都自动追加 `sequence_id`（项目内唯一）作为末位次级键。
理由不是洁癖：`created_at` 受系统时钟粒度限制（Windows 约 15ms），同一批创建的 Issue 会拿到
**完全相同**的时间戳，此时翻页（`OFFSET` 分页）会出现**同一条记录重复出现或被跳过**。

### 2.2 索引验证：稳定排序把一个索引"用废"了，然后修好了

先按计划造 5000 条基准数据（`seed_issues`），再用 `benchmark_issues` 拿执行计划。

**第一次实测（索引为 Sprint 3 的 `(project, -created_at)`）——问题暴露：**

```text
Limit  (cost=51.12..51.16) (actual time=1.988..1.991 rows=50)
  ->  Sort  Sort Key: created_at DESC, sequence_id DESC   ← 还是要排序
        ->  Bitmap Heap Scan on issues_issue (rows=5000)   ← 读了全部 5000 行
              ->  Bitmap Index Scan on issues_issue_project_id_4b0f3e2f
```

规划器**没有**用那个复合索引，用的只是 `project_id` 单列索引：因为排序键是两个字段
（`-created_at, -sequence_id`），而索引只有 `(project, created_at DESC)`——
**索引满足不了 ORDER BY，就只能"取全部行 + top-N 排序"**。

**修正：把索引改成覆盖完整排序键**（迁移 `0004`，同时移除旧索引，因为新索引的前缀就能服务旧查询）：

```python
models.Index(fields=["project", "-created_at", "-sequence_id"])
```

**修正后实测：**

```text
Limit  (cost=0.28..8.55) (actual time=0.023..0.180 rows=50)
  ->  Index Scan using issues_issu_project_c322cb_idx on issues_issue (rows=50)
        Index Cond: (project_id = '...'::uuid)
```

| 指标 | 修正前 | 修正后 |
|------|--------|--------|
| 访问路径 | Bitmap(project_id) + 读 5000 行 + top-N Sort | 复合索引 Index Scan，**只读 50 行** |
| 计划 cost | 51.12 | **0.28 ~ 8.55** |
| Execution Time | 1.99 ms | **0.195 ms（约 10×）** |
| 列表接口 P95（30 次取样） | 16.7 ms | **11.2 ms** |

> **这是本 Sprint 最有价值的一条经验**：给排序加次级键不是"顺便加一个字段"，
> 它会让原来的单列排序索引失效。**排序键变了，索引必须跟着一起改。**

### 2.3 另外两条实测结论

**① `search` 的 `icontains` 注定是顺序扫描**——这是预期内的，写进结论是为了给二期埋点：

```text
->  Seq Scan on issues_issue (rows=5000)   Filter: (upper(title) ~~ '%SEED 42%')
```

5000 行耗时 2.37 ms，可以接受；量级再上来就要 `pg_trgm`（GIN）或外部检索引擎。
**不要试图用普通 B-tree 索引优化 `LIKE '%x%'`**——前缀通配用不上索引。

**② `(project, state)` / `(project, priority)` 这两个索引的定位要重新认识：**

- 在"过滤 + 按时间倒序取前 50"这个形态下，规划器**更愿意用新的复合索引**
  （它能同时满足过滤与排序，走索引顺序、凑够 50 条就停）；
- 但复合索引在这个形态下是"边走边过滤"（实测 `Rows Removed by Filter: 262`），
  如果某个状态的桶**很稀疏**（比如只占 1%），走 `(project, state)` 反而更快。
  两者是互补而不是替代，所以**都保留**。
- `ordering=priority` 的严重度排序用 `CASE` 表达式，**天然用不上任何索引**——
  这是"产品语义优先于索引"的自觉取舍，已写进契约与本节。

### 2.4 方法论：为什么是"关掉索引扫描"而不是"DROP INDEX 再建回来"

`benchmark_issues` 用 `SET LOCAL enable_indexscan = off; SET LOCAL enable_bitmapscan = off;`
在**当前事务内**让规划器看不到索引。效果等价于"索引不存在"，但：

- 不动任何 DDL：中途 Ctrl+C、断电、报错都不会留下一个半残的库；
- `SET LOCAL` 事务结束自动失效，天然可重入；
- 基准脚本因此可以随时反复执行，不需要"跑完记得建回来"的人工纪律。

代价是它模拟的是"索引不可用"而不是"索引不存在"（统计信息仍认为索引存在，cost 估算会偏保守），
所以文中所有结论都以 **actual time / rows / 访问路径** 为准，不拿 cost 做跨场景比较。

### 2.5 分页边界：为什么越界给 200 而不是 404

DRF 默认对越界页码抛 `NotFound`（404）。但 404 在本项目契约里另有含义——
**资源不存在或不可见**（§4.3 防枚举）。"第 5 页筛完只剩 1 页"是正常的交互中间态，
给 404 会让前端把"筛没了"和"越权/不存在"混在一起处理。

所以 `core/pagination.py` 里：

- 非整数 `page` → **400**（`{"page": ["页码必须是整数。"]}`）——前端 bug 要喊出来，不能悄悄返回空；
- 越界 `page` → **200** + `results: []` + `count` 仍是真实总数 + `previous` 指回最后一页。

实现上用一个 `OutOfRangePage` 替身（只实现渲染分页体用到的三个方法），
避免去改动 DRF 分页器的内部状态。

## 三、验收结果

验收时间：2026-09-10 23:05，**全部通过** ✅

| 验收项 | 计划标准 | 结果 |
|--------|----------|------|
| 测试 | 全绿 | ✅ **216 用例**（本 Sprint 新增 35），`Ran 216 tests OK` |
| 过滤 | state/priority/assignee/labels 多值按契约 | ✅ 含非法值 400、未知值空结果、多标签不重复（`distinct`） |
| 搜索 | title + description | ✅ 命中标题 / 命中描述 / 大小写不敏感 / 空结果 200 / 空白忽略 |
| 排序 | 白名单 + 非法 400 | ✅ 五个白名单值逐一断言 + 注入面 400 + **稳定排序三项**（同时间戳下两种方向 + 翻页不重复） |
| 分页 | 越界空 results、上限收敛 | ✅ 八个边界（含 `page=0`、`page=-1`、非整数 400） |
| **索引** | EXPLAIN 结论 | ✅ **实测推翻并按结论修正**：`(project,-created_at)` → `(project,-created_at,-sequence_id)`，默认列表 **1.99ms → 0.195ms** |
| 性能 | 5000 条下 P95 < 300ms | ✅ **P95 = 11.2 ms**（30 次取样，中位 8.8ms，min 8.0ms） |
| schema | 零警告零错误 | ✅ `spectacular --validate --fail-on-warn` 通过 |
| lint/format | 零告警 | ✅ `ruff check` / `ruff format --check` 全通过 |
| 迁移 | 可从零重放、无漂移 | ✅ `makemigrations --check` 无漂移；迁移 `0004` 已应用 |
| 冒烟 | 演示脚本跑通 | ✅ **46 步**真 HTTP 全绿（新增 12 步查询引擎），服务端 0 异常 |

### 关键数字

```text
测试：181 → 216（+35）
冒烟：34 → 46 步
基准数据：5000 条 Issue（seed_issues，可复现：--seed 42）
默认列表查询：读 5000 行 + 排序  →  读 50 行 + 无排序
Execution Time：1.99 ms → 0.195 ms（约 10×）
列表接口 P95：16.7 ms → 11.2 ms（目标 < 300ms）
```

## 四、下一步（Sprint 6：Redis Cache + Celery）

1. 先确认两个"真实痛点"成立（计划 §Sprint 6 前置），再引入 Redis——不为堆技术栈。
2. `docker compose up redis` + `django-redis` 接入 `CACHES`；
   Project 详情读缓存（TTL 300s）+ 写路径主动失效，缓存键 `mini:project:{id}:v{N}`。
3. Celery 两个场景：评论通知（Retry 3 次退避 + task_id 幂等）、Issue 批量操作 + 任务状态接口。
4. 测试里用 `CELERY_TASK_ALWAYS_EAGER`，不依赖 worker 进程。
5. Sprint 5 遗留可顺手做：把 `(project, state)` 在稀疏状态下的取舍做成可复现的对比用例。

## 五、给同学的联调须知

- **本次有两处行为变更**，前端需要跟着改：
  1. **默认排序由 `-sequence_id` 改为 `-created_at`**（列表默认还是"新的在前"，语义一致，但如果你依赖了 sequence_id 的稳定性，请显式传 `?ordering=-sequence_id`）；
  2. **`page` 越界不再返回 404，而是 200 + 空 `results`**；`page` 传了非整数会 400。
- **多选筛选的语义**：`state` / `priority` / `labels` 都是"命中任一"（OR）；不同参数之间是 AND。
  合法写法：`?state=<uuid1>,<uuid2>&priority=high,urgent&labels=<uuid1>,<uuid2>&search=验证码`
- **`ordering=priority` 是严重度排序**（urgent 最前），不是字母序——不用在前端再排一遍。
- **`assignee=me`** 用当前登录用户；想筛"未指派"目前不支持（二期）。
- 过滤参数一律走 URL，**建议做 URL 同步**（协作总计划 §15 的 UI→URL→HTTP→ORM→DB 链路）——
  后端已保证非法值是 400 而不是静默忽略，正好用来暴露前端拼参错误。
- 冒烟脚本已扩到 46 步，含查询引擎；跑法见 `backend/scripts/smoke_backend.py` 文件头。
