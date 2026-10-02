# Sprint 17 — 个人 ⇄ 团队模式切换（v1.0.0 收束）

> 日期：2026-10-03 · 基线：`a431e48` · 产品事实源：[`docs/PRODUCT_REFACTOR_PLAN.md`](../PRODUCT_REFACTOR_PLAN.md) §Sprint 17
> 前一阶段：[`sprint-16-island-polish.md`](sprint-16-island-polish.md)

---

## 一、这一阶段做了什么

用**顶栏一个 ⇄ 按钮**把「个人工程」与「团队协作」两层连起来，并顺手修掉一个藏了 8 个 Sprint 的 bug。

用户拍板的四条决定：顶栏切换按钮 · **URL 跟着变** · **启动仍落首页、切回团队时回到上次位置** · 侧栏**宽度恒定只换内容** · 本轮不发版。

新增/改动：

```text
frontend/stores/mode-logic.ts              纯逻辑：routeToMode / switchTarget（可单测）
frontend/stores/mode.ts                   localStorage 记忆 + useRememberTeamPath
frontend/components/shell/ModeSwitch.tsx  顶栏切换按钮
frontend/components/icons/index.tsx       + SwitchIcon（自绘，不引图标库）
frontend/components/shell/TopBar.tsx      + <ModeSwitch />
frontend/components/shell/LeftRail.tsx   ★重写：删假数据、接真实数据、双层内容、ARIA
frontend/components/shell/AppShell.tsx    rail 类型补 loading
app/(protected)/layout.tsx                useWorkspaces + useRememberTeamPath + 传 rail
app/(protected)/me/page.tsx               ★删掉硬编码假面包屑（"Amiya Workspace"）
app/(protected)/page.tsx                  「管理工作区」→「进入团队」，与顶栏共用落点
frontend/DESIGN.md                         §11.1 图标清单 + switch
```

---

## 二、关键决策

### 1. 判"当前在哪一层"**只看 URL**，绝不看 store

`routeToMode(pathname)`：`/workspaces` 或 `/w/` 开头 = 团队，其余 = 个人。

**为什么不用 `useChrome` 的 `railCurrent`**：`/workspaces` 那一页**不传 railCurrent**
（它不属于任何工作区），于是它和 `/me` 会得到同样的答案——而它们分属两层。
那种情况下切换按钮会变成**死按钮**：判成个人层 → 显示「去团队」→ 点下去 URL 不变、界面毫无反应。
这条已用单测钉死（`routeToMode("/workspaces") === "team"`）。

### 2. 记忆只存**团队层路径**，且不做内联脚本

key `mp-last-team-path`，与 `mp-theme` / `mp-zoom` / `mp-island-sheet` 同族。

- **个人层不记**：个人层只有一个聚合首页；记 `/me/issues` 会让用户切回来时莫名其妙停在那，
  而那两处都有自己的入口。
- **不需要 `app/layout.tsx` 的内联脚本**：主题必须在下一次绘制前落到 `<html>` 上（防闪白），
  而本 store 的值**不参与首帧渲染的任何可见输出**（按钮文案与落点都只由 pathname 决定），
  记忆只在"点击那一刻"被读。内联脚本只会多出一个真相源。
- **同步点挂在 `(protected)/layout.tsx`**：布局跨路由常驻，一次挂载覆盖所有页面；
  手动输入 URL、浏览器前进/后退都会让 `usePathname()` 变化，记忆自动跟上。

### 3. `rail.workspaces` **绕开 chrome store**

`useChrome` 的依赖数组是手写的，漏加字段会导致侧栏不重渲染。`AppShell` 本来就接受
直接传 props，所以 layout 里直接传——这也顺带说明 `ChromeState` 不需要加字段。

### 4. 侧栏宽度恒定（w-44）

`<main>` 宽度由侧栏决定。若切换时改变宽度，主内容区会横向重排一下——而"切换"是这个版本
唯一的新交互，让它伴随布局抖动是坏体验。代价是个人层下侧栏里也是 176px，用来放 4 个个人入口。

