import Link from "next/link";

/**
 * 404 page — see SCREEN_BLUEPRINTS.md §2.15.
 *
 * Outside the AppShell on purpose: when a user lands here via a broken URL,
 * they shouldn't see the workspace chrome; this is "outside the archive".
 */
export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-12">
      {/* Top decorative crosshair */}
      <div className="mb-16 flex items-center gap-3">
        <div className="h-px w-16 bg-[color:var(--color-rule)]" />
        <span className="bp-hint">fig &middot; empty</span>
        <div className="h-px w-16 bg-[color:var(--color-rule)]" />
      </div>

      <div className="flex flex-col items-center text-center">
        <h1 className="bp-display text-7xl text-[color:var(--color-ink)]">
          <span className="text-[color:var(--color-ink-3)]">FIG</span>
          <span className="mx-4 text-[color:var(--color-rule)]">&middot;</span>
          <span className="text-[color:var(--color-ink-3)]">&middot;</span>
          <span className="mx-4 text-[color:var(--color-rule)]">&middot;</span>
        </h1>

        <h2 className="bp-title mt-6 text-3xl">Resource not found</h2>

        <p className="mt-4 max-w-md text-[13px] leading-relaxed text-[color:var(--color-ink-2)]">
          The sheet you asked for is not in this archive.
          Either it has been moved, or it never existed.
        </p>

        <Link
          href="/"
          className="mt-10 inline-flex items-center gap-3 border px-6 py-3 text-[11px] uppercase tracking-[0.18em]"
          style={{
            borderColor: "var(--color-ink)",
            background: "var(--color-ink)",
            color: "var(--color-paper)",
            fontFamily: "var(--font-serif), serif",
            fontStyle: "italic",
            fontSize: "13px",
          }}
        >
          back to dashboard
          <span className="text-base opacity-70">&rarr;</span>
        </Link>
      </div>

      {/* Bottom decorative crosshair */}
      <div className="mt-16 flex items-center gap-3">
        <div className="h-px w-16 bg-[color:var(--color-rule)]" />
        <span className="bp-hint">404 &middot; sheet not in archive</span>
        <div className="h-px w-16 bg-[color:var(--color-rule)]" />
      </div>
    </div>
  );
}