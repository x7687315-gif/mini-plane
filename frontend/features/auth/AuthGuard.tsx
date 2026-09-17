"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useMe } from "./hooks";

/**
 * AuthGuard — wraps every authenticated page.
 *
 * Behaviour (see FRONTEND_ROADMAP.md §2 Sprint 1):
 * - While `/me` is in flight (or not yet called): show a blueprint skeleton.
 * - On 401: redirect to `/login?redirect=<current path>` (preserving query string).
 * - On success: render children.
 *
 * Note: we deliberately do NOT use middleware for this. Next.js middleware runs on
 * the Edge and cannot read the backend session cookie cross-origin, so the check
 * has to happen client-side after `/me` resolves.
 */

export interface AuthGuardProps {
  children: ReactNode;
  /** Optional custom fallback while the auth check is in flight. */
  fallback?: ReactNode;
}

function AuthSkeleton() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="h-px w-10 bg-[color:var(--color-rule)]" />
          <span className="bp-hint">identifying</span>
          <div className="h-px w-10 bg-[color:var(--color-rule)]" />
        </div>
        <div className="h-1 w-24 bg-[color:var(--color-paper-2)]" />
      </div>
    </div>
  );
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data, isLoading, isError } = useMe();

  // useMe() resolves 401 to `null` (a valid "anonymous" state, not an error),
  // so a `null` result after loading is the authoritative "not signed in" signal.
  const isAnonymous = !isLoading && data === null;

  useEffect(() => {
    if (!isAnonymous) return;
    const redirect = encodeURIComponent(pathname || "/");
    router.replace(`/login?redirect=${redirect}`);
  }, [isAnonymous, pathname, router]);

  if (isLoading || isAnonymous) {
    return <>{fallback ?? <AuthSkeleton />}</>;
  }

  if (isError) {
    // Non-401 error (network / 500): don't redirect, show a minimal error surface.
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="bp-hint">connection · failed</span>
          <p className="text-[13px] text-[color:var(--color-ink-2)] max-w-sm">
            无法连接到后端服务。请确认后端已启动（<code className="font-mono">python manage.py runserver</code>）。
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}