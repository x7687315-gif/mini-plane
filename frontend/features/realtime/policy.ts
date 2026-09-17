/**
 * Realtime connection policy — pure functions, extracted so they can be unit-tested.
 *
 * docs/api/08-realtime.md defines the contract; this file encodes the *client's*
 * half of it. Everything here is a decision that must not be improvised inside a
 * socket callback:
 *
 * - which close codes mean "retry" vs "stop" vs "go log in";
 * - how long to wait before the next attempt;
 * - when the connection is silently dead and must be torn down.
 */

/**
 * Custom close codes (08 契约 §关闭码) — note these are NOT standard WebSocket codes.
 * The backend uses the 4000–4999 application range with HTTP semantics appended
 * (`4401` ≈ 401, `4404` ≈ 404-with-anti-enumeration).
 */
export const WS_CLOSE_UNAUTHORIZED = 4401;
export const WS_CLOSE_FORBIDDEN = 4404;

/** What to do after a close, by code. */
export type CloseAction =
  /** Session is gone: clear local auth and send the user to /login. Never retry blindly. */
  | "relogin"
  /** The project is not visible to this user: retrying is pointless and rude. */
  | "give-up"
  /** Anything else (1000/1006/normal network loss): transparently reconnect. */
  | "reconnect";

export function classifyClose(code: number): CloseAction {
  if (code === WS_CLOSE_UNAUTHORIZED) return "relogin";
  if (code === WS_CLOSE_FORBIDDEN) return "give-up";
  return "reconnect";
}

/* ---------------- backoff ---------------- */

export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 30_000;

/**
 * Delay before retry `attempt` (0-based).
 *
 * **Equal jitter**, not full jitter: `base/2 + random*base/2`. Full jitter can return
 * ~0ms, which turns a flapping server into a tight retry loop — the exact scenario the
 * backoff exists to prevent. Equal jitter keeps a guaranteed floor while still
 * de-correlating N clients that dropped at the same instant (e.g. a redeploy).
 *
 * `random` is injectable purely so the sequence is assertable in tests.
 */
export function nextBackoffDelay(attempt: number, random: () => number = Math.random): number {
  const exponential = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
  const half = exponential / 2;
  return Math.round(half + random() * half);
}

/* ---------------- liveness ---------------- */

/** Heartbeat cadence: the only message a client may send (08 契约 §三). */
export const HEARTBEAT_INTERVAL_MS = 25_000;

/**
 * No frame at all for this long → assume the socket is a zombie.
 *
 * A TCP connection can stay "open" with a dead peer for minutes; the browser will not
 * tell us. Since the server answers every ping with a `pong`, silence past ~2 missed
 * heartbeats is the reliable signal.
 */
export const IDLE_TIMEOUT_MS = 60_000;

export function shouldSendHeartbeat(lastSentAt: number | null, now: number): boolean {
  if (lastSentAt === null) return true;
  return now - lastSentAt >= HEARTBEAT_INTERVAL_MS;
}

export function isConnectionDead(lastMessageAt: number | null, now: number): boolean {
  if (lastMessageAt === null) return false; // never silence on a socket we just opened
  return now - lastMessageAt >= IDLE_TIMEOUT_MS;
}

/* ---------------- frames ---------------- */

export interface RealtimeFrame {
  event: string;
  payload: unknown;
}

/**
 * Parse and shape-check one incoming frame.
 *
 * Returns `null` for anything that is not `{event: string, payload: …}`. The consumer
 * logs and skips — a malformed frame must never take the socket down, because the
 * connection is shared by every listener on the page.
 */
export function parseFrame(raw: string): RealtimeFrame | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const event = (data as { event?: unknown }).event;
  if (typeof event !== "string" || !event) return null;
  return { event, payload: (data as { payload?: unknown }).payload };
}

/** The ping frame — the *only* thing a client is allowed to send. */
export function pingFrame(): string {
  return JSON.stringify({ type: "ping" });
}

export function buildProjectSocketUrl(
  base: string,
  workspaceSlug: string,
  projectId: string,
): string {
  // Strip a trailing slash so `/` + `/ws/...` cannot produce a double slash
  // (Django's router would 404 on that).
  return `${base.replace(/\/+$/, "")}/ws/workspaces/${workspaceSlug}/projects/${projectId}/`;
}

/* ---------------- event → effect ---------------- */

/**
 * What a pushed event should cause locally.
 *
 * `own-comment` matters: the server broadcasts to the whole project channel including
 * the author, but the composer already inserted that comment optimistically. Refetching
 * it would show the same comment twice for a moment, so we recognise our own write and
 * stand down.
 */
export type RealtimeEffect =
  | { kind: "none"; reason: "unknown-event" | "malformed" }
  | { kind: "issue-updated"; issueId: string | null; sequenceId: number | null }
  | { kind: "comment-created"; issueId: string | null; ownComment: boolean };

function asRecord(payload: unknown): Record<string, unknown> | null {
  return typeof payload === "object" && payload !== null
    ? (payload as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/**
 * Map a frame to a cache action.
 *
 * Note what is deliberately NOT here: "patch the issue row from the payload".
 * The `issue.updated` payload is a **display-ready diff** (06 契约: `{"state": "Done"}`,
 * never a UUID or a state id), which is enough to write a timeline sentence but *not*
 * enough to rebuild an `Issue` — we would not know the new state's id, colour, or the
 * new label objects. So the honest response is "something changed → refetch", exactly
 * as 08 契约 recommends ("事件只做提示刷新，不承载最终状态").
 */
export function planRealtimeEffect(
  event: string,
  payload: unknown,
  currentUserId?: string,
): RealtimeEffect {
  const p = asRecord(payload);
  if (!p) return { kind: "none", reason: "malformed" };

  const issueId = str(p.issue_id);
  const sequenceId = typeof p.sequence_id === "number" ? p.sequence_id : null;

  if (event === "issue.updated") {
    return { kind: "issue-updated", issueId, sequenceId };
  }

  if (event === "comment.created") {
    const author = asRecord(p.author);
    const authorId = author ? str(author.id) : null;
    return {
      kind: "comment-created",
      issueId,
      ownComment: Boolean(currentUserId && authorId === currentUserId),
    };
  }

  // 08 契约 §2.3: only two events exist today; anything else is ignored rather than
  // guessed at, so a future server-side addition cannot make an old client misbehave.
  return { kind: "none", reason: "unknown-event" };
}
