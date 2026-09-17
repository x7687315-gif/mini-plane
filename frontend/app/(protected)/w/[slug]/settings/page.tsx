"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppShell } from "@/components/shell/AppShell";
import { Button, Card, Field, Input, MeasureLine, Modal } from "@/components/ui";
import { useDeleteWorkspace, useUpdateWorkspace, useWorkspace } from "@/features/workspace";
import { ApiError } from "@/lib/api";
import { flattenErrors } from "@/types/auth";
import { isAdmin } from "@/types/workspace";

/**
 * Workspace settings — see SCREEN_BLUEPRINTS §2.12.
 *
 * Admin-only. Two zones:
 * - General: rename / change slug
 * - Danger: delete the workspace (cascades to all projects / members / issues)
 *
 * Deleting requires typing the workspace slug to confirm (destructive + irreversible).
 */

const schema = z.object({
  name: z.string().min(1, "请输入工作区名称"),
  slug: z
    .string()
    .min(2, "至少 2 位")
    .regex(/^[a-z0-9-]{2,32}$/, "只能是小写字母、数字和连字符"),
});

type FormValues = z.infer<typeof schema>;

export default function WorkspaceSettingsPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug ?? "";

  const ws = useWorkspace(slug);
  const updateMutation = useUpdateWorkspace(slug);
  const deleteMutation = useDeleteWorkspace();

  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);

  const admin = isAdmin(ws.data?.current_role);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", slug: "" },
  });

  // Seed the form once the workspace loads.
  useEffect(() => {
    if (ws.data) reset({ name: ws.data.name, slug: ws.data.slug });
  }, [ws.data, reset]);

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    setSaved(false);
    setServerFields({});
    try {
      await updateMutation.mutateAsync(values);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
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

  if (!admin && !ws.isLoading) {
    return (
      <AppShell topbar={{ workspace: ws.data?.name, role: ws.data?.current_role }} rail={{ current: slug }} hideAside>
        <h1 className="bp-display text-4xl text-[color:var(--color-ink)]">Settings</h1>
        <MeasureLine left="FIG · 01" right="ACCESS · DENIED" />
        <Card>
          <p className="text-[13px] text-[color:var(--color-ink-2)]">
            只有工作区 Admin 可以访问设置页。你当前的角色是{" "}
            {ws.data?.current_role}。
          </p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell topbar={{ workspace: ws.data?.name, role: ws.data?.current_role }} rail={{ current: slug }} hideAside>
      <div className="mb-2">
        <h1 className="bp-display text-4xl text-[color:var(--color-ink)]">Settings</h1>
        <p className="font-serif italic text-[14px] text-[color:var(--color-ink-3)] mt-1 tracking-[0.04em]">
          {ws.data?.name ?? "…"} · admin only
        </p>
      </div>

      <MeasureLine left="FIG · 01" right="WS · CONFIGURATION" />

      <div className="max-w-2xl space-y-5">
        <Card>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <h2 className="font-serif italic text-[20px] text-[color:var(--color-ink)] mb-4">
              General
            </h2>

            {formError && (
              <div className="mb-4 border border-[color:var(--color-urgent)] px-3 py-2">
                <p className="text-[11px] text-[color:var(--color-urgent)]">{formError}</p>
              </div>
            )}
            {saved && (
              <div className="mb-4 border border-[color:var(--color-success)] px-3 py-2">
                <p className="text-[11px] text-[color:var(--color-success)]">已保存。</p>
              </div>
            )}

            <Field label="Name" htmlFor="s-name" error={errors.name?.message ?? serverFields.name}>
              <Input id="s-name" {...register("name")} />
            </Field>

            <Field
              label="Slug"
              htmlFor="s-slug"
              hint="⚠ 改了 slug 会改变所有 URL（/w/&lt;slug&gt;/…），旧链接会失效"
              error={errors.slug?.message ?? serverFields.slug}
            >
              <Input id="s-slug" className="font-mono" {...register("slug")} />
            </Field>

            <div className="flex items-center gap-3 mt-2">
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? "saving…" : "save changes"}
              </Button>
              <span className="text-[10px] text-[color:var(--color-ink-3)]">
                owner: <span className="font-mono">{ws.data?.owner?.slice(0, 8) ?? "—"}…</span>
              </span>
            </div>
          </form>
        </Card>

        <Card className="border-[color:var(--color-urgent)]">
          <h2 className="font-serif italic text-[20px] text-[color:var(--color-urgent)] mb-2">
            Danger zone
          </h2>
          <p className="text-[12px] text-[color:var(--color-ink-2)] mb-4">
            Deleting this workspace <b>cascades</b> to every project, member, state and issue
            inside it. There is no soft delete and no undo (BACKEND_PLAN §D7).
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="border-[color:var(--color-urgent)] text-[color:var(--color-urgent)]"
            onClick={() => setDeleteOpen(true)}
          >
            delete this workspace
          </Button>
        </Card>
      </div>

      {/* Mounted only while open: the confirmation's `typed` state then starts
          fresh on every open without a "reset on close" effect. */}
      {deleteOpen && (
        <DeleteWorkspaceModal
          open
          onClose={() => setDeleteOpen(false)}
          slug={slug}
          onConfirm={async () => {
            try {
              await deleteMutation.mutateAsync(slug);
              router.replace("/");
            } catch {
              setDeleteOpen(false);
            }
          }}
          pending={deleteMutation.isPending}
        />
      )}
    </AppShell>
  );
}

function DeleteWorkspaceModal({
  open,
  onClose,
  slug,
  onConfirm,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  onConfirm: () => void;
  pending: boolean;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed === slug;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete workspace"
      subtitle="this cannot be undone"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            cancel
          </Button>
          <Button
            variant="primary"
            disabled={!matches || pending}
            onClick={onConfirm}
            className="bg-[color:var(--color-urgent)] border-[color:var(--color-urgent)]"
          >
            {pending ? "deleting…" : "delete forever"}
          </Button>
        </>
      }
    >
      <p className="text-[12px] text-[color:var(--color-ink-2)] mb-4">
        输入工作区 slug{" "}
        <code className="font-mono px-1 py-0.5 border border-[color:var(--color-rule)]">
          {slug}
        </code>{" "}
        以确认删除：
      </p>
      <Input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={slug}
        autoFocus
        className="font-mono"
      />
    </Modal>
  );
}