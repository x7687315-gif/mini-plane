# Hardening 01：全面代码审查与修复（后端）

- 日期：2026-09-13
- 范围：MVP 后全量代码审查（apps/ × 7 + core/ + config/，约 3.5k 行源码逐文件通读）
- 目标：修 bug 不添 bug——每一处修改都带回归测试，注重**全局一致性**与**安全性**
- 配套：契约更新 [07](../api/07-cache-and-tasks.md) / [04](../api/04-issues.md)，
  schema 快照重新生成；前端接入准备见 [09 契约](../api/09-frontend-integration.md)（Hardening 02）

---

## 一、这次做了什么

审查产出 7 项修复（F1–F7），全部带测试落地；另有 1 项**误判撤销**（F6a，见 §2.3）。
测试 277 → **299**（+22），ruff / 迁移无漂移 / schema 校验全绿。

| # | 类型 | 问题 | 修复 |
|---|------|------|------|
| F1 | bug | 项目成员详情对不存在的 `member_id` 用裸 `.get()` → DoesNotExist 变 **500**（契约要求 404） | `get_object_or_404`（作用域限定 `project=project` 不变） |
| F2 | 安全/DoS | 登录限流计数器 `_FAILURES` 按用户名建键**永不清理**——随机用户名刷登录可让进程内存无界膨胀 | 写入后顺手清理过期键 + 10,000 键硬上限（最旧插入序驱逐） |
| F3 | 安全加固 | Cookie 属性依赖浏览器默认 | 显式 `SESSION/CSRF_COOKIE_SAMESITE=Lax`（跨站请求含 WS 握手不带凭证）；`*_COOKIE_SECURE` 走 env（本地/compose 为 http 保持 False，HTTPS 部署置 True，`.env.example` 已注明） |
| F4 | 全局一致性 | 批量改标签**绕过**了留痕与实时推送：单条 PATCH 标签会写 `issue.updated` 活动并广播，批量路径静默改完；且 `issue_ids` 数量无上限 | 任务内复用与 `update_issue` 完全相同的 diff/留痕/广播原语（无变化的 Issue 不产生噪声）；`issue_ids ≤ 200`、`label_ids ≤ 50`；`result` 新增 `changed` 字段；契约 07 同步 |
| F5 | 竞态→500 | 双击/并发提交撞唯一约束：工作区 slug、项目 identifier、两处 add_member 都可能 500 | 预检查保留，IntegrityError 统一转契约 400；创建工作区用 SAVEPOINT 回滚重试（同 slug 第二次成功），其余转字段级 400 |
| F6b | 输入面 | 登录凭据无长度上限（巨型字符串直打密码哈希器） | username ≤150 / password ≤128（与 User 模型对齐） |
| F7 | 输入面 | Label.color 接受任意 ≤9 字符串 | `#RRGGBB` 正则校验（序列化器层，400 字段级错误体） |
| F6a | **误判撤销** | 曾以为 `search` 未转义 LIKE 通配符 | 实为**以讹传讹**：Django `prep_for_like_query` 已自动转义 `\ % _`，手工再转义会双重转义。已回退，并留 3 个回归测试钉住内置行为（见 §2.3） |

## 二、怎么修的（关键判断与排障）

### 2.1 F4 的判断：批量操作必须与单条操作同语义

审查发现批量改标签走 `issue.labels.set()` 直写，绕过了 `issues.services.update_issue`
的 diff→留痕→广播链。后果：前端批量操作后时间线缺记录、实时推送收不到——
**同一个业务动作在两条路径上语义不同**，这是最典型的一致性缺口。

修法没有发明新机制：任务里对每个 Issue 复用 `capture_issue_snapshot` /
`diff_snapshots` / `record_issue_event` / `defer_issue_updated`，标签没变就跳过。
`before` 快照吃 `prefetch_related("labels")` 缓存，`after` 用 `values_list` 强制回库，
避免读到 set() 之前的陈旧缓存。批量上限（200×50）保证每条任务的动作量有界。

### 2.2 F5 的判断：竞态兜底要区分"能否重试"

双击提交撞唯一约束有两类：**可重试**（工作区 slug 是系统生成的，重生成一次即可）与
**不可重试**（identifier / 成员是用户语义冲突，转 400 即可）。可重试那条在
`@transaction.atomic` 内必须用嵌套 `atomic()`（SAVEPOINT）回滚失败的 INSERT——
否则 PostgreSQL 事务中途失败后，外层事务里后续语句全部作废。

测试也学到一手：`mock.patch` 的 `side_effect` 传**列表**时，元素是可调用对象会被
**原样返回而不是调用**——第一版测试因此拿到一个绑定方法当 workspace 用。
改成显式 flaky 函数。

### 2.3 F6a 的教训：先验证"是不是 bug"，再动手修

`search` 通配符转义是审查时最自信的一条——"icontains 不转义 % _"是流传很广的说法。
写完修复后测试红了（一个都搜不到），逆向排查：直接对库执行 LIKE 实验无异常 →
打印 ORM 编译参数发现反斜杠被加倍 → 读 Django 源码
`db/backends/base/operations.py: prep_for_like_query`：**`\ % _` 早就自动转义了**。
手工转义叠加内置转义 = 双重转义。

处理：回退代码，保留 3 个用例改名"回归守卫"——钉住内置行为，防止未来有人
（包括自己）再次"修复"坏它。**这条与 F4 一起构成本次审查真正的价值：
一个证明"全局一致性值得查"，一个证明"动手前值得查"。**

### 2.4 审查确认无恙的部分（同样重要）

- 404 防枚举贯穿所有资源路径与 WS 握手；缓存的快路径先查生效角色（DB 实时）再返回，
  删除工作区/项目后陈旧缓存不可达；
- 跨作用域校验完整（state/assignee/labels/bulk 的 id 全部限定在本项目内）；
- 发号事务、on_commit 广播/投递、任务幂等与重试策略与契约一致；
- 无裸 SQL（benchmark 命令的 EXPLAIN 用参数绑定）、无 mark_safe、序列化器无 mass-assignment
  （写序列化器全部显式字段，只读字段进不来）。

## 三、验收结果

| 验收项 | 结果 |
|--------|------|
| 测试 | ✅ 277 → **299**（+22：404 修复 2、竞态兜底 5、限流内存 2、批量留痕/广播 1、批量上限 2、搜索守卫 3、label 校验 3、登录长度 1、cookie 安全 3） |
| lint / format | ✅ ruff check + format --check 零告警 |
| 迁移 | ✅ 无漂移（本批全部不涉及表结构） |
| schema | ✅ `--validate --fail-on-warn` 通过；openapi.yaml 随契约变更重新生成 |
| 契约 | ✅ 07（批量上限 + 留痕/广播 + `changed` 字段）、04（color 格式 + label_ids 上限） |

## 四、下一步

1. Hardening 02：前端接入准备（`docs/api/09-frontend-integration.md`）。
2. 已知留档（有意不修）：注册接口的 username/email 枚举（防探测只在登录侧做，MVP 接受）；
   通知仍只落库；`pg_trgm` 搜索二期。

## 五、给同学的联调须知

- 批量改标签现在**会**收到 `issue.updated` 推送、时间线**会**出现记录——前端不需要
  为批量操作做任何特殊刷新（07 契约已更新）。
- `search=100%` 之类含通配符的关键词按字面量匹配，放心传。
- 表单里 slug / identifier 重复时后端自动加后缀或返回字段级 400，双击提交不再产生 500。
