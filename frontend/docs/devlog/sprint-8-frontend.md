# Sprint 8 开发日志：Docker + CI + 收尾（前端 · 最后一个 Sprint）

- 日期：2026-09-17
- 执行人：前端（beigui）
- 对应计划：[FRONTEND_ROADMAP.md](../../FRONTEND_ROADMAP.md) §Sprint 8
- 依赖：Sprint 7（WebSocket Realtime）已合入 `main`
- 发布：[docs/releases/v0.2.0.md](../../../docs/releases/v0.2.0.md)

---

## 一、这次做了什么

前七个 Sprint 都在往界面里加东西；这个 Sprint 把它**装进盒子、接上闸门、写清说明书**。

1. **`frontend/Dockerfile`**：多阶段 `deps → builder → runner`，用 Next 的 standalone 产物，
   非 root 运行，带 healthcheck。
2. **`frontend/.dockerignore`**：必须有的一个文件（理由见 §2.2）。
3. **`next.config.ts`**：`output: "standalone"` + 显式 `typescript.ignoreBuildErrors: false`。
4. **`docker-compose.yml`**：新增 `frontend` 服务；顺带给 `web` 补上缺失的 healthcheck
   （见 §2.3）；默认 CORS/CSRF 白名单补 `127.0.0.1:3000`。
5. **`.github/workflows/ci.yml`**：新增 `frontend` job（lint → typecheck → test → build
   + standalone 产物断言），与本地"四绿"一一对应。
6. **`ARCHITECTURE.md`**：从"（后端部分）"扩成"（全栈）"，补 §7 前端请求链路 +
   §8 前端目录速查 + 容器拓扑表加 `frontend` 行。
7. **`README.md`**：进度表收口、前端容器两个坑（构建期常量 / 必须用 localhost）。
8. **`docs/releases/v0.2.0.md`**：前端 MVP 发布说明。
9. **收尾盘点**：把七个 Sprint 欠的账集中列进 §六，并给出客户端体积的**实测数据**。

## 二、怎么做的（关键实现说明）

### 2.1 为什么必须 `output: "standalone"`

不做这件事，runner 阶段就得 `COPY --from=builder /app/node_modules ./node_modules` ——
实测这个目录是 **518 MB**（含构建期依赖、TypeScript、Tailwind、ESLint 全家桶）。

`standalone` 让 Next 追踪服务端真正 import 的模块，产出一个自包含目录：

| | 体积 |
|---|---|
| `node_modules`（完整） | 518 MB |
| `.next/standalone`（运行时实际需要的） | **22 MB** |

代价是入口从 `next start` 变成 `node server.js`，所以 `CMD` 与 healthcheck 都要跟着改。
另外 **standalone 输出的 `.next/static` 与 `public/` 不在 standalone 目录里**，
必须单独 COPY 两份 —— 漏掉任一个的表现是"页面能开但没有样式 / 图片全 404"，
这种错误在 `docker build` 时不会报，只在浏览器里才看得见。

### 2.2 `.dockerignore` 不是可选项

builder 阶段的顺序是：

```
COPY --from=deps /app/node_modules ./node_modules
COPY . .                                    ← 如果宿主机的 node_modules 在 context 里
```

第二行的 `COPY . .` 会**把宿主机的 `node_modules` 覆盖到** Linux 装好的那份上。
在 Windows 上它是一堆 pnpm 符号链接，进容器后全部指不到东西 ——
构建会失败，而报错信息看起来像"源码有问题"。

所以 `.dockerignore` 里的 `node_modules` 和 `.next` 是硬需求，不是优化。

### 2.3 顺带发现：`web` 服务没有 healthcheck

加 `frontend` 服务时我写了：

```yaml
depends_on:
  web:
    condition: service_healthy
```

但 `web`（HTTP API）**原本没有 healthcheck** —— 只有 `asgi` 有。
`docker compose` 对这种配置会直接报错（依赖服务没有可用的探活指令），
也就是说"前端等后端就绪再起"这件事原本根本表达不出来。

补上了 `web` 的 healthcheck（打 `/api/v1/health/`，与 asgi 同款）。
这是**后端的缺口**，但由前端这一侧的需求暴露出来 —— 记在这里，免得下次又只改一半。

### 2.4 `check_compose.py` 是这次的安全网

仓库里已经有一个后端写的结构校验脚本 `backend/scripts/check_compose.py`（v0.1.0 的产物），
它同时校验 `docker-compose.yml` **和** `ci.yml`。

