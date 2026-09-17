"use client";

import clsx from "clsx";
import { Avatar, IssueId, LabelTag, PriorityDot } from "@/components/ui";
import { formatDistanceToNow } from "@/lib/time";
import type { Issue } from "@/types/issue";

/**
 * IssueRow — one line of the issue list. See SCREEN_BLUEPRINTS §2.7.
 *
 * Grid: [id 78px] [title 1fr] [labels auto] [priority auto] [avatar 26px]
 *
 * **Structure note (Sprint 6)**: the row is a flex wrapper holding a leading
 * checkbox plus the clickable row body — it is *not* a checkbox inside a button.
 * A `<button>` may not contain an interactive descendant (invalid HTML, and the
 * nested control is unreachable by keyboard), so adding row selection forced this
 * split. The inner grid is unchanged, which keeps the columns aligned with the
 * header and the skeleton.
 *
 * Long titles and the metadata line are both `truncate`, so one pathological title
 * cannot push the priority column off-screen.
 */

export interface IssueRowProps {
  issue: Issue;
  /** Project identifier, used for the "AMI-7" display id. */
  identifier: string;
  selected?: boolean;
  onOpen: (issueId: string) => void;
  /** Sprint 6: row selection for batch operations. */
  checked?: boolean;
  onToggleSelect?: (issueId: string) => void;
}

export function IssueRow({
  issue,
  identifier,
  selected,
  onOpen,
  checked = false,
  onToggleSelect,
}: IssueRowProps) {
  return (
    <div
      className={clsx(
        "flex items-center gap-3 py-3 pr-2 border-b border-dashed border-[color:var(--color-rule)]",
        "transition-colors duration-[var(--duration-fast)]",
        checked
          ? "bg-[rgba(31,63,168,0.07)]"
          : selected
            ? "bg-[rgba(31,63,168,0.05)]"
            : "hover:bg-[rgba(31,63,168,0.025)]",
      )}
    >
      {onToggleSelect && (
        <label
          className="flex items-center cursor-pointer pl-1"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggleSelect(issue.id)}
            aria-label={`select ${identifier}-${issue.sequence_id}`}
            className="appearance-none w-3.5 h-3.5 border border-[color:var(--color-rule)] bg-transparent cursor-pointer relative checked:border-[color:var(--color-accent)] checked:before:content-[''] checked:before:absolute checked:before:inset-[3px] checked:before:bg-[color:var(--color-accent)] focus-visible:outline-none"
          />
        </label>
      )}

      <button
        type="button"
        onClick={() => onOpen(issue.id)}
        className="flex-1 min-w-0 text-left grid grid-cols-[78px_1fr_auto_auto_auto] gap-3.5 items-center"
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
    </div>
  );
}
