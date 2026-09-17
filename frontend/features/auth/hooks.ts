"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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