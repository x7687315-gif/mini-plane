# Phase 4 · 高频交互连续性与日常便捷性

> 日期：2026-10-29 · 状态：完成两个已复现问题的最小修复
> 原则：先复现、再修；不引入全局状态/动画库；业务状态不依赖动画事件。

## 1. 已复现问题与修复

### 1.1 Task 抽屉关闭后焦点丢失（已修）

- **复现**：在 Anatomy 详情任务行按 Enter 打开抽屉，Esc 关闭后
  `document.activeElement` 为 `BODY`，键盘用户失去原上下文。
- **修复**：`components/ui/Drawer.tsx` 打开时记录触发元素，关闭时
  `focus({ preventScroll: true })` 归还；同时补 `ariaLabel`，
  任务抽屉的可访问名从 `undefined` 变为「AVXD4 任务详情」。
- **证据**：`anatomy-v3.spec.ts` 新增焦点陷阱与关闭恢复断言，9/9 通过；
  关闭抽屉后焦点文本包含原任务标题。

### 1.2 Growth ↔ Structure 切换丢失滚动位置（已修）

- **复现**：16 Stage 项目在 1440×900 下 Growth 内容高 1446px、可视 630px；
  滚到底 `scrollTop=816`，切 Structure（结构图无需滚动，被夹到 0），
  再切回 Growth → `scrollTop=0`。
- **修复**：`AnatomyPlate.tsx` 在切换前按视图保存 `scrollTop/scrollLeft`，
  用 `useLayoutEffect` 在目标视图提交后恢复；不改 URL 或业务状态。
- **验证（前后）**：
  - 修复前：`816 → 0 → 0`
  - 修复后：`816 → 0 → 816`
  - 无 console/page error。

## 2. 已验证但未发现问题的路径

| 路径 | 场景 | 结果 |
|---|---|---|
| Growth/Structure + Stage 交叉 | 点 Structure 后 60ms 内点 Stage 03；或先点 Stage 02 再切 Structure | 最终 URL 同时保留 `mode=structure` 与最新 Stage，详情一致；无旧状态覆盖 |
| 双视图按钮快速反向 | 同一事件循环内 Structure → Growth | 最终 URL 为 growth，选中 Stage 保留 |
| 减少动态效果 | `prefers-reduced-motion` | 既有 E2E 通过，切换/选中不依赖动画完成 |

## 3. 未验证 / 明确边界

- **Island 原生快速收起/展开**：本轮只做视觉原型，未修改生产窗口模型；
  Python 状态机/动画代际仍有既有单测（`desktop/tests/test_island_config.py`），
  但本轮**没有**在最终 exe 上重新做快速反向真机测试。不得写成“已通过”。
- 旧异步请求覆盖新状态：当前图纸用 URL 作为单一视图事实源，快速交叉测试未复现；
  没有为假想竞态引入 AbortController/全局状态机。
- 未新增动效：Growth/Structure 切换保持即时呈现；避免为了“看起来顺滑”而增加等待。
- 移动端/Island 生产视觉仍不在本阶段修改范围。

## 4. 三项基准

- **轻量化**：只修焦点与滚动两个真实问题，没有新增全局状态/依赖。
- **流畅性**：切换视图不再丢失阅读位置；关闭抽屉回到原任务，键盘操作连续。
- **日常便捷性**：长项目查看后可继续从原位置工作；高频详情浏览不再每次从头找。

## 5. 改动文件

```
frontend/components/ui/Drawer.tsx
frontend/components/issue/IssueDrawer.tsx
frontend/components/anatomy/AnatomyPlate.tsx
frontend/tests/e2e/anatomy-v3.spec.ts
```

测试：typecheck / lint / 175 单测；Anatomy E2E 9/9；12 Stage 滚动 E2E 与 16 Stage 手工脚本通过。
