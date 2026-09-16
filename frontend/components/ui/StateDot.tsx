import clsx from "clsx";

/**
 * StateDot — a small filled circle used to represent an IssueState on the list.
 *
 * State colour is server-provided (`State.color`, e.g. "#94a3b8"). We don't enforce
 * a token here — states are user-defined, so the server is the source of truth.
 */

export interface StateDotProps {
  color: string;
  size?: number;
  className?: string;
}

export function StateDot({ color, size = 8, className }: StateDotProps) {
  return (
    <span
      className={clsx("inline-block rounded-full", className)}
      style={{ width: size, height: size, background: color }}
      aria-hidden
    />
  );
}