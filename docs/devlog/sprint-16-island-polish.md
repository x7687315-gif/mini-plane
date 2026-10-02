# Sprint 16 — Engineering Island Polish

> 日期：2026-10-03 · 基线：`1c249f0` · 产品事实源：[`docs/PRODUCT_REFACTOR_PLAN.md`](../PRODUCT_REFACTOR_PLAN.md) §Sprint 16
> 前一阶段：[`sprint-15-desktop-island.md`](sprint-15-desktop-island.md)

---

## 一、这一阶段做了什么

Island 已经有了信息结构（Project / 阶段 / 进度 / NOW / TODAY / NEXT / AGENT），
这一阶段补的是**「看起来像一张图纸」**——计划 §Sprint 16 要求的
Paper Sheet / Blueprint Grid / Crosshair / FIG / SHEET / REV。

新增 `components/engineering-island/SheetChrome.tsx`，并改 `IslandSheet` / `IslandProgress` / 轮播容器。

---

## 二、做了什么（逐条对照计划）

| 计划要求 | 落地 |
|----------|------|
| Paper Sheet | 双线框（外 0.5px + 内框退 3px 再画一条 0.5px）+ 纸底 + 8px 细网格（比 body 的 32px 底纹更密，形成层次） |
| Blueprint Grid | 图纸内 8px 网格，`opacity 0.35` 压到内容之下，不干扰文字 |
| Crosshair | 四角十字准星（自绘 inline SVG，`vectorEffect="non-scaling-stroke"` 保证线宽不随缩放变形） |
| FIG | 页脚 `FIG · 01 / 03` |
| SHEET | 页眉沿用 `SHEET 01 / 08`（Sprint 14 已有） |
| REV | 页眉 `REV ●`（今天动过该项目）/ `REV 00` |
| 动效 | 非当前图纸 `scale(0.985) + opacity(0.6)`，**200ms**（在 DESIGN.md 规定的 150–250ms 内），只动 transform/opacity |

---

## 三、顺带修掉的一处**红线违规**

Sprint 14 的进度条用了 `transition-[width]` ——而 `DESIGN.md §6` 明令
**「动效只允许 transform / opacity，禁止动画 width / height / margin」**。
也就是说我在上一个 Sprint 亲手违反了自己项目的红线。

已改为 `transform: scaleX()` + `transform-origin: left`：视觉等价（都从左往右填充），
但只走合成层、不触发重排。**并加了 grep 检查**，确保 Island 目录里不再出现
`transition-[width]` / `transition-width`（当前 0 处）。

> 教训：设计红线要在**写的时候就查**，而不是等下一个 Sprint 回头看。
> 这次是靠"逐条对照 DESIGN.md"才发现的。

---

## 四、两个自己踩的坑

1. **给图纸加的 `<footer>` 撞了既有断言**：面板用例断言"没有 AppShell 页脚"，
   而我在图纸内部也用了 `<footer>`（FIG 标注条）→ E2E 红了。
   改成 `<div>` 并补了注释说明理由：它是图纸的说明条，不是文档页脚；
   一个视图里出现两个 footer 地标会让读屏的地标导航含糊。
2. `SheetChrome` 里 SVG 的线宽必须配 `vectorEffect="non-scaling-stroke"`，
   否则 `preserveAspectRatio="none"` 拉伸时线宽会被拉变形（角标线会粗细不一）。

---

## 五、验证

| 项 | 结果 |
|----|------|
| 前端单测 | **111** 全绿 |
| `tsc --noEmit` / `eslint` | ✅ |
| Playwright E2E | **27** 全绿（Island 子集 5/5，完整 1.4 分钟） |
| 红线自查 | Island 目录内「动画 width」**0 处**（grep 验证） |
| 后端 | 未改动 |

视觉改动本身**需要人眼确认**（截图/实机），自动化能覆盖的是"没破坏结构与行为"。
建议看 Island 页与桌面 Island 窗口各一眼。

---

## 六、下一步（Sprint 17 — Team Mode Refinement → v1.0.0）

个人 ⇄ 团队模式可切换（`MY ENGINEERING` ⇄ `WORKSPACE`），到 v1.0.0 收束。
这是**最后一程**，也最需要产品判断：切换入口放哪、切换时数据视图怎么变、要不要记忆上次选择。
建议动手前先补一节产品说明（写进 `PRODUCT_REFACTOR_PLAN`），避免边做边改方向。
