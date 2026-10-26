# Anatomy V2 · Phase 0 基线锁定

> 日期：2026-10-26 · 分支：`feat/anatomy-v2`（基于 `fix/phase5-stabilization`）
> 依据：[MINI_PLANE_ANATOMY_TECHNICAL_RESEARCH.md](MINI_PLANE_ANATOMY_TECHNICAL_RESEARCH.md) Phase 0
> 本阶段**不改生产 UI**；只记录基线、审计现状、冻结设计约定、建立 fixtures。

## 1. 基线（真实运行结果）

| 项 | 结果 |
|---|---|
| Git commit（Phase 0 起点） | `c664d41`（稳定化提交）；Phase 0 文档另提交 |
| 后端 | **387 tests OK**（`config.settings.test`） |
| 前端 | typecheck / lint / **143** 单测 / build 全绿 |
| Playwright | **34/34**（+ setup = 35/35；真实后端，不 mock） |
| 桌面状态机 | 13/13 + 7/7 |
| 桌面栈自检 | `MINIPLANE_NO_WINDOW=1 MiniPlane.exe` → stack ready，退出后端口释放 |
| 截图基线 | [overview.png](baseline/overview.png)、[focus.png](baseline/focus.png)（E2E 演示数据） |

> 说明：研究附件生成时未在本机跑测试；本文件补上了目标分支的真实结果。
> 截图使用 E2E 演示项目，不是真实用户数据。

## 2. 当前 AnatomyPlate 审计（对照报告 §2.4）

已核对 [AnatomyPlate.tsx](../../../../../frontend/components/anatomy/AnatomyPlate.tsx)、
[ANATOMY_IMPLEMENT_REPORT.md](../ANATOMY_IMPLEMENT_REPORT.md)、[DOMAIN_MODEL.md](../../../../DOMAIN_MODEL.md)、
[06-activities.md](../../../../api/06-activities.md)。

| 报告发现 | 当前代码事实 | Phase 1 处置 |
|---|---|---|
| A. 构型由 Task 数量阈值决定 | `archetype(taskCount)` 分为 foundation/openbox/portal/campus | 改为统一 Stage 模块；任务数只影响内部构件密度 |
| B. 固定画布常量 | `VB={w:1160,h:620}`，Stage 位置由 `i%4`/`i/4` 决定；面板 HTML 覆盖在 SVG 上 | 抽出 `computeAnatomyLayout` 纯函数，按内容包围盒/视口计算；面板独立布局 |
| C. SVG 字符串 + `dangerouslySetInnerHTML` | 动态 stage.name/goal 拼入 SVG；稳定化已加 `esc()`，但仍是字符串注入 | **Phase 1 改为 React JSX SVG**；移除动态 `dangerouslySetInnerHTML` |
| D. 图形“看起来可点” | 稳定化已给 SVG 根节点加事件委托（`data-i`/`data-id`），Index 仍是无障碍主入口 | Phase 1 保持两者；Phase 2 补可见焦点与键盘动作 |
| E. 历史数据不足 | `ActivityLog` 是有限审计，不是完整事件流；Worklog 是人工记录 | 本文与 ADR-003 明确：Phase 1–3 不提供“旧状态完整回放” |
| F. 三种进度不可混算 | 当前 Stage Index 显示 Stage.progress；页头显示 Plan 加权进度；Task 状态统计在清单里 | Phase 1 显示 `progress_source`；Stage/Task/Project 三者分列 |
| G. 测试数漂移 | 稳定化后 387/143/34，CI 三 job | 本文件为当前唯一基线；后续每阶段重跑 |

### 2.1 基线截图观察（只描述事实）

- 1 个 Stage 时，主体构件偏小、画布大量留白；散件托盘在中央偏下，视觉重心不足。
- Stage Index 面板与主图共用同一张白卡；面板遮住主图右上区域。
- 聚焦态通过把其他 Stage 压成基线实现，选中 Stage 的注释出现，但主图仍未形成明确的“工程对象”主体。
- 当前 Stage/散件/图例/图签均能渲染；任务抽屉可打开（既有实测）。
- 当前没有组件级布局/状态测试；只有人工截图与 E2E 路由级验证。

## 3. 安全与可访问性审计

- **SVG 注入**：稳定化批次已在字符串插值处 `esc()`；但研究要求优先 JSX。Phase 1 必须移除动态
  `dangerouslySetInnerHTML`，让 React 转义 Stage/Task 文本。
