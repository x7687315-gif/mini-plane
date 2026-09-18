# 前后端集成验收 + 二期 5 笔账（前端）

- 日期：2026-09-18
- 执行人：前端（beigui）
- 前置：前端 Sprint 0–8 完成，tag `v0.2.0`；本文是**发布之后**的集成验收
- 目标：把前端与后端真正接起来跑通，并结清 `sprint-8-frontend.md §六` 留下的 5 笔账

---

## 一、环境前提（这次能真做的原因）

`v0.2.0` 发布时"端到端验收全部未做"的唯一理由是：**本机没有可跑的后端**。
这次先做环境侦察，发现这个前提不成立：

| 项 | 结论 |
|----|------|
| PostgreSQL | **已安装 16.15，且 5432 正在监听** |
| 数据库 | `miniplane` 库**已存在且已迁移**（22 张表） |
| 后端 venv | `backend/.venv` 可用，`.env` 齐备 |
| Docker | 无（仍然）—— 但这次不需要它 |
| Chrome | 已安装 → Playwright 用 `channel: "chrome"`，**零浏览器下载** |

于是后端 `runserver`（daphne 接管 HTTP+WS）、前端 dev server 都跑起来了。
**结论：过去八个 Sprint 里所有标 ⚠️/⬜ 的端到端项，本机一直是可验的** ——
只是当时假设了"必须有 Docker"。这是本次最有价值的元发现。

## 二、三条验证通道

### 2.1 后端冒烟（复用既有资产，54/54）

仓库里本来就有 `backend/scripts/smoke_backend.py`（401 行，覆盖 Sprint 3–5 主链路，
真 HTTP + Session + CSRF，幂等且自清理）。**直接跑，没有另写一个**：

```
✅ 后端冒烟全部通过（54 步）
```

其中直接关掉的历史疑问：

| 步骤 | 覆盖的验收项 |
|------|-------------|
| 10 / 15 / 24 | 非法 ordering / priority / page → 400 且文案与契约一致 |
| 13–20 | 过滤（state/priority/labels/assignee=me）+ 搜索 + 组合 AND |
| 22 / 23 | priority 按严重度排序；page 越界 → 200 + 空 results |
| 34 / 35 / 51 | 评论权限矩阵：Admin 可改他人 / 非作者 Member 403 / 非作者删 403 |
| 38 / 53 | 时间线含 issue/comment 事件；**评论删除后历史仍在** |
| 45 | Project 缓存无陈旧窗口（PATCH 后立即 GET 拿到新值） |
| **47–49** | **异步批量改标签：202 → success → 标签被覆盖** ← Sprint 6 的核心 ⚠️ |

### 2.2 实时链路（新增 `backend/scripts/smoke_realtime.py`）

`smoke_backend.py` 不覆盖 WebSocket —— 而那正是 Sprint 7 最大的 ⚠️（Channels 的
consumer 测试用 `WebsocketCommunicator` 在进程内直连，验不到真 TCP + 真 Cookie）。
所以补了一个脚本：真 daphne + 真 WebSocket + 真 Session Cookie。

| 验证项 | 结果 |
|--------|------|
| 握手确认帧 `{"event":"connected","payload":{project_id, role}}` | ✅ role=15 |
| 心跳 `ping → pong` | ✅ |
| 协议外消息 → error 帧且**连接不断** | ✅ |
| `issue.updated`：A 用 HTTP 改状态 → B 在 WS 上收到，载荷是展示用 diff | ✅ `{"state":"Done"}` |
| `comment.created`：B 发评论 → A 收到正文与作者摘要 | ✅ |
| 非成员 → 关闭码 **4404** | ✅ |
| 无会话 → 关闭码 **4401** | ✅ |

依赖只有 `websockets`（本地脚本用，不进 requirements）。

### 2.3 浏览器 E2E（新增 `frontend/tests/e2e/`，13/13）

Playwright，`channel: "chrome"` 复用本机 Chrome，`storageState` 复用登录态。
**不 mock 后端** —— 这套用例的价值就在"前端 ↔ 真后端"这层契约。

```
13 passed (1.7m)
```

