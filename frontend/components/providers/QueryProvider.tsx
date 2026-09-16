"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * React Query client wrapper.
 *
 * Per FRONTEND_ROADMAP.md §0:
 * - React Query handles server state (issues, projects, comments, activities, ...)
 * - Zustand handles local UI state (drawer, modal, ws connection)
 *
 * Defaults:
 * - 30s stale time — for project management, "fresh enough" without spamming backend
 * - 5 min gc time — keep recent data in memory to allow fast back-navigation
 * - retry: 0 on 4xx (we handle 401/403/404 explicitly in [lib/api.ts]; let them throw)
 * - retry: 2 on network errors
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // Don't retry 4xx — they are deterministic, retrying just wastes time
              if (error instanceof Error && /^\d{3}$/.test(error.message)) {
                const status = Number(error.message);
                if (status >= 400 && status < 500) return false;
              }
              return failureCount < 2;
            },
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}