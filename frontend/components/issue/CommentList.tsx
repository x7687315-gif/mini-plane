"use client";

import { useState, type KeyboardEvent } from "react";
import { Avatar, Button, Modal, Textarea } from "@/components/ui";
import { formatDateTime } from "@/lib/time";
import { ApiError } from "@/lib/api";
import { flattenErrors } from "@/types/auth";
import { canManageComment, type Comment } from "@/types/comment";

/**
 * CommentList — see SCREEN_BLUEPRINTS §2.9.
 *
 * **Ascending** order, as the API returns it (05 契约: a comment thread is a
 * conversation, oldest on top — the opposite of the activity feed right above it
 * in the same drawer; the two orderings are intentional and must not be "fixed").
 *
 * Edit/delete buttons follow the contract's dual rule: the author, or an Admin.
 * A plain project Member cannot touch someone else's comment, so the buttons are
 * simply absent for them — no disabled state, no mystery 403.
 *
 * Deleting someone *else's* comment is a destructive act on another person's words,
 * so it goes through the Modal (§5.4); deleting your own is a one-click undo.
 */

export interface CommentListProps {
  comments: Comment[];
  currentUserId: string | undefined;
  /** Effective role in this project (`Project.current_user_role`). */
  role: number | null | undefined;
  isLoading: boolean;
  error: unknown;
  total?: number;
  onRetry?: () => void;
  onUpdate: (commentId: string, content: string) => Promise<unknown>;
  onDelete: (commentId: string) => Promise<unknown>;
}

