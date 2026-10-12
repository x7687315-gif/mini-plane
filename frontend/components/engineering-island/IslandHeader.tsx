/**
 * Island 页眉（Island V2 · 规格 §1.3 图钉的归属处）。
 *
 * 本阶段（阶段 1）只有标题与项目计数；**图钉 / 触发把手 / 窗口控制在阶段 2 落地**，
 * 所以这里先留出结构化位置（`data-testid`）而不放假控件 ——
 * 放一个点了没反应的按钮比没有按钮更糟。
 */

export function IslandHeader({
  projectCount,
  isPanel,
  pinned,
  onTogglePin,
}: {
  projectCount: number;
  isPanel: boolean;
  /** 阶段 2 之前恒为 false（未实现固定）。 */
  pinned: boolean;
  /** 阶段 2 之前为 undefined（未实现固定）。 */
  onTogglePin?: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="font-serif italic text-[18px] leading-tight">Engineering Island</h2>
        <span className="bp-uppercase text-[color:var(--color-ink-3)]">
          {projectCount} 个项目 · 总览
        </span>
      </div>

      <div className="flex items-center gap-2">
        {isPanel ? (
          <span className="bp-uppercase text-[color:var(--color-ink-3)]">Alt+I 收起</span>
        ) : null}
        {/* 阶段 2：图钉按钮。未实现时不渲染，避免"看起来能点其实不能点"。 */}
        {onTogglePin ? (
          <button
            type="button"
            onClick={onTogglePin}
            aria-pressed={pinned}
            aria-label={pinned ? "取消固定 Island 面板" : "固定 Island 面板"}
            className="rounded-full border border-[color:var(--color-rule)] px-3 py-1 text-[12px] transition-colors duration-[var(--duration-fast)] hover:border-[color:var(--color-ink-2)]"
          >
            {pinned ? "已固定" : "固定"}
          </button>
        ) : null}
      </div>
    </header>
  );
}
