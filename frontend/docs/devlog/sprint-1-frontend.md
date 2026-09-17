# Sprint 1 开发日志：Auth 闭环（前端）

- 日期：2026-09-17
- 执行人：前端（beigui）
- 对应计划：[FRONTEND_ROADMAP.md](../../FRONTEND_ROADMAP.md) §Sprint 1
- 契约依据：[docs/api/01-auth.md](../../../docs/api/01-auth.md) + [docs/api/09-frontend-integration.md](../../../docs/api/09-frontend-integration.md)
- 依赖：Sprint 0（脚手架 + 设计系统 + `lib/api.ts`）已合入 `main`

---

## 一、这次做了什么

Sprint 1 的目标是跑通「注册 → 自动登录 → 看到自己 → 登出 → 再访问被拦截」的完整鉴权闭环。本次交付：

1. **类型层**：`types/auth.ts` — `User` / `RegisterPayload` / `LoginPayload` / `FieldErrors` / `FlatErrors`，以及三个错误体收窄工具（`hasDetail` / `isFieldErrors` / `flattenErrors`）。
2. **API 层**：`features/auth/api.ts` — `fetchCsrf` / `register` / `login` / `logout` / `fetchMe` 五个薄封装，全部走 Sprint 0 的 `lib/api.ts`（credentials + CSRF 自愈）。
3. **状态层**：`stores/auth.ts` — Zustand store，三态机 `unknown → authenticated | anonymous`，提供同步的「我是谁」查询能力（React Query 是异步的，很多组件需要同步答案）。
4. **Hook 层**：`features/auth/hooks.ts` — `useMe` / `useLogin` / `useRegister` / `useLogout`，把 React Query 的服务端状态镜像进 Zustand。
5. **路由保护**：`features/auth/AuthGuard.tsx` + `app/(protected)/layout.tsx` — 用 Route Group 统一保护所有业务页面（URL 不变）。
6. **登录/注册页**：`app/(auth)/login/page.tsx` + `app/(auth)/register/page.tsx` + `components/auth/AuthCard.tsx`（共享外壳）+ 两个表单组件（react-hook-form + zod）。
7. **头像菜单**：`components/shell/AvatarMenu.tsx` — 从 TopBar 静态头像升级为可交互下拉（My settings / Sign out），点击外部或 Esc 关闭。
8. **个人设置页**：`app/(protected)/me/page.tsx` — 展示当前用户信息 + 登出（只读，因为后端没有 `PATCH /auth/me/`）。
9. **首页重写**：`app/(protected)/page.tsx` — 从「设计系统 demo」升级为「鉴权验收页」，展示真实 `/auth/me/` 返回的字段。

## 二、怎么做的（关键实现说明）

### 2.1 为什么 Zustand 和 React Query 都要

`useMe()` 是异步的（有 `isLoading`），但很多地方需要**同步**回答「当前用户是谁」：

- `AvatarMenu` 要立即渲染用户名和邮箱
- `TopBar` 的连接状态要读角色
- Sprint 3 的 `IssueDrawer` 要判断「这条评论是不是我写的」来决定显不显示删除按钮

所以：

```text
React Query  useMe()  ──onSuccess──▶  Zustand authStore.setUser()
     ▲                                        │
     │ 负责 fetch / cache / 重取                │ 负责同步读取
     └──── 唯一事实来源 ────────────────────────┘ 镜像
```

`useLogout` 成功后会 `qc.clear()` —— 清掉**所有**缓存。理由：换用户后，上一个用户的 workspace / project / issue 缓存全部失效，不清会串数据。

### 2.2 401 不是错误，是「匿名」状态

`useMe()` 的 `queryFn` 里对 401 做了特殊处理：

```ts
try {
  const user = await fetchMe();
  setUser(user);
  return user;
} catch (e) {
  if (isUnauthorized(e)) {
    clear();       // 设成 anonymous
    return null;   // 不抛 —— 这是一个合法状态
  }
  throw e;         // 500 / 网络错误才抛
}
```

这样 `<AuthGuard>` 可以干净地分流三种情况：

| 情况 | `data` | 行为 |
|------|--------|------|
| 未登录 | `null` | `router.replace('/login?redirect=…')` |
| 已登录 | `User` | 渲染 children |
| 后端挂了 | `undefined` + `isError` | 显示「无法连接后端」而不是误跳登录页 |

