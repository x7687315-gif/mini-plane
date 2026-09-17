"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { flattenErrors, type FlatErrors } from "@/types/auth";
import { useLogin, useRedirectTarget } from "@/features/auth/hooks";
import {
  AuthAltLink,
  AuthFieldError,
  AuthFieldLabel,
  AuthFormError,
  AuthInput,
  AuthSubmit,
} from "@/components/auth/AuthCard";

const schema = z.object({
  username: z.string().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
});

type FormValues = z.infer<typeof schema>;

/**
 * LoginForm — see docs/api/01-auth.md §"POST /api/v1/auth/login/".
 *
 * Error routing (per docs/api/09-frontend-integration.md §四):
 * - 400 `{detail: "用户名或密码错误。"}` → form-level banner
 * - 400 field-level body → per-field message
 * - 429 → lockout banner, disable submit
 * - 401 never happens here (this endpoint returns 400 for bad credentials)
 */
export function LoginForm() {
  const router = useRouter();
  const redirect = useRedirectTarget();

  const loginMutation = useLogin();
  const [formError, setFormError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [serverFields, setServerFields] = useState<FlatErrors["fields"]>({});

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    setServerFields({});
    try {
      await loginMutation.mutateAsync(values);
      router.replace(redirect);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 429) {
          setLocked(true);
          setFormError(
            typeof e.body === "object" && e.body && "detail" in e.body
              ? String((e.body as { detail: string }).detail)
              : "尝试次数过多，请 15 分钟后再试。",
          );
          return;
        }
        const flat = flattenErrors(e.body);
        setServerFields(flat.fields);
        setFormError(flat.form);
        return;
      }
      setFormError("网络异常，请稍后重试。");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {formError && <AuthFormError>{formError}</AuthFormError>}

      <div className="mb-5">
        <AuthFieldLabel htmlFor="username" hint="or email">
          Username
        </AuthFieldLabel>
        <AuthInput
          id="username"
          autoComplete="username"
          autoFocus
          placeholder="amiya"
          {...register("username")}
        />
        {errors.username && <AuthFieldError>{errors.username.message}</AuthFieldError>}
        {serverFields.username && <AuthFieldError>{serverFields.username}</AuthFieldError>}
      </div>

      <div className="mb-7">
        <AuthFieldLabel htmlFor="password">Password</AuthFieldLabel>
        <AuthInput
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••••••"
          {...register("password")}
        />
        {errors.password && <AuthFieldError>{errors.password.message}</AuthFieldError>}
        {serverFields.password && <AuthFieldError>{serverFields.password}</AuthFieldError>}
      </div>

      <AuthSubmit pending={isSubmitting} disabled={isSubmitting || locked}>
        sign in
      </AuthSubmit>
    </form>
  );
}

/** Alternate action rendered under the form. */
export function LoginAlt() {
  return (
    <>
      No account? <AuthAltLink href="/register">Register &rarr;</AuthAltLink>
    </>
  );
}