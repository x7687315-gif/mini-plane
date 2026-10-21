# 2026-10-21 · Island V3 Spike：单窗折叠的桌面层实测

提交对象：`desktop/verify_island_v3_spike.py`（真机验证脚本，可重复运行）。
对应决策简报：`docs/research/2026-10-21-island-v3-preflight.md` §10。

## 测了什么

| # | 测项 | 简报出处 |
|---|------|---------|
| 1 | frameless 尺寸偏差是否仍在（复刻 pywebview #1855 请求 1280×820） | §7 checklist Spike 1 |
| 2 | 默认 min_size 是否夹断收起态（请求 360×44） | §4 坑 4 |
| 3 | `resize(fix_point=NORTH\|WEST)` 折叠动画：15 步 ×16ms，测时序 + 锚点稳定性 | §7 checklist Spike 2 / §2 方向 A1 |

环境：Win11 build 26200 · pywebview 6.2.1 · **DPI 120（125% 缩放）**。

## 结果（全部通过）

| 测项 | 请求 | pywebview 自报 | 结论 |
|------|------|---------------|------|
| 默认 min_size | 360×44 | 360×**100** | 坑 4 确认：必须显式 `min_size=(360,44)` |
| 偏差探测 | 1280×820 | **1280×820** | **#1855 偏差未复现**，修复已在 6.2.1 |
| 收起态 | 360×44 | **360×44** | 显式 min_size 生效 |
| 展开动画 | →520×420 | 读回 520×420 | 235ms，单步最大 16ms |
| 收起动画 | →360×44 | 读回 360×44 | 250ms，单步最大 16ms |
| 锚点 | — | — | (620,200) **零漂移**，FixPoint.NORTH\|WEST 符合预期 |

## 两个新发现（简报外）

1. **工作线程 `destroy()` 挂死**（坑 8）：从 pywebview 工作线程调 `window.destroy()`，
   主线程卡在 `create_window` 事件循环、worker 卡在 `destroy_window`，互等至死
   （faulthandler 90s 强退脱出，栈见运行日志）。
   → V3 单窗化后运行期只有「常驻 + resize」，天然绕开；关机沿用 `launcher.py` 既有 `os._exit(0)`。
2. **坐标系统一为 DIP**（坑 9 的相关结论）：pywebview 创建/请求/自报全用 DIP，
   Win32 `GetWindowRect` 返回物理像素（本机 ×1.25）。V3 所有尺寸规格、持久化、动画目标值
   **按 DIP 书写**，与 CSS 像素 1:1，不要再混用两套。

## 实施教训（脚本本身）

1. **pywebview 窗口必须在 `start()` 之前创建**，且一次进程只能 `start()` 一次
   （`len(windows)==0` 检查 + GUI 循环不可重启）——两个窗口要在同一次 start 里依次测。
2. **`start(func, args)` 的 args 是单个值或元组**，传两个位置参数会 `TypeError: not iterable`。
3. **stdout 经管道会被缓冲，挂起时全部丢失**——诊断信息必须落盘（本脚本的 `log()` 模式）。
4. `faulthandler.dump_traceback_later(90, exit=True)` 是挂起归因的利器，直接指出互等栈。

## 对 V3 的实施裁定

- 动画方案定为：收起态 360×44 DIP、展开态 520×420 DIP（与现 Island 面板一致），
  `min_size=(360,44)` 显式给足，15 步 ×16ms ease-out cubic ≈ 250ms（守 ≤400ms 红线）。
- 「目标尺寸回读夹取」降级为防御性逻辑（偏差已不存在），不做硬前提。
- 下一步（简报 §7 剩余项）：修订 DESIGN.md §3.3 与补 config.py 宽高持久化，
  然后才是窗口壳层合并——分独立提交。
