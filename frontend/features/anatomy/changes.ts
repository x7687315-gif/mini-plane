/**
 * Anatomy V2 演进痕迹（Phase 3）。
 *
 * 只把真实 ActivityLog 中可解释的 Task 事件映射成“最近变化”；
 * 冷启动前的历史不播放新增动画；Activity 不是完整历史快照。
 */

import type { Activity } from "@/types/activity";
import type { Issue } from "@/types/issue";

export type AnatomyChangeKind = "created" | "updated";

export interface AnatomyChange {
  id: string;
  kind: AnatomyChangeKind;
  taskId: string;
  sequenceId: number;
  title: string;
  /** 系统写入时间（Activity.created_at，UTC ISO）；不冒充 Worklog 的业务日期。 */
  recordedAt: string;
  source: "activity";
  summary: string;
}

function activityState(activity: Activity): string | null {
  const value = activity.new_value?.state;
  return typeof value === "string" && value ? value : null;
}

/**
 * @param activities 项目级 Activity（倒序）
 * @param sinceMs   页面挂载时刻；早于它的事件只作为历史，不标“新增”
 * @param tasks     当前真实 Task（用于过滤已删除/不可见实体）
 */
export function deriveAnatomyChanges(
  activities: readonly Activity[],
  sinceMs: number,
  tasks: readonly Issue[],
): AnatomyChange[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const seen = new Set<string>();
  const changes: AnatomyChange[] = [];

  for (const activity of activities) {
    if (activity.entity_type !== "issue") continue;
    if (activity.action !== "created" && activity.action !== "updated") continue;
    if (seen.has(activity.id)) continue;
    const at = Date.parse(activity.created_at);
    if (!Number.isFinite(at) || at <= sinceMs) continue;
    const task = byId.get(activity.entity_id);
    if (!task) continue;
    seen.add(activity.id);
    const state = activityState(activity);
    changes.push({
      id: activity.id,
      kind: activity.action === "created" ? "created" : "updated",
      taskId: task.id,
      sequenceId: task.sequence_id,
      title: task.title,
      recordedAt: activity.created_at,
      source: "activity",
      summary:
        activity.action === "created"
          ? "新增任务"
          : state
            ? `状态 → ${state}`
            : "任务更新",
    });
  }

  return changes.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, 5);
}

export function changeMarkerMap(changes: readonly AnatomyChange[]): Map<string, AnatomyChangeKind> {
  const map = new Map<string, AnatomyChangeKind>();
  for (const change of changes) {
    // 同一任务多条事件时，created 优先表达“它是新的”。
    const current = map.get(change.taskId);
    map.set(change.taskId, current === "created" ? "created" : change.kind);
  }
  return map;
}