| spec | 覆盖 | 结果 |
|------|------|------|
| `auth.spec.ts` | 未登录跳登录；注册→自动登录→顶栏显示用户名→登出→回登录页→再访问仍被弹回；`?redirect=` 回跳 | ✅ 4 |
| `issue-thread.spec.ts` | 新建 Issue→出现在列表→改状态→**刷新后保持**；评论→时间线+1；**编辑评论→时间线条目数不变**；关抽屉后 URL 不留 `issue`/`tab`；勾选→操作条出现 | ✅ 5 |
| `filter-bulk.spec.ts` | 搜索写进 URL→**新页面打开同一 URL，筛选一致**；非法 ordering 被静默丢弃；多选 3 个→批量改标签→**列表与抽屉都更新** | ✅ 3 |
| `realtime.spec.ts` | **B 停在列表零交互，A 在另一个浏览器窗口改状态 → B 自动更新**；非成员得 404 | ✅ 2 |

其中三条最有分量的：

- **`编辑评论 → 时间线条目数不变`**：06 契约「有意不记录的事件」里最容易被写坏的一条，
  只能靠"改完看计数变没变"来验。
- **`A 改 → B 自动更新`**：B 全程不刷新、不点击。如果前端没有 WebSocket，这条必然红 ——
  所以它能真实区分"推送生效"和"恰好也刷新了"。
- **`复制 URL 到新页面`**：Sprint 5 说"URL 是唯一事实来源"，这条是它唯一的证明。

## 三、★ 找到并修复的真 bug：host 不一致导致所有写请求 403

**这是本次集成验收最重要的产出。**

### 现象

E2E 第一次跑：9 个用例失败，页面快照显示**停在登录页** —— 明明登录成功了。
检查 `storageState`：**0 个 cookie**。

### 根因（两段，同一根）

`.env.example` 把 API 默认成 `http://127.0.0.1:8000`，而页面在 `http://localhost:3000`。
两个地址**不是同一个 host**：

1. 后端 `SESSION_COOKIE_SAMESITE = "Lax"`（`backend/config/settings/base.py:150`）。
   `localhost` → `127.0.0.1` 属于**跨站**，浏览器不会把会话 cookie 附在 fetch 上。
2. **更致命**：`csrftoken` cookie 落在 `127.0.0.1` 域上，而 `lib/api.ts` 的
   `getCsrfToken()` 读的是 `document.cookie`（当前页面域，即 `localhost`）
   → **恒为空字符串** → 所有 POST/PATCH/DELETE 都拿不到 CSRF 令牌
   → `lib/api.ts` 的 403 自愈会重取 `/auth/csrf/`，但新 cookie 仍然落在 127.0.0.1
   → 重放依旧 403。**死循环。**

也就是说：**按文档的默认配置，在真实浏览器里前端一个写操作都做不成**
（登录、建 Issue、改状态、发评论、批量操作全部不可用）。读操作看起来正常，
所以"页面能打开、列表能显示"会让人以为一切正常。

### 为什么之前没发现

八个 Sprint 的后端 277 个测试 + 冒烟脚本都是 **Python HTTP 客户端**，
它们不执行浏览器的 cookie 策略；而前端从未在真实浏览器里跑过端到端（一直标 ⚠️/⬜）。
**两边的测试都绿，接起来是坏的** —— 这正是"端到端验收"不能省的原因。

### 修复

| 位置 | 改动 |
|------|------|
| `lib/api.ts` | 兜底默认 `http://127.0.0.1:8000` → `http://localhost:8000`（附根因注释） |
| `features/realtime/hooks.ts` | 同上，`ws://localhost:8000`（否则 WS 握手带不上 cookie → 4401） |
| `frontend/.env.example` | 默认值与说明 |
| `docker-compose.yml` | `build.args` 的默认值同样改 localhost |

端口不同不影响（SameSite 只看 host），所以 `localhost:3000` → `localhost:8000`
是同站跨源，cookie 正常；`document.cookie` 也能读到 `localhost` 域的 `csrftoken`。

