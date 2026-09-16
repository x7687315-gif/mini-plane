import clsx from "clsx";

/**
 * LabelTag — see DESIGN.md §4.12.
 *
 * Used on Issue rows to show the labels attached to an issue.
 * 9px UPPERCASE, color square + name, 0.5px border.
 */

export interface LabelTagProps {
  name: string;
  color: string;
  className?: string;
}

export function LabelTag({ name, color, className }: LabelTagProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-1.5 py-[3px] border border-[color:var(--color-rule)]",
        "text-[9px] uppercase tracking-[0.14em] font-medium font-sans",
        "text-[color:var(--color-ink-2)]",
        className,
      )}
    >
      <span
        aria-hidden
        className="inline-block"
        style={{ width: 6, height: 6, background: color }}
      />
      {name}
    </span>
  );
}