/**
 * Island 页眉（Island V2 阶段 2 · 规格 §1.3 图钉的归属处）。
 *
 * 图钉按钮**只在桌面面板里出现**（`isPanel && 有桥`）：
 * 浏览器里没有 pywebview 桥，渲染一个点了没反应的按钮比不渲染更糟
 * （规格 §1.3：网页版无把手与图钉窗口控制）。
 *
 * 状态来源：`readIslandState()`（异步，pywebview api 返回 Promise）。
 * 首帧按 `pinned=false` 渲染，状态回来后纠正 —— 按钮本身要有桥才渲染，
 * 不会出现"按钮闪现又消失"。
 */

import { useCallback, useEffect, useState } from "react";
import {
  desktopBridge,
  isDesktop,
  readIslandState,
  trackWindowMove,
  type IslandState,
} from "@/lib/desktopBridge";

export function IslandHeader({
  projectCount,
  isPanel,
  live = false,
}: {
  projectCount: number;
  isPanel: boolean;
  /** overview 通道是否在线（规格：断线不虚报 LIVE）*/
  live?: boolean;
}) {
  const [state, setState] = useState<IslandState | null>(null);
  const onDesktop = isPanel && isDesktop();

  const refresh = useCallback(() => {
    if (!onDesktop) return;
    void readIslandState().then(setState);
  }, [onDesktop]);

  useEffect(refresh, [refresh]);

  // 切换固定后本地立即纠正，不必等下一次轮询（Python 侧已落盘）
  const onTogglePin = useCallback(() => {
    if (state?.pinned) desktopBridge.unpinIsland();
    else desktopBridge.pinIsland();
    setState((prev) =>
      prev
        ? { ...prev, pinned: !prev.pinned, displayMode: prev.pinned ? "auto_hide" : "pinned" }
        : prev,
    );
  }, [state?.pinned]);

  const pinned = state?.pinned ?? false;

  // M3：页眉 = 拖动区。按住空白处拖动整个面板；按钮不参与（防误拖）。
  // 无边框窗在 Windows 没有系统拖动（easy_drag 未实现），这是唯一入口。
  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onDesktop || e.button !== 0) return;
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault(); // 防止拖动时选中文本（text_select=True）
      trackWindowMove("panel", e);
    },
    [onDesktop],
  );

  return (
    <header
      className="flex items-center justify-between gap-3 select-none"
      onPointerDown={onHeaderPointerDown}
    >
      <div className="flex items-baseline gap-2">
        <h2 className="font-serif italic text-[18px] leading-tight">Engineering Island</h2>
        <span className="bp-uppercase text-[color:var(--color-ink-3)]">
          {projectCount} 个项目 · 总览
        </span>
        <span
          className={`bp-uppercase flex items-center gap-1.5 ${live ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-ink-3)]"}`}
          title={live ? "实时同步中" : "未连接实时通道，显示的是最近一次加载的数据"}
        >
          <span
            aria-hidden
            className={`inline-block h-[5px] w-[5px] rounded-full ${live ? "bg-[color:var(--color-accent)] motion-safe:animate-pulse" : "border border-[color:var(--color-ink-3)]"}`}
          />
          {live ? "LIVE" : "离线"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {isPanel ? (
          <span className="bp-uppercase text-[color:var(--color-ink-3)]">Alt+I 收起</span>
        ) : null}
        {onDesktop ? (
          <button
            type="button"
            onClick={onTogglePin}
            aria-pressed={pinned}
            aria-label={pinned ? "取消固定 Island 面板" : "固定 Island 面板"}
            data-testid="island-pin"
            className={[
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px]",
              "transition-colors duration-[var(--duration-fast)] hover:border-[color:var(--color-ink-2)]",
              pinned
                ? "border-[color:var(--color-accent)] text-[color:var(--color-accent)]"
                : "border-[color:var(--color-rule)] text-[color:var(--color-ink-2)]",
            ].join(" ")}
          >
            <PinIcon filled={pinned} />
            {pinned ? "已固定" : "固定"}
          </button>
        ) : null}
      </div>
    </header>
  );
}

/** 图钉：自绘 inline SVG（项目红线：不用图标库）。实心=固定，空心=未固定。 */
function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden focusable="false">
      <path
        d="M4 1h4v2l-1 1v3l1.5 1.5H3.5L5 7V5L4 3V1z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path d="M6 8.5V11" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
