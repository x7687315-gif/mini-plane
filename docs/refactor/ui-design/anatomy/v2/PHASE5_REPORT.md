# Anatomy V2 · Phase 5 构型决策与性能基线

> 日期：2026-10-26 · 分支：`feat/anatomy-v2`
> 依据：[技术调研报告](MINI_PLANE_ANATOMY_TECHNICAL_RESEARCH.md) Phase 5 + [ADR-003](../../../../decisions/ADR-003-anatomy-v2-object-language.md)
> 范围：构型扩展决策、纯布局性能基线、300 Task 回归；不引入新图形引擎/后端改动。

## 1. 构型决策：本轮不扩展

报告要求“基于实际使用结果再探索有限的构型差异，不提前把所有未来形态实现出来”。
当前结论：

- 保留 **统一 Stage 模块语法**；任务密度只改变内部构件密度，不按项目类别/任务数换外形；
- 不引入“项目类型 → 固定物体”（齿轮/建筑/城市等）映射；
- 不新增配置项/持久化构型；
- 不在没有真实使用证据时引入 3D、力导向或复杂碰撞。

理由：个人项目的主要信息是“阶段/构成/变化”，统一语法已经覆盖；构型变体会增加视觉语义解释、
维护与可访问性成本，且会提前固化未验证的分类假设。若未来有明确使用反馈，再按报告 §3.4/§5 做小原型比较。

## 2. 性能基线（本机实测，纯函数）

命令：

```bash
cd frontend
node --import ./tests/register-loader.mjs scripts/benchmark-anatomy.mjs
```

结果（60 次迭代，Node 24.20，Windows）：

| Fixture | select avg / p95 (ms) | layout avg / p95 (ms) | layout max (ms) |
|---|---|---|---|
| F1 1 Stage / 0 Task | 0.004 / 0.005 | 0.035 / 0.126 | 0.208 |
| F2 3 Stage / 4 Task | 0.007 / 0.013 | 0.091 / 0.115 | 1.365 |
| F4 8 Stage / 64 Task | 0.036 / 0.074 | 0.280 / 0.544 | 0.714 |
| F5 16 Stage / 208 Task | 0.051 / 0.094 | 0.695 / 1.287 | 1.585 |
| F5+ 16 Stage / 304 Task | 0.063 / 0.070 | 0.717 / 1.035 | 1.297 |

**解释边界**：

- 这里测的是数据映射 + 确定性布局，**不是**浏览器绘制/React commit/动画帧率；
- 没有在真实硬件上做 30/100/300 Task 的 DOM paint 基准，因此不宣称 FPS 或首屏指标；
- 在该计算层，16 Stage/304 Task 的 layout p95 约 **1.0ms**，不构成当前瓶颈；
- 300 Task 测试确认每个 Task 都映射为构件（不丢数据）；小尺寸构件自动切平面方块。

## 3. 密度/边界回归

- `300 Task 不丢数据`：16 Stage / 304 Task 全部映射为 cell，size ≥ 3；
- Stage 包围盒仍全部在 viewBox 内、互不重叠（单测）；
- 极端文本/特殊字符仍由 React JSX 安全渲染（Phase 1/4 E2E）；
- 未新增任何“为了性能隐藏真实 Task”的逻辑。

## 4. 门禁（真实运行）

| 门禁 | 结果 |
|---|---|
| typecheck / lint | 通过 |
| 单测 | **169 pass / 0 fail**（新增 300 Task 回归） |
| 生产构建 | 通过 |
| Playwright 全量 | **39/39 pass**（+ setup = 40/40） |
| 后端 | 未改后端；沿用 387 |

## 5. 桌面产物冒烟（2026-10-27）

- 前端单机包：`scripts/package.py` → `dist/mini-plane-1.0.0-local-20261026-172153`；
- 便携目录：`desktop/build.py --portable` → `dist/MiniPlane/MiniPlane.exe`（含 `app/`、`backend/`、`runtime/`）；
- 自检前确认 8000/3000 端口空闲、无残留 MiniPlane 进程；
- 命令：`MINIPLANE_NO_WINDOW=1 ./dist/MiniPlane/MiniPlane.exe`；
- 输出：`[selftest] stack ready at http://127.0.0.1:3000/ (window suppressed)` → `services stopped`（退出码 0）。

**边界**：该自检验证打包后的 SQLite 迁移、后端健康检查与前端产物可启动；不替代原生窗口/WebView2 的视觉回归，也不验证登录后的交互路径。

## 6. 已知边界 / 下一轮可选

1. DOM/动画真实性能未测；需要在目标机器用真实项目采样后再决定是否虚拟化。
2. 16+ Stage 时画布纵向变长；没有实现缩放/密度模式切换（未达到需要）。
3. 历史快照已明确暂不实现（Phase 4 决策）。
4. Phase 6–9 的产品/后端重构仍独立排期；本阶段不动领域模型。
5. 后续若要扩展构型，先按报告 §3.4 做小原型 + 用户测试，禁止直接上生产。
