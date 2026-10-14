# 阶段 6 开工前调研：Island 打磨（动效 / 手感）—— 2026-10-14

> 规格：`docs/ISLAND_V2_SPEC.md` 阶段 6；红线：DESIGN.md §10（150–250ms、只动
> transform/opacity、无渐变、无组件库、reduced-motion）。
> 台账按 github-preflight 要求给出；结论可溯源。

---

## 0. 检索台账

| # | 检索 query（原文） | 面 | 命中 |
|---|---|---|---|
| P1 | `micro-interactions web dashboard animation best practices duration easing transform opacity only`（语义检索：自然语言整句） | 外部 | **ui-skills.com/skills/iart-ai/micro-interaction**（100–250ms、transform/opacity、press scale 0.96、asymmetric timing、@starting-style）、**alexevans.io** micro-animations（动效令牌系统、stagger）、lobehub animation-at-work（easing 五法则）、gisthub Emil Kowalski 哲学（hover 即时、exit 更快、stagger 30–60ms） |
| P2 | `pywebview auto resize window to fit content height evaluate_js scrollHeight`（语义检索） | 外部 + 仓库 | pywebview 官网（`evaluate_js` / `Window.resize(w,h,fix_point)` / `window.width/height/x/y` 属性确认）、掘金 evaluate_js 实战；**ClaudeWatch 案例**（上一轮台账 R2：前端算内容高度 → 反调 `api.resize()`） |
| P3 | `animate progress bar transform scaleX instead of width GPU composited CSS transition react`（语义检索）+ 评论/正文精读（in:comments 等价：读 codefronts 每条 FAQ 与 adame.io 全文） | 外部 | **codefronts.com/components/css-progress-bars**（scaleX 60fps + `role=progressbar` + aria 三件套 + reduced-motion 禁循环）、**adame.io**（非合成动画每帧 6–16ms 主线程成本）、toxigon（box-shadow→drop-shadow、bg-color→opacity 伪元素） |
| P4 | 代码面（本地 grep，等价 `path:` 检索） | 代码 | `frontend/app/globals.css`（已有 `--ease-out` / `--duration-fast` / `--duration-base` 令牌）、`IslandSheetParts.tsx:19`（进度条**已是** scaleX + origin-left + motion-reduce + aria 三件套）、`IslandSheetParts.tsx:134`（AGENT 状态无脉冲）、`ProjectSummaryCard.tsx`（无 hover/press/进场动效）、trigger page（无 active press） |

**Discussions / PR 面**：本轮主题（CSS 动效规范）无对应仓库 PR 可考——如实标注；
关键结论均有 ≥2 独立来源（ui-skills + alexevans + gisthub 互证；codefronts + adame + toxigon 互证）。

## 1. 调研结论 → 对本项目的三条判读

1. **底盘已经打对**：进度条已是 scaleX 合成动画 + aria 完整 + motion-reduce；
   动效令牌（`--ease-out` / `--duration-*`）已存在且组件在用。**不需要引入 Framer Motion**——
   调研一致结论"CSS 能覆盖 80–90% 微交互"，且 DESIGN.md 红线本就排除新依赖。
2. **缺的是一致性层**：卡片无 hover/press/进场反馈、AGENT·RUNNING 无脉冲、把手无
   press 反馈——正是 Emil Kowalski 所说的"逐个组件各自动画"的失败形态前兆。
   补齐即可，不必新框架。
3. **明确不做**：
   - **内容自适应窗口高度**（ClaudeWatch 模式）：面板现在是**用户可缩放**的——
     自动改窗高会和用户的手动尺寸打架（拖到手感的尺寸被一次数据更新重置）。
     判定：冲突优先，弃。
   - 进度条数字 count-up：数字动画 300ms+ 且 tabular-nums 的跳变本身可读，
     收益低、复杂度高（RAIL 判定），弃。

## 2. 本阶段实施清单（全部 CSS/token 级，零新依赖）

| # | 项 | 实现（依据） |
|---|---|---|
| 1 | **动效令牌补齐** | `globals.css` 增 `--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)`（过冲，ui-skills/alexevans 同款）与 `--duration-base` 确认 |
| 2 | **卡片 hover/press** | hover：`translateY(-2px)` + 边框加深；press：`scale(0.98)`（0.95 以下卡通，gisthub）；150–200ms，motion-reduce 关 |
| 3 | **卡片进场 stagger** | fade + rise 8px，每卡 `index*40ms`（30–60ms 区间，gisthub），仅首次挂载，`motion-reduce` 全关 |
| 4 | **AGENT·RUNNING 脉冲** | 圆点 `motion-safe:animate-pulse`（与 LIVE 一致）；IDLE 不动（禁用态无动画，gisthub） |
| 5 | **把手 press** | `active:scale-[0.97]` + 已有 hover 配色（ui-skills press 反馈） |
| 6 | **smoke_realtime.py 补 overview 真机条目** | 真连 `/ws/engineering/overview/` + subscribe + 断言 connected 帧（补阶段 4 遗留） |

红线对照：全部 transform/opacity + 150–250ms + reduced-motion 全关 + 零依赖 ✓。

## 3. 开工 checklist

1. globals.css 令牌 → 2. ProjectSummaryCard 微交互+stagger → 3. IslandAgentStatus 脉冲 →
4. trigger press → 5. 门禁（tsc/eslint/单测）→ 6. smoke_realtime 补条目 →
7. E2E 抽查 island.spec → 8. 打包 → 9. commit/push/CI → 10. 文档+记忆。