---

## 三、★ 顺手修掉的两个 bug（藏了很久）

1. **`LeftRail` 一直在渲染 Sprint 0 的假数据**：`RAIL_WORKSPACES` 硬编码
   `amiya/kaltsit/rhodes`，而 layout 从不传 `workspaces` → 永远渲染假的、点进去 404；
   `current` 的默认值 `"amiya"` 还让**个人页高亮一条不存在的工作区**。现在接 `useWorkspaces()`
   （与 CommandPalette 同一 queryKey，React Query 去重、**不额外发请求**）。
2. **`/me` 页面硬编码了假面包屑**：`{ workspace: "Amiya Workspace", project: "Amiya Project", role: 20 }`
   —— 个人设置页的顶栏会露出团队字样。已清空。

---

## 四、踩的坑（以及你怎么帮我避开的）

### 1. "刷新后记忆仍在"那条用例红了两次，两次原因完全不同

- **第一次**：我在用例里用 `page.addInitScript` 清 localStorage。
  `addInitScript` 会在**每次导航时重跑**（含 `page.reload()`）——等于测试自己把刚写的记忆抹掉。
  顺带查明：`.auth/user.json` 里**只有 cookie、没有 localStorage**，每个用例天然干净，压根不需要这个重置。
- **第二次**：删掉重置后仍然红。按你的要求**没有放宽断言**，而是去查真相——
  写了一个一次性浏览器脚本直接看 localStorage，结果是**应用侧完全正确**：
  记忆写入 ✅ → 切个人 ✅ → 刷新记忆仍在 ✅ → 切回团队直接回到那个工作区 ✅。
  真正的问题是我**断言写错了 URL 形态**：应用路由规范化后不带尾斜杠，我却在期望里写了斜杠。
  这是"断言描述错了形状"，不是"记忆的语义主张站不住"——所以改成不带斜杠的精确期望，**一步没松**。

> 教训：**红了先查根因，别先改断言**。两次红分别是我的测试写错、以及断言形状写错，
> 但只有真去测一次浏览器才知道应用是对的。

### 2. `AppShell` 的 rail 类型与 `LeftRail` 必填 props 冲突

`rail ?? {}` 的兜底在 `workspaces` 变必填后不再类型兼容。改成
`<LeftRail workspaces={[]} {...(rail ?? {})} />`——显式兜底比依赖可选链更清楚。

---

## 五、验证

| 项 | 结果 |
|----|------|
| 前端单测 | **122**（111 → +11 模式判定）全绿 |
| `tsc --noEmit` / `eslint` | ✅ |
| Playwright E2E | **31**（27 → +4）全绿，1.7 分钟 |
| 后端 | **334** 未改动（回归跑过）· ruff ✅ · format ✅ · 迁移无漂移 ✅ |
| API 变更 | **无**（所需数据全部现成） |
| 新增依赖 | **无**（单测仍走 `node --test` 零依赖方案） |

新单测刻意只覆盖"错了但界面看着还挺正常"的三处：`/workspaces` 判层（死按钮根因）、
`/work` 与 `/widget` 的**过宽前缀误判**、脏记忆（非 `/w/` 开头）被忽略。

新 E2E 四条：切换往返 + URL 变化 · 刷新后记忆仍在 · `/island-panel` 不受 TopBar 改造影响 ·
侧栏无假数据 + 真实工作区可见 + 当前项带 `aria-current` + 首页入口可点。

---

## 六、下一步

v1.0.0 的功能到这里收束。剩下的是**产品层面**的事，按优先级：

1. **发版**（本轮明确不做）：打 tag `v1.0.0` + GitHub Release + 发布说明
2. **视觉自检**：本轮的 UI 改动（顶栏按钮、侧栏双内容）需要你亲眼过一眼
3. 可选：README 的路线图/测试数字已更新，但产品介绍段落可再按 v1.0.0 的定位重写一版