本机没有 Docker，`docker compose config` 跑不了，所以：

1. 先自己用 PyYAML 做了结构校验 + `depends_on` 前向引用检查
   （专门检查"要求 `service_healthy` 的目标是否真配有 healthcheck"—— 就是 §2.3 那个坑）；
2. 再跑仓库自带的 `check_compose.py`：**全部通过**。

这是本 Sprint 最有价值的一次复用：**没有重复造校验器**。
（顺带说明：`check_compose.py` 需要从 `backend/` 目录下运行，它用的是相对路径 `../docker-compose.yml`。）

### 2.5 `NEXT_PUBLIC_*` 是构建期常量，不是运行时配置

Next.js 会把 `NEXT_PUBLIC_*` 在**构建期**内联进客户端 bundle（它们本来就是"公网可见"的常量，
不是密钥）。所以：

- compose 里走 `build.args` 而不是 `environment`；
- 改后端地址必须 `docker compose build frontend` 重新构建，改环境变量毫无作用。

这是本项目最容易误解的一处，所以在 `Dockerfile` 头、`docker-compose.yml` 头、
`README.md` 前端章节**三处都写了**。重复是有意的 —— 一个会导致"我明明改了配置为什么没生效"
的坑，值得说三遍。

### 2.6 必须用 `localhost:3000` 打开

Session Cookie 与 CSRF 都按**来源**校验，而后端默认白名单原本只有 `http://localhost:3000`。
浏览器眼里 `localhost:3000` 和 `127.0.0.1:3000` 是**两个不同来源**（即使解析到同一个地址），
于是用后者打开会得到 CORS / CSRF 报错。

两边都处理了：

- compose 的默认 `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS` 补上 `127.0.0.1:3000`，
  让两种写法都能用；
- 文档里仍然推荐 `localhost`，并说明原因（而不是让大家去猜）。

### 2.7 CI 与本地四绿一一对应

```
本地                      CI step
pnpm lint          →      ESLint
pnpm typecheck     →      类型检查（tsc --noEmit）
pnpm test          →      单元测试（node --test）
pnpm build         →      生产构建（next build）
                          + 校验 standalone 产物存在（test -f .next/standalone/server.js）
```

最后一个 step 是刻意加的：**standalone 产物缺失这种错误，CI 的 build 步骤不会报**
（`next build` 成功但产物路径不对），而 Dockerfile 会在 `COPY` 时失败 ——
那个失败发生在 Docker 构建里，本 job 看不到。所以提前在这里断言一次。

`pnpm install --frozen-lockfile` 同理：lockfile 与 `package.json` 不一致时直接红，
而不是"顺手更新一下 lockfile"把依赖漂移悄悄带进 main。

**关于必需状态检查**：`main` 的 branch protection 目前只把后端的 job 列为必需。
要让前端也变成合并门槛，需要去 GitHub 的 Rules 里把
`frontend（lint + 类型 + 单测 + 构建）`加上（管理员操作，见 §六）。

### 2.8 Lighthouse：给数据，不给一个误导性的分数

验收项写的是"Lighthouse 评分 ≥ 90"。**我没有测**，理由要说清楚：

Lighthouse 需要一个能访问的站点。本机没有后端、没有 Docker，唯一能起来的是 `/login`
（一个只有表单的静态页）。给它的分数会被写成"这个前端的 Lighthouse 分数" ——
而那根本不是用户实际停留的页面（列表页 / 抽屉都在鉴权之后，且需要真实数据）。

用一个不可能低的页面的分数去满足一条验收项，是自欺。所以改成给**能客观测的东西**：

| 项 | 原始 | gzip |
|----|------|------|
| JS 分块合计 | 985 KB | **275 KB** |
| CSS | 54 KB | — |
| `.next/static` 合计 | 2.9 MB | — |

外加一条结构上的事实：**首屏是 SSR 出来的壳**（字体 / 网格 / 骨架屏），
业务数据由客户端请求后填充，所以 LCP 主要由壳决定，而壳里没有图片、没有第三方脚本、
字体是 `@fontsource` 自托管（无 Google Fonts CDN 往返）。

真正的 Lighthouse 跑法已经写进 §六 的联调清单；在有完整栈的机器上一条命令的事。

### 2.9 收尾盘点：把欠账集中写下来

七个 Sprint 攒了 5 笔账，全部汇总到 §六（并且同步进了 `v0.2.0` 发布说明的"已知边界"）。
集中在最后写一次，比散落在 8 篇 devlog 里更可能被读到。

