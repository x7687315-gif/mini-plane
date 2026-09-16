import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

/**
 * Card — see DESIGN.md §4.3.
 *
 * Deliberately NO shadow, NO border-radius. Just a 0.5px border + paper background.
 * This is the architectural corner of Blueprint Editorial: every "container" is a flat
 * rectangle, never a floating chip.
 */

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={clsx(
        "bg-[color:var(--color-paper)] border border-[color:var(--color-rule)]",
        "p-5 rounded-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={clsx(
        "pb-3 mb-4 border-b border-[color:var(--color-rule)]",
        "font-serif italic text-[20px] text-[color:var(--color-ink)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={clsx("text-[13px] text-[color:var(--color-ink)]", className)}>
      {children}
    </div>
  );
}