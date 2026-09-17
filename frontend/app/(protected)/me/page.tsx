"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar, Button, Card, CardBody, CardHeader, MeasureLine } from "@/components/ui";
import { useLogout } from "@/features/auth/hooks";
import { useAuthStore } from "@/stores/auth";

/**
 * /me — see SCREEN_BLUEPRINTS §2.14.
 *
 * Read-only for now: the backend has no PATCH /auth/me/ endpoint (see
 * docs/api/01-auth.md — only GET is defined). Profile editing is a phase-2 item.
 */
export default function MePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logoutMutation = useLogout();

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      router.replace("/login");
    }
  };

  return (
    <AppShell
      topbar={{ workspace: "Amiya Workspace", project: "Amiya Project", role: 20 }}
      hideAside
    >
      <h1 className="bp-display text-4xl text-[color:var(--color-ink)]">My settings</h1>
      <p className="font-serif italic text-[14px] text-[color:var(--color-ink-3)] mt-1 tracking-[0.04em]">
        SHEET 12 &middot; the only sheet that is entirely yours
      </p>

      <MeasureLine left="FIG · 01" right="IDENTITY · READ-ONLY" />

      <Card className="max-w-2xl mb-6">
        <CardHeader>Identity</CardHeader>
        <CardBody>
          <div className="flex items-start gap-5 mb-6">
            <Avatar name={user?.username} size="lg" tone="accent" />
            <div>
              <div className="font-serif italic text-[24px] text-[color:var(--color-ink)] leading-tight">
                {user?.username ?? "—"}
              </div>
              <div className="text-[12px] text-[color:var(--color-ink-2)] mt-0.5">
                {user?.email ?? "—"}
              </div>
              <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-ink-3)] font-sans font-medium">
                avatar upload &middot; phase 2
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-[140px_1fr] gap-y-3 text-[12px]">
            <dt className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-ink-3)] font-sans font-medium self-center">
              username
            </dt>
            <dd className="text-[color:var(--color-ink)]">{user?.username ?? "—"}</dd>

            <dt className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-ink-3)] font-sans font-medium self-center">
              email
            </dt>
            <dd className="text-[color:var(--color-ink)]">{user?.email ?? "—"}</dd>

            <dt className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-ink-3)] font-sans font-medium self-center">
              user id
            </dt>
            <dd className="font-mono text-[11px] text-[color:var(--color-ink-2)] break-all">
              {user?.id ?? "—"}
            </dd>

            <dt className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-ink-3)] font-sans font-medium self-center">
              joined
            </dt>
            <dd className="text-[color:var(--color-ink-2)]">
              {user?.created_at ? new Date(user.created_at).toLocaleString() : "—"}
            </dd>
          </dl>
        </CardBody>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>Session</CardHeader>
        <CardBody>
          <p className="text-[12px] text-[color:var(--color-ink-2)] mb-4">
            Signing out destroys the server-side session and clears every cached query.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
          >
            {logoutMutation.isPending ? "signing out…" : "sign out"}
          </Button>
        </CardBody>
      </Card>
    </AppShell>
  );
}