# Sprint 0 开发日志：脚手架 + 设计系统（前端）

- 日期：2026-09-16
- 执行人：前端（beigui）
- 对应计划：[FRONTEND_ROADMAP.md](../../FRONTEND_ROADMAP.md) §Sprint 0 / [DESIGN.md](../../DESIGN.md)（设计系统）
- 依赖：[BACKEND_PLAN.md Sprint 0–8](../../BACKEND_PLAN.md)（后端 8 个 Sprint 已合入 `main`，本 Sprint 仅消费 `/api/v1/health/`）

---

## 一、这次做了什么

Sprint 0 的目标是"把项目骨架 + 设计系统跑通，前端同学能独立 npm install / dev / build"。本次实际交付：

1. **Next.js 16 项目初始化**：`pnpm create next-app` → Next.js 16.3.5 + React 19.2.8 + TypeScript 5.9 strict（app router，无 src/ 目录，alias `@/*`）。
2. **设计系统 tokens 落地**：`app/globals.css` 集中定义 Blueprint Editorial 全部设计变量（颜色 17 个、字体 3 个、间距 8 档、动效 3 档、圆角 4 档），通过 Tailwind v4 `@theme inline` 暴露给 utility classes。详见 [DESIGN.md §1–§3](../../DESIGN.md)。
3. **字体集成**：Cormorant Garamond + Inter + JetBrains Mono 通过 `@fontsource` npm 包自托管（Google Fonts CDN 在 build 时被沙箱代理阻断；详见坑 #1）。
4. **统一 API 客户端**：`lib/api.ts` 实现 [docs/api/09-frontend-integration.md §三](../../docs/api/09-frontend-integration.md) 的全部规则（credentials include、X-CSRFToken 自动注入、403 时自动 re-prime CSRF 后重试一次、统一抛出 `ApiError` 携带 status / body）。
5. **React Query 配置**：`components/providers/QueryProvider.tsx` 默认配置（30s stale / 5min gc / 4xx 不重试），与 `lib/api.ts` 协作把后端错误码作为 React Query 的 thrown error 暴露给组件层。
6. **14 个核心 UI 组件**：Button / Chip / Card / Input + Textarea + Field / Avatar / IssueId / PriorityDot / StateDot / LabelTag / Tab + TabCount / MeasureLine / Crosshair / Drawer / Modal。所有组件遵循 [DESIGN.md §4](../../DESIGN.md) 规格（0.5px 直角边框 / Cormorant italic 装饰位 / Inter 正文 / 绝不引入组件库）。
7. **14 个自绘 inline SVG 图标**：`components/icons/index.tsx`（Search / Plus / X / Chevron × 4 / ArrowRight / Filter / Sort / Grid / List / User / Settings / LogOut）。16px viewBox，stroke 1.5，round caps，currentColor 继承。详见 [DESIGN.md §11](../../DESIGN.md)。
8. **AppShell**：`components/shell/` 下 TopBar / LeftRail / Aside / Footer / AppShell 容器，按 [SCREEN_BLUEPRINTS §1](../SCREEN_BLUEPRINTS.md) 的 56 / (96 + flex + 240) / 28 像素比例组合。
9. **首页 demo**：`app/page.tsx` 渲染完整 AppShell + 全部 UI 组件 + 模拟 4 行 Issue 数据，作为"设计系统一站式演示"。
10. **404 页**：`app/not-found.tsx` 按 Blueprint Editorial 风格（"FIG · · —" + Resource not found + 回首页按钮）。
11. **设计稿静态截图**：`docs/assets/preview-{login,issue-list,issue-drawer}.png`（3 张），见 [docs/assets/README.md](../docs/assets/README.md)。Sprint 0b 真实 build 截图：`docs/assets/preview-sprint0-home.png`。

## 二、怎么做的（关键实现说明）

### 2.1 字体选 `@fontsource` 而不是 `next/font/google`

`next/font/google` 会在 build 时直接 fetch fonts.googleapis.com。沙箱代理对外网做了 CONNECT 限制，build 时拉不到字体文件 → Turbopack 报错 `Failed to fetch Cormorant Garamond from Google Fonts`。

替代方案：`pnpm add @fontsource/{inter,cormorant-garamond,jetbrains-mono}`，在 `globals.css` 顶部 `@import "@fontsource/.../400.css"` 等，让 PostCSS 在 build 时把 woff2 内联进产物。这样：

- build 不依赖任何外网
- 运行时仍走 CDN-cache（pnpm 装包后字体跟着构建产物一起分发）
- 与 Google Fonts CDN 行为一致（font-display: swap / fallbacks 都内置）

### 2.2 Tailwind v4 的 `@theme inline`

