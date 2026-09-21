# 桌面单机版改造 · 开发日志

> 背景：产品定位一直是「本地运行的单机软件」（数据不出本机）。但上一阶段的"单机版"
> `scripts/package.py` 产物，`start.cmd` 最后一步是 `start "" "http://127.0.0.1:3000/login"`
> —— 只是把 Next 前端用 node 起在本地、然后**调用系统浏览器打开**。这与"本地软件"不符。
> 本轮把前端 + 后端 + 数据库真正合并成一个本地桌面应用：原生窗口、关窗停服、免装 PostgreSQL。

技术选型经过 GitHub 开工前调研（六面检索）后定：**pywebview 原生窗口壳**（Python 栈最贴合
现有 Django 后端、无需引入 Rust、改动最小可回退）+ **内嵌 SQLite**（去掉 PostgreSQL 这一"双击即用"
拦路虎），Postgres 生产链路原样保留。

---

## 第 1 部分：前后端合并为原生窗口本地软件

### 做了什么

1. **后端桌面配置 `backend/config/settings/desktop.py`**（新增，不动 local/container/test）
   - 数据库默认切到内嵌 SQLite（`runtime/miniplane.sqlite3`）；
   - `DEBUG=False`、`ALLOWED_HOSTS=[127.0.0.1, localhost, testserver]`；
   - `SECRET_KEY` 首次随机生成并**持久化**到 `runtime/secret_key`（每次现生成会导致重启被登出）；
   - CORS/CSRF 固定为页面地址 `http://127.0.0.1:3000`（页面 3000 ↔ API 8000，同 host 不同端口，
     规避会话 Cookie / CSRF 跨站失效——正是 commit `07d8f83` 踩过的坑）；
   - Celery eager + Channels 内存层，本机零 Redis / Docker 依赖。

2. **启动器 `desktop/launcher.py`（新增，pywebview 原生窗口）**
   - 首跑在 SQLite 上 `migrate`（幂等，落 `runtime/` 标记文件）；
   - 子进程拉起后端（`manage.py runserver` = Daphne ASGI，HTTP + WebSocket 一把带走）
     与前端（复用 Next standalone 的 `node server.js`），都只绑 `127.0.0.1`、`CREATE_NO_WINDOW` 免黑框；
   - 轮询 `/api/v1/health/` 与 `/login` 就绪后，`webview.create_window(...)` 开**原生窗口**载入界面，
     **不再调系统浏览器**；
   - `finally` 用 `taskkill /T /F` 杀整棵子进程树 → **关窗即干净停服**，修掉旧版"关窗口不停服务"；
   - 逐服务判断端口，半死时只补起缺的那一半；`MINIPLANE_NO_WINDOW=1` 走无窗自检（供 CI 冒烟）。

3. **依赖与入口**：`backend/requirements/desktop.txt`（`pywebview==6.2.1`）、
   `desktop/MiniPlane.cmd`（双击入口，UTF-8 BOM 防 GBK 解析崩）、`desktop/README.md`（用法）。

4. `.gitignore` 增加 `runtime/`、`desktop/build/`（SQLite / 密钥 / 日志 / 打包产物不入库）。

### 怎么做的（关键取舍）

- **为什么复用 Next standalone + node，而不是把前端静态导出**：standalone 产物已被
  `scripts/package.py` 跑通（npm 扁平 node_modules 规避 pnpm 断链），行为与现有可用版本一致，
  改动面最小、可回退。静态导出（`output: export`）作为后续可选优化，不在本轮。
- **为什么 SECRET_KEY 持久化**：Django 会话 cookie 用 SECRET_KEY 签名；若每次启动现生成，
  重启即全员登出。持久化 + session 存 SQLite = 登录态跨启动保留。
- **数据库切换的坑规避**：Windows 绝对路径塞 `sqlite://` URL 解析不可靠，故在 settings 里
  先给 `DATABASE_URL` 占位让 `env.db_url` 不炸，再在 import 后**显式覆盖 `DATABASES` 引擎**，
  绕开盘符 / 前导斜杠问题。

### 验证（本机真跑，非纸面）

- `manage.py check` → 0 issues；`migrate --noinput` → 28 项迁移在 SQLite 上全部 OK
  （证明模型无 Postgres 专属字段，SQLite 可承载）。
- 启动器自检 `MINIPLANE_NO_WINDOW=1`：后端 health、前端 login 均应答，随后干净停服
  （`services stopped`，端口释放）。
- 端到端功能冒烟（真 HTTP 打到本地栈）：
  `csrf 200 → register 201 → /auth/me 200 → workspaces POST 201`（内嵌 SQLite 上认证写入成功）。
  其中 `project 404` 是冒烟脚本猜错嵌套路由（应用对不存在资源按防枚举返回 404），非缺陷。
- ruff（按仓库 `select=[E,F,W,I,UP,B,DJ]` 标准）对新增两个 .py：`All checks passed!`。

### 下一步

- 第 2 部分：桌面**快捷方式** + **打包独立 `.exe`**（PyInstaller 冻结启动器）。
- 第 3 部分：修 Playwright E2E「测试窗口」并跑通。
- 收尾：p3c 代码质量检查 + 整体回归。
