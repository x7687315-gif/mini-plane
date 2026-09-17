# Sprint 4 开发日志：Comment + Activity（前端）

- 日期：2026-09-17
- 执行人：前端（beigui）
- 对应计划：[FRONTEND_ROADMAP.md](../../FRONTEND_ROADMAP.md) §Sprint 4
- 契约依据：[docs/api/05-comments.md](../../../docs/api/05-comments.md) · [docs/api/06-activities.md](../../../docs/api/06-activities.md)
- 依赖：Sprint 3（Issue 核心）已合入 `main`
- 视觉稿：[preview-issue-drawer-thread.png](../assets/preview-issue-drawer-thread.png)

---

## 一、这次做了什么

Sprint 3 把 Issue 抽屉做成了「一个可以编辑的表单」；Sprint 4 把它变成「一个有历史的对象」——
抽屉下半部分现在有两个 tab，一条**审计时间线**和一段**对话**：

1. **类型层**：`types/comment.ts`（Comment + `canManageComment` 权限判定）、
   `types/activity.ts`（Activity + 文案映射表 + `activityDiffs` / `activityHeadline` / `describeActivity`）。
2. **API 层**：`features/comment/api.ts`（列表 / 创建 / 修改 / 删除 4 个端点）、
   `features/activity/api.ts`（Issue 时间线 + 项目级活动流 2 个只读端点）。
3. **Hook 层**：`features/comment/hooks.ts`（含**乐观插入**与乐观删除）、
   `features/activity/hooks.ts`（两条只读查询）。
4. **`<ActivityFeed>` / `<ActivityItem>`**：`components/activity/ActivityFeed.tsx` —— 倒序时间线，
   时间戳窄列 + 头像 + 「谁把什么从什么改成了什么」，字段名渲染成 DESIGN §4.11 的字段 pill。
5. **`<CommentList>`**：`components/issue/CommentList.tsx` —— 正序对话列表，含就地编辑、
   编辑/删除权限控制、乐观行「posting…」态、删除二次确认。
6. **`<CommentComposer>`**：`components/issue/CommentComposer.tsx` —— 常驻底部输入框，
   ⌘/Ctrl+Enter 发送，失败**保留草稿**。
7. **TabBar 接线**：`IssueDrawer` 里 Activity / Comments / Refs 三个 tab，计数取自分页信封的 `count`。
8. **Tab 进 URL**：抽屉地址从 `?issue=<id>` 扩展为 `?issue=<id>&tab=comments`。
9. **`Drawer` 加 `footer` 插槽**：让输入框钉在滚动区之下（SCREEN_BLUEPRINTS §2.9 要求它常驻）。
10. **删除确认统一走 Modal**：Sprint 3 遗留的 `window.confirm()` 换成品牌内的 `Modal`（DESIGN §5.4 的要求）。
11. **单元测试首次落地**：`tests/unit/` 三个文件、**37 个用例**，覆盖文案映射表全矩阵、
    评论权限矩阵、查询序列化与 ordering 白名单。
12. **清理上一轮的 lint 债**：3 个 `react-hooks/set-state-in-effect` error + 5 个未使用引入 warning。

## 二、怎么做的（关键实现说明）

### 2.1 同一个抽屉里，两个列表的顺序是**故意相反**的

这是本 Sprint 最容易"顺手改坏"的地方：

| 列表 | 顺序 | 理由（契约原文） |
|------|------|-----------------|
| Activity | **倒序**（`created_at` DESC） | 审计留痕，最新发生的事最要紧 |
| Comments | **正序**（`created_at` ASC） | "评论区是对话，最老的在上" |

所以 `useCreateComment` 的乐观插入把新评论**追加到数组末尾**，而活动流是**插到数组开头**。
两个 hook 里的注释都写明了这一点——如果有人"统一"了它们，UI 会安静地变成错的。

还有一条更隐蔽的契约约束（06 §排序边界）：

> 两个列表都按 `created_at` 倒序……同一时刻内的先后顺序**不做保证**。

因此 `ActivityFeed` **不对数组重排序**，也不渲染任何"上一条发生在前"的视觉暗示
（没有连接线、没有相对时间差）。数组顺序就是唯一的真相。

### 2.2 文案映射表：拆成「动词短语 + 结构化 diff」，而不是拼完再解析

06 契约给了模板，直觉做法是直接产出成品句子。但 DESIGN §4.11 要求
**actor 加粗 + 字段名做成 pill**，如果只有一个成品字符串，组件就得反过来用正则
去切句子——把展示逻辑塞进字符串，再解析回来。