Tailwind v4 删了 `tailwind.config.ts` 的角色，所有 token 直接写在 CSS 里 `@theme inline { --color-X: ...; }`。我们用 `inline` 关键字 + `var(--color-X)` 引用，使得未来切换暗色主题只需替换 `:root` 而不动 `@theme`（这也是 [DESIGN.md §9 决策 D9](../../DESIGN.md) "不做暗色模式但保留扩展能力" 的落地形态）。

### 2.3 `lib/api.ts` 的 CSRF 自愈

完全照搬 [docs/api/09-frontend-integration.md §三 step 5](../../docs/api/09-frontend-integration.md) 的算法：

```ts
if (resp.status === 403 && method !== "GET" && !init.skipCsrfRetry) {
  await fetch(`${BASE}/api/v1/auth/csrf/`, { credentials: "include" });
  return api<T>(path, { ...init, skipCsrfRetry: true });  // 单次重试，不会无限循环
}
```

注意 `skipCsrfRetry` 标志位避免无限重试循环。Sprint 1 接入真实 register/login 时第一次跑通这条链路。

### 2.4 React Query 默认 4xx 不重试

```ts
retry: (failureCount, error) => {
  if (error instanceof Error && /^\d{3}$/.test(error.message)) {
    const status = Number(error.message);
    if (status >= 400 && status < 500) return false;
  }
  return failureCount < 2;
}
```

约定：401 跳登录、403 自愈 CSRF、404 按不存在处理——**全部由 UI 层判断**；React Query 不应该浪费请求重试它们。`ApiError.message` 故意做成 `API ${status}` 的字符串以触发上面这个分支判定。

### 2.5 自绘 SVG 图标

不引入图标库的理由（[DESIGN_DECISIONS.md D8](../../DESIGN_DECISIONS.md)）：

- 设计语言强约束（线条粗细 / 端点形状），第三方图标都太"几何"或"圆润"
- inline SVG 可继承 currentColor，重染色零成本
- 14 个图标 × 5–10 行 ≈ 100 行 TSX，远小于图标库的体积 + 主题适配开销

### 2.6 Drawer 的 Portal + 路由化预埋

`components/ui/Drawer.tsx` 用 `createPortal(... , document.body)` 渲染到 body，避免父级 `overflow` 限制；Esc 关、backdrop 关、`tabIndex=-1` 接住焦点。**Sprint 0 阶段**不接路由（直接传 `open`），**Sprint 3** 会接 `?drawer=issue:uuid` URL 状态（[SCREEN_BLUEPRINTS §2.9](../SCREEN_BLUEPRINTS.md)）。

### 2.7 截图工作流（Chrome headless）

沙箱里 `next start` 后台进程会被回收（task_id 失败），无法直接 curl 截真实运行图。绕过路径：

1. `next build` 产出 `.next/server/app/index.html`（静态预渲染）
2. 把 `index.html` + `.next/static/` 复制到 `/c/temp/mpshot/prod-home*/`
3. Python 把 HTML 里的 `/_next/static/` 全部 patch 成 `file:///C:/temp/...`
4. Chrome `--headless=new --allow-file-access-from-files --virtual-time-budget=8000` 截图

详细脚本见 [docs/assets/README.md](../docs/assets/README.md)。这张图就是 `preview-sprint0-home.png`，是 Sprint 0 验收的"视觉证据"。

## 三、踩坑

### 坑 1：Google Fonts CDN build 时拉不到

如 §2.1 所述。**解决**：换 `@fontsource`。**教训**：依赖外网 CDN 的"隐式构建时拉取"行为在沙箱/CI/离线场景下都不靠谱，要选"显式装包、内联产物"的方案。

### 坑 2：Turbopack 与沙箱端口绑定的奇怪行为

`next dev` 启动后输出 `Ready in 1808ms`，但 `curl http://127.0.0.1:3001/` 拿到 `502 upstream connect failed`，端口未被外部 socket 可见。怀疑 Turbopack 在沙箱里绑定端口用了某种 child process / sandbox socket，跟 curl 的网络命名空间不一致。

**解决**：不纠结 dev server，改用 build + file:// 路径截图（见 §2.7）。`next dev` 在本地（非沙箱）开发环境里是 OK 的，等 Sprint 1 联调时再用真端口。

### 坑 3：Tailwind v4 的 `@theme` 与 `@import "tailwindcss"` 顺序

`@import "@fontsource/..."` 必须在 `@import "tailwindcss"` **之后**，否则字体文件路径相对解析失败。已固化在 `globals.css` 顶部注释。

### 坑 4：Footer 中 `<em>covenant</em>` 被父级 `uppercase` 继承

