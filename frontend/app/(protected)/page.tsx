"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppShell } from "@/components/shell/AppShell";
import { Button, Card, MeasureLine, Modal, RoleBadge, Field, Input } from "@/components/ui";
import { PlusIcon, ArrowRightIcon } from "@/components/icons";
import { useCreateWorkspace, useWorkspaces } from "@/features/workspace";
import { ApiError } from "@/lib/api";
import { flattenErrors } from "@/types/auth";
import { ROLE, type Workspace } from "@/types/workspace";

/**
 * Workspace Dashboard — see SCREEN_BLUEPRINTS §2.3.
 *
 * GET /api/v1/workspaces/ returns only the workspaces the current user is a member of
 * (backend contract). Each item carries `current_role`, so no extra requests are needed
 * to render the role chip.
 */

const createSchema = z.object({
  name: z.string().min(1, "请输入工作区名称"),
  slug: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^[a-z0-9-]{2,32}$/.test(v),
      "只能是小写字母、数字和连字符（2-32 位）",
    ),
});

type CreateValues = z.infer<typeof createSchema>;

export default function WorkspacesPage() {
  const { data, isLoading, isError, error } = useWorkspaces();
  const [createOpen, setCreateOpen] = useState(false);

  const workspaces = data?.results ?? [];

  return (
    <AppShell topbar={{}} hideAside={workspaces.length === 0}>
      <div className="flex items-end justify-between mb-2">
        <div>
          <h1 className="bp-display text-4xl text-[color:var(--color-ink)]">Workspaces</h1>
          <p className="font-serif italic text-[14px] text-[color:var(--color-ink-3)] mt-1 tracking-[0.04em]">
            {isLoading
              ? "loading the archive…"
              : `A list of every place you keep work · ${String(workspaces.length).padStart(2, "0")} sheets`}
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
          <PlusIcon size={12} />
          <span>new workspace</span>
        </Button>
      </div>

      <MeasureLine left="FIG · 01" right="MEMBERSHIP · SCOPED" />

      {isLoading && <WorkspaceSkeleton />}

      {isError && (
        <Card>
          <p className="text-[13px] text-[color:var(--color-ink-2)]">
            无法加载工作区列表
            {error instanceof ApiError ? `（HTTP ${error.status}）` : ""}。请确认后端已启动。
          </p>
        </Card>
      )}

      {!isLoading && !isError && workspaces.length === 0 && (
        <EmptyWorkspaces onCreate={() => setCreateOpen(true)} />
      )}

      {workspaces.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {workspaces.map((w) => (
            <WorkspaceCard key={w.id} workspace={w} />
          ))}
        </div>
      )}

      <CreateWorkspaceModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </AppShell>
  );
}

function WorkspaceCard({ workspace }: { workspace: Workspace }) {
  return (
    <Link href={`/w/${workspace.slug}`} className="block group">
      <div className="relative border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] p-5 h-full transition-colors duration-[var(--duration-fast)] group-hover:border-[color:var(--color-ink-2)]">
        <span
          className="absolute left-0 top-0 bottom-0 w-[2px] bg-transparent group-hover:bg-[color:var(--color-accent)] transition-colors"
          aria-hidden
        />
        <div className="flex items-start justify-between gap-3 mb-4">
          <span
            className="w-11 h-11 inline-flex items-center justify-center border border-[color:var(--color-rule)] font-serif italic text-[22px] text-[color:var(--color-ink-2)]"
            aria-hidden
          >
            {workspace.name.charAt(0).toUpperCase()}
          </span>
          <RoleBadge role={workspace.current_role} />
        </div>

        <div className="font-serif italic text-[22px] leading-tight text-[color:var(--color-ink)]">
          {workspace.name}
        </div>
        <div className="font-mono text-[10px] text-[color:var(--color-ink-3)] mt-1">
          /w/{workspace.slug}
        </div>

        <div className="mt-4 pt-3 border-t border-dashed border-[color:var(--color-rule)] flex items-center justify-between">
          <span className="text-[9px] uppercase tracking-[0.2em] text-[color:var(--color-ink-3)] font-sans font-medium">
            role {workspace.current_role}
          </span>
          <span className="text-[color:var(--color-accent)] opacity-0 group-hover:opacity-100 transition-opacity">
            <ArrowRightIcon size={14} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function EmptyWorkspaces({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-px w-12 bg-[color:var(--color-rule)]" />
        <span className="bp-hint">fig &middot; empty</span>
        <div className="h-px w-12 bg-[color:var(--color-rule)]" />
      </div>
      <h2 className="font-serif italic text-[28px] text-[color:var(--color-ink)]">
        No workspace yet
      </h2>
      <p className="mt-2 text-[13px] text-[color:var(--color-ink-2)] max-w-md">
        A workspace is a shelf for your projects. Create one to begin — you will be its admin.
      </p>
      <div className="mt-8">
        <Button variant="primary" onClick={onCreate}>
          <PlusIcon size={12} />
          <span>create your first workspace</span>
        </Button>
      </div>
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="border border-[color:var(--color-rule)] p-5 h-[178px]">
          <div className="w-11 h-11 bg-[color:var(--color-paper-2)] mb-4" />
          <div className="h-5 w-32 bg-[color:var(--color-paper-2)] mb-2" />
          <div className="h-3 w-24 bg-[color:var(--color-paper-2)]" />
        </div>
      ))}
    </div>
  );
}

/* ---------------- create modal ---------------- */

function CreateWorkspaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createMutation = useCreateWorkspace();
  const [formError, setFormError] = useState<string | null>(null);
  const [serverFields, setServerFields] = useState<Record<string, string>>({});

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", slug: "" },
  });

  const close = () => {
    reset();
    setFormError(null);
    setServerFields({});
    onClose();
  };

  const onSubmit = async (values: CreateValues) => {
    setFormError(null);
    setServerFields({});
    try {
      await createMutation.mutateAsync({
        name: values.name,
        slug: values.slug || undefined,
      });
      close();
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
      title="New workspace"
      subtitle="a shelf for your projects"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
            {isSubmitting ? "creating…" : "create"}
          </Button>
        </>
      }
    >
      {formError && (
        <div className="mb-4 border border-[color:var(--color-urgent)] px-3 py-2">
          <p className="text-[11px] text-[color:var(--color-urgent)]">{formError}</p>
        </div>
      )}

      <Field label="Name" htmlFor="ws-name" error={errors.name?.message ?? serverFields.name}>
        <Input id="ws-name" placeholder="Amiya Workspace" autoFocus {...register("name")} />
      </Field>

      <Field
        label="Slug"
        htmlFor="ws-slug"
        hint="留空自动生成；冲突时自动追加 -2 / -3 后缀"
        error={errors.slug?.message ?? serverFields.slug}
      >
        <Input id="ws-slug" placeholder="amiya-ws" {...register("slug")} />
      </Field>

      <p className="text-[10px] text-[color:var(--color-ink-3)] italic font-serif">
        You will be added as{" "}
        <b className="not-italic font-sans font-medium">ADMIN</b> automatically (role{" "}
        {ROLE.ADMIN}).
      </p>
    </Modal>
  );
}