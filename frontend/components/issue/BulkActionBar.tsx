"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Avatar, Button, EditableField, Modal, MultiSelect } from "@/components/ui";
import { XIcon } from "@/components/icons";
import {
  useBulkDeleteIssues,
  useBulkSetLabels,
  useBulkUpdateIssues,
} from "@/features/issue";
import { useTaskRun, describeTaskStatus } from "@/features/task";
import { isTerminalTaskRun } from "@/types/task";
import { ApiError } from "@/lib/api";
import { toast } from "@/stores/toast";
import { PRIORITY_VALUES, type IssuePriority, type Label } from "@/types/issue";
import type { IssueState, ProjectMember } from "@/types/project";

/**
 * BulkActionBar — Sprint 6, see FRONTEND_ROADMAP §Sprint 6.
 *
 * Floats over the bottom of the list while rows are selected. Every control is a
 * **direct** action (no "Apply" for anything except labels — see below), matching the
 * "filter chip 立即触发" convention the rest of the app uses.
 *
 * Three contract facts shape this component:
 *
 * 1. **Only labels has a server-side batch endpoint** (07 契约 §2.1) and it is
 *    *asynchronous* (202 + TaskRun → poll). State / priority / assignee go through N
 *    sequential PATCHes; delete through N sequential DELETEs. Both paths are honest
 *    about partial failure ("3/5 成功") instead of reporting a false binary.
 * 2. **The label endpoint is overwriting, not additive.** "Add label X" is not
 *    expressible when the selected issues start with different label sets, so the
 *    control says so out loud and offers an explicit apply instead of firing one
 *    request per checkbox click.
 * 3. **A batch is not atomic.** After any operation we refetch, so the screen shows
 *    what the server actually holds rather than what we hoped.
 */

export interface BulkActionBarProps {
  slug: string;
  projectId: string;
  identifier: string;
  selectedIds: string[];
  states: IssueState[];
  labels: Label[];
  members: ProjectMember[];
  onClearSelection: () => void;
}

