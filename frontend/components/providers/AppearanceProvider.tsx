"use client";

import { useEffect, type ReactNode } from "react";
import { applyAppearance, useAppearance } from "@/stores/appearance";

/**
 * 运行期外观同步：
 * - 挂载时把 store 里的 theme/zoom 应用到 <html>（首屏已由 layout 内联脚本预设，这里只是对齐）；
 * - theme==="system" 时监听本机 prefers-color-scheme 变化，实时切换。
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const theme = useAppearance((s) => s.theme);
  const zoom = useAppearance((s) => s.zoom);

  useEffect(() => {
    applyAppearance(theme, zoom);
  }, [theme, zoom]);

  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = () => applyAppearance("system", zoom);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [theme, zoom]);

  return <>{children}</>;
}
