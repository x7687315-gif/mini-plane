"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { isUnauthorized } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { LoginPayload, RegisterPayload, User } from "@/types/auth";
import { fetchCsrf, fetchMe, login, logout, register } from "./api";

/**
 * Auth hooks — the bridge between React Query (server state) and the Zustand auth store.
 *
 * Contract:
 * - `useMe()` is the single source of "am I signed in?" — it writes the result into
 *   the auth store so synchronous consumers (AvatarMenu, permission checks) work.
 * - 401 is NOT an error: it means "anonymous", which is a valid state. We return `null`
 *   and set the store to `anonymous` so <AuthGuard> can redirect.
 * - login/register/logout invalidate the `me` query so the store stays in sync.
 */

export const meQueryKey = ["auth", "me"] as const;

export function useMe() {
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);

  return useQuery<User | null>({
    queryKey: meQueryKey,
    queryFn: async () => {
      try {
        const user = await fetchMe();
        setUser(user);
        return user;
      } catch (e) {
        if (isUnauthorized(e)) {
          clear();
          return null;
        }
        throw e;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: (payload: LoginPayload) => login(payload),
    onSuccess: (user) => {
      setUser(user);
      qc.setQueryData(meQueryKey, user);
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: (payload: RegisterPayload) => register(payload),
    onSuccess: (user) => {
      // Register already signs the user in (backend contract: 201 + session cookie).
      setUser(user);
      qc.setQueryData(meQueryKey, user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const clear = useAuthStore((s) => s.clear);

  return useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      clear();
      qc.setQueryData(meQueryKey, null);
      // Drop everything else — other caches belong to the previous session.
      qc.clear();
    },
  });
}

/** Seed the csrftoken cookie. Safe to call repeatedly; usually once on app boot. */
export async function primeCsrf(): Promise<void> {
  await fetchCsrf();
}

/**
 * Read `?redirect=` without `useSearchParams()`.
 *
 * Why not useSearchParams: it forces the enclosing tree into a Suspense boundary,
 * which means the login/register form is NOT server-rendered — users see a skeleton
 * flash on first paint. Reading `window.location.search` instead keeps the form
 * statically renderable.
 *
 * `useSyncExternalStore` (rather than a mount effect + setState) is the precise fit
 * here: `location.search` *is* an external store, the server snapshot is "/", and
 * React swaps to the client snapshot during hydration without an extra commit — so
 * we get the real target without a skeleton flash and without a cascading render.
 */
function readRedirectTarget(): string {
  const target = new URLSearchParams(window.location.search).get("redirect");
  // Only allow same-origin relative paths — never an absolute URL (open-redirect guard).
  if (target && target.startsWith("/") && !target.startsWith("//")) return target;
  return "/";
}

/** `location.search` only changes on navigation, which re-renders the tree anyway. */
function subscribeToLocation(): () => void {
  return () => {};
}

export function useRedirectTarget(): string {
  return useSyncExternalStore(subscribeToLocation, readRedirectTarget, () => "/");
}