所以类型层出三个纯函数，各管一层：

```ts
activityHeadline(a)   // "创建了任务" / "更新了任务" / "评论了任务"（不含 actor、不含 diff）
activityDiffs(a)      // [{ field:'state', label:'状态', before:'Todo', after:'Done' }, …]
describeActivity(a)   // "amiya 将 状态 从 Todo 改为 Done"（成品句，用于 aria-label 与纯文本）
```

组件拿到 `diffs` 后只做"拼装"：actor 加粗，字段名套 pill，值留在句子流里。

`describeActivity` 也没有被丢掉——它挂在 `<li aria-label>` 上，屏幕阅读器读到的是完整句子，
而不是"粗体 amiya、pill 状态、从 Todo 改为 Done"这种被样式切碎的碎片。

**矩阵覆盖测试**就建在这三个函数上：7 个 `entity_type` × 3 个 `action` = 21 格全部断言非空且带 actor。
枚举里预留但 MVP 未接线的 `state / label / workspace / member` 会降级成
`amiya 创建了state` 这类粗糙句子——**故意不写成空**：一行不显示比一句话不精确更糟。

### 2.3 字段 pill 只放**字段名**，值留在句子里

```
12:30  (A) amiya 将 [状态] 从 Todo 改为 In Progress
                ~~~~ pill
```

如果把 `从 Todo 改为 In Progress` 整段做成 pill，一行就退化成芯片表格，读不出句子。
DESIGN §4.11 说的是"字段 pill"，所以只把最容易扫读的**字段名**框起来；
值（`Todo`、`未指派`、`128 字`）保持正文字号，句子仍然读得通。

### 2.4 评论权限：契约表有歧义，以**后端真码**为准

05 契约的权限表把「评论作者 ✅」和「生效角色 = Viewer ❌ 403」并列，
很容易读成"Viewer 连自己的评论都不能改"。去读后端真码
（`backend/apps/issues/views.py::comment_detail`）：

```python
if comment.author_id != request.user.id:
    _require_role(role, ProjectRoles.ADMIN)
```

**是作者就完全不看角色**；不是作者才要求 Admin。前端 `canManageComment` 的写法与之一致
（先判作者、再判 `role === 20`），并且有专门的回归用例钉住"作者 id 命中时不能掉进
'其他 Member' 分支"。

顺带把 05 契约的歧义补清楚了（本次提交同时改了契约表 + 变更记录）。
**教训**：契约与实现冲突时，先读实现再改 UI——反过来会让 UI 凭空造出一条后端不认的规则。

### 2.5 补上一个真 bug：PATCH 之后活动缓存不失效

Sprint 3 的 `useUpdateIssue` 只失效了 issue 列表和详情：

```ts
onSettled: () => {
  qc.invalidateQueries({ queryKey: issueKeys.lists(...) });
  qc.invalidateQueries({ queryKey: issueKeys.detail(...) });
}
```

但后端每次真正发生变化的 PATCH 都会**写一条 activity**（06 §字段 diff 白名单）。
结果是：在抽屉里改完状态，`updated_at` 变了、状态名变了，**唯独这条改动没有出现在它自己的
审计时间线上**——而审计时间线存在的唯一意义就是这个。

修法是在 `onSettled` 里追加两个失效（issue 级 + project 级），
创建/删除 Issue 也一并处理。放在 `onSettled` 而不是 `onSuccess`：
失败时也重取一次，代价一次请求，换来"不确定时以服务端为准"。

### 2.6 删除确认分两档，并把 `window.confirm` 请出项目

SCREEN_BLUEPRINTS §5.4 规定"仅删除 / 危险操作才用 modal 二次确认"。落到评论上有两种情形：

- **删自己的评论** → 一键撤销，不再问。人不会想删错自己的话，多一次点击只是烦。
- **删别人的评论**（Admin 特权）→ 走 `Modal`，副标题写明 `by Kal'tsit · you are acting as Admin`，
  正文说明这条操作会在活动流留痕、正文不可恢复。

同时把 Sprint 3 遗留的 `window.confirm()` 换成同一个 `Modal`。原生 confirm 有两个毛病：
它会弹出浏览器样式的对话框（破坏纸质蓝图的语言），而且**阻塞主线程**。
`IssueDrawer` 的删除 Issue 现在也是 Modal，样式与评论一致。

