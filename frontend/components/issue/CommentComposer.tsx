"use client";

import { useState, type KeyboardEvent } from "react";
import { Avatar, Button, Textarea } from "@/components/ui";
import { ArrowRightIcon } from "@/components/icons";
import { ApiError } from "@/lib/api";
import { flattenErrors } from "@/types/auth";
import { useAuthStore } from "@/stores/auth";

/**
 * CommentComposer — see SCREEN_BLUEPRINTS §2.9.
 *
 * The drawer's bottom bar: avatar + textarea + post. Kept as a controlled draft
 * with a local `pending` flag so the box clears the instant the server accepts,
 * while a failed POST keeps the text where the user left it (losing a paragraph
 * because of a 500 is unforgivable).
 *
 * Posting is Cmd/Ctrl+Enter — Enter itself must stay a newline, because comments
 * are where people paste stack traces and reproduction steps.
 */

export interface CommentComposerProps {
  onSubmit: (content: string) => Promise<unknown>;
  /** Effective role < Member → the backend answers 403, so we hide the box. */
  canWrite: boolean;
}

export function CommentComposer({ onSubmit, canWrite }: CommentComposerProps) {
  const me = useAuthStore((s) => s.user);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = draft.trim();

  if (!canWrite) {
    return (
      <p className="text-[11px] italic font-serif text-[color:var(--color-ink-3)]">
        You have read-only access to this project — commenting needs the Member role.
      </p>
    );
  }

  const post = async () => {
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      setDraft("");
    } catch (e) {
      // Keep the draft: the user should never have to retype a paragraph.
      if (e instanceof ApiError) {
        const flat = flattenErrors(e.body);
        setError(
          flat.fields.content ?? flat.form ?? `发送失败（HTTP ${e.status}）`,
        );
      } else {
        setError("网络异常，请稍后重试。");
      }
    } finally {
      setPending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void post();
    }
  };

  return (
    <div>
      <div className="flex gap-3 items-start">
        <Avatar name={me?.username} size="sm" className="mt-1" />
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="写条评论…"
          aria-label="写评论"
          error={Boolean(error)}
          className="min-h-[72px] text-[12px]"
        />
      </div>

      <div className="flex items-center justify-between mt-2 pl-9">
        <span className="text-[9px] uppercase tracking-[0.2em] font-sans font-medium text-[color:var(--color-ink-3)]">
          ⌘/ctrl · enter
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void post()}
          disabled={!trimmed || pending}
        >
          {pending ? "发布中…" : "发布"}
          {!pending && <ArrowRightIcon size={11} />}
        </Button>
      </div>

      {error && (
        <p className="mt-2 pl-9 text-[11px] text-[color:var(--color-urgent)]">{error}</p>
      )}
    </div>
  );
}
