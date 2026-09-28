/**
 * Auth API — thin wrappers over the endpoints in docs/api/01-auth.md.
 *
 * All functions go through `lib/api.ts` which handles:
 * - `credentials: "include"` (Session cookie)
 * - `X-CSRFToken` header on write methods (read from csrftoken cookie)
 * - 403 → one-shot CSRF re-prime + retry
 *
 * The backend returns field-level 400 bodies (`{username: ["…"]}`),
 * a `{detail: "…"}` for login failure / 401 / 429, and a bare User object on success.
 */

import { ApiError, api } from "@/lib/api";
import type { BindPayload, LoginPayload, RegisterPayload, User } from "@/types/auth";

/** GET /api/v1/auth/csrf/ — seeds the csrftoken cookie. Call once at app start. */
export async function fetchCsrf(): Promise<void> {
  await api<{ detail: string }>("/auth/csrf");
}

/** POST /api/v1/auth/register/ — 201 (already signed in) → User */
export async function register(payload: RegisterPayload): Promise<User> {
  return api<User>("/auth/register", { method: "POST", json: payload });
}

/** POST /api/v1/auth/login/ — 200 → User；401 password_required；404 not_found；400/429 见后端 */
export async function login(payload: LoginPayload): Promise<User> {
  return api<User>("/auth/login", { method: "POST", json: payload });
}

/** 从 login 抛出的 ApiError 里取出后端语义 code（password_required / not_found）。 */
export function loginErrorCode(err: unknown): string | null {
  if (err instanceof ApiError) {
    const body = err.body as { code?: unknown } | null;
    return typeof body?.code === "string" ? body.code : null;
  }
  return null;
}

/** POST /api/v1/auth/bind/ — 设置页自助绑定 / 修改密码或邮箱（仅本人）→ 200 User */
export async function bind(payload: BindPayload): Promise<User> {
  return api<User>("/auth/bind", { method: "POST", json: payload });
}

/** POST /api/v1/auth/logout/ — 204 */
export async function logout(): Promise<void> {
  return api<void>("/auth/logout", { method: "POST" });
}

/** GET /api/v1/auth/me/ — 200 → User; 401 when not signed in */
export async function fetchMe(): Promise<User> {
  return api<User>("/auth/me");
}