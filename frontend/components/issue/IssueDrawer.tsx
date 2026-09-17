"use client";

import { useMemo, useState } from "react";
import { Avatar, Drawer, EditableField, LabelTag, MeasureLine, Button } from "@/components/ui";
import { useDeleteIssue, useIssue, useLabels, useUpdateIssue } from "@/features/issue";
import { useProjectMembers } from "@/features/project";
import { ApiError } from "@/lib/api";
import { flattenErrors } from "@/types/auth";
import { formatDateTime, formatDistanceToNow } from "@/lib/time";
import { PRIORITY_VALUES, type IssuePriority } from "@/types/issue";
import type { IssueState } from "@/types/project";
import { canWrite } from "@/types/workspace";
import { useAuthStore } from "@/stores/auth";

/**
 * IssueDrawer — see SCREEN_BLUEPRINTS §2.9.
 *
 * Opened via `?issue=<id>`; the URL is owned by the list page, this component
 * only renders and mutates.
 *
 * Every metadata field is an <EditableField> that fires an optimistic PATCH:
 * the drawer re-renders instantly from the patched cache, and React Query
 * reconciles with the server response afterwards.
 *
 * Assignee candidates come from PROJECT members (not workspace members) —
 * backend rule: only ProjectMembers can be assigned (docs/api/04-issues.md).
 */

export interface IssueDrawerProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  projectId: string;
  identifier: string;
  issueId: string | null;
  states: IssueState[];
  /** Effective role of the current user in this project (from Project.current_user_role). */
  role: number | null | undefined;
}

const PRIORITY_COLOR: Record<IssuePriority, string> = {
  none: "var(--color-none)",
  urgent: "var(--color-urgent)",
  high: "var(--color-high)",
  medium: "var(--color-medium)",
  low: "var(--color-low)",
};

