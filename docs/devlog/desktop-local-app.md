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

## 追加 · 第 4 部分：修复桌面版「闪退」+ 自定义图标

### 现象

用户双击桌面「Mini Plane」快捷方式 → 窗口一闪即退（闪退）。

### 根因（真跑抓到，非猜）

之前的无窗自检（`MINIPLANE_NO_WINDOW`）只跑到"栈起 + 就绪"就返回，`CHECK_WEBVIEW` 只
`import webview`——**都没真正调用 `open_window`**，所以漏掉了里面的一行 API 误用：

```
TypeError: start() got an unexpected keyword argument 'window'
  at launcher.py open_window: webview.start(func=None, window=window, debug=False)
```

pywebview 6.2.1 的 `webview.start()` **不接受 `window=` 参数**（`create_window` 登记的窗口由
`start()` 统一驱动）。而且旧 `_fatal` 有 `if os.name == "nt" and not IS_FROZEN` 守卫——
**冻结版（--windowed 无控制台）根本不弹框、stderr 又被丢弃**，于是任何启动期异常都表现为
"静默闪退"，用户毫无线索。

### 修法（两处）

1. `open_window`：`webview.create_window(...)` 后调 `webview.start(debug=False)`（去掉非法 `window=`）。
2. **让失败不再静默**（防同类问题复发）：
   - 新增 `_log()`，所有失败写 `runtime/launcher.log`（带时间戳）；
   - `_fatal` 在 Windows 上**一律弹 MessageBox**（不再 `not IS_FROZEN` 短路），附日志路径；
   - `open_window` 单独 try/except，WebView2 初始化失败给出"请装 Edge WebView2 运行时"的明确指引；
   - `CHECK_WEBVIEW` 升级为**真开一个窗口再自动关**的 GUI 探针（逼出 create_window/start 的惰性后端加载），
     这样打包冒烟能真正覆盖到这条路径。

### 自定义图标

`desktop/build.py` 的 `--icon` 与 `make_shortcut.ps1` 早已支持 `desktop/miniplane.ico`；
本轮生成了一枚蓝白纸飞机徽标（ImageGen 出图 → 裁掉角标水印 → Pillow 导出 16~256 多尺寸 .ico），
并放了 `frontend/public/icon-512.png` 作 favicon。重打包后 exe 与桌面快捷方式都用上它。

### 验证

- 真跑冻结版完整启动：MiniPlane 进程存活（窗口在）、8000/3000 均 200、`launcher.log` 无失败记录 →
  闪退消除。
- `MINIPLANE_CHECK_WEBVIEW=1 MiniPlane.exe` → `[webview-ok] GUI 后端可初始化、窗口创建/关闭正常`（rc0）。

---

## 追加 · 第 5 部分：UI 中文化走查与补齐

针对两个问题做核查：**① UI 是否已中文化；② 保留英文之处是否沿用了原英文字体、整体是否协调。**

### 设计语言的判定基准（DESIGN.md §2）

- **Cormorant Garamond（衬线斜体）** 专用于「装饰性英文」：Hero/页面大标题、Drawer 区块标题、
  编号 ID（AMI-7）、坐标读数、`Plane` 字标、登录页 `Sign in`/`Create account` 等。
  这些**本就该是英文**——Cormorant 无中文字形，硬塞中文会掉回系统字体、破坏「蓝图编辑风」。
- **Inter（无衬线）** 承载正文 / UI / 表单 / 按钮 / 提示——**这一层必须是中文**。

所以"漏中文化"的判定 = **sans 语境里残留的英文功能文案**；serif 语境的英文是设计，不算漏。

### 走查结论

- Issue 主流程（抽屉、评论、批量、筛选、状态/优先级）此前已中文化（E2E 断言 `用户名/保存/新建任务/
  批量操作/应用/设置状态/重试失败项/发布/编辑/标签（覆盖）` 等中文即为证）。
- 但**工作区 / 项目 / 成员 / 设置 / 认证页 / 404 / 筛选与批量占位符**里散落一批 sans 英文功能文案，
  是「全面中文化」(`f5f47ba`) 的漏网。