### 2.7 Tab 进 URL：`?issue=<id>&tab=comments`

Sprint 3 定下的原则是"URL 是抽屉状态的唯一来源"，tab 如果放在 `useState` 里就破了这个先例
（刷新回 Activity、链接无法指到对话）。所以扩展为 `?issue=<id>&tab=<tab>`：

- `tab=activity` 是默认值 → **不写进 URL**，地址栏保持干净（与 `page=1` 同一套约定）；
- **开新 Issue 时清掉 `tab`** —— 打开 AMI-9 不应该落在你看 AMI-7 时停留的 tab 上；
- 非法值经 `normalizeDrawerTab()` 收敛回 `activity`，不抛错（与筛选参数"默默忽略非法值"一致）。

从活动流里点某条评论事件的 `comments →` 就是切这个 tab。

### 2.8 输入框常驻，所以 `Drawer` 需要 footer 插槽

SCREEN_BLUEPRINTS §2.9 的画法里，输入框在 tab 面板**下方**、无论哪个 tab 都在。
但 `Drawer` 的内容区是 `flex-1 overflow-auto`，把输入框写进内容里它就会跟着滚动跑掉。

给 `Drawer` 加了一个可选 `footer?: ReactNode` 插槽（渲染在滚动区之后、带一条上边框）。
向后兼容，其它调用方不受影响。用 `footer` 而不是在 `IssueDrawer` 里写 `sticky bottom-0`：
sticky 在滚动容器里的行为依赖容器高度计算，边框和背景会在滚动时露馅。

配套一个交互细节：**发完评论自动切到 Comments tab**。输入框在 Activity tab 上也可见，
如果发完不切，用户会盯着一个没有任何变化的界面。

### 2.9 Refs tab：留位，但不做假数据

合同里没有「关联 / 引用」端点（`docs/api/` 全文检索 `Refs` 只有蓝图里的三处提及）。
这一格的做法是：**tab 存在**（按蓝图），**面板诚实说明 v0.1 没有这个能力**。

不伪造一份 `RefsList`，理由与后端 hardening-02 的结论同源：
"多造聚合接口只会制造两份事实来源"。前端凭空造一个数据形状是同一类错误。

### 2.10 乐观插入的细节：假 id + 半透明 + 服务端收敛

`useCreateComment.onMutate` 里塞一条 `id: "optimistic-…"` 的行，`CommentList` 用
`id.startsWith("optimistic-")` 识别它，渲染成 60% 透明度 + `posting…` 标签，并且
**不显示编辑/删除按钮**（那条评论在服务端还不存在，点了必然 404）。

`onSettled` 里失效评论缓存，服务端返回的真行替换掉假行。
失败时 `onError` 用快照回滚，并且 **`CommentComposer` 保留草稿**——
因为一个 500 丢掉一段刚写好的复现步骤是不可接受的。

## 三、踩坑

### 坑 1：pnpm 在 Windows 上装 vitest 失败，改用 Node 内置测试运行器

计划里 Sprint 4 的测试项是 Vitest。`pnpm add -D vitest` 在链接阶段炸了：

```
[UNKNOWN] UNKNOWN: unknown error, symlink
  '..\std-env@4.2.0\node_modules\std-env'
  -> 'C:\palne\frontend\node_modules\.pnpm\node_modules\std-env'
```

pnpm 的 hoist 步骤要往 `node_modules/.pnpm/node_modules/` 建符号链接，在 Windows 上
（未开开发者模式 / 有杀软拦截）这一步会失败。已知的解法是 `.npmrc` 里开
`node-linker=hoisted`，但那会把整个仓库的 `node_modules` 布局改成扁平——
属于全项目级别的安装形态变更，不该在一个 Sprint 中途顺手做掉（CI 与 Dockerfile 都要跟着改）。
好在 pnpm 的事务完整回滚了：`package.json` 与 `pnpm-lock.yaml` 都没被改动。

于是换了一条零依赖的路：**Node 22 自带 TypeScript 类型擦除 + `node:test`**。

```bash
node --test "tests/unit/**/*.test.mts"
```

之所以可行，是因为被测模块（`types/activity.ts` / `types/comment.ts` / `types/issue.ts`）
**只有 `import type` 的相对引入**——类型擦除后运行时依赖为零，Node 直接就能加载。