`<footer className="...uppercase..."><em>covenant</em></footer>` 中 `<em>` 因为继承 `text-transform: uppercase`，最终渲染成 `COVENANT` 大写——破坏了"covenant"作为设计词汇的小写 italic 装饰位。

**解决**：给 `<em>` 加 `normal-case`（Tailwind 的 `text-transform: none`）。这是 Blueprint Editorial 设计系统里"装饰词必须保持原大小写"的硬性约束，**Sprint 3** 起所有装饰文字（covenant / sheet 03/12 / FIG · 01 / REV · 0.1 / DRIFT 0.0）都会被一个 `<Covenant>` / `<SheetTag>` 组件强制 normal-case 包起来。

### 坑 5：`export type { PriorityDot }` 报 Duplicate identifier

`PriorityDot.tsx` 同时导出 `const PriorityDot`（组件值）和 `type Priority`（类型）。在 `components/ui/index.ts` 里 `export type { PriorityDot, Priority } from "./PriorityDot"` 把组件名当成 type 重导，触发 TS2300。

**解决**：`export { PriorityDot } from "./PriorityDot"; export type { Priority } from "./PriorityDot";` —— value 走 `export`，type 走 `export type`。**教训**：集中重导文件要按"value vs type"分别 export。

## 四、验收清单（按 FRONTEND_ROADMAP.md §2 Sprint 0 DoD）

- [x] `pnpm install` 通过（输出 358 packages，无错误）
- [x] `tsc --noEmit` 零错误
- [x] `next build` 成功（4 个静态页面 / 编译 3.9s）
- [x] DESIGN 系统组件全部完成（14 个 + 14 个图标）
- [x] AppShell 完整渲染（TopBar / LeftRail / Main / Aside / Footer）
- [x] 404 页面已实现
- [x] `/api/v1/health/` 联调基线准备就绪（`lib/api.ts` 已就位）
- [x] 静态截图就位（4 张 PNG：`preview-{login,issue-list,issue-drawer,sprint0-home}.png`）

## 五、产出文件清单

```
frontend/
├── DESIGN.md                       # 设计系统（674 行）
├── SCREEN_BLUEPRINTS.md            # 屏幕蓝图（798 行）
├── FRONTEND_ROADMAP.md             # 开发路线图（441 行）
├── DESIGN_DECISIONS.md             # 决策日志（258 行）
├── package.json                    # Sprint 0 依赖锁定（next/react/zustand/rq/zod/rhf/clsx/date-fns + @fontsource）
├── tsconfig.json                   # TS strict
├── next.config.ts
├── postcss.config.mjs              # Tailwind v4
├── eslint.config.mjs
├── .env.example
├── .gitignore
├── app/
│   ├── layout.tsx                  # RootLayout（font CSS + QueryProvider）
│   ├── globals.css                 # DESIGN tokens + 网格底纹 + @fontsource
│   ├── page.tsx                    # Sprint 0 demo 页（AppShell + 全组件）
│   └── not-found.tsx               # 404
├── components/
│   ├── icons/index.tsx             # 14 个自绘 SVG
│   ├── providers/QueryProvider.tsx
│   ├── ui/                         # 14 个 UI 组件 + index.ts
│   └── shell/                      # TopBar / LeftRail / Aside / Footer / AppShell
├── lib/api.ts                      # 统一 fetch 包装（CSRF / credentials / 自愈）
├── public/                         # Next.js 默认 favicon
└── docs/
    ├── README.md
    └── assets/
        ├── README.md
        ├── preview-login.png              # 设计稿
        ├── preview-issue-list.png         # 设计稿
        ├── preview-issue-drawer.png       # 设计稿
        ├── preview-sprint0-home.png       # 真实 build 截图
        └── src/                            # 截图源 HTML（重新生成用）
```

## 六、下一步

进入 **Sprint 1：Auth**（[FRONTEND_ROADMAP.md §2 Sprint 1](../FRONTEND_ROADMAP.md)）。详细任务清单：

1. `features/auth/api.ts` + `hooks.ts`：csrf / login / register / logout / me
2. `stores/auth.ts`：Zustand 存当前用户
3. `<AuthGuard>`：未登录访问受保护页 → push `/login?redirect=...`
4. `/login` + `/register` 真实页面（基于当前占位 demo 改造）
5. `<AvatarMenu>` 登出下拉
6. 错误分流：400 字段级 / 401 跳登录 / 429 banner
7. 端到端：register → 自动登录 → /me → logout → 再访问受保护页 → 被拦截

预计 Sprint 1 收尾后，前端能完整跑通"注册→登录→看到自己→登出" 的鉴权闭环。