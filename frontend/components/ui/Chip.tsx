import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

/**
 * Chip — see DESIGN.md §4.2.
 *
 * Used for filter chips and small status pills. Default, active, accent variants.
 * Always uppercase, 0.14em letter-spacing, Inter 10px.
 */

type Variant = "default" | "active" | "accent";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
  children: ReactNode;
}

const variantClass: Record<Variant, string> = {
  default:
    "bg-transparent text-[color:var(--color-ink-2)] border-[color:var(--color-rule)]",
  active:
    "bg-[color:var(--color-ink)] text-[color:var(--color-paper)] border-[color:var(--color-ink)]",
  accent:
    "bg-transparent text-[color:var(--color-accent)] border-[color:var(--color-accent)]",
};

export function Chip({
  variant = "default",
  className,
  children,
  ...rest
}: ChipProps) {
  return (
    <span
      {...rest}
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-1.5 border",
        "text-[10px] uppercase tracking-[0.14em] font-medium font-sans",
        "rounded-[var(--radius-sm)] cursor-pointer select-none",
        "transition-colors duration-[var(--duration-fast)]",
        variantClass[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}