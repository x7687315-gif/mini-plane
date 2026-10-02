# Mini Plane 桌面单机版（本地软件）

这是把 **前端 + 后端 + 数据库合并成一个本地桌面应用** 的运行层。产品定位回归本意：
数据不出本机，双击弹原生窗口，**不再用浏览器打开、不需要安装 PostgreSQL**。

## Island 独立窗口（Sprint 15）

主窗口之外会再开一个 **Island 窗口**：置顶、无边框可拖、顶部居中，**默认隐藏**。

| 操作 | 方式 |
|------|------|
| 唤出 / 收起 | `Alt+I`，或 Island 页右上角的「独立窗口」按钮 |
| 拖动 | 拖窗口任意位置（`easy_drag`） |
| 切项目 | 窗口内左右翻页；**主窗口翻页时这个窗口会跟着翻**（localStorage 同步，零延迟） |
| 关掉这个窗口 | 点右上角关闭即可，**不会退出应用**（主窗口还在） |
| 临时不要 | `MINIPLANE_ISLAND=0` 启动即可完全不创建它 |

三个文件分工：

```text
island.py          Island 窗口规格：URL（/island-panel）、尺寸、置顶、顶部居中、隐藏启动
window_manager.py  窗口生命周期 + 暴露给前端的 js_api（显示/隐藏只有这一个负责人）
launcher.py        登记两个窗口并把 js_api 注入两者
```

> 窗口出问题时先看 `runtime/launcher.log`：启动器的一切关键信息都落在这里。

## 它做了什么

`desktop/launcher.py` 是一个 Python 编排器：

1. 首次运行在**内嵌 SQLite**（`runtime/miniplane.sqlite3`）上自动建表——零数据库安装；
2. 子进程拉起后端（Django Daphne ASGI，同时给 HTTP + WebSocket）与前端
   （复用 `scripts/package.py` 产出的 Next standalone `server.js`）；
3. 二者就绪后，用 **pywebview 开一个原生窗口**（Windows 走 WebView2）载入界面；
4. **关窗即干净停服**（`taskkill /T` 杀整棵子进程树）——修掉了旧 `start.cmd`
   "关浏览器窗口不停服务、端口还占着" 的老毛病。

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

改端口需同步 `desktop.py` 里的 `_PAGE_ORIGIN`（CORS/CSRF 白名单）。

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

