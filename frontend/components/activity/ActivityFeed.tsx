"use client";

import { Avatar } from "@/components/ui";
import { ArrowRightIcon } from "@/components/icons";
import { formatStamp } from "@/lib/time";
import {
  activityDiffs,
  activityHeadline,
  describeActivity,
  type Activity,
  type ActivityDiff,
} from "@/types/activity";

/**
 * ActivityFeed — see DESIGN.md §4.11 and SCREEN_BLUEPRINTS §2.9.
 *
 * Renders an audit trail as a paper logbook: a narrow timestamp column, the actor
 * avatar, then one sentence per record.
 *
 * Two contract facts drive the implementation:
 *
 * 1. **Order is the server's, verbatim.** 06 契约 says both feeds are
 *    `created_at` DESC and that records written in the same instant have *no*
 *    guaranteed relative order. So we never re-sort and never render "happened
 *    before/after" affordances — the array order is the only truth we have.
 * 2. **Values are already display-ready.** `old_value` / `new_value` contain
 *    names, not UUIDs (`{"state": "Todo"}`, `{"assignee": null}`). The only
 *    translation left is the `priority` enum → Chinese, which lives in
 *    `types/activity.ts` next to the rest of the copy mapping.
 */

export interface ActivityFeedProps {
  items: Activity[];
  isLoading: boolean;
  error: unknown;
  /** Total known to the server; when > items.length we admit the truncation. */
  total?: number;
  onRetry?: () => void;
  /** Jump to the Comments tab — the blueprint's `→ Comments` affordance. */
  onJumpToComments?: () => void;
}

export function ActivityFeed({
  items,
  isLoading,
  error,
  total,
  onRetry,
  onJumpToComments,
}: ActivityFeedProps) {
  if (isLoading) return <FeedSkeleton />;

  if (error) {
    return (
      <div className="border border-[color:var(--color-urgent)] px-3 py-2">
        <p className="text-[11px] text-[color:var(--color-urgent)]">
          无法加载活动记录。
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 text-[10px] uppercase tracking-[0.2em] font-sans font-medium text-[color:var(--color-ink-2)] underline underline-offset-2 hover:text-[color:var(--color-ink)]"
          >
            retry
          </button>
        )}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="py-8 text-center">
        <p className="font-serif italic text-[15px] text-[color:var(--color-ink-2)]">
          No activity yet
        </p>
        <p className="mt-1 text-[11px] text-[color:var(--color-ink-3)]">
          状态、优先级、指派人与标签的每一次改动都会留在这里。
        </p>
      </div>
    );
  }

  return (
    <div>
      <ol className="border-t border-[color:var(--color-rule)]">
        {items.map((a) => (
          <ActivityItem key={a.id} activity={a} onJumpToComments={onJumpToComments} />
        ))}
      </ol>

      {total != null && total > items.length && (
        <p className="mt-3 text-[10px] italic font-serif text-[color:var(--color-ink-3)]">
          Showing the latest {items.length} of {total} records — earlier history needs
          pagination (a later sprint).
        </p>
      )}
    </div>
  );
}

/* ---------------- one row ---------------- */

export interface ActivityItemProps {
  activity: Activity;
  onJumpToComments?: () => void;
}

export function ActivityItem({ activity, onJumpToComments }: ActivityItemProps) {
  const diffs = activityDiffs(activity);
  const headline = activityHeadline(activity);
  const actor = activity.actor?.username ?? "?";
  const isComment = activity.entity_type === "comment";

  return (
    <li
      className="grid grid-cols-[44px_20px_1fr] gap-x-3 gap-y-1 items-start py-2.5 border-b border-dashed border-[color:var(--color-rule)]"
      // Screen readers get the finished sentence; sighted users get the composed
      // layout below (bold actor + field pills). Both come from the same source.
      aria-label={describeActivity(activity)}
    >
      <time
        className="font-serif italic text-[10px] text-[color:var(--color-ink-3)] pt-[3px] tabular-nums"
        dateTime={activity.created_at}
      >
        {formatStamp(activity.created_at)}
      </time>

      <Avatar name={actor} size="xs" />

      <div className="min-w-0">
        <p className="text-[12px] leading-relaxed text-[color:var(--color-ink-2)]">
          <b className="font-medium text-[color:var(--color-ink)]">{actor}</b>{" "}
          {diffs.length ? (
            <>
              {diffs.map((d, i) => (
                <span key={d.field}>
                  {i > 0 && <span>，</span>}
                  将 <FieldPill diff={d} /> 从 {d.before} 改为 {d.after}
                </span>
              ))}
            </>
          ) : (
            <span>{headline}</span>
          )}
        </p>

        {isComment && (
          <button
            type="button"
            onClick={onJumpToComments}
            className="mt-1 inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] font-sans font-medium text-[color:var(--color-accent)] hover:opacity-80"
          >
            comments
            <ArrowRightIcon size={10} />
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Field pill — DESIGN.md §4.11: inline block, 0.5px border, italic Cormorant 11px.
 *
 * Only the *field name* becomes a pill. The values stay in the sentence flow so the
 * row still reads as a sentence instead of a table of chips.
 */
function FieldPill({ diff }: { diff: ActivityDiff }) {
  return (
    <span className="inline-block px-1.5 border border-[color:var(--color-rule)] font-serif italic text-[11px] leading-[1.5] text-[color:var(--color-ink-2)] align-baseline">
      {diff.label}
    </span>
  );
}

/* ---------------- states ---------------- */

function FeedSkeleton() {
  return (
    <div className="animate-pulse border-t border-[color:var(--color-rule)]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="grid grid-cols-[44px_20px_1fr] gap-x-3 items-center py-3 border-b border-dashed border-[color:var(--color-rule)]"
        >
          <div className="h-2.5 w-9 bg-[color:var(--color-paper-2)]" />
          <div className="h-5 w-5 rounded-full bg-[color:var(--color-paper-2)]" />
          <div className="h-3 w-2/3 bg-[color:var(--color-paper-2)]" />
        </div>
      ))}
    </div>
  );
}
