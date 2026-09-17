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

/** Serialise a query object into the backend's comma-separated multi-value form. */
export function serializeIssueQuery(q: IssueListQuery): string {
  const params = new URLSearchParams();
  if (q.state?.length) params.set("state", q.state.join(","));
  if (q.priority?.length) params.set("priority", q.priority.join(","));
  if (q.assignee) params.set("assignee", q.assignee);
  if (q.labels?.length) params.set("labels", q.labels.join(","));
  if (q.search?.trim()) params.set("search", q.search.trim());
  if (q.ordering) params.set("ordering", q.ordering);
  if (q.page && q.page > 1) params.set("page", String(q.page));
  if (q.per_page) params.set("per_page", String(q.per_page));
  return params.toString();
}

/** Display id helper: `AMI-7` (identifier comes from the Project). */
export function formatIssueId(identifier: string, sequenceId: number): string {
  return `${identifier}-${sequenceId}`;
}
