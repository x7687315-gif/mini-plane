"use client";

import { create } from "zustand";

/**
 * QuickLog store — 全局「记一笔」弹层的开合与默认工程。
 *
 * Phase 5：Worklog 的记录入口从「项目页底部常驻表单」收敛为一个全局动作
 * （顶栏 ✎ 记一笔 / ⌘⇧L）。projectId 由打开方注入（工程台传入当前工程；
 * 首页等传 null → 弹层内用 useMyProjects 兜底选择）。
 */

interface QuickLogState {
  open: boolean;
  /** 打开时预选的工程；null = 由弹层自选（当前工程 > 最近活动 > 第一个）。 */
  projectId: string | null;
  openWith: (projectId?: string | null) => void;
  close: () => void;
}

export const useQuickLogStore = create<QuickLogState>((set) => ({
  open: false,
  projectId: null,
  openWith: (projectId = null) => set({ open: true, projectId }),
  close: () => set({ open: false, projectId: null }),
}));
