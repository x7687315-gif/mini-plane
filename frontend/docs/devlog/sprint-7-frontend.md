# Sprint 7 开发日志：WebSocket Realtime（前端）

- 日期：2026-09-17
- 执行人：前端（beigui）
- 对应计划：[FRONTEND_ROADMAP.md](../../FRONTEND_ROADMAP.md) §Sprint 7
- 契约依据：[docs/api/08-realtime.md](../../../docs/api/08-realtime.md)（**本 Sprint 确认并冻结**）
- 依赖：Sprint 6（BulkActionBar + 异步任务）已合入 `main`

---

## 一、这次做了什么

前六个 Sprint 的界面都是"你要点一下才知道有没有新东西"；Sprint 7 让它**自己会变**：
A 改了状态，B 的列表在 1 秒内跟着变，而且**连接坏了会说出来**。

1. **`features/realtime/policy.ts`**：客户端这一半的契约，全部是纯函数 ——
   关闭码分类、退避序列、心跳/僵尸判定、帧解析、URL 拼接、**事件 → 缓存动作**的决策。
2. **`features/realtime/ws.ts`**：`ProjectSocket` —— 框架无关的 WebSocket 客户端，
   含握手确认、心跳、僵尸检测、指数退避重连、幂等销毁。
3. **`stores/ws.ts`**：连接状态机（`idle / connecting / live / reconnecting / forbidden / error`）
   + 握手帧里的生效角色。
4. **`features/realtime/hooks.ts`**：`useProjectRealtime()` —— 进项目页建连、离开断开，
   事件落成 React Query 的失效动作。
5. **TopBar 接上真实状态**：`connection` 这个 prop 从 Sprint 0 起就是写死的 `"live"`，
   现在读 store，并区分 `live / connecting / reconnecting · N / no access / offline`。
6. **测试 70 → 98 用例**（新增 28 条：关闭码、退避区间、僵尸阈值、帧解析、事件规划）。

## 二、怎么做的（关键实现说明）

### 2.1 为什么"用 payload 更新本地 store"在这份契约下**做不到**

蓝图 §2.9 写的是"`issue.updated`：比对 payload 中的 old/new，更新本地 issue"。
按字面做，第一步就会卡住 —— 这是 `issue.updated` 的实际 payload：

```json
{ "issue_id": "…", "sequence_id": 7, "old_value": {"state": "Todo"}, "new_value": {"state": "Done"} }
```

它是**给句子用的展示值 diff**（06 契约：不含 UUID、`description` 只给字数、
`priority` 给原始枚举），而成 `Issue` 对象需要的是 `state.id` / `state.color` /
`state.name` / `labels[]` / `assignee{id,username,avatar}`。

**也就是说：payload 结构性地不足以重建一个 Issue。** 硬要 patch，只能把状态名塞进
`state.name` 而 `state.id` 还是旧的 —— 下一次就地编辑就会 PATCH 一个错的状态 id。

所以实际采用 08 契约自己的建议：

> 推荐的前端用法：收到事件 → 乐观地刷新对应 Issue/评论列表……不要把事件流当作唯一事实来源。

`issue.updated` → **作废该 issue 详情 + 列表 + 该 issue 的活动流 + 项目活动流**，
让服务端把最终状态给出来。这是"慢一点点但永远对"和"快一点点但可能错"之间的选择，
而这里没有犹豫的余地：审计留痕的正确性是整个应用的卖点。

**`comment.created` 是例外**：它的 payload 带 `content` 和 `author`，
蓝图也说"直接追加"。但见 §2.5 —— 对自己发的评论要跳过。

### 2.2 三条"不重连"线，以及为什么必须区别对待

`classifyClose(code)` 是纯函数，因为这张表决定了用户会看到什么：

| 关闭码 | 动作 | 理由 |
|--------|------|------|
| `4401` | `relogin` | 会话没了。继续重试是**不可能成功**的请求洪流；正确动作是清本地登录态 + 带 `?redirect=` 跳登录 |
| `4404` | `give-up` | 项目对此用户不可见。重试既无意义也像探测；停下并把原因写进 TopBar |
| 其他（1000/1006/1011…） | `reconnect` | 网络抖动、服务端重启 —— 正是退避要处理的情况 |

