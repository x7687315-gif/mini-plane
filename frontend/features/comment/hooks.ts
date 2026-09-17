"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth";
import type { Paginated } from "@/types/project";
import type { Comment, CreateCommentPayload, UpdateCommentPayload } from "@/types/comment";
import { createComment, deleteComment, listComments, updateComment } from "./api";
import { activityKeys } from "@/features/activity/hooks";

export const commentKeys = {
  all: (slug: string, pid: string, iid: string) => ["comments", slug, pid, iid] as const,
  list: (slug: string, pid: string, iid: string) => [...commentKeys.all(slug, pid, iid), "list"] as const,
};

export function useComments(
  slug: string | undefined,
  projectId: string | undefined,
  issueId: string | undefined,
) {
  return useQuery({
    queryKey: commentKeys.list(slug ?? "", projectId ?? "", issueId ?? ""),
    queryFn: () => listComments(slug!, projectId!, issueId!),
    enabled: Boolean(slug && projectId && issueId),
  });
}

export function useCreateComment(slug: string, projectId: string, issueId: string) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: (payload: CreateCommentPayload) =>
      createComment(slug, projectId, issueId, payload),

    /**
     * Optimistically append the comment so the composer clears instantly.
     *
     * The list is ASCENDING (oldest first), so the new comment goes at the END —
     * unlike the activity feed, which is descending.
     *
     * A fake id is used until the server responds; the row renders with reduced
     * opacity while `pending` (see CommentList).
     */
    onMutate: async (payload) => {
      const key = commentKeys.list(slug, projectId, issueId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Paginated<Comment>>(key);

      if (me) {
        const now = new Date().toISOString();
        const optimistic: Comment = {
          id: `optimistic-${now}-${Math.random().toString(36).slice(2, 8)}`,
          issue: issueId,
          author: { id: me.id, username: me.username, avatar: me.avatar },
          content: payload.content,
          created_at: now,
          updated_at: now,
        };
        qc.setQueryData<Paginated<Comment>>(key, (old) =>
          old
            ? { ...old, count: old.count + 1, results: [...old.results, optimistic] }
            : old,
        );
      }

      return { prev };
    },

    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(commentKeys.list(slug, projectId, issueId), ctx.prev);
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: commentKeys.all(slug, projectId, issueId) });
      // Creating a comment also writes an `comment.created` activity record.
      qc.invalidateQueries({ queryKey: activityKeys.issue(slug, projectId, issueId) });
      qc.invalidateQueries({ queryKey: activityKeys.project(slug, projectId) });
    },
  });
}

export function useUpdateComment(slug: string, projectId: string, issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, payload }: { commentId: string; payload: UpdateCommentPayload }) =>
      updateComment(slug, projectId, issueId, commentId, payload),

    // Editing does NOT produce an activity record (06 契约 §有意不记录的事件),
    // so we only touch the comment cache here.
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: commentKeys.all(slug, projectId, issueId) }),
  });
}

export function useDeleteComment(slug: string, projectId: string, issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => deleteComment(slug, projectId, issueId, commentId),

    onMutate: async (commentId) => {
      const key = commentKeys.list(slug, projectId, issueId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Paginated<Comment>>(key);

      qc.setQueryData<Paginated<Comment>>(key, (old) =>
        old
          ? {
              ...old,
              count: Math.max(0, old.count - 1),
              results: old.results.filter((c) => c.id !== commentId),
            }
          : old,
      );

      return { prev };
    },

    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(commentKeys.list(slug, projectId, issueId), ctx.prev);
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: commentKeys.all(slug, projectId, issueId) });
      // Deleting writes a `comment.deleted` activity record.
      qc.invalidateQueries({ queryKey: activityKeys.issue(slug, projectId, issueId) });
      qc.invalidateQueries({ queryKey: activityKeys.project(slug, projectId) });
    },
  });
}