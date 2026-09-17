"use client";

import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "@/components/icons";
import type { EditableOption } from "./EditableField";

/**
 * MultiSelect — DESIGN §4.2 / §4.4 的「多值下拉」。
 *
 * Same visual grammar as <EditableField>, but the menu stays open and every entry
 * carries a checkable box. Used by the FilterBar for `labels` (04 契约: 逗号分隔多值,
 * 字段内 OR) where a chip row would not scale past a handful of labels.
 *
 * Two deliberate choices:
 * - **The menu does not close on select.** Filtering by several labels is one
 *   intention, not N; re-opening the menu for each one is the single most common
 *   annoyance in multi-select filters. Esc / outside-click / the trigger closes it.
 * - **No "Apply" button.** Every toggle writes the URL immediately, matching the
 *   rest of the bar (SCREEN_BLUEPRINTS §2.7: "filter chip 立即触发（无 Apply 按钮）").
 */

export interface MultiSelectProps {
  label: string;
  /** Currently selected values. Empty array = no constraint. */
  values: string[];
  options: EditableOption[];
  onToggle: (value: string) => void;
  /** Clears every selection (rendered as the first menu entry when non-empty). */
  onClear?: () => void;
  disabled?: boolean;
  /** Rendered on the trigger when nothing is selected. */
  placeholder?: ReactNode;
  className?: string;
}

export function MultiSelect({
  label,
  values,
  options,
  onToggle,
  onClear,
  disabled = false,
  placeholder = "any",
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = new Set(values);

  const renderLeading = (opt: EditableOption) => {
    if (opt.leading) return opt.leading;
    if (opt.color) {
      return (
        <span
          className="inline-block w-2 h-2 flex-shrink-0"
          style={{ background: opt.color }}
          aria-hidden
        />
      );
    }
    return null;
  };

  return (
    <div className={clsx("relative", className)} ref={ref}>
      <div className="text-[9px] uppercase tracking-[0.22em] text-[color:var(--color-ink-3)] font-sans font-medium mb-1.5">
        {label}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${values.length ? values.join(", ") : "any"}`}
        className={clsx(
          "w-full flex items-center gap-2 px-2 py-1.5 border text-left transition-colors",
          "border-[color:var(--color-rule)]",
          disabled
            ? "cursor-default opacity-70"
            : "hover:border-[color:var(--color-ink-2)] cursor-pointer",
          open && "border-[color:var(--color-accent)]",
        )}
      >
        {values.length ? (
          <span className="flex items-center gap-1.5 min-w-0">
            {/* Show at most two swatches, then a count — keeps the trigger a fixed
                width no matter how many labels are selected. */}
            {options
              .filter((o) => selected.has(o.value))
              .slice(0, 2)
              .map((o) => (
                <span key={o.value} className="flex items-center gap-1">
                  {renderLeading(o)}
                </span>
              ))}
            <span className="text-[12px] text-[color:var(--color-ink)] truncate">
              {values.length === 1
                ? (options.find((o) => o.value === values[0])?.label ?? values[0])
                : `${values.length} selected`}
            </span>
          </span>
        ) : (
          <span className="text-[12px] text-[color:var(--color-ink-3)] italic font-serif truncate">
            {placeholder}
          </span>
        )}
        {!disabled && (
          <ChevronDownIcon
            size={12}
            className="ml-auto flex-shrink-0 text-[color:var(--color-ink-3)]"
          />
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 min-w-[180px] max-h-64 overflow-auto border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] py-1"
        >
          {onClear && values.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-[color:var(--color-ink-3)] italic font-serif hover:bg-[color:var(--color-paper-2)]"
            >
              clear selection
            </button>
          )}

          {options.length === 0 && (
            <span className="block px-2.5 py-1.5 text-[11px] italic font-serif text-[color:var(--color-ink-3)]">
              nothing to pick yet
            </span>
          )}

          {options.map((opt) => {
            const on = selected.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => onToggle(opt.value)}
                className={clsx(
                  "w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors",
                  "hover:bg-[color:var(--color-paper-2)]",
                  on ? "text-[color:var(--color-ink)]" : "text-[color:var(--color-ink-2)]",
                )}
              >
                <span
                  className={clsx(
                    "w-3 h-3 flex-shrink-0 border flex items-center justify-center text-[9px] leading-none",
                    on
                      ? "border-[color:var(--color-accent)] text-[color:var(--color-accent)]"
                      : "border-[color:var(--color-rule)] text-transparent",
                  )}
                  aria-hidden
                >
                  &#10003;
                </span>
                {renderLeading(opt)}
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
