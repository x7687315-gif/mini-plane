"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  MeasureLine,
} from "@/components/ui";
import { useBind, useLogout } from "@/features/auth/hooks";
import { useChrome } from "@/stores/chrome";
import { ZOOM_PRESETS, useAppearance, type Theme } from "@/stores/appearance";
import { useAuthStore } from "@/stores/auth";

/**
 * /me — 个人设置（见 SCREEN_BLUEPRINTS §2.14）。
 *
 * 大标题 / 区块标题按设计语言保留 Cormorant 衬线英文；正文、指引、表单文案一律中文。
 * 本地单机版：密码与邮箱都是**可选**二级凭据，由账户所有人自行在此绑定 / 修改 / 移除。
 */
export default function MePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logoutMutation = useLogout();

  useChrome({
    topbar: { workspace: "Amiya Workspace", project: "Amiya Project", role: 20 },
    hideAside: true,
  });

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      router.replace("/login");
    }
  };

  return (
    <>
      <h1 className="bp-display text-4xl text-[color:var(--color-ink)]">My settings</h1>
      <p className="font-serif italic text-[14px] text-[color:var(--color-ink-3)] mt-1 tracking-[0.04em]">
        SHEET 12 · 只属于你的这一页
      </p>

      <MeasureLine left="FIG · 01" right="IDENTITY" />

      <Card className="max-w-2xl mb-6">
        <CardHeader>Identity</CardHeader>
        <CardBody>
          <div className="flex items-start gap-5 mb-6">
            <Avatar name={user?.username} size="lg" tone="accent" />
            <div>
              <div className="font-serif italic text-[24px] text-[color:var(--color-ink)] leading-tight">
                {user?.username ?? "—"}
              </div>
              <div className="text-[12px] text-[color:var(--color-ink-2)] mt-0.5">
                {user?.email ?? "未绑定邮箱"}
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-[120px_1fr] gap-y-3 text-[12px]">
            <dt className="text-[color:var(--color-ink-3)] self-center">昵称</dt>
            <dd className="text-[color:var(--color-ink)]">{user?.username ?? "—"}</dd>

            <dt className="text-[color:var(--color-ink-3)] self-center">邮箱</dt>
            <dd className="text-[color:var(--color-ink)]">{user?.email ?? "未绑定"}</dd>

            <dt className="text-[color:var(--color-ink-3)] self-center">用户 ID</dt>
            <dd className="font-mono text-[11px] text-[color:var(--color-ink-2)] break-all">
              {user?.id ?? "—"}
            </dd>

            <dt className="text-[color:var(--color-ink-3)] self-center">创建于</dt>
            <dd className="text-[color:var(--color-ink-2)]">
              {user?.created_at ? new Date(user.created_at).toLocaleString() : "—"}
            </dd>
          </dl>
        </CardBody>
      </Card>

      <AppearanceCard />

      <SecurityCard />

      <Card className="max-w-2xl mt-6">
        <CardHeader>Session</CardHeader>
        <CardBody>
          <p className="text-[12px] text-[color:var(--color-ink-2)] mb-4">
            退出会销毁服务端会话并清空所有缓存的查询。
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
          >
            {logoutMutation.isPending ? "正在退出…" : "退出登录"}
          </Button>
        </CardBody>
      </Card>
    </>
  );
}

/** 自助绑定 / 修改密码与邮箱（可选二级凭据）。 */
function SecurityCard() {
  const user = useAuthStore((s) => s.user);
  const bindMutation = useBind();
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  const busy = bindMutation.isPending;

  const run = async (
    payload: Parameters<typeof bindMutation.mutateAsync>[0],
    ok: string,
  ) => {
    setMsg(null);
    try {
      await bindMutation.mutateAsync(payload);
      setMsg(ok);
      setPassword("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "操作失败。");
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>Security</CardHeader>
      <CardBody className="space-y-6">
        <p className="text-[12px] text-[color:var(--color-ink-2)]">
          本地单机版默认只用昵称免密进入。你可以自行加一层保护：设置密码后，下次进入需要输入密码验证。
        </p>

        <div>
          <div className="text-[12px] font-medium text-[color:var(--color-ink)] mb-1">登录密码</div>
          <div className="text-[11px] text-[color:var(--color-ink-3)] mb-3">
            当前状态：{user?.has_password ? "已设置" : "未设置（免密进入）"}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
            <div className="flex-1 min-w-0">
              <Field label={user?.has_password ? "设置新密码" : "设置密码"} htmlFor="bind-pw">
                <Input
                  id="bind-pw"
                  type="password"
                  autoComplete="new-password"
                  placeholder="至少 8 位，别用纯数字"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={busy || !password}
                onClick={() => run({ password }, "密码已保存。")}
              >
                保存密码
              </Button>
              {user?.has_password && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => run({ remove_password: true }, "已移除密码，恢复免密进入。")}
                >
                  移除密码
                </Button>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="text-[12px] font-medium text-[color:var(--color-ink)] mb-1">绑定邮箱</div>
          <div className="text-[11px] text-[color:var(--color-ink-3)] mb-3">
            当前：{user?.email ?? "未绑定"}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
            <div className="flex-1 min-w-0">
              <Field label="邮箱地址" htmlFor="bind-email">
                <Input
                  id="bind-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
            </div>
            <div>
              <Button
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={() => run({ email: email.trim() }, "邮箱已更新。")}
              >
                保存邮箱
              </Button>
            </div>
          </div>
        </div>

        {msg && <p className="text-[12px] text-[color:var(--color-accent)]">{msg}</p>}
      </CardBody>
    </Card>
  );
}

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];

/** 外观：主题（浅色/深色/跟随系统）+ 显示大小（整屏缩放）。存 localStorage，即时生效。 */
function AppearanceCard() {
  const theme = useAppearance((s) => s.theme);
  const zoom = useAppearance((s) => s.zoom);
  const setTheme = useAppearance((s) => s.setTheme);
  const setZoom = useAppearance((s) => s.setZoom);

  return (
    <Card className="max-w-2xl mb-6">
      <CardHeader>Appearance</CardHeader>
      <CardBody className="space-y-6">
        <div>
          <div className="text-[12px] font-medium text-[color:var(--color-ink)] mb-2">主题</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="主题">
            {THEME_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={theme === opt.value ? "primary" : "secondary"}
                size="sm"
                aria-pressed={theme === opt.value}
                onClick={() => setTheme(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[12px] font-medium text-[color:var(--color-ink)] mb-2">显示大小</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="显示大小">
            {ZOOM_PRESETS.map((preset) => (
              <Button
                key={preset.value}
                variant={Math.abs(zoom - preset.value) < 0.001 ? "primary" : "secondary"}
                size="sm"
                aria-pressed={Math.abs(zoom - preset.value) < 0.001}
                onClick={() => setZoom(preset.value)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[color:var(--color-ink-3)]">
            设置保存在本机，重开应用后仍生效。
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
