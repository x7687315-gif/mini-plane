# 阶段 1：多项目总览 UI（2026-10-12）

> Island V2 规格 §6 阶段 1。本阶段只做前端：**先把总览做出来**，
> STEP / HOW / DONE 明细在阶段 3 补数据，桌面隐藏/固定在阶段 2，实时总览通道在阶段 4。

---

## 一、做了什么

| 文件 | 改动 |
|---|---|
| `components/engineering-island/EngineeringIslandOverview.tsx`（新） | 多项目总览容器：全部项目同时可见、面板内纵向滚动（`overscroll-contain`）、空态 |
| `components/engineering-island/ProjectSummaryCard.tsx`（新） | 摘要卡片：Progress / Stage / NOW / STEP / HOW / NEXT / DONE + AGENT 八项 |
| `components/engineering-island/IslandHeader.tsx`（新） | 页眉：标题 + 项目计数；**图钉按钮在阶段 2 才渲染**（不放假控件） |
| `components/engineering-island/EngineeringIsland.tsx`（改） | 总入口改用总览；保留 `Alt+I` 与桌面桥接；去掉轮播与 `?sheet=` |
| `components/engineering-island/index.ts`（改） | 只导出新组件；旧轮播/图纸**不再导出**（文件保留到阶段 5） |
| `features/engineering-island/logic.ts`（改） | 新增 `truncate` / `doneSummary` 与 5 个缺失文案常量 |
| `tests/unit/island-v2-logic.test.mts`（新） | 10 条单测：截断稳定性、DONE 三级诚实优先、文案契约 |
| `tests/e2e/island.spec.ts`（重写） | 4 条用例：六问+诚实占位 / 多项目同时可见 / 空态 / 面板无桌面控件 |
| `app/(protected)/island/page.tsx`（改） | 文案从"左右滑动翻页"改为"所有项目同时可见" |
| `IslandCarousel.tsx` / `IslandSheet.tsx`（改） | 文件头标为**历史组件**，注明 V2 不再作为主路径 |

## 二、诚实的占位（规格红线）

- **STEP / HOW**：后端字段在阶段 3 落地，本阶段恒定显示
  「Agent 尚未报告步骤」「尚未记录执行方法」——不用任务描述冒充，不猜。
- **DONE**：`recent_done` 标题清单也在阶段 3；本阶段回退为「已完成 N 项」
  （`done_tasks` 是真实统计），两者都没有才显示「暂无完成记录」。
  **不许**用今日日志结论冒充已完成任务（Task / Worklog 语义不合并）。
- **图钉**：阶段 2 才实现，现在**不渲染按钮**（点了没反应比没有更糟）。

## 三、视觉（Island 专属例外，DESIGN.md §3.3）

- 总览外壳 `rounded-[26px]`、卡片 `rounded-[14px]`、控件全圆角；
- 单层很淡阴影 `0_1px_3px_rgba(27,26,23,0.07)`；
- 配色 / 字体 / 细线 / 留白仍守 Blueprint Editorial；
- 圆角**只写在 Island 目录内**，没有新建全局 token（防止例外外溢）。

## 四、过程中抓到并修掉的一个真回归

改完先跑 E2E，`agent-island-loop` 失败：顶栏显示 `polling` 而不是 `已连接`。

**根因**：我把原来 `EngineeringIsland` 里的 `useProjectRealtime` 一起去掉了，
而规格里替代它的 overview WS 属于**阶段 4** —— 阶段 1 的 Island 页面**一条 WS 都没挂**，
于是 Agent 起会话后 Island 不再自动变 RUNNING。

**修法**：总览里先挂**第一个项目**（最近有活动）的项目级 WS，并注释清楚
"阶段 1 临时通路，阶段 4 用 overview 通道替换"。
修后 `island.spec` + `agent-island-loop.spec` 合跑 **7 条全过**。

**教训**：删掉一条基础设施调用（WS 订阅）时，**它的替代品在后续阶段** ≠ 现在可以没有。
分阶段实施的每一阶段都必须自己跑通，不能把"下阶段会补"当成"现在可以断"。

## 五、验证

| 门禁 | 结果 |
|---|---|
| tsc | 0 error |
| eslint | 0 error 0 warning |
| 单测 | **139** 全绿（新增 10 条） |
| `island.spec.ts` | **5 条全过**（六问+占位 / 多项目同时可见 / 空态 / 面板） |
| `agent-island-loop.spec.ts` | 修回归后全过 |
| `issue-thread` + `mode-switch` 合跑 | 9 条全过 |
| 完整 E2E | 长跑下 5 条失败（`issue-thread`×4 + `mode-switch`×2 中的部分），**但同规格单独/合跑均过**，且不涉及本次改动文件 —— 判定为 dev server 长跑退化，交 CI 在干净环境复核 |

## 六、下一步

阶段 2：桌面隐藏触发窗 + 图钉固定 + `runtime/desktop-config.json` 持久化。
