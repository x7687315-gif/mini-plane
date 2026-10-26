import assert from "node:assert/strict";
import test from "node:test";

import { anatomyFixtures, type AnatomyFixture } from "../fixtures/anatomy-fixtures.mts";
import {
  anatomyCounts,
  computeAnatomyLayout,
  isInside,
  overlapArea,
  selectAnatomyViewModel,
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

test("布局确定性：相同输入两次输出完全一致", () => {
  for (const fixture of Object.values(anatomyFixtures)) {
    const vm = view(fixture);
    assert.deepEqual(computeAnatomyLayout(vm), computeAnatomyLayout(vm), fixture.name);
  }
});

test("Stage 数量 0/1/3/8/16 均生成稳定布局并在 viewBox 内", () => {
  const cases = [
    anatomyFixtures.empty,
    anatomyFixtures.oneStage,
    anatomyFixtures.small,
    anatomyFixtures.dense,
    anatomyFixtures.large,
  ];
  for (const fixture of cases) {
    const vm = view(fixture);
    const layout = computeAnatomyLayout(vm);
    assert.equal(layout.stages.length, vm.stages.length, fixture.name);
    for (const stage of layout.stages) {
      assert.equal(isInside(stage.bounds, layout.viewBox), true, `${fixture.name} ${stage.stageId}`);
    }
    if (layout.loose) {
      assert.equal(isInside(layout.loose.bounds, layout.viewBox), true, `${fixture.name} loose`);
      for (const stage of layout.stages) {
        assert.equal(overlapArea(stage.bounds, layout.loose.bounds), 0, `${fixture.name} tray`);
      }
    }
    if (layout.emptyBase) {
      assert.equal(isInside(layout.emptyBase.bounds, layout.viewBox), true, `${fixture.name} empty`);
    }
  }
});

test("Stage 包围盒互不重叠（overview）", () => {
  for (const fixture of [anatomyFixtures.small, anatomyFixtures.dense, anatomyFixtures.large]) {
    const layout = computeAnatomyLayout(view(fixture));
    for (let i = 0; i < layout.stages.length; i += 1) {
      for (let j = i + 1; j < layout.stages.length; j += 1) {
        assert.equal(
          overlapArea(layout.stages[i]!.bounds, layout.stages[j]!.bounds),
          0,
          `${fixture.name}: ${layout.stages[i]!.stageId} × ${layout.stages[j]!.stageId}`,
        );
      }
    }
  }
});

test("聚焦：只展开选中 Stage，其他 Stage 变轻且不画任务，画布仍包含全部包围盒", () => {
  const vm = view(anatomyFixtures.mixed);
  const focusedId = vm.stages[1]!.id;
  const layout = computeAnatomyLayout(vm, { mode: "focus", stageId: focusedId });
  assert.equal(layout.stages.length, 3);
  const selected = layout.stages.find((stage) => stage.stageId === focusedId)!;
  assert.equal(selected.tasks.length, 2);
  assert.equal(selected.opacity, 1);
  for (const stage of layout.stages.filter((item) => item.stageId !== focusedId)) {
    assert.equal(stage.tasks.length, 0);
    assert.equal(stage.thin, true);
    assert.ok(stage.opacity < 0.2);
  }
  assert.equal(isInside(selected.bounds, layout.viewBox), true);
});

test("未知 focus id 退化为 overview（不产生空白布局）", () => {
  const vm = view(anatomyFixtures.small);
  const overview = computeAnatomyLayout(vm);
  const fallback = computeAnatomyLayout(vm, { mode: "focus", stageId: "missing" });
  assert.deepEqual(fallback, overview);
});
