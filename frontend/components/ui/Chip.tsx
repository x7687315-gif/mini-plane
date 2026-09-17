import clsx from "clsx";
import type { HTMLAttributes, MouseEvent, ReactNode } from "react";

/**
 * Chip — see DESIGN.md §4.2.
 *
 * Used for filter chips and small status pills. Default, active, accent variants.
 * Always uppercase, 0.14em letter-spacing, Inter 10px.
 *
 * When `onClick` is provided the chip renders as a real <button> (keyboard +
 * screen-reader accessible); otherwise it's a plain <span>.
 */

type Variant = "default" | "active" | "accent";

export interface ChipProps extends Omit<HTMLAttributes<HTMLElement>, "onClick"> {
  variant?: Variant;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  children: ReactNode;
}

const variantClass: Record<Variant, string> = {
  default:
    "bg-transparent text-[color:var(--color-ink-2)] border-[color:var(--color-rule)] hover:border-[color:var(--color-ink-2)]",
  active:
    "bg-[color:var(--color-ink)] text-[color:var(--color-paper)] border-[color:var(--color-ink)]",
  accent:
    "bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)] border-[color:var(--color-accent)]",
};

export function Chip({ variant = "default", className, children, onClick, ...rest }: ChipProps) {
  const classes = clsx(
    "inline-flex items-center gap-1.5 px-2.5 py-1.5 border",
    "text-[10px] uppercase tracking-[0.14em] font-medium font-sans",
    "rounded-[var(--radius-sm)] select-none",
    "transition-colors duration-[var(--duration-fast)]",
    variantClass[variant],
    onClick && "cursor-pointer",
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes} {...rest}>
        {children}
      </button>
    );
  }

  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}