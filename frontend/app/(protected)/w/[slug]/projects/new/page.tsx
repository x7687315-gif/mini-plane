"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppShell } from "@/components/shell/AppShell";
import { Button, Card, Field, Input, MeasureLine, Textarea } from "@/components/ui";
import { useCreateProject } from "@/features/project";
import { useWorkspace } from "@/features/workspace";
import { ApiError } from "@/lib/api";
import { flattenErrors } from "@/types/auth";

/**
 * Create project — see SCREEN_BLUEPRINTS §2.6.
 *
 * Rendered as a full page (rather than a modal) to keep the first-run flow
 * simple: /w/:slug/projects/new is a static segment and wins over [pid].
 *
 * Backend behaviour on 201 (docs/api/03-projects.md):
 * - creator becomes project ADMIN
 * - 5 default states are created automatically (Backlog → Cancelled)
 */

const schema = z.object({
  name: z.string().min(1, "请输入项目名称"),
  identifier: z
    .string()
    .regex(/^[A-Z][A-Z0-9]{1,4}$/, "2-5 位大写字母数字，以字母开头（如 AMI）"),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function NewProjectPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug ?? "";

  const ws = useWorkspace(slug);
  const createMutation = useCreateProject(slug);
  const [formError, setFormError] = useState<string | null>(null);
  const [serverFields, setServerFields] = useState<Record<string, string>>({});

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", identifier: "", description: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    setServerFields({});
    try {
      const project = await createMutation.mutateAsync({
        name: values.name,
        identifier: values.identifier.toUpperCase(),
        description: values.description || undefined,
      });
      router.replace(`/w/${slug}/projects/${project.id}`);
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
    <AppShell topbar={{ workspace: ws.data?.name, role: ws.data?.current_role }} rail={{ current: slug }} hideAside>
      <div className="mb-2">
        <h1 className="bp-display text-4xl text-[color:var(--color-ink)]">New project</h1>
        <p className="font-serif italic text-[14px] text-[color:var(--color-ink-3)] mt-1 tracking-[0.04em]">
          In {ws.data?.name ?? "…"} · a new sheet in the archive
        </p>
      </div>

      <MeasureLine left="FIG · 01" right="PROJECT · DRAFT" />

      <div className="max-w-2xl">
        <Card>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            {formError && (
              <div className="mb-4 border border-[color:var(--color-urgent)] px-3 py-2">
                <p className="text-[11px] text-[color:var(--color-urgent)]">{formError}</p>
              </div>
            )}

            <Field
              label="Name"
              htmlFor="p-name"
              error={errors.name?.message ?? serverFields.name}
            >
              <Input id="p-name" placeholder="Amiya Project" autoFocus {...register("name")} />
            </Field>

            <Field
              label="Identifier"
              htmlFor="p-identifier"
              hint="用于 Issue 前缀，如 AMI-1、AMI-2；同一工作区内唯一"
              error={errors.identifier?.message ?? serverFields.identifier}
            >
              <Input
                id="p-identifier"
                placeholder="AMI"
                maxLength={5}
                className="uppercase tracking-[0.2em] font-serif italic text-[15px]"
                {...register("identifier")}
              />
            </Field>

            <Field
              label="Description"
              htmlFor="p-description"
              error={errors.description?.message ?? serverFields.description}
            >
              <Textarea
                id="p-description"
                placeholder="这个项目要解决什么问题？"
                rows={4}
                {...register("description")}
              />
            </Field>

            <div className="flex items-center gap-3 mt-6 pt-4 border-t border-[color:var(--color-rule)]">
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? "creating…" : "create project"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push(`/w/${slug}/projects`)}
              >
                cancel
              </Button>
              <span className="text-[10px] text-[color:var(--color-ink-3)] italic font-serif ml-auto">
                You become project ADMIN · 5 default states created automatically
              </span>
            </div>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}