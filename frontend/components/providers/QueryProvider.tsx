"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { ApiError, primeCsrf } from "@/lib/api";

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
              // Don't retry 4xx — they are deterministic, retrying just wastes time.
              // R-04 修复：ApiError 的默认 message 是 "API 404" 而非裸 "404"，
              // 旧正则 /^\d{3}$/ 永不命中 → 4xx 曾被无谓地重试 2 次。
              if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
                return false;
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

  // 首次 CSRF 播种（R-15）：登录态确立后种一次 csrftoken，避免首个写请求
  // 走 403→重播种→重试的自愈绕路。自愈逻辑仍保留作兜底。
  useEffect(() => {
    void primeCsrf().catch(() => {
      /* 后端未起时的播种失败无害：自愈路径会再试 */
    });
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}