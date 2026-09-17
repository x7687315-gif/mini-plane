"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Button, Card, MeasureLine, RoleBadge } from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import { useProjects } from "@/features/project";
import { useWorkspace } from "@/features/workspace";
import { canWrite } from "@/types/workspace";
import { ApiError } from "@/lib/api";

/**
 * Project list — see SCREEN_BLUEPRINTS §2.5.
 *
 * A table of every project in the workspace. All workspace members can see all
 * projects (MVP has no project-level visibility hiding).
 */
export default function ProjectsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const ws = useWorkspace(slug);
  const projects = useProjects(slug);
  const role = ws.data?.current_role;
  const list = projects.data?.results ?? [];

  return (
    <AppShell topbar={{ workspace: ws.data?.name, role }} rail={{ current: slug }} hideAside>
      <div className="flex items-end justify-between mb-2">
        <div>
          <h1 className="bp-display text-4xl text-[color:var(--color-ink)]">Projects</h1>
          <p className="font-serif italic text-[14px] text-[color:var(--color-ink-3)] mt-1 tracking-[0.04em]">
            In {ws.data?.name ?? "…"} · {projects.data?.count ?? 0} sheets
          </p>
        </div>
        {canWrite(role) && (
          <Link href={`/w/${slug}/projects/new`}>
            <Button variant="primary" size="sm">
              <PlusIcon size={12} />
              <span>new project</span>
            </Button>
          </Link>
        )}
      </div>

      <MeasureLine left="FIG · 01" right={`WS · ${slug.toUpperCase()} · ALL`} />

      {projects.isError && (
        <Card>
          <p className="text-[13px] text-[color:var(--color-ink-2)]">
            {projects.error instanceof ApiError && projects.error.status === 404
              ? "该工作区不存在，或你不在其中。"
              : "无法加载项目列表。"}
          </p>
        </Card>
      )}

      {projects.isLoading && (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 border border-[color:var(--color-rule)]" />
          ))}
        </div>
      )}

      {!projects.isLoading && list.length === 0 && !projects.isError && (
        <div className="border border-dashed border-[color:var(--color-rule)] px-6 py-16 text-center">
          <p className="font-serif italic text-[20px] text-[color:var(--color-ink-2)]">
            No projects in this workspace
          </p>
          <p className="text-[12px] text-[color:var(--color-ink-3)] mt-2">
            Each project gets 5 predefined states and a per-project issue counter.
          </p>
        </div>
      )}

      {list.length > 0 && (
        <div className="border-t border-[color:var(--color-rule)]">
          {/* header row */}
          <div className="grid grid-cols-[80px_1fr_120px_100px_40px] gap-4 py-2.5 px-2 text-[9px] uppercase tracking-[0.2em] text-[color:var(--color-ink-3)] font-sans font-medium border-b border-[color:var(--color-rule)]">
            <span>identifier</span>
            <span>name</span>
            <span>description</span>
            <span>your role</span>
            <span />
          </div>

          {list.map((p) => (
            <Link
              key={p.id}
              href={`/w/${slug}/projects/${p.id}`}
              className="grid grid-cols-[80px_1fr_120px_100px_40px] gap-4 py-3 px-2 items-center border-b border-dashed border-[color:var(--color-rule)] hover:bg-[rgba(31,63,168,0.035)] transition-colors group"
            >
              <span className="font-serif italic text-[15px] text-[color:var(--color-accent)] tracking-[0.04em]">
                {p.identifier}
              </span>
              <span className="font-serif italic text-[15px] text-[color:var(--color-ink)] truncate">
                {p.name}
              </span>
              <span className="text-[11px] text-[color:var(--color-ink-3)] truncate">
                {p.description || "—"}
              </span>
              <RoleBadge role={p.current_user_role} size="xs" />
              <span className="text-right text-[color:var(--color-accent)] opacity-0 group-hover:opacity-100 transition-opacity">
                &rarr;
              </span>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}