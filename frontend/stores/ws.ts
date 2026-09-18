"use client";

import { create } from "zustand";

/**
 * Realtime connection store — a synchronous view of the socket's health.
 *
 * Same reasoning as the auth store: React Query owns *data*, but the TopBar needs a
 * synchronous answer to "are we live?" on every render, and the project page needs to
 * know whether the `role` from the handshake frame disagrees with what HTTP told it.
 *
 * Status machine (08 契约):
 *   idle        → no project page mounted, nothing to connect to
 *   connecting  → socket created, waiting for the `connected` handshake frame
 *   live        → handshake received; events will flow
 *   reconnecting→ dropped, backing off before the next attempt
 *   forbidden   → 4404: this project is not visible to the user — do NOT retry
 *   error       → the socket failed in a way that is worth telling the user about
 */

export type WsStatus =
  | "idle"
  | "connecting"
  | "live"
  | "reconnecting"
  | "forbidden"
  | "error";

interface WsState {
  status: WsStatus;
  /** Effective project role from the handshake frame (20/15/5), if received. */
  role: number | null;
  /** Project id the current connection belongs to — guards against cross-project leaks. */
  projectId: string | null;
  /** Human-readable reason for `error` / `forbidden`, shown in the TopBar. */
  detail: string | null;
  /** How many times we have had to reconnect since the page mounted. */
  attempts: number;
  /** Epoch ms of the last frame received (any type). */
  lastMessageAt: number | null;

  setConnecting: (projectId: string) => void;
  setLive: (payload: { projectId: string; role: number | null }) => void;
  setReconnecting: (attempts: number) => void;
  setForbidden: (detail: string) => void;
  setError: (detail: string) => void;
  setLastMessageAt: (at: number) => void;
  reset: () => void;
}

const INITIAL = {
  status: "idle" as WsStatus,
  role: null,
  projectId: null,
  detail: null,
  attempts: 0,
  lastMessageAt: null,
};

export const useWsStore = create<WsState>((set) => ({
  ...INITIAL,
  setConnecting: (projectId) =>
    set({ status: "connecting", projectId, detail: null, lastMessageAt: null }),
  setLive: ({ projectId, role }) =>
    set({ status: "live", projectId, role, detail: null, attempts: 0 }),
  setReconnecting: (attempts) => set({ status: "reconnecting", attempts }),
  setForbidden: (detail) => set({ status: "forbidden", detail }),
  setError: (detail) => set({ status: "error", detail }),
  setLastMessageAt: (at) => set({ lastMessageAt: at }),
  reset: () => set({ ...INITIAL }),
}));

/** One-line label for the TopBar indicator. */
export function wsStatusLabel(status: WsStatus): string {
  switch (status) {
    case "live":
      return "已连接";
    case "connecting":
      return "连接中";
    case "reconnecting":
      return "重连中";
    case "forbidden":
      return "no access";
    case "error":
      return "offline";
    default:
      return "polling";
  }
}
