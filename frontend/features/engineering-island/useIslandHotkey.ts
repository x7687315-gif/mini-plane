/**
 * 桌面版 Island 全局快捷键（Island V2 阶段 2 · 规格 §1.1）。
 *
 * 为什么从"Island 页面专属"提升为**全局**：规格说 `Alt+I` 是**备用快捷键** ——
 * 用户在主窗口干活时想瞄一眼工程进度，不该先导航到 /island 再按快捷键。
 * 挂在 AppShell（主窗口所有页面）与 Island 面板窗口各一份，两边都能唤出。
 *
 * 为什么两个地方都挂而不是只挂一处：pywebview 的窗口是**独立的 JS 上下文**，
 * 一个窗口里的键盘事件不会转到另一个窗口；而用户按 Alt+I 时焦点可能在任意一个窗口。
 */

import { useEffect } from "react";
import { desktopBridge, isDesktop } from "@/lib/desktopBridge";

export function useIslandHotkey(): void {
  useEffect(() => {
    if (!isDesktop()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        desktopBridge.toggleIsland();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
