# 桌面版关闭后残留进程：复现、根因与修复

> 2026-10-29 · 用户反馈：“桌面运行后关掉，进程并没有完全退出，会有残留进程。”
> 结论：**已复现并修复**。根因不是 pywebview 本身，而是 launcher 会**隐式复用**
> 8000/3000 上已有的服务；这些进程不在 `procs` 里，关窗时不会被清理。
> 另外补了 Windows kill-on-close Job Object，覆盖崩溃/强杀场景。

## 0. 检索台账

> 目标：确认 pywebview / WebView2 / Windows 子进程退出的已知坑与可靠兜底。
> 无 `gh` CLI / GitHub 登录，GitHub 代码结构搜索面未取得公开样本；
> 以本地 pywebview 源码 + 官方 Win32 API 文档补齐代码面。

| # | 信息面 | Query / 来源 | 命中与结论 |
|---|---|---|---|
| 1 | 仓库/Issues | `repo:r0x0r/pywebview process exit windows`（GitHub Issues API） | 命中 pywebview #95、PR #1844：destroy/线程退出有死锁史，不能在关闭回调里依赖 destroy 收尾 |
| 2 | Issues | `repo:tauri-apps/tauri "Closing the window does not kill the process on Windows"` | <https://github.com/tauri-apps/tauri/issues/5611>：关窗只杀 webview，sidecar/主应用会留成僵尸进程 |
| 3 | Issues | `repo:MicrosoftEdge/WebView2Feedback msedgewebview2 process exit` | <https://github.com/MicrosoftEdge/WebView2Feedback/issues/2477>：非优雅退出后 WebViewHost/WebView2 可能继续运行 |
| 4 | Discussions | `Kill process on exit tauri discussion job object`（语义检索） | <https://github.com/orgs/tauri-apps/discussions/3273>：Windows 建议用 **Job Object** 在退出时终止子进程 |
| 5 | PR | `repo:r0x0r/pywebview GUI thread deadlock` | <https://github.com/r0x0r/pywebview/pull/1844>：修复 GUI 线程重入死锁，支持“退出回调里不要 destroy 窗口” |
| 6 | 外部/官方 | `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` | <https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects>：子进程默认继承 Job；关闭最后一个 Job 句柄会终止全部关联进程 |
| 7 | 外部/官方 | `ExitProcess child processes` | <https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-exitprocess>：进程退出**不会**自动终止子进程 |
| 8 | 外部/官方 | `pywebview events closed` | <https://pywebview.flowrl.com/examples/events>：`events.closed` 是窗口关闭事件；本地 6.2.1 的 `webview/__init__.py` 显示 `start()` 用线程跑 GUI，不是旧注释所说的“GUI 子进程” |
| 9 | 评论正文 | `repo:r0x0r/pywebview in:comments process lingering OR orphan`（GitHub Issues API） | 有退出/销毁相关讨论；没有与 Mini Plane 完全同构的一手 issue，按“待验证”处理 |

**三角验证**：
- “退出进程不自动杀子进程”由 ExitProcess 与 Job Objects 官方文档互证；
- “WebView2/桌面应用会留下孤儿”由 Tauri #5611 与 WebView2Feedback #2477 互证；
- “Job Object 是 Windows 兜底手段”由 Tauri Discussion #3273 与 Microsoft Job Objects 文档互证。
- 置信度：官方文档高；两个独立 Issue 高；Discussion/社区案例中；pywebview 行为以本机 6.2.1 实测为准。

**语义与评论检索声明**：外部问句用 WebSearch 做语义召回；GitHub Issues 使用
`in:comments` 搜评论正文；GitHub 代码结构搜索因无 `gh`/登录未取得样本，已如实标注。

## 1. 复现（真机）

### 1.1 正常关窗本身是干净的

当前源码 / 当前 exe，开窗后 3 秒发 WM_CLOSE：

- 脚本模式：14 个后代（含 7 个 WebView2）→ 0；
- exe 模式：14 个后代 → 0；MiniPlane 镜像 0；8000/3000 端口 0；
- 窗口出现后立即关闭（0ms）也通过（`events.closed` 快路径生效）。

### 1.2 真正复现出残留的路径：隐式复用

1. 手动在 8000/3000 起一套桌面后端 + Next 前端（模拟“上一轮残留/开发服务”）；
2. 启动 `MiniPlane.exe`：launcher 日志显示 `backend already up (ours), reuse` /
   `frontend already up, reuse`，这两个进程**没有加入 `procs`**；
3. 关闭主窗口：launcher 自身退出，`procs` 为空；
4. 结果：后端/前端仍在监听 8000/3000，形成残留；
5. 下一次启动继续复用它们，残留会累积——与用户描述的“越用越多”一致。

这与 2026-10-04 事故记录中的“残留 22 个 MiniPlane”是同一类问题：
之前的修复只覆盖了**自己启动的**子进程；复用来的进程从未被纳入清理。

## 2. 根因

1. **复用策略没有所有权**：`port_listening()` 为真时直接复用，没有区分
   “本 launcher 启动的”与“上一轮/开发环境留下的”；
