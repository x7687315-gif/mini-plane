"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar, Button, Field, Input, MeasureLine, Modal, RoleBadge } from "@/components/ui";
import { PlusIcon, XIcon } from "@/components/icons";
import {
  useAddWorkspaceMember,
  useRemoveWorkspaceMember,
  useUpdateWorkspaceMemberRole,
  useWorkspace,
  useWorkspaceMembers,
} from "@/features/workspace";
import { useAuthStore } from "@/stores/auth";
import { ApiError } from "@/lib/api";
import { flattenErrors } from "@/types/auth";
import { ROLE, isAdmin } from "@/types/workspace";

/**
 * Workspace members — see SCREEN_BLUEPRINTS §2.13.
 *
 * Admin-only mutations (add / change role / remove). Non-admins can still view.
 * Backend guards: cannot change owner's role, cannot remove owner or the last admin.
 */

const addSchema = z.object({
  email: z.string().min(1, "请输入邮箱").email("邮箱格式不正确"),
  role: z.coerce.number().int(),
});

type AddValues = z.infer<typeof addSchema>;

export default function WorkspaceMembersPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const ws = useWorkspace(slug);
  const members = useWorkspaceMembers(slug);
  const me = useAuthStore((s) => s.user);
  const admin = isAdmin(ws.data?.current_role);

  const [addOpen, setAddOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const removeMutation = useRemoveWorkspaceMember(slug);
  const roleMutation = useUpdateWorkspaceMemberRole(slug);

  const list = members.data?.results ?? [];
  const ownerId = ws.data?.owner;

  const handleRemove = async (memberId: string, username: string) => {
    if (!confirm(`确定要移除成员 ${username} 吗？此操作不可撤销。`)) return;
    setActionError(null);
    try {
      await removeMutation.mutateAsync(memberId);
    } catch (e) {
      setActionError(
        e instanceof ApiError
          ? (flattenErrors(e.body).form ?? "移除失败。")
          : "网络异常。",
      );
    }
  };

  const handleRoleChange = async (memberId: string, role: number) => {
    setActionError(null);
    try {
      await roleMutation.mutateAsync({ memberId, payload: { role } });
    } catch (e) {
      setActionError(
        e instanceof ApiError ? (flattenErrors(e.body).form ?? "修改失败。") : "网络异常。",
      );
    }
  };

  return (
    <AppShell
      topbar={{ workspace: ws.data?.name, role: ws.data?.current_role }}
      rail={{ current: slug }}
      hideAside
    >
      <div className="flex items-end justify-between mb-2">
        <div>
          <h1 className="bp-display text-4xl text-[color:var(--color-ink)]">Members</h1>
          <p className="font-serif italic text-[14px] text-[color:var(--color-ink-3)] mt-1 tracking-[0.04em]">
            {ws.data?.name ?? "…"} · {members.data?.count ?? 0} people
          </p>
        </div>
        {admin && (
          <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
            <PlusIcon size={12} />
            <span>add member</span>
          </Button>
        )}
      </div>

      <MeasureLine left="FIG · 01" right="WS · ACCESS CONTROL" />

      {actionError && (
        <div className="mb-4 border border-[color:var(--color-urgent)] px-3 py-2">
          <p className="text-[11px] text-[color:var(--color-urgent)]">{actionError}</p>
        </div>
      )}

      {members.isLoading && (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 border border-[color:var(--color-rule)]" />
          ))}
        </div>
      )}

      {list.length > 0 && (
        <div className="border-t border-[color:var(--color-rule)]">
          <div className="grid grid-cols-[40px_1fr_140px_1fr_40px] gap-4 py-2.5 px-2 text-[9px] uppercase tracking-[0.2em] text-[color:var(--color-ink-3)] font-sans font-medium border-b border-[color:var(--color-rule)]">
            <span />
            <span>member</span>
            <span>role</span>
            <span>joined</span>
            <span />
          </div>

          {list.map((m) => {
            const isOwner = m.user.id === ownerId;
            const isMe = m.user.id === me?.id;
            return (
              <div
                key={m.id}
                className="grid grid-cols-[40px_1fr_140px_1fr_40px] gap-4 py-3 px-2 items-center border-b border-dashed border-[color:var(--color-rule)]"
              >
                <Avatar name={m.user.username} size="sm" />
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-[13px] text-[color:var(--color-ink)] truncate">
                    {m.user.username}
                  </span>
                  {isMe && (
                    <span className="text-[9px] uppercase tracking-[0.18em] text-[color:var(--color-ink-3)] font-sans font-medium">
                      you
                    </span>
                  )}
                  {isOwner && (
                    <span className="text-[9px] uppercase tracking-[0.18em] text-[color:var(--color-accent)] font-sans font-medium">
                      owner
                    </span>
                  )}
                </span>

                <span>
                  {admin && !isOwner ? (
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.id, Number(e.target.value))}
                      disabled={roleMutation.isPending}
                      className="bg-transparent border border-[color:var(--color-rule)] px-1.5 py-1 text-[10px] uppercase tracking-[0.14em] font-sans font-medium text-[color:var(--color-ink-2)] outline-none focus:border-[color:var(--color-accent)]"
                    >
                      <option value={ROLE.ADMIN}>Admin</option>
                      <option value={ROLE.MEMBER}>Member</option>
                      <option value={ROLE.VIEWER}>Viewer</option>
                    </select>
                  ) : (
                    <RoleBadge role={m.role} size="xs" />
                  )}
                </span>

                <span className="text-[11px] text-[color:var(--color-ink-3)]">
                  {new Date(m.created_at).toLocaleDateString()}
                </span>

                <span className="text-right">
                  {admin && !isOwner && (
                    <button
                      type="button"
                      onClick={() => handleRemove(m.id, m.user.username)}
                      disabled={removeMutation.isPending}
                      className="text-[color:var(--color-ink-3)] hover:text-[color:var(--color-urgent)] disabled:opacity-40"
                      aria-label={`remove ${m.user.username}`}
                    >
                      <XIcon size={14} />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!admin && !members.isLoading && (
        <p className="mt-4 text-[11px] text-[color:var(--color-ink-3)] italic font-serif">
          You need Admin rights to add or remove members. You can still see the list.
        </p>
      )}

      <AddMemberModal slug={slug} open={addOpen} onClose={() => setAddOpen(false)} />
    </AppShell>
  );
}

function AddMemberModal({
  slug,
  open,
  onClose,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
}) {
  const addMutation = useAddWorkspaceMember(slug);
  const [formError, setFormError] = useState<string | null>(null);
  const [serverFields, setServerFields] = useState<Record<string, string>>({});

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddValues>({
    resolver: zodResolver(addSchema),
    defaultValues: { email: "", role: ROLE.MEMBER },
  });

  const close = () => {
    reset();
    setFormError(null);
    setServerFields({});
    onClose();
  };

  const onSubmit = async (values: AddValues) => {
    setFormError(null);
    setServerFields({});
    try {
      await addMutation.mutateAsync({ email: values.email, role: values.role });
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
      title="Add member"
      subtitle="the email must already be registered"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
            {isSubmitting ? "adding…" : "add"}
          </Button>
        </>
      }
    >
      {formError && (
        <div className="mb-4 border border-[color:var(--color-urgent)] px-3 py-2">
          <p className="text-[11px] text-[color:var(--color-urgent)]">{formError}</p>
        </div>
      )}

      <Field label="Email" htmlFor="m-email" error={errors.email?.message ?? serverFields.email}>
        <Input
          id="m-email"
          type="email"
          placeholder="amiya@example.com"
          autoFocus
          {...register("email")}
        />
      </Field>

      <Field label="Role" htmlFor="m-role" error={serverFields.role}>
        <select
          id="m-role"
          {...register("role")}
          className="w-full bg-transparent border border-[color:var(--color-rule)] px-2.5 py-1.5 text-[12px] text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-accent)]"
        >
          <option value={ROLE.ADMIN}>Admin · 20 · 管理成员与工作区设置</option>
          <option value={ROLE.MEMBER}>Member · 15 · 创建项目、参与协作</option>
          <option value={ROLE.VIEWER}>Viewer · 5 · 只读</option>
        </select>
      </Field>
    </Modal>
  );
}