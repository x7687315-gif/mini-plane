/**
 * Issue / Label domain types — mirrors docs/api/04-issues.md.
 */

import type { IssueState } from "./project";
import type { MemberSummary } from "./workspace";

/** priority is a string enum on the wire (not a number). */
export type IssuePriority = "none" | "urgent" | "high" | "medium" | "low";

export const PRIORITY_VALUES: IssuePriority[] = ["none", "urgent", "high", "medium", "low"];

/** Severity order used by the `priority` / `-priority` ordering (backend §ordering 白名单). */
export const PRIORITY_SEVERITY: Record<IssuePriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

export function priorityLabel(p: IssuePriority): string {
  return p === "none" ? "none" : p;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Issue {
  id: string;
  sequence_id: number;
  project: string;
  title: string;
  description: string;
  priority: IssuePriority;
  state: IssueState;
  assignee: MemberSummary | null;
  created_by: MemberSummary;
  labels: Label[];
  created_at: string;
  updated_at: string;
}

/* ---------------- create / update payloads ---------------- */

export interface CreateIssuePayload {
  title: string;
  description?: string;
  /** Omit → backend picks the project's `group=backlog` state. */
  state_id?: string;
  /** Omit → "none". */
  priority?: IssuePriority;
  /** Omit or null → unassigned. Must be a ProjectMember. */
  assignee_id?: string | null;
  /** Omit → no labels. Max 50. */
  label_ids?: string[];
}

export interface UpdateIssuePayload {
  title?: string;
  description?: string;
  state_id?: string;
  priority?: IssuePriority;
  /** `null` clears the assignee. */
  assignee_id?: string | null;
  /** `[]` clears all labels. */
  label_ids?: string[];
}

export interface CreateLabelPayload {
  name: string;
  /** Omit → "#64748b". Must match #RRGGBB. */
  color?: string;
}

export interface UpdateLabelPayload {
  name?: string;
  color?: string;
}

/* ---------------- list query ---------------- */

/** ordering whitelist — anything else is a 400 from the backend. */
export type IssueOrdering =
  | "-created_at"
  | "created_at"
  | "sequence_id"
  | "-sequence_id"
  | "priority"
  | "-priority";

export const ISSUE_ORDERING_OPTIONS: { value: IssueOrdering; label: string }[] = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "-sequence_id", label: "Highest number" },
  { value: "sequence_id", label: "Lowest number" },
  { value: "-priority", label: "Most urgent" },
  { value: "priority", label: "Least urgent" },
];

export interface IssueListQuery {
  /** State ids (OR within the field). */
  state?: string[];
  priority?: IssuePriority[];
  /** User id, or the literal "me". */
  assignee?: string;
  /** Label ids (OR / union — frozen semantics). */
  labels?: string[];
  search?: string;
  ordering?: IssueOrdering;
  page?: number;
  per_page?: number;
}

/**
 * Percent-encode one value for the query string, but keep commas literal.
 *
 * `URLSearchParams` encodes `,` as `%2C`, which turns the multi-value convention
 * into `?state=s-1%2Cs-2`. The backend decodes it back and behaves identically, but
 * the address bar becomes unreadable and un-editable — and the whole point of
 * keeping filters in the URL (SCREEN_BLUEPRINTS §2.7) is that a human can read,
 * paste and hand-edit it. Comma is a legal `sub-delim` in RFC 3986, so leaving it
 * raw is both valid and faithful to 04 契约's documented form (`state=<id>,<id>`).
 *
 * Everything else still goes through `encodeURIComponent` — a search term with a
 * space or an `&` must not break the query.
 */
function encodeQueryValue(value: string): string {
  return encodeURIComponent(value).replace(/%2C/gi, ",");
}

/**
 * Serialise a query object into the backend's comma-separated multi-value form.
 *
 * Hand-rolled instead of `URLSearchParams` so commas stay literal (see above).
 * Default values are omitted on purpose: `page=1` and the default ordering leave
 * no trace in the URL, so "clear filters" and "first visit" produce the same address.
 */
export function serializeIssueQuery(q: IssueListQuery): string {
  const parts: string[] = [];
  const add = (key: string, value: string) => {
    parts.push(`${key}=${encodeQueryValue(value)}`);
  };

  if (q.state?.length) add("state", q.state.join(","));
  if (q.priority?.length) add("priority", q.priority.join(","));
  if (q.assignee) add("assignee", q.assignee);
  if (q.labels?.length) add("labels", q.labels.join(","));
  if (q.search?.trim()) add("search", q.search.trim());
  if (q.ordering) add("ordering", q.ordering);
  if (q.page && q.page > 1) add("page", String(q.page));
  if (q.per_page) add("per_page", String(q.per_page));

  return parts.join("&");
}

/** Display id helper: `AMI-7` (identifier comes from the Project). */
export function formatIssueId(identifier: string, sequenceId: number): string {
  return `${identifier}-${sequenceId}`;
}
