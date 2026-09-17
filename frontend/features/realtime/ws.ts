"use client";

import {
  buildProjectSocketUrl,
  classifyClose,
  HEARTBEAT_INTERVAL_MS,
  IDLE_TIMEOUT_MS,
  isConnectionDead,
  nextBackoffDelay,
  parseFrame,
  pingFrame,
  shouldSendHeartbeat,
} from "./policy";

/**
 * ProjectSocket — the whole WebSocket client for a project channel.
 *
 * Framework-free on purpose: the React binding is a 30-line hook, and everything with
 * real failure modes (backoff, liveness, close codes) lives here where it can be
 * reasoned about without a component tree.
 *
 * Contract (docs/api/08-realtime.md):
 * - URL `/ws/workspaces/{slug}/projects/{pid}/`, authenticated by the **session cookie**
 *   (the browser sends it on the handshake; no token plumbing).
 * - The server sends `{"event":"connected","payload":{project_id, role}}` immediately.
 *   Until that frame arrives we are NOT ready — `onReady` is what the store calls "live".
 * - The client may only ever send `{"type":"ping"}`. Anything else gets an error frame.
 *
 * Design rules:
 *
 * 1. **Never retry a 4401/4404.** A dead session or an invisible project will not
 *    become true by waiting; retrying is a request flood with no possible success.
 * 2. **Zombie detection.** A dropped peer can leave a socket "open" for minutes. The
 *    server answers every ping with a pong, so total silence past ~2 heartbeats is
 *    proof of death — we tear it down ourselves instead of waiting for the browser.
 * 3. **One socket per project.** `close()` is idempotent and cancels every timer; a
 *    leaked interval that keeps pinging after unmount is the classic version of this bug.
 * 4. **Events are hints, not state.** We forward them and let the caller invalidate
 *    React Query; we never try to mutate a cache from a payload (see hooks.ts).
 */

export interface ProjectSocketCallbacks {
  /** Handshake frame arrived: the channel is usable. */
  onReady: (role: number | null) => void;
  /** A business event (`issue.updated` / `comment.created`). */
  onEvent: (event: string, payload: unknown) => void;
  /** Dropped and about to retry. */
  onReconnecting: (attempts: number) => void;
  /** 4404 — stop for good, tell the user why. */
  onForbidden: (detail: string) => void;
  /** 4401 — the session is gone; the caller should clear auth and route to /login. */
  onUnauthorized: () => void;
  /** Closed for a reason worth surfacing, and we are NOT going to retry. */
  onError: (detail: string) => void;
  /** Reconnected after a drop: the caller MUST refetch (08 契约: no event replay). */
  onRecovered: () => void;
}

export class ProjectSocket {
  private socket: WebSocket | null = null;
  private attempt = 0;
  private closedByUs = false;
  private hasBeenReady = false;
  private lastSentAt: number | null = null;
  private lastMessageAt: number | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly url: string,
    private readonly cb: ProjectSocketCallbacks,
  ) {}

  static forProject(
    base: string,
    workspaceSlug: string,
    projectId: string,
    cb: ProjectSocketCallbacks,
  ): ProjectSocket {
    return new ProjectSocket(buildProjectSocketUrl(base, workspaceSlug, projectId), cb);
  }

  connect(): void {
    this.closedByUs = false;
    this.clearReconnectTimer();

    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this.lastSentAt = null;
      // Wait for the handshake frame before declaring readiness: "connected" carries
      // the effective role, and the contract is explicit that a socket which opens but
      // never receives it has failed.
      this.startHeartbeat();
    };

    socket.onmessage = (ev) => {
      const now = Date.now();
      this.lastMessageAt = now;

      if (typeof ev.data !== "string") return; // all frames are JSON text
      const frame = parseFrame(ev.data);
      if (!frame) return; // skip junk rather than killing a shared connection

      if (frame.event === "connected") {
        const role =
          typeof frame.payload === "object" && frame.payload !== null
            ? ((frame.payload as { role?: unknown }).role as number | null) ?? null
            : null;
        this.attempt = 0;
        const recovered = this.hasBeenReady;
        this.hasBeenReady = true;
        this.cb.onReady(role);
        // 08 契约: no replay of what we missed — the only correct answer is a refetch.
        if (recovered) this.cb.onRecovered();
        return;
      }

      if (frame.event === "pong") return; // liveness only
      if (frame.event === "error") return; // protocol complaint; connection stays up

      this.cb.onEvent(frame.event, frame.payload);
    };

    socket.onerror = () => {
      // `onerror` never carries a usable reason, and it is always followed by
      // `onclose`. Do nothing here so the two paths cannot double-handle the failure.
    };

    socket.onclose = (ev) => {
      this.stopHeartbeat();
      this.socket = null;
      if (this.closedByUs) return;

      switch (classifyClose(ev.code)) {
        case "relogin":
          this.closedByUs = true;
          this.cb.onUnauthorized();
          return;
        case "give-up":
          this.closedByUs = true;
          this.cb.onForbidden("该项目当前不可见（4404）——不会自动重连。");
          return;
        default: {
          const delay = nextBackoffDelay(this.attempt);
          this.attempt += 1;
          this.cb.onReconnecting(this.attempt);
          this.reconnectTimer = setTimeout(() => this.connect(), delay);
        }
      }
    };
  }

  /** Idempotent teardown. Safe to call from a React cleanup. */
  close(): void {
    this.closedByUs = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    const socket = this.socket;
    this.socket = null;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      socket.close(1000, "client unmount");
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastMessageAt = Date.now();
    this.heartbeatTimer = setInterval(() => {
      const socket = this.socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;

      const now = Date.now();
      if (isConnectionDead(this.lastMessageAt, now)) {
        // Zombie: the peer is gone but the socket never said so. Tearing it down
        // triggers onclose → normal backoff path.
        socket.close(4000, `idle > ${IDLE_TIMEOUT_MS}ms`);
        return;
      }
      if (shouldSendHeartbeat(this.lastSentAt, now)) {
        socket.send(pingFrame());
        this.lastSentAt = now;
      }
    }, HEARTBEAT_INTERVAL_MS / 5);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
