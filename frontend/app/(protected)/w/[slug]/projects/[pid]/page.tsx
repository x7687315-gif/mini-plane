"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Button, Card, MeasureLine } from "@/components/ui";
import { PlusIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { FilterBar } from "@/components/issue/FilterBar";
import { IssueRow } from "@/components/issue/IssueRow";
import { normalizeDrawerTab, type IssueDrawerTab } from "@/components/issue/IssueDrawer";
import { BulkActionBar } from "@/components/issue/BulkActionBar";
import dynamic from "next/dynamic";
import { useIssueFilters, useIssues, useLabels } from "@/features/issue";
import { useProject, useProjectMembers, useProjectStates } from "@/features/project";
import { useProjectRealtime } from "@/features/realtime";
import { useWorkspace } from "@/features/workspace";
import { ApiError } from "@/lib/api";
import { hasActiveFilters } from "@/lib/url";
import { flattenErrors } from "@/types/auth";
import { canWrite } from "@/types/workspace";
import { serializeIssueQuery, type Issue } from "@/types/issue";

/**
 * 代码分割（2026-09-18，为 Lighthouse 而从报告数据倒推出来的）。
 *
 * 这两个组件的依赖很重但**首屏不需要**：
 * - `CreateIssueModal` 用了 react-hook-form + zod + @hookform/resolvers（约 24KB gzip），
 *   但它在用户点「new issue」之前永远不会渲染；
 * - `IssueDrawer` 拖着整个评论/活动/侧拉逻辑，只有 `?issue=` 存在时才需要。
 *
 * 静态 import 会把它们无条件算进列表页的首屏 bundle。Lighthouse 报告显示
 * 主线程 2.8s 里 **Script Evaluation 占 1235ms** —— 这是当时最大的一块。
 *
 * 注意 `ssr` 的选择：
 * - 弹窗 `ssr: false`（它只在客户端交互后出现，SSR 出来也没用）；
 * - 抽屉**保留 SSR**：分享出去的 `?issue=<id>` 链接仍要能直出抽屉内容，
 *   而按需加载的 **客户端** chunk 依然被拆出去了，两边都拿到。
 */
const CreateIssueModal = dynamic(
  () => import("@/components/issue/CreateIssueModal").then((m) => m.CreateIssueModal),
  { ssr: false },
);

const IssueDrawer = dynamic(
  () => import("@/components/issue/IssueDrawer").then((m) => m.IssueDrawer),
);

/**
 * Project issue list — the core screen. See SCREEN_BLUEPRINTS §2.7.
 *
 * URL owns three pieces of state:
 * - filters + ordering + page  → `useIssueFilters()`
 * - open drawer                → `?issue=<id>`
 *
 * A <Suspense> wrapper is required because both `useIssueFilters()` and this
 * page read `useSearchParams()`.
 */
export default function ProjectIssuesPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ProjectIssues />
    </Suspense>
  );
}

