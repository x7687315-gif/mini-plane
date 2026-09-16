"use client";

import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Button — see DESIGN.md §4.1.
 *
 * Variants: primary | secondary | ghost | accent
 * Sizes: sm | md
 *
 * All buttons are uppercase, 0.16em letter-spacing, Inter.
 * The accent variant is reserved for "filters / chips that look like buttons".
 */

type Variant = "primary" | "secondary" | "ghost" | "accent";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variantClass: Record<Variant, string> = {
  primary:
    "bg-[color:var(--color-ink)] text-[color:var(--color-paper)] border-[color:var(--color-ink)] hover:opacity-90",
  secondary:
    "bg-transparent text-[color:var(--color-ink)] border-[color:var(--color-rule)] hover:border-[color:var(--color-ink-2)]",
  ghost:
    "bg-transparent text-[color:var(--color-ink-2)] border-transparent hover:text-[color:var(--color-ink)]",
  accent:
    "bg-transparent text-[color:var(--color-accent)] border-[color:var(--color-accent)] hover:bg-[color:var(--color-accent-soft)]",
};

const sizeClass: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[10px] tracking-[0.16em]",
  md: "px-4 py-2 text-[11px] tracking-[0.18em]",
};

export function Button({
  variant = "secondary",
  size = "sm",
  className,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled}
      className={clsx(
        "inline-flex items-center justify-center gap-2 border uppercase font-sans font-medium",
        "transition-colors duration-[var(--duration-base)] ease-[var(--ease-out)]",
        "rounded-[var(--radius-md)]",
        variantClass[variant],
        sizeClass[size],
        disabled && "opacity-40 cursor-not-allowed",
        className,
      )}
    >
      {children}
    </button>
  );
}