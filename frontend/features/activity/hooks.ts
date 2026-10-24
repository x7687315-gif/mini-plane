"use client";

import { useQuery } from "@tanstack/react-query";
import { projectKeys, taskKeys } from "@/lib/queryKeys";
import { listIssueActivities, listProjectActivities } from "./api";

/**
 * 活动流查询键——统一委托 lib/queryKeys 工厂（Phase 4）。
 * 保留 (slug, pid) 签名兼容既有调用点；键只按 project/task id 组织。
 */
export const activityKeys = {
  issue: (_slug: string, pid: string, iid: string) => taskKeys.activities(pid, iid),
  project: (_slug: string, pid: string) => projectKeys.activities(pid),
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