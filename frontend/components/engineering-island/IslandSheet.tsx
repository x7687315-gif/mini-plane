/**
 * 一张图纸页 = 一个 Project（PRODUCT_REFACTOR_PLAN §17 / §19）。
 *
 * 纯展示：所有数据由 EngineeringIsland 注入。
 * 这样切页时"数据获取"和"视觉呈现"互不牵连，也便于单独看它长什么样。
 */

import type { AgentSessionLive } from "@/stores/agentSession";
import type { ProjectEngineering } from "@/types/project";
import { sheetPageLabel } from "@/features/engineering-island";
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
      className="relative border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] h-full"
      aria-label={`${project.name} 工程图纸`}
    >
      {/* 左上角 2px 竖条：全站"当前/激活"的统一视觉语言 */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[2px] bg-[color:var(--color-accent)]"
        aria-hidden
      />

      <header className="flex items-baseline justify-between gap-3 border-b border-dashed border-[color:var(--color-rule)] px-5 py-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-serif italic text-[15px] text-[color:var(--color-ink)]">
            {project.identifier}
          </span>
          <span className="bp-uppercase truncate">{sheetPageLabel(index, total)}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="bp-uppercase text-[color:var(--color-ink-3)]">
            {project.workspace_name}
          </span>
          {/* LIVE 指示器：仅在 Agent 真的有会话时才亮，避免"永远在线"的假信号 */}
          <span
            className="inline-block h-[6px] w-[6px] border border-[color:var(--color-rule)]"
            aria-hidden
          />
        </div>
      </header>

      <div className="px-5 py-4 space-y-4">
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
      </div>
    </article>
  );
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
