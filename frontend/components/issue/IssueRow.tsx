"use client";

import clsx from "clsx";
import { Avatar, IssueId, LabelTag, PriorityDot } from "@/components/ui";
import { formatDistanceToNow } from "@/lib/time";
import type { Issue } from "@/types/issue";

/**
 * IssueRow — one line of the issue list. See SCREEN_BLUEPRINTS §2.7.
 *
 * Grid: [id 78px] [title 1fr] [labels auto] [priority auto] [avatar 26px]
 * The whole row is a button (opens the drawer) — not a link — so the drawer can
 * stay a pure client-side concern while the URL still records `?issue=<id>`.
 */

export interface IssueRowProps {
  issue: Issue;
  /** Project identifier, used for the "AMI-7" display id. */
  identifier: string;
  selected?: boolean;
  onOpen: (issueId: string) => void;
}

export function IssueRow({ issue, identifier, selected, onOpen }: IssueRowProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(issue.id)}
      className={clsx(
        "w-full text-left grid grid-cols-[78px_1fr_auto_auto_auto] gap-3.5 items-center",
        "py-3 pr-2 border-b border-dashed border-[color:var(--color-rule)]",
        "transition-colors duration-[var(--duration-fast)]",
        selected ? "bg-[rgba(31,63,168,0.05)]" : "hover:bg-[rgba(31,63,168,0.025)]",
      )}
    >
      <IssueId project={identifier} sequence={issue.sequence_id} />

      <span className="min-w-0">
        <span className="block text-[13px] text-[color:var(--color-ink)] truncate">
          {issue.title}
        </span>
        <span className="block text-[8.5px] uppercase tracking-[0.2em] text-[color:var(--color-ink-3)] font-sans font-medium mt-1 truncate">
          {issue.state.name} &middot; {issue.priority} &middot; updated{" "}
          {formatDistanceToNow(issue.updated_at)}
          {issue.created_by?.username ? ` by ${issue.created_by.username}` : ""}
        </span>
      </span>

      <span className="flex items-center gap-1.5 flex-wrap justify-end">
        {issue.labels.slice(0, 2).map((l) => (
          <LabelTag key={l.id} name={l.name} color={l.color} />
        ))}
        {issue.labels.length > 2 && (
          <span className="text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-ink-3)] font-sans font-medium">
            +{issue.labels.length - 2}
          </span>
        )}
      </span>

      <PriorityDot priority={issue.priority} />

      {issue.assignee ? (
        <Avatar name={issue.assignee.username} size="sm" />
      ) : (
        <span
          className="w-6 h-6 inline-flex items-center justify-center rounded-full border border-dashed border-[color:var(--color-rule)] text-[color:var(--color-ink-3)] text-[10px]"
          title="unassigned"
          aria-label="unassigned"
        >
          &ndash;
        </span>
      )}
    </button>
  );
}