### 本次补齐（54 处，均为 sans 功能文案，且经核对不被任何测试引用）

- 表单标签：`Name/Slug/Email/Role/State/Priority/Assignee/labels/assignee/sort` → 名称/标识（Slug）/邮箱/
  角色/状态/优先级/负责人/标签/排序。
- 按钮 / 弹窗标题 / 副标题：`new workspace / New workspace / add member / Add member / new project /
  New issue / Delete workspace / this cannot be undone / the email must already be registered /
  a shelf for your projects` → 对应中文。
- 占位符：`search title / description / any label / anyone / set priority… / assign to… /
  choose the new set… / unassigned` → 中文。
- 表头 / 角色选项 / 侧栏：`member/role/joined`、`Admin/Member/Viewer`、`closed/days` → 中文。
- 交叉链接与 404 正文：`Register →`→`注册 →`、`Already have an account? … Sign in →`→`已有账号？… 登录 →`、
  404 正文与"删除工作区级联"说明句 → 中文。
- 抽屉关闭 `aria-label="close"`→`关闭`。

### 有意保留的英文（属设计，且确认沿用 serif/mono 字体）

- 页面大标题 `Workspaces / Projects / Members / Settings / New project`（`bp-display` = Cormorant 斜体）。
- 认证页 `Sign in / Create account`（`font-serif` h1）、`Plane` 字标、坐标读数、`sheet 01/12`、`fig · identify`。
- 404 的 `FIG`、`Resource not found`（`bp-title` serif）、`back to dashboard`（内联 serif 斜体）。
- 设置页 `Danger zone`（`font-serif italic` 区块标题）。
- 示例值 / 等宽：`Amiya Workspace`、`amiya-ws`、`AMI`、`amiya@example.com`、`•••••`、`00° N · 00° E`。
- 状态枚举 `Backlog/Todo/In Progress/Done` 与 `aria-label="status"`、`"edit comment"`：
  **被 E2E 以英文匹配**（`option /^Todo$/i`、`getByLabel("status"/"edit comment")`），
  属"改则须同步改测试"的耦合项，本轮**未动**，留作后续与测试一起处理。

### 验证

- `tsc --noEmit` 0 error；`eslint` 改动文件 rc=0。
- `dev.ps1 e2e` 复跑：**14/14**（见下条命令输出）。

---

## 追加 · 第 6 部分：登录改造为"昵称优先 / 免密 / 可选绑定"

### 需求

本地单机应用，登录别太复杂：入口不再摆"账户+密码/邮箱"。新逻辑——
① 首次进入只填昵称即建号；② 密码 / 邮箱由账户所有人之后在设置里自助绑定；
③ 未绑定密码者登录时不出现验证界面、直接进入，绑定者才需二级验证。

### 后端（`apps/users`）

- 模型 `email` 由 `unique=True` 改为 `unique=True, null=True, blank=True`（迁移 `0002_alter_user_email`）。
  关键：**可空唯一必须用 NULL 而非空串**——空串会互相撞唯一约束；且 Django `create_user` 的
  `normalize_email(None)` 会把 None 变成 `''`，故 `RegisterSerializer.create` 不走 `create_user`、
  直接建实例确保存 NULL（测试 `test_register_nickname_only` 抓到并修好了这个坑）。
- `register`：昵称必填，密码 / 邮箱可选；无密码 → `set_unusable_password()`（免密账户）。
  显式声明 email 字段会丢自动 UniqueValidator，已手动补回（否则重复邮箱 500）。
- `login` 三分支：免密账户 → 直接 `login()` 返回 200；有密码账户只给昵称 → 401 `password_required`；
  昵称不存在 → 404 `not_found`（前端据此提示可新建）。有密码时仍走防暴力锁定 + `authenticate`。
- 新增 `POST /auth/bind/`（仅本人）：设 / 改密码、绑 / 换邮箱、`remove_password` 回到免密；
  改密后 `update_session_auth_hash` 保住当前会话；邮箱占用冲突显式拒绝。
