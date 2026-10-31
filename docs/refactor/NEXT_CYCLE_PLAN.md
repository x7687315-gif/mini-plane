# Mini Plane 下一周期执行入口（2026-10-29）

> 事实源：当前代码 + `docs/PRODUCT_PRINCIPLES.md` + `frontend/DESIGN.md` + `docs/ISLAND_V3_SPEC.md`。
> 第一阶段最终审计：[`PHASE_I_FINAL_AUDIT.md`](PHASE_I_FINAL_AUDIT.md) · 日常使用模板：[`PHASE_I_DAILY_USE_LOG.md`](../PHASE_I_DAILY_USE_LOG.md)。
> 用户规划原文：`C:\Users\86159\Downloads\mini-plane-next-cycle-plan.md`（仓库外，仅作输入）。
> 本轮最高标准：**轻量化 / 流畅性 / 日常便捷性**；每项改动都要说明改善哪一项、是否损害另外两项。

## 0. 当前事实（Phase 0）

- 分支：`feat/anatomy-v3`；HEAD `f2183d5`（桌面残留修复已推送）。
- 工作区有用户未跟踪的 Anatomy research 文件（`.md/.pdf/.zip/目录`），**本轮不覆盖、不删除、不提交**。
- 生产：Next 16.4.3 · React 19 · Django 5.2 · V3 Anatomy · Island V3 单窗。
- 桌面产物：`dist/MiniPlane/MiniPlane.exe` 已用 V3 前端重建；正常关窗与 `--force` 均验证整棵进程树退出。
- 近期门禁：后端 406/406；前端 typecheck/lint/175 单测/build；E2E 43/43（setup + 42 业务）；ruff 全目录通过。
- 安全：Next critical 已清零；source-map-js 已覆盖 1.2.2；剩 1 条 zod high（前端表单、未使用受限集合；zod 4 升级会破坏 `z.coerce.number()` 类型推导，已记录为下一轮债）。

## 1. 文档差异与状态

| 文档/实现 | 当前事实 | 处理 |
|---|---|---|
| `docs/ISLAND_V3_SPEC.md` §5 | 旧注释称 `events.closed` 在 Windows 不触发；pywebview 6.2.1 实测会触发，GUI 在主线程 | ✅ 已在本轮更正；标题监视仍保留为兜底 |
| `frontend/DESIGN.md` §3.3 | Island 例外应为 4–8px、项目分隔 0px；当前生产 `ProjectSummaryCard` 仍 14px + 阴影、外层 26px | ⏳ Phase 2 独立原型；不直接改生产 |
| `docs/refactor/TECH_DEBT.md` | 计数（377 测试等）与当前 406/175 不同；TD-12 的 dist 包名是历史快照 | 📌 历史记录，不改写；本轮以实际命令为准 |
| Anatomy V3 docs | Phase 3 生产完成；视觉验收仍待做 | ▶️ Phase 1 |
| DESIGN §7.1 | 当前明确“桌面工具、移动端不在范围” | ▶️ Phase 3 研究，不直接改生产 |
| README | 已更新到 V3 与桌面进程生命周期 | 本轮 Phase 5 继续同步 |

## 2. 基线截图

目录：`docs/refactor/next-cycle/baseline/`

- [Anatomy Growth](next-cycle/baseline/anatomy-growth.png) · [Anatomy Structure](next-cycle/baseline/anatomy-structure.png)
- [Island Expanded（520×420）](next-cycle/baseline/island-expanded.png) · [Island Collapsed（360×44）](next-cycle/baseline/island-collapsed.png)
- [Home / 左侧栏](next-cycle/baseline/home.png) · [Workbench](next-cycle/baseline/workbench.png) · [Task Drawer](next-cycle/baseline/task-drawer.png)

## 3. 已复现的交互问题

| # | 路径 | 复现 | 当前结果 | 分级 |
|---|---|---|---|---|
| 1 | Anatomy Growth ↔ Structure 快速反向 | 同一事件循环内点 Structure → Growth | 最终 URL 为 growth，选中 Stage 保留，无旧状态覆盖 | ✅ 通过，无需重构 |
| 2 | Anatomy 详情 → Task 抽屉 → Esc | 聚焦详情任务，Enter 开抽屉，Esc 关闭 | 关闭后 `document.activeElement` 为 `BODY`，丢失原任务焦点 | **阻碍连续性**，Phase 4 修 |
| 3 | Island 收起/展开快速反向 | 原生桥接 + Python 状态机；现有单测/真机冒烟 | 规格要求继续验证；本轮 Phase 2 只做视觉原型，不改窗口模型 | 待 Phase 4 验证 |
| 4 | Anatomy Structure 标签可读性 | 1440 宽 5 Stage / 120 Task | 标题此前缩放到约 10px、`+N` 几乎不可见；已在 Phase 1 放大标题并把 `+N` 并入标题行 | ✅ 已修复 |

## 4. 阶段执行清单

| Phase | 交付 | 状态 |
|---|---|---|
| 0 | 本文件、preflight 台账、基线截图、文档差异 | ✅ 进行中 |
| 1 | Anatomy 视觉验收 + 最小修复 + 前后截图 + 测试 | ✅ 已完成（[报告](next-cycle/PHASE1_ANATOMY.md)） |
| 2 | Island Blueprint Dock 独立原型（收起/展开/长内容/空加载）+ 对比 | ✅ 原型完成，待视觉确认（[报告](next-cycle/PHASE2_ISLAND.md)） |
| 3 | 移动端 A/B/C 决策报告 + 安全边界；不改网络/认证 | ✅ 已完成（[报告](next-cycle/PHASE3_MOBILE.md)） |
| 4 | 高频路径焦点/连续性最小修复 + 回归测试 | ✅ 已完成（[报告](next-cycle/PHASE4_CONTINUITY.md)） |
| 5 | 全量回归、桌面打包、最终报告、commit/push | ✅ 已完成（[交付报告](next-cycle/PHASE5_DELIVERY.md)） |

## 5. 基线命令（已核实可用）

```bat
cd frontend
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e          :: 需要 scripts\dev.ps1 up；真实 Chrome

cd backend
.venv\Scripts\python.exe manage.py test --noinput --settings=config.settings.test
.venv\Scripts\python.exe manage.py check --settings=config.settings.test

cd ..
backend\.venv\Scripts\python.exe -m ruff check --config backend/pyproject.toml backend/ desktop/ scripts/
backend\.venv\Scripts\python.exe -m ruff format --config backend/pyproject.toml --check backend/ desktop/ scripts/
```

桌面最终验证：`backend\.venv\Scripts\python.exe desktop\verify_quit.py` 与 `--force`；
打包顺序：`python scripts/package.py` → `python desktop/build.py --portable`。

## 6. 本轮边界（不扩大范围）

- 不做 MCP / Blocker / 截止日期系统；不引入 3D/动画库；不改数据模型。
- Island 新视觉未经用户确认不替换生产 UI。
- 移动端不默认改监听地址，不把服务暴露到 `0.0.0.0`。
- 不清理用户未跟踪文件，不重写历史文档。

## 7. 最终结论（Phase 5）

Anatomy V3 已完成视觉验收与最小修复；Island Blueprint Dock 已有独立原型，等待视觉确认；
移动端已形成 A/B/C 决策但不改网络边界；高频路径的焦点与滚动连续性已修复。
最终门禁：前端 175 单测/40 E2E/typecheck/lint/build，后端 406 测试，桌面正常/强杀均干净。
Zod high 与 Island 原生快速反转仍作为下一轮明确待办，未写成已完成。
