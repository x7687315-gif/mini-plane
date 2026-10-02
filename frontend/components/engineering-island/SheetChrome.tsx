/**
 * 图纸角标与标注（Sprint 16 · Island Polish）
 *
 * 工程图纸的"味道"不在配色，而在**标注**：角上的裁切标记、图号、版本号、尺寸线。
 * 这些元素对读屏毫无意义，所以整体 `aria-hidden`——它们是给眼睛看的，不是给屏幕阅读器念的。
 *
 * 全部图形都是自绘 inline SVG（DESIGN.md §11：禁止第三方图标库；且本项目连 emoji 都不用）。
 * 线宽统一 0.5px，与全局边框规范一致。
 */

/** 四角裁切标记（crop marks）：图纸被"裁"下来的四角短线。 */
function CropMarks() {
  const cls = "absolute text-[color:var(--color-rule)]";
  return (
    <svg
      aria-hidden
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      {/* 四角的 L 形短线：长度 6（在 100 坐标系里） */}
      <path d="M0 0 h6 M0 0 v6" className={cls} stroke="currentColor" strokeWidth="0.5" fill="none" vectorEffect="non-scaling-stroke" />
      <path d="M100 0 h-6 M100 0 v6" className={cls} stroke="currentColor" strokeWidth="0.5" fill="none" vectorEffect="non-scaling-stroke" />
      <path d="M0 100 h6 M0 100 v-6" className={cls} stroke="currentColor" strokeWidth="0.5" fill="none" vectorEffect="non-scaling-stroke" />
      <path d="M100 100 h-6 M100 100 v-6" className={cls} stroke="currentColor" strokeWidth="0.5" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** 十字准星：图纸中心的定位标记（Blueprint Editorial 的标志元素之一）。 */
function Crosshair({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={`h-[11px] w-[11px] text-[color:var(--color-rule)] ${className}`}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.5"
    >
      <path d="M6 0.5 v11 M0.5 6 h11" />
      <circle cx="6" cy="6" r="2" />
    </svg>
  );
}

/**
 * 图纸的角标层：裁切标记 + 四角十字准星。
 * 叠在内容之下（`z-0`），内容之上不再覆盖任何东西，保证文字始终可读。
 */
export function SheetChrome() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 图纸内网格：8px 细格，比 body 的 32px 底纹更密，形成"图纸感"的层次 */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--color-rule) 0.5px, transparent 0.5px)," +
            "linear-gradient(to bottom, var(--color-rule) 0.5px, transparent 0.5px)",
          backgroundSize: "8px 8px",
        }}
      />
      <div className="relative h-full w-full p-[3px]">
        <CropMarks />
        <Crosshair className="absolute left-[10px] top-[10px]" />
        <Crosshair className="absolute right-[10px] top-[10px]" />
        <Crosshair className="absolute bottom-[10px] left-[10px]" />
        <Crosshair className="absolute bottom-[10px] right-[10px]" />
      </div>
    </div>
  );
}

/** 尺寸标注线：图纸左缘的短横线 + 端点小刻度（工程图的标注语言）。 */
export function SheetDimensionLine({ label }: { label: string }) {
  return (
    <div aria-hidden className="flex items-center gap-1 bp-hint text-[color:var(--color-ink-3)]">
      <svg width="14" height="6" viewBox="0 0 14 6" fill="none" stroke="currentColor" strokeWidth="0.5">
        <path d="M0 3 h14 M0 0.5 v5 M14 0.5 v5" />
      </svg>
      <span>{label}</span>
    </div>
  );
}