- `UserSerializer` 增 `has_password` / `has_email`，供前端判断是否需二级验证、设置页显示状态。

### 前端

- `LoginForm` 重写为**昵称优先三步状态机**：entry（只填昵称 + "进入"）→ 后端 code 决定
  进入 password 步（补密码）或 create 步（一键用该昵称新建）→ 成功即进。入口不再有邮箱/密码栏。
- `/me` 设置页新增 **Security 卡**：自助"保存密码 / 移除密码 / 保存邮箱"，实时显示"已设置 / 未设置"。
- 中文化 + 统一：登录页引导文案、AuthGuard 加载/错误提示、`roleLabel`（types/workspace）改中文；
  大标题 / 区块标题按设计语言保留 Cormorant 衬线英文。
- 按钮挤压修复：`LeftRail` 工作区栏 `w-32 → w-44` 且去掉名字 `truncate`，昵称 / 角色完整显示。

### 测试

- 后端新增 `NicknameFirstAuthTests` 6 例（免密直入 / 需二级验证 / 不存在可新建 / 绑密码后收紧 /
  绑邮箱 / 邮箱冲突），并更新 1 个旧断言；`apps.users` 23 例全过、全量 305 例 OK。
- E2E：UI 登录改两步 `uiLogin`；新增"昵称优先 → 一键新建 → 免密直接进入"用例；**15/15 全过**。
- 门禁：ruff / tsc / eslint / Django check 全绿；迁移在 Postgres 与 SQLite 双库应用成功。

### 边界与说明

- 免密账户无口令，故不适用防暴力锁定（无秘密可猜）；这是本地单机、数据不出设备的合理取舍。
- 桌面版加载的是 `dist/` 预构建前端——本轮已 `scripts/package.py` 重建，并对手工跑过迁移的
  SQLite 运行库应用了 `0002`，确保打包 App 反映新登录流。

---

## 追加 · 第 7 部分：角色切换卡顿排查（架构审计）+ 左上角本机日期

### 现象

用户反馈在「我 / 管理员 / 成员 / 只读」之间切换时有比较明显的卡顿，要求查底层架构是否冗余。

### 根因（analyze-code 审计定位）

「管理员/成员/只读」= 工作区**成员页的角色下拉**。它有三重叠加问题：
1. 受控 `<select value={m.role}>` 绑的是查询缓存值，改角色只发异步 PATCH、不更新本地值 →
   往返期间下拉**回弹**；
2. `disabled={roleMutation.isPending}` 用的是**整表共享**的 pending → 改一行把**所有行**下拉一起置灰；
3. `onSuccess` 直接 `invalidate(members)` → 整表 refetch。
三者叠加就是肉眼可见的"卡顿 + 闪"。

### 修复

- `useUpdateWorkspaceMemberRole` 改**乐观更新**：`onMutate` 立即把该成员 role 写进缓存
  （`cancelQueries` + `setQueryData`）、`onError` 回滚快照、`onSettled` 再 invalidate 校准。
- 下拉只锁"当前正在提交的那一行"（`variables?.memberId === m.id`），不再锁全表。
- 结果：改角色即时生效、不回弹、不灰全表。UI 视觉零改动。

### 架构级冗余（审计发现，建议单独排期，非本次卡顿主因）

- **[MEDIUM] 持久外壳被每页各自渲染**：`app/(protected)/layout.tsx` 只包 `AuthGuard`，8 个页面各自
  `return <AppShell>`。App Router 下换页会重挂页面 → 其内 TopBar/LeftRail/Aside/Footer 一并重建，
  跨页导航有"闪/重排"。建议把 `AppShell` 上提到 layout 常驻，各页用一个轻量 chrome store 声明本屏
  外壳配置（topbar/rail/hideAside）。属结构性改动、需回归 e2e。详见
  `docs/架构分析/前端架构冗余审计_20260928_175755.md`。
- **[LOW] `useUpdateProjectMemberRole` 同构**（暂无内联角色下拉，将来加需同样乐观更新）；
  **[LOW] Issue 列表 `staleTime: 0`**（每次进项目页 refetch，本地无妨，外壳上提后可收紧）。