function ProjectIssues() {
  const params = useParams<{ slug: string; pid: string }>();
  const slug = params?.slug ?? "";
  const projectId = params?.pid ?? "";

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openIssueId = searchParams.get("issue");
  // `?tab=` lives next to `?issue=`: the tab strip is part of the drawer's address,
  // so "look at the thread of AMI-7" is a shareable link rather than lost UI state.
  const tab = normalizeDrawerTab(searchParams.get("tab"));

  const { query, patch, clear } = useIssueFilters();

  const ws = useWorkspace(slug);
  const project = useProject(slug, projectId);
  const statesQuery = useProjectStates(slug, projectId);
  const labelsQuery = useLabels(slug, projectId);
  const membersQuery = useProjectMembers(slug, projectId);
  const issuesQuery = useIssues(slug, projectId, query);

  /**
   * Realtime (Sprint 7): connect while this project is on screen.
   *
   * Gated on `!project.isError` on purpose. If the project itself 404s, the page has
   * already explained that; opening a socket would only earn a 4404 close and overwrite
   * a correct message with a redundant one. 4404 still happens for real when access is
   * revoked mid-session, which is the case it exists for.
   */
  useProjectRealtime(slug, projectId, Boolean(slug && projectId) && !project.isError);

  const [createOpen, setCreateOpen] = useState(false);

  /**
   * Row selection for batch operations (Sprint 6).
   *
   * Deliberately NOT in the URL: a selection is ephemeral like a text selection, and
   * putting 30 uuids in the address bar would make every shared link unusable.
   *
   * It is also **scoped to the current query** — the stored `key` is the serialized
   * filter string, and any change to the filters discards the selection (derived
   * during render, no effect). Otherwise "3 selected" could quietly refer to rows the
   * user can no longer see, and a batch delete would hit them.
   */
  const queryKey = serializeIssueQuery(query);
  const [selection, setSelection] = useState<{ key: string; ids: string[] }>({
    key: queryKey,
    ids: [],
  });
  const selectedIds = selection.key === queryKey ? selection.ids : [];
  const setSelectedIds = useCallback(
    (ids: string[]) => setSelection({ key: queryKey, ids }),
    [queryKey],
  );

  const toggleSelect = useCallback(
    (id: string) => {
      const current = selection.key === queryKey ? selection.ids : [];
      setSelection({
        key: queryKey,
        ids: current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
      });
    },
    [selection, queryKey],
  );

  const states = statesQuery.data?.results ?? [];
  const labels = labelsQuery.data?.results ?? [];
  const members = membersQuery.data?.results ?? [];
  const issues: Issue[] = issuesQuery.data?.results ?? [];
  const total = issuesQuery.data?.count ?? 0;
  const role = project.data?.current_user_role;
  const identifier = project.data?.identifier ?? "ISS";
  const canCreate = canWrite(role);

  /**
   * A 400 here means the URL carried a value the backend rejects (illegal
   * `ordering`, a malformed `priority`, a non-integer `page`). The UI cannot
   * produce one — this only fires for hand-edited or stale links — so instead of a
   * generic failure we surface the backend's own field-level message
   * (04 契约 §参数校验文案) and offer the way out: clear the filters.
   */
  const badParam = issuesQuery.error instanceof ApiError && issuesQuery.error.status === 400
    ? flattenErrors(issuesQuery.error.body).fields
    : null;

  const perPage = 50;
  const page = query.page ?? 1;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  /** Write `?issue=<id>` without touching the filter params. */
  const setOpenIssue = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (id) {
        next.set("issue", id);
      } else {
        next.delete("issue");
      }
      // Never carry a tab across issues: opening AMI-9 must not land on the tab
      // you happened to leave AMI-7 on.
      next.delete("tab");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  /** Switch the drawer's tab. `activity` is the default, so it leaves no trace. */
  const setTab = useCallback(
    (next: IssueDrawerTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "activity") params.delete("tab");
      else params.set("tab", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const headerSubtitle = useMemo(() => {
    if (project.isLoading) return "loading…";
    if (!project.data) return "—";
    return `${project.data.name} · ${total} issues · ${states.length} states`;
  }, [project.isLoading, project.data, total, states.length]);

  return (
    <AppShell
      topbar={{
        workspace: ws.data?.name,
        project: project.data ? `${project.data.name} · ${identifier}` : undefined,
        role: ws.data?.current_role,
      }}
      rail={{ current: slug }}
      hideAside
    >
      <div className="flex items-end justify-between mb-2">
        <div>
          <h1 className="bp-display text-4xl text-[color:var(--color-ink)]">
            {project.isLoading ? "…" : (project.data?.name ?? "Issues")}
          </h1>
          <p className="font-serif italic text-[14px] text-[color:var(--color-ink-3)] mt-1 tracking-[0.04em]">
            {headerSubtitle}
          </p>
        </div>
        {canCreate && (
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <PlusIcon size={12} />
            <span>new issue</span>
          </Button>
        )}
      </div>

      <MeasureLine
        left={`PROJ · ${identifier}`}
        right={`${total} ITEMS · PAGE ${page}/${totalPages}`}
      />

      {project.isError && (
        <Card className="mb-5">
          <p className="text-[13px] text-[color:var(--color-ink-2)]">
            {project.error instanceof ApiError && project.error.status === 404
              ? "该项目不存在，或你不在其中（后端按防枚举语义返回 404）。"
              : "无法加载项目。"}
          </p>
        </Card>
      )}

      {!project.isError && (
        <FilterBar
          query={query}
          states={states}
          labels={labels}
          members={members}
          total={total}
          onPatch={patch}
          onClear={clear}
        />
      )}

      {/* list */}
      {issuesQuery.isLoading && <ListSkeleton />}

      {issuesQuery.isError && (
        <Card>
          {badParam ? (
            <>
              <p className="text-[12px] text-[color:var(--color-ink)] mb-1">
                链接里的筛选参数不合法（后端返回 400）：
              </p>
              <ul className="mb-3 space-y-0.5">
                {Object.entries(badParam).map(([field, message]) => (
                  <li key={field} className="text-[11px] text-[color:var(--color-urgent)]">
                    <code className="font-mono text-[10px] text-[color:var(--color-ink-2)]">
                      {field}
                    </code>{" "}
                    {message}
                  </li>
                ))}
              </ul>
              <Button variant="secondary" size="sm" onClick={clear}>
                clear filters
              </Button>
            </>
          ) : (
            <p className="text-[13px] text-[color:var(--color-ink-2)]">
              无法加载 Issue 列表。
            </p>
          )}
        </Card>
      )}

      {!issuesQuery.isLoading && !issuesQuery.isError && issues.length === 0 && (
        <EmptyIssues
          filtered={hasActiveFilters(query)}
          canCreate={canCreate}
          onCreate={() => setCreateOpen(true)}
          onClear={clear}
        />
      )}

      {issues.length > 0 && (
        <>
          <div className="border-t border-[color:var(--color-rule)]">
            {issues.map((it) => (
              <IssueRow
                key={it.id}
                issue={it}
                identifier={identifier}
                selected={it.id === openIssueId}
                onOpen={(id) => setOpenIssue(id)}
                checked={selectedIds.includes(it.id)}
                onToggleSelect={canCreate ? toggleSelect : undefined}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-5">
              <span className="text-[9px] uppercase tracking-[0.24em] text-[color:var(--color-ink-3)] font-sans font-medium">
                showing {issues.length} of {total}
              </span>
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => patch({ page: page - 1 })}
                  className="flex items-center gap-1 text-[9px] uppercase tracking-[0.2em] font-sans font-medium text-[color:var(--color-ink-2)] hover:text-[color:var(--color-ink)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeftIcon size={11} />
                  prev
                </button>
                <span className="text-[10px] font-serif italic text-[color:var(--color-ink-3)]">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => patch({ page: page + 1 })}
                  className="flex items-center gap-1 text-[9px] uppercase tracking-[0.2em] font-sans font-medium text-[color:var(--color-ink-2)] hover:text-[color:var(--color-ink)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  next
                  <ChevronRightIcon size={11} />
                </button>
              </span>
            </div>
          )}
        </>
      )}

      {/* create */}
      <CreateIssueModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        slug={slug}
        projectId={projectId}
        states={states}
        onCreated={(id) => setOpenIssue(id)}
      />

      {/* detail drawer */}
      <IssueDrawer
        open={Boolean(openIssueId)}
        onClose={() => setOpenIssue(null)}
        slug={slug}
        projectId={projectId}
        identifier={identifier}
        issueId={openIssueId}
        states={states}
        role={role}
        tab={tab}
        onTabChange={setTab}
      />

      {/* batch operations — viewers never see the checkboxes, so never this bar */}
      {canCreate && selectedIds.length > 0 && (
        <BulkActionBar
          slug={slug}
          projectId={projectId}
          identifier={identifier}
          selectedIds={selectedIds}
          states={states}
          labels={labels}
          members={members}
          onClearSelection={() => setSelectedIds([])}
        />
      )}
    </AppShell>
  );
}

function EmptyIssues({
  filtered,
  canCreate,
  onCreate,
  onClear,
}: {
  filtered: boolean;
  canCreate: boolean;
  onCreate: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex items-center gap-3 mb-5">
        <div className="h-px w-12 bg-[color:var(--color-rule)]" />
        <span className="bp-hint">{filtered ? "fig · no match" : "fig · empty"}</span>
        <div className="h-px w-12 bg-[color:var(--color-rule)]" />
      </div>
      <h2 className="font-serif italic text-[24px] text-[color:var(--color-ink)]">
        {filtered ? "Nothing matches these filters" : "No issues yet"}
      </h2>
      <p className="mt-2 text-[12px] text-[color:var(--color-ink-2)] max-w-md">
        {filtered
          ? "The query returned an empty page. Try widening the filters or clearing them."
          : "Create the first issue — it will get a project-scoped number automatically."}
      </p>
      <div className="mt-6 flex items-center gap-3">
        {filtered && (
          <Button variant="secondary" onClick={onClear}>
            clear filters
          </Button>
        )}
        {!filtered && canCreate && (
          <Button variant="primary" onClick={onCreate}>
            <PlusIcon size={12} />
            <span>new issue</span>
          </Button>
        )}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-0" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="grid grid-cols-[78px_1fr_auto_auto_auto] gap-3.5 items-center py-3 pr-2 border-b border-dashed border-[color:var(--color-rule)]"
        >
          <div className="h-4 w-14 bg-[color:var(--color-paper-2)]" />
          <div>
            <div className="h-3.5 w-2/3 bg-[color:var(--color-paper-2)] mb-2" />
            <div className="h-2.5 w-1/3 bg-[color:var(--color-paper-2)]" />
          </div>
          <div className="h-5 w-14 bg-[color:var(--color-paper-2)]" />
          <div className="h-2.5 w-2.5 bg-[color:var(--color-paper-2)]" />
          <div className="h-6 w-6 rounded-full bg-[color:var(--color-paper-2)]" />
        </div>
      ))}
    </div>
  );
}