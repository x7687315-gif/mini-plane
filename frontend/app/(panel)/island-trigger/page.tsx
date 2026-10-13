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

import { desktopBridge, isDesktop } from "@/lib/desktopBridge";

export default function IslandTriggerPage() {
  const onDesktop = isDesktop();

  return (
    <button
      type="button"
      onClick={() => desktopBridge.toggleIsland()}
      aria-label="展开或收起工程 Island 面板"
      title="工程 Island（Alt+I）"
      data-testid="island-trigger"
      className={[
        "group flex h-full w-full items-center justify-center gap-2 rounded-full",
        "border border-[color:var(--color-accent)] bg-[color:var(--color-paper)]",
        "transition-all duration-[var(--duration-fast)] ease-[var(--ease-out)] motion-reduce:transition-none",
        "hover:border-[color:var(--color-ink-2)]",
      ].join(" ")}
    >
      {/* 常驻的小圆点：静止时也能看出"这里有个东西" */}
      <span className="h-[5px] w-[5px] rounded-full bg-[color:var(--color-accent)]" aria-hidden />
      {/* 悬停才出现的文字：默认极窄，不抢视线 */}
      <span
        className={[
          "bp-uppercase max-w-0 overflow-hidden whitespace-nowrap text-[color:var(--color-ink-2)]",
          "transition-all duration-[var(--duration-fast)] ease-[var(--ease-out)] motion-reduce:transition-none",
          "group-hover:max-w-[120px]",
        ].join(" ")}
        aria-hidden
      >
        工程 Island
      </span>
      {/* 读屏与自动化测试用的恒定文本（视觉上隐藏） */}
      <span className="sr-only">工程 Island</span>
      {onDesktop ? null : (
        <span className="sr-only">（仅在桌面版可用，浏览器里点击无效果）</span>
      )}
    </button>
  );
}
