import clsx from "clsx";

/**
 * Avatar — see DESIGN.md §4.5.
 *
 * Round (pill), Cormorant italic initial, paper-2 background, rule border.
 * No avatar upload yet (avatar field is null on User).
 */

type Size = "xs" | "sm" | "md" | "lg";

export interface AvatarProps {
  /** Username to derive the initial; falls back to "?". */
  name?: string | null;
  /** Optional URL — we currently never show <img>, but reserved. */
  src?: string | null;
  size?: Size;
  className?: string;
  /** Override the colour (defaults to ink-2 / paper-2). */
  tone?: "default" | "accent";
}

const sizeClass: Record<Size, { box: string; text: string }> = {
  xs: { box: "w-5 h-5", text: "text-[10px]" },
  sm: { box: "w-6 h-6", text: "text-[11px]" },
  md: { box: "w-9 h-9", text: "text-[14px]" },
  lg: { box: "w-12 h-12", text: "text-[18px]" },
};

function initial(name?: string | null): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  // For CJK names, take the first char (and a second if it's ascii)
  const first = trimmed[0];
  return first ? first.toUpperCase() : "?";
}

export function Avatar({ name, size = "sm", className, tone = "default" }: AvatarProps) {
  const s = sizeClass[size];
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center rounded-full border font-serif italic select-none",
        s.box,
        s.text,
        tone === "accent"
          ? "bg-[color:var(--color-accent-soft)] border-[color:var(--color-accent-2)] text-[color:var(--color-accent)]"
          : "bg-[color:var(--color-paper-2)] border-[color:var(--color-rule)] text-[color:var(--color-ink-2)]",
        className,
      )}
      aria-label={name ?? "user"}
    >
      {initial(name)}
    </span>
  );
}