export function CommentList({
  comments,
  currentUserId,
  role,
  isLoading,
  error,
  total,
  onRetry,
  onUpdate,
  onDelete,
}: CommentListProps) {
  if (isLoading) return <CommentSkeleton />;

  if (error) {
    return (
      <div className="border border-[color:var(--color-urgent)] px-3 py-2">
        <p className="text-[11px] text-[color:var(--color-urgent)]">无法加载评论。</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 text-[10px] uppercase tracking-[0.2em] font-sans font-medium text-[color:var(--color-ink-2)] underline underline-offset-2 hover:text-[color:var(--color-ink)]"
          >
            retry
          </button>
        )}
      </div>
    );
  }

  if (!comments.length) {
    return (
      <div className="py-8 text-center">
        <p className="font-serif italic text-[15px] text-[color:var(--color-ink-2)]">
          No comments yet
        </p>
        <p className="mt-1 text-[11px] text-[color:var(--color-ink-3)]">
          第一条评论会同时出现在 Activity 时间线上。
        </p>
      </div>
    );
  }

  return (
    <div>
      <ul className="border-t border-[color:var(--color-rule)]">
        {comments.map((c) => (
          <CommentRow
            key={c.id}
            comment={c}
            currentUserId={currentUserId}
            role={role}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </ul>

      {total != null && total > comments.length && (
        <p className="mt-3 text-[10px] italic font-serif text-[color:var(--color-ink-3)]">
          Showing the oldest {comments.length} of {total} comments — the rest need
          pagination (a later sprint).
        </p>
      )}
    </div>
  );
}

/* ---------------- one row ---------------- */

interface CommentRowProps {
  comment: Comment;
  currentUserId: string | undefined;
  role: number | null | undefined;
  onUpdate: (commentId: string, content: string) => Promise<unknown>;
  onDelete: (commentId: string) => Promise<unknown>;
}

function CommentRow({ comment, currentUserId, role, onUpdate, onDelete }: CommentRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [pending, setPending] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Optimistic rows use an `optimistic-…` id until the server answers.
  const isOptimistic = comment.id.startsWith("optimistic-");
  const manageable = canManageComment(comment, currentUserId, role);
  const isMine = Boolean(currentUserId && comment.author.id === currentUserId);
  const wasEdited = comment.updated_at !== comment.created_at;

  const save = async () => {
    const next = draft.trim();
    if (!next || next === comment.content) {
      setEditing(false);
      setDraft(comment.content);
      return;
    }
    setPending(true);
    setRowError(null);
    try {
      await onUpdate(comment.id, next);
      setEditing(false);
    } catch (e) {
      if (e instanceof ApiError) {
        const flat = flattenErrors(e.body);
        setRowError(flat.fields.content ?? flat.form ?? `保存失败（HTTP ${e.status}）`);
      } else {
        setRowError("网络异常，请稍后重试。");
      }
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    setConfirming(false);
    setPending(true);
    setRowError(null);
    try {
      await onDelete(comment.id);
    } catch (e) {
      setRowError(
        e instanceof ApiError ? `删除失败（HTTP ${e.status}）` : "网络异常，请稍后重试。",
      );
    } finally {
      setPending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void save();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
      setDraft(comment.content);
      setRowError(null);
    }
  };

  return (
    <li
      id={`comment-${comment.id}`}
      className={
        "py-3.5 border-b border-dashed border-[color:var(--color-rule)] " +
        (isOptimistic ? "opacity-60" : "")
      }
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Avatar name={comment.author?.username} size="xs" />
        <span className="text-[12px] font-medium text-[color:var(--color-ink)] font-sans">
          {comment.author?.username ?? "?"}
        </span>
        {isMine && (
          <span className="bp-hint text-[color:var(--color-accent)]">you</span>
        )}
        <span className="text-[10px] italic font-serif text-[color:var(--color-ink-3)]">
          {formatDateTime(comment.created_at)}
        </span>
        {wasEdited && !isOptimistic && (
          <span className="text-[10px] italic font-serif text-[color:var(--color-ink-3)]">
            · edited
          </span>
        )}

        <span className="ml-auto flex items-center gap-3">
          {isOptimistic && (
            <span className="bp-hint">posting…</span>
          )}

          {!isOptimistic && manageable && !editing && (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setRowError(null);
                }}
                className="text-[9px] uppercase tracking-[0.2em] font-sans font-medium text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
              >编辑</button>
              <button
                type="button"
                onClick={() => (isMine ? void remove() : setConfirming(true))}
                disabled={pending}
                className="text-[9px] uppercase tracking-[0.2em] font-sans font-medium text-[color:var(--color-ink-3)] hover:text-[color:var(--color-urgent)] disabled:opacity-40"
              >删除</button>
            </>
          )}
        </span>
      </div>

      {editing ? (
        <div>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
            aria-label="edit comment"
            error={Boolean(rowError)}
            className="min-h-[72px] text-[12px]"
          />
          <div className="flex items-center gap-3 mt-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void save()}
              disabled={pending || !draft.trim()}
            >
              {pending ? "saving…" : "save"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false);
                setDraft(comment.content);
                setRowError(null);
              }}
              disabled={pending}
            >取消</Button>
            <span className="bp-hint">⌘/ctrl · enter to save</span>
          </div>
        </div>
      ) : (
        <p className="text-[12px] leading-relaxed text-[color:var(--color-ink)] whitespace-pre-wrap pl-7">
          {comment.content}
        </p>
      )}

      {rowError && (
        <p className="mt-1.5 pl-7 text-[11px] text-[color:var(--color-urgent)]">{rowError}</p>
      )}

      {/* Deleting someone else's comment is a modal-gated action (§5.4). */}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this comment?"
        subtitle={`by ${comment.author?.username ?? "?"} · you are acting as Admin`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>取消</Button>
            <Button
              variant="secondary"
              onClick={() => void remove()}
              className="border-[color:var(--color-urgent)] text-[color:var(--color-urgent)]"
            >
              delete comment
            </Button>
          </>
        }
      >
        <p className="text-[12px] text-[color:var(--color-ink-2)] leading-relaxed">
          这条评论是其他成员写的。删除会在该 Issue 的活动流里留下一条
          「删除了评论」的记录，正文不可恢复。
        </p>
      </Modal>
    </li>
  );
}

/* ---------------- states ---------------- */

function CommentSkeleton() {
  return (
    <div className="animate-pulse border-t border-[color:var(--color-rule)]" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="py-4 border-b border-dashed border-[color:var(--color-rule)]">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-5 w-5 rounded-full bg-[color:var(--color-paper-2)]" />
            <div className="h-3 w-24 bg-[color:var(--color-paper-2)]" />
          </div>
          <div className="h-3 w-full bg-[color:var(--color-paper-2)] mb-1.5" />
          <div className="h-3 w-4/5 bg-[color:var(--color-paper-2)]" />
        </div>
      ))}
    </div>
  );
}
