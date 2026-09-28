"use client";

import { useEffect } from "react";
import { create } from "zustand";

/**
 * Chrome store — 让持久外壳（AppShell：TopBar / LeftRail / Aside / Footer）常驻在
 * (protected)/layout 里，各页面只声明"本屏的外壳配置"，从而**换页不再重挂整块 chrome**
 * （消除跨页导航时顶栏/侧栏重建与轻微闪动）。
 *
 * 只存原始值（字符串/数字/布尔），不存 ReactNode —— 因为所有页面都用 hideAside，
 * 右侧 Aside 无动态内容，无需把节点塞进 store。
 */

export interface Topbar {
  workspace?: string;
  project?: string;
  role?: number;
}

interface ChromeState {
  topbar: Topbar;
  railCurrent?: string;
  hideAside: boolean;
  /** 整屏替换（不是浅合并）：每个页面声明它要的完整外壳状态，避免继承上一页的残留。 */
  setChrome: (c: { topbar: Topbar; railCurrent?: string; hideAside: boolean }) => void;
}

export const useChromeStore = create<ChromeState>((set) => ({
  topbar: {},
  railCurrent: undefined,
  hideAside: true,
  setChrome: (c) =>
    set({ topbar: c.topbar, railCurrent: c.railCurrent, hideAside: c.hideAside }),
}));

/**
 * 页面在顶层调用，声明本屏外壳。依赖全是原始值 → 稳定、不会死循环；
 * 数据异步到位后（如 ws.data.name 从 undefined→名字）值变 → effect 重跑 → 外壳更新。
 */
export function useChrome(cfg: {
  topbar: Topbar;
  railCurrent?: string;
  hideAside: boolean;
}): void {
  const setChrome = useChromeStore((s) => s.setChrome);
  const { workspace, project, role } = cfg.topbar;
  const { railCurrent, hideAside } = cfg;
  useEffect(() => {
    setChrome({ topbar: { workspace, project, role }, railCurrent, hideAside });
  }, [workspace, project, role, railCurrent, hideAside, setChrome]);
}
