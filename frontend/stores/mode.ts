"use client";

/**
 * 团队位置记忆（Sprint 17）。
 *
 * 只存**一条**：上次停留的团队层路径（个人层不存，理由见 `mode-logic.ts`）。
 *
 * ## 为什么不照抄 appearance.ts 的内联脚本
 *
 * 主题必须在下一次绘制**之前**落到 `<html>` 上，否则暗色用户会闪一下白；
 * 而本 store 的值**不参与首帧渲染的任何可见输出**——按钮的文案与落点都只由
 * pathname 决定，记忆只在"点击那一刻"被读。加内联脚本只会多出一个真相源。
 *
 * ## 为什么同步点挂在 (protected)/layout.tsx 而不是页面
 *
 * 布局跨路由常驻，一次挂载覆盖所有页面；挂在页面上则每次换页都要重新注册，
 * 而且 `/w/[slug]/settings` 这类页面的卸载时机与新页面挂载时机交错，很容易写漏。
 * 挂布局还有一个好处：**手动输入 URL、浏览器前进/后退都会让 `usePathname()` 变化**，
 * 于是记忆自动跟上——不需要额外监听 popstate 或 keydown。
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { create } from "zustand";
import { routeToMode } from "./mode-logic";

/** 与 mp-theme / mp-zoom / mp-island-sheet 同一命名族。 */
const LAST_TEAM_KEY = "mp-last-team-path";

export function readLastTeamPath(): string | null {
  // 服务端没有 window：返回 null，保证 SSR 与客户端首次渲染的初值一致（不产生 hydration mismatch）
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_TEAM_KEY);
  } catch {
    // 隐私模式 / WebView2 首帧 / 配额禁用：降级为"无记忆"，而不是让整页崩
    return null;
  }
}

export function writeLastTeamPath(path: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (path) window.localStorage.setItem(LAST_TEAM_KEY, path);
    else window.localStorage.removeItem(LAST_TEAM_KEY);
  } catch {
    /* 不可写就不可写：切换功能本身不依赖它，只是少了个"回到上次"的便利 */
  }
}

interface ModeState {
  /** 上次停留的团队层路径（`/w/` 开头），null = 无记忆 */
  lastTeamPath: string | null;
  setLastTeamPath: (path: string | null) => void;
}

export const useModeStore = create<ModeState>((set) => ({
  lastTeamPath: readLastTeamPath(),
  setLastTeamPath: (path) => {
    writeLastTeamPath(path);
    set({ lastTeamPath: path });
  },
}));

/** 停留在团队层时，把当前位置写进记忆。挂在 (protected)/layout.tsx 调用。 */
export function useRememberTeamPath(): void {
  const pathname = usePathname();
  const setLastTeamPath = useModeStore((s) => s.setLastTeamPath);
  useEffect(() => {
    if (routeToMode(pathname) === "team") setLastTeamPath(pathname);
  }, [pathname, setLastTeamPath]);
}
