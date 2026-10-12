/**
 * 项目摘要卡片（Island V2 · 规格 §2 的「六个问题」）。
 *
 * 每张卡片必须回答：Progress / Stage / NOW / STEP / HOW / NEXT / DONE，外加 AGENT 状态。
 *
 * 两条红线（规格 §2，改动前请先读）：
 * 1. **STEP / HOW 只能来自 Agent 上报**（阶段 3 的 `AgentSession.current_step` /
 *    `method_summary`）。本阶段后端还没这些字段，所以恒定显示约定文案
 *    `EMPTY_STEP` / `EMPTY_HOW` —— 不用任务描述冒充，不猜。
 * 2. **Task 与 Worklog 语义不合并**：DONE 有标题清单时用清单（阶段 3 的 `recent_done`），
 *    本阶段回退为「已完成 N 项」计数（`done_tasks` 是真实统计，不是推测），
 *    两者都没有才显示 `EMPTY_DONE`。**不许**用今日日志结论冒充已完成任务。
 *
 * 视觉：这是 Island 专属例外区域（DESIGN.md §3.3）—— 卡片 12–16px 圆角 + 单层淡阴影，
 * 但配色 / 字体 / 细线 / 留白仍守 Blueprint Editorial。圆角只写在本目录内，不外溢。
 */

import { useState } from "react";
import {
  EMPTY_DONE,
  EMPTY_HOW,
  EMPTY_NEXT,
  EMPTY_STAGE,
  EMPTY_STEP,
  doneSummary,
  progressPercent,
  truncate,
} from "@/features/engineering-island";
import type { AgentSessionLive } from "@/stores/agentSession";
import type { ProjectEngineering } from "@/types/project";
import { IslandAgentStatus, IslandProgress } from "./IslandSheetParts";

/** HOW / STEP 的截断长度：一行放不下就截，展开后读全文（规格 §2）。 */
const SUMMARY_MAX = 48;

export function ProjectSummaryCard({
  project,
  live,
}: {
  project: ProjectEngineering;
  live: AgentSessionLive | null | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const percent = progressPercent(project.progress);
  const done = doneSummary(project.done_tasks);
  const stage = project.current_stage?.trim() || EMPTY_STAGE;
  const now = project.now_task?.trim() || null;
  const next = project.next_task?.trim() || null;

  // 本阶段 STEP / HOW 恒为占位（后端字段在阶段 3 落地）。
  // 留成显式常量而不是写死字符串：阶段 3 接入时只改这两行，E2E 的断言也已共享同一常量。
  const step: string | null = null;
  const how: string | null = null;

  return (
    <article
      aria-label={`${project.name} 摘要`}
      data-testid="project-summary-card"
      className="rounded-[14px] border border-[color:var(--color-rule)] bg-[color:var(--color-panel)] p-4 shadow-[0_1px_2px_rgba(27,26,23,0.06)]"
    >
      {/* 抬头：标识符 + 名称 + 进度 */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="bp-uppercase text-[color:var(--color-ink-3)]">{project.identifier}</div>
          <h3 className="truncate font-serif italic text-[20px] leading-tight">{project.name}</h3>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[13px] tabular-nums text-[color:var(--color-accent)]">
            {percent}%
          </div>
          <div className="bp-uppercase text-[color:var(--color-ink-3)]">{stage}</div>
        </div>
      </div>

      <div className="mt-3">
        <IslandProgress progress={project.progress} />
      </div>

      {/* 六问 */}
      <dl className="mt-4 space-y-3">
        <Row label="NOW">
          {now ? (
            <span className="border-l-2 border-[color:var(--color-accent)] pl-2">{now}</span>
          ) : (
            <Empty />
          )}
        </Row>

        <Row label="STEP">
          <span className="text-[color:var(--color-ink-2)]">{step ?? EMPTY_STEP}</span>
          {step ? null : (
            <span className="ml-2 text-[11px] text-[color:var(--color-ink-3)]">
              （Agent 上报后显示）
            </span>
          )}
        </Row>

        <Row label="HOW">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="text-left text-[color:var(--color-ink-2)] underline decoration-[color:var(--color-rule)] decoration-dotted underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-[color:var(--color-ink)]"
          >
            {how ? (expanded ? how : truncate(how, SUMMARY_MAX)) : EMPTY_HOW}
          </button>
        </Row>

        <Row label="NEXT">
          <span className="text-[color:var(--color-ink-2)]">{next ?? EMPTY_NEXT}</span>
        </Row>

        <Row label="DONE">
          {done.kind === "list" ? (
            <ul className="space-y-1">
              {done.titles.map((title, i) => (
                <li key={`${title}-${i}`} className="flex gap-2">
                  <span className="text-[color:var(--color-accent)]" aria-hidden>
                    ✓
                  </span>
                  <span className="text-[color:var(--color-ink-2)]">{title}</span>
                </li>
              ))}
            </ul>
          ) : done.kind === "count" ? (
            <span className="text-[color:var(--color-ink-2)]">
              已完成 {done.count} 项（明细在阶段 3 接入）
            </span>
          ) : (
            <span className="text-[color:var(--color-ink-3)]">{EMPTY_DONE}</span>
          )}
        </Row>
      </dl>

      <div className="mt-4 border-t border-[color:var(--color-rule)] pt-3">
        <IslandAgentStatus running={project.agent_running} live={live} />
      </div>
    </article>
  );
}

/** 图纸字段行：小字大写标签 + 内容。与 IslandSheetParts.Field 同一语汇。 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[52px_1fr] items-baseline gap-3">
      <dt className="bp-uppercase text-[color:var(--color-ink-3)]">{label}</dt>
      <dd className="text-[13px] leading-[1.55] text-[color:var(--color-ink)]">{children}</dd>
    </div>
  );
}

/** 缺失值的统一表达：约定文案，不留白（空白会被读成排版漏了）。 */
function Empty() {
  return <span className="text-[color:var(--color-ink-3)]">—</span>;
}