代价与限制，写清楚免得后人踩：
- 用例文件必须是 `.mts` 且**显式带 `.ts` 后缀**引入（`tsconfig` 因此开了 `allowImportingTsExtensions`）；
- **`@/` 别名解析不了**，所以 `lib/url.ts` 的 `parseIssueQuery` 没被覆盖
  （它运行时引入了 `@/types/issue`）。这是这套方案的硬边界；
- 没有 watch / coverage / mock。

**结论**：零依赖方案适合"纯函数 + 契约映射表"这类逻辑，够用且立刻能跑；
等到要测组件或需要 coverage 时，再解决 pnpm 的链接问题迁到 Vitest。

### 坑 2：三个历史 lint error，`react-hooks/set-state-in-effect`

`pnpm lint` 一跑，报出 3 个 error、5 个 warning，**全部是 Sprint 1–3 的遗留**
（前几个 Sprint 的 devlog 只跑了 `tsc --noEmit` 和 `next build`，没跑 eslint，
所以这债一直隐着）。三处都是同一形态：在 `useEffect` 里同步 `setState` 做"外部值 → 本地状态"同步。

三处改法各不相同，因为**语义本来就不同**：

| 位置 | 原来 | 改成 | 为什么 |
|------|------|------|--------|
| `DeleteWorkspaceModal` | `useEffect(() => { if (!open) setTyped("") }, [open])` | 调用点条件挂载 `{deleteOpen && <Modal …/>}` | 状态本来就该随"打开"而重置。挂载即初始化，effect 直接消失 |
| `FilterBar` 搜索草稿 | effect 里 `setSearchDraft(URL 值)` | 渲染期比较前一次的 URL 值再调整 | React 官方文档给的 effect 替代方案，少一次提交、不级联 |
| `useRedirectTarget` | 挂载 effect 读 `location.search` 再 setState | `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` | `location.search` **本来就是外部 store**，这个 hook 就是为它设计的；顺带把"首帧多渲染一次"也去掉了，SSR 出真表单的目标不变 |

`useSyncExternalStore` 那处顺带值得一提：服务端快照返回 `/`，客户端 hydration 也先拿 `/`，
水合后再切到真实 `?redirect=`，所以既不产生 hydration 警告，也不再有骨架闪烁。

### 坑 3：eslint 规则 vs React 文档推荐的写法

`FilterBar` 的改法用的是 React 文档里"渲染期调整状态"（storing information from previous renders）。
它和 `react-hooks/set-state-in-effect` 并不冲突——**带条件守卫**的渲染期调整是被允许的，
无条件的才是错的。所以这里没有加任何 `eslint-disable`，规则与推荐写法同时满足。

判断标准留给后人：**同步外部系统的**用 `useSyncExternalStore`；
**从 props/URL 派生本地状态**的用渲染期调整；**重置**用条件挂载。

## 四、验收清单（按 FRONTEND_ROADMAP.md §2 Sprint 4 DoD）

| 验收项 | 结果 |
|--------|------|
| 文案映射表覆盖所有 `entity_type × action` | ✅ 37 用例全绿，7 × 3 矩阵逐格断言 |
| 时间线文案符合 §6 文案映射表 | ✅ 逐行断言（含 `priority` 枚举→中文、`assignee: null`→未指派、`labels`→顿号、`description`→字数） |
| 作者编辑评论不产生活动记录 | ✅ 前端不失效活动缓存（契约一致）；`useUpdateComment` 只碰评论缓存 |
| comments tab 切换不影响其他 tab 数据 | ✅ 三份缓存 key 独立（`comments` / `activities` / `issues`） |
| 评论编辑 / 删除按钮按作者 + Admin 控制 | ✅ 权限矩阵有回归用例（含"作者是 Viewer 也能改"这条契约澄清） |
| 评论删除二次确认 | ✅ 自己的评论一键撤销；他人评论走 Modal |
| Loading / Empty / Error 三态齐全 | ✅ `ActivityFeed`、`CommentList` 各三态 + 重试入口 |
| URL ↔ 状态同步 | ✅ `?issue=&tab=`，`tab=activity` 不写进 URL，换 Issue 清空 tab |
| `tsc --noEmit` | ✅ 零错误 |
| ESLint | ✅ 零 error 零 warning（含清掉 3 个历史 error） |
| 单元测试 | ✅ `pnpm test` → 37/37 通过（7 suites，~0.35s） |
| `next build` | ✅ 成功，11 条路由（Sprint 3 为 11 条，无回退） |
| 端到端（需后端 + DB 运行） | ⬜ 未做（本机未起 Postgres）：创建评论 → 时间线出现 → 编辑评论 → 时间线不增加条目 |

