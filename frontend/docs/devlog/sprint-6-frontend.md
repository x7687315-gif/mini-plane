# Sprint 6 开发日志：BulkActionBar + 异步任务（前端）

- 日期：2026-09-17
- 执行人：前端（beigui）
- 对应计划：[FRONTEND_ROADMAP.md](../../FRONTEND_ROADMAP.md) §Sprint 6
- 契约依据：[docs/api/07-cache-and-tasks.md](../../../docs/api/07-cache-and-tasks.md)（**本 Sprint 确认并冻结**）
- 依赖：Sprint 5（Search + Filter + Sort）已合入 `main`

---

## 一、这次做了什么

Sprint 3–5 的列表都是"一次只能动一条"；Sprint 6 让它能**批量**，
并且把"批量里有一半失败了"这种情况如实告诉用户，而不是报一个非黑即白的 toast。

1. **`IssueRow` 行选择**：前置 checkbox，`checked` 时整行加一级 accent 底色。
2. **`<BulkActionBar>`**：浮在列表底部，含 state / priority / assignee / labels / delete
   五个动作 + 选中计数 + 进度 + 一键清空选择。
3. **`types/task.ts` + `features/task/*`**：TaskRun 类型、查询端点、轮询 hook，
   以及把**轮询策略**抽成纯函数 `features/task/polling.ts`。
4. **`stores/toast.ts` + `<Toaster>`**：按 SCREEN_BLUEPRINTS §5.3 的"顶部细线 banner，
   3s 自动消失"实现（不是角落浮层）。挂在 root layout，全局可用。
5. **两条批量路径**：
   - **labels → 服务端异步**（`POST …/issues/bulk/labels/` → 202 + TaskRun → 轮询）；
   - **state / priority / assignee / delete → 前端编排的 N 次串行请求**（后端没有对应端点）。
6. **乐观更新 + 服务端收敛**：所有被选中的行在点击瞬间就地打补丁，操作结束后统一重取。
7. **活动缓存成对失效**：批量改标签会为每个"真的变了"的 Issue 写活动留痕（07 契约 §2.1），
   所以两个活动缓存都要作废。
8. **测试 54 → 70 用例**（新增 16 条，覆盖轮询停止/超时/文案）。

## 二、怎么做的（关键实现说明）

### 2.1 只有 labels 有批量端点 —— 这件事必须说出口

`backend/apps/issues/urls.py` 里跟批量相关的路由只有一条：

```
POST /workspaces/{slug}/projects/{pid}/issues/bulk/labels/     → 202 + TaskRun
GET  /workspaces/{slug}/projects/{pid}/tasks/{task_id}/        → TaskRun
```

state / priority / assignee / delete **没有**批量端点。于是有两条路：

1. 只做 labels，其余四个动作不做 —— 不诚实地阉割掉计划里的功能；
2. 其余四个用 `N 次单条请求` 在前端编排 —— 能做，但有两个必须承认的代价。

选了 2，并把代价全部摆在界面上：

| 代价 | 表现 | 处理 |
|------|------|------|
| **不原子** | 5 条里可能 3 条成功 2 条失败 | toast 说 `3/5 成功 · 2 个失败（首个原因：…）`，**不**说"失败" |
| **慢** | 50 条 = 50 个串行请求 | 进度显示 `12/50`；串行是刻意的（见下） |

**为什么串行而不是并发**：50 个并发 PATCH 打到同一个库上是自伤式惊群，
而且并发会让进度数字变成谎话（"已完成 12"到底是谁的 12）。
串行的代价是慢，但慢是可见的；惊群是看不见的。

**为什么不用 `Promise.allSettled` 图快**：同上。这个项目的数据量级还远没有到
需要为批量操作做并发优化的地步。

代码里留了一句给未来的话：**后端一旦有了真正的批量端点，`useBulkUpdateIssues` /
`useBulkDeleteIssues` 应该被删掉，而不是留着"以防万一"** —— 两条写批量的路是漂移的开始。

### 2.2 复选框逼出的一次结构重构

Sprint 3 的 `IssueRow` 整行就是一个 `<button>`。加复选框时最自然的写法是把它塞进去，
但那是**无效 HTML**：`<button>` 不允许有可交互的后代，浏览器行为未定义，
而且键盘用户根本 tab 不到那个 checkbox。

所以行结构拆成 flex 外层 + 内层 button：

