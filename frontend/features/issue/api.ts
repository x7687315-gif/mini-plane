/**
 * Issue + Label API — docs/api/04-issues.md.
 *
 * All routes are project-scoped:
 *   /workspaces/{slug}/projects/{pid}/issues/…
 *   /workspaces/{slug}/projects/{pid}/labels/…
 *
 * Permission notes (backend enforced, frontend mirrors for UI gating):
 * - read  → effective role ≥ Viewer
 * - write → effective role ≥ Member (Viewer gets 403)
 * - non-workspace-member → 404 (anti-enumeration)
 * - assignee must be a ProjectMember (use project members, NOT workspace members)
 */

import { api } from "@/lib/api";
import type { Paginated } from "@/types/project";
import type { TaskRun } from "@/types/task";
import type {
  CreateIssuePayload,
  CreateLabelPayload,
  Issue,
  IssueListQuery,
  Label,
  UpdateIssuePayload,
  UpdateLabelPayload,
} from "@/types/issue";
import { serializeIssueQuery } from "@/types/issue";

function issuesBase(slug: string, projectId: string): string {
  return `/workspaces/${slug}/projects/${projectId}/issues`;
}

function labelsBase(slug: string, projectId: string): string {
  return `/workspaces/${slug}/projects/${projectId}/labels`;
}

/* ---------------- issues ---------------- */

export async function listIssues(
  slug: string,
  projectId: string,
  query: IssueListQuery = {},
): Promise<Paginated<Issue>> {
  const qs = serializeIssueQuery(query);
  return api<Paginated<Issue>>(`${issuesBase(slug, projectId)}${qs ? `?${qs}` : ""}`);
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

export async function createLabel(
  slug: string,
  projectId: string,
  payload: CreateLabelPayload,
): Promise<Label> {
  return api<Label>(labelsBase(slug, projectId), { method: "POST", json: payload });
}

export async function updateLabel(
  slug: string,
  projectId: string,
  labelId: string,
  payload: UpdateLabelPayload,
): Promise<Label> {
  return api<Label>(`${labelsBase(slug, projectId)}/${labelId}`, {
    method: "PATCH",
    json: payload,
  });
}

export async function deleteLabel(
  slug: string,
  projectId: string,
  labelId: string,
): Promise<void> {
  return api<void>(`${labelsBase(slug, projectId)}/${labelId}`, { method: "DELETE" });
}