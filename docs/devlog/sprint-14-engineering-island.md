# Sprint 14 — Engineering Island MVP（v0.8.0）

> 日期：2026-10-02 · 基线：`110e9d5` → 本 Sprint 产出见文末 commit
> 产品事实源：[`docs/PRODUCT_REFACTOR_PLAN.md`](../PRODUCT_REFACTOR_PLAN.md) §16–§20（Sprint 14 规格）
> 交接文档：[`docs/HANDOVER.md`](../HANDOVER.md) §7「未完成计划」第 1 条

---

## 一、这一阶段做了什么

把「当前工程状态」做成一个可随手瞄一眼的表面：**Engineering Island**。

- **新路由 `/island`**：一张图纸 = 一个 Project。左右滑动 = **翻工程图纸**（不是切任务，这是产品计划里最核心的交互定义）。
- **两种形态**（计划 §18）：
  - Focus（默认）：完整图纸页 —— Project / Current Stage / Progress / **NOW** / **TODAY** / **NEXT** / Agent Status
  - Resting：44px 单行条 —— 标识符 + 名称 + 百分比 + 活动方块，点一下展开
- **数据全部来自既有接口，后端零改动**：`GET /api/v1/projects/mine/` 已提供 6 个字段，缺的那一个（TODAY 明细）用既有 `worklogs/?date=today` 补。

新增文件：

```text
frontend/features/engineering-island/
├── logic.ts                      # 纯逻辑：翻页边界 / 进度换算 / 计时格式化 / URL→页码
└── index.ts                      # barrel
frontend/components/engineering-island/
├── EngineeringIsland.tsx         # 容器：取数、URL 同步、WS 订阅、Resting/Focus 切换
├── IslandCarousel.tsx            # 轮播：原生 scroll-snap + 键盘 + 无障碍
├── IslandSheet.tsx               # 一张图纸页 + Resting 条
├── IslandSheetParts.tsx          # 进度 / NOW·NEXT / TODAY / AGENT 四个展示件
└── index.ts
frontend/app/(protected)/island/page.tsx
frontend/tests/unit/island-logic.test.mts   # 12 条纯逻辑单测
frontend/tests/e2e/island.spec.ts           # 3 条浏览器用例
```

---

## 二、关键决策（连同理由一起留档）

### 1. 轮播用原生 CSS scroll-snap，**不引轮播库**

开工前按 `github-preflight` 查过（台账见 §五）。社区共识一致：**不需要循环 / 自动播放 / 虚拟化时，原生 scroll-snap 就够**；库（Embla / Swiper）是为那三样存在的。本 Sprint 三样都不需要——计划 §14 明确「先不追求复杂动画」，且图纸到边缘应当**停住**而不是环回。

白送的四样能力：键盘滚动、触控板惯性、触屏惯性、屏幕阅读器支持。

**更重要的是交互方向**：滚动事件只**读**不**写**——我们观察用户滑到哪页（→ 同步 URL），而不是用 JS 驱动滚动位置。手写 transform 轨道 + 拖拽物理最容易出的 bug（快滑连跳、拖完回弹打架）根源都是**双向都写**。只有键盘/按钮切页才程序化滚动，并用 ref 记住「这次是程序化滚动」，避免与刚发生的用户滑动互相触发。

### 2. WS 只给**当前选中**的项目挂（1 条连接）

`useProjectRealtime` 原本只在项目详情页调用，首页完全没订阅。Island 若对每个项目都订阅 = N 条常驻连接，与项目「轻量高效」硬约束冲突。

现在只对当前图纸挂一条，滑动切页时切换（这也是既有设计意图：一条项目一条 socket，离开即断开）。**顺带把 Sprint 15（桌面 Island 窗口）要用的这条路先走通了**，二期不用返工。

### 3. TODAY 只取当前项目的日志

`/projects/mine/` 只给 `today_logs` **计数**，而图纸上要的是 `✓ 标题` 清单。所以对当前项目单发一次 `?date=today`；**其余项目的日志不预取**——用户不会为看不见的图纸付请求。加载失败/为空时降级为计数文案，不留白。

### 4. 当前图纸进 URL（`?sheet=<project_id>`，不是序号）

延续项目铁律「URL 是唯一事实来源」：刷新、分享链接、前进后退都要回到同一张图纸。

用 **id 而不是序号**：`/projects/mine/` 按 `-last_activity, name` 排序，项目一动序号就漂移，序号进 URL 会指错图纸。id 找不到（项目被删/无权限）时回落到第 0 张，而不是空白或报错。

### 5. 进度换算**拒绝魔法阈值**

