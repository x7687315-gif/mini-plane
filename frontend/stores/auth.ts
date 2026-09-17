"use client";

import { create } from "zustand";
import type { User } from "@/types/auth";

/**
 * Auth store — a synchronous snapshot of "who am I right now".
 *
 * Why Zustand here instead of only React Query:
 * - React Query's `useMe()` is async (has `isLoading`). Many components need a
 *   *synchronous* answer to "is the current user X?" — e.g. AvatarMenu, permission
 *   checks in IssueDrawer, the TopBar connection indicator.
 * - React Query remains the source of truth for *fetching*; this store mirrors it.
 *
 * Status machine:
 *   unknown       → we haven't checked /me yet (first paint, show skeleton)
 *   authenticated → /me returned 200
 *   anonymous     → /me returned 401 (redirect to /login)
 */

export type AuthStatus = "unknown" | "authenticated" | "anonymous";

interface AuthState {
  user: User | null;
  status: AuthStatus;
  /** Called by useMe() on success. */
  setUser: (user: User) => void;
  /** Called by useMe() on 401, or after logout. */
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "unknown",
  setUser: (user) => set({ user, status: "authenticated" }),
  clear: () => set({ user: null, status: "anonymous" }),
}));

/** Convenience selectors (avoid re-rendering on unrelated store changes). */
export const selectUser = (s: AuthState) => s.user;
export const selectStatus = (s: AuthState) => s.status;
export const selectIsAuthenticated = (s: AuthState) => s.status === "authenticated";
