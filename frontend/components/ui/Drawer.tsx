"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "@/components/icons";
import clsx from "clsx";

/**
 * Drawer — see DESIGN.md §4.8.
 *
 * Right-side panel for Issue detail, comment composer, etc.
 * - Slides in from the right (translateX(100%) → 0)
 * - Backdrop dims the rest of the page
 * - Esc closes; backdrop click closes
 *
 * Opened by URL state (`?issue=<uuid>`, owned by the list page) — the drawer itself
 * stays presentational and never touches the router. Optional `footer` slot pins an
 * action bar below the scroll area (Sprint 4: the comment composer).
 */

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Width override; default 640px (min(640px, 90vw)). */
  width?: number;
  /** Top-of-drawer crumb text (e.g. "AMI / WORK ITEM · AMI-07 · OPENED IN DRAWER"). */
  crumb?: ReactNode;
  /**
   * Persistent action bar pinned below the scroll area.
   *
   * The Issue drawer uses it for the comment composer: SCREEN_BLUEPRINTS §2.9 keeps
   * the composer visible whatever tab is active, which is impossible if it lives
   * inside the scrolling content.
   */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Drawer({
  open,
  onClose,
  width = 640,
  crumb,
  footer,
  children,
  className,
}: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus trap (basic — focus the panel when it opens)
  useEffect(() => {
    if (open && ref.current) ref.current.focus();
  }, [open]);

  if (typeof document === "undefined") return null;
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal
      aria-label={typeof crumb === "string" ? crumb : undefined}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[color:var(--color-ink)] opacity-30 backdrop-blur-[2px] bp-transition"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        ref={ref}
        tabIndex={-1}
        className={clsx(
          "relative ml-auto h-full bg-[color:var(--color-paper)] border-l border-[color:var(--color-rule)]",
          "flex flex-col shadow-[-24px_0_60px_-30px_rgba(27,26,23,0.28)]",
          "bp-transition",
          className,
        )}
        style={{
          width: `min(${width}px, 90vw)`,
          transform: "translateX(0)",
          animation: "drawer-slide-in 250ms var(--ease-out)",
        }}
      >
        {crumb != null && (
          <div className="flex items-center justify-between px-6 h-14 border-b border-[color:var(--color-rule)]">
            <span className="text-[9px] uppercase tracking-[0.24em] text-[color:var(--color-ink-3)] font-sans font-medium">
              {crumb}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 inline-flex items-center justify-center border border-[color:var(--color-rule)] text-[color:var(--color-ink-2)] hover:text-[color:var(--color-ink)] hover:border-[color:var(--color-ink-2)] bp-transition"
              aria-label="close"
            >
              <XIcon size={14} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-auto">{children}</div>

        {footer != null && (
          <div className="shrink-0 border-t border-[color:var(--color-rule)] px-8 py-4 bg-[color:var(--color-paper)]">
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes drawer-slide-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>,
    document.body,
  );
}