**每篇 devlog 的验收表里，凡是没有实测的都标了 ⚠️ 或 ⬜ 并写了原因** ——
这是这套日志最想保住的性质：翻任何一篇，都能立刻知道"哪些是真的验过"。

## 三、踩坑

### 坑 1：Next 16 删掉了 `NextConfig` 的 `eslint` 字段

我给 `next.config.ts` 写了：

```ts
typescript: { ignoreBuildErrors: false },
eslint: { ignoreDuringBuilds: false },     // ← TS2353: 'eslint' does not exist in type 'NextConfig'
```

构建直接红。查下来是 Next 16 移除了 `eslint` 这个 key（`next lint` 也在弃用路径上）。

**真正的后果比报错本身重要**：既然配置项没了，说明 **`next build` 不再运行 ESLint**。
所以 CI 里那个独立的 `ESLint` step **不是冗余**，而是整个 CI 里 lint 唯一的执行点。
这一点写进了 `next.config.ts` 的注释 —— 否则未来有人会觉得"build 里已经带了 lint，
这个 step 可以删"。

### 坑 2：`COPY . .` 会覆盖依赖层（没有 .dockerignore 时）

见 §2.2。这个坑的可怕之处在于**报错信息指向错误的方向**：
构建失败看起来像源码/依赖问题，实际是"宿主机的 node_modules 被复制进来了"。
而本机没有 Docker，理论上要等到有 Docker 的机器才会发现 ——
所以是写的时候按经验提前规避的（`pnpm` 在 Windows 的符号链接问题在 Sprint 4 已经踩过，
这次是同一个根因换了战场）。

### 坑 3：`check_compose.py` 的相对路径

第一次直接 `python backend/scripts/check_compose.py` 报 `FileNotFoundError: ../docker-compose.yml`，
因为它用的是相对路径，必须在 `backend/` 目录下运行。

不是大事，但值得记：**脚本的"工作目录假设"没有写在使用说明里**。
本次没有去改它（改脚本会影响后端同学的既有用法），而是在 devlog 里写明命令。

## 四、验收清单（按 FRONTEND_ROADMAP.md §2 Sprint 8 DoD）

| 验收项 | 结果 |
|--------|------|
| 前端 Dockerfile（多阶段：deps → builder → runner） | ✅ 含非 root 用户 + healthcheck；**未在真实 Docker 里构建**（本机无 Docker） |
| `docker-compose.yml` 加入 frontend 服务 | ✅ 结构校验通过（自写检查 + 仓库自带 `check_compose.py` 双验） |
| GitHub Actions：frontend job（lint → typecheck → test → build） | ✅ 四步 + standalone 产物断言；**未在真实 runner 上跑过**（需推送后才能观察） |
| Playwright CI（headless） | ⬜ 未做（E2E 基建未落地，见 §六） |
| README 前端章节 | ✅ 含 compose 两个坑（构建期常量 / localhost） |
| ARCHITECTURE.md 前端部分（请求链路图） | ✅ §7 请求链路 + §8 目录速查 + 拓扑表 |
| v0.1.0 tag + GitHub Release notes | ✅ 以 `v0.2.0` 交付（后端 v0.1.0 已存在，本版是前端 MVP） |
| Lighthouse 评分 ≥ 90 | ⚠️ **未实测**（无完整栈；改为给出 bundle 体积实测数据 + 跑法，见 §2.8） |
| `docker compose up` 全栈启动 | ⚠️ 未实测（本机无 Docker）；结构校验通过 |
| CI 拦截不合格 PR | ✅ 本地四绿 + 13 个 CI step 已就位；**branch protection 需把 frontend job 加为必需**（见 §六） |
| README / API.md / ARCHITECTURE.md 三问可答 | ✅ 三份文档均已覆盖"请求穿过哪些层 / 变更如何产生留痕+推送+任务 / 前端链路" |
| `tsc --noEmit` | ✅ 零错误 |
| ESLint | ✅ 零 error 零 warning |
| 单元测试 | ✅ `pnpm test` → **98/98**（19 suites） |
| `next build` | ✅ 成功，11 条路由；standalone 产物 22 MB |

## 五、产出文件清单

新增：

```
frontend/Dockerfile                    # 多阶段；standalone runner；非 root
frontend/.dockerignore                 # 必须（防 COPY . . 覆盖依赖层）
docs/releases/v0.2.0.md                # 前端 MVP 发布说明
frontend/docs/devlog/sprint-8-frontend.md   # 本文件
```

改动：

