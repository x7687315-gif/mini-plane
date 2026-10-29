/**
 * Task（历史名 Issue）+ Label API — docs/api/10-canonical-projects.md。
 *
 * Phase 4 起全部走**规范路由**（/api/v1/projects/{pid}/tasks|labels/…），
 * 不再要求 workspace slug（ADR-001 个人优先）。函数签名保留 slug 参数以兼容
 * 既有调用点，内部 URL 不再使用——Phase 5 页面去 slug 时一并移除参数。
 *
 * Permission notes (backend enforced, frontend mirrors for UI gating):
 * - read  → effective role ≥ Viewer（owner 恒可访问）
 * - write → effective role ≥ Member (Viewer gets 403)
 * - 不可见 → 404 (anti-enumeration)
 * - assignee must be a ProjectMember (use project members, NOT workspace members)
 */

import { api } from "@/lib/api";
import type { Paginated } from "@/types/project";
import type { TaskRun } from "@/types/task";
import type {
  CreateIssuePayload,
  Issue,
  IssueListQuery,
  Label,
  MyIssue,
  MyIssuesScope,
  UpdateIssuePayload,
} from "@/types/issue";
import { serializeIssueQuery } from "@/types/issue";

/** 规范路由的项目子资源前缀（slug 参数仅保留兼容，Phase 5 移除）。 */
function issuesBase(_slug: string, projectId: string): string {
  return `/projects/${projectId}/tasks`;
}

function labelsBase(_slug: string, projectId: string): string {
  return `/projects/${projectId}/labels`;
}

/* ---------------- issues ---------------- */

/** GET /api/v1/tasks/mine/ —— 跨项目聚合「指派给我 / 我创建的」（特色 B）。 */
export async function listMyIssues(
  scope: MyIssuesScope = "all",
): Promise<Paginated<MyIssue>> {
  const qs = scope && scope !== "all" ? `?scope=${scope}` : "";
  return api<Paginated<MyIssue>>(`/tasks/mine${qs}`);
}

export async function listIssues(
  slug: string,
  projectId: string,
  query: IssueListQuery = {},
): Promise<Paginated<Issue>> {
  const qs = serializeIssueQuery(query);
  return api<Paginated<Issue>>(`${issuesBase(slug, projectId)}${qs ? `?${qs}` : ""}`);
}

export interface AllIssuesResult {
  issues: Issue[];
  /** 后端返回的真实总数，不依赖前端是否取完。 */
  total: number;
  /** 超过分页上限时为 true；此时 issues 只是前 N 页。 */
  truncated: boolean;
}

/** 单次取全量任务的上限；按 100/页最多 50 次请求。 */
const ALL_ISSUES_MAX_PAGES = 50;

/**
 * 取项目全部 Task。
 *
 * 工程台的任务列表有自己的分页；图纸必须看到全部构件，否则 Stage 计数、
 * 未归属数和 NOW 归属都会错。这里顺序翻页并去重，超过上限时显式标记截断，
 * 不假装拿到了全量。
 */
export async function listAllIssues(
  slug: string,
  projectId: string,
): Promise<AllIssuesResult> {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  let total = 0;
  let page = 1;
  let truncated = false;

  for (;;) {
    const data = await listIssues(slug, projectId, { per_page: 100, page });
    total = data.count;
    for (const issue of data.results) {
      if (seen.has(issue.id)) continue;
      seen.add(issue.id);
      issues.push(issue);
    }
    if (!data.next || data.results.length === 0) break;
    if (page >= ALL_ISSUES_MAX_PAGES) {
      truncated = true;
      break;
    }
    page += 1;
  }

  return { issues, total, truncated };
}

export async function getIssue(
  slug: string,
  projectId: string,
  issueId: string,
): Promise<Issue> {
  return api<Issue>(`${issuesBase(slug, projectId)}/${issueId}`);
}

export async function createIssue(
  slug: string,
  projectId: string,
  payload: CreateIssuePayload,
): Promise<Issue> {
  return api<Issue>(issuesBase(slug, projectId), { method: "POST", json: payload });
}

export async function updateIssue(
  slug: string,
  projectId: string,
  issueId: string,
  payload: UpdateIssuePayload,
): Promise<Issue> {
  return api<Issue>(`${issuesBase(slug, projectId)}/${issueId}`, {
    method: "PATCH",
    json: payload,
  });
}

export async function deleteIssue(
  slug: string,
  projectId: string,
  issueId: string,
): Promise<void> {
  return api<void>(`${issuesBase(slug, projectId)}/${issueId}`, { method: "DELETE" });
}

/**
 * Bulk label assignment — docs/api/07-cache-and-tasks.md §2.1.
 *
 * **Asynchronous**: the server answers `202` with a TaskRun, not with the updated
 * issues. The caller must poll `GET …/tasks/{task_id}/` and then refresh the lists.
 *
 * Semantics are **overwriting**, not additive: the selected issues' label set is
 * *replaced* by `labelIds`, and `[]` clears every label. That is why the UI offers
 * "set labels to X" rather than "add label X" — adding is not expressible here when
 * the selected issues start with different label sets.
 *
 * Limits (400 field errors if exceeded): at most 200 `issue_ids`, 50 `label_ids`.
 */
export async function bulkSetLabels(
  slug: string,
  projectId: string,
  issueIds: string[],
  labelIds: string[],
): Promise<TaskRun> {
  return api<TaskRun>(`${issuesBase(slug, projectId)}/bulk/labels`, {
    method: "POST",
    json: { issue_ids: issueIds, label_ids: labelIds },
  });
}

/* ---------------- labels ---------------- */

export async function listLabels(
  slug: string,
  projectId: string,
): Promise<Paginated<Label>> {
  return api<Paginated<Label>>(labelsBase(slug, projectId));
}