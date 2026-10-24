"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth";
import { useWsStore } from "@/stores/ws";
import { useAgentSessionStore } from "@/stores/agentSession";
import { issueKeys } from "@/features/task/hooks";
import { activityKeys } from "@/features/activity/hooks";
import { projectKeys, taskKeys } from "@/lib/queryKeys";
import { wsBaseUrl } from "@/lib/api";
import { ProjectSocket } from "./ws";
import { buildProjectSocketUrl, buildProjectSocketUrlById, planRealtimeEffect } from "./policy";

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
    if (!enabled || !projectId) return;
    // slug 现为可选（Phase 5）：空 = 私人工程/规范路径，走 pid-only WS 路由
    const slugStr = slug ?? "";

    useWsStore.getState().setConnecting(projectId);

    // 与 lib/api.ts 同理：基址从 API base 推导（同 host 换协议），必须与页面同 host，
    // 否则跨站的 WebSocket 握手带不上 Session Cookie，会直接收到 4401 关闭码。
    const base = wsBaseUrl();
    // 双路由（Phase 5）：有 slug 走兼容路径；私人工程（slug 为空）走 pid 规范路径。
    const url = slugStr
      ? buildProjectSocketUrl(base, slugStr, projectId)
      : buildProjectSocketUrlById(base, projectId);
    const ctx: RealtimeContext = {
      qc: latest.current.qc,
      slug: slugStr,
      projectId,
      currentUserId: latest.current.currentUserId,
    };

    const socket = new ProjectSocket(url, {
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
        invalidateProject(latest.current.qc, slugStr, projectId);
      },
    });

    socket.connect();
    return () => {
      socket.close();
      useWsStore.getState().reset();
    };
  }, [enabled, slug, projectId]);
  // slug 仅用于选择 WS 路由形态（兼容 slug 路径 / pid 规范路径），空串 = pid 路径。
}

/** Invalidate every cached fact belonging to one project. */
function invalidateProject(qc: QueryClient, slug: string, projectId: string): void {
  void qc.invalidateQueries({ queryKey: issueKeys.all(slug, projectId) });
  void qc.invalidateQueries({ queryKey: activityKeys.project(slug, projectId) });
  // 评论挂在 task 之下：失效整个 tasks 子树（含列表/详情/评论，工厂键前缀）
  void qc.invalidateQueries({ queryKey: taskKeys.list(projectId) });
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
      // 该 task 的评论线程（键来自工厂，R-03 的失配教训：不再手写字面量）
      if (effect.issueId) {
        void qc.invalidateQueries({ queryKey: taskKeys.comments(projectId, effect.issueId) });
      } else {
        void qc.invalidateQueries({ queryKey: taskKeys.list(projectId) });
      }
      // A comment also writes a `comment.created` activity row (06 契约).
      if (effect.issueId) {
        void qc.invalidateQueries({
          queryKey: activityKeys.issue(slug, projectId, effect.issueId),
        });
      }
      void qc.invalidateQueries({ queryKey: activityKeys.project(slug, projectId) });
      return;
    }

    case "agent-session": {
      // Sprint 13：直接写本地 store（桌面实时投影 AGENT · RUNNING），并刷新首页聚合
      useAgentSessionStore.getState().set(projectId, {
        sessionId: effect.sessionId ?? "",
        title: effect.title,
        status: effect.status,
        elapsedSeconds: effect.elapsedSeconds,
        agent: effect.agent,
      });
      void qc.invalidateQueries({ queryKey: projectKeys.mine() });
      return;
    }
  }
}