## 五、产出文件清单

新增：

```
frontend/
├── components/
│   ├── activity/ActivityFeed.tsx                 # ActivityItem + ActivityFeed（倒序时间线）
│   └── issue/
│       ├── CommentList.tsx                       # 正序对话 + 就地编辑 + 删除确认
│       └── CommentComposer.tsx                   # 常驻输入框（⌘/Ctrl+Enter）
├── tests/unit/
│   ├── activity-mapping.test.mts                 # 文案映射表全矩阵（06 契约）
│   ├── comment-permissions.test.mts              # 评论改删权限矩阵（05 契约 + 后端真码）
│   └── issue-query.test.mts                      # 查询序列化 + ordering 白名单（04 契约）
├── types/comment.ts                              # Comment + canManageComment
├── types/activity.ts                             # Activity + 文案映射 + activityDiffs
├── features/comment/{api,hooks,index}.ts         # 4 个端点 + 乐观插入/删除
├── features/activity/{api,hooks,index}.ts        # 2 个只读端点
└── docs/
    ├── devlog/sprint-4-frontend.md               # 本文件
    └── assets/
        ├── src/04-issue-drawer-thread.html        # Sprint 4 视觉稿（纯静态）
        └── preview-issue-drawer-thread.png        # 上图渲染结果 1440×900
```

改动：

| 文件 | 改了什么 |
|------|---------|
| `components/issue/IssueDrawer.tsx` | TabBar + 三个面板 + footer 输入框；`window.confirm` → `Modal`；导出 `IssueDrawerTab` / `normalizeDrawerTab` |
| `app/(protected)/w/[slug]/projects/[pid]/page.tsx` | `?tab=` 读写；开新 Issue 清空 tab |
| `components/ui/Drawer.tsx` | 新增可选 `footer` 插槽；更新过期的注释 |
| `features/issue/hooks.ts` | **修 bug**：PATCH / create / delete 后失效活动缓存 |
| `lib/time.ts` | 新增 `formatStamp`（今天 `14:03` / 今年 `17 Sep` / 更早带年份） |
| `components/issue/FilterBar.tsx` | 搜索草稿同步改为渲染期调整（清 lint error） |
| `features/auth/hooks.ts` | `useRedirectTarget` 改用 `useSyncExternalStore`（清 lint error） |
| `app/(protected)/w/[slug]/settings/page.tsx` | 删除确认模态改条件挂载（清 lint error） |
| `components/ui/Card.tsx`、`components/shell/{TopBar,AppShell}.tsx`、两处页面 | 删除未使用的引入与死 prop `TopBar.username` |
| `package.json` / `tsconfig.json` | 新增 `test` 脚本；`allowImportingTsExtensions: true` |

## 六、下一步

进入 **Sprint 5：Search + Filter + Sort + URL 同步**（Sprint 3 已经打了大部分地基）。任务：

1. `FilterBar` 补 assignee（含 `me`）多选与 labels 多选——目前只有 state / priority / search / ordering；
2. `lib/url.ts` 的解析侧补单元测试（需要先解决 `@/` 别名在零依赖测试里的解析）；
3. 排序白名单实测：非法 `ordering` 由后端 400，前端做字段级提示（现在只是整块 error 卡片）；
4. 5000 条数据下列表首屏 < 500ms 的实测；
5. 项目级活动流（`useProjectActivities` 已就位但未接线）接到 Project 主页/Aside。

**留给后面 Sprint 的账**（非阻塞）：

- `tests/` 只有纯函数覆盖，组件与 E2E 为空；迁 Vitest 的前置是解决 pnpm 在 Windows 的符号链接问题
  （`.npmrc` 加 `node-linker=hoisted` 是已知解，但要连 CI / Dockerfile 一起改）。
- `docs/assets/` 里的截图仍是**静态视觉稿**（`src/*.html` 渲染），不是真实产品截图。
  Sprint 3 就已经欠着"用真实截图替换"这笔账，本次只补了 Sprint 4 的视觉稿。
- `ActivityFeed` / `CommentList` 都只渲染分页第一页，超出部分用一行小字诚实说明；
  真正的分页在 Sprint 5 之后。
- `issue.created` / `issue.deleted` 的字段快照没有在时间线里展示（06 契约说"可按需展示"）——
  回看"创建时是什么状态"要进 API；二期再议。
