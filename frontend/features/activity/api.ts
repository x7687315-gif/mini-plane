/**
 * Activity API — docs/api/06-activities.md.
 *
 * Two read-only endpoints; there is no create/update/delete (405).
 * Both are **descending by created_at**.
 */

import { api } from "@/lib/api";
import type { Paginated } from "@/types/project";
import type { Activity } from "@/types/activity";

/** Issue timeline = the issue's own changes + comment events on that issue. */
export async function listIssueActivities(
  slug: string,
  projectId: string,
  issueId: string,
): Promise<Paginated<Activity>> {
  return api<Paginated<Activity>>(
    `/workspaces/${slug}/projects/${projectId}/issues/${issueId}/activities`,
  );
}

/** Project-level feed (across issues) — used by the Sprint 5 dashboard. */
export async function listProjectActivities(
  slug: string,
  projectId: string,
): Promise<Paginated<Activity>> {
  return api<Paginated<Activity>>(
    `/workspaces/${slug}/projects/${projectId}/activities`,
  );
}