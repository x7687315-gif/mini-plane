# Anatomy V2 · Phase 3 演进痕迹

> 日期：2026-10-26 · 分支：`feat/anatomy-v2`
> 依据：[技术调研报告](MINI_PLANE_ANATOMY_TECHNICAL_RESEARCH.md) Phase 3 + [ADR-003](../../../../decisions/ADR-003-anatomy-v2-object-language.md)
> 范围：真实 Activity 驱动的新增/状态变化痕迹。**未实现历史快照/回放**，未改后端模型。

## 1. 做了什么

| 文件 | 变更 |
|---|---|
| `frontend/features/anatomy/changes.ts` | `AnatomyChange` + `deriveAnatomyChanges` + marker map |
| `frontend/features/anatomy/index.ts` | 导出变更模型 |
| `frontend/components/anatomy/AnatomyPlate.tsx` | 页面挂载时间基线、Recent Activity 面板、任务标记 |
| `frontend/components/anatomy/AnatomyScene.tsx` | TaskCell NEW/UPD 微小标记（圆/菱形） |
| `frontend/app/(protected)/projects/[pid]/page.tsx` | 拉取 `useProjectActivities` 并传入图纸 |
| `frontend/app/globals.css` | `.an-change` 单次淡入 + reduced-motion |
| `frontend/tests/unit/anatomy-changes.test.mts` | 4 条真实 Activity 映射测试 |
| `frontend/tests/e2e/anatomy-v2.spec.ts` | 真实 WS 链路：页面挂载后建/推进 Task → NEW/UPD |

## 2. 语义边界（硬约束）

- **来源**：只消费 `ActivityLog` 的 `issue.created` / `issue.updated`；不推测
  Stage 新增（当前后端没有 Stage.created 审计），不把 Worklog 当状态事件。
- **冷启动**：以页面挂载时刻为基线；早于挂载的事件只作为历史存在，不播放“刚刚新增”。
- **不重复**：标记按 Activity id 去重；React key 稳定，重渲染不重复播放。
- **不伪造**：Task 已被删除/不可见时不生成标记；`ActivityLog` 不是完整历史，不提供回放。
- **时间**：显示 `Activity.created_at` 的 UTC `HH:MMZ`，不冒充 Worklog 的业务日期。
- **来源标注**：面板明确写“来源：Activity · 仅显示挂载后的真实事件；不是历史回放”。

## 3. 视觉

- 新增任务：Task 构件上方钴蓝圆点；
- 状态变化：暖色菱形（与状态色/形状并存）；
- 侧栏 `RECENT · ACTIVITY` 最多 5 条，显示 NEW/UPD、编号、标题、UTC 时间；
- 焦点面板的任务行也显示 NEW/UPD；
- `.an-change` 只做 220ms 透明度淡入，reduced-motion 直接关闭。

## 4. 验证（真实运行）

| 门禁 | 结果 |
|---|---|
| typecheck / lint | 通过 |
| 单测 | **163 pass / 0 fail**（新增 4 条 changes） |
| 生产构建 | 通过 |
| Playwright 全量 | **38/38 pass**（+ setup = 39/39） |
| 真实链路 | 页面已连接 WS → API 建 Task → PATCH 推进 → Activity 缓存失效 → NEW/UPD 出现 |

截图：[changes-demo.png](phase3/changes-demo.png)（演示项目：新增一条任务并推进后）。

## 5. 已知边界

1. 后端没有 Stage.created Activity，因此 Stage 新增暂无痕迹；不得用前端推断补。
2. 只展示当前 Activity 第一页（最近事件）；分页/时间轴留 Phase 4。
3. 标记没有自动过期计时器；页面内会保留到下一次渲染/刷新。
4. 没有历史快照；不能把 Activity 拼接成“某日完整结构”。

## 6. 下一阶段（Phase 4）

- 先做 Worklog + Activity 的真实事件列表，标明来源与时间语义；
- 明确“只看事件”与“恢复旧结构”是两种能力；
- 如需旧结构，再设计 `ProjectSnapshot` schema/version、触发条件、回滚与存储成本；
- 无快照时明确告知无法还原，不伪造历史。
