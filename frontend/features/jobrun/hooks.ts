"use client";

import { useQuery } from "@tanstack/react-query";
import type { TaskRun } from "@/types/task";
import { getTaskRun } from "./api";
import { nextTaskPollDelay } from "./polling";
import { projectKeys } from "@/lib/queryKeys";

/**
 * JobRun 查询键——委托 lib/queryKeys 工厂（Phase 4；历史名 taskKeys 保留导出）。
 */
export const taskKeys = {
  all: (_slug: string, pid: string) => projectKeys.detail(pid),
  detail: (_slug: string, pid: string, taskId: string) => projectKeys.jobrun(pid, taskId),
};

/**
 * Poll a TaskRun until it reaches a terminal state.
 *
 * Why polling rather than a WebSocket push: 08 契约 deliberately does not push task
 * progress (only `issue.updated` / `comment.created`), and the job finishes in well
 * under a second in practice — a socket for this would be infrastructure for nothing.
 * 07 契约 §2.1 明确"进度查 GET …/tasks/{task_id}/"。
 *
 * The stop/timeout policy lives in `./polling` so it can be tested without React.
 *
 * One more 08-契约 rule applies here: **the task result must not be the only source of
 * truth.** When it settles the caller invalidates the issue lists — the task is a hint
 * that "something changed", the lists are the truth.
 */
export function useTaskRun(
  slug: string | undefined,
  projectId: string | undefined,
  taskId: string | null | undefined,
) {
  return useQuery({
    queryKey: taskKeys.detail(slug ?? "", projectId ?? "", taskId ?? ""),
    queryFn: () => getTaskRun(slug!, projectId!, taskId!),
    enabled: Boolean(slug && projectId && taskId),
    refetchInterval: (query) =>
      nextTaskPollDelay(
        query.state.data as TaskRun | undefined,
        query.state.dataUpdateCount,
      ),
    // Polling is the freshness mechanism here; the cache must not outlive a stale run.
    staleTime: 0,
    gcTime: 5 * 60_000,
  });
}

export { nextTaskPollDelay, isTaskTimedOut, describeTaskStatus } from "./polling";
