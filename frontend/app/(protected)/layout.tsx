import type { ReactNode } from "react";
import { AuthGuard } from "@/features/auth";

/**
 * Protected layout — every page under `(protected)/` requires a valid session.
 *
 * Route group `(protected)` does not affect URLs: `(protected)/page.tsx` still
 * serves `/`, and `(protected)/me/page.tsx` serves `/me`.
 *
 * AuthGuard handles:
 * - skeleton while /auth/me is in flight
 * - redirect to /login?redirect=… on 401
 * - error surface when the backend is unreachable
 */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}