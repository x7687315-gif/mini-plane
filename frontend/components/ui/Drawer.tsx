"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
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
  /** Accessible name when `crumb` is a ReactNode rather than plain text. */
  ariaLabel?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Drawer({
  open,
  onClose,
  width = 640,
  crumb,
  footer,
  children,
  className,
  ariaLabel,
}: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus the panel on open, and return focus to the trigger on close.
  useEffect(() => {
    if (!open) return;
    const previously = document.activeElement;
    if (previously instanceof HTMLElement) restoreFocus.current = previously;
    const frame = requestAnimationFrame(() => ref.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      const target = restoreFocus.current;
      restoreFocus.current = null;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [open]);

  /** 保持 Tab/Shift+Tab 在对话框内部；焦点恢复由上面的 effect 负责。 */
  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const node = ref.current;
    if (!node) return;
    const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.getClientRects().length > 0,
    );
    if (items.length === 0) {
      event.preventDefault();
      node.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || active === node) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (typeof document === "undefined") return null;
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal
      aria-label={ariaLabel ?? (typeof crumb === "string" ? crumb : "面板")}
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
        onKeyDown={onPanelKeyDown}
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
              aria-label="关闭"
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