/**
 * Anatomy V2 记录浏览（Phase 4）。
 *
 * Worklog 与 Activity 的语义不同，**不合并成一条时间线**：
 * - Worklog：人工记录，date 是业务归属日，可补记；
 * - Activity：系统审计，created_at 是写入时间，字段范围有限，不是完整历史。
 *
 * 这里只做只读映射；不根据记录重建旧结构，也不推断缺失字段。
 */

import { activityHeadline, describeActivity, type Activity } from "@/types/activity";
import type { Worklog } from "@/types/project";

export type WorklogSourceLabel = "人工" | "AGENT" | "导入";

export interface AnatomyWorklogRecord {
  kind: "worklog";
  id: string;
  /** 业务归属日 YYYY-MM-DD；允许补记，不是精确时刻。 */
  date: string;
  title: string;
  summary: string;
  stageName: string | null;
  source: WorklogSourceLabel;
}

export interface AnatomyActivityRecord {
  kind: "activity";
  id: string;
  /** 系统写入时间（created_at）的 UTC ISO；同时间戳不保证先后。 */
  recordedAt: string;
  actor: string;
  actionLabel: string;
  text: string;
  entityType: string;
}

export interface AnatomyHistory {
  worklogs: AnatomyWorklogRecord[];
  activities: AnatomyActivityRecord[];
  worklogTotal: number;
  activityTotal: number;
}

function sourceLabel(source: Worklog["source"]): WorklogSourceLabel {
  if (source === "agent") return "AGENT";
  if (source === "imported") return "导入";
  return "人工";
}

/**
 * 保持各自的服务端顺序：Worklog 按 date desc；Activity 按 created_at desc。
 * 不做跨源排序，也不对同时间戳做“先后”声明。
 */
export function selectAnatomyHistory(
  worklogs: readonly Worklog[],
  activities: readonly Activity[],
  limit = 8,
): AnatomyHistory {
  const logs = worklogs.slice(0, limit).map<AnatomyWorklogRecord>((log) => ({
    kind: "worklog",
    id: log.id,
    date: log.date,
    title: log.title,
    summary: log.summary,
    stageName: log.stage_name,
    source: sourceLabel(log.source),
  }));
  const audit = activities.slice(0, limit).map<AnatomyActivityRecord>((activity) => ({
    kind: "activity",
    id: activity.id,
    recordedAt: activity.created_at,
    actor: activity.actor?.username ?? "?",
    actionLabel: activityHeadline(activity),
    text: describeActivity(activity),
    entityType: activity.entity_type,
  }));
  return {
    worklogs: logs,
    activities: audit,
    worklogTotal: worklogs.length,
    activityTotal: activities.length,
  };
}

/** Activity 的时间只用 ISO 的日期+分钟，明确标注 UTC。 */
export function utcMinute(iso: string): string {
  if (iso.length < 16) return iso;
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}
