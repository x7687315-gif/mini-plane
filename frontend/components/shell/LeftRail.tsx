"use client";

import clsx from "clsx";
import Link from "next/link";
import { Crosshair } from "@/components/ui";

/**
 * LeftRail — see SCREEN_BLUEPRINTS §1.2.
 *
 * 96px wide vertical strip on the left of every authenticated page.
 * - Workspace switcher (compact letter monogram + role chip)
 * - Rail crosshair at the bottom-left corner
 *
 * Sprint 0 ships with a static list (Amiya / Kal'tsit / Rhodes) for layout
 * verification. Sprint 2 wires this to real /api/v1/workspaces/ data.
 */

export interface RailWorkspace {
  slug: string;
  initial: string;
  name: string;
  role?: number; // 20 / 15 / 5
}

export interface LeftRailProps {
  workspaces?: RailWorkspace[];
  current?: string; // slug
  onSwitch?: (slug: string) => void;
}

function roleLabel(r: number | undefined): string {
  if (r == null) return "";
  if (r === 20) return "管理员";
  if (r === 15) return "成员";
  if (r === 5) return "只读";
  return "";
}

const RAIL_WORKSPACES: RailWorkspace[] = [
  { slug: "amiya", initial: "A", name: "Amiya", role: 20 },
  { slug: "kaltsit", initial: "K", name: "Kal'tsit", role: 15 },
  { slug: "rhodes", initial: "R", name: "Rhodes", role: 5 },
];

export function LeftRail({ workspaces = RAIL_WORKSPACES, current = "amiya" }: LeftRailProps) {
  return (
    <aside className="bp-border-r relative w-32 py-5 px-3 flex flex-col flex-shrink-0 bg-[color:var(--color-paper)]">
      <div className="text-[9px] uppercase tracking-[0.26em] text-[color:var(--color-ink-3)] font-sans font-medium mb-3.5 px-1.5">
        工作区
      </div>
      <nav className="flex flex-col gap-1">
        {workspaces.map((w) => {
          const on = w.slug === current;
          return (
            <Link
              key={w.slug}
              href={`/w/${w.slug}`}
              className={clsx(
                "flex items-center gap-2 px-1.5 py-1.5 relative bp-transition",
                on
                  ? "bg-[color:var(--color-accent-soft)]"
                  : "hover:bg-[color:var(--color-paper-2)]",
              )}
            >
              {on && (
                <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-[color:var(--color-accent)]" />
              )}
              <span
                className="w-5 h-5 inline-flex items-center justify-center border border-[color:var(--color-rule)] font-serif italic text-[12px] text-[color:var(--color-ink-2)] flex-shrink-0"
                aria-hidden
              >
                {w.initial}
              </span>
              <span className="leading-tight overflow-hidden min-w-0">
                <span className="block text-[10px] tracking-[0.1em] uppercase text-[color:var(--color-ink)] font-sans font-medium truncate whitespace-nowrap">
                  {w.name}
                </span>
                {w.role != null && (
                  <span className="block text-[8px] tracking-[0.16em] text-[color:var(--color-ink-3)] font-sans font-medium whitespace-nowrap">
                    {roleLabel(w.role)}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-4">
        <Crosshair size={18} label="00° N · 00° E" />
      </div>
    </aside>
  );
}