"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Paginated } from "@/types/project";
import type {
  CreateIssuePayload,
  CreateLabelPayload,
  Issue,
  IssueListQuery,
  Label,
  UpdateIssuePayload,
  UpdateLabelPayload,
} from "@/types/issue";
import {
  createIssue,
  createLabel,
  deleteIssue,
  deleteLabel,
  getIssue,
  listIssues,
  listLabels,
  updateIssue,
  updateLabel,
} from "./api";

export const issueKeys = {
  all: (slug: string, pid: string) => ["issues", slug, pid] as const,
  lists: (slug: string, pid: string) => [...issueKeys.all(slug, pid), "list"] as const,
  list: (slug: string, pid: string, query: IssueListQuery) =>
    [...issueKeys.lists(slug, pid), query] as const,
  detail: (slug: string, pid: string, issueId: string) =>
    [...issueKeys.all(slug, pid), "detail", issueId] as const,
  labels: (slug: string, pid: string) => ["labels", slug, pid] as const,
};

/* ---------------- queries ---------------- */

export function useIssues(
  slug: string | undefined,
  projectId: string | undefined,
  query: IssueListQuery,
) {
  return useQuery({
    queryKey: issueKeys.list(slug ?? "", projectId ?? "", query),
    queryFn: () => listIssues(slug!, projectId!, query),
    enabled: Boolean(slug && projectId),
    // Keep the previous page visible while the next one loads (no layout jump).
    placeholderData: (prev) => prev,
  });
}

export function useIssue(
  slug: string | undefined,
  projectId: string | undefined,
  issueId: string | undefined,
) {
  return useQuery({
    queryKey: issueKeys.detail(slug ?? "", projectId ?? "", issueId ?? ""),
    queryFn: () => getIssue(slug!, projectId!, issueId!),
    enabled: Boolean(slug && projectId && issueId),
  });
}

export function useLabels(slug: string | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: issueKeys.labels(slug ?? "", projectId ?? ""),
    queryFn: () => listLabels(slug!, projectId!),
    enabled: Boolean(slug && projectId),
    staleTime: 5 * 60_000,
  });
}

/* ---------------- mutations ---------------- */

export function useCreateIssue(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateIssuePayload) => createIssue(slug, projectId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: issueKeys.all(slug, projectId) }),
  });
}

/**
 * Variables for useUpdateIssue.
 *
 * `optimistic` carries the *resolved objects* (not just ids) so the UI can patch
 * the cached Issue instantly. Without it we'd only know `state_id` and would have
 * to look the state up before we could render — that lookup is what makes the
 * difference between "instant" and "feels laggy".
 */
export interface UpdateIssueVars {
  issueId: string;
  payload: UpdateIssuePayload;
  optimistic?: Partial<Pick<Issue, "state" | "assignee" | "labels" | "priority" | "title" | "description">>;
}

function applyOptimistic(issue: Issue, vars: UpdateIssueVars): Issue {
  return { ...issue, ...(vars.optimistic ?? {}), updated_at: new Date().toISOString() };
}

export function useUpdateIssue(slug: string, projectId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (vars: UpdateIssueVars) =>
      updateIssue(slug, projectId, vars.issueId, vars.payload),

    // 1) Optimistically patch every cached list + the detail entry.
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: issueKeys.all(slug, projectId) });

      const prevLists = qc.getQueriesData<Paginated<Issue>>({
        queryKey: issueKeys.lists(slug, projectId),
      });
      const prevDetail = qc.getQueryData<Issue>(
        issueKeys.detail(slug, projectId, vars.issueId),
      );

      qc.setQueriesData<Paginated<Issue>>(
        { queryKey: issueKeys.lists(slug, projectId) },
        (old) =>
          old
            ? {
                ...old,
                results: old.results.map((it) =>
                  it.id === vars.issueId ? applyOptimistic(it, vars) : it,
                ),
              }
            : old,
      );

      if (prevDetail) {
        qc.setQueryData(issueKeys.detail(slug, projectId, vars.issueId), applyOptimistic(prevDetail, vars));
      }

      return { prevLists, prevDetail };
    },

    // 2) Roll back on failure.
    onError: (_err, vars, ctx) => {
      ctx?.prevLists?.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx?.prevDetail) {
        qc.setQueryData(issueKeys.detail(slug, projectId, vars.issueId), ctx.prevDetail);
      }
    },

    // 3) Reconcile with the server (authoritative values, updated_at, etc.).
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: issueKeys.lists(slug, projectId) });
      qc.invalidateQueries({ queryKey: issueKeys.detail(slug, projectId, vars.issueId) });
    },
  });
}

export function useDeleteIssue(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (issueId: string) => deleteIssue(slug, projectId, issueId),
    onSuccess: () => qc.invalidateQueries({ queryKey: issueKeys.all(slug, projectId) }),
  });
}

export function useCreateLabel(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateLabelPayload) => createLabel(slug, projectId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: issueKeys.labels(slug, projectId) }),
  });
}

export function useUpdateLabel(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ labelId, payload }: { labelId: string; payload: UpdateLabelPayload }) =>
      updateLabel(slug, projectId, labelId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: issueKeys.labels(slug, projectId) });
      // Labels are embedded in Issue objects, so issues must be refetched too.
      qc.invalidateQueries({ queryKey: issueKeys.all(slug, projectId) });
    },
  });
}

export function useDeleteLabel(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (labelId: string) => deleteLabel(slug, projectId, labelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: issueKeys.labels(slug, projectId) });
      // Deleting a label removes it from every issue that referenced it.
      qc.invalidateQueries({ queryKey: issueKeys.all(slug, projectId) });
    },
  });
}