- **可访问性**：Index 行已有 `role=button`/键盘 Enter/Space；SVG 组仍是视觉增强。Phase 1 保留
  Index 作为等价键盘入口，并在 Phase 2 为 SVG 组补焦点/键盘。
- **颜色**：Task 状态目前同时用色与线宽；Phase 1 继续保留非颜色编码。
- **减少动效**：Phase 1 不引入动画；Phase 2 的 Motion Spike 必须先用 `prefers-reduced-motion` 验证。

## 4. 数据语义冻结（本阶段）

| 量 | 权威来源 | 本视图禁止 |
|---|---|---|
| Project progress / source | `/projects/mine/` 的 `progress` + `progress_source` | 前端用 Stage 或 Task 另算一套 |
| Stage.progress | `ProjectStage.progress` | 用该 Stage 下 Task 完成率覆盖它 |
| Task 状态统计 | 真实 `Task.state.group` 计数 | 与 Stage.progress 合并成一个百分比 |
| NOW | `/projects/mine/` 的 `now_task_id` / `now_task` | 用“最近点击/最新 Worklog/几何中心”推断 |
| NEXT STAGE | `ProjectPlan.next_stage` | 把视觉上最靠前的 Stage 当作 NEXT |
| Agent | 真实运行中的 AgentSession | 因项目“正在开发”就显示 RUNNING |
| 历史 | Worklog（业务日期可补记）+ ActivityLog（有限审计） | 把二者拼成完整历史快照 |

> **ActivityLog 是 Audit Trail，不是完整领域事件流。** 没有保存快照时，不得提供“某日完整结构”回放。

## 5. Fixtures（F0–F10）

数据工厂：[frontend/tests/fixtures/anatomy-fixtures.mts](../../../../../frontend/tests/fixtures/anatomy-fixtures.mts)

| Fixture | 条件 | 用途 |
|---|---|---|
| F0 empty | 0 Stage / 0 Task / 无 Plan | 空态、无 NaN、无坐标 |
| F1 oneStage | 1 Stage / 0 Task | 单模块成立、聚焦/复原 |
| F2 small | 3 Stage / 各 1–3 Task | 默认可理解、统一语法 |
| F3 mixed | 3 Stage + loose + NOW | 散件、NOW、进度分列 |
| F4 dense | 8 Stage / ~60 Task | 不重叠/不裁切、密度可读 |
| F5 large | 16 Stage / ~200 Task | 数据不遗漏、聚焦可读 |
| F6 longLabels | 长文本 + `<>&"'` + 中文/emoji | JSX 转义、截断/换行 |
| F7 missing | 缺 goal、无 NOW/NEXT、Agent 未运行 | 诚实占位 |
| F8 historical | 补记日期/同时间戳/已删除实体 | 仅供 Phase 4；本阶段不实现回放 |
| F9 rapid | 快速切换 Stage/展开后返回 | Phase 2 状态最终一致 |
| F10 reducedMotion | 减少动效偏好 | Phase 2 动画关闭仍可理解 |

## 6. Phase 1 最小改动清单（下一步）

1. 新增 `frontend/features/anatomy/model.ts`：`selectAnatomyViewModel()`、类型、纯函数。
2. 新增 `frontend/features/anatomy/layout.ts`：`computeAnatomyLayout()`（确定性、包围盒）。
3. 重写 `AnatomyPlate.tsx` 为 React SVG JSX：统一 Stage 模块 + Task 构件 + 散件托盘 +
   Index/图例/图签；移除动态字符串注入。
4. 工程台额外传入 `nowTaskId`、`projectProgress`、`progressSource`（均来自 mine）。
5. 新增 `frontend/tests/unit/anatomy-model.test.mts`（F0–F7 + 确定性/边界）。
6. 新增/调整 `frontend/tests/e2e/anatomy-v2.spec.ts`：`?view=plate`、SVG/索引聚焦、任务抽屉、
   长文本不破图（用 API 临时建阶段/任务）。
7. 保持 `?view=plate`、Index、抽屉、read-only、Blueprint Editorial 全部兼容。

## 7. 本阶段门禁

- [x] 记录 commit SHA 与真实门禁结果
- [x] 保存 Overview / Focus 基线截图
- [x] 冻结统一对象、进度/NOW/NEXT/Agent/历史语义
- [x] 建立 F0–F10 fixtures
- [x] 明确 ActivityLog 不是历史快照源
- [x] 产出 Phase 1 最小改动清单
- [ ] Phase 1 实施（下一阶段）
