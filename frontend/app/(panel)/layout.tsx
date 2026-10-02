"use client";

/**
 * Island 独立窗口的路由组（Sprint 15 · Desktop Island）。
 *
 * 与 `(protected)` 的区别只有一处：**不套 AppShell**。
 * Island 窗口是要「置顶悬浮、随手瞄一眼」的表面，顶栏 / 侧栏 / 底栏在那个尺寸里
 * 只会占地方还让人误以为要操作它们；它只需要 AuthGuard（要登录态）与
 * 一层最小容器（去掉 body 的默认留白与滚动条）。
 */

import type { ReactNode } from "react";
import { AuthGuard } from "@/features/auth";

export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-dvh bg-[color:var(--color-paper)]">{children}</div>
    </AuthGuard>
  );
}
