"use client";

import clsx from "clsx";

/**
 * Footer — see SCREEN_BLUEPRINTS §1.4.
 *
 * 28px fixed at the bottom of every authenticated page.
 * Left: lat/lng coordinate (decorative).
 * Centre: "covenant · between user and system".
 * Right: "REV · 0.1 · DRIFT 0.0".
 */

export interface FooterProps {
  /** Override the build version (default from NEXT_PUBLIC_APP_VERSION). */
  version?: string;
  className?: string;
}

export function Footer({ version = "0.1", className }: FooterProps) {
  return (
    <footer
      className={clsx(
        "bp-border-t flex items-center justify-between px-8 h-7",
        "text-[9px] uppercase tracking-[0.24em] text-[color:var(--color-ink-3)] font-sans font-medium",
        className,
      )}
    >
      <span>N &middot; 31&deg; 14&prime; &middot; W &middot; 121&deg; 28&prime;</span>
      <span>
        <em className="not-italic font-serif italic text-[12px] tracking-[0.04em] text-[color:var(--color-accent)] mr-1.5 normal-case">
          covenant
        </em>
        between user and system
      </span>
      <span>
        REV &middot; {version} &middot; DRIFT 0.0
      </span>
    </footer>
  );
}