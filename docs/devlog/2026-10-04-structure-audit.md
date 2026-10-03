# 项目结构体检报告（2026-10-04）

> 用户提问：① 有没有过大的设计缺陷或安全性缺陷？② 是否简洁、轻量化？
> 方法：**只读测量**，不靠感觉。只统计我们自己的代码（排除 `.venv` / `node_modules` / `.next`）。

---

## 一、设计缺陷：巨文件检查

以 400 行为门槛扫描全部业务目录：

| 行数 | 文件 |
|------|------|
| 546 | `desktop/launcher.py`（启动器：起服务 + 建窗口 + 关窗口收尾，职责集中） |
| 522 | `frontend/components/issue/IssueDrawer.tsx` |
| 481 | `backend/apps/projects/tests.py`（测试，不算） |
| 476 | `frontend/app/(protected)/w/[slug]/projects/[pid]/page.tsx` |
| 428 | `frontend/features/issue/hooks.ts` |
| 402 | `frontend/components/issue/BulkActionBar.tsx` |

**结论：没有 god file。** 最大的 546 行还在可读范围，且 launcher 的集中是"启动流程"这一件事的天然聚合。

## 二、安全性

| 项 | 结果 |
|------|------|
| `DEBUG=True` 硬编码 | 仅 `config/settings/local.py`（**开发环境**）；`desktop` / `container` / `test` 全为 `False` ✓ |
| 硬编码 `SECRET_KEY` | 无（桌面版首跑随机生成存本机）✓ |
| `ALLOWED_HOSTS = ["*"]` | 无 ✓ |
| `csrf_exempt` / 关闭 CSRF | 我们自己的代码里 0 处 ✓ |
| `subprocess(..., shell=True)` | 我们自己的代码里 0 处 ✓ |
| 原始 SQL 拼接 | 仅 `benchmark_issues.py`（性能基准命令，参数是常量，无用户输入） |
| 服务绑定 | 桌面版 / 容器版都有明确的绑定地址，不是全网监听 |
| Agent 接口 | Token 只存 SHA-256 哈希；scope 白名单 5 项，**不含删除/成员/角色**；写操作强制 `Idempotency-Key` |
| 隐私泄漏 | 424 个跟踪文件扫描：令牌/密钥/绝对路径/真实口令/历史令牌 **全部 0 处**（详见 2026-10-03 记录） |

**结论：没有发现安全性缺陷。**

## 三、轻量化

**依赖：很轻 ✓**

- 后端 `requirements/base.txt`：**11 个**
- 前端：`dependencies` **15 个** + `devDependencies` 10 个
- 无组件库、无图标库（图标全部自绘 SVG）、无状态管理之外的重依赖

**磁盘占用：问题在缓存，不在架构**

| 目录 | 体积 | 说明 |
|------|------|------|
| `frontend/node_modules` | **2.79 GB** | 其中 `.pnpm` 存储 2.45 GB、`@fontsource` 字体 **161 MB**、`next` 176 MB |
| `frontend/.next` | 0.87 GB | 构建缓存，可随时重建 |
| `backend/.venv` | 0.22 GB | 正常 |
| `dist` | 1.17 GB | 其中 `.build-frontend` 0.83 GB 是打包临时目录 |
| **系统 TEMP** | **约 5.9 GB** | 7 个 `miniplane-build-*` 残留，每个 0.85 GB |

**结论：架构与依赖是轻的；"变重"全是**构建缓存与残留**造成的，可以清。

## 四、发现的一个真实可改进点

`node_modules` 里 `@fontsource` 占 **161 MB** —— 字体包默认会带上所有字重与子集。
本项目只用了少数几种（Cormorant Garamond / Inter / JetBrains Mono / 思源系列），
上次为了给 Lighthouse 提分已删掉零使用的 Cormorant 600，但**依赖目录里仍躺着全部字体文件**。
建议：后续改用按字重精确引入（`@fontsource/inter/400.css` 这种），或迁移到自托管精简字体子集。
（本次不动，属于优化项，列入技术债。）

## 五、本次体检的元发现

第一次扫描时几乎所有"⚠️"都命中在 `.venv/site-packages`（django-cors-headers、twisted、bottle、pip…），
那是**第三方库自己的代码**，不是我们的问题。**安全扫描必须先排除依赖目录**，否则全是噪音。
