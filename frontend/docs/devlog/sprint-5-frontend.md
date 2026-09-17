# Sprint 5 开发日志：Search + Filter + Sort + URL 同步（前端）

- 日期：2026-09-17
- 执行人：前端（beigui）
- 对应计划：[FRONTEND_ROADMAP.md](../../FRONTEND_ROADMAP.md) §Sprint 5
- 契约依据：[docs/api/04-issues.md](../../../docs/api/04-issues.md)（**已冻结**）
- 依赖：Sprint 4（Comment + Activity）已合入 `main`

---

## 一、这次做了什么

Sprint 3 已经把「筛选写进 URL」的骨架搭好了（state / priority / search / ordering / page）；
Sprint 5 把它补成**完整的查询引擎界面**，并把两个此前没法测的地方补上：

1. **`<MultiSelect>`**：`components/ui/MultiSelect.tsx` —— 多值下拉（可勾选、菜单不自动关闭），
   用于 `labels` 这类"可能很多、chip 排不下"的字段。与 `<EditableField>` 共用一套视觉语法。
2. **FilterBar 补两个 facet**：`assignee`（含字面量 `me`）与 `labels`（多值 OR）。
   现在五个 facet 与 `04 契约 §GET …/issues/` 的参数表一一对应。
3. **防抖 300ms → 250ms**，对齐 Sprint 5 计划里写的数值。
4. **400 参数错误改成字段级提示**：把后端 `{"ordering": ["不支持的排序字段：title。"]}`
   拆成「字段名 + 后端原文」，并直接给出「clear filters」出口。
5. **查询串不再出现 `%2C`**：`serializeIssueQuery` 手写序列化，逗号保持字面量。
6. **测试基建补上一块**：`tests/alias-loader.mjs` 让零依赖的 `node --test` 也能解析 `@/` 别名，
   于是 `lib/url.ts` 的**解析侧**终于被覆盖（Sprint 4 记的那笔账还掉了）。
7. **测试从 37 → 54 用例**（新增 17 条 URL 解析/往返/计数）。

## 二、怎么做的（关键实现说明）

### 2.1 `labels` 用多选下拉，不是 chip 行

`state` 和 `priority` 用 chip 是因为它们的取值**有界且少**（5 个状态、5 个优先级），
一排 chip 就是完整的信息。

`labels` 不一样：项目里标签数量没有上界，chip 行会长到把筛选栏挤爆，而"标签云"本身
也不是筛选控件该有的样子。所以用下拉。

**下拉菜单点选后不关闭**，这是刻意的：一次筛三个标签是一个意图，不是一个意图做三次；
每选一次都要重开菜单是多选筛选最常见的烦人之处。关闭方式保留 Esc / 点外部 / 点触发器本身。

触发器宽度固定（最多显示 2 个色块 + 一个数字），所以选中 1 个和选中 8 个不会让工具栏跳动。

### 2.2 `assignee` 只列项目成员，并且**不提供「未指派」**

04 契约两条硬规则：

> `assignee` 取用户 id 或 `me`；指向**不存在或非项目成员**的用户 → **空结果**（不报错）

所以下拉里的候选必须来自 `GET …/projects/{pid}/members/`，**不是**工作区成员 ——
用工作区成员会让人选到一个"合法的 id 但查不出任何东西"的选项，列表变成"nothing matches"，
而用户完全不知道自己选错了什么。这和 Sprint 3 在 IssueDrawer 里踩过的坑是同一个。

另外刻意**没有做「未指派 / assignee=none」**：后端还没有这个语义（04 契约 §明确不做
里写明"筛选不支持未指派，二期补"）。UI 不能提供后端兑现不了的选项，
否则就是一个永远返回空结果的按钮。

`me` 作为**字面量**原样透传给后端，前端不做本地解析 —— 契约规定 `me` 由服务端解释。

### 2.3 查询串里的逗号保持字面量

`URLSearchParams` 会把 `,` 编码成 `%2C`，于是地址栏变成：

```
?state=s-1%2Cs-2&priority=high%2Curgent
```

后端解码后行为完全一致，所以这**不是 bug**；但把筛选状态放进 URL 的全部意义
（SCREEN_BLUEPRINTS §2.7：可分享、可手改、刷新保留）建立在一个前提上 ——
**人能读懂这个地址**。`%2C` 让"把这个视图发给同事"变成"发一串机器码"。

逗号是 RFC 3986 的 `sub-delim`，在 query 里不必编码，所以改成手写序列化：

```ts
function encodeQueryValue(value: string): string {
  return encodeURIComponent(value).replace(/%2C/gi, ",");   // 只放过逗号
}
```

其余字符照旧编码 —— `search` 里的空格、`&` 不能把查询串拆掉。

**这条是测试抓出来的**：往返测试断言"URL → 筛选 → URL 应等于原串"，第一次跑就红了。

### 2.4 非法 URL 参数：两层策略

