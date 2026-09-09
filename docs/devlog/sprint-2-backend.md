# Sprint 2 开发日志：Workspace / Project（后端）

- 日期：2026-09-09
- 分支：`feat/backend-ws-project`（验收后合入 main）
- 对应计划：[BACKEND_PLAN.md](../../BACKEND_PLAN.md) §Sprint 2
- 契约：[docs/api/02-workspaces.md](../api/02-workspaces.md)、[docs/api/03-projects.md](../api/03-projects.md)

---

## 一、这次做了什么

1. **契约先行**：02（工作区 + 成员）与 03（项目 + 项目成员 + 状态）两份契约起草并请前端确认。
2. **四个模型 + State**：
   - `Workspace`（slug 全局唯一 + 正则校验）/ `WorkspaceMember`（unique(workspace,user)，role 20/15/5）
   - `Project`（identifier 工作区内唯一 + `issue_sequence` 计数器为 Sprint 3 备好）/ `ProjectMember`
   - `issues.State`（group 对齐 Plane：backlog/unstarted/started/completed/cancelled）
   - 约束层：UniqueConstraint + 组合索引（`(user, workspace)`、`(workspace, -created_at)`）
3. **权限层（core/permissions.py）**：`resolve_workspace` / `resolve_project` 统一"解析 → 404 防枚举 → 角色判定"；**生效角色映射**（03 契约表格）是全项目权限的单一实现点。
4. **九组端点**：WS 列表/创建/详情/改/删 + WS 成员四操作；项目列表/创建/详情/改/删 + 项目成员四操作 + 五态只读列表，全部带 OpenAPI 注解。
5. **业务服务**：slug 自动后缀（显式冲突也基于原值 `-2`）、email 添加成员、owner/最后 Admin 双守卫、**创建项目事务**（Project + creator ADMIN + 预置五态原子完成，D8）。
6. **测试 60 用例全绿**（新增 42 个）：权限矩阵逐格参数化、`assertNumQueries` 防 N+1（成员列表 4 条 / 项目列表 5 条固定）、工作区删除级联、identifier 唯一性。
7. **双用户 curl 冒烟**：越权 404、成员加入前后可见性、WS Admin 视同项目 Admin、五态预置、identifier 重复 400，全部符合契约。

## 二、怎么做的（关键实现与排障）

### 2.1 权限的实现形态：作用域解析函数，而非 Permission 类

计划里写的是"权限类"，实际落地时发现：FBV（`@api_view`）风格下 DRF 的 `has_object_permission` 优势发挥不出来，反而把"解析对象 → 404 → 角色"拆散在两处。最终改为 `core/permissions.py` 的三个函数：

```text
resolve_workspace(user, slug)   → (workspace, role)  或抛 Http404
resolve_project(user, slug, id) → (project, role)    或抛 Http404
get_effective_project_role(user, project) → 生效角色（03 契约表格的唯一实现）
```

**404 防枚举只写在一处**（resolve 内 `Http404`），视图里对角色不足抛 `PermissionDenied` → 统一 403。若后续切换 ViewSet，这套函数可以直接搬进 Permission 类。此偏离已记入计划。

### 2.2 生效角色映射（本次最重要的设计）

| 身份 | 生效角色 |
|------|----------|
| ProjectMember | 取项目角色 |
| 非 ProjectMember 的 WS Admin | 视同项目 Admin |
| 非 ProjectMember 的 WS Member / Viewer | 等效 Viewer（只读） |
| 非 WS 成员 | None → 404 |

这个映射同时驱动 API 权限和响应体里的 `current_user_role` 字段，前端渲染权限 UI 只看后者。

### 2.3 排障一：Django 5.2 分页的 LIMIT 观感差异

测试断言查询数时发现列表 SQL 是 `LIMIT 3`/`LIMIT 5`（等于行数）而不是 50。用 60 行数据 + `CaptureQueriesContext` 实测：多行时 `LIMIT 50`、分页正确（120 行 3 页）。结论：Django 5.2 Paginator 在结果少于页长时会收窄 LIMIT，行为无差异，虚惊一场，但"分页在多页时是否正确"从此有了实证。

### 2.4 排障二：合并视图时的作用域变量错误

把 list/create 合并为 `*_list_create` 时，GET 分支里残留了旧循环变量 `m.role` → `NameError` → 列表接口 500。测试用 `KeyError: 'count'` 暴露。教训：**合并视图时循环变量重命名要整段重写**，这类错误在测试里表现为响应体形状异常。

### 2.5 排障三：冒烟脚本的三个环境坑（非服务端问题）

1. Git Bash 向 `-d` 传中文按 GBK 发送 → 服务端 UTF-8 解码失败（400 JSON parse error）。冒烟载荷一律改 ASCII；生产中文数据走前端（浏览器恒为 UTF-8）不受影响。
2. Windows 原生 python 读不到 Git Bash 的 `/tmp` 路径 → JSON 解析改存 `$LOCALAPPDATA/Temp`。
3. DRF JSON 输出无空格（`"count":5`），grep 模式要按无空格写。

### 2.6 发现并修复的权限不变量漏洞

冒烟推演时发现：把用户从工作区移除后，其 `ProjectMember` 记录仍在，可继续访问项目（违反 §4.1 不变量"ProjectMember 必是 WorkspaceMember"）。已在 `workspaces.services.remove_member` 中级联清除项目成员身份，并补了回归测试。**这是本 Sprint 测试清单之外、靠冒烟推演发现的最有价值问题。**

### 2.7 schema 注解的方法级拆分

多方法视图（detail）的 `@extend_schema` 按方法拆为 `@extend_schema_view(get=…, patch=…, delete=…)`，PATCH 补 `request=` 注解后 4 个 schema error 清零。教训：**多方法视图必须用 extend_schema_view 逐方法标注**，混合注解会让 spectacular 无法推断。

## 三、验收结果

验收时间：2026-09-10 00:10，**全部通过** ✅

| 验收项 | 计划标准 | 结果 |
|--------|----------|------|
| 测试 | 权限矩阵逐格可指认 | ✅ 60 用例全绿（新增 42） |
| 越权 | 外人 404 / 成员 403 / Admin 放行 | ✅ 冒烟 3、4、8 符合 |
| 预置五态 | 创建项目立即可查 | ✅ Backlog→Cancelled 五条 |
| N+1 | assertNumQueries 固定 | ✅ 成员列表 4 条、项目列表 5 条 |
| 唯一性 | identifier 工作区内唯一、跨工作区允许 | ✅ 两用例 + 冒烟 9 |
| schema | 零警告零错误 | ✅ 15 端点全注册 |
| 迁移 | 三个 app 从零重放 | ✅ |

## 四、下一步（Sprint 3：Issue 核心）

1. 冻结 `docs/api/04-issues.md`（含 Sprint 5 预留的查询参数表）。
2. Issue/Label 模型 + 索引；sequence_id 用 `select_for_update` 发号（D9）。
3. 并发发号测试（重号必现性验证）+ RESTRICT 删状态的行为。
4. assignee/labels 的跨项目校验（400 文案契约化）。

## 五、给同学的联调须知

- 两份契约请重点看 **03 的「生效角色」表**——前端按钮的显隐直接用响应里的 `current_user_role`（≥20 显示管理操作，≥15 显示编辑操作）。
- 工作区删除是**级联**的（无软删除），前端务必做二次确认弹窗。
- slug/identifier 的唯一性冲突会**自动加后缀或 400**，规则见各契约，前端不用自己实现重试逻辑。
