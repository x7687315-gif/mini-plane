import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Tab — see DESIGN.md §4.9.
 *
 * Activity / Comments / Refs style tabs. The active tab has an accent underline.
 * The number badge (e.g. "Activity 06") is rendered in italic Cormorant.
 */

export interface TabProps {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

export function Tab({ active, onClick, children, className }: TabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "font-sans uppercase tracking-[0.2em] text-[10px] py-1.5 cursor-pointer select-none",
        "border-b transition-colors duration-[var(--duration-fast)]",
        active
          ? "text-[color:var(--color-ink)] border-[color:var(--color-accent)]"
          : "text-[color:var(--color-ink-3)] border-transparent hover:text-[color:var(--color-ink)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

export interface TabCountProps {
  count: number;
}

/** Inline numeric badge inside a Tab — italic Cormorant, accent colour. */
export function TabCount({ count }: TabCountProps) {
  return (
    <em className="ml-1.5 not-italic font-serif italic text-[11px] tracking-normal text-[color:var(--color-accent)]">
      {String(count).padStart(2, "0")}
    </em>
  );
}