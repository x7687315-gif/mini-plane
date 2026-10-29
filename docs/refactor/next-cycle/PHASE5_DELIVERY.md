# Phase 5 · 回归、打包与交付

> 日期：2026-10-29 · 分支 `feat/anatomy-v3`
> 执行入口：[`NEXT_CYCLE_PLAN.md`](../NEXT_CYCLE_PLAN.md) · 前置报告：Phase 1–4。

## 1. 已完成工作包

| 工作包 | 结果 | 证据 |
|---|---|---|
| Phase 0 基线/文档/preflight | ✅ | `NEXT_CYCLE_PLAN.md`、`docs/research/2026-10-29-next-cycle-preflight.md`、baseline 截图 |
| Phase 1 Anatomy 视觉验收 | ✅ | Structure 标签放大、去重复小字；120 Task 的 `+N` 可见；[报告](PHASE1_ANATOMY.md) |
| Phase 2 Island Blueprint Dock 原型 | ✅ 原型完成，**未改生产** | [原型](../ui-design/island/v4/prototype.html) · [对比](PHASE2_ISLAND.md) |
| Phase 3 移动端决策 | ✅ 研究完成，**未改网络/认证** | [报告](PHASE3_MOBILE.md) |
| Phase 4 高频连续性 | ✅ 焦点恢复 + 视图滚动记忆 | [报告](PHASE4_CONTINUITY.md) |
| Phase 5 回归/打包 | ✅ | 本文件 |

## 2. 明确未完成 / 等待确认

- **Island 生产实现**：原型已给出，必须等用户确认视觉方向后再改 `EngineeringIslandOverview`/`ProjectSummaryCard`；本轮未替换生产 UI。
- **移动端 A/B**：只形成决策报告；窄屏适配未实现，Tailscale Serve 未接入，未改 `127.0.0.1` 监听。
- **zod high**：zod 4 升级会破坏成员表单 `z.coerce.number()` 的类型推导，已回退；保留为下一轮升级债。
- **Island 原生快速反转**：本轮未在最终 exe 上重新做快速展开/收起真机测试；Python 状态机单测仍存在，但不能写成已通过。
- 当前用户未跟踪的 Anatomy research 文件保持原样，未提交。

## 3. 验证结果（2026-10-29）

| 门禁 | 结果 |
|---|---|
| 前端 typecheck / lint / 单测 / build | 通过 / 通过 / 175/175 / 通过 |
| 全量 Playwright E2E | **40/40**（setup 另计） |
| 后端测试 / Django check | **406/406** / 0 issues |
| ruff check / format | 全目录通过 / 161 files unchanged |
| 桌面正常关窗 | 13 后代（7 WebView2）→ 0；端口 0；PASS |
| 桌面 `--force` 强杀 | 13 后代 → 0；端口 0；PASS |
| 120 Task Anatomy | 主图/索引/详情 120；Growth `+106`、Structure `+108`；无 console error |
| 16 Stage 滚动 | 修复前 816→0→0；修复后 816→0→816 |
| 快速交叉操作 | Structure→Stage 03 / Stage 02→Structure：最终 URL 与详情一致 |
| 抽屉焦点 | 关闭后回到触发行；E2E 断言通过 |

桌面产物：已执行 `scripts/package.py` 与 `desktop/build.py --portable`；
最终 exe 为 `dist/MiniPlane/MiniPlane.exe`，前端为本次 V3 + 本周期改动。

验证脚本本身也修了一个测试缺陷：原先按标题包含 “Mini Plane” 匹配，会误把 Chrome 的
README 标签页当成主窗口；现改为 launcher 的精确标题 `Mini Plane  ·  本地单机版`，
之后正常/强杀两条真机路径均通过。

## 4. 三项基准的改善

- **轻量化**：Structure 去掉重复进度小字；Island 原型从卡片堆叠收敛为单纸面 + 细线分隔；没有新增依赖/全局状态。
- **流畅性**：抽屉关闭焦点归还、Growth/Structure 滚动位置保留；快速交叉操作未发现旧状态覆盖；未增加装饰性动画。
- **日常便捷性**：120 Task 的项目不再误以为任务丢失；长项目滚到底后切换视图能回到原位置；关闭详情后能继续键盘操作。

## 5. 截图与文档

- [Anatomy Structure 修复后](phase1/anatomy-structure-after.png)
- [120 Task Growth](phase1/large-growth.png) · [120 Task Structure](phase1/large-structure.png)
- [Island Expanded 原型](phase2/prototype-expanded.png) · [Collapsed](phase2/prototype-collapsed.png)
- [Island 长内容](phase2/prototype-long.png) · [空态](phase2/prototype-empty.png) · [加载态](phase2/prototype-loading.png)
- 基线目录：[`baseline/`](baseline/)

## 6. 已知问题与下一轮建议

1. **Island 视觉方向确认**（优先级最高）：确认 4px 外框、0px 分隔、单层阴影、收起态不塞 NOW 后，再进入生产实现。
2. **移动端 A 的窄屏布局**：依据 Phase 3 先做 Structure 纵向阅读 + 详情下移；不默认开网络暴露。
3. **zod 4 / resolvers 5 迁移**：单独工作包，先补成员表单类型与回归测试。
4. **Island 原生快速反转**：在最终 exe 上做反向点击/动画中途切换真机测试，和 Python 状态机日志对账。
5. 主 README 仍可继续补“下一周期入口”，但不把未完成的 Island/移动端写成已上线。
