# ADR-001 · Project 所有权模型：owner 必填 + Workspace 可选

- 状态：已采纳（用户拍板，2026-10-24）
- 影响：数据模型、权限、API 路由、前端数据层
- 关联：`docs/PRODUCT_PRINCIPLES.md` 原则 1/4；`docs/DOMAIN_MODEL.md`

## 背景

现状（Phase 0 已确认）：`Project.workspace` 必填 CASCADE，无 owner 字段；个人用户创建第一个工程前必须先创建 Workspace；Workspace 删除会级联清空其下所有工程。真实使用规模为 1 用户 / 0 协作者，双层成员体系（WorkspaceMember + ProjectMember × 三级角色）以 100% 常驻成本服务零协作者。

## 备选方案

### 方案 A · 隐藏的个人 Workspace（Project 仍必须属于某个 Workspace）

注册时自动创建默认 Workspace（slug=username），前端在单人模式下隐藏 Workspace UI。

- 优点：零模型迁移；权限链完全复用；实施成本最低（约 1 天）。
- 缺点：**Workspace 仍是个人工程存在的组织性前提**——领域模型继续说谎；URL/路径/权限仍背租户段；「删除工作区级联清空工程」的毁灭路径仍存在于模型层，只靠 UI 不暴露；双层成员的开销与语义负债永久保留；与「团队是可选叠加」的产品语义长期冲突。

### 方案 B · Project.owner 必填，Workspace 可空（**采纳**）

每个 Project 有 `owner`（初始回填 `= created_by`）；`workspace` 可空，仅团队协作时设置。

- 优点：模型直接表达产品语义（工程由个人拥有，协作按需叠加）；个人路径零 Workspace 概念；API 可收敛到 `/projects/{pid}` 顶级作用域；权限语义清晰（owner 短路 + 既有团队规则复用）。
- 缺点/成本：真实迁移（owner 回填、workspace 可空、约束改造）；权限 resolver 改造；API 兼容层；工作量数倍于方案 A。

## 决策依据

1. 用户目标明确：个人优先不只是 UI 伪装，而是所有权模型的真相（计划书 §2.3 指定方案 B 为首选）。
2. 外部兼容压力经 Phase 0 排查为零（Agent API 无外部 HTTP 消费者），迁移窗口成本最低的时机就是现在。
3. Vikunja 先例（2022-12 移除 namespace 层）证明作用域层可动，但其迁移曾引入安全回归（官方安全公告）——故本决策配套**保守迁移策略**：不删除团队能力、不搬移存量归属、旧路由保留适配器。

## 迁移与安全边界（Phase 2 执行细则）

1. `owner` 三步迁移：加可空列 → `owner = created_by` 回填（created_by 非空，无不可推断记录）→ 改必填 PROTECT。
2. `workspace` 改可空 SET_NULL；**不自动判断**任何存量 Workspace 是否「私人」、不搬移任何项目归属。
3. Workspace 删除加 service 守卫（仍有项目 → 400）；DB SET_NULL 仅作兜底，正常路径永远走显式脱离。
4. identifier 唯一性改条件索引：私人按 owner、团队按 workspace。
5. 权限：新增 `resolve_project(user, pid)`（owner 短路 → 团队规则 → 404）；旧 `resolve_project(user, ws, pid)` 保留为兼容包装（同一实现）。
6. 兼容：旧 `/workspaces/{ws}/projects/{pid}/...` 路由全部保留，委托同一视图（Phase 3）；`/issues/` 更名 `/tasks/` 同理。

## 后果

- 正面：个人闭环不再需要 Workspace；API/前端可摆脱 slug 传递；「删工作区毁工程」从模型层根除。
- 负面/代价：迁移期双路由维护（至 Phase 9 退役）；权限测试面扩大（owner × 团队角色矩阵）。
- 回退：迁移可逆（owner 列保留；workspace 约束恢复）；回退点在 Phase 3 完成前（前端未切新路由时）成本最低。
