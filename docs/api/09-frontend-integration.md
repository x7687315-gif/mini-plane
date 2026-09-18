# 09 契约：前端接入指南（Frontend Integration）

> 这不是接口定义（定义看 [openapi.yaml](openapi.yaml) 与 00–08），而是**接入操作手册**：
> 按顺序做完 §2 自检清单，认证、错误、分页、实时四条链路即可一次跑通。
> 所有示例基于浏览器原生 `fetch`，可直接抄进 React/Next.js。

---

## 一、环境与地址

| 形态 | HTTP API | Swagger | WebSocket | 说明 |
|------|----------|---------|-----------|------|
| 本地开发（后端 `runserver`） | `http://127.0.0.1:8000` | `/api/docs/` | `ws://127.0.0.1:8000/ws/...`（**同端口**） | runserver 由 daphne 接管，HTTP/WS 同端口 |
| Docker Compose | `http://127.0.0.1:8000` | `/api/docs/` | `ws://127.0.0.1:8001/ws/...`（**分开的端口**） | web(gunicorn)=8000，asgi(daphne)=8001 |

- 所有业务 API 以 `/api/v1/` 开头，**路径带 Django 风格尾斜杠**（`/api/v1/workspaces/`）。
- 后端地址不要写死：`NEXT_PUBLIC_API_BASE` 之类的 env 注入，开发/容器两种形态只换这一个值
  （WS 地址从 HTTP 地址推导时注意 compose 下端口不同，建议分开两个 env）。
- 前端开发服务器默认 `http://localhost:3000`，已加入后端 `CORS_ALLOWED_ORIGINS` /
  `CSRF_TRUSTED_ORIGINS`；换了端口要同步改后端 `.env`。

## 二、接入自检清单（第一次 401/403 时先回来看这里）

- [ ] 所有请求带 `credentials: "include"`（Session 认证全靠 cookie）
- [ ] 所有 POST/PATCH/DELETE 带 `X-CSRFToken` 头（见 §3）
- [ ] URL 尾斜杠齐全（无斜杠的 POST 会被 301 重定向且**方法可能变 GET**）
- [ ] JSON 体请求带 `Content-Type: application/json`
- [ ] 处理 401（跳登录）/ 403（提示无权限）/ 404（按不存在处理，**不要重试**）三种分流
- [ ] 列表页处理分页体 `{count, next, previous, results}`，`next` 为 null 表示没有下一页

## 三、认证与 CSRF

认证是 **Session + Cookie**（无 token 存储）；CSRF 用「cookie 取值 + 请求头回传」双提交模式。

```ts
const BASE = process.env.NEXT_PUBLIC_API_BASE!; // 如 http://127.0.0.1:8000

function readCookie(name: string): string {
  return document.cookie.split("; ")
    .find((row) => row.startsWith(name + "="))?.split("=")[1] ?? "";
}

export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (["POST", "PATCH", "DELETE"].includes(method)) {
    headers.set("X-CSRFToken", readCookie("csrftoken"));
    headers.set("Referer", window.location.origin + "/");
  }
  const resp = await fetch(BASE + path, {
    ...init, method, headers, credentials: "include",
  });
  // 会话过期 / CSRF 过期：种一次新 cookie 后重放一次写请求（仅一次，防循环）
  if (resp.status === 403 && method !== "GET" && !init.headers) {
    await fetch(BASE + "/api/v1/auth/csrf/", { credentials: "include" });
    return api(path, { ...init, headers: undefined });
  }
  return resp;
}
```

完整流程（[01 契约](01-auth.md)）：

| 步骤 | 请求 | 说明 |
|------|------|------|
| 1. 种 CSRF | `GET /api/v1/auth/csrf/` | 应用启动时调一次即可 |
| 2. 注册 | `POST /api/v1/auth/register/` `{username, email, password}` | **201 即已登录**，省一次登录 |
| 3. 登录 | `POST /api/v1/auth/login/` `{username, password}` | 200；失败统一 400「用户名或密码错误」（不区分不存在/密码错） |
| 4. 当前用户 | `GET /api/v1/auth/me/` | 401 = 未登录/会话失效，前端跳登录页 |
| 5. 登出 | `POST /api/v1/auth/logout/` | 204 |

