"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { DimProgress } from "@/components/ui/v2";
import type { Activity } from "@/types/activity";
import type { Issue } from "@/types/issue";
import type { ProjectPlan, ProjectStage, Worklog } from "@/types/project";
import {
  anatomyCounts,
  changeMarkerMap,
  computeAnatomyLayout,
  defaultStageId,
  deriveAnatomyChanges,
  normalizeViewState,
  nowTaskOf,
  selectAnatomyViewModel,
  stageById,
  stageTaskCounts,
  type AnatomyProgressSource,
  type AnatomyViewMode,
  type AnatomyViewState,
} from "@/features/anatomy";
import { AnatomyHistory } from "./AnatomyHistory";
import { AnatomyScene } from "./AnatomyScene";

export interface AnatomyPlateProps {
  identifier: string;
  projectName?: string;
  stages: ProjectStage[];
  tasks: Issue[];
  activities: Activity[];
  worklogs: Worklog[];
  plan: ProjectPlan | null;
  nowTaskId: string | null;
  agentRunning: boolean;
  projectProgress: number | null;
  progressSource: AnatomyProgressSource | null;
  viewState: AnatomyViewState;
  onViewStateChange: (state: AnatomyViewState) => void;
  tasksComplete?: boolean;
  tasksLoading?: boolean;
  tasksError?: boolean;
  tasksTruncated?: boolean;
  tasksTotal?: number | null;
  onRetryTasks?: () => void;
  onOpenTask: (issueId: string) => void;
}

function ProgressSourceLabel({ source }: { source: AnatomyProgressSource | null }) {
  if (!source) return <span>—</span>;
  return <span>{source === "plan" ? "PLAN" : "TASKS"}</span>;
}

function ViewToggle({
  mode,
  onChange,
}: {
  mode: AnatomyViewMode;
  onChange: (mode: AnatomyViewMode) => void;
}) {
  const item = (value: AnatomyViewMode, label: string) => (
    <button
      key={value}
      type="button"
      aria-pressed={mode === value}
      onClick={() => onChange(value)}
      className={
        mode === value
          ? "bg-[color:var(--color-ink)] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-paper)]"
          : "border border-[color:var(--color-rule)] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
      }
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-1" role="group" aria-label="图纸视图">
      {item("growth", "生长 / Growth")}
      {item("structure", "结构 / Structure")}
    </div>
  );
}

