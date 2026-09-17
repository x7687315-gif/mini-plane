/**
 * TaskRun API — docs/api/07-cache-and-tasks.md §2.1.
 *
 * One read endpoint. There is no "cancel" — the job is short-lived by design.
 */

import { api } from "@/lib/api";
import type { TaskRun } from "@/types/task";

export async function getTaskRun(
  slug: string,
  projectId: string,
  taskId: string,
): Promise<TaskRun> {
  return api<TaskRun>(`/workspaces/${slug}/projects/${projectId}/tasks/${taskId}`);
}
