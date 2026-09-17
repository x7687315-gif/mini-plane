/**
 * TaskRun polling policy — extracted from the hook so it can be unit-tested.
 *
 * Sprint 6 的验收项里有一条"unit: TaskRun 轮询直到 success/failure，30 次后超时"。
 * 把这条规则留在 `useQuery` 的 `refetchInterval` 闭包里就永远测不到它 —— 而它恰恰是
 * 那种"写错了没人发现、只是悄悄多打一辈子请求"的逻辑（或者更糟：永远不停）。
 */

import { isTerminalTaskRun, type TaskRun } from "@/types/task";

/** Poll cadence, from the Sprint 6 plan. */
export const TASK_POLL_INTERVAL_MS = 1000;

/** Hard stop: ≈30s. A run that never finishes must surface as "还在跑", not spin forever. */
export const TASK_POLL_MAX_ATTEMPTS = 30;

/**
 * Decide whether to poll again, and after how long.
 *
 * Returns `false` (React Query's "stop") when either:
 * - the run is terminal (`success` / `failure`) — nothing more will change;
 * - the attempt budget is exhausted — the caller shows a "still running" hint instead
 *   of an unbounded loop.
 *
 * `attempts` is the number of observations already made, so a budget of 30 means the
 * 30th observation is still allowed and the 31st is not.
 */
export function nextTaskPollDelay(
  run: TaskRun | undefined,
  attempts: number,
): number | false {
  if (run && isTerminalTaskRun(run.status)) return false;
  if (attempts >= TASK_POLL_MAX_ATTEMPTS) return false;
  return TASK_POLL_INTERVAL_MS;
}

/** True when polling gave up on a run that never reached a terminal state. */
export function isTaskTimedOut(run: TaskRun | undefined, attempts: number): boolean {
  if (!run) return false;
  return !isTerminalTaskRun(run.status) && attempts >= TASK_POLL_MAX_ATTEMPTS;
}

/** Human-readable progress line for the bulk bar. */
export function describeTaskStatus(run: TaskRun | undefined): string | null {
  if (!run) return null;
  if (run.status === "pending") return "queued…";
  if (run.status === "running") return "running…";
  if (run.status === "success") {
    const r = run.result;
    if (!r) return "done";
    // `changed` is the number that actually differed — not the number we sent.
    return `${r.changed} of ${r.issues} changed`;
  }
  return run.error || "failed";
}
