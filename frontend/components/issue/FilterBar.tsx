"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Avatar, Chip, EditableField, MultiSelect } from "@/components/ui";
import { SearchIcon, XIcon } from "@/components/icons";
import type { IssueState, ProjectMember } from "@/types/project";
import type { IssueListQuery, IssueOrdering, IssuePriority, Label } from "@/types/issue";
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
 * - `assignee` takes a user id **or the literal `me`**; an id that is not a project
 *   member yields an empty result set rather than an error, so the picker is fed
 *   by project members only (a non-member would silently show "nothing matches")
 * - `labels` is OR / union — that is the frozen semantics (04 契约, Sprint 5)
 * - there is deliberately **no "unassigned" option**: the backend has none yet
 *   (see 04 契约 §明确不做), so the UI must not offer what it cannot honour
 */

const PRIORITY_COLOR: Record<IssuePriority, string> = {
  none: "var(--color-none)",
  urgent: "var(--color-urgent)",
  high: "var(--color-high)",
  medium: "var(--color-medium)",
  low: "var(--color-low)",
};

/** Search debounce, ms. 04 契约/Sprint 5 计划：250ms. */
const SEARCH_DEBOUNCE_MS = 250;

/** The literal the backend accepts for "the current user". */
export const ME = "me";

export interface FilterBarProps {
  query: IssueListQuery;
  states: IssueState[];
  labels: Label[];
  /** Project members — assignee candidates (must be ProjectMembers, per 04 契约). */
  members: ProjectMember[];
  /** Total count for the current query (from the API envelope). */
  total?: number;
  onPatch: (partial: Partial<IssueListQuery>) => void;
  onClear: () => void;
}

export function FilterBar({
  query,
  states,
  labels,
  members,
  total,
  onPatch,
  onClear,
}: FilterBarProps) {
  const urlSearch = query.search ?? "";
  const [searchDraft, setSearchDraft] = useState(urlSearch);
  const [lastUrlSearch, setLastUrlSearch] = useState(urlSearch);

  // Keep the input in sync when the URL changes from outside (Clear button, back
  // button, a pasted link). Adjusting during render — React's documented alternative
  // to a sync effect — costs no extra commit; a `useEffect` would add one render per
  // URL change and cascade. The URL stays the single source of truth; the draft is
  // only ever ahead of it by the debounce window below.
  if (lastUrlSearch !== urlSearch) {
    setLastUrlSearch(urlSearch);
    setSearchDraft(urlSearch);
  }

  // Debounce search → URL, so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const current = urlSearch;
    if (searchDraft === current) return; // guard: prevents the URL→effect→URL loop
    const t = setTimeout(
      () => onPatch({ search: searchDraft || undefined }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(t);
  }, [searchDraft, urlSearch, onPatch]);

  const selectedStates = new Set(query.state ?? []);
  const selectedPriorities = new Set(query.priority ?? []);
  const selectedLabels = query.labels ?? [];
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

  const toggleLabel = (id: string) => {
    const next = new Set(selectedLabels);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onPatch({ labels: next.size ? Array.from(next) : undefined });
  };

  const assigneeOptions = [
    { value: ME, label: "me (assigned to you)", leading: <Avatar name="me" size="xs" tone="accent" /> },
    ...members.map((m) => ({
      value: m.user.id,
      label: m.user.username,
      leading: <Avatar name={m.user.username} size="xs" />,
    })),
  ];

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
            aria-label="搜索任务"
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

      {/* Row 2: priority chips */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
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
      </div>

      {/* Row 3: labels + assignee + ordering + clear */}
      <div className="flex flex-wrap items-end gap-3">
        <MultiSelect
          label="labels"
          className="w-[190px]"
          values={selectedLabels}
          placeholder="any label"
          options={labels.map((l) => ({ value: l.id, label: l.name, color: l.color }))}
          onToggle={toggleLabel}
          onClear={() => onPatch({ labels: undefined })}
        />

        <EditableField
          label="assignee"
          className="w-[190px]"
          value={query.assignee ?? null}
          options={assigneeOptions}
          clearable
          clearLabel="anyone"
          placeholder="anyone"
          onSelect={(v) => onPatch({ assignee: v ?? undefined })}
        />

        <span className="ml-auto flex items-end gap-3">
          <EditableField
            label="sort"
            className="w-[170px]"
            value={query.ordering ?? "-created_at"}
            options={ISSUE_ORDERING_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            onSelect={(v) => onPatch({ ordering: (v ?? "-created_at") as IssueOrdering })}
          />

          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className={clsx(
                "text-[9px] uppercase tracking-[0.2em] font-sans font-medium mb-2",
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
