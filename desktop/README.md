# Mini Plane 桌面单机版（本地软件）

这是把 **前端 + 后端 + 数据库合并成一个本地桌面应用** 的运行层。产品定位回归本意：
数据不出本机，双击弹原生窗口，**不再用浏览器打开、不需要安装 PostgreSQL**。

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
