/**
 * 一张图纸页 = 一个 Project（PRODUCT_REFACTOR_PLAN §17 / §19）。
 *
 * 纯展示：所有数据由 EngineeringIsland 注入。
 * 这样切页时"数据获取"和"视觉呈现"互不牵连，也便于单独看它长什么样。
 */

import type { AgentSessionLive } from "@/stores/agentSession";
import type { ProjectEngineering } from "@/types/project";
import { sheetPageLabel } from "@/features/engineering-island";
import { SheetChrome, SheetDimensionLine } from "./SheetChrome";
import {
  IslandAgentStatus,
  IslandNowNext,
  IslandProgress,
  IslandToday,
} from "./IslandSheetParts";

export interface IslandTodayData {
  titles: readonly string[];
  count: number;
  loading: boolean;
}

export function IslandSheet({
  project,
  index,
  total,
  today,
  live,
}: {
  project: ProjectEngineering;
  index: number;
  total: number;
  today: IslandTodayData;
  live: AgentSessionLive | null;
}) {
  return (
    <article
      className="relative h-full overflow-hidden border border-[color:var(--color-rule)] bg-[color:var(--color-paper)]"
      aria-label={`${project.identifier} · ${project.name} 工程图纸`}
    >
      <SheetChrome />

      {/* 双线框：工程图的外框 + 内框（内框再退 3px），只用 0.5px，不用阴影 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[3px] border border-[color:var(--color-rule)] opacity-60"
      />

      {/* 左上角 2px 竖条：全站「当前/激活」的统一视觉语言 */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[2px] bg-[color:var(--color-accent)]"
        aria-hidden
      />

      <header className="relative flex items-baseline justify-between gap-3 border-b border-dashed border-[color:var(--color-rule)] px-5 py-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-serif italic text-[15px] text-[color:var(--color-ink)]">
            {project.identifier}
          </span>
          <span className="bp-uppercase truncate">{sheetPageLabel(index, total)}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* REV 标注：图纸的修订号。个人单机软件没有团队版本流，
              这里用「最近活动」是否在今天内来决定要不要打星标（今天动过 = 本地最新）。 */}
          <span className="bp-uppercase text-[color:var(--color-ink-3)]">
            REV {isTouchedToday(project.last_activity) ? "●" : "00"}
          </span>
          <span className="bp-uppercase text-[color:var(--color-ink-3)]">
            {project.workspace_name}
          </span>
          <span
            className="inline-block h-[6px] w-[6px] border border-[color:var(--color-rule)]"
            aria-hidden
          />
        </div>
      </header>

      <div className="relative px-5 py-4 space-y-4">
        <div>
          <h2 className="font-serif text-[20px] leading-tight text-[color:var(--color-ink)]">
            {project.name}
          </h2>
          <div className="bp-uppercase mt-1 text-[color:var(--color-ink-3)]">
            {project.current_stage ?? "未设阶段"}
          </div>
        </div>

        <IslandProgress progress={project.progress} />
        <IslandNowNext nowTask={project.now_task} nextTask={project.next_task} />
        <IslandToday titles={today.titles} count={today.count} loading={today.loading} />
        <IslandAgentStatus running={project.agent_running} live={live} />

        {/* 页脚：图号 + 尺寸标注线 —— 图纸必须有"这张是第几张、画的是什么"。
            刻意用 div 而不是 <footer>：它是图纸的说明条，页面真正的页脚在 AppShell 里，
            一个视图里出现两个 footer 地标会让读屏的地标导航变得含糊。 */}
        <div className="flex items-center justify-between border-t border-dashed border-[color:var(--color-rule)] pt-2">
          <span className="bp-uppercase text-[color:var(--color-ink-3)]">
            FIG · {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </span>
          <SheetDimensionLine label="MY ENGINEERING · LOCAL" />
        </div>
      </div>
    </article>
  );
}

/** 最近一次活动是否在今天（用于 REV 的实心/空心标记）。无效日期按"没动过"处理。 */
function isTouchedToday(lastActivity: string | null): boolean {
  if (!lastActivity) return false;
  const t = Date.parse(lastActivity);
  if (Number.isNaN(t)) return false;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return t >= start;
}

/** Resting：计划 §18 的最小态，40–48px，"尽量不打扰工作"。 */
export function IslandResting({
  project,
  percent,
  onExpand,
}: {
  project: ProjectEngineering;
  percent: number;
  onExpand: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={`展开 ${project.name} 工程图纸`}
      className="w-full flex items-center gap-3 border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] px-4 h-[44px] text-left transition-colors duration-[var(--duration-fast)] hover:border-[color:var(--color-ink-2)]"
    >
      <span className="font-serif italic text-[14px] shrink-0">
        {project.identifier}
      </span>
      <span className="text-[12px] text-[color:var(--color-ink-2)] truncate flex-1">
        {project.name}
      </span>
      <span className="font-mono text-[11px] tabular-nums text-[color:var(--color-ink-2)]">
        {percent}%
      </span>
      <span
        className="inline-block h-[6px] w-[6px] bg-[color:var(--color-accent)]"
        aria-hidden
      />
    </button>
  );
}
