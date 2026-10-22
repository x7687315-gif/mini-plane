/**
 * Island 页眉（Island V2 阶段 2 · 规格 §1.3 图钉的归属处；V3 起为纯展示组件）。
 *
 * V3 变化：状态不再由本组件自持——`EngineeringIsland` 是唯一持有 form/pinned 的
 * 地方（单窗两态状态机的落脚点），这里只渲染 + 上报。V2 时页眉自己
 * `readIslandState()`、自己乐观翻，和把手页各持一份，是漂移的温床。
 *
 * 图钉按钮**只在桌面面板里出现**（`isPanel && 有桥`）：
 * 浏览器里没有 pywebview 桥，渲染一个点了没反应的按钮比不渲染更糟
 * （规格 §1.3：网页版无把手与图钉窗口控制）。
 *
 * M3：页眉 = 拖动区。按住空白处拖动整个面板；按钮不参与（防误拖）。
 * 无边框窗在 Windows 没有系统拖动（easy_drag 未实现），这是唯一入口。
 */

import { useCallback } from "react";
import { isDesktop, trackWindowMove } from "@/lib/desktopBridge";
import { IslandPinButton } from "./IslandPinButton";

export function IslandHeader({
  projectCount,
  isPanel,
  live = false,
  pinned = false,
  onTogglePin,
}: {
  projectCount: number;
  isPanel: boolean;
  /** overview 通道是否在线（规格：断线不虚报 LIVE）*/
  live?: boolean;
  /** 图钉状态（由 EngineeringIsland 对账后下发） */
  pinned?: boolean;
  onTogglePin?: () => void;
}) {
  const onDesktop = isPanel && isDesktop();

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onDesktop || e.button !== 0) return;
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault(); // 防止拖动时选中文本（text_select=True）
      trackWindowMove(e);
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
        {onDesktop && onTogglePin ? (
          <IslandPinButton pinned={pinned} onToggle={onTogglePin} />
        ) : null}
      </div>
    </header>
  );
}