function StageIndex({
  stages,
  looseCount,
  selectedStageId,
  onSelect,
}: {
  stages: ReturnType<typeof selectAnatomyViewModel>["stages"];
  looseCount: number;
  selectedStageId: string | null;
  onSelect: (stageId: string) => void;
}) {
  return (
    <aside
      className="min-w-0 border-b border-[color:var(--color-rule)] lg:border-b-0 lg:border-r"
      aria-label="阶段索引"
    >
      <div className="flex items-baseline justify-between gap-2 px-3 py-2 font-mono text-[8.5px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
        <span>Stage Index</span>
        <span>01—{String(stages.length).padStart(2, "0")}</span>
      </div>
      <div className="flex min-w-max gap-1 overflow-x-auto px-2 pb-2 lg:block lg:max-h-[62vh] lg:min-w-0 lg:overflow-x-hidden lg:overflow-y-auto lg:px-0 lg:pb-0">
        {stages.length === 0 && (
          <p className="px-3 py-2 text-[11px] text-[color:var(--color-ink-3)]">还没有阶段。</p>
        )}
        {stages.map((stage) => {
          const selected = selectedStageId === stage.id;
          return (
            <button
              key={stage.id}
              type="button"
              aria-pressed={selected}
              aria-label={`选择阶段 ${stage.name}`}
              onClick={() => onSelect(stage.id)}
              className={
                selected
                  ? "grid w-[160px] grid-cols-[20px_minmax(0,1fr)] items-baseline gap-x-1.5 border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-2 py-1.5 text-left lg:w-full lg:border-x-0 lg:border-t-0 lg:border-b lg:border-b-[color:var(--color-rule)]"
                  : "grid w-[160px] grid-cols-[20px_minmax(0,1fr)] items-baseline gap-x-1.5 border border-[color:var(--color-rule)] px-2 py-1.5 text-left hover:bg-[color:var(--color-accent-soft)] lg:w-full lg:border-x-0 lg:border-t-0 lg:border-b lg:border-b-[color:var(--color-rule)]"
              }
            >
              <span className="row-span-2 font-mono text-[9.5px] text-[color:var(--color-ink-3)]">
                {String(stage.order).padStart(2, "0")}
              </span>
              <span
                className={
                  stage.isCurrent
                    ? "truncate font-serif text-[13px] italic text-[color:var(--color-accent)]"
                    : "truncate font-serif text-[13px] italic text-[color:var(--color-ink)]"
                }
              >
                {stage.name}
              </span>
              <span className="font-mono text-[8.5px] text-[color:var(--color-ink-3)]">
                {stage.recordedProgress}% · {stage.tasks.length} TASK
              </span>
            </button>
          );
        })}
        {looseCount > 0 && (
          <div className="grid w-[160px] grid-cols-[20px_minmax(0,1fr)] items-baseline gap-x-1.5 px-2 py-1.5 text-[11px] text-[color:var(--color-ink-2)] lg:w-full">
            <span className="row-span-2 font-mono text-[9.5px] text-[color:var(--color-ink-3)]">——</span>
            <span>散件（未归属）</span>
            <span className="font-mono text-[8.5px] text-[color:var(--color-ink-3)]">
              {looseCount} TASK
            </span>
          </div>
        )}
      </div>
      <p className="hidden px-3 py-2 font-mono text-[9px] leading-[1.6] text-[color:var(--color-ink-3)] lg:block">
        竖向累积是生长，横向分离是结构。
        <br />
        顺序只表达阶段次序，不画任务依赖。
      </p>
    </aside>
  );
}

