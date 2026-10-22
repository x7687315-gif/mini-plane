/**
 * Island 图钉按钮（Island V2 阶段 2 · 规格 §1.3；V3 起页眉与把手条共用）。
 *
 * 抽成共享组件而不是两处各写一遍：V2 的图钉逻辑（读状态 → 乐观翻 → Python 对账）
 * 曾经散在页眉和把手页两处，是"点了没反应"类鬼故事的温床。V3 把状态收敛到
 * `EngineeringIsland`（唯一持有 form/pinned 的地方），这里只负责渲染与上报。
 *
 * 样式按 DESIGN.md §3.3 的 V3 修订：Island 例外圆角收紧到 4–8px（不再是胶囊）。
 */

import { PinIcon } from "./PinIcon";

export function IslandPinButton({
  pinned,
  onToggle,
}: {
  pinned: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pinned}
      aria-label={pinned ? "取消固定 Island 面板" : "固定 Island 面板"}
      data-testid="island-pin"
      className={[
        "flex items-center gap-1.5 rounded border px-2.5 py-1 text-[12px]",
        "transition-colors duration-[var(--duration-fast)] hover:border-[color:var(--color-ink-2)]",
        pinned
          ? "border-[color:var(--color-accent)] text-[color:var(--color-accent)]"
          : "border-[color:var(--color-rule)] text-[color:var(--color-ink-2)]",
      ].join(" ")}
    >
      <PinIcon filled={pinned} />
      {pinned ? "已固定" : "固定"}
    </button>
  );
}
