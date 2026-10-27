# Phase 8 报告 · Island 与桌面端最终对齐

> 完成于 2026-10-28 · 分支 `refactor/personal-first-phase6-9`
> 依据：`docs/ISLAND_V3_SPEC.md` + Phase 8 计划 + `PHASE6_9_PREFLIGHT.md`
> 范围：只做数据源/信息对齐与桌面验收，不重写窗口壳。

## 1. 发现并修正的真实缺口

后端 `/projects/mine/` 早已返回 `recent_done`、`latest_log`、`agent_step`、
`agent_step_index/total`、`agent_method`、`agent_session_title`（Island V2 阶段 3），
但前端 `ProjectEngineering` 类型没有声明这些字段，`ProjectSummaryCard` 仍把它们
当成“后端尚未上线”：

- STEP / HOW 恒显示占位文案，即使运行中 Agent 已上报；
- DONE 只用 `done_tasks` 计数，不用真实 `recent_done` 标题。

Phase 8 修正：

1. `frontend/types/project.ts` 补齐上述字段（与后端 serializer 一一对应）。
2. `ProjectSummaryCard`：
   - `doneSummary(project.done_tasks, project.recent_done)`：有真实完成标题时优先清单；
   - STEP 取 `agent_step`，HOW 取 `agent_method`；有 `step_index/step_total` 时显示 `i/n`；
   - 没有上报时仍是 `EMPTY_STEP` / `EMPTY_HOW`，不拿任务描述冒充。
3. 移除“阶段 3 接入”等过期注释，数据源说明与实现一致。

Island 仍然：

- 不自行计算 Project 进度：`progressPercent` 只做 0–100 夹取，量纲来自 API；
- 不自行计算 NOW/NEXT/Stage：直接消费 `/projects/mine/`；
- 不新建第二条 WebSocket：一条 Overview 通道覆盖全部项目；断线不虚报 LIVE；
- 窗口壳（V3 单窗两态、图钉、拖动、缩放、重启恢复）未改动。

## 2. 桌面产物与真实冒烟

- 前端单机包：`scripts/package.py` → `dist/mini-plane-1.0.0-local-20261028-010626`。
- 便携目录：`desktop/build.py --portable` → `dist/MiniPlane/MiniPlane.exe`
  （旧 backend 备份 `backend.old-1028-0110`）。
- 自检前确认 8000/3000 空闲、无 dev 栈残留。
- `MINIPLANE_NO_WINDOW=1 ./dist/MiniPlane/MiniPlane.exe`：
  `[selftest] stack ready at http://127.0.0.1:3000/ (window suppressed)` → `services stopped`。

## 3. 门禁

| 门禁 | 结果 |
|---|---|
| 前端 typecheck / lint / build | 通过 |
| 前端单测 | 172 pass |
| Playwright 全量 | **40/40 pass**（含 Island、Agent→Island 实时闭环、实时撤权、Anatomy V2） |
| 桌面 SQLite 自检 | ready + services stopped |
| 后端 | 406 pass（Phase 7 结果，Phase 8 未改后端） |

## 4. 已知边界

1. 自检是**无窗口**栈验证，不替代原生 WebView2 的视觉回归；窗口壳行为由 desktop 单测 +
   V3 规格验收，本轮未改壳。
2. Island 的 STEP/HOW 只在 Agent 运行中会话有上报时出现；没有上报时保持约定文案。
3. DOM/动画帧率仍未做目标机器基准（Anatomy Phase 5 只测纯布局/映射）。

## 5. 主要文件

- `frontend/types/project.ts`
- `frontend/components/engineering-island/ProjectSummaryCard.tsx`
- 桌面产物（不入库）：`dist/mini-plane-1.0.0-local-20261028-010626`、`dist/MiniPlane/`
