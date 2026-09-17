/**
 * Time formatting helpers.
 *
 * Kept in one place so the whole UI speaks the same tense/format
 * (the design language cares about editorial consistency).
 */

import {
  formatDistanceToNow as dfFormatDistanceToNow,
  format,
  isToday,
  isSameYear,
} from "date-fns";

/** "2 minutes", "3 days" — no suffix (callers add "ago" when they want it). */
export function formatDistanceToNow(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return dfFormatDistanceToNow(d, { addSuffix: false });
}

/** "2026-09-17 14:03" — used in the drawer's activity feed. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "yyyy-MM-dd HH:mm");
}

/** "14:03" — compact form for activity rows. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "HH:mm");
}

/** "17 Sep 2026" — for detail panes. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "dd MMM yyyy");
}

/**
 * Timeline stamp — the narrow left-hand column of the activity feed.
 *
 * "14:03" for today, "17 Sep" for this year, "17 Sep 2025" further back.
 * A bare HH:mm on a week-old record is actively misleading; a full timestamp on
 * every row is noise. The breakpoints mirror how a paper logbook is annotated.
 */
export function formatStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (isToday(d)) return format(d, "HH:mm");
  if (isSameYear(d, new Date())) return format(d, "dd MMM");
  return format(d, "dd MMM yyyy");
}
