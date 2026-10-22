/**
 * 图钉图标：自绘 inline SVG（项目红线：不用图标库）。实心=固定，空心=未固定。
 *
 * 从 IslandHeader 抽出：把手条（IslandDockBar）也要用同一个图标，
 * 两处各画一遍必然漂移（V2 的教训）。
 */

export function PinIcon({ filled }: { filled: boolean }) {
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