能产生非法参数的办法只有两种：手改地址栏、或者一个过期的分享链接。
UI 自身产生的值全部来自白名单常量（`ISSUE_ORDERING_OPTIONS` / `PRIORITY_VALUES`），
不可能非法。所以分两层：

| 层 | 对象 | 策略 | 理由 |
|----|------|------|------|
| 解析层 | 白名单类字段（`priority` / `ordering`） | **静默丢弃** | 用户看不到"错误"，只看到少了一个筛选；不打断浏览 |
| 解析层 | 结构性字段（`page` 非整数 / 0 / 负数） | **回落到 1** | 页码无效不该让整页报错 |
| 传输层 | 后端仍返回 400 | **字段级提示 + clear 出口** | 丢弃不掉的（比如契约未来新增但前端还不认识的枚举）如实转达 |

第 3 行是把 Sprint 3 的"一句「参数不合法」"升级成契约里那张校验文案表：

```
ordering  不支持的排序字段：title。
```

并配一个 clear 按钮 —— 报错必须给出路，否则用户只能手动删 URL。

### 2.5 终于能测 `lib/url.ts`：一个 20 行的别名加载器

Sprint 4 记的账是："`@/` 别名解析不了，所以只能测自身只有 `import type` 相对引入的纯模块"。
`lib/url.ts` 恰好有一条**运行时**别名引入（`PRIORITY_VALUES` from `@/types/issue`），
于是整个 URL 解析侧是盲区 —— 而它正是"手改 URL / 后退 / 粘贴链接"三条路径的共同入口。

解法是 Node 官方的自定义 loader：`node:module` 的 `register()`（Node ≥20.6）注册一个
`resolve` 钩子，把 `@/x` 试成 `<frontend>/x` 并补上 ESM 需要的扩展名。

```js
// tests/alias-loader.mjs
if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
  const candidate = new URL(new URL(specifier.slice(2), ROOT).href + ext);
  if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true };
}
```

三个设计约束：

- **只由 `test` 脚本加载**，不进应用产物，对 `next build` 零影响；
- **只改 `@/`**，其它说明符原样交给 Node —— 不要在这个钩子里发明第二套解析规则；
- 候选里要有**空扩展名**那一项，因为用例写的是 `@/lib/url.ts`（带后缀），
  漏了它就会去试 `url.ts.ts`（第一版就是这么挂的，见 §3.2）。

仍然做不到的：**组件测试**（需要 JSX 转换）。所以 `tests/` 的定位很清楚 ——
"纯函数与契约映射表"，不是完整的测试金字塔。

### 2.6 URL 同步延迟

验收项写的是"URL 同步 100ms 内完成"。实现上筛选变更走的是
`router.replace(qs, { scroll: false })`，Next.js 的 App Router 会同步更新
`useSearchParams()`，`parseIssueQuery` 是纯函数，所以从点击到 URL 变更再到
React Query key 变化都在同一个 tick 内，唯一的等待是 250ms 搜索防抖（那是**故意**的延迟，
不是同步开销）。没有引入任何 debounce 到 chip / 下拉上。

## 三、踩坑

### 坑 1：往返测试第一次跑就红了 —— `URLSearchParams` 编码逗号

期望 `state=s-1,s-2`，实际 `state=s-1%2Cs-2`。

值得记的不是这个 API 的行为（它没错），而是**为什么现在才发现**：Sprint 3 写
`serializeIssueQuery` 时用的是 `URLSearchParams`，当时没有任何测试，
所以"地址栏里是一串 `%2C`"这件事整整两个 Sprint 没人看见。修复见 §2.3。

### 坑 2：别名 loader 的候选列表漏了"已带扩展名"

第一版候选是 `[".ts", ".tsx", "/index.ts", "/index.tsx"]`，
而用例写的是 `@/lib/url.ts`（显式后缀，与零依赖 TS 测试的约定一致），
于是 loader 去试 `lib/url.ts.ts`，全部落空，回落到 Node 原生解析 → `ERR_MODULE_NOT_FOUND`。

**教训**：解析器的候选表必须覆盖"调用方可能已经给出完整文件名"这一情形，
否则表现是"文件明明在，却报找不到"。

### 坑 3：5000 条的流畅度验收**在本机复现不了**

Sprint 5 的验收里有一条"5000 条数据下列表流畅（首屏渲染 < 500ms）"。必须说清楚：

- 前端**每页最多渲染 100 行**（`per_page` 默认 50、上限 100），
  渲染量与该数据集的绝对规模无关 —— 5000 条和 50000 条对本页的 DOM 成本是一样的；
- 真正的规模成本在**后端**：`COUNT(*)` 与 `icontains` 扫描。Sprint 5（后端）已用
  `seed_issues --seed 42` + `benchmark_issues` 实测过（默认列表 1.99ms → 0.195ms，
  5000 条 `search` 2.37ms）；
