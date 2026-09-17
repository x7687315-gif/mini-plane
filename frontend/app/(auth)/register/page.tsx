import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { RegisterAlt, RegisterForm } from "@/features/auth/components/RegisterForm";

export const metadata: Metadata = {
  title: "Register · Mini Plane",
};

/**
 * /register — see SCREEN_BLUEPRINTS §2.2.
 *
 * Same shell as /login with one extra field (email).
 * Registering signs the user in immediately (backend returns 201 + session cookie).
 */
export default function RegisterPage() {
  return (
    <AuthCard
      sheet="02"
      title="Create account"
      subtitle={
        <>
          A new sheet in the archive &middot;{" "}
          <em className="font-serif italic text-[color:var(--color-ink-3)]">
            one identity is enough
          </em>
        </>
      }
      alt={<RegisterAlt />}
    >
      <Suspense fallback={<AuthFormSkeleton />}>
        <RegisterForm />
      </Suspense>
    </AuthCard>
  );
}

function AuthFormSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      <div className="h-9 border-b border-[color:var(--color-rule)]" />
      <div className="h-9 border-b border-[color:var(--color-rule)]" />
      <div className="h-9 border-b border-[color:var(--color-rule)]" />
      <div className="h-12 bg-[color:var(--color-paper-2)]" />
    </div>
  );
}