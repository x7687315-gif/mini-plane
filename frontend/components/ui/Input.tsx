import clsx from "clsx";
import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

/**
 * Input — see DESIGN.md §4.4.
 *
 * 0.5px border, no border-radius (or 2px), placeholder is italic & ink-3.
 * On focus, border turns accent.
 *
 * There are TWO shapes:
 * - Input: single-line (also used as a search box wrapper)
 * - Textarea: multi-line (description / comment)
 */

const baseField =
  "w-full bg-transparent border border-[color:var(--color-rule)] " +
  "px-2.5 py-1.5 text-[13px] text-[color:var(--color-ink)] font-sans " +
  "outline-none transition-colors duration-[var(--duration-fast)] " +
  "focus:border-[color:var(--color-accent)] " +
  "disabled:opacity-40 disabled:cursor-not-allowed " +
  "placeholder:italic placeholder:text-[color:var(--color-ink-3)]";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      {...rest}
      className={clsx(
        baseField,
        "rounded-[var(--radius-sm)]",
        error && "border-[color:var(--color-urgent)] focus:border-[color:var(--color-urgent)]",
        className,
      )}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, error, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      {...rest}
      className={clsx(
        baseField,
        "min-h-[88px] resize-y leading-relaxed rounded-[var(--radius-sm)]",
        error && "border-[color:var(--color-urgent)] focus:border-[color:var(--color-urgent)]",
        className,
      )}
    />
  );
});

/** Wraps an input with a label, hint, and error message — use this in forms. */
export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, htmlFor, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5 mb-4">
      {label != null && (
        <label
          htmlFor={htmlFor}
          className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-ink-3)] font-medium font-sans"
        >
          {label}
        </label>
      )}
      {children}
      {hint != null && !error && (
        <p className="text-[10px] text-[color:var(--color-ink-3)] italic font-serif">
          {hint}
        </p>
      )}
      {error != null && (
        <p className="text-[11px] text-[color:var(--color-urgent)]">{error}</p>
      )}
    </div>
  );
}