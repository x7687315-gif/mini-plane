/**
 * Activity domain types + 文案映射 — mirrors docs/api/06-activities.md.
 *
 * Activity is an audit trail (who changed what, when). Read-only.
 *
 * Key contract facts the UI depends on:
 * - `old_value` / `new_value` contain **display-ready values, never UUIDs** —
 *   the backend already resolved user ids / state ids into names. So the frontend
 *   only needs to join strings; it must NOT look anything up.
 * - `description` changes are recorded as a character-count summary (`"128 字"`),
 *   not the full text.
 * - `priority` is recorded as the raw enum (`"urgent"`), so the Chinese label is
 *   the frontend's job (see PRIORITY_ZH).
 */

import type { MemberSummary } from "./workspace";

export type ActivityEntityType =
  | "issue"
  | "comment"
  | "project"
  | "state"
  | "label"
  | "workspace"
  | "member";

export type ActivityAction = "created" | "updated" | "deleted";

export interface Activity {
  id: string;
  actor: MemberSummary;
  entity_type: ActivityEntityType;
  entity_id: string;
  /** The Issue this record belongs to; `null` after the Issue is deleted. */
  issue: string | null;
  action: ActivityAction;
  /** Field-level diff — keys are field names, values are display-ready. */
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

/* ---------------- display mappings ---------------- */

/** Field name → Chinese label (06 契约 §文案映射表). */
export const FIELD_LABELS: Record<string, string> = {
  title: "标题",
  description: "描述",
  state: "状态",
  priority: "优先级",
  assignee: "指派人",
  labels: "标签",
  name: "项目名称",
  identifier: "项目标识",
};

/** priority enum → Chinese (the backend stores the raw enum on purpose). */
export const PRIORITY_ZH: Record<string, string> = {
  none: "无",
  urgent: "紧急",
  high: "高",
  medium: "中",
  low: "低",
};

/**
 * Render one diff value.
 * - `null` for `assignee` means "unassigned" → 「未指派」
 * - arrays (labels) join with a middle dot
 * - priority maps through PRIORITY_ZH
 */
function renderValue(field: string, value: unknown): string {
  if (value === null || value === undefined) {
    return field === "assignee" ? "未指派" : "空";
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => String(v));
    return items.length ? items.join("、") : "空";
  }
  if (field === "priority") {
    const key = String(value);
    return PRIORITY_ZH[key] ?? key;
  }
  return String(value);
}

/** One changed field, pre-rendered and ready to drop into a sentence. */
export interface ActivityDiff {
  /** Raw key from the contract's whitelist, e.g. `state`. */
  field: string;
  /** Chinese label, e.g. `状态`. */
  label: string;
  /** Display-ready previous value (`Todo`, `未指派`, `128 字`, …). */
  before: string;
  /** Display-ready next value. */
  after: string;
}

/**
 * Structured field diffs for an activity.
 *
 * Returns `[]` for anything that is not an `updated` action — created/deleted
 * records carry a whole-object snapshot (`new_value` / `old_value`), which the
 * timeline deliberately does NOT expand: the sentence "amiya 创建了任务" is more
 * readable than replaying every initial field. The snapshot stays available in
 * the payload for anyone who needs the forensics.
 */
export function activityDiffs(activity: Activity): ActivityDiff[] {
  if (activity.action !== "updated") return [];

  const oldV = activity.old_value ?? {};
  const newV = activity.new_value ?? {};
  const keys = Array.from(new Set([...Object.keys(oldV), ...Object.keys(newV)]));

  return keys.map((key) => ({
    field: key,
    label: FIELD_LABELS[key] ?? key,
    before: renderValue(key, oldV[key]),
    after: renderValue(key, newV[key]),
  }));
}

/**
 * The verb phrase only — no actor, no diffs.
 *
 * Kept separate from `describeActivity` because the timeline renders the actor in
 * bold and the field names as pills; it must not parse a finished sentence to do
 * that (that way lies regex-on-UI-strings).
 */
export function activityHeadline(activity: Activity): string {
  const { entity_type, action } = activity;

  if (entity_type === "issue") {
    if (action === "created") return "创建了任务";
    if (action === "deleted") return "删除了任务";
    return "更新了任务";
  }

  if (entity_type === "comment") {
    if (action === "created") return "评论了任务";
    if (action === "deleted") return "删除了评论";
    return "更新了评论";
  }

  if (entity_type === "project") {
    if (action === "created") {
      const name = activity.new_value?.name;
      return name ? `创建了项目「${String(name)}」` : "创建了项目";
    }
    if (action === "deleted") return "删除了项目";
    return "更新了项目";
  }

  // state / label / workspace / member — reserved in the enum, not wired in MVP.
  const verb = action === "created" ? "创建" : action === "deleted" ? "删除" : "更新";
  return `${verb}了${entity_type}`;
}

/**
 * The full plain-text sentence, e.g. `amiya 将 状态 从 Todo 改为 Done`.
 *
 * Used as the accessible label / plain-text fallback. Templates come straight
 * from 06 契约 §文案映射表; anything outside the table still produces *a* sentence
 * rather than an empty row — a missing row in the timeline is worse than an
 * imprecise one.
 */
export function describeActivity(activity: Activity): string {
  const actor = activity.actor?.username ?? "某人";
  const diffs = activityDiffs(activity);

  if (!diffs.length) return `${actor} ${activityHeadline(activity)}`;

  const clauses = diffs
    .map((d) => `将 ${d.label} 从 ${d.before} 改为 ${d.after}`)
    .join("，");
  return `${actor} ${clauses}`;
}

/** A stable icon key for the timeline dot — the component maps it to an SVG. */
export function activityKind(activity: Activity): "created" | "updated" | "deleted" | "comment" {
  if (activity.entity_type === "comment") return "comment";
  if (activity.action === "created") return "created";
  if (activity.action === "deleted") return "deleted";
  return "updated";
}