### 左上角日期

`TopBar` 的 `mini · sheet 03 / 12` 改为**本机日历日期** `mini · YYYY.MM.DD`。渲染期读取 `new Date()`
并加 `suppressHydrationWarning`（首版用 `useEffect`+`setState` 被 `react-hooks/set-state-in-effect`
规则拦下，改渲染期读取更合规、无级联渲染）。

### 验证

- tsc 0 error；eslint 改动文件 0 error；Playwright E2E **15/15 全过**（含换页/登录）；
  `scripts/package.py` 重建 dist，桌面版加载新前端。

---

## 追加 · 第 8 部分：AppShell 上提到 layout 常驻（消除换页重挂）

### 目标

落地第 7 部分审计里那条 [MEDIUM] 冗余：8 个页面各自渲染 `<AppShell>`，换页时整块外壳
（TopBar/LeftRail/Aside/Footer）跟着卸载重挂。把外壳提到 `(protected)/layout` 常驻。

### 做法

- 新增 `stores/chrome.ts`：一个只存**原始值**的 zustand store（`topbar{workspace,project,role}`、
  `railCurrent`、`hideAside`）+ `useChrome(cfg)` 钩子。之所以不存 ReactNode —— 走查确认所有页面
  都 `hideAside`、右侧 Aside 无动态内容，无需把节点塞进 store。
- `app/(protected)/layout.tsx` 改为 `"use client"`，渲染 `AuthGuard → 常驻 AppShell → {children}`，
  AppShell 的 topbar/rail/hideAside 从 chrome store 读。
- 8 个页面：删掉 `<AppShell>` 外壳（改返回 `<>…</>`）+ 顶层调用 `useChrome({…})` 声明本屏外壳。
  依赖全是原始值 → 稳定不死循环；数据异步到位（如 `ws.data.name`）值变 → 外壳随之更新。
- 关键正确性：`setChrome` **整屏替换**而非浅合并，避免继承上一页残留（如从工作区页到 dashboard
  的 topbar 清空）。

### 权衡

硬刷新某个受保护页时，顶栏面包屑/角色会在页面 effect 跑后填充，理论上有一帧空档；但品牌字标、
WS 状态点、头像菜单是常驻的，顶栏不会"空"，只是面包屑晚一帧。相比每页重挂整块 chrome，这是净收益。

### 验证

- `AppShell` 现仅出现在 `layout.tsx`（页面全部解包）；tsc 0 error、eslint 0 error；
  Playwright E2E **15/15 全过**（覆盖跨页导航、登录、实时、抽屉）；`scripts/package.py` 重建 dist。

---

## 交付总览

1. 前端 + 后端 + 数据库**合并为一个原生窗口本地软件**（pywebview + 内嵌 SQLite），
   不再用浏览器打开；关窗干净停服。
2. 桌面**快捷方式** `Mini Plane.lnk` → 指向打包好的 `dist\MiniPlane\MiniPlane.exe`，双击即用。
3. 独立 `.exe` 由 `desktop/build.py` 可复现（`--portable` 可带运行时做成可分发目录）。
4. 修复 E2E「测试窗口」（14/14 全绿）+ P3C 质量收口。
5. 修复桌面版「闪退」（`webview.start` 非法参数 + 冻结版静默失败）+ 自定义应用图标。
6. UI 中文化走查：补齐 54 处 sans 功能文案，确认设计性英文沿用 Cormorant 衬线字体、整体协调。
7. 登录改造：昵称优先建号、免密直入、密码/邮箱在设置里自助绑定；后端三分支登录 + bind 端点；
   15/15 E2E、305 后端测试全过。
8. 修成员页角色切换卡顿（乐观更新 + 仅锁当前行）+ 左上角改本机日历日期；附前端架构冗余审计报告。
9. AppShell 上提到 `(protected)/layout` 常驻（chrome store + useChrome），8 页解包，消除换页重挂外壳；15/15 E2E。