初版写了「大于 1 就当百分数」的两量纲猜测，单测立刻把它打回来：`1.03` 到底是 1.03% 还是 103% 不可判。**这个歧义本身就是设计缺陷**，改成两个显式函数：`progressPercent`（只认 0~1）与 `percentValue`（0~100 整数），各自只夹边界。

---

## 三、验证

| 项 | 结果 |
|----|------|
| 前端单测 | **111**（99 → +12 Island 纯逻辑）全绿 |
| `tsc --noEmit` | ✅ |
| `eslint` | ✅ |
| `pnpm build` | ✅ |
| Playwright E2E | **26**（23 → +3 Island）全绿 |
| 后端 | 未改动，`334` 用例与门禁沿用 Sprint 13 结论 |

新增单测刻意只覆盖「算错了但看不出来」的地方：翻过头 / 进度冒出 103% / 计时 59 秒进位 / URL 指向已删除的项目 / 只有空白的字符串。

新增 E2E 三条：① 图纸页六个信息块都在（缺一个都不算过）；② 切页后 URL 变 `sheet=<第二张>`、卡片跟着换、末页按钮置灰、**刷新后仍在第二张**；③ Resting 收起/展开。

---

## 四、踩坑

1. **E2E helper 签名**：`uiLogin(page)` 少传参数、`expectWriteOk(resp, [201])` 把字符串参数当状态数组——都是我没先读 `helpers.ts` 的后果。对照：默认 chromium project **已带 `storageState` 登录态**，`features.spec.ts` 根本不调 `uiLogin`。
2. **`pnpm build` 是整条门禁里唯一会「看起来卡住」的步骤**（Turbopack 全量编译）。把它放后台跑、日志落盘后，问题立刻从「卡住」变成「还在编译」。顺序建议：**先跑快的（单测/类型/lint），最后单独跑 build**。
3. **Windows 下 `node` 进程容易残留**：被中断的构建会留下多个 `node.exe`，下一次跑构建前先清掉，否则表现像是"永远转圈"。

---

## 五、开工前调研台账（github-preflight · 快速核查模式）

调研问题：**图纸轮播该怎么做？有没有必须避开的坑？**

| # | 检索 query（原文） | 命中 | 采纳的结论 |
|---|------------------|------|-----------|
| 1 | `React carousel implementation 2026 CSS scroll-snap vs embla-carousel swipe gesture pitfalls touch scroll conflict prefers-reduced-motion` | [21st.dev/blog/react-carousel-components](https://21st.dev/blog/react-carousel-components) | 「Native scroll beats a rebuilt one」：scroll-snap 免费给键盘/惯性/读屏；用库只在需要 loop/自动播放/虚拟化时 |
| 2 | 同上 | [ghost.codersera.com/blog/slider-vs-carousel](https://ghost.codersera.com/blog/slider-vs-carousel-best-for-web-designing/) | 无障碍最小集：`role=region` + `aria-roledescription` + 每页 `Slide N of M` + 非可见页 `aria-hidden` + 方向键；自动播放须有暂停（我们没有自动播放） |
| 3 | 同上 | [kishorek.dev/writing/squashing-the-swiping-bug](https://kishorek.dev/writing/squashing-the-swiping-bug) | 快速滑动会连跳的根因是**原生惯性与 React 状态互相打架**；正确解法是别用 JS 驱动滚动（本 Sprint 采纳） |
| 4 | 同上 | [asoasis.tech React carousel scroll-snap](https://asoasis.tech/articles/2026-04-28-1453-react-carousel-slider-implementation) | scroll-snap 的能力与短板对照表；不循环时它是最省的一条路 |
| 5 | 同上 | [CSDN：Embla 轮播 5 个实战要点](https://blog.csdn.net/gitblog_00499/article/details/153448182) | 箭头按钮要放在 viewport **外面**，避免点击与拖拽手势打架（本实现采用） |

**三角验证**：结论 1（用 scroll-snap 而非库）由 #1 #3 #4 三个独立来源支持；无障碍最小集由 #2 与 W3C WAI Carousels 教程（#2 内引用）互证。**未找到**「桌面实时工程投影卡片」的现成开源实现——这不影响决策，因为视觉与信息结构已由产品计划 §17 逐字给定，属于本项目独有形态。

**落地取舍**：零新增依赖（与 DESIGN.md「不引组件库」一致，也符合交接文档 §8 的轻量约束）。

---

## 六、下一步（Sprint 15 — Desktop Island）

- `desktop/` 增加 `island.py` + `window_manager.py`，主窗口之外再开一个 Island 窗口
- Always on Top / 顶部居中 / 拖拽 / 隐藏 / 显示
- 两窗口通过 **WebSocket** 同步（本 Sprint 已把「当前项目一条连接」这条路走通）
