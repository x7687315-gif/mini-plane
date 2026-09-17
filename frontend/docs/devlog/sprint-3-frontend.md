# Sprint 3 开发日志：Issue 核心（前端）

- 日期：2026-09-17
- 执行人：前端（beigui）
- 对应计划：[FRONTEND_ROADMAP.md](../../FRONTEND_ROADMAP.md) §Sprint 3
- 契约依据：[docs/api/04-issues.md](../../../docs/api/04-issues.md)
- 依赖：Sprint 2（Workspace + Project）已合入 `main`

---

## 一、这次做了什么

Sprint 3 是 MVP 最重要的一环：**Issue 列表 + 详情抽屉 + 就地编辑 + 筛选**。本次交付：

1. **类型层**：`types/issue.ts` —— Issue / Label / priority 字符串枚举 / ordering 白名单 / `serializeIssueQuery()`（把对象转成后端的逗号分隔多值形式）/ `formatIssueId()`。
2. **API 层**：`features/issue/api.ts` —— Issue CRUD 5 个 + Label CRUD 4 个。
3. **Hook 层**：`features/issue/hooks.ts` —— 含**乐观更新**的 `useUpdateIssue`（详见 §2.3）。
4. **URL 状态层**：`lib/url.ts`（纯函数：parse / 计数）+ `features/issue/useIssueFilters.ts`（React 绑定）。
5. **时间工具**：`lib/time.ts` —— 统一时间格式（`formatDistanceToNow` / `formatDateTime` / `formatTime` / `formatDate`）。
6. **EditableField 组件**：`components/ui/EditableField.tsx` —— 就地编辑下拉（状态 / 优先级 / 指派人 / 标签），带颜色圆点 + 选中勾。
7. **IssueRow**：`components/issue/IssueRow.tsx` —— 列表行（编号 / 标题 / 标签 / 优先级 / 头像）。
8. **FilterBar**：`components/issue/FilterBar.tsx` —— 状态 chips + 优先级 chips + 防抖搜索 + 排序 + 清除。
9. **IssueDrawer**：`components/issue/IssueDrawer.tsx` —— 详情抽屉，四个元字段全部可就地编辑。
10. **CreateIssueModal**：`components/issue/CreateIssueModal.tsx` —— 创建表单（仅 title 必填）。
11. **Issue 列表页**：`app/(protected)/w/[slug]/projects/[pid]/page.tsx` —— 核心页面，含分页 / 空状态 / 骨架屏。

## 二、怎么做的（关键实现说明）

### 2.1 URL 是筛选状态的唯一来源

筛选条件（state / priority / assignee / labels / search / ordering / page）全部存在 URL query 里，没有第二份 Zustand 副本：

```text
URL  ?state=<uuid>,<uuid>&priority=high,urgent&search=login&ordering=-priority&page=2
        │
        ├─ useIssueFilters()  ← 解析 + 写入
        ├─ useIssues(query)   ← React Query key 的一部分
        └─ IssueDrawer        ← 另占 ?issue=<id>
```

**为什么不用 Zustand 存筛选**：两份状态必然漂移。用户手动改 URL、或点后退键时，Zustand 不会同步，UI 就会显示 A 但请求 B。用 URL 单一来源，这些场景自动正确。

两个细节：

- 用 `router.replace` 而不是 `push` —— 调筛选不该塞满浏览器历史，后退应该回到「进入这个列表之前的页面」。
- `scroll: false` —— 换筛选条件时列表不能跳回顶部。

### 2.2 多值参数的序列化

后端约定（04 契约）：同一字段多值用**逗号分隔**，字段之间是 **AND**，字段内部是 **OR**。

```ts
// types/issue.ts
export function serializeIssueQuery(q: IssueListQuery): string {
  const params = new URLSearchParams();
  if (q.state?.length) params.set("state", q.state.join(","));
  if (q.priority?.length) params.set("priority", q.priority.join(","));
  // …assignee 可以是用户 id 或字面量 "me"
  if (q.page && q.page > 1) params.set("page", String(q.page)); // page=1 不写进 URL
  return params.toString();
}
```

`page=1` 刻意不写进 URL —— 保持地址栏干净，也让「清空筛选」后的 URL 和首次进入时完全一致。

### 2.3 乐观更新：`useUpdateIssue`

改状态/优先级是最高频的操作，必须**瞬时反馈**。React Query 的三段式：