有一条**容易写错**的地方专门加了回归用例：`4401` / `4404` 是 WebSocket 的**应用关闭码**
（4000–4999 区间的自定义码），和 HTTP 的 401/404 是两套命名空间。
顺手写 `if (code === 401)` 会永远不成立，而"永远不成立"的失败方式是
**静默地一直重连** —— 没有报错，只有无穷的请求。

### 2.3 等值抖动（equal jitter），不是全抖动（full jitter）

```ts
export function nextBackoffDelay(attempt, random = Math.random) {
  const exponential = Math.min(30_000, 1_000 * 2 ** attempt);
  const half = exponential / 2;
  return Math.round(half + random() * half);   // [base/2, base]
}
```

"全抖动"（`random() * base`）看起来更随机、更能打散惊群，但它**允许返回 ~0ms**，
于是服务端抖动时客户端会进入紧密重试循环 —— 正是退避要防的那件事。

等值抖动保留 base/2 的下界：既有去相关的效果（N 个同时掉线的客户端不会同时回来，
比如一次重新部署），又不可能退化成 0。用例里专门钉了这条下界。

封顶 30s：从 1s 起 1→2→4→8→16→30，约 6 次尝试就到底，之后是 30s 一次。

### 2.4 僵尸连接：为什么必须自己动手

连接被静默切断时（换网、NAT 超时、服务端进程没了但没发 FIN），
TCP 半开可以让 socket 保持 "open" **好几分钟**，浏览器不会告诉我们。

而 08 契约恰好给了我们一个可靠的探针：**客户端只能发 `{"type":"ping"}`，服务端每个 ping 都回 pong。**
所以：

- 每 5s 检查一次（心跳间隔 25s 的 1/5，粒度够细又不浪费）；
- 到 25s 就发一个 ping；
- **60s 内一个字节都没收到 → 判死**，主动 `close()` 走正常退避路径。

60s 约等于两个心跳，用例里加了一条 `IDLE_TIMEOUT_MS > HEARTBEAT_INTERVAL_MS * 2` 的断言 ——
这个不等式一旦反过来（比如有人把心跳调成 40s），就会出现周期性误判，
表现是"每 40 秒重连一次"这种莫名其妙的行为。

另外 `lastMessageAt === null`（刚打开）必须返回"不算死"，否则新连接会在第一轮检查时自杀。
这条也有用例。

### 2.5 自己发的评论不刷新

服务端把 `comment.created` 广播给**整个项目频道，包括作者自己**。
而 composer 已经乐观插入了那条评论（Sprint 4）。

如果不做区分，作者会看到自己的评论闪一下变两条（乐观 + 推送刷新），再收敛回一条。
所以 `planRealtimeEffect` 比对了 `payload.author.id` 与当前用户：

- 是自己 → `ownComment: true` → **不刷新**；
- 是别人 → 刷新评论缓存 + 该 issue 的活动流。

边界：当前用户还没加载出来时（`currentUserId === undefined`），**不认为自己**，
于是多刷一次。这个方向的错（多取一次）比另一个方向的错（重复显示）便宜得多，
用例里也钉了这条。

### 2.6 失效范围必须收窄到本项目

第一版 `applyEffect` 里写的是：

```ts
void ctx.qc.invalidateQueries({ queryKey: ["issues"] });      // ← 太宽
void ctx.qc.invalidateQueries({ queryKey: ["activities"] });  // ← 太宽
```

这是前缀匹配 —— `["issues"]` 会命中**所有项目**的 issue 缓存。
用户浏览过 5 个项目，改一次状态就会触发 5 个项目的列表重取。
单机看不出问题，多项目工作区就是白烧的流量和后端负载。

改成用 `issueKeys.all(slug, projectId)` / `activityKeys.issue(slug, projectId, issueId)` /
`activityKeys.project(slug, projectId)` —— 事件 payload 里带了 `issue_id`，
所以连活动流都能精确到单个 issue，不必退化成项目级前缀。

（这一条是自己自查发现的，不是 lint 提醒的 —— lint 看不出"前缀匹配了多大范围"这种语义问题。）

### 2.7 latest-ref：写在哪里，lint 说得对

