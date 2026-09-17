"use client";

import { useQuery } from "@tanstack/react-query";
import { listIssueActivities, listProjectActivities } from "./api";

export const activityKeys = {
  issue: (slug: string, pid: string, iid: string) =>
    ["activities", "issue", slug, pid, iid] as const,
  project: (slug: string, pid: string) => ["activities", "project", slug, pid] as const,
};

/**
 * Issue timeline — the issue's own changes + comment events on that issue.
 *
 * Descending by created_at. The contract warns that records written in the same
 * instant have no guaranteed relative order, so the feed renders them as a flat
 * list and never assumes "the previous row happened earlier".
 */
export function useIssueActivities(
  slug: string | undefined,
  projectId: string | undefined,
  issueId: string | undefined,
) {
  return useQuery({
    queryKey: activityKeys.issue(slug ?? "", projectId ?? "", issueId ?? ""),
    queryFn: () => listIssueActivities(slug!, projectId!, issueId!),
    enabled: Boolean(slug && projectId && issueId),
  });
}

/** Project-level feed (across issues) — reserved for the Sprint 5 dashboard. */
export function useProjectActivities(
  slug: string | undefined,
  projectId: string | undefined,
) {
  return useQuery({
    queryKey: activityKeys.project(slug ?? "", projectId ?? ""),
    queryFn: () => listProjectActivities(slug!, projectId!),
    enabled: Boolean(slug && projectId),
  });
}