**关键取舍**：如果 401 也当错误抛，`<AuthGuard>` 就分不清「未登录」和「后端 500」，会把后端故障误判成登录过期，导致用户被莫名其妙踢到登录页。

### 2.3 Route Group 统一保护

用 Next.js 的 Route Group（括号目录）把受保护页面收在一起：

```text
app/
├── layout.tsx                    # root（字体 + QueryProvider）
├── not-found.tsx                 # 404（全局）
├── (auth)/                       # 不需要登录
│   ├── login/page.tsx            # → /login
│   └── register/page.tsx         # → /register
└── (protected)/                  # 需要登录
    ├── layout.tsx                # ← <AuthGuard> 在这里，只写一次
    ├── page.tsx                  # → /
    └── me/page.tsx               # → /me
```

**Route Group 不影响 URL**：`(protected)/page.tsx` 服务的仍是 `/`。

这样做的好处：Sprint 2–7 会新增十几个受保护页面（`/w/:slug`、`/w/:slug/projects/:pid`…），只要放进 `(protected)/` 就自动受保护，不需要每个页面重复写 `<AuthGuard>`。

### 2.4 为什么 AuthGuard 不能用 Next.js middleware

直觉上「未登录拦截」应该用 `middleware.ts` 在 Edge 上做。但这里行不通：

- Session cookie 是后端（`127.0.0.1:8000`）种的，前端（`localhost:3000`）是**跨端口**
- Edge middleware 在独立 runtime 里跑，无法跨源读取后端 cookie
- 即使读到了，也要调 `/auth/me/` 才知道是否有效 —— 那就等于把 API 请求搬到 Edge，没有收益

所以鉴权检查必须放在**客户端**，等 `/me` 解析完再决定跳不跳。代价是首屏会有一瞬间的骨架屏（`AuthSkeleton`），这是可接受的。

### 2.5 `useSearchParams()` 必须包 Suspense

`LoginForm` 要读 `?redirect=` 参数，用了 `useSearchParams()`。在 App Router 里这会让整个页面**退出静态渲染**，Next.js 会在 build 时报错：

```text
useSearchParams() should be wrapped in a suspense boundary at page "/login"
```

解决：把 `<LoginForm />` 包在 `<Suspense fallback={...}>` 里（见 `app/(auth)/login/page.tsx`）。fallback 是一个和真实表单同高的骨架，避免布局跳动。

### 2.6 错误分流的三层结构

按 [docs/api/09-frontend-integration.md §四](../../../docs/api/09-frontend-integration.md) 的约定，前端按「字段名 + 状态码」分支，**不按文案内容分支**：

| 状态码 | 响应体 | 前端处理 |
|--------|--------|---------|
| 400 字段级 | `{username: ["已存在…"]}` | 展示在对应字段下方 |
| 400 非字段级 | `{non_field_errors: [...]}` | 表单顶部 banner |
| 400 detail | `{detail: "用户名或密码错误。"}` | 表单顶部 banner |
| 401 | `{detail: "身份认证信息未提供。"}` | 跳登录页（由 AuthGuard 处理） |
| 429 | `{detail: "尝试次数过多…"}` | banner + **禁用提交按钮** |
| 500 | `{detail: "服务器内部错误。"}` | banner「请稍后重试」 |

`flattenErrors(body)` 把后端的三种错误体统一拍平成 `{fields: {…}, form: string | null}`，表单组件只需要认这两个 key。

**特别处理 429**：登录失败 5 次会锁定 15 分钟。前端收到 429 后 `setLocked(true)` 永久禁用按钮（直到刷新页面），避免用户继续无效尝试。

### 2.7 AuthCard 的视觉设计

登录/注册共用一个 `AuthCard` 外壳（[SCREEN_BLUEPRINTS §2.1](../SCREEN_BLUEPRINTS.md)）：

- 480px 居中卡片，半透明白底 + 0.5px 边框
- 四个角各一个 22px 十字标记（`<Crosshair>`）
- 四角外侧有衬线 italic 坐标读数（`N · 31° 14′` / `sheet 01 / 12` / `fig · identify` / `W · 121° 28′`）
- 76px Cormorant italic 的 "Plane" 字标
- 底部 `covenant ──── REV · 0.1` 页脚

输入框用**下划线式**（`border-b` 而非四边框），与卡片的编辑排版气质一致 —— 这是 `AuthInput` 而不是通用的 `<Input>` 组件。焦点时下划线变钴蓝。

