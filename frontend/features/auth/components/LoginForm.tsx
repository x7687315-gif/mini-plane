"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  AuthAltLink,
  AuthFieldLabel,
  AuthFormError,
  AuthInput,
  AuthSubmit,
} from "@/components/auth/AuthCard";
import { loginErrorCode } from "@/features/auth/api";
import { useLogin, useMe, useRedirectTarget, useRegister } from "@/features/auth/hooks";
import { clearLastUser, readLastUser } from "@/lib/lastUser";

/** 跨窗口同步「上次是谁」：另一个窗口换了账号，这边也该知道。 */
function subscribeLastUser(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

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
  const [dismissed, setDismissed] = useState(false);

  // 「上次是谁」来自 localStorage，SSR 读不到 → 用 useSyncExternalStore：
  //   ① 服务端快照给 null，客户端拿到真实值，不会 hydration mismatch；
  //   ② 不用 useEffect + setState（那条在本项目是被 lint 明确禁止的）；
  //   ③ 跨窗口也同步（桌面版有主窗口 + Island 两个窗口）。
  const lastUser = useSyncExternalStore(subscribeLastUser, readLastUser, () => null);

  /**
   * 「已经登录的账号」——**优先于**记忆里的"上次用户"。
   *
   * 两者不是一回事，2026-10-03 被用户当面点出来了：记忆存的是"最后用过的账户"，
   * 换账户、导入数据时用别的身份登录，都会把记忆指向**别人**，
   * 于是登录页给他显示的是别人的账户 —— 他登不进自己的软件。
   * 而"已经登录"是**会话事实**（HttpOnly cookie）：`useMe()` 问得出来，问出来就是它。
   */
  const { data: sessionUser } = useMe();
  const quickUser = sessionUser
    ? { username: sessionUser.username, avatar: sessionUser.avatar ?? null }
    : dismissed
      ? null
      : lastUser;

  const pending = loginMutation.isPending || registerMutation.isPending;
  const goHome = () => router.replace(redirect);

  /** 点「直接进入」：有会话就直接进；没有就沿用原来的免密登录路径。 */
  const quickEnter = async () => {
    if (!quickUser) return;
    setUsername(quickUser.username);
    setError(null);
    if (sessionUser) {
      goHome();
      return;
    }
    try {
      await loginMutation.mutateAsync({ username: quickUser.username });
      goHome();
    } catch (err) {
      const code = loginErrorCode(err);
      if (code === "password_required") {
        setStep("password"); // 该账户设过密码 → 落到密码步，昵称已填好
      } else if (code === "not_found") {
        // 账户已不存在（被删/换名）：清掉记忆，回到可输入的状态
        clearLastUser();
        setError("上次的账户「" + quickUser.username + "」已经不在了，请重新输入昵称。");
      } else {
        setError(err instanceof Error ? err.message : "登录失败，请重试。");
      }
    }
  };

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

      {/* 快捷入口：这台机器上有个已知账户 → 点一下就走同一条登录路径。
          没有新接口：免密直接进 / 要密码落到密码步 / 账户被删则清记忆并提示。 */}
      {quickUser ? (
        <div className="mb-6">
          <button
            type="button"
            onClick={quickEnter}
            disabled={pending}
            aria-label={`以 ${quickUser.username} 直接进入`}
            className="w-full flex items-center gap-3 border border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)] px-3 py-2.5 text-left transition-colors duration-[var(--duration-fast)] hover:border-[color:var(--color-ink-2)] disabled:opacity-50"
          >
            <span
              className="w-7 h-7 inline-flex items-center justify-center border border-[color:var(--color-rule)] font-serif italic text-[13px] text-[color:var(--color-ink-2)] flex-shrink-0"
              aria-hidden
            >
              {quickUser.avatar ?? quickUser.username.slice(0, 1).toUpperCase()}
            </span>
            <span className="leading-tight min-w-0">
              <span className="block text-[13px] text-[color:var(--color-ink)] truncate">
                {quickUser.username}
              </span>
              <span className="block text-[9px] uppercase tracking-[0.18em] text-[color:var(--color-ink-3)]">
                {sessionUser ? "继续使用" : "直接进入"}
              </span>
            </span>
            <span className="ml-auto text-[color:var(--color-ink-3)]" aria-hidden>
              →
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="mt-2 block text-[11px] text-[color:var(--color-ink-3)] underline decoration-dotted underline-offset-4"
          >
            换个昵称
          </button>
          <div className="my-5 flex items-center gap-3 bp-hint">
            <span className="h-px flex-1 bg-[color:var(--color-rule)]" aria-hidden />
            或
            <span className="h-px flex-1 bg-[color:var(--color-rule)]" aria-hidden />
          </div>
        </div>
      ) : null}

      <div className="mb-6">
        <AuthFieldLabel htmlFor="nickname">昵称</AuthFieldLabel>
        <AuthInput
          id="nickname"
          autoComplete="username"
          autoFocus={!lastUser || dismissed}
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
