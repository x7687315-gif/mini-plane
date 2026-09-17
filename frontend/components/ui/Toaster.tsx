"use client";

import { useEffect } from "react";
import clsx from "clsx";
import { useToastStore, type Toast } from "@/stores/toast";

/**
 * Toaster — SCREEN_BLUEPRINTS §5.3「全局错误：顶部细线 banner，3s 后自动消失」。
 *
 * Fixed under the 56px TopBar, full width, hairline bottom border in the tone colour.
 * No shadow, no rounded corners, no icon — the tone is carried by a 1px rule and the
 * text colour, exactly like the inline field errors.
 *
 * Dismissal is owned by the item (not the store) so a re-render caused by an unrelated
 * store change cannot restart the timer and strand a toast on screen.
 */

const TONE_TEXT: Record<Toast["tone"], string> = {
  info: "text-[color:var(--color-ink-2)]",
  success: "text-[color:var(--color-accent)]",
  error: "text-[color:var(--color-urgent)]",
};

const TONE_RULE: Record<Toast["tone"], string> = {
  info: "border-[color:var(--color-rule)]",
  success: "border-[color:var(--color-accent)]",
  error: "border-[color:var(--color-urgent)]",
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);

  if (!toasts.length) return null;

  return (
    <div
      className="fixed left-0 right-0 top-14 z-[60] pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastLine key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastLine({ toast: t }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    const timer = setTimeout(() => dismiss(t.id), t.ttl);
    return () => clearTimeout(timer);
  }, [t.id, t.ttl, dismiss]);

  return (
    <div
      className={clsx(
        "pointer-events-auto bg-[color:var(--color-paper)] border-b px-8 py-2",
        "flex items-center justify-between gap-4",
        TONE_RULE[t.tone],
      )}
    >
      <span className={clsx("text-[11px] font-sans", TONE_TEXT[t.tone])}>{t.message}</span>
      <button
        type="button"
        onClick={() => dismiss(t.id)}
        className="text-[9px] uppercase tracking-[0.2em] font-sans font-medium text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
      >
        dismiss
      </button>
    </div>
  );
}
