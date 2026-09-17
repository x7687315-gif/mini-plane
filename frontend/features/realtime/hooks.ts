"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth";
import { useWsStore } from "@/stores/ws";
import { issueKeys } from "@/features/issue/hooks";
import { activityKeys } from "@/features/activity/hooks";
import { ProjectSocket } from "./ws";
import { planRealtimeEffect } from "./policy";

/**
 * useProjectRealtime — connects the project channel for as long as the page is mounted.
 *
 * Lifecycle is the whole point: one socket per project, opened on mount and torn down
 * on unmount, so navigating away stops the traffic. The effect's dependency list is
 * `[enabled, slug, projectId]` only — every callback reads live values through a ref,
 * so a re-render (a filter change, a keystroke in the search box) can never churn the
 * connection.
 *
 * Cache strategy (the interesting part):
 *
 * - `issue.updated` → invalidate that issue, the lists, and both activity feeds.
 *   We do NOT patch the row from the payload — see `planRealtimeEffect` for why the
 *   payload is structurally incapable of expressing an Issue.
 * - `comment.created` → invalidate the thread, unless it is our own comment (the
 *   composer already inserted it optimistically; refetching would double it up).
 * - reconnect → invalidate *everything* for the project. 08 契约 does not replay
 *   missed events, so a full refresh is the only correct recovery.
 * - 4401 → clear auth and go to /login with a redirect back here. We do not retry.
 * - 4404 → stop and say so; the project is not visible to this user.
 *
 * Invalidation is always scoped to **this** project's keys. A bare `["issues"]` prefix
 * would refetch every cached project's lists, which is a real cost once a user has
 * browsed a few.
 */

interface RealtimeContext {
  qc: QueryClient;
  slug: string;
  projectId: string;
  currentUserId?: string;
}

export function useProjectRealtime(
  slug: string | undefined,
  projectId: string | undefined,
  enabled = true,
): void {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const clearAuth = useAuthStore((s) => s.clear);

  // "Latest values" ref: the socket is created once per project, but its callbacks must
  // always see the current user / router / query client.
  //
  // Refreshed in an effect rather than during render — `react-hooks/refs` is right that
  // a ref write during render is a side effect in the render phase. Every socket
  // callback is invoked asynchronously (a frame arrives, a close fires), so it always
  // observes a ref that this effect has already refreshed. Declared before the
  // connect effect so it wins the ordering on the very first mount.
  const latest = useRef({ qc, router, pathname, currentUserId, clearAuth });
  useEffect(() => {
    latest.current = { qc, router, pathname, currentUserId, clearAuth };
  });

  useEffect(() => {
    if (!enabled || !slug || !projectId) return;

    useWsStore.getState().setConnecting(projectId);

    const base = process.env.NEXT_PUBLIC_WS_BASE ?? "ws://127.0.0.1:8000";
    const ctx: RealtimeContext = {
      qc: latest.current.qc,
      slug,
      projectId,
      currentUserId: latest.current.currentUserId,
    };

    const socket = ProjectSocket.forProject(base, slug, projectId, {
      onReady: (role) => useWsStore.getState().setLive({ projectId, role }),

      onEvent: (event, payload) => {
        useWsStore.getState().setLastMessageAt(Date.now());
        applyEffect(event, payload, {
          ...ctx,
          // keep the actor check current without rebuilding the socket
          currentUserId: latest.current.currentUserId,
        });
      },

      onReconnecting: (attempts) => useWsStore.getState().setReconnecting(attempts),
      onForbidden: (detail) => useWsStore.getState().setForbidden(detail),
      onError: (detail) => useWsStore.getState().setError(detail),

      onUnauthorized: () => {
        const { clearAuth: clear, router: r, pathname: path } = latest.current;
        clear();
        r.replace(`/login?redirect=${encodeURIComponent(path)}`);
      },

      onRecovered: () => {
        // Nothing was buffered while we were away — refetch the project wholesale.
        invalidateProject(latest.current.qc, slug, projectId);
      },
    });

    socket.connect();
    return () => {
      socket.close();
      useWsStore.getState().reset();
    };
  }, [enabled, slug, projectId]);
}

/** Invalidate every cached fact belonging to one project. */
function invalidateProject(qc: QueryClient, slug: string, projectId: string): void {
  void qc.invalidateQueries({ queryKey: issueKeys.all(slug, projectId) });
  void qc.invalidateQueries({ queryKey: activityKeys.project(slug, projectId) });
  void qc.invalidateQueries({ queryKey: ["comments", slug, projectId] });
}

function applyEffect(event: string, payload: unknown, ctx: RealtimeContext): void {
  const effect = planRealtimeEffect(event, payload, ctx.currentUserId);
  const { qc, slug, projectId } = ctx;

  switch (effect.kind) {
    case "none":
      return;

    case "issue-updated": {
      void qc.invalidateQueries({ queryKey: issueKeys.all(slug, projectId) });
      if (effect.issueId) {
        void qc.invalidateQueries({
          queryKey: activityKeys.issue(slug, projectId, effect.issueId),
        });
      }
      void qc.invalidateQueries({ queryKey: activityKeys.project(slug, projectId) });
      return;
    }

    case "comment-created": {
      if (effect.ownComment) return; // already inserted optimistically by the composer
      void qc.invalidateQueries({ queryKey: ["comments", slug, projectId] });
      // A comment also writes a `comment.created` activity row (06 契约).
      if (effect.issueId) {
        void qc.invalidateQueries({
          queryKey: activityKeys.issue(slug, projectId, effect.issueId),
        });
      }
      void qc.invalidateQueries({ queryKey: activityKeys.project(slug, projectId) });
      return;
    }
  }
}
