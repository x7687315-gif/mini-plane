/**
 * Anatomy V2 Phase 0 fixtures F0–F10.
 *
 * 纯数据，不依赖浏览器/网络；用于 model/layout 单测与后续 E2E 造数参考。
 * 真实 API 形状以 docs/api/10-canonical-projects.md 为准；这里只冻结“输入矩阵”，
 * 不把 fixture 当成真实项目数据。
 */

import type { Issue, IssuePriority } from "@/types/issue";
import type { IssueState, ProjectPlan, ProjectStage } from "@/types/project";

export interface AnatomyFixture {
  name: string;
  identifier: string;
  stages: ProjectStage[];
  tasks: Issue[];
  plan: ProjectPlan | null;
  nowTaskId: string | null;
  agentRunning: boolean;
  projectProgress: number;
  progressSource: "plan" | "tasks";
}

const TS = "2026-10-26T00:00:00Z";

function state(group: string, name: string, color: string, sort: number): IssueState {
  return { id: `state-${group}`, name, group, color, sort_order: sort };
}

const BACKLOG = state("backlog", "Backlog", "#94a3b8", 1);
const TODO = state("unstarted", "Todo", "#eab308", 2);
const DOING = state("started", "In Progress", "#3b82f6", 3);
const DONE = state("completed", "Done", "#22c55e", 4);
const DROPPED = state("cancelled", "Cancelled", "#64748b", 5);

function makeStage(
  order: number,
  name: string,
  options: Partial<Pick<ProjectStage, "goal" | "weight" | "progress" | "is_current">> = {},
): ProjectStage {
  return {
    id: `stage-${order}`,
    order,
    name,
    goal: options.goal ?? `阶段 ${order} 的目标`,
    weight: options.weight ?? 1,
    progress: options.progress ?? 0,
    is_current: options.is_current ?? false,
    created_at: TS,
  };
}

function stageRef(stage: ProjectStage) {
  return { id: stage.id, name: stage.name, order: stage.order };
}

function makeTask(
  sequenceId: number,
  title: string,
  stage: ProjectStage | null,
  stateValue: IssueState,
  priority: IssuePriority = "none",
): Issue {
  return {
    id: `task-${sequenceId}`,
    sequence_id: sequenceId,
    project: "project-fixture",
    title,
    description: "",
    priority,
    state: stateValue,
    assignee: null,
    created_by: { id: "user-fixture", username: "fixture", avatar: null },
    labels: [],
    stage: stage ? stageRef(stage) : null,
    created_at: TS,
    updated_at: TS,
  };
}

function makePlan(stages: ProjectStage[], progress: number): ProjectPlan {
  const current = stages.find((s) => s.is_current) ?? null;
  const next = current
    ? (stages.find((s) => s.order > current.order) ?? null)
    : (stages[0] ?? null);
  return {
    id: "plan-fixture",
    title: "GLOBAL PLAN",
    stages,
    progress,
    current_stage: current,
    next_stage: next,
  };
}

function base(overrides: Partial<AnatomyFixture> & Pick<AnatomyFixture, "name">): AnatomyFixture {
  return {
    identifier: "FIX",
    stages: [],
    tasks: [],
    plan: null,
    nowTaskId: null,
    agentRunning: false,
    projectProgress: 0,
    progressSource: "tasks",
    ...overrides,
  };
}

const s1 = makeStage(1, "起点", { progress: 0 });
const s2 = makeStage(2, "构建", { progress: 35, is_current: true });
const s3 = makeStage(3, "收束", { progress: 10 });

const smallTasks = [
  makeTask(1, "定义目标", s1, DONE, "medium"),
  makeTask(2, "搭骨架", s2, DOING, "high"),
  makeTask(3, "联调", s2, TODO, "medium"),
  makeTask(4, "写文档", s1, BACKLOG, "low"),
];

const smallStages = [s1, s2, s3];
const smallPlan = makePlan(smallStages, 24);

const nowTask = makeTask(10, "正在推进的步骤", s2, DOING, "urgent");
const f7Stage = makeStage(1, "未填写目标", { goal: "", progress: 0 });
const mixedStages = [
  makeStage(1, "调研", { progress: 100 }),
  makeStage(2, "实现", { progress: 45, is_current: true }),
  makeStage(3, "验收", { progress: 0 }),
];
const mixedTasks = [
  makeTask(11, "真实归属任务 A", mixedStages[0]!, DONE),
  nowTask,
  makeTask(12, "真实归属任务 B", mixedStages[1]!, TODO, "high"),
  makeTask(13, "散件任务（无阶段）", null, BACKLOG, "low"),
  makeTask(14, "另一个散件", null, DROPPED),
];
const mixedPlan = makePlan(mixedStages, 48);

