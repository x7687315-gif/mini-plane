import assert from "node:assert/strict";
import test from "node:test";

import { anatomyFixtures, type AnatomyFixture } from "../fixtures/anatomy-fixtures.mts";
import {
  computeAnatomyLayout,
  computeGrowthLayout,
  computeStructureLayout,
  isInside,
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

test("growth：旧下新上，选中 Stage 保留，任务画在前缘", () => {
  const vm = view(anatomyFixtures.mixed);
  const selectedId = vm.stages[1]!.id;
  const layout = computeGrowthLayout(vm, selectedId);

  assert.equal(layout.kind, "growth");
  assert.equal(layout.stages.length, 3);
  assert.deepEqual(
    layout.stages.map((stage) => stage.z),
    [...layout.stages.map((stage) => stage.z)].sort((a, b) => a - b),
  );
  const selected = layout.stages.find((stage) => stage.stageId === selectedId)!;
  assert.equal(selected.selected, true);
  assert.equal(selected.current, true);
  assert.equal(selected.taskMarks.length, vm.stages[1]!.tasks.length);
  assert.equal(selected.hiddenTaskCount, 0);

  for (const stage of layout.stages) {
    assert.equal(isInside(stage.bounds, layout.viewBox), true, stage.stageId);
  }
  assert.equal(layout.loose !== null, true);
  assert.equal(isInside(layout.loose!.bounds, layout.viewBox), true);
});

test("growth：每个 Stage 最多 14 条前缘任务线，其余进入 +N", () => {
  const vm = view(anatomyFixtures.stress);
  const layout = computeGrowthLayout(vm);
  for (const stage of layout.stages) {
    assert.ok(stage.taskMarks.length <= 14);
    assert.equal(stage.taskMarks.length + stage.hiddenTaskCount, stage.stage.tasks.length);
    assert.equal(isInside(stage.bounds, layout.viewBox), true, stage.stageId);
  }
});

test("structure：ghost 整体层数完整，爆炸模块与虚线回连一一对应", () => {
  const vm = view(anatomyFixtures.mixed);
  const selectedId = vm.stages[1]!.id;
  const layout = computeStructureLayout(vm, selectedId);

  assert.equal(layout.kind, "structure");
  assert.equal(layout.ghost.layers.length, vm.stages.length);
  assert.equal(layout.stages.length, vm.stages.length);
  assert.deepEqual(
    layout.ghost.layers.map((layer) => layer.stageId),
    vm.stages.map((stage) => stage.id),
  );
  for (const stage of layout.stages) {
    const ghost = layout.ghost.layers.find((layer) => layer.stageId === stage.stageId)!;
    assert.ok(ghost);
    assert.notDeepEqual(stage.connector.from, stage.connector.to);
    assert.equal(isInside(stage.bounds, layout.viewBox), true, stage.stageId);
  }
  const selected = layout.stages.find((stage) => stage.stageId === selectedId)!;
  assert.equal(selected.selected, true);
  assert.equal(selected.tasks.length, vm.stages[1]!.tasks.length);
});

test("structure：每个模块最多 12 个任务立方体，计数仍按全量", () => {
  const vm = view(anatomyFixtures.stress);
  const layout = computeStructureLayout(vm);
  for (const stage of layout.stages) {
    assert.ok(stage.tasks.length <= 12);
    assert.equal(stage.tasks.length + stage.hiddenTaskCount, stage.stage.tasks.length);
    assert.equal(isInside(stage.bounds, layout.viewBox), true, stage.stageId);
  }
});

test("空项目：两种视图都给出空基座，不产生 Stage", () => {
  const vm = view(anatomyFixtures.empty);
  for (const layout of [computeGrowthLayout(vm), computeStructureLayout(vm)]) {
    assert.equal(layout.stages.length, 0);
    assert.equal(layout.emptyBase !== null, true);
    assert.equal(isInside(layout.emptyBase!.bounds, layout.viewBox), true);
  }
});

test("两种视图都确定性：相同输入两次输出完全一致", () => {
  for (const fixture of Object.values(anatomyFixtures)) {
    const vm = view(fixture);
    assert.deepEqual(computeGrowthLayout(vm), computeGrowthLayout(vm), fixture.name);
    assert.deepEqual(computeStructureLayout(vm), computeStructureLayout(vm), fixture.name);
  }
});

test("computeAnatomyLayout 按视图分派；未知选中 Stage 退化到当前/第一个", () => {
  const vm = view(anatomyFixtures.small);
  const growth = computeAnatomyLayout(vm, { mode: "growth", selectedStageId: "missing" });
  const structure = computeAnatomyLayout(vm, {
    mode: "structure",
    selectedStageId: "missing",
  });
  assert.equal(growth.kind, "growth");
  assert.equal(structure.kind, "structure");
  assert.equal(growth.stages.some((stage) => stage.selected), true);
  assert.equal(structure.stages.some((stage) => stage.selected), true);
});

test("16 Stage / 304 Task：两种视图的 Stage 包围盒都在 viewBox 内", () => {
  const vm = view(anatomyFixtures.stress);
  for (const layout of [computeGrowthLayout(vm), computeStructureLayout(vm)]) {
    assert.equal(layout.stages.length, 16);
    for (const stage of layout.stages) {
      assert.equal(isInside(stage.bounds, layout.viewBox), true, `${layout.kind} ${stage.stageId}`);
    }
    if (layout.loose) {
      assert.equal(isInside(layout.loose.bounds, layout.viewBox), true);
    }
  }
});
