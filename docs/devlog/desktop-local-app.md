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

---

## 第 2 部分：桌面快捷方式 + 打包独立 .exe

### 做了什么

1. **快捷方式生成器 `desktop/make_shortcut.ps1`**：在桌面建 `Mini Plane.lnk`。
   默认指向 `pythonw.exe + launcher.py`（源码运行）；给 `-Exe` 则指向打包好的
   `MiniPlane.exe`（分发）。工作目录、图标、描述都写全。**必须以 UTF-8 BOM 存盘**
   —— 本机 PowerShell 5.1 读 UTF-8 无 BOM 的 .ps1 会把中文注释解析错、脚本行为诡异
   （第一轮 `$desktop` 变 null 就是这个坑，与旧 `start.cmd` 闪退同源）。
2. **打包脚本 `desktop/build.py`**：用 PyInstaller 把 `launcher.py` 冻结成**单文件**
   `MiniPlane.exe`（`--onefile --windowed --collect-all webview`），落到 `dist/MiniPlane/`；
   `--portable` 可选把 app + 后端源码一并拷成分发目录。
3. **启动器路径解析升级**（`desktop/launcher.py`）：`repo_root()` 从 exe 所在目录**逐级向上**
   找含 `backend/manage.py` 的仓库根，`app_dir()` 就近找 `app/` 或 `dist/*/app/server.js`。
   → 单文件 exe 放仓库内任意层级都能双击跑（复用本机 backend/.venv + dist 前端），
   避免"拷贝 .venv 会因 venv 绝对路径重定向而损坏"的老问题。
4. **`MINIPLANE_CHECK_WEBVIEW=1` 自检模式**：只验证冻结版能否 import `webview`（GUI 就绪），
   无需真开窗口即可在打包后做冒烟——补上"GUI 无法在无桌面环境验证"的盲区。

### 验证（对**编译产物 MiniPlane.exe** 真跑，非源码）

- `MINIPLANE_CHECK_WEBVIEW=1 dist\MiniPlane\MiniPlane.exe` → `[webview-ok]`（webview 已正确
  冻结进包，双击可弹原生窗口）。
- `MINIPLANE_NO_WINDOW=1 dist\MiniPlane\MiniPlane.exe` → `stack ready` 后 `services stopped`、
  退出码 0（冻结版编排器成功拉起仓库内的 Daphne 后端 + node 前端，向上定位路径生效）。
- 桌面快捷方式 `Mini Plane.lnk` 的 Target = `C:\palne\dist\MiniPlane\MiniPlane.exe`（存在），
  Workdir = 其目录；双击即弹本地原生窗口。

### 说明与边界

- 冻结的是**启动器**；后端 Django、前端 Next 仍以子进程用本机 `backend/.venv` 与 `node` 运行。
  把 `MiniPlane.exe` 拷到干净机器独立运行需带 `--portable`（含后端源码 + 前端产物），
  目标机再建一次 venv 并装 Node（见 `desktop/build.py` 末尾提示）。`dist/` 已 gitignore，
  故 exe / 前端产物不入库，仅提交 `build.py` 等可复现脚本。

### 下一步

- 第 3 部分：修 Playwright E2E「测试窗口」并跑通。
- 收尾：p3c 代码质量检查 + 整体回归。

---

## 第 3 部分：修复 Playwright E2E「测试窗口」

### 现象（真跑复现）

`scripts/dev.ps1 e2e` 起栈后跑 14 个 Playwright 用例：**13 passed / 1 failed**。
失败的是 `issue-thread.spec.ts:81 评论 → 编辑评论 → 时间线条目数不变`：

```
locator.click 超时 30000ms —— waiting for getByRole('button', { name: /^保存$/ })
at tests/e2e/issue-thread.spec.ts:148
```

即"点编辑、填好内容后，找不到『保存』按钮"，30 秒超时。

### 根因

`components/issue/CommentList.tsx` 的保存按钮文案是**英文** `{pending ? "saving…" : "save"}`，
而同组件的 `编辑 / 取消` 都是中文；E2E 按正确的中文语义 `getByRole('button',{name:/^保存$/})`
匹配，自然命中不到。是 **UI 全面中文化（commit `f5f47ba`）漏改了这一个按钮 + 删除弹窗**，
不是测试写错、也不是环境 flaky。

### 修法（改组件，不动测试）

按 github-preflight 快速核查结论（Playwright 应以可访问名/语义定位 + 项目中文化方向），
把漏网的英文标签补齐为中文：`保存 / 保存中…`、`删除这条评论？`、`删除评论`、
`⌘/ctrl · Enter 保存`。**保持测试不变**——它断言的正是应有的中文 UX。
（`app/` 页面上 `create your first workspace` / `add member` 属设计语言刻意保留的英文艺术字，
未动，见 README"部分大标题按设计语言保留英文"。）

### 验证

- 重新 `dev.ps1 e2e`：**14 passed（2.1m）**，原失败用例 10.5s 通过。栈用 `dev.ps1 down` 收净。
- 组件改动过仓库自有门禁：`eslint` rc=0、`tsc --noEmit` 0 error。

---

## 收尾：代码质量 + 回归

- **P3C 检查**（按原则映射到 Python/TS，落 `docs/测试报告/P3C代码质量检查/`）：
  一般 1（魔法值 `CREATE_NO_WINDOW` 字面量重复 + 提示硬编码端口 → 已提取常量/改用
  `BACKEND_PORT/FRONTEND_PORT`）、轻微 1（本部分 i18n 遗漏 → 已修）；2 项 best-effort
  `except: pass` 与硬编码中文有书面豁免。安全规约全过（无硬编码密钥、无 SQL 拼接、
  子进程不用 shell=True、只绑 127.0.0.1）。评级"优秀"。
- **回归**：ruff（仓库 select 规则）All checks passed；`manage.py check` 0 issues；
  SQLite `migrate` 28 项 OK；E2E 14/14；冻结产物 `MiniPlane.exe` 重建于源码一致，
  `CHECK_WEBVIEW=[webview-ok]`、`NO_WINDOW=stack ready→stopped`。

## 交付总览

1. 前端 + 后端 + 数据库**合并为一个原生窗口本地软件**（pywebview + 内嵌 SQLite），
   不再用浏览器打开；关窗干净停服。
2. 桌面**快捷方式** `Mini Plane.lnk` → 指向打包好的 `dist\MiniPlane\MiniPlane.exe`，双击即用。
3. 独立 `.exe` 由 `desktop/build.py` 可复现（`--portable` 可带运行时做成可分发目录）。
4. 修复 E2E「测试窗口」（14/14 全绿）+ P3C 质量收口。