> 密码规则与 Django 校验器一致：≥8 位、非常见密码、不全数字；错误体是字段级的，直接展示。

## 四、错误处理（[00 契约](00-conventions.md) §2）

| 状态码 | 含义 | 响应体 | 前端动作 |
|--------|------|--------|----------|
| 400 | 字段校验失败 | `{"字段名": ["文案"], "non_field_errors": ["文案"]}` | 把数组内容展示在对应字段下 |
| 401 | 未登录/会话失效 | `{"detail": "身份认证信息未提供。"}` | 跳登录页 |
| 403 | 已登录但无权操作 | `{"detail": "您没有执行该操作的权限。"}` | 提示无权限；**先怀疑 CSRF 过期**（见 §3 自愈） |
| 404 | 不存在或**不可见** | `{"detail": "未找到。"}` | 按不存在处理；**不要重试**（防枚举语义：后端刻意不区分） |
| 429 | 登录失败锁定 | `{"detail": "尝试次数过多，请 15 分钟后再试。"}` | 提示等待，禁用提交按钮 |
| 500 | 服务异常 | `{"detail": "服务器内部错误。"}` | 提示稍后再试（详情在后端日志里） |

> 按「字段名 + 状态码」分支，**不要按文案内容分支**（文案可能随措辞调整）。

## 五、分页

所有列表接口统一（[00 契约](00-conventions.md) §3）：`?page=1&per_page=50`
（默认 50，上限 100）。

```json
{ "count": 128, "next": "…?page=2", "previous": null, "results": [ … ] }
```

- `next/previous` 是完整 URL，可直接 `fetch`，也可自行解析 `page` 参数；
- **页码越界返回 200 + 空 `results`**（不是 404）：筛选后页码超出范围是正常中间态，
  据此把页码拉回即可。

## 六、Issue 列表查询参数（[04 契约](04-issues.md)）

| 参数 | 形式 | 示例 |
|------|------|------|
| `state` | 逗号分隔多个（OR） | `state=<id1>,<id2>` |
| `priority` | `none/urgent/high/medium/low` 多值 | `priority=high,urgent` |
| `assignee` | 用户 id 或 `me` | `assignee=me` |
| `labels` | 标签 id 多值（**并集**） | `labels=<id1>,<id2>` |
| `search` | title/description 包含匹配 | `search=登录`（`%`/`_` 按字面量处理） |
| `ordering` | 白名单：`created_at/-created_at/sequence_id/-sequence_id/priority/-priority`，非法值 400 | `ordering=-created_at`（默认值） |

建议 UI→URL→查询参数做双向同步（刷新/分享后筛选不丢）；非法参数后端返回字段级 400，直接展示。

## 七、实时推送（[08 契约](08-realtime.md)）

- URL：`ws(s)://<host>[:ws端口]/ws/workspaces/{slug}/projects/{pid}/`，浏览器自动带 cookie。
- 连上后**先等 `connected` 帧**再渲染在线状态；`payload.role` 可直接控制按钮显隐。
- 事件只有两个：`issue.updated`（`old_value/new_value` diff，与活动流共用一套字段文案映射）
  与 `comment.created`（带正文与作者，直接追加到评论区，不用回查）。
- 客户端只允许发 `{"type": "ping"}`（心跳），其余回 error 帧；建议 25–30s 一次。
- 关闭码：`4401` 未登录（跳登录）；`4404` 项目不可见（提示无权限，**不要自动重连**）。
- **事件是提醒不是事实来源**：断线重连后全量刷新当前视图兜底。

## 八、异步任务（[07 契约](07-cache-and-tasks.md)）

批量改标签：`POST …/issues/bulk/labels/` → **202 + TaskRun**（`id`/`status`/`result`）。
用返回的 `id` 轮询 `GET …/tasks/{task_id}/` 直到 `success | failure`（建议 1s 间隔，最多 30 次）。
批量任务影响的 Issue **会正常收到 `issue.updated` 推送、时间线正常留痕**，无需特殊刷新。

## 九、典型加载序列（首屏）

