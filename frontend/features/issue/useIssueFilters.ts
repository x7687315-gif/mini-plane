"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { parseIssueQuery } from "@/lib/url";
import type { IssueListQuery } from "@/types/issue";
import { serializeIssueQuery } from "@/types/issue";

/**
 * Issue filter state, backed by the URL query string.
 *
 * Design (SCREEN_BLUEPRINTS §2.7):
 * - The URL is the SINGLE source of truth — no duplicated Zustand state to drift.
 * - `router.replace` (not `push`) so filter tweaking doesn't flood browser history;
 *   the back button returns to wherever you came from, not to the previous filter.
 * - `scroll: false` — changing a filter must not jump the list to the top.
 *
 * NOTE: this hook uses `useSearchParams()`, so any component using it must sit
 * inside a <Suspense> boundary (App Router requirement). The issue list page does this.
 */
export function useIssueFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = useMemo(
    () => parseIssueQuery(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const setQuery = useCallback(
    (next: IssueListQuery) => {
      const qs = serializeIssueQuery(next);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  /** Merge a partial change; always resets to page 1 unless `page` is given. */
  const patch = useCallback(
    (partial: Partial<IssueListQuery>) => {
      const { page, ...rest } = partial;
      setQuery({ ...query, ...rest, page: page ?? 1 });
    },
    [query, setQuery],
  );

  const clear = useCallback(() => setQuery({}), [setQuery]);

  return { query, setQuery, patch, clear };
}