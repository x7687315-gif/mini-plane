# 阶段 2.5：悬浮窗交互补全（2026-10-14）

> 落实 `docs/research/2026-10-14-island-v2-master-plan.md` 的 M1/M2/M3。
> 两个提交：M1+M2（`38b79a2`）、M3（本文）。

---

## M1 默认首展（`38b79a2`）

- `desktop-config` 新增 `onboarded` 字段（默认 False）
- 用户从未表达过偏好 → 启动即**展开完整面板**（第一眼看到"记忆中的悬浮窗"）
- 收起 / 固定过一次 → `onboarded=True`，此后启动按记住的偏好走
- 真机验证：`onboarded=false` 配置启动 → 面板直接可见 ✓

## M2 把手加大（`38b79a2`）

- 140×14 → **200×32**（env 可覆盖），"工程 Island"文字**常显**（不再 hover 才显字）
- 真机验证：把手 200×32 @(860,0) ✓

## M3 拖动 + 缩放 + 阴影（本文）

| 项 | 实现 |
|---|---|
| 拖动 | **页眉 = 拖动区**（把手整窗同理）。技术路线：**JS pointer capture + 节流桥接**（~30fps），桥接发**位移增量**，Python 按 `win.x/win.y` 自算绝对坐标——丢事件自愈 |
| 缩放 | 面板**四边 + 四角自绘热区**（fixed 定位 6px/12px，光标形状随边），同一套桥接；Python 侧按 edge 组合算 x/y/w/h，min (360,96) |
| 结束持久化 | pointerup → `end_window_drag` → 立即落盘（拖动过程的高频 move 不逐次写盘） |
| 阴影 | `create_window(shadow=True)`（Windows only 官方参数）——与桌面分层，替代被否决的 transparent |

**技术路线变更说明**：总体规划里倾向 Win32 `HTCAPTION`，实施时改走 **JS pointer capture**。
原因：按下时鼠标捕获在 WebView2 子窗口上，原生模态拖动循环收不到 mousemove，
需额外释放子窗口捕获（易碎）；pointer capture 让事件始终回到发起元素（指针出窗也不丢），
且零 ctypes、与阶段 4 的桥接共用同一个 `DesktopApi`。

## 新增桥接（`DesktopApi` / `desktopBridge`）

- `move_window_by(target, dx, dy)`：target = panel / trigger
- `resize_window_by(target, edge, dx, dy)`：edge 为 left/right/top/bottom 组合
- `end_window_drag(target)`：结束即持久化
- 热区/拖动区**只在桌面面板渲染**（浏览器无桥，点了没反应比没有更糟）

## 验证

| 项 | 结果 |
|---|---|
| 前端门禁 | tsc 0 · eslint 0 · 单测 139 |
| desktop lint | ruff 全绿 |
| 打包 | package + portable（源=最新 20261014-120236）+ exe 全过 |
| pinned 启动 | 面板 (506,382) + 把手 (200,32) 都在 ✓ |
| **拖动/缩放手感** | **需你实测**（Windows 前台锁挡住合成输入——见诊断文档）；日志已可观测（`[api] move_window_by` 等） |

## 给用户的验证清单（下次双击 exe）

1. 双击 → 直接看到完整面板（不再是细线）
2. 按住面板**页眉空白处**拖动 → 面板跟随；松手后重启，位置保持
3. 鼠标贴面板**边缘/四角** → 光标变缩放形状，可自由拉尺寸（最小 360×96）
4. 点把手 / 按 Esc → 收起成把手；再点 → 展开
5. 图钉 → 常驻固定；重启记住
6. 手感有问题看 `runtime/launcher.log`（每次窗口操作都有日志）
