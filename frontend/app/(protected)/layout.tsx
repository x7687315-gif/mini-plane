"use client";

import type { ReactNode } from "react";
import { AuthGuard } from "@/features/auth";
import { AppShell } from "@/components/shell/AppShell";
import { CommandPalette } from "@/components/CommandPalette";
import { useChromeStore } from "@/stores/chrome";

/**
 * Protected layout — 每个 (protected)/ 下的页面都要求有效会话。
 *
 * 结构：AuthGuard（会话守卫）→ **常驻 AppShell** → 页面内容。
 *
 * 为什么 AppShell 放这里而不是各页各自渲染：App Router 下 layout 跨子路由常驻，
 * 把外壳（TopBar/LeftRail/Aside/Footer）提到这里，换页时不再重挂整块 chrome，
 * 消除跨页导航的顶栏/侧栏重建与轻微闪动。各页通过 `useChrome()` 声明本屏的
 * topbar / rail.current / hideAside，写进 chrome store，这里读取渲染。
 */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const topbar = useChromeStore((s) => s.topbar);
  const railCurrent = useChromeStore((s) => s.railCurrent);
  const hideAside = useChromeStore((s) => s.hideAside);

  return (
    <AuthGuard>
      <AppShell topbar={topbar} rail={{ current: railCurrent }} hideAside={hideAside}>
        {children}
      </AppShell>
      {/* 全局命令面板（Ctrl/Cmd+K）——跨页常驻，故挂在这里 */}
      <CommandPalette />
    </AuthGuard>
  );
}