export function AnatomyPlate({
  identifier,
  projectName,
  stages,
  tasks,
  activities,
  worklogs,
  plan,
  nowTaskId,
  agentRunning,
  projectProgress,
  progressSource,
  viewState,
  onViewStateChange,
  tasksComplete = true,
  tasksLoading = false,
  tasksError = false,
  tasksTruncated = false,
  tasksTotal = null,
  onRetryTasks,
  onOpenTask,
}: AnatomyPlateProps) {
  // 页面挂载时刻：早于它的事件只作为历史，不标“刚刚新增”。
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [mountedAt] = useState(() => Date.now());
  const canvasRef = useRef<HTMLDivElement>(null);
  const scrollByMode = useRef<Record<AnatomyViewMode, { top: number; left: number }>>({
    growth: { top: 0, left: 0 },
    structure: { top: 0, left: 0 },
  });
  const changes = useMemo(
    () => deriveAnatomyChanges(activities, mountedAt, tasks),
    [activities, mountedAt, tasks],
  );
  const markers = useMemo(() => changeMarkerMap(changes), [changes]);

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
    [
      projectName,
      identifier,
      stages,
      tasks,
      plan,
      nowTaskId,
      agentRunning,
      projectProgress,
      progressSource,
    ],
  );

  const stageIds = useMemo(() => viewModel.stages.map((stage) => stage.id), [viewModel.stages]);
  const fallbackStageId = defaultStageId(viewModel);
  const effectiveState = normalizeViewState(viewState, stageIds, fallbackStageId);
  const layout = computeAnatomyLayout(viewModel, effectiveState);
  const selectedStage = stageById(viewModel, effectiveState.selectedStageId);
  const selectedCounts = selectedStage ? stageTaskCounts(selectedStage) : null;
  const counts = anatomyCounts(viewModel);
  const nowTask = nowTaskOf(viewModel);
  const projectPct = viewModel.projectProgress;

  const selectStage = (stageId: string) => {
    onViewStateChange({ ...effectiveState, selectedStageId: stageId });
  };
  const changeMode = (mode: AnatomyViewMode) => {
    // 先记住当前视图的滚动位置；结构图高度通常更小，切换时浏览器会把
    // growth 的 scrollTop 夹回 0，切回来就丢上下文。
    const el = canvasRef.current;
    if (el) {
      scrollByMode.current[effectiveState.mode] = {
        top: el.scrollTop,
        left: el.scrollLeft,
      };
    }
    onViewStateChange({ ...effectiveState, mode });
  };

  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const saved = scrollByMode.current[effectiveState.mode];
    el.scrollTop = saved.top;
    el.scrollLeft = saved.left;
  }, [effectiveState.mode]);

  const loadedLabel =
    tasksTotal == null ? String(tasks.length) : `${tasks.length} / ${tasksTotal}`;
  const incompleteNote = tasksError
    ? `完整任务加载失败 · 当前 ${loadedLabel}；图纸暂不完整。`
    : tasksTruncated
      ? `任务过多，图纸只含前 ${loadedLabel}；其余任务未画入构件。`
      : tasksLoading
        ? `正在加载完整任务 · 当前 ${loadedLabel}；图纸暂不完整。`
        : null;

  const modeLabel =
    effectiveState.mode === "growth"
      ? "GROWTH / VERTICAL ACCUMULATION"
      : "STRUCTURE / EXPLODED ASSEMBLY";

  return (
    <div className="relative">
      <div className="border border-[color:var(--color-rule)] bg-[color:var(--color-paper)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--color-rule)] px-3 py-2">
          <span className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
            Project Anatomy · Structure / Growth
          </span>
          <ViewToggle mode={effectiveState.mode} onChange={changeMode} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[160px_minmax(0,1fr)] xl:grid-cols-[160px_minmax(0,1fr)_270px]">
          <div className="lg:col-start-1 lg:row-start-1">
            <StageIndex
              stages={viewModel.stages}
              looseCount={viewModel.looseTasks.length}
              selectedStageId={effectiveState.selectedStageId}
              onSelect={selectStage}
            />
          </div>

          <section
            className="min-w-0 lg:col-start-2 lg:row-start-1"
            aria-label="工程图主视图"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 pt-2 font-mono text-[8.5px] uppercase tracking-[0.14em] text-[color:var(--color-ink-3)]">
              <span>{modeLabel}</span>
              <span>
                {counts.stages} STAGES · {counts.tasks} TASKS · {counts.loose} UNASSIGNED
              </span>
            </div>

            {incompleteNote && (
              <div className="mx-3 mt-2 flex flex-wrap items-center gap-2 border border-dashed border-[color:var(--color-rule)] px-2 py-1 font-mono text-[9px] text-[color:var(--color-ink-2)]">
                <span>{incompleteNote}</span>
                {tasksError && onRetryTasks && (
                  <button
                    type="button"
                    className="text-[color:var(--color-accent)] underline-offset-2 hover:underline"
                    onClick={onRetryTasks}
                  >
                    重试
                  </button>
                )}
              </div>
            )}

            <div
              ref={canvasRef}
              className="anatomy-canvas mt-1 max-h-[70vh] overflow-auto max-lg:max-h-none"
            >
              <AnatomyScene
                layout={layout}
                identifier={viewModel.identifier}
                changeMarkers={markers}
                onSelectStage={selectStage}
                onOpenTask={onOpenTask}
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 font-mono text-[8.5px] text-[color:var(--color-ink-3)]">
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 border border-[color:var(--color-ink-2)] bg-[color:var(--color-paper)]" aria-hidden />
                待处理 / 待规划
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)]" aria-hidden />
                进行中 / NOW
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 bg-[color:var(--color-accent)]" aria-hidden />
                已完成
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 border border-dashed border-[color:var(--color-ink-3)]" aria-hidden />
                已取消
              </span>
              <span>点击阶段查看详情 · Tab + Enter 可达 · 不画 Task 依赖</span>
            </div>
          </section>

          <aside
            className="min-w-0 border-t border-[color:var(--color-rule)] lg:col-span-2 lg:row-start-2 xl:col-span-1 xl:col-start-3 xl:row-start-1 xl:border-t-0 xl:border-l"
            aria-live="polite"
            aria-label="当前构件详情"
          >
            <div className="p-3 xl:max-h-[74vh] xl:overflow-auto">
              {selectedStage && selectedCounts ? (
                <>
                  <div className="flex items-baseline justify-between gap-2 font-mono text-[8.5px] uppercase tracking-[0.14em] text-[color:var(--color-ink-3)]">
                    <span>
                      Selected / Stage {String(selectedStage.order).padStart(2, "0")}
                    </span>
                    <span className={selectedStage.isCurrent ? "text-[color:var(--color-accent)]" : ""}>
                      {selectedStage.isCurrent ? "Current" : `${selectedStage.recordedProgress}%`}
                    </span>
                  </div>
                  <h2 className="mt-1 font-serif text-[24px] italic leading-tight text-[color:var(--color-ink)]">
                    {selectedStage.name}
                  </h2>
                  <p className="mt-1.5 text-[11.5px] leading-[1.55] text-[color:var(--color-ink-2)]">
                    {selectedStage.goal || "（未填写阶段目标）"}
                  </p>

                  <div className="mt-2.5 flex items-center gap-2">
                    <DimProgress value={selectedStage.recordedProgress} className="flex-1" />
                    <span className="font-mono text-[10px] text-[color:var(--color-ink-2)]">
                      {selectedStage.recordedProgress}%
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2 font-mono text-[8.5px] uppercase tracking-[0.12em] text-[color:var(--color-ink-3)]">
                    <span>
                      Recorded · Weight {selectedStage.weight}
                    </span>
                    <span>Stage Recorded</span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 border-y border-[color:var(--color-rule)]">
                    <div className="border-r border-[color:var(--color-rule)] px-2 py-1.5">
                      <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[color:var(--color-ink-3)]">
                        任务总数
                      </div>
                      <div className="font-mono text-[19px] leading-tight text-[color:var(--color-ink)]">
                        {String(selectedCounts.total).padStart(2, "0")}
                      </div>
                    </div>
                    <div className="border-r border-[color:var(--color-rule)] px-2 py-1.5">
                      <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[color:var(--color-ink-3)]">
                        已完成
                      </div>
                      <div className="font-mono text-[19px] leading-tight text-[color:var(--color-accent)]">
                        {String(selectedCounts.done).padStart(2, "0")}
                      </div>
                    </div>
                    <div className="px-2 py-1.5">
                      <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[color:var(--color-ink-3)]">
                        进行中
                      </div>
                      <div className="font-mono text-[19px] leading-tight text-[color:var(--color-ink)]">
                        {String(selectedCounts.active).padStart(2, "0")}
                      </div>
                    </div>
                  </div>
                  <p className="mt-1 font-mono text-[8.5px] text-[color:var(--color-ink-3)]">
                    待办 {selectedCounts.todo} · 已取消 {selectedCounts.cancelled} · 记录进度不是任务完成率
                  </p>

                  <div className="mt-3 flex items-baseline justify-between font-mono text-[8.5px] uppercase tracking-[0.14em] text-[color:var(--color-ink-3)]">
                    <span>Tasks in Stage</span>
                    <span>{selectedCounts.total}</span>
                  </div>
                  <div className="mt-1 max-h-56 overflow-auto">
                    {selectedStage.tasks.length === 0 && (
                      <p className="py-1.5 text-[11px] text-[color:var(--color-ink-3)]">
                        该阶段还没有任务构件。
                      </p>
                    )}
                    {selectedStage.tasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onOpenTask(task.id)}
                        className="flex w-full items-baseline gap-2 border-b border-dashed border-[color:var(--color-rule)] py-1.5 text-left hover:bg-[color:var(--color-accent-soft)]"
                      >
                        <span className="font-mono text-[9px] text-[color:var(--color-ink-3)]">
                          {viewModel.identifier}-{task.sequenceId}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11.5px]">{task.title}</span>
                        {markers.get(task.id) && (
                          <span className="font-mono text-[8px] tracking-[0.1em] text-[color:var(--color-accent)]">
                            {markers.get(task.id) === "created" ? "NEW" : "UPD"}
                          </span>
                        )}
                        <span className="font-mono text-[8px] uppercase text-[color:var(--color-ink-3)]">
                          {task.stateGroup}
                        </span>
                      </button>
                    ))}
                  </div>

                  {changes.length > 0 && (
                    <div className="mt-3 border-t border-dashed border-[color:var(--color-rule)] pt-2">
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[color:var(--color-ink-3)]">
                          Recent · Activity
                        </span>
                        <span className="font-mono text-[9px] text-[color:var(--color-accent)]">
                          {changes.length}
                        </span>
                      </div>
                      <div className="mt-1">
                        {changes.map((change) => (
                          <button
                            key={change.id}
                            type="button"
                            onClick={() => onOpenTask(change.taskId)}
                            className="flex w-full items-baseline gap-1.5 border-b border-dashed border-[color:var(--color-rule)] py-1 text-left hover:bg-[color:var(--color-accent-soft)]"
                          >
                            <span className="font-mono text-[8px] tracking-[0.08em] text-[color:var(--color-accent)]">
                              {change.kind === "created" ? "NEW" : "UPD"}
                            </span>
                            <span className="font-mono text-[8.5px] text-[color:var(--color-ink-3)]">
                              {viewModel.identifier}-{change.sequenceId}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[10.5px]">{change.title}</span>
                            <span className="font-mono text-[8px] text-[color:var(--color-ink-3)]">
                              {change.recordedAt.slice(11, 16)}Z
                            </span>
                          </button>
                        ))}
                        <p className="pt-1 font-mono text-[8px] text-[color:var(--color-ink-3)]">
                          来源：Activity · 仅显示挂载后的真实事件；不是历史回放
                        </p>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    className="v2-ia mt-2"
                    aria-expanded={recordsOpen}
                    onClick={() => setRecordsOpen((value) => !value)}
                  >
                    <span className="mk" aria-hidden>▸</span>
                    记录 · {worklogs.length + activities.length} · 当前已加载
                  </button>
                  {recordsOpen && <AnatomyHistory worklogs={worklogs} activities={activities} />}
                </>
              ) : (
                <div className="py-6 text-center">
                  <p className="font-serif text-[20px] italic text-[color:var(--color-ink-2)]">
                    这张图纸还没有结构。
                  </p>
                  <p className="mt-1 text-[11px] text-[color:var(--color-ink-3)]">
                    在工程台「调整」中添加第一个阶段，构件会在这里生长。
                  </p>
                </div>
              )}

              <div className="mt-3 space-y-1 border-t border-dashed border-[color:var(--color-rule)] pt-2 font-mono text-[8.5px] text-[color:var(--color-ink-3)]">
                <div>
                  {viewModel.nextStageName
                    ? `NEXT STAGE · ${viewModel.nextStageName}`
                    : "NEXT STAGE · —"}
                </div>
                <div>
                  {nowTask ? `NOW · ${viewModel.identifier}-${nowTask.sequenceId}` : "NOW · —"}
                </div>
                <div className={viewModel.agentRunning ? "text-[color:var(--color-success)]" : ""}>
                  {viewModel.agentRunning ? "● AGENT · RUNNING" : "AGENT · IDLE"}
                </div>
                <div>
                  {projectPct == null ? "—" : `${projectPct}%`} ·{" "}
                  <ProgressSourceLabel source={viewModel.progressSource} />
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--color-rule)] px-4 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
          <span>
            {viewModel.identifier} / project anatomy / {new Date().getFullYear()}
          </span>
          <span>
            {effectiveState.mode} · read-only ·{" "}
            {tasksComplete ? "full task projection" : "partial task projection"}
          </span>
        </div>
      </div>
    </div>
  );
}