socket 每项目只建一次（effect 依赖 `[enabled, slug, projectId]`），
但它的回调必须看到**当前**的 user / router / queryClient。惯用解法是 latest-ref。

第一版在**渲染期**赋值：

```ts
const latest = useRef({ … });
latest.current = { … };            // ← react-hooks/refs: Cannot update ref during render
```

规则是对的：渲染期写 ref 是渲染阶段的副作用，在并发渲染下可能被丢弃或重放。
改成在**无依赖数组的 effect** 里刷新：

```ts
const latest = useRef({ … });
useEffect(() => { latest.current = { … }; });   // 每次渲染后刷新
```

安全的理由：所有 socket 回调都是**异步**触发的（帧到达、连接关闭），
一定发生在这一次渲染的 effects 之后。并且这个 effect **声明在建连 effect 之前**，
所以首次挂载时它先跑 —— 顺序是刻意的，注释里写明了。

### 2.8 zustand v5 的 object selector 陷阱

TopBar 第一版用了一个 `useRealtimeStatus()`，返回 `{status, detail, role, attempts}` 对象。

zustand v5 用 `useSyncExternalStore` 实现，选择器每次返回**新对象**会让快照不稳定，
React 会警告 `The result of getSnapshot should be cached to avoid an infinite loop`。

所以删掉那个组合 hook，TopBar 直接分别选四个基本类型：

```ts
const wsStatus = useWsStore((s) => s.status);
const wsDetail = useWsStore((s) => s.detail);
```

代价是四行，换来的是不会踩并发渲染的坑。

### 2.9 连接状态是可读的 UI，不是彩点

`wsStatusLabel()` 把状态机翻译成 TopBar 上的一句话：
`live / connecting / reconnecting · N / no access / offline`。

- `reconnecting` 从第 2 次尝试起带上次数（`reconnecting · 3`）—— 一次抖动和一直在抖是两回事；
- 点色：`live` 用 accent（钴蓝），`reconnecting` 用 **`--color-warning`（琥珀）而不是红**。
  退避正在处理的瞬时抖动不是"错误"，把一切都涂红只会训练用户忽略红色；
- 终态（`forbidden` / `error`）的原因放在 `aria-label` 里（DESIGN §10 禁止 hover tooltip，
  所以不能靠悬浮，只能靠无障碍标签 + 状态词本身）。

## 三、踩坑

### 坑 1：`react-hooks/refs` 不许渲染期写 ref

见 §2.7。值得记的是**这条规则救了一次并发渲染下的隐性 bug**：
渲染期写 ref 在 React 18/19 的并发特性下不是"顺手的小事"，
而是一次真实的、会导致回调读到过期值的副作用。

### 坑 2：失效范围用了裸前缀（自查）

见 §2.6。这是本 Sprint 唯一一个**功能完全正常但语义错了**的地方 ——
测试不会红、页面不会错、只是多打请求。这类问题只能靠写代码时问一句
"这个 key 到底匹配了多少东西"。

### 坑 3：中文文案里的半角引号（第三次）

Sprint 6 的 devlog 刚记过"中文文案一律用「」"，这次**在测试名里又写了一次**
（`调用方退化为"刷新整个项目"`），提交前自查改掉了。

说明"写进 devlog"不足以阻止它 —— 这类约定得进 lint 或模板才算落地。
本次没有为它加规则（成本高于收益），但把这条留在这里作为第三次记录：
**新增中文文案时，`"` 一律换成「」。**

## 四、验收清单（按 FRONTEND_ROADMAP.md §2 Sprint 7 DoD）

