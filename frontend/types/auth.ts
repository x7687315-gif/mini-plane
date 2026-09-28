/**
 * Auth domain types — mirrors docs/api/01-auth.md.
 *
 * Field naming follows the backend (snake_case in JSON), which is what
 * the API actually returns. Frontend-only types use camelCase.
 */

/** User object as returned by /auth/me/, /auth/login/, /auth/register/. */
export interface User {
  id: string;
  username: string;
  /** 本地单机版：邮箱可选，未绑定为 null。 */
  email: string | null;
  avatar: string | null;
  created_at: string;
  /** 是否已绑定密码（决定登录是否需二级验证）。 */
  has_password: boolean;
  /** 是否已绑定邮箱。 */
  has_email: boolean;
}

/** POST /api/v1/auth/register/ —— 昵称必填，密码 / 邮箱可选。 */
export interface RegisterPayload {
  username: string;
  email?: string;
  password?: string;
}

/** POST /api/v1/auth/login/ —— 昵称必填；免密账户可不带密码直入。 */
export interface LoginPayload {
  username: string;
  password?: string;
}

/** POST /api/v1/auth/bind/ —— 设置页自助绑定 / 修改。 */
export interface BindPayload {
  password?: string;
  email?: string | null;
  remove_password?: boolean;
}

/**
 * DRF field-level error body: `{ "username": ["…"], "password": ["…"] }`.
 * Non-field errors live under `non_field_errors`; plain messages under `detail`.
 */
export interface FieldErrors {
  [field: string]: string[];
}

/** Narrowing helper: is this the `{detail: "..."}` shape? */
export function hasDetail(body: unknown): body is { detail: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    "detail" in body &&
    typeof (body as { detail: unknown }).detail === "string"
  );
}

/** Narrowing helper: is this a DRF field-error map? */
export function isFieldErrors(body: unknown): body is FieldErrors {
  if (typeof body !== "object" || body === null) return false;
  return Object.values(body as Record<string, unknown>).every(
    (v) => Array.isArray(v) && v.every((s) => typeof s === "string"),
  );
}

/**
 * Flatten an error body into a map of `{ field: firstMessage }` for form display,
 * plus a `_form` bucket for non-field errors / detail messages.
 */
export interface FlatErrors {
  fields: Record<string, string>;
  form: string | null;
}

export function flattenErrors(body: unknown): FlatErrors {
  const out: FlatErrors = { fields: {}, form: null };
  if (body == null) return out;

  if (hasDetail(body)) {
    out.form = body.detail;
    return out;
  }

  if (isFieldErrors(body)) {
    for (const [key, msgs] of Object.entries(body)) {
      const first = msgs[0];
      if (!first) continue;
      if (key === "non_field_errors") {
        out.form = first;
      } else {
        out.fields[key] = first;
      }
    }
    return out;
  }

  if (typeof body === "string" && body.trim()) {
    out.form = body;
  }
  return out;
}
