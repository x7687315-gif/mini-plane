"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { AuthGuard } from "@/features/auth";
import { AppShell } from "@/components/shell/AppShell";
import { CommandPalette } from "@/components/CommandPalette";
import { useWorkspaces } from "@/features/workspace";
import { useChromeStore } from "@/stores/chrome";
import { useRememberTeamPath } from "@/stores/mode";

/**
 * Protected layout — 每个 (protected)/ 下的页面都要求有效会话。
 *
 * 结构：AuthGuard（会话守卫）→ **常驻 AppShell** → 页面内容。
 *
 * 为什么 AppShell 放这里而不是各页各自渲染：App Router 下 layout 跨子路由常驻，
 * 把外壳（TopBar/LeftRail/Aside/Footer）提到这里，换页时不再重挂整块 chrome，
 * 消除跨页导航的顶栏/侧栏重建与轻微闪动。各页通过 `useChrome()` 声明本屏的
 * topbar / rail.current / hideAside，写进 chrome store，这里读取渲染。
 *
 * Sprint 17 增加了两件事：
 * 1. **侧栏接真实工作区**。此前 LeftRail 一直在渲染 Sprint 0 的硬编码假数据
 *    （amiya/kaltsit/rhodes），点进去 404。与 CommandPalette 共用同一个 queryKey，
 *    React Query 会去重，**不产生第二次网络请求**。
 *    这里刻意**不走 chrome store**：那条通路的 `useChrome` 依赖数组是手写的，
 *    漏加字段会导致侧栏不重渲染；直接传 props 反而最稳。
 * 2. **记住上次停留的团队位置**。挂在布局而不是页面：布局跨路由常驻，一次挂载覆盖
 *    所有页面；手动输入 URL、浏览器前进/后退都会让 pathname 变化，记忆自动跟上。
 */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const topbar = useChromeStore((s) => s.topbar);
  const railCurrent = useChromeStore((s) => s.railCurrent);
  const hideAside = useChromeStore((s) => s.hideAside);

  const { data: wsList, isLoading: wsLoading } = useWorkspaces();
  const railWorkspaces = useMemo(
    () =>
      (wsList?.results ?? []).map((w) => ({
        slug: w.slug,
        // 与 /workspaces 页取同一个字母（首字母），只多一个 trim 防空白名
        initial: (w.name.trim()[0] ?? "?").toUpperCase(),
        name: w.name,
        role: w.current_role,
      })),
    [wsList],
  );

  useRememberTeamPath();

  return (
    <AuthGuard>
      <AppShell
        topbar={topbar}
        rail={{ workspaces: railWorkspaces, current: railCurrent, loading: wsLoading }}
        hideAside={hideAside}
      >
        {children}
      </AppShell>
      {/* 全局命令面板（Ctrl/Cmd+K）——跨页常驻，故挂在这里 */}
      <CommandPalette />
    </AuthGuard>
  );
}
