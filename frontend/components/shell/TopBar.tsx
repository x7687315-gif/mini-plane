"use client";

import Link from "next/link";
import { AvatarMenu } from "./AvatarMenu";
import { Crosshair, MeasureLine } from "@/components/ui";
import { useWsStore, wsStatusLabel, type WsStatus } from "@/stores/ws";

/**
 * TopBar — see SCREEN_BLUEPRINTS §1.1.
 *
 * 56px fixed at the top of every authenticated page.
 *
 * Props:
 * - workspace / project breadcrumb
 * - role badge (ADMIN / MEMBER / VIEWER)
 * - realtime connection status dot (Sprint 7: read straight from the ws store)
 * - avatar menu (click → sign out)
 */

export interface TopBarProps {
  /** Active workspace name (e.g. "Amiya Workspace"). */
  workspace?: string;
  /** Active project name + identifier (e.g. "Amiya Project · AMI"). */
  project?: string;
  /** User's role in the current workspace (20/15/5). */
  role?: number;
}

function roleLabel(r: number): string {
  if (r === 20) return "ADMIN";
  if (r === 15) return "MEMBER";
  if (r === 5) return "VIEWER";
  return `ROLE ${r}`;
}

/**
 * Dot colour per connection state.
 *
 * `reconnecting` is `--color-warning` (amber) rather than red: a transient drop that
 * the backoff is already handling is not an error, and colouring it like one trains
 * people to ignore red.
 */
const DOT_COLOR: Record<WsStatus, string> = {
  live: "var(--color-accent)",
  connecting: "var(--color-ink-3)",
  reconnecting: "var(--color-warning)",
  idle: "var(--color-ink-3)",
  forbidden: "var(--color-urgent)",
  error: "var(--color-urgent)",
};

export function TopBar({ workspace, project, role }: TopBarProps) {
  // Selected as primitives: zustand v5 requires a stable snapshot, and an object
  // selector would allocate a new one on every store read.
  const wsStatus = useWsStore((s) => s.status);
  const wsDetail = useWsStore((s) => s.detail);
  const wsAttempts = useWsStore((s) => s.attempts);

  const statusLabel =
    wsStatus === "reconnecting" && wsAttempts > 1
      ? `reconnecting · ${wsAttempts}`
      : wsStatusLabel(wsStatus);

  return (
    <header className="bp-border-b flex items-center justify-between px-8 h-14 relative z-30 bg-[color:var(--color-paper)]">
      <div className="flex items-baseline gap-4">
        <Link href="/" className="flex items-baseline gap-2 group">
          <span className="font-serif italic text-[28px] font-medium tracking-[-0.01em] text-[color:var(--color-ink)]">
            P<span className="opacity-50">l</span>ane
          </span>
          <span className="font-serif text-[10px] uppercase tracking-[0.34em] text-[color:var(--color-ink-2)] hidden sm:inline">
            mini &middot; sheet 03 / 12
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-5">
        {(workspace || project) && (
          <span className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-ink-3)] font-sans font-medium hidden md:inline">
            {workspace && <>{workspace} &middot; </>}
            {project && <b className="text-[color:var(--color-ink)]">{project}</b>}
          </span>
        )}

        {role != null && (
          <span className="px-2 py-1 border border-[color:var(--color-rule)] text-[9px] uppercase tracking-[0.18em] text-[color:var(--color-ink-2)] font-sans font-medium hidden sm:inline-block">
            {roleLabel(role)}
          </span>
        )}

        {/* Realtime indicator. The reason lives on the wrapper's `aria-label` (and is
            visible for the terminal states) — DESIGN §10 forbids hover tooltips. */}
        <span
          className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] text-[color:var(--color-ink-3)] font-sans font-medium"
          aria-label={
            wsDetail ? `realtime: ${statusLabel} — ${wsDetail}` : `realtime: ${statusLabel}`
          }
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: DOT_COLOR[wsStatus] }}
            aria-hidden
          />
          {statusLabel}
        </span>

        <AvatarMenu />
      </div>
    </header>
  );
}

/** A small horizontal measure-line placeholder (used in AppShell between TopBar and body). */
export function TopMeasure() {
  return (
    <div className="px-8 pt-2">
      <MeasureLine left="FIG · 00" right="BOOT · SHEET 00" />
    </div>
  );
}

/** Decorative corner crosshair used inside TopBar area. */
export function TopCross() {
  return (
    <span className="absolute right-2 top-2">
      <Crosshair size={10} />
    </span>
  );
}