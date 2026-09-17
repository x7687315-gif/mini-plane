"use client";

import { create } from "zustand";

/**
 * Toast store — the project's "global error / result" surface.
 *
 * SCREEN_BLUEPRINTS §5.3 specifies the shape: **顶部细线 banner，3s 后自动消失**.
 * Notably it is NOT a floating card in the corner — a hairline strip under the TopBar
 * keeps the paper-and-rules language, and it is the same visual device as the inline
 * field errors ("边框变 --color-urgent"), just wider.
 *
 * Why Zustand and not React Query's global `onError`: mutations that can fail here are
 * *batch* operations whose outcome is per-item (3 of 5 succeeded). Only the caller
 * knows what a useful sentence looks like, so the store is a dumb queue and the caller
 * writes the copy. React Query stays responsible for data, not for prose.
 */

export type ToastTone = "info" | "success" | "error";

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
  /** Milliseconds before auto-dismiss. Errors linger a little longer. */
  ttl: number;
}

interface ToastState {
  toasts: Toast[];
  push: (tone: ToastTone, message: string, ttl?: number) => string;
  dismiss: (id: string) => void;
}

const DEFAULT_TTL: Record<ToastTone, number> = {
  info: 3000,
  success: 3000,
  // A failure the user cannot re-read is a failure they will repeat blindly.
  error: 6000,
};

let seq = 0;
function nextId(): string {
  seq += 1;
  return `toast-${Date.now()}-${seq}`;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (tone, message, ttl) => {
    const id = nextId();
    set((s) => ({ toasts: [...s.toasts, { id, tone, message, ttl: ttl ?? DEFAULT_TTL[tone] }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Imperative helpers usable outside React (mutation callbacks, etc.). */
export const toast = {
  info: (message: string) => useToastStore.getState().push("info", message),
  success: (message: string) => useToastStore.getState().push("success", message),
  error: (message: string) => useToastStore.getState().push("error", message),
};
