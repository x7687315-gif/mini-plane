# 桌面版热修报告 · 工程详情 404 / Island 白屏 / 新建任务入口

> 2026-10-25 · 用户实测桌面版报告的三个问题的根因与修复。数据**无任何丢失**。

## 1. 「点进详细目标什么都没有了」——根因与修复

**结论：前端、后端、数据库都没有丢数据——是路由层的一个字符集坑。**

根因链（全部有实证）：

1. 桌面版组成 = **仓库实时后端**（launcher 的 `repo_root()` 优先选带 `.venv` 的仓库根）
   + **打包时的前端**（`dist/MiniPlane/app`，10-17 构建 → 旧界面）。
2. 你的真实工作区 slug 是 **`mini-plane-北归`（含中文）**——它早于 slug 格式校验进入数据库。
3. Django 的 `<slug:>` 路由转换器正则是 `[-a-zA-Z0-9_]+`，**不接受中文** →
   所有 `/api/v1/workspaces/mini-plane-北归/…` 请求在 URL 解析层 404，
   项目详情整棵子树失联。实证：列表接口（URL 无 slug）200；带 slug 详情 404；
   ORM 层 `resolve_workspace` 返回 (workspace, 20) 完全正常——问题精确夹在路由解析层。
4. 这个坑 `scripts/import_progress.py`（10-03）就有记录，浏览器开发模式
   （Postgres，ASCII slug）永远不触发，所以只在桌面版炸。

修复（三层）：

| 层 | 动作 |
|---|---|
| 数据 | slug 归一 `mini-plane-北归` → `mini-plane-beigui`（ORM 修改；库已先备份到 `runtime/backups/miniplane-20261025-105157.sqlite3`） |
| 路由（防御） | workspace 作用域全部 `<slug:workspace_slug>` → `<str:workspace_slug>`（8 处，含 WS）——任何遗留库的怪 slug 都能到达视图，鉴权/防枚举语义不变；新写入仍走 ASCII 校验 |
| 验证 | 归一后 `GET /api/v1/workspaces/mini-plane-beigui/` → 200；数据核对：MP 工程 16 任务 / 2 日志 / 5 阶段全在，owner 回填正确 |

外部佐证（github-preflight，双源同因同修）：
[Django Forum：slug 转换器不匹配 Unicode](https://forum.djangoproject.com/t/slug-with-multiple-languages/26337)、
[Stack Overflow：Unicode slug 404](https://stackoverflow.com/questions/74628492/django-gives-me-error-404-when-i-try-to-use-unicode-urls)；
标准修法即 `[^/]+`/`<str:>`（[Adam Johnson：custom path converter](https://adamj.eu/tech/2025/08/01/django-custom-url-converter-string)）。

## 2. Island 白条（悬浮窗打不开）

同根：桌面版前端是 10-17 旧构建（早于 Island V3 之后的多轮改动），与新后端的数据形状（progress 0-100、workspace_slug 可空）不匹配而渲染异常。**已用 `scripts/package.py` 重建前端 standalone 并同步进 `dist/MiniPlane/app`**（BUILD_ID `cOMz5qxz…`），独立 node 起服冒烟 `/login` `/island-panel` `/` 全部 200。**重启桌面 App 即生效**（后端本就来自仓库，无需重打 exe）。

## 3. 新建任务入口

- 桌面版此前跑的是旧界面（CreateIssueModal 大表单）——观感复杂是旧实现的。
- 新工程台已改为：列表末尾 `＋ 新任务` 空白横线就地输入；本次又按反馈在**任务区头部加了 `＋ 新任务` 加达按钮**（与底部横线共用同一输入）。
- 随前端刷新生效。

## 4. GitHub CI / PR

- PR #2/#4/#5 均已被合并进 main（至 01ada4b）；PR #5 曾在 9677e91 红过一次
  （ruff format 门禁），修复于 01ada4b 后双 job 绿。当前无红灯。
- 本热修将以新 PR 提交（slug 路由 + 新任务入口 + 本报告）。

## 操作清单（用户侧）

1. 重启桌面 App（关掉 MiniPlane 窗口 → 重新双击）——后端与前端都会用新版。
2. 工作区入口不变（侧栏「MINI PLANE 开发」）；旧链接若带中文 slug 会 404，属预期
   （数据已换 ASCII slug），从首页/侧栏进入即可。
3. 若要分发给别的机器：`dist/mini-plane-1.0.0-local-20261025-105500/` 是最新全量产物。
