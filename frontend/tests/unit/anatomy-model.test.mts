import assert from "node:assert/strict";
import test from "node:test";

import { anatomyFixtures, type AnatomyFixture } from "../fixtures/anatomy-fixtures.mts";
import {
  anatomyCounts,
  defaultStageId,
  selectAnatomyViewModel,
  stageTaskCounts,
} from "@/features/anatomy";

function view(fixture: AnatomyFixture) {
  return selectAnatomyViewModel({
    projectName: fixture.name,
    identifier: fixture.identifier,
    stages: fixture.stages,
    tasks: fixture.tasks,
    plan: fixture.plan,
    nowTaskId: fixture.nowTaskId,
    agentRunning: fixture.agentRunning,
    projectProgress: fixture.projectProgress,
    progressSource: fixture.progressSource,
  });
}

test("F0：空项目不产生 Stage/Task，进度来源保持输入", () => {
  const vm = view(anatomyFixtures.empty);
  assert.equal(vm.stages.length, 0);
  assert.equal(vm.looseTasks.length, 0);
  assert.equal(vm.projectProgress, 0);
  assert.equal(vm.progressSource, "tasks");
});

test("F3：Stage 分组、散件、NOW 与 NEXT 全部来自输入", () => {
  const vm = view(anatomyFixtures.mixed);
  assert.deepEqual(
    vm.stages.map((stage) => [stage.name, stage.tasks.length]),
    [
      ["调研", 1],
      ["实现", 2],
      ["验收", 0],
    ],
  );
  assert.equal(vm.looseTasks.length, 2);
  assert.equal(vm.nowTaskId, "task-10");
  assert.equal(vm.nextStageId, "stage-3");
  assert.equal(vm.nextStageName, "验收");
  assert.equal(vm.projectProgress, 48);
  assert.equal(vm.progressSource, "plan");
  assert.equal(anatomyCounts(vm).tasks, 5);
  assert.equal(anatomyCounts(vm).loose, 2);
});

test("Stage.progress 保持记录值，不从 Task 完成率重算", () => {
  const vm = view(anatomyFixtures.mixed);
  assert.equal(vm.stages[0]!.recordedProgress, 100);
  assert.equal(vm.stages[1]!.recordedProgress, 45);
  assert.equal(vm.stages[2]!.recordedProgress, 0);
});

test("未知 stage 引用进入散件，未知 NOW 被丢弃（不伪造）", () => {
  const base = anatomyFixtures.mixed;
  const detached = {
    ...base.tasks[0]!,
    id: "task-detached",
    stage: { id: "stage-missing", name: "不存在", order: 99 },
  };
  const vm = selectAnatomyViewModel({
    identifier: "X",
    stages: base.stages,
    tasks: [...base.tasks, detached],
    plan: base.plan,
    nowTaskId: "task-missing",
    projectProgress: 1,
    progressSource: "plan",
  });
  assert.equal(vm.looseTasks.some((task) => task.id === "task-detached"), true);
  assert.equal(vm.nowTaskId, null);
});

test("缺数据保持 null，不退回前端计算项目进度", () => {
  const vm = selectAnatomyViewModel({
    identifier: "N",
    stages: [],
    tasks: [],
    plan: null,
    projectProgress: null,
    progressSource: null,
  });
  assert.equal(vm.projectProgress, null);
  assert.equal(vm.progressSource, null);
  assert.equal(vm.nextStageId, null);
});

test("F6：长文本/特殊字符在模型中不被改写", () => {
  const vm = view(anatomyFixtures.longLabels);
  assert.match(vm.stages[0]!.name, /<A&B>/);
  assert.match(vm.stages[0]!.goal, /<script>/);
  assert.match(vm.looseTasks[0]!.title, /<b>不是 HTML<\/b>/);
});

test("Stage 任务计数按真实状态分列；记录进度不参与", () => {
  const vm = view(anatomyFixtures.mixed);
  const counts = stageTaskCounts(vm.stages[1]!);
  assert.equal(counts.total, 2);
  assert.equal(counts.done + counts.active + counts.todo + counts.cancelled, 2);
  assert.equal(vm.stages[1]!.recordedProgress, 45);
});

test("默认选中当前 Stage；没有当前 Stage 时选第一个；空项目为 null", () => {
  const mixed = view(anatomyFixtures.mixed);
  assert.equal(defaultStageId(mixed), mixed.stages.find((stage) => stage.isCurrent)!.id);
  const one = view(anatomyFixtures.oneStage);
  assert.equal(defaultStageId(one), one.stages[0]!.id);
  assert.equal(defaultStageId(view(anatomyFixtures.empty)), null);
});