## 三、踩坑

### 坑 1：`pnpm-workspace.yaml` 的 `allowBuilds` 占位符阻塞 install

`create-next-app` 生成的 `pnpm-workspace.yaml` 内容是：

```yaml
allowBuilds:
  unrs-resolver: set this to true or false
```

这是 pnpm 11 的**提示文本**（不是合法配置），导致 `pnpm install` 每次都在 link 阶段卡住，`node_modules/.bin` 永远不生成。

**解决**：改成合法配置

```yaml
onlyBuiltDependencies:
  - unrs-resolver
```

`unrs-resolver` 是 `eslint-import-resolver-typescript` 的原生依赖（Rust binding），批准它编译是安全的。

### 坑 2：`git rm <glob>` 在 Git Bash 里会误展开

用 `git rm frontend/_tmp_*` 想删几个临时文件，结果 shell 把 glob 展开成了整个 `frontend/` 目录的列表，`git rm` 把**所有** frontend 文件标成了删除。

**解决**：`git checkout HEAD -- frontend/` 恢复，然后用 `git rm --cached <完整文件名>` 逐个删（每个文件名显式写出，不用通配符）。

**教训**：在任何 git 命令里用通配符前，先 `echo <glob>` 确认展开结果。

### 坑 3：`next dev` / `next start` 的后台进程在沙箱里被回收

沙箱里 `nohup ... &` 或 `run_in_background` 启动的 Next.js 服务，进程会在几秒内消失（日志停在 `Ready`，随后端口无人监听）。

**解决**：不依赖运行时服务器，改用 `next build` 的预渲染产物 + `file://` 协议截图（详见 [docs/assets/README.md](../assets/README.md)）。

### 坑 4：Chrome headless 拒绝连接 `localhost` / `127.0.0.1`

即使服务在跑，`--screenshot http://127.0.0.1:3002/` 也会得到「拒绝了我们的连接请求」。原因是 Chrome headless 与 shell 不在同一个网络命名空间。

**解决**：同上 —— 用 `file://` + 预渲染 HTML。

## 四、验收清单（按 FRONTEND_ROADMAP.md §2 Sprint 1 DoD）

- [ ] `tsc --noEmit` 零错误
- [ ] `next build` 成功
- [ ] `/login` / `/register` 页面按 SCREEN_BLUEPRINTS 渲染
- [ ] 未登录访问 `/` → 重定向到 `/login?redirect=%2F`
- [ ] 注册成功后立即进入 `/`（无需二次登录）
- [ ] 登录失败 → 表单级错误文案；连续 5 次 → 429 banner + 按钮禁用
- [ ] AvatarMenu 可打开 / 关闭 / 登出
- [ ] 登出后 `/` 再次被拦截
- [ ] `/me` 展示真实用户信息

## 五、产出文件清单

```
frontend/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx                 # /login
│   │   └── register/page.tsx              # /register
│   └── (protected)/
│       ├── layout.tsx                     # AuthGuard 统一保护
│       ├── page.tsx                       # /（鉴权验收页）
│       └── me/page.tsx                    # /me
├── components/
│   ├── auth/AuthCard.tsx                  # 登录/注册共享外壳 + 表单原语
│   └── shell/AvatarMenu.tsx               # 头像下拉 + 登出
├── features/auth/
│   ├── api.ts                             # 5 个 API 封装
│   ├── hooks.ts                           # useMe / useLogin / useRegister / useLogout
│   ├── AuthGuard.tsx                      # 未登录重定向
│   ├── index.ts
│   └── components/
│       ├── LoginForm.tsx
│       └── RegisterForm.tsx
├── stores/auth.ts                         # Zustand 三态机
└── types/auth.ts                          # User + 错误体收窄工具
```

## 六、下一步

进入 **Sprint 2：Workspace + Project**。任务：

1. `features/workspace/{api,hooks}.ts` + `features/project/{api,hooks}.ts`
2. `/` 改为 Workspace Dashboard（列表 + 创建）
3. `/w/:slug` Workspace 详情（Recent projects + Members strip）
4. `/w/:slug/projects` 完整项目列表
5. `/w/:slug/projects/new` 创建项目 modal
6. `/w/:slug/members` + `/w/:slug/settings`
7. `<RoleBadge>` 组件 + 按 `current_role` 控制 Actions 显隐
8. 验收：A/B 两账号演示越权场景（B 不在 WS1 → 404）