```
<div class="flex items-center gap-3">          ← 行容器（底色/hover 在这层）
  <label><input type="checkbox" /></label>     ← 新的选择列
  <button class="flex-1 grid grid-cols-[…]">   ← 原来的五列，一行没动
```

**内层 grid 完全没改**，所以列宽与表头、骨架屏仍然对齐 —— 这是这次拆分的关键约束：
只加一列，不重排任何东西。checkbox 那一列顺带 `stopPropagation`，
免得勾选时把抽屉也打开了。

视觉上 checkbox 没有用浏览器原生外观（`appearance-none` + accent 方块），
因为原生复选框在暖灰纸面上是一块系统蓝，跟 Blueprint Editorial 完全不是一套语言。

### 2.3 labels 要显式 apply，其余不要

其余四个动作是"设成某个值"，点一下就能立即下发 —— 符合"filter chip 立即触发"的约定。

labels 不行，两个原因：

1. **契约是覆盖式**：07 §2.1 明确"把选中 Issue 的标签整体替换为 `label_ids`，
   空数组 = 清空标签"。所以每点一次 checkbox 就发一批请求是错的，
   用户勾 3 个标签会变成 3 次"整体替换"。
2. **"加一个标签"根本无法表达**：选中的 5 个 Issue 各自挂着不同的标签集，
   "给它们都加上 bug"和"把它们都设成 {bug}"是两件不同的事，而端点只支持后者。

所以这个控件叫 `labels (replace)`，勾选只改本地草稿，旁边一个 `apply` 按钮才下发。
把限制写进标签文字，比写在文档里有效。

### 2.4 把轮询策略抽成纯函数 —— 因为"停不下来的轮询"是最安静的 bug

第一版把停止条件直接写在 `useQuery` 的 `refetchInterval` 闭包里。它当然能跑，
但 Sprint 6 的验收项明明白白写着"unit: TaskRun 轮询直到 success/failure，30 次后超时" ——
闭包里的逻辑测不到，那条验收就只能靠肉眼。

于是抽成 `features/task/polling.ts`：

```ts
export function nextTaskPollDelay(run, attempts): number | false {
  if (run && isTerminalTaskRun(run.status)) return false;   // 终态优先
  if (attempts >= TASK_POLL_MAX_ATTEMPTS) return false;     // 预算兜底
  return TASK_POLL_INTERVAL_MS;
}
```

抽出来之后立刻发现一个边界必须写明：**预算 30 意味着第 30 次观察仍然允许、第 31 次不允许**。
这种 off-by-one 在闭包里永远不会有人去确认，写成函数 + 用例就变成了一次性决定的事。

配套的 `describeTaskStatus` 也一并抽了，因为里面有一条**必须区分**的语义：

- `issues` = 这批任务有几个 → 用户看到的总是 5
- `changed` = 有几个**真的变了** → 可能只有 3

07 契约说"标签没变的 Issue 不产生任何噪声"，所以 `5 个里变了 3 个` 是正常结果，
不是部分失败。UI 如果说"3/5 成功"就是造谣 —— 所以批量改标签的完成文案走
`describeTaskStatus`（`3 of 5 changed`），而前端编排的那两条路径才用 `3/5 成功`。
**这两种"3/5"含义不同，不能共用一句话。**

### 2.5 toast 是顶部细线 banner，不是角落浮层

SCREEN_BLUEPRINTS §5.3 写的是"全局错误：顶部细线 banner，3s 后自动消失"。
所以 `<Toaster>` 固定在 TopBar 之下、通栏、只有一条下边框着色 ——
和设备本身的错误语言（字段级错误是"边框变 urgent + 下方红字"）是同一套语法，
而不是又一个圆角阴影浮层。

自动消失的计时器**放在每个 item 自己身上**（`useEffect` + `setTimeout`），
不放在 store 里。原因：store 的任何无关变更都会重渲染列表，
如果计时器是 store 的职责，一次重渲染就可能把计时器重排，让一条本该消失的提示赖在屏幕上。

`push()` 只返回 id，不返回定时器；`dismiss()` 只删数据。
**store 不持有副作用**，这是它可测的前提。

error 的 ttl 是 6s（其余 3s）：用户读不完的失败提示，等于没提示 —— 他会再犯一次。

### 2.6 选择态不进 URL，且**绑定当前查询**

