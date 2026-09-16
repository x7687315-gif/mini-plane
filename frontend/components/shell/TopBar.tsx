"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui";
import { Crosshair, MeasureLine } from "@/components/ui";

/**
 * TopBar — see SCREEN_BLUEPRINTS §1.1.
 *
 * 56px fixed at the top of every authenticated page.
 *
 * Props (Sprint 0: minimal; Sprint 2 will expand):
 * - workspace / project breadcrumb
 * - role badge (ADMIN / MEMBER / VIEWER)
 * - realtime connection status dot
 * - avatar menu (click → sign out)
 */

export interface TopBarProps {
  /** Active workspace name (e.g. "Amiya Workspace"). */
  workspace?: string;
  /** Active project name + identifier (e.g. "Amiya Project · AMI"). */
  project?: string;
  /** User's role in the current workspace (20/15/5). */
  role?: number;
  /** Current username; used for avatar initial. */
  username?: string;
  /** WebSocket connection state. */
  connection?: "idle" | "live" | "error";
}

function roleLabel(r: number): string {
  if (r === 20) return "ADMIN";
  if (r === 15) return "MEMBER";
  if (r === 5) return "VIEWER";
  return `ROLE ${r}`;
}

export function TopBar({
  workspace,
  project,
  role,
  username = "Amiya",
  connection = "live",
}: TopBarProps) {
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

        <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] text-[color:var(--color-ink-3)] font-sans font-medium">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{
              background:
                connection === "live"
                  ? "var(--color-accent)"
                  : connection === "error"
                  ? "var(--color-urgent)"
                  : "var(--color-ink-3)",
            }}
            aria-hidden
          />
          {connection === "live" ? "live" : connection === "error" ? "reconnecting" : "idle"}
        </span>

        <button
          type="button"
          className="flex items-center gap-2 hover:opacity-80"
          aria-label={`${username} menu`}
        >
          <Avatar name={username} size="sm" tone="accent" />
          <span className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-ink-2)] font-sans font-medium hidden sm:inline">
            {username}
          </span>
        </button>
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