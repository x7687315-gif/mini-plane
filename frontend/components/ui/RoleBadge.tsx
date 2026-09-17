import clsx from "clsx";
import { ROLE, roleLabel } from "@/types/workspace";

/**
 * RoleBadge — renders the 20/15/5 role value as a tracked uppercase chip.
 *
 * Visual rule (DESIGN.md §1.2): only Admin gets the accent colour; Member is
 * ink-2; Viewer is ink-3 (deliberately low-contrast — it's the "read-only" signal).
 */

export interface RoleBadgeProps {
  role: number | null | undefined;
  /** "sm" for table cells / list rows, "xs" for tight spots. */
  size?: "xs" | "sm";
  /** Render as a bordered chip (default) or bare text. */
  bare?: boolean;
  className?: string;
}

function tone(role: number | null | undefined): string {
  if (role === ROLE.ADMIN) return "text-[color:var(--color-accent)] border-[color:var(--color-accent)]";
  if (role === ROLE.MEMBER) return "text-[color:var(--color-ink-2)] border-[color:var(--color-rule)]";
  return "text-[color:var(--color-ink-3)] border-[color:var(--color-rule)]";
}

export function RoleBadge({ role, size = "sm", bare = false, className }: RoleBadgeProps) {
  return (
    <span
      className={clsx(
        "inline-block font-sans font-medium uppercase",
        size === "xs" ? "text-[8px] tracking-[0.16em]" : "text-[9px] tracking-[0.18em]",
        bare ? "" : "px-1.5 py-0.5 border",
        tone(role),
        className,
      )}
    >
      {roleLabel(role)}
    </span>
  );
}