2. **复用的进程不在 `procs`**：`stop_services()` 只遍历 `procs`；
3. **强制退出没有 OS 级兜底**：`os._exit` 前靠 `taskkill /T`，如果 launcher
   被任务管理器强杀/崩溃，清理代码不会执行；
4. **注释与 pywebview 6.2.1 实际模型不符**：旧注释假设 GUI 在独立子进程。

## 3. 修复

### 3.1 默认禁止隐式复用

`desktop/launcher.py`：

- 新增 `reuse_services_enabled()`，默认 **false**；
- 8000/3000 任一被占用 → 启动失败，给出可操作提示，**不接管**；
- 开发调试确实要复用时显式设置 `MINIPLANE_REUSE_SERVICES=1`；
  日志明确写“被复用的服务不会随窗口关闭”；
- `MINIPLANE_NO_WINDOW=1`（自检/CI）下错误不再弹模态框。

### 3.2 Windows kill-on-close Job Object

新增 `desktop/job_object.py`：

- 启动早期创建 Job，设置 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`；
- 把 launcher 自身放进 Job；之后启动的 Django / Node / WebView2 后代默认继承；
- launcher 正常退出、崩溃或被强杀时，内核关闭 Job 句柄并回收整棵树；
- 若当前进程已在受限父 Job 中导致分配失败，记录日志并退回原有 `taskkill` 清理。

### 3.3 修正退出链路说明

- `window_watch.py` / `window_manager.py` / `launcher.py` 注释改为：
  pywebview 6.2.1 GUI 在**主线程**；`events.closed` 是本机快路径，
  标题监视是跨版本兜底；强退保障是 Job Object + `taskkill /T`；
- 不再声称“Windows 上 events.closed 不触发”这一过时结论。

### 3.4 验证工具加严

`desktop/verify_quit.py`：

- 记录启动时的**所有后代 PID**（包括 `msedgewebview2.exe`），关闭后逐个确认退出；
- 检查 MiniPlane 镜像与 8000/3000 端口；
- 新增 `--force`：`taskkill /F` 强杀窗口进程，验证 Job Object 兜底；
- 修正旧版误把 Island 窗口当主窗口的问题。

## 4. 验证结果

| 场景 | 结果 |
|---|---|
| 正常关窗（当前 exe，V3 前端） | 13 个后代（7 个 WebView2）→ 0；端口 0；MiniPlane 0；PASS |
| 强杀窗口进程（`--force`） | 13 个后代 → 0；端口 0；PASS |
| 已有服务占用 8000 | launcher 退出码 1，提示“不会隐式复用”；手动服务仍在（未被接管/误杀） |
| 正常关窗后重启 | 无端口冲突，不复用残留 |
| ruff / py_compile | PASS |

记录日志：`runtime/launcher.log` 出现
`[job] kill-on-close Job 已启用`、`[services] 后端已启动 pid=…`。

### 4.1 依赖安全审计

用公共 npm registry 跑 `pnpm audit --prod --audit-level high`：

- 初始 14 条（3 critical / 5 high / 5 moderate / 1 low），绝大多数来自 Next；
- **Next 16.3.5 → 16.4.3**：清除 Next 的 critical/high（含 Image Optimization RCE /
  Server Actions DoS / `use cache` RCE）；
- **source-map-js 1.2.1 → 1.2.2**：通过 `pnpm-workspace.yaml` 的 `overrides` 覆盖
  Next→postcss 的传递依赖；
- 最终剩 **1 条 high：zod <4.6.6**（oversized constrained collections 内存耗尽）。
  尝试升级 zod 4.6.6 + @hookform/resolvers 5 后，成员表单的
  `z.coerce.number()` 类型推导破坏（typecheck 失败），已回退；
  当前 zod 只用于前端表单，且 schema 未使用受限集合（array/record 的 max 约束），
  风险暂按“本地单用户、不可由远端直接触发”评估，列入下一轮升级债。

前端门禁在 Next 16.4.3 下重跑：typecheck / lint / 175 单测 / build / 40 E2E 全过。

## 5. 仍存在的边界

- 如果用户**只强杀 PyInstaller 父 bootloader**（而不是窗口所属子进程），
  Job 句柄在子进程里，子进程仍可能继续运行；任务管理器通常按应用组结束，正常路径不受影响。
- 若 launcher 运行在**不允许嵌套 Job** 的父 Job 中，Job 分配会失败并退回
  `taskkill`；日志会明确记录。
- 显式 `MINIPLANE_REUSE_SERVICES=1` 是开发逃生门；复用的服务本来就不属于本次
  launcher，不会被关闭，这是有意的。
- 这次没有改后端/数据库；`runtime/`（SQLite、SECRET_KEY、日志、WebView profile）
  是用户数据，不做清理。

## 6. 变更文件

```
desktop/job_object.py（新增）
desktop/launcher.py
desktop/window_watch.py
desktop/window_manager.py
desktop/verify_quit.py
```

## 7. 相关文档

- 2026-10-04 旧事故：[incident-2026-10-04-desktop-quit.md](incident-2026-10-04-desktop-quit.md)
- 桌面运行说明：[desktop/README.md](../../desktop/README.md)
- Anatomy V3 生产记录：[v3/PHASE3_REPORT.md](../refactor/ui-design/anatomy/v3/PHASE3_REPORT.md)