function generated(stageCount: number, tasksPerStage: number): AnatomyFixture {
  const stages = Array.from({ length: stageCount }, (_, index) =>
    makeStage(index + 1, `阶段 ${String(index + 1).padStart(2, "0")}`, {
      progress: (index * 13) % 101,
      is_current: index === Math.min(2, stageCount - 1),
      weight: 1 + (index % 3),
    }),
  );
  const tasks = stages.flatMap((stage, stageIndex) =>
    Array.from({ length: tasksPerStage }, (_, taskIndex) => {
      const seq = stageIndex * tasksPerStage + taskIndex + 1;
      const groups = [BACKLOG, TODO, DOING, DONE, DROPPED];
      return makeTask(
        seq,
        `阶段 ${stageIndex + 1} 的任务 ${taskIndex + 1}`,
        stage,
        groups[(stageIndex + taskIndex) % groups.length]!,
        (["none", "low", "medium", "high", "urgent"] as IssuePriority[])[taskIndex % 5]!,
      );
    }),
  );
  return base({
    name: `F${stageCount}-${tasksPerStage}`,
    identifier: `G${stageCount}${tasksPerStage}`,
    stages,
    tasks,
    plan: makePlan(stages, 42),
    nowTaskId: tasks.find((t) => t.state.group === "started")?.id ?? null,
    projectProgress: 42,
    progressSource: "plan",
  });
}

export const anatomyFixtures = {
  /** F0：无 Stage / 无 Task / 无 Plan */
  empty: base({ name: "F0 empty", identifier: "F0" }),

  /** F1：1 Stage / 0 Task */
  oneStage: base({
    name: "F1 one stage",
    identifier: "F1",
    stages: [s1],
    plan: makePlan([s1], 0),
    progressSource: "plan",
  }),

  /** F2：3 Stage / 各 1–3 Task */
  small: base({
    name: "F2 small",
    identifier: "F2",
    stages: smallStages,
    tasks: smallTasks,
    plan: smallPlan,
    projectProgress: 24,
    progressSource: "plan",
  }),

  /** F3：3 Stage + loose + NOW */
  mixed: base({
    name: "F3 mixed",
    identifier: "F3",
    stages: mixedStages,
    tasks: mixedTasks,
    plan: mixedPlan,
    nowTaskId: nowTask.id,
    projectProgress: 48,
    progressSource: "plan",
    agentRunning: true,
  }),

  /** F4/F5：密集与大规模（生成） */
  dense: generated(8, 8),
  large: generated(16, 13),

  /** F6：长文本 + 特殊字符（JSX 必须安全呈现） */
  longLabels: base({
    name: "F6 long labels",
    identifier: "F6",
    stages: [
      makeStage(1, "阶段 <A&B> \"引号\" 'x' 中文 🚀", {
        goal: "目标里有 <script>alert(1)</script>、&、\" 和很长的说明".repeat(3),
        progress: 33,
        is_current: true,
      }),
    ],
    tasks: [
      makeTask(
        1,
        "任务标题 <b>不是 HTML</b> & 也不该被当成标签；同时要足够长以测试截断策略".repeat(2),
        null,
        DOING,
        "high",
      ),
    ],
    projectProgress: 33,
    progressSource: "tasks",
    nowTaskId: "task-1",
  }),

  /** F7：缺 goal / 无 NOW / NEXT / Agent 未运行 */
  missing: base({
    name: "F7 missing",
    identifier: "F7",
    stages: [f7Stage],
    plan: makePlan([f7Stage], 0),
  }),

  /** F8：历史语义占位（Phase 4 才使用；当前不构造快照） */
  historical: base({
    name: "F8 historical",
    identifier: "F8",
    stages: mixedStages,
    tasks: mixedTasks,
    plan: mixedPlan,
    projectProgress: 48,
    progressSource: "plan",
  }),

  /** F9：快速交互使用与 F3 相同的数据 */
  rapid: base({
    name: "F9 rapid",
    identifier: "F9",
    stages: mixedStages,
    tasks: mixedTasks,
    plan: mixedPlan,
    nowTaskId: nowTask.id,
    projectProgress: 48,
    progressSource: "plan",
  }),

  /** F10：减少动态效果使用与 F2 相同的数据 */
  reducedMotion: base({
    name: "F10 reduced motion",
    identifier: "F10",
    stages: smallStages,
    tasks: smallTasks,
    plan: smallPlan,
    projectProgress: 24,
    progressSource: "plan",
  }),
} satisfies Record<string, AnatomyFixture>;

export const fixtureList = Object.values(anatomyFixtures);
