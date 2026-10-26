"use client";

import { useMemo, useState } from "react";

import type { Issue } from "@/types/issue";
import type { ProjectPlan, ProjectStage } from "@/types/project";
import {
  computeAnatomyLayout,
  nowTaskOf,
  selectAnatomyViewModel,
  stageById,
  type AnatomyProgressSource,
} from "@/features/anatomy";
import { AnatomyScene } from "./AnatomyScene";

export interface AnatomyPlateProps {
  identifier: string;
  projectName?: string;
  stages: ProjectStage[];
  tasks: Issue[];
  plan: ProjectPlan | null;
  nowTaskId: string | null;
  agentRunning: boolean;
  projectProgress: number | null;
  progressSource: AnatomyProgressSource | null;
  onOpenTask: (issueId: string) => void;
}

function ProgressSourceLabel({ source }: { source: AnatomyProgressSource | null }) {
  if (!source) return <span>—</span>;
  return <span>{source === "plan" ? "PLAN" : "TASKS"}</span>;
}

export function AnatomyPlate({
  identifier,
  projectName,
  stages,
  tasks,
  plan,
  nowTaskId,
  agentRunning,
  projectProgress,
  progressSource,
  onOpenTask,
}: AnatomyPlateProps) {
  const [focusId, setFocusId] = useState<string | null>(null);

  const viewModel = useMemo(
    () =>
      selectAnatomyViewModel({
        projectName,
        identifier,
        stages,
        tasks,
        plan,
        nowTaskId,
        agentRunning,
        projectProgress,
        progressSource,
      }),
    [projectName, identifier, stages, tasks, plan, nowTaskId, agentRunning, projectProgress, progressSource],
  );

  // 阶段删除后，旧的 focus id 自动退化；不需要在 effect 里 setState。
  const activeFocusId =
    focusId && viewModel.stages.some((stage) => stage.id === focusId) ? focusId : null;
  const layout = useMemo(
    () =>
      computeAnatomyLayout(
        viewModel,
        activeFocusId ? { mode: "focus", stageId: activeFocusId } : { mode: "overview" },
      ),
    [viewModel, activeFocusId],
  );
  const focusedStage = stageById(viewModel, activeFocusId);
  const nowTask = nowTaskOf(viewModel);
  const projectPct = viewModel.projectProgress;

  return (
    <div className="relative">
      <div className="border border-[color:var(--color-rule)] bg-[color:var(--color-paper)]">
        <div className="grid grid-cols-[minmax(0,1fr)_250px] gap-3 p-3 max-xl:grid-cols-1">
          <div className="min-w-0">
            <AnatomyScene
              layout={layout}
              identifier={viewModel.identifier}
              focusedStageId={activeFocusId}
              onFocusStage={setFocusId}
              onFocusOverview={() => setFocusId(null)}
              onOpenTask={onOpenTask}
            />
            {viewModel.stages.length === 0 && (
              <p className="px-2 py-2 text-[11.5px] text-[color:var(--color-ink-3)]">
                在工程台「调整」中添加第一个阶段，构件会在这里生长。
              </p>
            )}
          </div>

          <aside className="min-w-0 border border-[color:var(--color-rule)] p-3 max-xl:border-t max-xl:border-x-0 max-xl:border-b-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="fig-note font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
                Stage Index · 01—{String(viewModel.stages.length).padStart(2, "0")}
              </span>
              <span className="font-mono text-[9px] text-[color:var(--color-ink-3)]">
                {projectPct == null ? "—" : `${projectPct}%`} ·{" "}
                <ProgressSourceLabel source={viewModel.progressSource} />
              </span>
            </div>

            <div className="mt-2">
              {viewModel.stages.length === 0 && (
                <p className="py-2 text-[11.5px] text-[color:var(--color-ink-3)]">还没有阶段。</p>
              )}
              {viewModel.stages.map((stage) => (
                <button
                  key={stage.id}
                  type="button"
                  aria-pressed={activeFocusId === stage.id}
                  aria-label={`聚焦阶段 ${stage.name}`}
                  onClick={() => setFocusId(activeFocusId === stage.id ? null : stage.id)}
                  className="grid w-full grid-cols-[24px_minmax(0,1fr)_28px_34px] items-baseline gap-1 border-b border-dashed border-[color:var(--color-rule)] py-1.5 text-left hover:bg-[color:var(--color-accent-soft)]"
                >
                  <span className="font-mono text-[10px] text-[color:var(--color-ink-3)]">
                    {String(stage.order).padStart(2, "0")}
                  </span>
                  <span className={`truncate text-[11.5px] ${stage.isCurrent ? "font-medium text-[color:var(--color-accent)]" : "text-[color:var(--color-ink)]"}`}>
                    {stage.name}
                    {stage.isCurrent ? " ·" : ""}
                  </span>
                  <span className="text-right font-mono text-[10px] text-[color:var(--color-ink-2)]">{stage.tasks.length}</span>
                  <span className="text-right font-mono text-[10px] text-[color:var(--color-ink-2)]">{stage.recordedProgress}%</span>
                </button>
              ))}
              {viewModel.looseTasks.length > 0 && (
                <div className="grid grid-cols-[24px_minmax(0,1fr)_28px_34px] items-baseline gap-1 py-1.5 text-[11.5px] text-[color:var(--color-ink-2)]">
                  <span className="font-mono text-[10px] text-[color:var(--color-ink-3)]">——</span>
                  <span>散件（未归属）</span>
                  <span className="text-right font-mono text-[10px]">{viewModel.looseTasks.length}</span>
                  <span />
                </div>
              )}
            </div>

            <div className="mt-2 space-y-1 font-mono text-[9.5px] text-[color:var(--color-ink-3)]">
              <div>{viewModel.nextStageName ? `NEXT STAGE · ${viewModel.nextStageName}` : "NEXT STAGE · —"}</div>
              <div>
                {nowTask ? `NOW · ${viewModel.identifier}-${nowTask.sequenceId}` : "NOW · —"}
              </div>
              <div className={viewModel.agentRunning ? "text-[color:var(--color-success)]" : ""}>
                {viewModel.agentRunning ? "● AGENT · RUNNING" : "AGENT · IDLE"}
              </div>
            </div>

            {focusedStage && (
              <div className="mt-3 border border-[color:var(--color-accent)] p-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--color-ink-3)]">
                    Stage {String(focusedStage.order).padStart(2, "0")} 构件
                  </span>
                  <button
                    type="button"
                    className="text-[10.5px] text-[color:var(--color-accent)]"
                    onClick={() => setFocusId(null)}
                  >
                    ◂ 整体
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] leading-[1.5] text-[color:var(--color-ink-2)]">
                  {focusedStage.goal || "（未填写阶段目标）"}
                </p>
                <p className="mt-1 font-mono text-[9.5px] text-[color:var(--color-ink-3)]">
                  记录进度 {focusedStage.recordedProgress}% · 权重 {focusedStage.weight} · 构件{" "}
                  {focusedStage.tasks.length}
                </p>
                <div className="mt-2 max-h-52 overflow-auto">
                  {focusedStage.tasks.length === 0 && (
                    <p className="py-1 text-[11px] text-[color:var(--color-ink-3)]">该阶段还没有任务构件。</p>
                  )}
                  {focusedStage.tasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onOpenTask(task.id)}
                      className="flex w-full items-baseline gap-2 border-b border-dashed border-[color:var(--color-rule)] py-1.5 text-left hover:bg-[color:var(--color-accent-soft)]"
                    >
                      <span className="font-mono text-[9.5px] text-[color:var(--color-ink-3)]">
                        {viewModel.identifier}-{task.sequenceId}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11.5px]">{task.title}</span>
                      <span className="font-mono text-[8.5px] uppercase text-[color:var(--color-ink-3)]">
                        {task.stateGroup}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[color:var(--color-rule)] px-4 py-2 font-mono text-[9px] text-[color:var(--color-ink-3)]">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 border border-[color:var(--color-ink-2)] bg-[color:var(--color-paper)]" aria-hidden />
            Stage 构件
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 bg-[color:var(--color-accent)]" aria-hidden />
            已完成
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)]" aria-hidden />
            进行中 / NOW
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 border border-dashed border-[color:var(--color-ink-2)]" aria-hidden />
            待办 / 取消
          </span>
          <span>位置与体量只表达结构；不绘制 Task 依赖线。</span>
        </div>

        <div className="flex justify-between border-t border-[color:var(--color-rule)] px-4 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[color:var(--color-ink-3)]">
          <span>
            {viewModel.identifier} / project anatomy / {new Date().getFullYear()}
          </span>
          <span>plate 01 · read-only · 数据为真实投影</span>
        </div>
      </div>
    </div>
  );
}