export function IssueDrawer({
  open,
  onClose,
  slug,
  projectId,
  identifier,
  issueId,
  states,
  role,
}: IssueDrawerProps) {
  const writable = canWrite(role);
  const me = useAuthStore((s) => s.user);

  const issueQuery = useIssue(slug, projectId, issueId ?? undefined);
  const labelsQuery = useLabels(slug, projectId);
  const membersQuery = useProjectMembers(slug, projectId);

  const updateMutation = useUpdateIssue(slug, projectId);
  const deleteMutation = useDeleteIssue(slug, projectId);

  const [actionError, setActionError] = useState<string | null>(null);
  const issue = issueQuery.data;

  const stateOptions = useMemo(
    () => states.map((s) => ({ value: s.id, label: s.name, color: s.color })),
    [states],
  );

  const assigneeOptions = useMemo(
    () =>
      (membersQuery.data?.results ?? []).map((m) => ({
        value: m.user.id,
        label: m.user.username,
        leading: <Avatar name={m.user.username} size="xs" />,
      })),
    [membersQuery.data],
  );

  const priorityOptions = useMemo(
    () =>
      PRIORITY_VALUES.map((p) => ({
        value: p,
        label: p,
        color: p === "none" ? "transparent" : PRIORITY_COLOR[p],
      })),
    [],
  );

  const labelOptions = useMemo(
    () =>
      (labelsQuery.data?.results ?? []).map((l) => ({
        value: l.id,
        label: l.name,
        color: l.color,
      })),
    [labelsQuery.data],
  );

  const runUpdate = async (
    payload: Parameters<typeof updateMutation.mutateAsync>[0]["payload"],
    optimistic: Parameters<typeof updateMutation.mutateAsync>[0]["optimistic"],
  ) => {
    if (!issue) return;
    setActionError(null);
    try {
      await updateMutation.mutateAsync({ issueId: issue.id, payload, optimistic });
    } catch (e) {
      setActionError(
        e instanceof ApiError
          ? (flattenErrors(e.body).form ?? `更新失败（HTTP ${e.status}）`)
          : "网络异常，请稍后重试。",
      );
    }
  };

  const handleDelete = async () => {
    if (!issue) return;
    if (!confirm(`删除 ${identifier}-${issue.sequence_id}？此操作不可撤销。`)) return;
    setActionError(null);
    try {
      await deleteMutation.mutateAsync(issue.id);
      onClose();
    } catch (e) {
      setActionError(
        e instanceof ApiError ? `删除失败（HTTP ${e.status}）` : "网络异常。",
      );
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={660}
      crumb={
        <>
          {identifier} / WORK ITEM &middot;{" "}
          <b className="not-italic font-serif italic text-[13px] text-[color:var(--color-ink)] tracking-[0.04em] normal-case">
            {issue ? `${identifier}-${issue.sequence_id}` : "…"}
          </b>{" "}
          &middot; OPENED IN DRAWER
        </>
      }
    >
      <div className="px-8 py-6">
        {issueQuery.isLoading && <DrawerSkeleton />}

        {issueQuery.isError && (
          <div className="border border-[color:var(--color-urgent)] px-3 py-2">
            <p className="text-[11px] text-[color:var(--color-urgent)]">
              {issueQuery.error instanceof ApiError && issueQuery.error.status === 404
                ? "该 Issue 不存在，或你无权查看。"
                : "无法加载 Issue。"}
            </p>
          </div>
        )}

        {issue && (
          <>
            <div className="font-serif italic text-[14px] tracking-[0.05em] text-[color:var(--color-accent)] mb-1.5">
              {identifier}-{issue.sequence_id}
            </div>

            <h2 className="font-serif text-[28px] font-medium leading-[1.18] text-[color:var(--color-ink)] mb-5">
              {issue.title}
            </h2>

            {actionError && (
              <div className="mb-4 border border-[color:var(--color-urgent)] px-3 py-2">
                <p className="text-[11px] text-[color:var(--color-urgent)]">{actionError}</p>
              </div>
            )}

            {!writable && (
              <p className="mb-4 text-[11px] text-[color:var(--color-ink-3)] italic font-serif">
                You have read-only access to this project — fields below are not editable.
              </p>
            )}

            {/* editable metadata */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <EditableField
                label="State"
                value={issue.state.id}
                options={stateOptions}
                disabled={!writable}
                onSelect={(v) => {
                  const next = states.find((s) => s.id === v);
                  if (next) runUpdate({ state_id: next.id }, { state: next });
                }}
              />

              <EditableField
                label="Priority"
                value={issue.priority}
                options={priorityOptions}
                disabled={!writable}
                onSelect={(v) => {
                  const p = (v ?? "none") as IssuePriority;
                  runUpdate({ priority: p }, { priority: p });
                }}
              />

              <EditableField
                label="Assignee"
                value={issue.assignee?.id ?? null}
                options={assigneeOptions}
                clearable
                clearLabel="Unassigned"
                disabled={!writable}
                placeholder="unassigned"
                onSelect={(v) => {
                  const member = (membersQuery.data?.results ?? []).find(
                    (m) => m.user.id === v,
                  );
                  runUpdate(
                    { assignee_id: v },
                    { assignee: member ? member.user : null },
                  );
                }}
              />

              <EditableField
                label="Add label"
                value={null}
                options={labelOptions.filter(
                  (o) => !issue.labels.some((l) => l.id === o.value),
                )}
                disabled={!writable || labelOptions.length === 0}
                placeholder={labelOptions.length ? "attach a label" : "no labels yet"}
                onSelect={(v) => {
                  if (!v) return;
                  const label = (labelsQuery.data?.results ?? []).find((l) => l.id === v);
                  if (!label) return;
                  runUpdate(
                    { label_ids: [...issue.labels.map((l) => l.id), label.id] },
                    { labels: [...issue.labels, label] },
                  );
                }}
              />
            </div>

            {/* current labels (removable) */}
            {issue.labels.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-6">
                {issue.labels.map((l) => (
                  <span key={l.id} className="inline-flex items-center gap-1">
                    <LabelTag name={l.name} color={l.color} />
                    {writable && (
                      <button
                        type="button"
                        onClick={() =>
                          runUpdate(
                            { label_ids: issue.labels.filter((x) => x.id !== l.id).map((x) => x.id) },
                            { labels: issue.labels.filter((x) => x.id !== l.id) },
                          )
                        }
                        className="text-[10px] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-urgent)]"
                        aria-label={`remove label ${l.name}`}
                      >
                        &times;
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            <MeasureLine left="DESCRIPTION" right="MARKDOWN · PLAIN" />

            <div className="text-[12px] leading-relaxed text-[color:var(--color-ink)] whitespace-pre-wrap mb-8">
              {issue.description?.trim() || (
                <span className="italic font-serif text-[color:var(--color-ink-3)]">
                  No description yet.
                </span>
              )}
            </div>

            <MeasureLine left="FIG · META" right="READ-ONLY" />

            <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-[11px] mb-8">
              <dt className="uppercase tracking-[0.2em] text-[color:var(--color-ink-3)] font-sans font-medium">
                created by
              </dt>
              <dd className="flex items-center gap-2">
                <Avatar name={issue.created_by?.username} size="xs" />
                <span className="text-[color:var(--color-ink)]">
                  {issue.created_by?.username ?? "—"}
                </span>
              </dd>

              <dt className="uppercase tracking-[0.2em] text-[color:var(--color-ink-3)] font-sans font-medium">
                created
              </dt>
              <dd className="text-[color:var(--color-ink-2)]">{formatDateTime(issue.created_at)}</dd>

              <dt className="uppercase tracking-[0.2em] text-[color:var(--color-ink-3)] font-sans font-medium">
                updated
              </dt>
              <dd className="text-[color:var(--color-ink-2)]">
                {formatDateTime(issue.updated_at)}{" "}
                <span className="text-[color:var(--color-ink-3)]">
                  ({formatDistanceToNow(issue.updated_at)} ago)
                </span>
              </dd>

              <dt className="uppercase tracking-[0.2em] text-[color:var(--color-ink-3)] font-sans font-medium">
                issue id
              </dt>
              <dd className="font-mono text-[10px] text-[color:var(--color-ink-3)] break-all">
                {issue.id}
              </dd>
            </dl>

            {writable && (
              <div className="pt-4 border-t border-[color:var(--color-rule)] flex items-center justify-between">
                <span className="text-[10px] text-[color:var(--color-ink-3)] italic font-serif">
                  Comments &amp; activity arrive in Sprint 4.
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className="border-[color:var(--color-urgent)] text-[color:var(--color-urgent)]"
                >
                  {deleteMutation.isPending ? "deleting…" : "delete issue"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}

function DrawerSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="h-4 w-20 bg-[color:var(--color-paper-2)] mb-3" />
      <div className="h-8 w-3/4 bg-[color:var(--color-paper-2)] mb-6" />
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-[color:var(--color-paper-2)]" />
        ))}
      </div>
      <div className="h-24 bg-[color:var(--color-paper-2)]" />
    </div>
  );
}