上面所有筛选状态都进 URL，这是 Sprint 3 定下的规矩。选择态是刻意的例外：

- 选择是**短暂意图**（像选中一段文字），不是可分享的视图状态；
  把 30 个 uuid 塞进地址栏会让每条分享链接都变得不可读；
- 但它必须**绑定当前查询**：把 `serializeIssueQuery(query)` 存成 `key`，
  筛选一变就作废（渲染期派生，不写 effect）。

第二条是安全相关的，不只是体验：否则"3 selected"可能指的是用户**已经看不见**的行，
一次批量删除就会动到它们。

### 2.7 批量改标签之后必须失效活动缓存

07 §2.1 写得很直接：

> 任务执行时，每个标签**真的发生变化**的 Issue 都会写一条 `issue.updated` 活动留痕
> ……前端因此可以在批量操作后照常收到推送与时间线，无需特殊处理。

"无需特殊处理"指的是**不需要为批量路径写一套特殊逻辑**，但缓存失效一条都不能少 ——
否则批量改完标签，审计时间线上什么都没有（这正是 Sprint 4 修过的那个 bug 的翻版）。
所以 `useBulkSetLabels.onSettled` 同时作废 issue 列表与两个活动缓存。

### 2.8 乐观更新放在哪一层

三条批量路径都在 `onMutate` 里给所有选中行打补丁（`useBulkUpdateIssues` 按
`vars.optimistic` 传入的已解析对象，`useBulkDeleteIssues` 直接按 id 剔除）。
理由和单条 PATCH 一样：**点完要立刻有反应**，不然 50 条串行请求会让界面僵住十几秒。

但乐观更新之后**必须收敛**：`onSettled` 里统一重取列表。
被服务端拒绝的那些字段会在重取后还原 —— 界面上看到的最终一定是服务端的真实状态。
这是"乐观"和"说谎"的分界线。

## 三、踩坑

### 坑 1：中文文案里的半角引号，一次踩两遍

同一个错误犯了两次，而且报错位置完全不同：

1. **测试名**里写了 `test("… 提示"还在跑" …")` → `TS1005: ',' expected`（字符串提前结束）。
2. **JSX 文案**里写了 `可能出现"删了一半"` → `react/no-unescaped-entities` 报 `"` 未转义。

第二处还额外提醒了一件事：`react/no-unescaped-entities` 这条规则**本来就在保护我们** ——
散落在 JSX 文本里的裸引号在 JSX 里是合法的（不是属性值），但它会让 diff 和搜索变得含糊。

**结论**：这个项目的中文文案里，引号一律用「」/『』，不用 `"` / `'`。
已经写进 devlog 的，后面按这个来。

### 坑 2：从别处抄来的乐观更新骨架里留了一行死代码

`useBulkUpdateIssues.onMutate` 第一版有这么两行：

```ts
const { issueId: _ignored, ...patch } = vars as BulkUpdateVars & { issueId?: string };
// …
return { prevLists, patch };
```

那是从单条 `useUpdateIssue` 的骨架里顺手带过来的 —— 但那边的 mutation 变量里
**有** `issueId`，批量这边根本没有这个字段。多出来的下划线变量和没用的 `patch`
直接触发了 `@typescript-eslint/no-unused-vars`。

**教训**：乐观更新的三段式骨架（cancel → snapshot → patch → rollback → invalidate）
是高度可复制的，但**变量契约不是**。抄骨架的时候要逐行确认每个变量真有来源。

### 坑 3：`useTaskRun` 里的超时判断原本没有出口

第一版把上限判断写成"数到 30 就停"，但没定义停下来之后 UI 显示什么 ——
结果是到第 31 秒界面上那行 `running…` 永远停在那里，看起来像还在跑。

抽出 `isTaskTimedOut()` 之后才明确：**超时必须是一种可见状态**
（"还在跑，我不再往下轮询了"），而不是"轮询悄悄消失"。
和 §2.4 是同一件事的两面 —— 停止条件和停止后的表达，都是策略的一部分。

## 四、验收清单（按 FRONTEND_ROADMAP.md §2 Sprint 6 DoD）

