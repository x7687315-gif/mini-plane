"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { flattenErrors, type FlatErrors } from "@/types/auth";
import { useRegister } from "@/features/auth/hooks";
import {
  AuthAltLink,
  AuthFieldError,
  AuthFieldLabel,
  AuthFormError,
  AuthInput,
  AuthSubmit,
} from "@/components/auth/AuthCard";

/**
 * Client-side mirror of Django's password validators.
 * The backend also runs its own validators (including a "common password" list),
 * so server field errors are still surfaced even if these pass.
 */
const schema = z.object({
  username: z
    .string()
    .min(1, "请输入用户名")
    .regex(/^[\w.@+-]+$/, "只能包含字母、数字和 @/./+/-/_ 字符"),
  email: z.string().min(1, "请输入邮箱").email("邮箱格式不正确"),
  password: z
    .string()
    .min(8, "密码至少 8 位")
    .refine((v) => !/^\d+$/, "密码不能只包含数字"),
});

type FormValues = z.infer<typeof schema>;

/**
 * RegisterForm — see docs/api/01-auth.md §"POST /api/v1/auth/register/".
 *
 * Important: register returns 201 AND a session cookie — the user is signed in
 * immediately. No follow-up login call is needed.
 */
export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/";

  const registerMutation = useRegister();
  const [formError, setFormError] = useState<string | null>(null);
  const [serverFields, setServerFields] = useState<FlatErrors["fields"]>({});

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", email: "", password: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    setServerFields({});
    try {
      await registerMutation.mutateAsync(values);
      router.replace(redirect);
    } catch (e) {
      if (e instanceof ApiError) {
        const flat = flattenErrors(e.body);
        setServerFields(flat.fields);
        setFormError(flat.form ?? (e.status === 429 ? "尝试次数过多，请稍后重试。" : null));
        return;
      }
      setFormError("网络异常，请稍后重试。");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {formError && <AuthFormError>{formError}</AuthFormError>}

      <div className="mb-4">
        <AuthFieldLabel htmlFor="username">Username</AuthFieldLabel>
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

      <div className="mb-4">
        <AuthFieldLabel htmlFor="email">Email</AuthFieldLabel>
        <AuthInput
          id="email"
          type="email"
          autoComplete="email"
          placeholder="amiya@example.com"
          {...register("email")}
        />
        {errors.email && <AuthFieldError>{errors.email.message}</AuthFieldError>}
        {serverFields.email && <AuthFieldError>{serverFields.email}</AuthFieldError>}
      </div>

      <div className="mb-7">
        <AuthFieldLabel htmlFor="password" hint="≥ 8 chars">
          Password
        </AuthFieldLabel>
        <AuthInput
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••••••"
          {...register("password")}
        />
        {errors.password && <AuthFieldError>{errors.password.message}</AuthFieldError>}
        {serverFields.password && <AuthFieldError>{serverFields.password}</AuthFieldError>}
      </div>

      <AuthSubmit pending={isSubmitting} disabled={isSubmitting}>
        create account
      </AuthSubmit>
    </form>
  );
}

/** Alternate action rendered under the form. */
export function RegisterAlt() {
  return (
    <>
      Already have an account? <AuthAltLink href="/login">Sign in &rarr;</AuthAltLink>
    </>
  );
}