"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "@/components/icons";
import clsx from "clsx";

/**
 * Modal — see DESIGN.md §4 / SCREEN_BLUEPRINTS §2.6, §2.12.
 *
 * Centered panel for confirmations (delete workspace, delete someone else's comment).
 * Sprint 0: basic. Sprint 2+ will use it for "create project" and danger-zone.
 */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Optional Cormorant italic sub-line under title. */
  subtitle?: ReactNode;
  /** Footer area (action buttons). */
  footer?: ReactNode;
  children: ReactNode;
  /** Width override; default 480. */
  width?: number;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  footer,
  children,
  width = 480,
  className,
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open && ref.current) ref.current.focus();
  }, [open]);

  if (typeof document === "undefined") return null;
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal
      aria-label={typeof title === "string" ? title : undefined}
    >
      <div
        className="absolute inset-0 bg-[color:var(--color-ink)] opacity-30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={ref}
        tabIndex={-1}
        className={clsx(
          "relative bg-[color:var(--color-paper)] border border-[color:var(--color-rule)]",
          className,
        )}
        style={{ width: `min(${width}px, 90vw)` }}
      >
        <div className="flex items-center justify-between px-7 py-4 border-b border-[color:var(--color-rule)]">
          <div className="flex flex-col gap-1">
            <span className="font-serif italic text-[22px] text-[color:var(--color-ink)] font-medium leading-tight">
              {title}
            </span>
            {subtitle && (
              <span className="font-serif italic text-[12px] text-[color:var(--color-ink-3)] tracking-[0.04em]">
                {subtitle}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 inline-flex items-center justify-center border border-[color:var(--color-rule)] text-[color:var(--color-ink-2)] hover:text-[color:var(--color-ink)] hover:border-[color:var(--color-ink-2)]"
            aria-label="close"
          >
            <XIcon size={14} />
          </button>
        </div>
        <div className="px-7 py-5">{children}</div>
        {footer && (
          <div className="px-7 py-4 border-t border-[color:var(--color-rule)] flex items-center justify-end gap-3 bg-[color:var(--color-paper-2)]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}