```ts
onMutate: async (vars) => {
  await qc.cancelQueries({ queryKey: issueKeys.all(slug, projectId) }); // 1. 停掉在途请求
  const prevLists  = qc.getQueriesData({ queryKey: issueKeys.lists(slug, projectId) });
  const prevDetail = qc.getQueryData(issueKeys.detail(slug, projectId, vars.issueId));
  // 2. 就地打补丁
  qc.setQueriesData({ …lists }, old => old ? { …old, results: old.results.map(patch) } : old);
  qc.setQueryData(detailKey, patch(prevDetail));
  return { prevLists, prevDetail };                                    // 3. 交回滚快照
},
onError: (_e, _v, ctx) => { /* 用快照回滚 */ },
onSettled: () => { /* invalidate 让服务端值收敛 */ },
```

**关键设计**：mutation 的变量里除了 `payload`（要发给后端的 id），还有一个 `optimistic` 字段携带**已解析的对象**：

```ts
updateMutation.mutate({
  issueId,
  payload:    { state_id: next.id },        // 发给后端
  optimistic: { state: next },              // 给缓存打补丁用
});
```

为什么要多传一个 `optimistic`：如果只有 `state_id`，UI 要渲染新状态名就得先去 states 数组里查一遍 —— 那一查就是一次额外的同步逻辑，而且在「状态列表还没加载完」时会渲染成空白。直接传对象，缓存补丁是纯数据替换，零查找。

### 2.4 指派人候选必须用**项目成员**

04 契约里有一条容易踩的规则：

> assignee 规则：被指派者必须是该项目的 `ProjectMember`。仅在工作区层级是 Admin、但未加入该项目的人**不能**被指派。

所以 `IssueDrawer` 和 `CreateIssueModal` 的指派人下拉用的是 `useProjectMembers(slug, pid)`，**不是** `useWorkspaceMembers(slug)`。用错了会得到 400 `{"assignee": ["所选用户不是该项目成员。"]}`。

### 2.5 ordering 白名单与「稳定排序」

后端的 `ordering` 有白名单，非法值直接 400：

| 值 | 语义 |
|---|---|
| `-created_at`（缺省） | 最新在前 |
| `created_at` | 最早在前 |
| `sequence_id` / `-sequence_id` | 按编号 |
| `priority` / `-priority` | **按严重度**（urgent→none），不是字母序 |

前端用 `ISSUE_ORDERING_OPTIONS` 常量收敛，UI 上不可能产生非法值。

另外契约里提到后端**每个排序都会追加 `sequence_id` 作为次级键** —— 因为 `created_at` 在 Windows 上精度约 15ms，同一批创建的 Issue 时间戳可能完全相同，没有唯一键时翻页会重复/丢记录。这是后端保证的，前端不需要额外处理，但值得知道：**不要假设「同一次创建的记录有稳定顺序」**。

### 2.6 `page` 越界的语义

契约明确：`page` 越界返回 **200 + 空 results**，`count` 仍是真实总数。

所以空列表有两种，前端必须区分：

```tsx
// lib/url.ts
export function hasActiveFilters(q) { … }

// 页面里
<EmptyIssues filtered={hasActiveFilters(query)} … />
```

- `filtered = false` → "No issues yet" + 创建引导
- `filtered = true` → "Nothing matches these filters" + 清除筛选按钮

如果不区分，用户筛没了会以为项目是空的。

### 2.7 Drawer 用 `?issue=<id>` 而不是路由

Issue 详情**不是独立路由**，而是列表页上的 `?issue=<id>`：

```tsx
const setOpenIssue = (id) => {
  const next = new URLSearchParams(searchParams.toString());
  if (id) next.set("issue", id); else next.delete("issue");
  router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
};
```

好处：**打开抽屉不销毁列表**。如果做成 `/w/:slug/projects/:pid/issues/:id`，每次开关都会重新挂载列表（滚动位置丢失、请求重发）。用 query 参数则列表始终在下面挂着，只是被遮罩盖住 —— 关掉抽屉时滚动位置完好。

同时 URL 仍然可分享：把带 `?issue=<id>` 的链接发给人，对方打开就是同一个详情。

### 2.8 搜索防抖 300ms

`FilterBar` 里搜索框用本地 `useState` 做草稿，300ms 防抖后才写进 URL：

```tsx
useEffect(() => {
  const current = query.search ?? "";
  if (searchDraft === current) return;          // 防死循环
  const t = setTimeout(() => onPatch({ search: searchDraft || undefined }), 300);
  return () => clearTimeout(t);
}, [searchDraft, query.search, onPatch]);
```

