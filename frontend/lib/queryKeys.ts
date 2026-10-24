/**
 * 全站统一 React Query key 工厂（Phase 4 契约收敛，R-03 的根治）。
 *
 * 规则：
 * - 键按「资源层级」组织：projects → detail(pid) → 子资源；失效用前缀匹配；
 * - **以 project id 为轴**（规范路由不再携带 workspace slug，ADR-001）；
 * - 任何组件/hook/实时失效逻辑不得手写键字面量——一律 import 本工厂，
 *   键拼写漂移在此处集中消灭（Island worklog 失效失配 bug 的教训）。
 */

export const projectKeys = {
  all: ["projects"] as const,
  /** 「我的工程」首页聚合 */
  mine: () => [...projectKeys.all, "mine"] as const,
  /** 工作区作用域的团队工程列表（兼容路由页面用） */
  wsList: (slug: string) => [...projectKeys.all, "ws-list", slug] as const,
  detail: (pid: string) => [...projectKeys.all, "detail", pid] as const,

  members: (pid: string) => [...projectKeys.detail(pid), "members"] as const,
  states: (pid: string) => [...projectKeys.detail(pid), "states"] as const,
  plan: (pid: string) => [...projectKeys.detail(pid), "plan"] as const,
  labels: (pid: string) => [...projectKeys.detail(pid), "labels"] as const,
  activities: (pid: string) => [...projectKeys.detail(pid), "activities"] as const,
  /** date 为过滤参数（today / YYYY-MM-DD）；省略 date = 全部日期（前缀匹配用） */
  worklogs: (pid: string, date?: string) =>
    date === undefined
      ? ([...projectKeys.detail(pid), "worklogs"] as const)
      : ([...projectKeys.detail(pid), "worklogs", date] as const),
  jobrun: (pid: string, id: string) => [...projectKeys.detail(pid), "jobruns", id] as const,
} as const;

export const taskKeys = {
  /** 项目内任务列表（过滤参数由调用方追加） */
  list: (pid: string) => [...projectKeys.detail(pid), "tasks"] as const,
  detail: (pid: string, tid: string) =>
    [...projectKeys.detail(pid), "tasks", "detail", tid] as const,
  comments: (pid: string, tid: string) =>
    [...taskKeys.detail(pid, tid), "comments"] as const,
  activities: (pid: string, tid: string) =>
    [...taskKeys.detail(pid, tid), "activities"] as const,
} as const;

export const workspaceKeys = {
  all: ["workspaces"] as const,
  list: () => [...workspaceKeys.all, "list"] as const,
  detail: (slug: string) => [...workspaceKeys.all, "detail", slug] as const,
  members: (slug: string) => [...workspaceKeys.detail(slug), "members"] as const,
} as const;

export const agentKeys = {
  tokens: () => ["agent-tokens"] as const,
} as const;
