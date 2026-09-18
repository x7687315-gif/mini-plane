"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Avatar, Button, EditableField, Field, Input, Modal, Textarea } from "@/components/ui";
import { useCreateIssue } from "@/features/issue";
import { useProjectMembers } from "@/features/project";
import { ApiError } from "@/lib/api";
import { flattenErrors } from "@/types/auth";
import { PRIORITY_VALUES, type IssuePriority } from "@/types/issue";
import type { IssueState } from "@/types/project";

/**
 * CreateIssueModal — see SCREEN_BLUEPRINTS §2.8.
 *
 * Only `title` is required. Everything else is optional and falls back to
 * backend defaults (state → the project's Backlog state, priority → none,
 * assignee → unassigned).
 *
 * Assignee candidates = PROJECT members only (backend rule).
 */

const schema = z.object({
  title: z.string().min(1, "请输入标题"),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const PRIORITY_COLOR: Record<IssuePriority, string> = {
  none: "transparent",
  urgent: "var(--color-urgent)",
  high: "var(--color-high)",
  medium: "var(--color-medium)",
  low: "var(--color-low)",
};

export interface CreateIssueModalProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  projectId: string;
  states: IssueState[];
  /** Called with the new issue id so the list can open its drawer. */
  onCreated?: (issueId: string) => void;
}

export function CreateIssueModal({
  open,
  onClose,
  slug,
  projectId,
  states,
  onCreated,
}: CreateIssueModalProps) {
  const createMutation = useCreateIssue(slug, projectId);
  const membersQuery = useProjectMembers(slug, projectId);

  const [formError, setFormError] = useState<string | null>(null);
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const [stateId, setStateId] = useState<string | null>(null);
  const [priority, setPriority] = useState<IssuePriority>("none");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", description: "" },
  });

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

  const close = () => {
    reset();
    setFormError(null);
    setServerFields({});
    setStateId(null);
    setPriority("none");
    setAssigneeId(null);
    onClose();
  };

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    setServerFields({});
    try {
      const issue = await createMutation.mutateAsync({
        title: values.title,
        description: values.description || undefined,
        state_id: stateId ?? undefined,
        priority,
        assignee_id: assigneeId,
      });
      close();
      onCreated?.(issue.id);
    } catch (e) {
      if (e instanceof ApiError) {
        const flat = flattenErrors(e.body);
        setServerFields(flat.fields);
        setFormError(flat.form);
        return;
      }
      setFormError("网络异常，请稍后重试。");
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="New issue"
      subtitle={`a new entry in ${projectId ? "this project" : "the archive"}`}
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            取消
          </Button>
          <Button variant="primary" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
            {isSubmitting ? "创建中…" : "创建任务"}
          </Button>
        </>
      }
    >
      {formError && (
        <div className="mb-4 border border-[color:var(--color-urgent)] px-3 py-2">
          <p className="text-[11px] text-[color:var(--color-urgent)]">{formError}</p>
        </div>
      )}

      <Field label="标题" htmlFor="i-title" error={errors.title?.message ?? serverFields.title}>
        <Input id="i-title" placeholder="一句话说清问题" autoFocus {...register("title")} />
      </Field>

      <Field
        label="描述"
        htmlFor="i-desc"
        error={errors.description?.message ?? serverFields.description}
      >
        <Textarea id="i-desc" rows={3} placeholder="复现步骤 / 期望行为…" {...register("description")} />
      </Field>

      <div className="grid grid-cols-3 gap-3 mt-2">
        <EditableField
          label="State"
          value={stateId}
          options={stateOptions}
          placeholder="Backlog"
          onSelect={setStateId}
        />

        <EditableField
          label="Priority"
          value={priority}
          options={PRIORITY_VALUES.map((p) => ({
            value: p,
            label: p,
            color: PRIORITY_COLOR[p],
          }))}
          onSelect={(v) => setPriority((v ?? "none") as IssuePriority)}
        />

        <EditableField
          label="Assignee"
          value={assigneeId}
          options={assigneeOptions}
          clearable
          clearLabel="Unassigned"
          placeholder="unassigned"
          onSelect={setAssigneeId}
        />
      </div>

      <p className="mt-4 text-[10px] text-[color:var(--color-ink-3)] italic font-serif">
        The number is assigned by the server &middot; only project members can be assigned.
      </p>
    </Modal>
  );
}