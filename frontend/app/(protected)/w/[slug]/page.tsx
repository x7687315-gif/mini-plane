"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar, Button, Card, MeasureLine, RoleBadge } from "@/components/ui";
import { ArrowRightIcon, PlusIcon, SettingsIcon, UserIcon } from "@/components/icons";
import { useWorkspace, useWorkspaceMembers } from "@/features/workspace";
import { useProjects } from "@/features/project";
import { ROLE, isAdmin } from "@/types/workspace";
import { ApiError } from "@/lib/api";

/**
 * Workspace detail — see SCREEN_BLUEPRINTS §2.4.
 *
 * Shows recent projects, a members strip, and role-gated actions.
 * A WS Admin (role 20) sees settings + member management; others don't.
 */
export default function WorkspacePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const ws = useWorkspace(slug);
  const members = useWorkspaceMembers(slug);
  const projects = useProjects(slug);

  const role = ws.data?.current_role;
  const admin = isAdmin(role);
  const recent = (projects.data?.results ?? []).slice(0, 6);
  const memberList = members.data?.results ?? [];

  return (
    <AppShell
      topbar={{ workspace: ws.data?.name, role }}
      rail={{ current: slug }}
      hideAside
    >
      <div className="flex items-end justify-between mb-2">
        <div>
          <h1 className="bp-display text-4xl text-[color:var(--color-ink)]">
            {ws.isLoading ? "…" : (ws.data?.name ?? "Workspace")}
          </h1>
          <p className="font-serif italic text-[14px] text-[color:var(--color-ink-3)] mt-1 tracking-[0.04em]">
            {ws.data ? (
              <>
                You are{" "}
                <span className="text-[color:var(--color-accent)]">
                  {role === ROLE.ADMIN ? "Admin" : role === ROLE.MEMBER ? "Member" : "Viewer"}
                </span>{" "}
                · {projects.data?.count ?? 0} projects · {members.data?.count ?? 0} members
              </>
            ) : (
              "loading…"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/w/${slug}/projects`}>
            <Button variant="secondary" size="sm">
              all projects
            </Button>
          </Link>
          {admin && (
            <>
              <Link href={`/w/${slug}/members`}>
                <Button variant="secondary" size="sm">
                  <UserIcon size={12} />
                  <span>members</span>
                </Button>
              </Link>
              <Link href={`/w/${slug}/settings`}>
                <Button variant="secondary" size="sm">
                  <SettingsIcon size={12} />
                  <span>settings</span>
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      <MeasureLine left="FIG · 01" right={`WS · ${slug.toUpperCase()}`} />

      {ws.isError && (
        <Card>
          <p className="text-[13px] text-[color:var(--color-ink-2)]">
            {ws.error instanceof ApiError && ws.error.status === 404
              ? "该工作区不存在，或你不在其中（后端按防枚举语义返回 404）。"
              : "无法加载工作区。"}
          </p>
        </Card>
      )}

      {/* Recent projects */}
      <div className="mb-8">
        <h2 className="font-serif italic text-[22px] text-[color:var(--color-ink)] mb-3">
          Recent projects
        </h2>

        {projects.isLoading && <ProjectSkeleton />}

        {!projects.isLoading && recent.length === 0 && (
          <div className="border border-dashed border-[color:var(--color-rule)] px-6 py-10 text-center">
            <p className="font-serif italic text-[16px] text-[color:var(--color-ink-2)]">
              No projects yet
            </p>
            <p className="text-[12px] text-[color:var(--color-ink-3)] mt-1">
              Create one to get 5 predefined states (Backlog → Cancelled) automatically.
            </p>
            <div className="mt-5">
              <Link href={`/w/${slug}/projects/new`}>
                <Button variant="primary" size="sm">
                  <PlusIcon size={12} />
                  <span>new project</span>
                </Button>
              </Link>
            </div>
          </div>
        )}

        {recent.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {recent.map((p) => (
              <Link key={p.id} href={`/w/${slug}/projects/${p.id}`} className="block group">
                <div className="relative border border-[color:var(--color-rule)] p-4 h-full group-hover:border-[color:var(--color-ink-2)] transition-colors">
                  <span
                    className="absolute left-0 top-0 bottom-0 w-[2px] bg-transparent group-hover:bg-[color:var(--color-accent)] transition-colors"
                    aria-hidden
                  />
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-serif italic text-[14px] tracking-[0.05em] text-[color:var(--color-accent)]">
                      {p.identifier}
                    </span>
                    <RoleBadge role={p.current_user_role} size="xs" />
                  </div>
                  <div className="font-serif italic text-[19px] leading-tight text-[color:var(--color-ink)]">
                    {p.name}
                  </div>
                  <div className="text-[11px] text-[color:var(--color-ink-3)] mt-1 line-clamp-2">
                    {p.description || "—"}
                  </div>
                  <div className="mt-3 pt-2 border-t border-dashed border-[color:var(--color-rule)] flex justify-end">
                    <span className="text-[color:var(--color-accent)] opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRightIcon size={13} />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Members strip */}
      <div>
        <h2 className="font-serif italic text-[22px] text-[color:var(--color-ink)] mb-3">
          Members · {members.data?.count ?? 0}
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
          {memberList.map((m) => (
            <span key={m.id} className="flex items-center gap-2">
              <Avatar name={m.user.username} size="sm" />
              <span className="text-[12px] text-[color:var(--color-ink-2)]">
                {m.user.username}
              </span>
              <RoleBadge role={m.role} size="xs" bare />
            </span>
          ))}
          {memberList.length === 0 && !members.isLoading && (
            <span className="text-[12px] text-[color:var(--color-ink-3)] italic font-serif">
              no members loaded
            </span>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function ProjectSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="border border-[color:var(--color-rule)] p-4 h-[124px]">
          <div className="h-4 w-16 bg-[color:var(--color-paper-2)] mb-3" />
          <div className="h-5 w-32 bg-[color:var(--color-paper-2)]" />
        </div>
      ))}
    </div>
  );
}