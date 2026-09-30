"use client";

import { create } from "zustand";

/**
 * 外观设置（主题 + 显示大小）——本地持久化到 localStorage。
 *
 * - 主题：light / dark / system（system 跟随本机 prefers-color-scheme）。
 * - 显示大小：整屏 zoom（0.9 / 1 / 1.1 / 1.25），落到 <html> 的 --ui-zoom。
 *
 * 首屏由 app/layout 的内联脚本按 localStorage 预设 data-theme/--ui-zoom，避免闪白；
 * 本 store 负责运行期切换 + 持久化 + 应用。SSR 阶段一律返回默认值，不碰 window。
 */

export type Theme = "light" | "dark" | "system";

const THEME_KEY = "mp-theme";
const ZOOM_KEY = "mp-zoom";

export const ZOOM_PRESETS = [
  { label: "小", value: 0.9 },
  { label: "标准", value: 1 },
  { label: "大", value: 1.1 },
  { label: "特大", value: 1.25 },
] as const;

function readTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

function readZoom(): number {
  if (typeof window === "undefined") return 1;
  const v = Number.parseFloat(window.localStorage.getItem(ZOOM_KEY) ?? "");
  return Number.isFinite(v) && v >= 0.8 && v <= 1.4 ? v : 1;
}

/** 把抽象主题解析成实际落到 DOM 的 light/dark。 */
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  if (theme === "system") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

/** 应用主题 + 缩放到 <html>（幂等，可被内联脚本、store、监听器共同调用）。 */
export function applyAppearance(theme: Theme, zoom: number): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(theme);
  root.style.setProperty("--ui-zoom", String(zoom));
}

interface AppearanceState {
  theme: Theme;
  zoom: number;
  setTheme: (t: Theme) => void;
  setZoom: (z: number) => void;
}

export const useAppearance = create<AppearanceState>((set, get) => ({
  theme: readTheme(),
  zoom: readZoom(),
  setTheme: (t) => {
    if (typeof window !== "undefined") window.localStorage.setItem(THEME_KEY, t);
    set({ theme: t });
    applyAppearance(t, get().zoom);
  },
  setZoom: (z) => {
    if (typeof window !== "undefined") window.localStorage.setItem(ZOOM_KEY, String(z));
    set({ zoom: z });
    applyAppearance(get().theme, z);
  },
}));
