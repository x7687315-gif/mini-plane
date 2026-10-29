/**
 * Anatomy V2 领域视图模型（Phase 1）。
 *
 * 唯一职责：把 API 类型映射成只读显示模型；不计算另一套进度，
 * 不推断 Task 依赖，不把 Worklog/Activity 混成历史快照。
 */

import type { Issue, IssuePriority } from "@/types/issue";
import type { ProjectPlan, ProjectStage } from "@/types/project";

export type AnatomyProgressSource = "plan" | "tasks";

/** 视觉色调只表达状态语义；颜色之外还有线型/形状差异（见 AnatomyScene）。 */
export type AnatomyTaskTone = "done" | "active" | "todo" | "cancelled";

export interface AnatomyTask {
  id: string;
  sequenceId: number;
  title: string;
  stateGroup: string;
  priority: IssuePriority;
  stageId: string | null;
  tone: AnatomyTaskTone;
}

export interface AnatomyStage {
  id: string;
  order: number;
  name: string;
  goal: string;
  recordedProgress: number;
  weight: number;
  isCurrent: boolean;
  tasks: AnatomyTask[];
}

export interface AnatomyViewModel {
  projectName: string;
  identifier: string;
  stages: AnatomyStage[];
  looseTasks: AnatomyTask[];
  nowTaskId: string | null;
  nextStageId: string | null;
  nextStageName: string | null;
  agentRunning: boolean;
  projectProgress: number | null;
  progressSource: AnatomyProgressSource | null;
}

export interface AnatomyStageCounts {
  total: number;
  done: number;
  active: number;
  todo: number;
  cancelled: number;
}

export interface AnatomyInput {
  projectName?: string;
  identifier: string;
  stages: readonly ProjectStage[];
  tasks: readonly Issue[];
  plan: ProjectPlan | null;
  nowTaskId?: string | null;
  agentRunning?: boolean;
  projectProgress?: number | null;
  progressSource?: AnatomyProgressSource | null;
}

export function taskTone(stateGroup: string): AnatomyTaskTone {
  if (stateGroup === "completed") return "done";
  if (stateGroup === "started") return "active";
  if (stateGroup === "cancelled") return "cancelled";
  return "todo";
}

function toTask(task: Issue): AnatomyTask {
  return {
    id: task.id,
    sequenceId: task.sequence_id,
    title: task.title,
    stateGroup: task.state.group,
    priority: task.priority,
    stageId: task.stage?.id ?? null,
    tone: taskTone(task.state.group),
  };
}

function sortStages(stages: readonly ProjectStage[]): ProjectStage[] {
  return [...stages].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    if (a.created_at !== b.created_at) return a.created_at.localeCompare(b.created_at);
    return a.id.localeCompare(b.id);
  });
}

/**
 * 选一个只读视图模型。
 *
 * - Stage 来自 `plan.stages`（调用方保证）；Task 的 `stage` 指向不存在的 Stage 时
 *   进入散件，避免伪造归属；
 * - NOW 只用调用方给的 `nowTaskId`（来自 `/projects/mine/`），不在这里按时间猜；
 * - 项目进度/来源只用调用方给的权威值；缺数据保持 null，不退回前端计算。
 */
export function selectAnatomyViewModel(input: AnatomyInput): AnatomyViewModel {
  const stages = sortStages(input.stages);
  const stageIds = new Set(stages.map((stage) => stage.id));
  const tasks = [...input.tasks].sort((a, b) => a.sequence_id - b.sequence_id);
  const byStage = new Map<string, AnatomyTask[]>();
  const looseTasks: AnatomyTask[] = [];

  for (const task of tasks) {
    const mapped = toTask(task);
    if (mapped.stageId && stageIds.has(mapped.stageId)) {
      const list = byStage.get(mapped.stageId) ?? [];
      list.push(mapped);
      byStage.set(mapped.stageId, list);
    } else {
      looseTasks.push({ ...mapped, stageId: null });
    }
  }

  const mappedStages: AnatomyStage[] = stages.map((stage) => ({
    id: stage.id,
    order: stage.order,
    name: stage.name,
    goal: stage.goal,
    recordedProgress: stage.progress,
    weight: stage.weight,
    isCurrent: stage.is_current,
    tasks: byStage.get(stage.id) ?? [],
  }));

  const allTaskIds = new Set(tasks.map((task) => task.id));
  const nowTaskId =
    input.nowTaskId && allTaskIds.has(input.nowTaskId) ? input.nowTaskId : null;
  const nextStageId =
    input.plan?.next_stage && stageIds.has(input.plan.next_stage.id)
      ? input.plan.next_stage.id
      : null;
  const nextStageName =
    nextStageId === null
      ? null
      : (stages.find((stage) => stage.id === nextStageId)?.name ?? null);

  return {
    projectName: input.projectName?.trim() || input.identifier,
    identifier: input.identifier,
    stages: mappedStages,
    looseTasks,
    nowTaskId,
    nextStageId,
    nextStageName,
    agentRunning: Boolean(input.agentRunning),
    projectProgress: input.projectProgress ?? null,
    progressSource: input.progressSource ?? null,
  };
}

export function stageById(
  viewModel: AnatomyViewModel,
  stageId: string | null,
): AnatomyStage | null {
  if (!stageId) return null;
  return viewModel.stages.find((stage) => stage.id === stageId) ?? null;
}

/** 仅统计已加载的 Task 状态；不参与项目进度计算。 */
export function stageTaskCounts(stage: AnatomyStage): AnatomyStageCounts {
  const counts: AnatomyStageCounts = {
    total: stage.tasks.length,
    done: 0,
    active: 0,
    todo: 0,
    cancelled: 0,
  };
  for (const task of stage.tasks) counts[task.tone] += 1;
  return counts;
}

/** 详情区默认选中：当前 Stage → 第一个 Stage → 无。 */
export function defaultStageId(viewModel: AnatomyViewModel): string | null {
  return (
    viewModel.stages.find((stage) => stage.isCurrent)?.id ??
    viewModel.stages[0]?.id ??
    null
  );
}

export function nowTaskOf(viewModel: AnatomyViewModel): AnatomyTask | null {
  if (!viewModel.nowTaskId) return null;
  for (const stage of viewModel.stages) {
    const found = stage.tasks.find((task) => task.id === viewModel.nowTaskId);
    if (found) return found;
  }
  return viewModel.looseTasks.find((task) => task.id === viewModel.nowTaskId) ?? null;
}