```text
me（401 → 登录页）
  → GET /api/v1/workspaces/                （左侧工作区切换器，current_role 控制管理入口）
  → GET /api/v1/workspaces/{slug}/projects/（项目列表，current_user_role 同上）
  → GET …/projects/{pid}/states/           （状态列/筛选器数据源，预置五态只读）
  → GET …/projects/{pid}/issues/?ordering=-created_at
  → 建立 WS 连接，之后一切变更走推送增量更新
```

## 十、常见坑（踩过的都在这）

> 本节由前端同学回填：以下每一条都是**真实踩过并修过**的，附现象与根因，不是提醒清单。
> 最近一次回填：2026-09-18（集成验收），详细过程见
> [frontend/docs/devlog/integration-verification.md](../../frontend/docs/devlog/integration-verification.md)。

1. **尾斜杠**：`/api/v1/auth/login`（无斜杠）会被 301；浏览器重放 POST 时可能变 GET。

2. **⚠️ 页面与 API 必须同 host —— 这是本项目最贵的一个坑**（2026-09-18 实测）

   `localhost:3000` → `localhost:8000`：**同站跨端口，cookie 正常**。
   但 `localhost:3000` → `127.0.0.1:8000`：**不同 host，全线崩溃**：
   - 后端 `SESSION_COOKIE_SAMESITE="Lax"`，跨站 fetch **不会带**会话 cookie；
   - 更致命的是 `csrftoken`：它落在 `127.0.0.1` 域上，而前端用 `document.cookie` 读，
     在 `localhost` 页面上**永远读不到** → 所有写请求 403；
     且 403 自愈会重取 `/auth/csrf/`，新 cookie 仍落在 127.0.0.1 → 重放依旧 403，**死循环**。
   - 症状极具误导性：**读操作一切正常**（列表能显示、能翻页），
     只有登录/建 Issue/改状态/发评论/批量操作失败。八个 Sprint 都没发现，
     就是因为后端测试是 Python 客户端、不执行浏览器 cookie 策略。
   - 规则：`NEXT_PUBLIC_API_BASE` / `NEXT_PUBLIC_WS_BASE` 的 **host 必须与页面一致**
     （端口随意）。WebSocket 同理：host 不一致时握手带不上 cookie，直接收 **4401**。
   - 诊断口诀：**"能看不能写" → 先怀疑 host，而不是权限。**

3. **CSRF：`/auth/csrf/` 不返回令牌，且登录时会轮换**

   - 响应体只有 `{"detail": "CSRF cookie 已设置。"}` —— 令牌**只能从 cookie 读**
     （`document.cookie` 里的 `csrftoken`），别指望从 body 里取。
   - **登录成功会轮换 `csrftoken`**（Django `login()` 的既有行为）。所以：
     登录前抓的令牌在登录后失效；任何"缓存令牌"的写法都会在登录后踩 403。
   - 正确姿势就是前端 `lib/api.ts` 现在的做法：**每个写请求现读 cookie**，
     403 时重取一次再重放。服务端返回的是
     `CSRF Failed: CSRF token from the 'X-Csrftoken' HTTP header incorrect.`
     —— 看到 `incorrect` 就说明"会话没问题，只是令牌与当前 cookie 不匹配"。

4. **401 vs 403 vs 404**：401 去登录；403 先自愈 CSRF 再提示；404 是"不可见"，别重试。

5. **current_role / current_user_role 是每请求注入的**，不会出现在缓存里，也不需要前端缓存。

6. 改了接口记得重新生成 `docs/api/openapi.yaml`（CI 有 diff 检查），Swagger 与实现永远一致。

### 附：前端开发环境的坑（不在 API 层，但会拦住接入）

- **pnpm 在 Windows 上装不了新依赖**：报
  `UNKNOWN: unknown error, symlink`（等价于 `os error 1314`：非管理员进程
  不许建符号链接）。修法是 `frontend/.npmrc` 里的 `package-import-method=copy`
  （实测生效）+ `node-linker=hoisted`（重装时的保险）。**不加这个文件，
  任何 `pnpm add` 都会失败**，E2E / Vitest 之类都装不上。
- **前端单元测试是零依赖的**（`node --test` + Node 原生 TS），
  `tests/alias-loader.mjs` 负责解析 `@/` 别名 —— 所以 `lib/url.ts` 这类用了别名的
  纯函数也能被测。组件测试需要 Vitest（装依赖的前提就是上面那条）。
