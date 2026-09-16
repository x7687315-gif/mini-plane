"use client";

import type { ReactNode } from "react";
import clsx from "clsx";

/**
 * Aside — see SCREEN_BLUEPRINTS §1.3.
 *
 * 240px right column for KPI / ledger / decorative axis.
 * Hidden < lg breakpoint (set CSS class accordingly).
 *
 * Sprint 0 ships with the layout shell; Sprint 2 fills in real data
 * (throughput / cycle time / ledger / state breakdown).
 */

export interface AsideProps {
  children?: ReactNode;
  /** Optional KPI block (e.g. "Throughput · 7d / 29 closed"). */
  kpi?: ReactNode;
  /** Optional axis decoration at the top. */
  showAxis?: boolean;
  className?: string;
}

export function Aside({ kpi, children, showAxis = true, className }: AsideProps) {
  return (
    <aside
      className={clsx(
        "bp-border-l w-60 py-6 px-5 relative hidden lg:flex flex-col gap-5",
        "bg-[rgba(255,255,255,0.35)]",
        className,
      )}
    >
      {showAxis && (
        <div className="absolute left-5 right-5 top-6 h-32 pointer-events-none">
          <span className="absolute left-0 top-0 bottom-0 w-px bg-[color:var(--color-accent)] opacity-50" />
          <span className="absolute top-1/2 left-0 right-0 h-px bg-[color:var(--color-accent)] opacity-50" />
          <span className="absolute -left-1 -top-3 font-serif italic text-[9px] text-[color:var(--color-ink-3)]">
            0,0
          </span>
          <span className="absolute -right-1 -top-3 font-serif italic text-[9px] text-[color:var(--color-ink-3)]">
            128,1
          </span>
          <span className="absolute -left-3 -bottom-2 font-serif italic text-[9px] text-[color:var(--color-ink-3)]">
            &darr; time
          </span>
          <span className="absolute -right-3 top-1/2 font-serif italic text-[9px] text-[color:var(--color-ink-3)]">
            priority &rarr;
          </span>
        </div>
      )}

      {kpi && <div className="mt-36">{kpi}</div>}
      {children}
    </aside>
  );
}

/** Default KPI block — throughut & cycle time, see SCREEN_BLUEPRINTS §2.7. */
export function DefaultKpi() {
  return (
    <>
      <div>
        <div className="text-[9px] uppercase tracking-[0.26em] text-[color:var(--color-ink-3)] font-sans font-medium mb-1">
          Throughput &middot; 7d
        </div>
        <div className="font-serif text-[32px] leading-none text-[color:var(--color-ink)]">
          29 <small className="text-[12px] text-[color:var(--color-ink-3)] italic ml-1">closed</small>
        </div>
      </div>
      <div>
        <div className="text-[9px] uppercase tracking-[0.26em] text-[color:var(--color-ink-3)] font-sans font-medium mb-1">
          Cycle time
        </div>
        <div className="font-serif text-[32px] leading-none text-[color:var(--color-ink)]">
          3.2 <small className="text-[12px] text-[color:var(--color-ink-3)] italic ml-1">days</small>
        </div>
      </div>
    </>
  );
}