| 验收项 | 结果 |
|--------|------|
| `IssueRow` 多选 checkbox | ✅ 前置一列，内层五列 grid 未改动；行底色区分选中 |
| `<BulkActionBar>`（浮出）：改 state / priority / labels / assignee / 删 | ✅ 五个动作齐备 |
| 批量操作调用 `POST …/issues/bulk/labels/`（202） | ✅ 异步 + TaskRun 轮询 |
| `<TaskProgress>` 组件（轮询 `/tasks/{task_id}/`，1s / 上限 30） | ✅ `useTaskRun` + `describeTaskStatus`，策略有 16 条单测 |
| 任务完成 / 失败 toast | ✅ 成功报 `changed/issues`，失败透出后端原因 |
| unit: TaskRun 轮询直到 success/failure，30 次后超时 | ✅ `tests/unit/task-polling.test.mts` |
| 批量操作不阻塞 UI（乐观更新本地 state） | ✅ `onMutate` 就地打补丁，`onSettled` 收敛 |
| 任务失败有清晰提示 + 重试入口 | ⚠️ 提示有（逐项失败数与首个原因）；**重试入口没有**——用户需要重新点一次动作，因为三条路径的参数都在组件状态里。列入 §六 |
| e2e: 多选 3 个 issue → 批量加 bug label → 列表 + 详情都更新 | ⬜ 未做（无 E2E 基建） |
| `tsc --noEmit` | ✅ 零错误 |
| ESLint | ✅ 零 error 零 warning |
| 单元测试 | ✅ `pnpm test` → **70/70**（13 suites，~0.45s） |
| `next build` | ✅ 成功，11 条路由 |

## 五、产出文件清单

新增：

```
frontend/
├── types/task.ts                          # TaskRun + isTerminalTaskRun
├── features/task/
│   ├── api.ts                             # GET …/tasks/{id}/
│   ├── hooks.ts                           # useTaskRun（轮询）
│   ├── polling.ts                          # 轮询策略（纯函数，可测）
│   └── index.ts
├── stores/toast.ts                        # toast 队列（无副作用）
├── components/ui/Toaster.tsx              # 顶部细线 banner
├── components/issue/BulkActionBar.tsx     # 批量操作浮出条
├── tests/unit/task-polling.test.mts       # 16 用例
└── docs/devlog/sprint-6-frontend.md       # 本文件
```

改动：

| 文件 | 改了什么 |
|------|---------|
| `components/issue/IssueRow.tsx` | 拆成 flex 外层 + 内层 button，加选择列（无效 HTML 修复） |
| `features/issue/api.ts` | 新增 `bulkSetLabels()`（202 + TaskRun） |
| `features/issue/hooks.ts` | 新增 `useBulkSetLabels` / `useBulkUpdateIssues` / `useBulkDeleteIssues` |
| `app/(protected)/w/[slug]/projects/[pid]/page.tsx` | 选择态（绑定查询）+ 传 checkbox + 挂 BulkActionBar |
| `app/layout.tsx` | 挂全局 `<Toaster>` |
| `package.json` | `test` 脚本的 glob 未变（loader 已就位） |

## 六、下一步

进入 **Sprint 7：WebSocket Realtime**（契约 `08-realtime.md`，实现后冻结）。任务：

1. `features/realtime/ws.ts`：原生 WebSocket + 指数退避重连；
2. `stores/ws.ts`：连接状态机 + 事件分发；
3. `<ConnectionStatus>` 挂进 TopBar（现在 TopBar 的 `connection` prop 是写死的 `"live"`，
   正好接上）；
4. 进 `/w/:slug/projects/:pid` 建连、离开断开；
5. `issue.updated` → 更新 issue 缓存 + 追加活动；`comment.created` → 追加评论；
6. 重连后**全量刷新**兜底（08 契约明确不做断线补发）；
7. `4401` → 跳 `/login`；`4404` → 提示且不自动重连。

**留给后面 Sprint 的账**：

- **批量失败的重试入口**（本次验收里那条 ⚠️）。当前只提示不重试；
  正确做法是把"失败的那几个 id"留在 bar 里，给一个 `retry failed` 按钮。
  不是难点，是本次没做。
- `docs/assets/` 的截图仍是静态视觉稿；批量操作条与实时状态都没有截图。
- 组件测试与 E2E 仍为空（Sprint 8 的 CI 会把 E2E 一起收）。
- 07 契约的缓存部分前端**没有可做的事**（缓存是服务端行为，前端只是消费者）——
  本 Sprint 只确认了"异步任务"那一半，契约文档里已分别标注。