修完立刻见效：`storageState` 从 0 个 cookie 变成 2 个
（`csrftoken` httpOnly=False + `sessionid` httpOnly=True，域均为 `localhost`），
E2E 从 4/13 变 13/13。

### 顺带修掉的第二类问题：假绿断言

`global.setup` 原本断言"登录后离开 `/login`"。实际登录失败时，URL 会先短暂变成 `/`
再被 AuthGuard 弹回 `/login`，而**自动重试的断言正好抓到那个中间态** → **假绿**。
改成断言"顶栏出现用户名"（只有真拿到会话才会渲染）。

同类问题还在活动计数上：我最初"读一次 `innerText` 再比较"，而失效重取期间
`count` 会瞬时为 0，断言在错误的时机通过。改成 `expect.poll` 轮询到目标值。

**教训**：E2E 里所有"读一次快照再判断"的写法都是在赌时序；
应该要么用会重试的断言，要么轮询到稳定值。

## 四、环境改造：终于能装前端依赖

E2E 需要 `@playwright/test`，而 Sprint 4 记录过 pnpm 在 Windows 上装新依赖失败
（`UNKNOWN: unknown error, symlink`）。

按调研结论，新增 `frontend/.npmrc`：

```ini
package-import-method=copy   # ← 本次实测生效的就是这一条
node-linker=hoisted          # 本次未真正切换（增量安装保留了既有布局），留作重装时的保险
```

改造后 `pnpm add -D @playwright/test` 与 `-D lighthouse` 均成功。
**四绿回归通过**（test 98 / tsc / eslint / build），没有破坏已发布的东西。

> 这两条是项目级设置，随仓库走：CI 与 Dockerfile 的 `pnpm install --frozen-lockfile`
> 会自动继承，不需要各自加参数。代价是 node_modules 变大、安装稍慢。

## 五、Lighthouse（生产构建，真实受保护页面）

**关键前提**：必须对**生产构建**测。对 dev server（Turbopack）测毫无意义 ——
同一页面实测：

| 环境 | performance |
|------|-------------|
| `next dev` | **34**（不算数：未压缩、按需编译、React 开发版） |
| `next start`（standalone 生产构建） | **79** |

生产构建下、**登录后的真实 Issue 列表页**（不是登录页，因为受保护页才有意义）：

| 类别 | 分数 | 目标 |
|------|------|------|
| performance | **79** | 90 ❌ |
| accessibility | **96** | — |
| best-practices | **100** | — |

指标：FCP 1.1s · LCP 3.4s · TBT 440ms · CLS 0.096 · SI 1.1s

### 性能 79 的诚实结论

**没达标**，且这次能给出具体方向（都是实测数据指出的，不是猜）：

1. **TBT 440ms** —— 主线程被 JS 占用。首屏是"SSR 壳 + 客户端取数"，
   React Query / zustand / date-fns 都在客户端解析；
2. **LCP 3.4s** —— 壳里的字体是关键路径：`globals.css` 用 `@import` 引了
   **10 个 `@fontsource` CSS**（Cormorant 4 字重 + 3 斜体、Inter 2、JetBrains Mono 1），
   `@import` 是串行的，会推迟首屏文字渲染；
3. CLS 0.096 —— 骨架屏切换到真实行的位移。

**下一步的最低成本动作**：把 `@import` 改成 `next/font`（自托管 + 预加载 + 只引实际用到的字重），
并把 Cormorant 的斜体字重收敛。预期能同时改善 LCP 与 TBT。

本次**没有**做这个优化：它属于新的工作项，而不是"结账"。记在这里作为明确的待办。

## 六、5 笔账的逐条结算