- 本机没有跑起来的 Postgres，所以我**没有**编造一个前端渲染耗时数字。

**结论**：这条验收项的归属应该是后端查询计划，前端部分只能承诺"渲染量与页大小成正比"。
要真做端到端首屏测量，需要先起后端 + 造数，属于联调范围（见 §六）。

## 四、验收清单（按 FRONTEND_ROADMAP.md §2 Sprint 5 DoD）

| 验收项 | 结果 |
|--------|------|
| `<FilterBar>` 完整版：state 多选 / priority 多选 / assignee（含 me）/ labels 多选 / search / ordering | ✅ 五个 facet 齐备，与 04 契约参数表一一对应 |
| URL 双向同步（issue list 与 filter state） | ✅ 纯函数 + `router.replace`，URL 仍是唯一事实来源 |
| filter chip 立即触发（无 Apply 按钮） | ✅ chip / 下拉 / 多选都是即时写入 |
| sort dropdown 触发 | ✅ `ISSUE_ORDERING_OPTIONS` 白名单常量 |
| search 250ms debounce | ✅ `SEARCH_DEBOUNCE_MS = 250`（原 300） |
| 排序选项严格使用后端白名单 | ✅ 6 个值，有单测钉住 |
| 非法参数后端返回 400 → 字段级提示 | ✅ 拆 `flattenErrors`，逐字段列后端原文 + clear 出口 |
| unit: URL → filter 解析（含 `me` 关键字、多值逗号） | ✅ `tests/unit/url-parse.test.mts`（新增别名 loader） |
| unit: filter → URL 序列化（移除空值、保留合法值） | ✅ 含往返测试 |
| e2e: 应用 filter → 复制 URL → 新窗口 → filter 一致 | ⬜ 未做（无 E2E 基建，见 §六） |
| 非法参数不报错在前端（默默忽略或展示字段错误） | ✅ 两层策略，各有单测 |
| 5000 条数据下列表流畅 | ⚠️ 归属后端查询计划，前端只承诺渲染量 ∝ 页大小（见 §3.3） |
| `tsc --noEmit` | ✅ 零错误 |
| ESLint | ✅ 零 error 零 warning |
| 单元测试 | ✅ `pnpm test` → **54/54**（10 suites，~0.44s） |
| `next build` | ✅ 成功，11 条路由 |

## 五、产出文件清单

新增：

```
frontend/
├── components/ui/MultiSelect.tsx        # 多值下拉（勾选、菜单不自动关闭）
├── tests/
│   ├── alias-loader.mjs                 # `@/` 别名 resolve 钩子（仅测试用）
│   ├── register-loader.mjs              # node:module register()
│   └── unit/url-parse.test.mts          # URL 解析 / 往返 / 活跃筛选计数（17 用例）
└── docs/devlog/sprint-5-frontend.md     # 本文件
```

改动：

| 文件 | 改了什么 |
|------|---------|
| `components/issue/FilterBar.tsx` | 补 `assignee`（含 `me`）+ `labels` 多选；防抖 250ms；三行布局；导出 `ME` 常量 |
| `types/issue.ts` | `serializeIssueQuery` 改为手写序列化，逗号保持字面量（不再 `%2C`） |
| `components/ui/index.ts` | 导出 `MultiSelect` |
| `app/(protected)/w/[slug]/projects/[pid]/page.tsx` | 取 labels / members；400 改字段级提示；用 `hasActiveFilters` 判定空态 |
| `package.json` | `test` 脚本挂上别名 loader |

## 六、下一步

进入 **Sprint 6：BulkActionBar + 异步任务**（契约 `07-cache-and-tasks.md`，实现后冻结）。任务：

1. `IssueRow` 多选 checkbox（`BulkActionBar` 出现的前置）；
2. `<BulkActionBar>` 浮出条：改 state / priority / labels / assignee / 删；
3. 批量改标签走 `POST …/issues/bulk/labels/` → **202 + TaskRun**；
4. `<TaskProgress>` 轮询 `GET …/tasks/{task_id}/`（1s 间隔、上限 30 次），完成/失败 toast；
5. 批量完成后活动留痕与 08 契约的 `issue.updated` 推送照常，前端**不需要特殊处理**
   （07 契约 §2.1 明确"与单条 PATCH 同语义"）。

**留给后面 Sprint 的账**：

- `tests/` 只有纯函数覆盖，组件与 E2E 仍为空；E2E 需要先装 Playwright（会在 GitHub Actions
  里跑，本机跑不了浏览器二进制分发）。Sprint 8 的 CI 会把这条一起收。
- `docs/assets/` 的截图仍是静态视觉稿（`src/*.html` 渲染），不是真实产品截图 —— 这笔账
  Sprint 3 和 4 都记着，要起后端 + 造数才能还。
- FilterBar 的 chip / 下拉都只表达"同层 AND + 单字段 OR"，与 04 契约 §明确不做 一致；
  复杂布尔组合是二期的事。
