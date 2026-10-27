# Phase 6 报告 · 团队模式降级与兼容

> 完成于 2026-10-28 · 分支 `refactor/personal-first-phase6-9`
> 依据：`docs/refactor/inputs/mini-plane-refactor-plan.md` Phase 6 + [PHASE6_9_PREFLIGHT.md](PHASE6_9_PREFLIGHT.md)
> 范围：权限单一策略、团队列表规范入口、显式共享/脱离、WS 撤权、个人 UI 去团队字段；不改领域模型。

## 1. 做了什么 / 怎么做的

### 1.1 权限优先级收敛为单一纯函数

- `core/permissions.py` 新增 `combine_effective_role` 与 `effective_roles_for_projects`；
  规则唯一：**owner > ProjectMember（显式 override）> Workspace 角色**；WS Admin 视同项目 Admin，
  其他 WS 成员只读，私人工程非 owner 不可见。
- `effective_role` 保留 owner 短路分支，**缓存命中热路径仍是 0 条鉴权查询**（回归测试 `test_cache` 守住）。
- 项目列表 `_project_list_response` 改为调用批量函数，删除视图内联的优先级判断，避免与详情漂移。
- 新增 `tests_phase6.py`：WS Admin 被 ProjectMember 降为 Viewer、团队列表过滤、防枚举、共享/脱离。

### 1.2 团队列表走规范 Project 查询

- `GET /api/v1/projects/?scope=accessible&workspace=<slug>`：非成员 404（防枚举），成员可按团队筛选。
- 前端 `listProjects` / `createProject` 切到 `/projects`；团队工程创建显式带 `workspace_id`。
- Workspace 页面/项目列表链接改到 `/projects/{pid}`，不再依赖旧 `/w/{slug}/projects/{pid}` 业务链。

### 1.3 显式共享与脱离

- 新端点（仅 owner）：`POST /projects/{pid}/share/`、`POST /projects/{pid}/detach/`。
- `share_project`：目标 WS 需 Member+；已在其他 WS → 400（先脱离）；owner 获 ProjectMember.ADMIN；
  记录 Activity、失效缓存、通知相关用户重算订阅。
- `detach_project`：workspace 置空、**清除全部 ProjectMember**（owner 改为隐式 ADMIN）、
  旧 WS 成员立即失去访问；记录 Activity、失效双缓存键、广播 `membership.changed`。
- 前端项目设置新增「协作」区：个人工程可选择工作区加入（confirm），团队工程可脱离（confirm）；
  错误信息透出后端 detail，不再吞掉。

### 1.4 删除工程与 WS 撤权

- 新增 `delete_project` service：删除前记录 `project.deleted` 审计；删除后给 owner/项目成员/WS 成员
  发 `membership.changed`，项目 WS 主动关闭。
- `ProjectConsumer` 加入 `permission.{user_id}` 组；收到 `membership.changed` 后重查生效角色：
  仍可访问回带 role 的帧，失权先回帧再 `close(4404)`。新增真实 consumer 测试。
- `Project.workspace` 的 SET_NULL 兜底与 ProjectMember 清理已对齐；`invalidate_workspace` 现在同时
  作废规范哨兵键与旧 slug 键。

### 1.5 团队字段只出现在团队界面

- 个人工程：隐藏项目角色徽标、任务指派人、批量负责人选择。
- 团队工程：保留上述能力。
- 工作区删除文案改为“仍有工程会被拒绝…先脱离”，并显示后端错误，不再误导为级联删除。

## 2. 门禁

| 门禁 | 结果 |
|---|---|
| 后端 projects/realtime/workspaces | 124 pass（Phase 6 相关） |
| 后端全量 | **406 pass / 0 fail** |
| 前端 typecheck / lint | 通过 |
| 前端单测 | 172 pass / 0 fail |
| E2E | 见 Phase 9 最终门禁（同分支统一跑） |

## 3. 已知边界

1. 旧 `/workspaces/{slug}/projects/…` 兼容壳仍保留（deprecated，薄适配器），退出条件见
   [10-canonical-projects.md](../../api/10-canonical-projects.md) §3；外部 Agent 无法穷尽证明。
2. 团队工程删除仍是浏览器 `confirm`（显式动作），未升级为输入标识符确认；不影响权限与数据安全。
3. ProjectMember 不能把 owner 降级（owner 短路最高），这是 ADR-001 的刻意约束。

## 4. 回退

- 无数据库迁移；可整体 revert 本阶段前后端改动。
- 共享/脱离是新增端点；旧客户端不受影响。
- 若回退前端，后端新增字段与端点仍向后兼容。

## 5. 主要文件

- `backend/core/permissions.py`
- `backend/apps/projects/{views,services,serializers,urls_canonical,cache}.py`
- `backend/apps/realtime/consumers.py` · `tests/test_consumer.py`
- `backend/apps/projects/tests_phase6.py`
- `frontend/features/project/{api,hooks}.ts` · `types/project.ts`
- `frontend/app/(protected)/projects/[pid]/page.tsx`
- `frontend/app/(protected)/w/[slug]/{page,projects/page,projects/new/page,settings/page}.tsx`
- `frontend/components/issue/{IssueDrawer,BulkActionBar}.tsx`
