import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { LoginAlt, LoginForm } from "@/features/auth/components/LoginForm";

export const metadata: Metadata = {
  title: "Sign in · Mini Plane",
};

/**
 * /login — see SCREEN_BLUEPRINTS §2.1.
 *
 * The form uses `useSearchParams()` to read `?redirect=`, which requires a
 * Suspense boundary in the App Router (otherwise the whole page opts out of
 * static rendering and Next.js raises a build error).
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
      <Suspense fallback={<AuthFormSkeleton />}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}

function AuthFormSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      <div className="h-9 border-b border-[color:var(--color-rule)]" />
      <div className="h-9 border-b border-[color:var(--color-rule)]" />
      <div className="h-12 bg-[color:var(--color-paper-2)]" />
    </div>
  );
}