/**
 * Unified fetch wrapper for the Mini Plane backend.
 *
 * Implements the rules from docs/api/09-frontend-integration.md §三:
 * - All requests include `credentials: "include"` (Session cookie)
 * - All POST/PATCH/DELETE include `X-CSRFToken` header (read from csrftoken cookie)
 * - Tail slash auto-appended to paths
 * - JSON body requests include Content-Type: application/json
 * - Status codes propagate as thrown Errors for React Query to react to
 * - 403 on write requests → one-shot CSRF retry
 */

/**
 * API 基址。
 *
 * ⚠️ 默认值必须是 `localhost` 而**不是** `127.0.0.1` —— 这是 2026-09-18 由 E2E
 * 实测发现的真 bug（见 docs/devlog/integration-verification.md）：
 *
 * 页面在 `localhost:3000`，若 API 指向 `127.0.0.1:8000`，两者是**不同的 host**：
 * 1. 后端 `SESSION_COOKIE_SAMESITE="Lax"`，跨站的 XHR/fetch **不会带上会话 cookie**；
 * 2. 更致命的是 `csrftoken` cookie 落在 `127.0.0.1` 域上，而下面 `readCookie()`
 *    读的是 `document.cookie`（当前页面的域）→ 恒为空 → 所有写请求 403。
 *
 * 端口不同不影响（SameSite 只看 host），所以 `localhost:3000` → `localhost:8000`
 * 是同站跨源，一切正常。
 */
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `API ${status}`);
    this.name = "ApiError";
  }
}

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="));
  return m ? decodeURIComponent(m.split("=").slice(1).join("=")) : "";
}

export function getCsrfToken(): string {
  return readCookie("csrftoken");
}

function buildUrl(path: string): string {
  // Strip query string from path for normalisation, then re-append
  const [urlPath, query] = path.split("?");
  const normalised = urlPath.replace(/\/+$/, "") + "/";
  return `${BASE}/api/v1${normalised}${query ? `?${query}` : ""}`;
}

interface ApiInit extends RequestInit {
  /** Convenience: pass a JSON-serialisable object instead of stringifying yourself. */
  json?: unknown;
  /** when true, do not retry on 403 even for write methods (used internally for CSRF retry) */
  skipCsrfRetry?: boolean;
}

export async function api<T = unknown>(
  path: string,
  init: ApiInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (method !== "GET" && method !== "HEAD") {
    headers.set("X-CSRFToken", getCsrfToken());
  }
  headers.set("Accept", "application/json");

  // Resolve body — caller passes either json: object OR body: BodyInit
  const body = init.json !== undefined ? JSON.stringify(init.json) : init.body;

  const resp = await fetch(buildUrl(path), {
    ...init,
    method,
    headers,
    credentials: "include",
    body,
  });

  // CSRF self-healing — same logic as 09-frontend-integration.md §三 step 5
  if (
    resp.status === 403 &&
    method !== "GET" &&
    !init.skipCsrfRetry
  ) {
    // re-prime CSRF cookie
    await fetch(`${BASE}/api/v1/auth/csrf/`, {
      method: "GET",
      credentials: "include",
    });
    return api<T>(path, { ...init, skipCsrfRetry: true });
  }

  if (!resp.ok) {
    let body: unknown;
    try {
      body = await resp.json();
    } catch {
      body = await resp.text().catch(() => null);
    }
    throw new ApiError(resp.status, body);
  }

  if (resp.status === 204) return undefined as T;

  // 200 / 201 with JSON body
  return (await resp.json()) as T;
}

/** First-call CSRF seed. Call once at app start (e.g. in QueryProvider init or RootLayout). */
export async function primeCsrf(): Promise<void> {
  await fetch(`${BASE}/api/v1/auth/csrf/`, {
    method: "GET",
    credentials: "include",
  });
}

/** Domain helpers used across features. */
export function isUnauthorized(e: unknown): boolean {
  return e instanceof ApiError && e.status === 401;
}
export function isForbidden(e: unknown): boolean {
  return e instanceof ApiError && e.status === 403;
}
export function isNotFound(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404;
}