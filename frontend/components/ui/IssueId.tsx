import clsx from "clsx";

/**
 * IssueId — see DESIGN.md §4.6.
 *
 * Always rendered as Cormorant-italic + accent colour + "AMI-7" format.
 * Reused everywhere: IssueRow, IssueDrawer header, Activity, Comments, Refs.
 *
 * Format rule: `${identifier}-${sequence_id}` (see backend 04-issues.md §"展示编号").
 */

export interface IssueIdProps {
  /** Project identifier, e.g. "AMI" */
  project: string;
  /** Per-project sequence id, e.g. 7 → renders "AMI-07" */
  sequence: number;
  /** Pad sequence to N digits (default 2) */
  pad?: number;
  className?: string;
}

export function IssueId({ project, sequence, pad = 2, className }: IssueIdProps) {
  return (
    <span
      className={clsx(
        "font-serif italic font-medium tracking-[0.05em]",
        "text-[14px] text-[color:var(--color-accent)]",
        className,
      )}
    >
      {project}-{String(sequence).padStart(pad, "0")}
    </span>
  );
}