| 验收项 | 结果 |
|--------|------|
| `features/realtime/ws.ts`：自动重连（指数退避） | ✅ 等值抖动，1s→30s 封顶，有下界用例 |
| `stores/ws.ts`：连接状态 + 事件分发 | ✅ 六态状态机 + 握手角色 + 最后帧时间 |
| `<ConnectionStatus>` 组件（TopBar 右上） | ✅ TopBar 内置指示器（含 `reconnecting · N`） |
| 进入 `/w/:slug/projects/:pid` 时建连，离开时断 | ✅ `useProjectRealtime` 的 effect 生命周期；项目 404 时不连 |
| `issue.updated` 事件 → 更新 issue store + 追加 activity | ⚠️ 以**作废重取**代替本地 patch（理由见 §2.1：payload 结构性不足以重建 Issue） |
| `comment.created` 事件 → 追加到 CommentList + 自动滚动 | ⚠️ 改为作废重取；**自己的评论跳过**（见 §2.5）。自动滚动未做（评论框在抽屉底部，滚到底部会与输入框抢注意力） |
| 重连后全量刷新当前列表兜底 | ✅ `onRecovered` → 作废该项目全部缓存 |
| 4401 → push `/login`；4404 → 提示不自动重连 | ✅ 含 `?redirect=` 回跳；4404 写进 TopBar |
| unit: wsStore 处理所有事件类型 + close code | ✅ 28 条用例（关闭码 / 退避 / 僵尸阈值 / 帧解析 / 事件规划） |
| e2e: 两个 browser context，A 改 issue，B 自动收到 | ⬜ 未做（无 E2E 基建，且需后端 + Redis channel layer） |
| A 改状态 → B 列表 < 1s 内更新 | ⚠️ 设计目标；本机未联调（需双开浏览器 + 起后端）。事件路径是"收到帧 → 作废 → 重取"，延迟主要由重取决定 |
| B 断网 30s → 恢复 → 自动重连 + 全量刷新 | ⚠️ 逻辑完备（退避 + `onRecovered`）但未实测 |
| 4401 触发时跳登录不报错 | ⚠️ 未实测（需会话过期场景） |
| `tsc --noEmit` | ✅ 零错误 |
| ESLint | ✅ 零 error 零 warning |
| 单元测试 | ✅ `pnpm test` → **98/98**（19 suites，~0.43s） |
| `next build` | ✅ 成功，11 条路由 |

> ⚠️ 三条"未实测"的共同原因是同一个：**本机没有跑起来的后端 + Redis channel layer**，
> 而 WebSocket 的行为只能端到端观察。策略层（可测的那一半）已经全绿，
> 剩下的一半需要联调环境。这是本 Sprint 最需要说清楚的一件事 ——
> 不把"写了代码"说成"验证过了"。

## 五、产出文件清单

新增：

```
frontend/
├── features/realtime/
│   ├── policy.ts                    # 关闭码 / 退避 / 心跳 / 帧 / 事件规划（纯函数）
│   ├── ws.ts                        # ProjectSocket（框架无关）
│   ├── hooks.ts                      # useProjectRealtime（生命周期 + 缓存失效）
│   └── index.ts
├── stores/ws.ts                     # 连接状态机
├── tests/unit/realtime-policy.test.mts   # 28 用例
└── docs/devlog/sprint-7-frontend.md      # 本文件
```

改动：

| 文件 | 改了什么 |
|------|---------|
| `components/shell/TopBar.tsx` | 删掉写死的 `connection` prop，改读 ws store；状态词 + 点色映射 |
| `app/(protected)/w/[slug]/projects/[pid]/page.tsx` | 挂 `useProjectRealtime(...)`（项目 404 时不连） |

## 六、下一步

进入 **Sprint 8：Docker + CI + 收尾**（最后一个 Sprint）。任务：

1. 前端 `Dockerfile`（多阶段 deps → builder → runner）；
2. `docker-compose.yml` 加 `frontend` 服务；
3. GitHub Actions 加 `frontend` job（lint → typecheck → test → build）；
4. `README.md` 前端章节 + `ARCHITECTURE.md` 前端请求链路图；
5. v0.1.0 tag / Release notes（`docs/releases/`）；
6. Lighthouse ≥ 90（性能 / 可访问性 / 最佳实践）—— 本机能否跑待定，跑不了就说清楚。

**留给后面 Sprint 的账**（全部会在 Sprint 8 的 devlog 里汇总）：

- **联调环境缺失**是最大的账：Sprint 4/5/6/7 的端到端验收（评论时间线、5000 条首屏、
  批量改标签、A 改 B 收到）都需要起后端 + Postgres（+ Redis 才能测多进程推送）。
- `docs/assets/` 截图仍是静态视觉稿。
- 组件测试与 E2E 仍为空 —— Sprint 8 的 CI 会把 E2E 的位置留出来，但真正跑起来需要
  浏览器二进制 + 后端。
- 批量失败的重试入口（Sprint 6 留的）。