| 文件 | 改了什么 |
|------|---------|
| `frontend/next.config.ts` | `output: "standalone"`；`typescript.ignoreBuildErrors: false`；记录 Next 16 无 `eslint` 字段的后果 |
| `docker-compose.yml` | 新增 `frontend` 服务（build.args 传 `NEXT_PUBLIC_*`）；**给 `web` 补 healthcheck**；CORS/CSRF 默认值补 `127.0.0.1:3000` |
| `.github/workflows/ci.yml` | 新增 `frontend` job（9 步） |
| `ARCHITECTURE.md` | 标题改"全栈"；§0 说明前端边界；§5 拓扑表加 frontend；**新增 §7 前端请求链路 + §8 前端目录速查** |
| `README.md` | 进度表收口；前端章节补 compose 两个坑 |
| `frontend/docs/README.md`、`frontend/FRONTEND_ROADMAP.md` | Sprint 8 状态与四绿数字 |

## 六、收尾盘点：留给二期的账

按"影响面 × 需要的环境"排序。**前三条都是同一个根因：本机没有可跑的后端。**

### 1. 端到端验收（最大的账）

需要 Postgres（本地或 Docker）+ 后端进程；实时推送部分还需要 Redis channel layer。
以下是七个 Sprint 攒下来的、写了 ⚠️/⬜ 的端到端项：

| Sprint | 待验项 |
|--------|--------|
| 1 | 注册 → 自动登录 → 显示用户名 → 登出 → 重定向 |
| 3 | 创建 Issue → 列表出现 → 改状态 → 刷新保持 |
| 4 | 创建评论 → 时间线出现 → 编辑评论 → 时间线**不**增加条目 |
| 5 | 应用 filter → 复制 URL → 新窗口打开 → filter 一致；5000 条首屏 |
| 6 | 多选 3 个 issue → 批量改标签 → 列表与详情都更新 |
| 7 | A 改 issue → B 自动收到；B 断网 30s → 恢复 → 全量刷新；4401 跳登录 |

建议做法：在有 Docker 的机器上 `docker compose up --build -d`，
按上表逐条走一遍，把结果回填进对应 devlog 的验收表（那几张表的空行就是为这个留的）。

### 2. E2E 与组件测试

`tests/` 目前是"纯函数 + 契约映射表"的零依赖测试（98 例），**不是完整的测试金字塔**：

- 组件测试需要 JSX 转换 → 需要迁到 Vitest；
- 迁移的前置是解决 **pnpm 在 Windows 的符号链接问题**（Sprint 4 记过：
  `.npmrc` 加 `node-linker=hoisted` 是已知解，但要连 CI / Dockerfile 一起改，属于项目级决策）；
- E2E（Playwright）在 CI 里跑最合适，位置已经在 `frontend` job 的结构里留好了。

### 3. Lighthouse

在完整栈上：

```bash
docker compose up --build -d
npx lighthouse http://localhost:3000/login --view          # 公开页
# 受保护页需要带 session cookie，可用 --extra-headers 或先在浏览器登录后用 DevTools 的 Lighthouse
```

### 4. 需要产品决策的

- **批量失败的重试入口**（Sprint 6 留）：把失败的 id 留在操作条里，给一个 `retry failed`。
- **`docs/assets/` 换成真实截图**：Sprint 3 起就欠着；现在 `src/*.html` 是视觉稿，
  真实截图需要起后端 + 造数。
- **契约 09（前端接入手册）回填**：它说"卡住的地方回填到 §十 常见坑"——
  前端全程确实踩到过几处（尾斜杠、端口差异、`NEXT_PUBLIC_*` 构建期、CSRF 自愈），
  应该回填进去；属于文档维护，不是代码。

### 5. 项目治理（管理员动作）

- 把 `frontend（lint + 类型 + 单测 + 构建）` 加进 `main` 的必需状态检查
  （现在只有后端 job 是必需的，前端红着也能合）。
- 前端 Sprint 0–3 的 devlog 里"当时的四绿"没有测试那一项（当时还没有测试）。
  README 的进度表已经标注，不必回改历史日志。

## 七、结语（前端部分）

Sprint 0–8 全部完成。8 份契约冻结，98 条单测，11 条路由，四绿稳定。
这一版最想留给后人的不是功能清单，而是**8 篇 devlog 里那些标了 ⚠️ 的行** ——
它们准确说明了这个项目验过什么、没验过什么。
二期第一件事应该是把那些 ⚠️ 变成 ✅，而不是接着加功能。
