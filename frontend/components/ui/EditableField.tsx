"use client";

import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "@/components/icons";

/**
 * EditableField — a click-to-edit dropdown used by the Issue drawer.
 *
 * See SCREEN_BLUEPRINTS §2.9 ("状态 / 优先级 / 指派人 就地编辑").
 *
 * Behaviour:
 * - Renders `children` as the read-only value.
 * - On click, opens a small menu anchored below.
 * - Selecting an option calls `onSelect(value)` then closes.
 * - When `disabled` (Viewer role), it renders as plain text with no affordance.
 *
 * Why not a native <select>: the design language needs a colour dot per option
 * and Cormorant-italic labels, neither of which a native select can render.
 */

export interface EditableOption {
  value: string;
  label: string;
  /** Optional colour swatch (state colour / priority colour / avatar tint). */
  color?: string;
  /** Optional leading node (e.g. an Avatar) — takes precedence over `color`. */
  leading?: ReactNode;
}

export interface EditableFieldProps {
  label: string;
  /** The currently selected option's value, or null when unset. */
  value: string | null;
  options: EditableOption[];
  onSelect: (value: string | null) => void;
  /** Allow clearing (adds an explicit "None" entry). */
  clearable?: boolean;
  clearLabel?: string;
  disabled?: boolean;
  /** Rendered in place of the value when nothing is selected. */
  placeholder?: ReactNode;
  className?: string;
}

export function EditableField({
  label,
  value,
  options,
  onSelect,
  clearable = false,
  clearLabel = "None",
  disabled = false,
  placeholder = "—",
  className,
}: EditableFieldProps) {
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

  const current = options.find((o) => o.value === value);

  const renderLeading = (opt: EditableOption) => {
    if (opt.leading) return opt.leading;
    if (opt.color) {
      return (
        <span
          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
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
        className={clsx(
          "w-full flex items-center gap-2 px-2 py-1.5 border text-left transition-colors",
          "border-[color:var(--color-rule)]",
          disabled
            ? "cursor-default opacity-70"
            : "hover:border-[color:var(--color-ink-2)] cursor-pointer",
          open && "border-[color:var(--color-accent)]",
        )}
      >
        {current ? (
          <>
            {renderLeading(current)}
            <span className="text-[12px] text-[color:var(--color-ink)] truncate">
              {current.label}
            </span>
          </>
        ) : (
          <span className="text-[12px] text-[color:var(--color-ink-3)] italic font-serif">
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
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-64 overflow-auto border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] py-1"
        >
          {clearable && (
            <button
              type="button"
              role="option"
              aria-selected={value === null}
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-[color:var(--color-ink-3)] italic font-serif hover:bg-[color:var(--color-paper-2)]"
            >
              {clearLabel}
            </button>
          )}

          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              onClick={() => {
                onSelect(opt.value);
                setOpen(false);
              }}
              className={clsx(
                "w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors",
                "hover:bg-[color:var(--color-paper-2)]",
                opt.value === value
                  ? "text-[color:var(--color-ink)] bg-[rgba(31,63,168,0.05)]"
                  : "text-[color:var(--color-ink-2)]",
              )}
            >
              {renderLeading(opt)}
              <span className="truncate">{opt.label}</span>
              {opt.value === value && (
                <span className="ml-auto text-[color:var(--color-accent)] text-[11px]">&#10003;</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}