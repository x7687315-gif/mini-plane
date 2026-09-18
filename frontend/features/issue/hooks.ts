"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { activityKeys } from "@/features/activity/hooks";
import type { Paginated } from "@/types/project";
import type {
  CreateIssuePayload,
  CreateLabelPayload,
  Issue,
  IssueListQuery,
  UpdateIssuePayload,
  UpdateLabelPayload,
} from "@/types/issue";
import {
  bulkSetLabels,
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: issueKeys.all(slug, projectId) });
      // A new issue also writes an `issue.created` activity and shows up in the
      // project-level feed.
      qc.invalidateQueries({ queryKey: activityKeys.project(slug, projectId) });
    },
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
      // A PATCH that actually changed something writes an activity record on that
      // issue (06 契约 §字段 diff 白名单). Without this the drawer's timeline would
      // show a state change that never appears in its own audit trail — which
      // defeats the whole point of having one. Runs on error too, harmlessly.
      qc.invalidateQueries({
        queryKey: activityKeys.issue(slug, projectId, vars.issueId),
      });
      qc.invalidateQueries({ queryKey: activityKeys.project(slug, projectId) });
    },
  });
}

export function useDeleteIssue(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (issueId: string) => deleteIssue(slug, projectId, issueId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: issueKeys.all(slug, projectId) });
      qc.invalidateQueries({ queryKey: activityKeys.project(slug, projectId) });
    },
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

/* ---------------- bulk operations ---------------- */

/**
 * Bulk label assignment — the only **server-side** batch operation (07 契约 §2.1).
 *
 * Resolves to a TaskRun (`202`), not to updated issues: the job runs asynchronously,
 * so the caller polls `useTaskRun()` and refreshes the lists when it settles. Nothing
 * is optimistically patched here — we genuinely do not know which rows will change
 * (unchanged labels produce neither an activity nor a push), and guessing would show
 * a wrong result for a second.
 */
export function useBulkSetLabels(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      issueIds,
      labelIds,
    }: {
      issueIds: string[];
      labelIds: string[];
    }) => bulkSetLabels(slug, projectId, issueIds, labelIds),

    // The job writes `labels` activity rows for every issue it actually changes
    // (07 契约 §2.1: "与单条 PATCH 同语义"), so both activity caches must go.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: issueKeys.all(slug, projectId) });
      qc.invalidateQueries({ queryKey: activityKeys.project(slug, projectId) });
    },
  });
}

/** Outcome of a client-orchestrated batch over the single-issue endpoints. */
export interface BulkOutcome {
  ok: number;
  failed: number;
  /**
   * 具体是哪几条失败。
   *
   * 一开始只回了 `failed` 这个数字 —— 够写一句提示，但**没法做事**：
   * 用户看到"2 个失败"只能自己回列表里猜是哪两条。带上 id 之后，操作条才能提供
   * "只重试失败的那 2 条"（Sprint 6 留下的那笔账）。
   */
  failedIds: string[];
  /** First error message, for the toast. */
  firstError: string | null;
}

