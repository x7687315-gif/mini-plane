# Mini Plane 桌面单机版（本地软件）

这是把 **前端 + 后端 + 数据库合并成一个本地桌面应用** 的运行层。产品定位回归本意：
数据不出本机，双击弹原生窗口，**不再用浏览器打开、不需要安装 PostgreSQL**。

## Island（V3 单窗两态，2026-10-21 起）

主窗口之外只有一个 **Island 窗口**，**永不隐藏**：收起态就是 360×44 的把手条，
展开态是 520×420 的工程浮页（可缩放）。旧的双窗「触发把手 + 面板」已退役。

| 操作 | 方式 |
|------|------|
| 展开 / 收起 | 点把手条、`Alt+I`；`Esc` 收起（pinned 时除外） |
| 固定 | 图钉 → 常驻置顶；取消固定不自动收起 |
| 拖动 / 缩放 | 把手条整条可拖；展开态边缘热区缩放（JS 桥接） |
| 重启恢复 | 位置、展开尺寸、形态、固定态存 `runtime/desktop-config.json` |
| 关 Island 窗口 | 本次会话 Island 退场，主窗口照常；不退出应用 |

文件分工：

```text
island.py          Island 规格：/island-panel?form=collapsed|expanded、尺寸、置顶
window_manager.py  唯一持有窗口引用与 displayMode × form 状态机
launcher.py        编排主窗 + Island、注入 js_api、关主窗停服
```

> 窗口出问题时先看 `runtime/launcher.log`：启动器的一切关键信息都落在这里。

## 它做了什么

`desktop/launcher.py` 是一个 Python 编排器：

1. 首次运行在**内嵌 SQLite**（`runtime/miniplane.sqlite3`）上自动建表——零数据库安装；
2. 子进程拉起后端（Django Daphne ASGI，同时给 HTTP + WebSocket）与前端
   （复用 `scripts/package.py` 产出的 Next standalone `server.js`）；
3. 二者就绪后，用 **pywebview 开一个原生窗口**（Windows 走 WebView2）载入界面；
4. **关窗即干净停服**：`taskkill /T` 杀自己的子进程树，启动时建立的
   kill-on-close Job Object 再由内核兜底——即使 launcher 被强杀/崩溃，
   Django、Node、WebView2 也不会留成孤儿。

## 进程生命周期（2026-10-29 修复残留）

### 默认不复用已有服务

旧版发现 8000/3000 在监听就直接复用，但复用进程**不在 launcher 的 `procs` 里**，
关窗时不会被杀；下一次启动又会继续复用，残留会累积。

现在默认**拒绝复用**：端口被占用就启动失败并提示先关闭占用程序。
这既避免“界面关了后台还在跑”，也避免接上另一套数据库。

开发调试确实需要复用时显式打开逃生门：

```bat
set MINIPLANE_REUSE_SERVICES=1
```

被复用的服务不会随窗口关闭，需自行停止。

### 强杀兜底

`desktop/job_object.py` 在 Windows 上创建一个
`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` Job，把 launcher 自己放进去；
之后启动的后端、前端、WebView2 后代默认继承。launcher 的 Job 句柄关闭时
（正常退出、崩溃、任务管理器强杀），Windows 内核回收整棵树。
若进程处于不允许嵌套 Job 的父环境中，会记录日志并退回 `taskkill` 清理。

### 验证

```bat
:: 正常关窗
backend\.venv\Scripts\python.exe desktop\verify_quit.py

:: 模拟任务管理器强杀（验证 Job Object 兜底）
backend\.venv\Scripts\python.exe desktop\verify_quit.py --force
```

检查范围不是只看端口：脚本记录启动时的所有后代 PID（含
`msedgewebview2.exe`），关闭后逐个确认退出。关键日志在 `runtime/launcher.log`：

```text
[job] kill-on-close Job 已启用
[services] 后端已启动 pid=…
[services] 前端已启动 pid=…
[quit] 主窗口已关闭：停掉后端与前端，并结束整个进程树
```

安全基线：只绑 `127.0.0.1`、`DEBUG=False`、`SECRET_KEY` 持久化在 `runtime/`、页面(3000)与
API(8000) 同 host（`127.0.0.1`）以规避会话 Cookie / CSRF 跨站失效。

后端配置独立成 `backend/config/settings/desktop.py`（SQLite 默认、eager Celery、内存通道层），
不动既有 `local` / `container` / `test` 配置，Postgres 生产链路原样保留。

## 怎么跑

前置：本机装有 **Node.js 20+**（跑前端 server），后端依赖装在 `backend/.venv`，
`pywebview` 已随本次改动写入 `backend/requirements/desktop.txt`。

```bat
:: 1) 装依赖（首次）
cd backend
.venv\Scripts\python -m pip install -r requirements\local.txt
.venv\Scripts\python -m pip install -r requirements\desktop.txt   :: 内含 pywebview

:: 2) 构建前端单机产物（生成 dist/.../app/server.js，启动器会自动定位）
cd ..
python scripts\package.py

:: 3) 起桌面窗口版
desktop\MiniPlane.cmd            :: 或直接 python desktop\launcher.py
```

自检模式（不开窗，只验证栈能起、接口能应答，便于无桌面环境 / CI 冒烟）：

```bat
set MINIPLANE_NO_WINDOW=1 && python desktop\launcher.py
```

## 端口 / 路径

| 项 | 值 | 覆盖方式 |
|----|----|----------|
| 后端 API/WS | `http://127.0.0.1:8000` | `MINIPLANE_BACKEND_PORT` |
| 前端页面 | `http://127.0.0.1:3000` | `MINIPLANE_FRONTEND_PORT` |
| 前端产物目录 | `dist/*/app` 或 `app/` | `MINIPLANE_APP_DIR` |
| SQLite / 密钥 / 日志 | `runtime/` | — |
| 就绪超时 | 180s | `MINIPLANE_READY_TIMEOUT` |

改端口需同步 `MINIPLANE_PAGE_ORIGIN`（CORS/CSRF 白名单；默认 `http://127.0.0.1:3000`）。

## 快捷方式 & 打包 .exe

```bat
:: 1) 打包单文件启动器 → dist\MiniPlane\MiniPlane.exe
backend\.venv\Scripts\python.exe desktop\build.py
::    分发到干净机器： desktop\build.py --portable（连 app + 后端源码一起拷）

:: 2) 桌面建/更新快捷方式（指向上面的 exe）
powershell -NoProfile -ExecutionPolicy Bypass -File desktop\make_shortcut.ps1 ^
  -Exe "%CD%\dist\MiniPlane\MiniPlane.exe"
::    不给 -Exe 则指向源码版（pythonw + launcher.py）
```

打包后冒烟（无需真开窗口即可验证 GUI 与编排）：

```bat
set MINIPLANE_CHECK_WEBVIEW=1 && dist\MiniPlane\MiniPlane.exe   :: 期望 [webview-ok]
set MINIPLANE_NO_WINDOW=1     && dist\MiniPlane\MiniPlane.exe   :: 期望 stack ready→services stopped
```

