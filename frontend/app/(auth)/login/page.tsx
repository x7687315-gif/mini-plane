import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { LoginAlt, LoginForm } from "@/features/auth/components/LoginForm";

export const metadata: Metadata = {
  title: "登录 · Mini Plane",
};

/**
 * /login — see SCREEN_BLUEPRINTS §2.1.
 *
 * No Suspense boundary needed: the form reads `?redirect=` via
 * `useRedirectTarget()` (an effect on window.location) instead of
 * `useSearchParams()`, so the real form is server-rendered — no skeleton flash.
 */
export default function LoginPage() {
  return (
    <AuthCard
      sheet="01"
      title="Sign in"
      subtitle={
        <>
          Welcome back &middot;{" "}
          <em className="font-serif italic text-[color:var(--color-ink-3)]">
            between user and system
          </em>
        </>
      }
      alt={<LoginAlt />}
    >
      <LoginForm />
    </AuthCard>
  );
}