export interface BulkUpdateVars {
  issueIds: string[];
  payload: UpdateIssuePayload;
  /** Resolved objects for the optimistic cache patch (see useUpdateIssue). */
  optimistic?: Partial<Pick<Issue, "state" | "assignee" | "labels" | "priority">>;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Client-orchestrated batch for the fields the backend has **no** bulk endpoint for
 * (state / priority / assignee). Only labels has one (07 契约 §2.1)。
 *
 * Three honest consequences, all surfaced in the UI rather than hidden:
 *
 * 1. **Not atomic.** N independent PATCHes can partially fail. The caller reports
 *    "3/5 成功" instead of pretending it worked, and the lists are refetched so what
 *    the user sees is what the server actually holds.
 * 2. **Sequential, not parallel.** Firing 50 simultaneous writes at one DB is a
 *    self-inflicted stampede; sequential also makes the progress counter truthful.
 * 3. **Optimistic up front, authoritative after.** Every selected row is patched
 *    immediately (the bar must not feel laggy), then `onSettled` refetches — so a
 *    field the server rejected reverts on screen instead of lingering as a lie.
 *
 * When the backend grows a real batch endpoint, this hook should be deleted rather
 * than kept "just in case" — a second way to do batch writes is how they drift.
 */
export function useBulkUpdateIssues(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      issueIds,
      payload,
      onProgress,
    }: BulkUpdateVars): Promise<BulkOutcome> => {
      let ok = 0;
      let failed = 0;
      const failedIds: string[] = [];
      let firstError: string | null = null;

      for (let i = 0; i < issueIds.length; i += 1) {
        const id = issueIds[i]!;
        try {
          await updateIssue(slug, projectId, id, payload);
          ok += 1;
        } catch (e) {
          failed += 1;
          failedIds.push(id);
          if (!firstError) {
            firstError = e instanceof Error ? e.message : "请求失败";
          }
        }
        onProgress?.(i + 1, issueIds.length);
      }

      return { ok, failed, failedIds, firstError };
    },

    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: issueKeys.all(slug, projectId) });
      const prevLists = qc.getQueriesData<Paginated<Issue>>({
        queryKey: issueKeys.lists(slug, projectId),
      });
      const targets = new Set(vars.issueIds);

      qc.setQueriesData<Paginated<Issue>>({ queryKey: issueKeys.lists(slug, projectId) }, (old) =>
        old
          ? {
              ...old,
              results: old.results.map((it) =>
                targets.has(it.id)
                  ? { ...it, ...(vars.optimistic ?? {}), updated_at: new Date().toISOString() }
                  : it,
              ),
            }
          : old,
      );

      return { prevLists };
    },

    onError: (_e, _v, ctx) => {
      ctx?.prevLists?.forEach(([key, data]) => qc.setQueryData(key, data));
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: issueKeys.all(slug, projectId) });
      qc.invalidateQueries({ queryKey: activityKeys.project(slug, projectId) });
    },
  });
}

export interface BulkDeleteVars {
  issueIds: string[];
  onProgress?: (done: number, total: number) => void;
}

/**
 * Client-orchestrated batch delete. Same reasoning as `useBulkUpdateIssues`:
 * no batch endpoint exists, so N DELETEs, sequential, truthful about partial failure.
 *
 * Deletion is destructive, so the caller must have confirmed already — this hook does
 * no prompting.
 */
export function useBulkDeleteIssues(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ issueIds, onProgress }: BulkDeleteVars): Promise<BulkOutcome> => {
      let ok = 0;
      let failed = 0;
      const failedIds: string[] = [];
      let firstError: string | null = null;

      for (let i = 0; i < issueIds.length; i += 1) {
        const id = issueIds[i]!;
        try {
          await deleteIssue(slug, projectId, id);
          ok += 1;
        } catch (e) {
          failed += 1;
          failedIds.push(id);
          if (!firstError) firstError = e instanceof Error ? e.message : "请求失败";
        }
        onProgress?.(i + 1, issueIds.length);
      }

      return { ok, failed, failedIds, firstError };
    },

    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: issueKeys.all(slug, projectId) });
      const prevLists = qc.getQueriesData<Paginated<Issue>>({
        queryKey: issueKeys.lists(slug, projectId),
      });
      const targets = new Set(vars.issueIds);

      qc.setQueriesData<Paginated<Issue>>({ queryKey: issueKeys.lists(slug, projectId) }, (old) =>
        old
          ? {
              ...old,
              count: Math.max(0, old.count - targets.size),
              results: old.results.filter((it) => !targets.has(it.id)),
            }
          : old,
      );

      return { prevLists };
    },

    onError: (_e, _v, ctx) => {
      ctx?.prevLists?.forEach(([key, data]) => qc.setQueryData(key, data));
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: issueKeys.all(slug, projectId) });
      qc.invalidateQueries({ queryKey: activityKeys.project(slug, projectId) });
    },
  });
}