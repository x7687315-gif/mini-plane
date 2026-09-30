"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui";
import { LogOutIcon, UserIcon } from "@/components/icons";
import { useLogout } from "@/features/auth/hooks";
import { useAppearance, type Theme } from "@/stores/appearance";
import { useAuthStore } from "@/stores/auth";

/**
 * AvatarMenu — see SCREEN_BLUEPRINTS §1.1 (TopBar).
 *
 * Click the avatar to open a small dropdown:
 * - 我的设置 → /me
 * - 主题快切（浅色 / 深色 / 跟随系统）
 * - 退出登录 → POST /auth/logout → clear store → /login
 *
 * Closes on outside click and on Escape.
 */
const THEME_OPTS: { value: Theme; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "系统" },
];

export function AvatarMenu() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logoutMutation = useLogout();
  const theme = useAppearance((s) => s.theme);
  const setTheme = useAppearance((s) => s.setTheme);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    try {
      await logoutMutation.mutateAsync();
    } finally {
      router.replace("/login");
    }
  };

  const username = user?.username ?? "…";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <Avatar name={username} size="sm" tone="accent" />
        <span className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-ink-2)] font-sans font-medium hidden sm:inline">
          {username}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] py-1"
        >
          <div className="px-3.5 py-2.5 border-b border-[color:var(--color-rule)]">
            <div className="font-serif italic text-[15px] text-[color:var(--color-ink)] leading-tight">
              {username}
            </div>
            <div className="text-[10px] text-[color:var(--color-ink-3)] mt-0.5 truncate">
              {user?.email ?? ""}
            </div>
          </div>

          <Link
            href="/me/issues"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-ink-2)] font-sans font-medium hover:bg-[color:var(--color-paper-2)] hover:text-[color:var(--color-ink)]"
          >
            <UserIcon size={13} />
            我的工作
          </Link>

          <Link
            href="/me"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-ink-2)] font-sans font-medium hover:bg-[color:var(--color-paper-2)] hover:text-[color:var(--color-ink)]"
          >
            <UserIcon size={13} />
            我的设置
          </Link>

          <div className="px-3.5 py-2.5 border-t border-[color:var(--color-rule)]">
            <div className="text-[9px] uppercase tracking-[0.18em] text-[color:var(--color-ink-3)] font-sans font-medium mb-1.5">
              主题
            </div>
            <div className="flex gap-1" role="group" aria-label="主题">
              {THEME_OPTS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={theme === opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={
                    "flex-1 px-2 py-1 text-[10px] uppercase tracking-[0.12em] font-sans font-medium border transition-colors " +
                    (theme === opt.value
                      ? "border-[color:var(--color-accent)] text-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)]"
                      : "border-[color:var(--color-rule)] text-[color:var(--color-ink-2)] hover:text-[color:var(--color-ink)]")
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 border-t border-[color:var(--color-rule)] text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-ink-2)] font-sans font-medium hover:bg-[color:var(--color-paper-2)] hover:text-[color:var(--color-urgent)] disabled:opacity-40"
          >
            <LogOutIcon size={13} />
            {logoutMutation.isPending ? "正在退出…" : "退出登录"}
          </button>
        </div>
      )}
    </div>
  );
}