| # | 账 | 状态 | 依据 |
|---|----|------|------|
| 1 | **端到端验收**（登录闭环 / 评论时间线 / 批量改标签 / A→B 实时） | ✅ **结清** | 后端冒烟 54/54 + 实时冒烟 7 项 + E2E 13/13；并**修掉了它挖出的 host bug** |
| 2 | **E2E 与组件测试** | 🟡 **一半** | E2E 落地（13 用例，可进 CI）；**组件测试仍未做**（需 Vitest，本次只解决了 pnpm 安装这个前置） |
| 3 | **Lighthouse ≥ 90** | 🟡 **已测未达标** | 真数据 79/96/100；候选原因与下一步已列（§五） |
| 4a | 批量失败的重试入口 | ⬜ 未做 | 仍是 Sprint 6 记的那笔 |
| 4b | `docs/assets/` 换真实截图 | 🟡 **可做了** | 前置（能跑栈）已具备，本次未做（预算花在验收与修 bug 上） |
| 4c | 契约 09 回填常见坑 | ⬜ 未做 | 但本次踩到的坑已全部记录在案，回填素材就绪 |
| 5 | branch protection 加 frontend job | ⬜ 未做 | **管理员动作**，需要仓库 Rules 权限；CI 配置本身已就位 |

**合计**：1 笔完全结清，3 笔有实质推进（其中 1 笔挖出并修复了发布级 bug），3 项仍未动。

## 七、产出文件清单

新增：

```
backend/scripts/smoke_realtime.py          # 真 WebSocket 端到端冒烟（7 项）
frontend/.npmrc                            # pnpm 安装配置（Windows 能装依赖的前提）
frontend/playwright.config.ts              # channel: chrome（零浏览器下载）
frontend/tests/e2e/
├── global.setup.ts                        # 重置数据 + 建账号/项目 + 保存登录态
├── helpers.ts                             # API 造数（含 CSRF 自愈）
├── auth.spec.ts                           # 4 用例
├── issue-thread.spec.ts                   # 5 用例
├── filter-bulk.spec.ts                    # 3 用例
└── realtime.spec.ts                       # 2 用例
frontend/.env.local                        # 本地地址（git-ignored）
frontend/docs/devlog/integration-verification.md   # 本文件
```

改动：

| 文件 | 改了什么 |
|------|---------|
| `frontend/lib/api.ts` | **修 bug**：默认地址 127.0.0.1 → localhost（附根因注释） |
| `frontend/features/realtime/hooks.ts` | **修 bug**：WS 默认地址同上 |
| `frontend/.env.example` | 默认值 + 一段"为什么必须同 host"的说明 |
| `docker-compose.yml` | `NEXT_PUBLIC_*` 默认值改 localhost |
| `frontend/.gitignore` | 排除 `.auth/`、`playwright-report/`、`test-results/` |
| `frontend/package.json` | 新增 `@playwright/test`、`lighthouse`；`test:e2e` 脚本 |

## 八、怎么复现

```bash
# 1) 后端（Postgres 需在跑；.env 已就绪）
cd backend && ./.venv/Scripts/python.exe manage.py runserver 127.0.0.1:8000 --noreload

# 2) 后端冒烟（45+ 步）与实时冒烟
./.venv/Scripts/python.exe scripts/smoke_backend.py
pip install websockets && ./.venv/Scripts/python.exe scripts/smoke_realtime.py

# 3) 前端（必须 localhost:3000，与 API 同 host）
cd frontend && pnpm dev

# 4) 浏览器 E2E（13 用例，约 1.7 分钟）
pnpm test:e2e

# 5) Lighthouse（必须对生产构建）
pnpm build && pnpm start
pnpm exec lighthouse "http://localhost:3000/<项目页>" --extra-headers='{"Cookie":"…"}' \
  --only-categories=performance,accessibility,best-practices
```

## 九、下一步（按性价比排序）

1. **字体加载**：`@import` → `next/font`，收敛字重。预计同时改善 LCP 与 TBT，
   是 Lighthouse 从 79 冲 90 的最低成本动作。
2. **组件测试**：pnpm 安装已解封，可以装 Vitest + Testing Library 了。
   E2E 只覆盖主链路，边界（空态、错误态、权限态）更适合组件测试。
3. **批量失败的重试入口**（Sprint 6 的账）：把失败的 id 留在操作条里给一个 `retry failed`。
4. **`docs/assets/` 真实截图**：现在栈能起，一条命令的事。
5. **契约 09 回填**：把本次三个坑（host 一致性、CSRF 轮换、pnpm 安装）写进"常见坑"一节。
