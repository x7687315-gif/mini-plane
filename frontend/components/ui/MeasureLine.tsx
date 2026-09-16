import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * MeasureLine — see DESIGN.md §4 / §1.2 of blueprint-editorial decorative language.
 *
 * "FIG · 01 ───── ◇ ───── AMI · ACTIVE" — a horizontal banner with two uppercase
 * tracked labels, separated by a hairline rule and a tiny accent diamond.
 * Used at the top of main content as a chapter marker.
 */

export interface MeasureLineProps {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}

export function MeasureLine({ left, right, className }: MeasureLineProps) {
  return (
    <div
      className={clsx(
        "flex items-center gap-3 my-3.5 text-[9px] uppercase tracking-[0.26em] text-[color:var(--color-ink-3)] font-sans font-medium",
        className,
      )}
    >
      {left && <span>{left}</span>}
      <span className="inline-block w-2.5 h-2.5 rotate-45 bg-[color:var(--color-accent)] opacity-80" />
      <span className="flex-1 h-px bg-[color:var(--color-rule)]" />
      {right && <span>{right}</span>}
    </div>
  );
}