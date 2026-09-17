/**
 * TaskRun domain types — mirrors docs/api/07-cache-and-tasks.md §2.2.
 *
 * A long-running server-side job (currently only `bulk_assign_labels`). The status
 * lives in the backend's own table rather than Celery's AsyncResult, so it is
 * queryable/auditable and the `pending → running → success | failure` transition is
 * observable from the client.
 */

export type TaskRunStatus = "pending" | "running" | "success" | "failure";

export interface TaskRunResult {
  /** How many issues the job touched. */
  issues: number;
  /** How many of them actually changed (unchanged ones produce no activity). */
  changed: number;
  /** How many labels were requested. */
  labels: number;
  label_ids: string[];
}

export interface TaskRun {
  id: string;
  /** e.g. "bulk_assign_labels" */
  kind: string;
  status: TaskRunStatus;
  params: Record<string, unknown>;
  result: TaskRunResult | null;
  /** Human-readable reason when `status === "failure"`. */
  error: string;
  actor: { id: string; username: string; avatar: string | null };
  created_at: string;
  updated_at: string;
}

/** A run is finished once it succeeds or fails; only then can polling stop. */
export function isTerminalTaskRun(status: TaskRunStatus | undefined): boolean {
  return status === "success" || status === "failure";
}
