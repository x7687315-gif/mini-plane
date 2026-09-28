"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AuthAltLink,
  AuthFieldLabel,
  AuthFormError,
  AuthInput,
  AuthSubmit,
} from "@/components/auth/AuthCard";
import { loginErrorCode } from "@/features/auth/api";
import { useLogin, useRedirectTarget, useRegister } from "@/features/auth/hooks";

/**
 * LoginForm — 本地单机版：昵称优先的智能入口（见 docs/api/01-auth.md 登录语义）。
 *
 * 三步状态机，把"账户 + 密码 + 邮箱"从入口处拿掉：
 *   entry    输入昵称 → login({昵称})：
 *              200                → 免密账户，直接进（无验证界面）
 *              password_required  → 进入 password 步（该账户设过密码）
 *              not_found          → 进入 create 步（可用该昵称新建）
 *   password 输入密码 → login({昵称, 密码})
 *   create   一键用该昵称新建（register({昵称})，密码/邮箱留到设置里自助绑定）
 */
export function LoginForm() {
  const router = useRouter();
  const redirect = useRedirectTarget();
  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const [step, setStep] = useState<"entry" | "password" | "create">("entry");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const pending = loginMutation.isPending || registerMutation.isPending;
  const goHome = () => router.replace(redirect);

  const submitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = username.trim();
    if (!name) {
      setError("请输入昵称。");
      return;
    }
    setError(null);
    try {
      await loginMutation.mutateAsync({ username: name });
      goHome(); // 免密账户：直接进
    } catch (err) {
      const code = loginErrorCode(err);
      if (code === "password_required") setStep("password");
      else if (code === "not_found") setStep("create");
      else setError(err instanceof Error ? err.message : "登录失败，请重试。");
    }
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await loginMutation.mutateAsync({ username: username.trim(), password });
      goHome();
    } catch (err) {
      setError(err instanceof Error ? err.message : "密码不正确。");
    }
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await registerMutation.mutateAsync({ username: username.trim() });
      goHome();
    } catch (err) {
      setError(err instanceof Error ? err.message : "新建失败，请换个昵称试试。");
    }
  };

  const backToEntry = () => {
    setStep("entry");
    setPassword("");
    setError(null);
  };

  if (step === "password") {
    return (
      <form onSubmit={submitPassword} noValidate>
        {error && <AuthFormError>{error}</AuthFormError>}
        <p className="mb-4 text-[12px] text-[color:var(--color-ink-2)]">
          账户「{username.trim()}」已设置密码，请输入以完成验证。
        </p>
        <div className="mb-6">
          <AuthFieldLabel htmlFor="password">密码</AuthFieldLabel>
          <AuthInput
            id="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <AuthSubmit pending={pending} disabled={pending}>登录</AuthSubmit>
        <button
          type="button"
          onClick={backToEntry}
          className="mt-4 block text-[12px] text-[color:var(--color-ink-3)] underline decoration-dotted underline-offset-4"
        >
          换个昵称
        </button>
      </form>
    );
  }

  if (step === "create") {
    return (
      <form onSubmit={submitCreate} noValidate>
        {error && <AuthFormError>{error}</AuthFormError>}
        <p className="mb-4 text-[12px] text-[color:var(--color-ink-2)]">
          本机还没有昵称「{username.trim()}」。要用它新建一个账户吗？
        </p>
        <AuthSubmit pending={pending} disabled={pending}>
          用「{username.trim()}」新建
        </AuthSubmit>
        <button
          type="button"
          onClick={backToEntry}
          className="mt-4 block text-[12px] text-[color:var(--color-ink-3)] underline decoration-dotted underline-offset-4"
        >
          返回
        </button>
      </form>
    );
  }

  // entry
  return (
    <form onSubmit={submitEntry} noValidate>
      {error && <AuthFormError>{error}</AuthFormError>}
      <div className="mb-6">
        <AuthFieldLabel htmlFor="nickname">昵称</AuthFieldLabel>
        <AuthInput
          id="nickname"
          autoComplete="username"
          autoFocus
          placeholder="给你自己起个名字"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <AuthSubmit pending={pending} disabled={pending}>进入</AuthSubmit>
      <p className="mt-4 text-[11px] leading-relaxed text-[color:var(--color-ink-3)]">
        本机数据不出设备；密码和邮箱都可以稍后在「设置」里自行添加。
      </p>
    </form>
  );
}

/** Alternate action rendered under the form. */
export function LoginAlt() {
  return (
    <>
      想用邮箱和密码一次填全？ <AuthAltLink href="/register">完整注册 &rarr;</AuthAltLink>
    </>
  );
}
