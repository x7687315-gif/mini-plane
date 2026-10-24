/**
 * Activity API — docs/api/06-activities.md · 规范路由见 10-canonical-projects.md。
 *
 * Two read-only endpoints; there is no create/update/delete (405).
 * Both are **descending by created_at**.
 * Phase 4：切换到 /api/v1/projects/{pid}/…（不再要求 workspace slug）。
 */

import { api } from "@/lib/api";
import type { Paginated } from "@/types/project";
import type { Activity } from "@/types/activity";

/** Task timeline = the task's own changes + comment events on that task. */
export async function listIssueActivities(
  _slug: string,
  projectId: string,
  issueId: string,
): Promise<Paginated<Activity>> {
  return api<Paginated<Activity>>(
    `/projects/${projectId}/tasks/${issueId}/activities`,
  );
}

/** Project-level feed (across tasks) — used by the Sprint 5 dashboard. */
export async function listProjectActivities(
  _slug: string,
  projectId: string,
): Promise<Paginated<Activity>> {
  return api<Paginated<Activity>>(
    `/projects/${projectId}/activities`,
  );
}