export function BulkActionBar({
  slug,
  projectId,
  identifier,
  selectedIds,
  states,
  labels,
  members,
  onClearSelection,
}: BulkActionBarProps) {
  const count = selectedIds.length;

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [labelDraft, setLabelDraft] = useState<string[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setLabels = useBulkSetLabels(slug, projectId);
  const updateIssues = useBulkUpdateIssues(slug, projectId);
  const deleteIssues = useBulkDeleteIssues(slug, projectId);

  const taskQuery = useTaskRun(slug, projectId, taskId);
  const run = taskQuery.data;

  const busy =
    setLabels.isPending || updateIssues.isPending || deleteIssues.isPending;

  // Report the async job's outcome exactly once per run. A ref (not state) keeps this
  // out of the setState-in-effect trap: the effect only talks to an external system
  // (the toast queue) and to the parent.
  const reportedRunRef = useRef<string | null>(null);
  useEffect(() => {
    if (!run || !isTerminalTaskRun(run.status)) return;
    if (reportedRunRef.current === run.id) return;
    reportedRunRef.current = run.id;

    if (run.status === "success") {
      const r = run.result;
      toast.success(
        r
          ? `批量改标签完成 · ${r.issues} 个任务中 ${r.changed} 个发生了变化 · 目标标签 ${r.labels} 个`
          : "批量改标签完成。",
      );
      onClearSelection();
    } else {
      toast.error(run.error || "批量改标签失败。");
    }
  }, [run, onClearSelection]);

  const stateOptions = useMemo(
    () => states.map((s) => ({ value: s.id, label: s.name, color: s.color })),
    [states],
  );

  const priorityOptions = useMemo(
    () =>
      PRIORITY_VALUES.map((p) => ({
        value: p,
        label: p,
      })),
    [],
  );

  const memberOptions = useMemo(
    () =>
      members.map((m) => ({
        value: m.user.id,
        label: m.user.username,
        leading: <Avatar name={m.user.username} size="xs" />,
      })),
    [members],
  );

  const labelOptions = useMemo(
    () => labels.map((l) => ({ value: l.id, label: l.name, color: l.color })),
    [labels],
  );

  /* ---------------- 批量执行（含"只重试失败的那些"） ---------------- */

  /**
   * 一次批量操作的完整描述。
   *
   * 记住这个是为了**重试**：失败时不能只丢一句提示就完事 ——
   * 用户看到"2 个失败"却不知道是哪两条，只能回列表里猜（Sprint 6 留下的那笔账）。
   * 把操作本身和失败的 id 都留着，就能给一个"retry failed"，把没做完的事做完。
   */
  type BulkOp =
    | {
        kind: "field";
        payload: Parameters<typeof updateIssues.mutateAsync>[0]["payload"];
        optimistic: Parameters<typeof updateIssues.mutateAsync>[0]["optimistic"];
        /** 完成文案前缀，如「已把状态改为 Done」。 */
        verb: string;
      }
    | { kind: "delete" };

  const [retry, setRetry] = useState<{ ids: string[]; op: BulkOp } | null>(null);

  const execute = async (op: BulkOp, ids: string[]) => {
    if (ids.length === 0) return;
    const label = op.kind === "delete" ? "删除" : op.verb;
    setProgress({ done: 0, total: ids.length });
    try {
      const onProgress = (done: number, total: number) => setProgress({ done, total });
      const outcome =
        op.kind === "delete"
          ? await deleteIssues.mutateAsync({ issueIds: ids, onProgress })
          : await updateIssues.mutateAsync({
              issueIds: ids,
              payload: op.payload,
              optimistic: op.optimistic,
              onProgress,
            });

      if (outcome.failed > 0) {
        // 部分失败：不静默、不夸大，把「还差哪几条」留在界面上
        setRetry({ ids: outcome.failedIds, op });
        toast.error(
          `${label} ${outcome.ok}/${ids.length} 成功 · ${outcome.failed} 个失败` +
            `（首个原因：${outcome.firstError ?? "未知"}）· 可点「retry failed」只重试这些`,
        );
        return;
      }

      setRetry(null);
      toast.success(
        op.kind === "delete" ? `已删除 ${outcome.ok} 个任务` : `${label} · ${outcome.ok} 个任务`,
      );
      onClearSelection();
    } catch (e) {
      toast.error(e instanceof ApiError ? `批量操作失败（HTTP ${e.status}）` : "网络异常。");
    } finally {
      setProgress(null);
    }
  };

  const handleSetState = (stateId: string) => {
    const next = states.find((s) => s.id === stateId);
    if (!next) return;
    void execute(
      { kind: "field", payload: { state_id: next.id }, optimistic: { state: next }, verb: `已把状态改为 ${next.name}` },
      selectedIds,
    );
  };

  const handleSetPriority = (priority: IssuePriority) => {
    void execute(
      { kind: "field", payload: { priority }, optimistic: { priority }, verb: `已把优先级改为 ${priority}` },
      selectedIds,
    );
  };

  const handleSetAssignee = (userId: string | null) => {
    const member = members.find((m) => m.user.id === userId);
    void execute(
      {
        kind: "field",
        payload: { assignee_id: userId },
        optimistic: { assignee: member ? member.user : null },
        verb: userId ? `已指派给 ${member?.user.username ?? "成员"}` : "已清空指派人",
      },
      selectedIds,
    );
  };

  const handleDelete = () => {
    setConfirmDelete(false);
    void execute({ kind: "delete" }, selectedIds);
  };

  /* ---------------- async label batch (202 + TaskRun) ---------------- */

  const handleApplyLabels = async () => {
    try {
      const created = await setLabels.mutateAsync({
        issueIds: selectedIds,
        labelIds: labelDraft,
      });
      setTaskId(created.id);
      toast.info("批量改标签已受理，正在处理…");
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        toast.error("批量改标签被拒绝：任务数上限 200、标签数上限 50。");
      } else {
        toast.error(e instanceof ApiError ? `受理失败（HTTP ${e.status}）` : "网络异常。");
      }
    }
  };

  /* ---------------- render ---------------- */

  const labelConfirmationPending = taskId != null && run != null && !isTerminalTaskRun(run.status);

  return (
    <>
      <div
        className={clsx(
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-40",
          "bg-[color:var(--color-paper)] border border-[color:var(--color-rule)]",
          "shadow-[0_18px_40px_-24px_rgba(27,26,23,0.4)]",
          "px-4 py-3 flex flex-wrap items-end gap-3 max-w-[min(1000px,92vw)]",
        )}
        role="toolbar"
        aria-label="bulk actions"
      >
        <span className="flex items-center gap-2 pr-3 mr-1 border-r border-[color:var(--color-rule)] self-stretch">
          <span className="font-serif italic text-[22px] text-[color:var(--color-accent)] leading-none">
            {String(count).padStart(2, "0")}
          </span>
          <span className="bp-hint leading-tight">
            selected
            <br />
            {identifier}
          </span>
          <button
            type="button"
            onClick={onClearSelection}
            className="ml-1 text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
            aria-label="clear selection"
          >
            <XIcon size={12} />
          </button>
        </span>

        <EditableField
          label="state"
          className="w-[150px]"
          value={null}
          options={stateOptions}
          disabled={busy}
          placeholder="set state…"
          onSelect={(v) => v && handleSetState(v)}
        />

        <EditableField
          label="priority"
          className="w-[140px]"
          value={null}
          options={priorityOptions}
          disabled={busy}
          placeholder="set priority…"
          onSelect={(v) => v && handleSetPriority(v as IssuePriority)}
        />

        <EditableField
          label="assignee"
          className="w-[160px]"
          value={null}
          options={memberOptions}
          clearable
          clearLabel="unassign all"
          disabled={busy}
          placeholder="assign to…"
          onSelect={(v) => handleSetAssignee(v)}
        />

        {/* Labels are the one control that needs an explicit apply: the endpoint
            replaces the whole set, so firing per click would issue N partial batches. */}
        <span className="flex items-end gap-2">
          <MultiSelect
            label="labels (replace)"
            className="w-[190px]"
            values={labelDraft}
            options={labelOptions}
            onToggle={(v) =>
              setLabelDraft((prev) =>
                prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
              )
            }
            onClear={() => setLabelDraft([])}
            disabled={busy || labelConfirmationPending}
            placeholder="choose the new set…"
          />
          <Button
            variant="primary"
            size="sm"
            className="mb-0.5"
            disabled={busy || !count}
            onClick={() => void handleApplyLabels()}
          >
            apply
          </Button>
        </span>

        <span className="ml-auto flex items-center gap-3 self-center">
          {progress && (
            <span className="bp-hint tabular-nums">
              {progress.done}/{progress.total}
            </span>
          )}

          {/* 部分失败时的出路：只重试失败的那几条（Sprint 6 留下的账） */}
          {retry && !progress && (
            <span className="flex items-center gap-2">
              <span className="bp-hint text-[color:var(--color-urgent)]">
                {retry.ids.length} failed
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void execute(retry.op, retry.ids)}
              >
                retry failed
              </Button>
            </span>
          )}
          {labelConfirmationPending && (
            <span className="bp-hint">{describeTaskStatus(run)}</span>
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            className="border-[color:var(--color-urgent)] text-[color:var(--color-urgent)]"
          >
            delete
          </Button>
        </span>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${count} issue${count === 1 ? "" : "s"}?`}
        subtitle={`${identifier} · this cannot be undone`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleDelete()}
              className="border-[color:var(--color-urgent)] text-[color:var(--color-urgent)]"
            >
              delete {count}
            </Button>
          </>
        }
      >
        <p className="text-[12px] text-[color:var(--color-ink-2)] leading-relaxed">
          每个 Issue 的评论与活动记录会一并消失，编号不会被回收。
          删除是逐个下发的，所以可能出现「删了一半」；真的发生时会给出「retry failed」
          只重试没删掉的那几条。完成后列表会按服务端的真实状态刷新。
        </p>
      </Modal>
    </>
  );
}