注意那个 `if (searchDraft === current) return;` —— 没有它，URL 更新 → `query.search` 变化 → effect 再跑 → 又写 URL，会无限循环。同时另一个 effect 负责在 URL 被外部改变（比如点 clear）时把草稿同步回来。

## 三、踩坑

### 坑 1：`useSearchParams()` 会强制 Suspense（Sprint 1 遗留，本 Sprint 复用同一方案）

Issue 列表页用了 `useSearchParams()`（读 `?issue=` 和全部筛选参数），必须包 `<Suspense>`。这是 App Router 的硬性要求。

对比 Sprint 1 的登录页：那里为了拿到「真实表单 SSR」而**去掉**了 `useSearchParams`（改用 `useRedirectTarget`）。这里是**保留**的 —— 因为列表页本来就是动态渲染（`ƒ` 标记），首屏就是骨架屏，没有 SSR 表单可失去。

**判断标准**：这个页面需要在服务端渲染出有意义的内容吗？是 → 避免 `useSearchParams`；否（数据全靠客户端请求）→ 用它没问题。

### 坑 2：`Chip` 原来是 `<span>`，不能点

FilterBar 的筛选 chips 需要点击，但 Sprint 0 写的 `Chip` 是个纯展示的 `<span>`。改成：**传了 `onClick` 就渲染成 `<button>`**，否则仍是 `<span>`。

这样既保留了「纯展示 chip 不产生多余的可聚焦元素」，又让交互 chip 天然具备键盘可达性和正确的语义。

### 坑 3：`EditableField` 忘了从 `components/ui/index.ts` 导出

`tsc` 报 `Module '"@/components/ui"' has no exported member 'EditableField'`，同时下游一连串 `Parameter 'v' implicitly has an 'any' type`（因为组件类型缺失，回调参数无法推断）。

**教训**：新增 UI 组件时，`components/ui/index.ts` 的导出是必做步骤，否则错误会以「隐式 any」的形式出现在**使用方**而不是**定义方**，看起来像是另一处的问题。

## 四、验收清单（按 FRONTEND_ROADMAP.md §2 Sprint 3 DoD）

- [x] `tsc --noEmit` 零错误
- [x] `next build` 成功（11 个路由）
- [x] Issue 列表按 SCREEN_BLUEPRINTS §2.7 渲染（编号/标题/标签/优先级/头像）
- [x] 筛选条件写入 URL，刷新后保持
- [x] 状态/优先级/指派人可就地编辑（乐观更新）
- [x] 空状态区分「无数据」与「筛没了」
- [x] 分页（per_page=50）
- [x] `?issue=<id>` 打开抽屉且不销毁列表
- [ ] 端到端（需后端运行）：创建 Issue → 列表出现 → 改状态 → 刷新保持

## 五、产出文件清单

```
frontend/
├── app/(protected)/w/[slug]/projects/[pid]/page.tsx   # Issue 列表（核心页）
├── components/
│   ├── ui/EditableField.tsx                            # 就地编辑下拉
│   ├── ui/Chip.tsx                                     # 改造：支持 onClick
│   └── issue/
│       ├── IssueRow.tsx                                # 列表行
│       ├── FilterBar.tsx                               # 筛选栏
│       ├── IssueDrawer.tsx                             # 详情抽屉
│       └── CreateIssueModal.tsx                        # 创建
├── features/issue/
│   ├── api.ts                                          # 9 个端点
│   ├── hooks.ts                                        # 含乐观更新
│   ├── useIssueFilters.ts                              # URL ↔ 筛选状态
│   └── index.ts
├── lib/
│   ├── url.ts                                          # 筛选解析（纯函数）
│   └── time.ts                                         # 时间格式化
└── types/issue.ts                                      # Issue / Label / ordering
```

## 六、下一步

进入 **Sprint 4：Comments + Activity**。任务：

1. `types/comment.ts` + `types/activity.ts`
2. `features/comment/{api,hooks}.ts` + `features/activity/{api,hooks}.ts`
3. `IssueDrawer` 接入 Activity / Comments 双 tab
4. `<CommentList>` + `<CommentComposer>`（乐观插入）
5. 评论删除（作者或 Admin）
6. `<ActivityFeed>`（state/priority/assignee/labels 变更的中文描述）
7. 验收：评论后出现在列表；改状态后 activity 多一条
