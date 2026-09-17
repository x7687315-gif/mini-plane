/**
 * URL ↔ filter state helpers.
 *
 * The issue list keeps its filter state in the URL query string so that
 * a filtered view is shareable and survives refresh (SCREEN_BLUEPRINTS §2.7).
 *
 * These are pure functions — the React binding lives in `useIssueFilters()`.
 */

import type { IssueListQuery, IssueOrdering, IssuePriority } from "@/types/issue";
import { PRIORITY_VALUES } from "@/types/issue";

const VALID_ORDERING: IssueOrdering[] = [
  "-created_at",
  "created_at",
  "sequence_id",
  "-sequence_id",
  "priority",
  "-priority",
];

function parseList(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

/** Parse the current URL query into a typed IssueListQuery. */
export function parseIssueQuery(params: URLSearchParams): IssueListQuery {
  const priorities = parseList(params.get("priority"))?.filter(
    (p): p is IssuePriority => (PRIORITY_VALUES as string[]).includes(p),
  );

  const rawOrdering = params.get("ordering");
  const ordering = VALID_ORDERING.includes(rawOrdering as IssueOrdering)
    ? (rawOrdering as IssueOrdering)
    : undefined;

  const rawPage = Number(params.get("page"));
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  return {
    state: parseList(params.get("state")),
    priority: priorities?.length ? priorities : undefined,
    assignee: params.get("assignee") ?? undefined,
    labels: parseList(params.get("labels")),
    search: params.get("search")?.trim() || undefined,
    ordering,
    page,
  };
}

/** True when any filter (other than ordering/page) is active. */
export function hasActiveFilters(q: IssueListQuery): boolean {
  return Boolean(q.state?.length || q.priority?.length || q.assignee || q.labels?.length || q.search);
}

/** Count of active filter facets — used for the "Filters · 3" chip badge. */
export function countActiveFilters(q: IssueListQuery): number {
  let n = 0;
  if (q.state?.length) n += 1;
  if (q.priority?.length) n += 1;
  if (q.assignee) n += 1;
  if (q.labels?.length) n += 1;
  if (q.search) n += 1;
  return n;
}
