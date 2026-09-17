"use client";

import Link from "next/link";
import type { InputHTMLAttributes, ReactNode } from "react";
import { Crosshair } from "@/components/ui";

/**
 * AuthCard — shared shell for /login and /register.
 *
 * See SCREEN_BLUEPRINTS §2.1 and §2.2.
 *
 * Layout:
 * - Centered card, 480px, translucent paper background
 * - Big Cormorant italic "Plane" wordmark
 * - Decorative crosshairs in the four corners + coordinate readouts
 * - Bottom "covenant · REV" footnote
 */

export interface AuthCardProps {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
  /** Alternate action (register ↔ login link). */
  alt?: ReactNode;
  /** Sheet number for the top-left coordinate readout. */
  sheet?: string;
}

export function AuthCard({ title, subtitle, children, alt, sheet = "01" }: AuthCardProps) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10 relative">
      {/* corner crosshairs */}
      <div className="absolute top-12 left-12 hidden md:block">
        <Crosshair size={22} />
      </div>
      <div className="absolute top-12 right-12 hidden md:block">
        <Crosshair size={22} />
      </div>
      <div className="absolute bottom-12 left-12 hidden md:block">
        <Crosshair size={22} />
      </div>
      <div className="absolute bottom-12 right-12 hidden md:block">
        <Crosshair size={22} />
      </div>

      {/* coordinate readouts */}
      <span className="absolute top-[5.25rem] left-[5.25rem] hidden md:block font-serif italic text-[11px] text-[color:var(--color-ink-3)] tracking-[0.04em] opacity-70">
        N &middot; 31&deg; 14&prime;
      </span>
      <span className="absolute top-[5.25rem] right-[5.25rem] hidden md:block font-serif italic text-[11px] text-[color:var(--color-ink-3)] tracking-[0.04em] opacity-70">
        sheet {sheet} / 12
      </span>
      <span className="absolute bottom-[5.25rem] left-[5.25rem] hidden md:block font-serif italic text-[11px] text-[color:var(--color-ink-3)] tracking-[0.04em] opacity-70">
        fig &middot; identify
      </span>
      <span className="absolute bottom-[5.25rem] right-[5.25rem] hidden md:block font-serif italic text-[11px] text-[color:var(--color-ink-3)] tracking-[0.04em] opacity-70">
        W &middot; 121&deg; 28&prime;
      </span>

      <div className="relative w-full max-w-[480px] border border-[color:var(--color-rule)] bg-[rgba(255,255,255,0.55)] px-14 py-12">
        <div className="font-serif italic text-[76px] leading-none font-medium tracking-[-0.02em] text-[color:var(--color-ink)]">
          P<span className="opacity-45 text-[58px]">l</span>ane
        </div>
        <div className="font-serif italic text-[13px] tracking-[0.18em] text-[color:var(--color-ink-3)] mb-9 mt-1.5">
          mini &middot; identify yourself
        </div>

        <h1 className="font-serif text-[30px] font-medium leading-tight text-[color:var(--color-ink)]">
          {title}
        </h1>
        <p className="text-[12px] text-[color:var(--color-ink-2)] mt-1.5 mb-7 tracking-[0.02em]">
          {subtitle}
        </p>

        <div className="h-px bg-[color:var(--color-rule)] mb-6" />

        {children}

        {alt && (
          <div className="mt-6 text-center text-[12px] text-[color:var(--color-ink-2)]">{alt}</div>
        )}

        <div className="mt-9 pt-4 border-t border-dashed border-[color:var(--color-rule)] flex items-center justify-between">
          <span className="text-[9px] uppercase tracking-[0.24em] text-[color:var(--color-ink-3)] font-sans font-medium">
            <em className="not-italic font-serif italic text-[11px] tracking-[0.04em] text-[color:var(--color-accent)] normal-case mr-1.5">
              covenant
            </em>
          </span>
          <span className="text-[9px] uppercase tracking-[0.24em] text-[color:var(--color-ink-3)] font-sans font-medium">
            REV &middot; 0.1
          </span>
        </div>
      </div>
    </div>
  );
}

/** Uppercase field label used inside auth forms. */
export function AuthFieldLabel({
  children,
  hint,
  htmlFor,
}: {
  children: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[9px] uppercase tracking-[0.26em] text-[color:var(--color-ink-3)] font-sans font-medium mb-2"
    >
      {children}
      {hint && (
        <em className="not-italic font-serif italic text-[10px] tracking-[0.04em] text-[color:var(--color-accent)] normal-case ml-1.5">
          {hint}
        </em>
      )}
    </label>
  );
}

/** Underlined input, matching the auth card aesthetic (not the boxed Input component). */
export function AuthInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full bg-transparent border-0 border-b border-[color:var(--color-rule)] " +
        "py-2 text-[14px] text-[color:var(--color-ink)] font-sans outline-none " +
        "transition-colors duration-[var(--duration-fast)] " +
        "focus:border-[color:var(--color-accent)] " +
        "placeholder:italic placeholder:text-[color:var(--color-ink-3)] " +
        (props.className ?? "")
      }
    />
  );
}

/** Primary submit button for auth forms — full-width ink bar with a trailing arrow. */
export function AuthSubmit({
  children,
  disabled,
  pending,
}: {
  children: ReactNode;
  disabled?: boolean;
  pending?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={
        "mt-2 w-full bg-[color:var(--color-ink)] text-[color:var(--color-paper)] " +
        "px-4 py-3.5 flex items-center justify-between " +
        "font-serif italic text-[15px] tracking-[0.04em] " +
        "transition-opacity duration-[var(--duration-base)] " +
        (disabled ? "opacity-40 cursor-not-allowed" : "hover:opacity-90")
      }
    >
      <span>{pending ? "signing…" : children}</span>
      <span className="text-[18px] opacity-70" aria-hidden>
        &#8599;
      </span>
    </button>
  );
}

/** Inline error surface for form-level failures (400 detail / 429 / 500). */
export function AuthFormError({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 border border-[color:var(--color-urgent)] bg-[color:var(--color-paper)] px-3 py-2">
      <p className="text-[11px] text-[color:var(--color-urgent)] leading-relaxed">{children}</p>
    </div>
  );
}

/** Inline error under a field. */
export function AuthFieldError({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-[11px] text-[color:var(--color-urgent)]">{children}</p>;
}

/** The "No account? Register →" alternate action link. */
export function AuthAltLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="font-serif italic text-[color:var(--color-accent)] border-b border-[color:var(--color-accent)] hover:opacity-80"
    >
      {children}
    </Link>
  );
}