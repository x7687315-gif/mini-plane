import clsx from "clsx";

/**
 * PriorityDot — see DESIGN.md §4.7.
 *
 * 8×8 square rotated 45°. Coloured fill for none/urgent/high/medium/low.
 * `none` is hollow: only border, no fill.
 */

export type Priority = "none" | "urgent" | "high" | "medium" | "low";

const colorMap: Record<Priority, string> = {
  none: "var(--color-none)",
  urgent: "var(--color-urgent)",
  high: "var(--color-high)",
  medium: "var(--color-medium)",
  low: "var(--color-low)",
};

export interface PriorityDotProps {
  priority: Priority;
  size?: number;
  className?: string;
}

export function PriorityDot({ priority, size = 8, className }: PriorityDotProps) {
  const c = colorMap[priority];
  const isNone = priority === "none";
  return (
    <span
      aria-label={priority}
      title={priority}
      className={clsx("inline-block rotate-45", className)}
      style={{
        width: size,
        height: size,
        background: isNone ? "transparent" : c,
        border: isNone ? `0.5px solid ${c}` : "none",
      }}
    />
  );
}