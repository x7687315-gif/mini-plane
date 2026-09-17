"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Chip, EditableField } from "@/components/ui";
import { SearchIcon, XIcon } from "@/components/icons";
import type { IssueState } from "@/types/project";
import type { IssueListQuery, IssueOrdering, IssuePriority } from "@/types/issue";
import { ISSUE_ORDERING_OPTIONS, PRIORITY_VALUES } from "@/types/issue";
import { countActiveFilters } from "@/lib/url";

/**
 * FilterBar — see SCREEN_BLUEPRINTS §2.7.
 *
 * All filter changes go straight into the URL (via useIssueFilters), so this
 * component is stateless apart from the debounced search input.
 *
 * Backend semantics (docs/api/04-issues.md):
 * - multi-value params are OR within the field, AND across fields
 * - `priority` outside the enum → 400, so we only ever send known values
 */

const PRIORITY_COLOR: Record<IssuePriority, string> = {
  none: "var(--color-none)",
  urgent: "var(--color-urgent)",
  high: "var(--color-high)",
  medium: "var(--color-medium)",
  low: "var(--color-low)",
};

export interface FilterBarProps {
  query: IssueListQuery;
  states: IssueState[];
  /** Total count for the current query (from the API envelope). */
  total?: number;
  onPatch: (partial: Partial<IssueListQuery>) => void;
  onClear: () => void;
}

export function FilterBar({ query, states, total, onPatch, onClear }: FilterBarProps) {
  const [searchDraft, setSearchDraft] = useState(query.search ?? "");

  // Keep the input in sync when the URL changes from outside (e.g. Clear).
  useEffect(() => {
    setSearchDraft(query.search ?? "");
  }, [query.search]);

  // Debounce search → URL (300ms), so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const current = query.search ?? "";
    if (searchDraft === current) return;
    const t = setTimeout(() => onPatch({ search: searchDraft || undefined }), 300);
    return () => clearTimeout(t);
  }, [searchDraft, query.search, onPatch]);

  const selectedStates = new Set(query.state ?? []);
  const selectedPriorities = new Set(query.priority ?? []);
  const activeCount = countActiveFilters(query);

  const toggleState = (id: string) => {
    const next = new Set(selectedStates);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onPatch({ state: next.size ? Array.from(next) : undefined });
  };

  const togglePriority = (p: IssuePriority) => {
    const next = new Set(selectedPriorities);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    onPatch({ priority: next.size ? Array.from(next) : undefined });
  };

  return (
    <div className="mb-5">
      {/* Row 1: state chips + search */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Chip
          variant={selectedStates.size === 0 ? "active" : "default"}
          onClick={() => onPatch({ state: undefined })}
        >
          All{typeof total === "number" ? ` · ${total}` : ""}
        </Chip>

        {states.map((s) => (
          <Chip
            key={s.id}
            variant={selectedStates.has(s.id) ? "accent" : "default"}
            onClick={() => toggleState(s.id)}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: s.color }}
              aria-hidden
            />
            {s.name}
          </Chip>
        ))}

        <span className="flex-1 min-w-[180px] flex items-center gap-2 px-2.5 py-1.5 border border-[color:var(--color-rule)]">
          <SearchIcon size={12} className="text-[color:var(--color-ink-3)]" />
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="search title / description"
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[11px] text-[color:var(--color-ink)] placeholder:italic placeholder:text-[color:var(--color-ink-3)]"
          />
          {searchDraft && (
            <button
              type="button"
              onClick={() => setSearchDraft("")}
              className="text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
              aria-label="clear search"
            >
              <XIcon size={11} />
            </button>
          )}
        </span>
      </div>

      {/* Row 2: priority chips + ordering + clear */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[9px] uppercase tracking-[0.24em] text-[color:var(--color-ink-3)] font-sans font-medium mr-1">
          priority
        </span>
        {PRIORITY_VALUES.map((p) => (
          <Chip
            key={p}
            variant={selectedPriorities.has(p) ? "accent" : "default"}
            onClick={() => togglePriority(p)}
          >
            <span
              className="inline-block w-1.5 h-1.5 rotate-45"
              style={{
                background: p === "none" ? "transparent" : PRIORITY_COLOR[p],
                border: p === "none" ? `0.5px solid ${PRIORITY_COLOR[p]}` : "none",
              }}
              aria-hidden
            />
            {p}
          </Chip>
        ))}

        <span className="ml-auto flex items-center gap-3">
          <span className="w-[150px]">
            <EditableField
              label=""
              value={query.ordering ?? "-created_at"}
              options={ISSUE_ORDERING_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              onSelect={(v) => onPatch({ ordering: (v ?? "-created_at") as IssueOrdering })}
            />
          </span>

          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className={clsx(
                "text-[9px] uppercase tracking-[0.2em] font-sans font-medium",
                "text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]",
                "border-b border-dashed border-[color:var(--color-rule)]",
              )}
            >
              clear · {activeCount}
            </button>
          )}
        </span>
      </div>
    </div>
  );
}