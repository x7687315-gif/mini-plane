import clsx from "clsx";

/**
 * Crosshair — see DESIGN.md §4.10.
 *
 * 18×18 square outline + horizontal + vertical accent hairline (0.5px).
 * Used as a decorative anchor in corners of the rail / main / aside / footer.
 */

export interface CrosshairProps {
  size?: number;
  /** Optional uppercase label rendered below or to the right of the cross. */
  label?: string;
  position?: "tl" | "tr" | "bl" | "br";
  className?: string;
}

export function Crosshair({ size = 18, label, className }: CrosshairProps) {
  return (
    <span
      className={clsx("inline-flex flex-col items-center gap-1", className)}
      aria-hidden
    >
      <span
        className="relative inline-block border border-[color:var(--color-accent)] opacity-60"
        style={{ width: size, height: size }}
      >
        <span
          className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 bg-[color:var(--color-accent)] opacity-60"
          style={{ width: "0.5px" }}
        />
        <span
          className="absolute top-1/2 left-0 right-0 -translate-y-1/2 bg-[color:var(--color-accent)] opacity-60"
          style={{ height: "0.5px" }}
        />
      </span>
      {label && (
        <span className="font-serif italic text-[9px] text-[color:var(--color-ink-3)] tracking-[0.04em]">
          {label}
        </span>
      )}
    </span>
  );
}