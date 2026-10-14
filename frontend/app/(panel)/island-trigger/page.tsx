"use client";

/**
 * 触发把手页面（Island V2 阶段 2 · 规格 §1.2）。
 *
 * 桌面版用一个约 140×14 的**原生小窗口**加载这个路由；它是隐藏模式下唯一入口。
 * 为什么必须是原生窗口而不是"隐藏主窗口等悬停"：pywebview 的窗口一旦隐藏就不再接收
 * 鼠标事件，届时没有任何东西能把它唤回来（规格 §2.1 实现注意）。
 *
 * 交互：
 * - 鼠标悬停 → 把手加宽并显示「工程 Island」小字（CSS transition，遵守 150–250ms）；
 * - 点击 → `desktopBridge.toggleIsland()`（与 Alt+I 走同一个 Python 方法）；
 * - `pinned` 时点击不收起（状态机在 Python 侧，见 window_manager.next_visibility）。
 *
 * 视觉：纸色填充 + 钴蓝细边 + 胶囊形（Island 专属例外，DESIGN.md §3.3）。
 */

import { desktopBridge, isDesktop, trackWindowMove } from "@/lib/desktopBridge";

export default function IslandTriggerPage() {
  const onDesktop = isDesktop();

  return (
    <button
      type="button"
      onPointerDown={(e) => {
        // M3：把手可拖（easy_drag 在 Windows 后端是空操作）；与 click 共存——
        // pointer capture 下 click 仍会在松手时触发，未拖动即普通点击
        if (e.button === 0) trackWindowMove("trigger", e);
      }}
      onClick={() => desktopBridge.toggleIsland()}
      aria-label="展开或收起工程 Island 面板"
      title="工程 Island（Alt+I）"
      data-testid="island-trigger"
      className={[
        "group flex h-full w-full items-center justify-center gap-2 rounded-full px-3",
        "border border-[color:var(--color-accent)] bg-[color:var(--color-paper)]",
        "shadow-[0_1px_3px_rgba(27,26,23,0.18)]",
        "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] motion-reduce:transition-none",
        "hover:border-[color:var(--color-ink-2)] hover:bg-[color:var(--color-paper-2)]",
      ].join(" ")}
    >
      {/* 常驻的小圆点 */}
      <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[color:var(--color-accent)]" aria-hidden />
      {/* M2（2026-10-14）：文字**常显**——把手从 140x14 加大到 200x32 之后，
          再用"hover 才显字"的老做法就没有存在意义了：入口必须不靠运气发现 */}
      <span className="bp-uppercase whitespace-nowrap text-[12px] text-[color:var(--color-ink-2)]">
        工程 Island
      </span>
      {onDesktop ? null : (
        <span className="sr-only">（仅在桌面版可用，浏览器里点击无效果）</span>
      )}
    </button>
  );
}
