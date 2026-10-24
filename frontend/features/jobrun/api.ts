/**
 * JobRun（历史名 TaskRun）API — docs/api/07-cache-and-tasks.md · 规范路由见 10 号契约。
 *
 * One read endpoint. There is no "cancel" — the job is short-lived by design.
 * Phase 4：切换到 /api/v1/projects/{pid}/jobruns/{id}/（与业务 Task 术语分离）。
 */

import { api } from "@/lib/api";
import type { TaskRun } from "@/types/task";

export async function getTaskRun(
  _slug: string,
  projectId: string,
  taskId: string,
): Promise<TaskRun> {
  return api<TaskRun>(`/projects/${projectId}/jobruns/${taskId}`);
}
