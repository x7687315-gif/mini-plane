import assert from "node:assert/strict";
import test from "node:test";

import { anatomyFixtures } from "../fixtures/anatomy-fixtures.mts";
import {
  computeAnatomyLayout,
  isInside,
  normalizeSpatialState,
  selectAnatomyViewModel,
  spatialStateFromQuery,
  spatialStateToQuery,
  transitionSpatialState,
  type SpatialState,
} from "@/features/anatomy";

const ids = ["s1", "s2", "s3"];
const overview: SpatialState = { mode: "overview" };
const focus: SpatialState = { mode: "focus", stageId: "s2" };
const exploded: SpatialState = { mode: "exploded", stageId: "s2" };

test("overview → focus → exploded → focus → overview", () => {
  const a = transitionSpatialState(overview, { type: "FOCUS_STAGE", stageId: "s2" }, ids);
  assert.deepEqual(a, focus);
  const b = transitionSpatialState(a, { type: "EXPLODE_STAGE", stageId: "s2" }, ids);
  assert.deepEqual(b, exploded);
  const c = transitionSpatialState(b, { type: "COLLAPSE_STAGE" }, ids);
  assert.deepEqual(c, focus);
  const d = transitionSpatialState(c, { type: "RESTORE_OVERVIEW" }, ids);
  assert.deepEqual(d, overview);
});

test("再次点击当前 Stage 回到 overview；选择另一个 Stage 只切换焦点", () => {
  assert.deepEqual(
    transitionSpatialState(focus, { type: "TOGGLE_STAGE", stageId: "s2" }, ids),
    overview,
  );
  assert.deepEqual(
    transitionSpatialState(focus, { type: "TOGGLE_STAGE", stageId: "s3" }, ids),
    { mode: "focus", stageId: "s3" },
  );
});

test("未知 Stage 不产生不可达状态；normalize 清理旧选择", () => {
  assert.deepEqual(
    transitionSpatialState(focus, { type: "EXPLODE_STAGE", stageId: "missing" }, ids),
    overview,
  );
  assert.deepEqual(normalizeSpatialState(exploded, ["s1"]), overview);
  assert.deepEqual(normalizeSpatialState(focus, ids), focus);
});

test("URL 只保存空间焦点；overview 不写默认参数", () => {
  assert.deepEqual(spatialStateToQuery(overview), {});
  assert.deepEqual(spatialStateToQuery(focus), { stage: "s2" });
  assert.deepEqual(spatialStateToQuery(exploded), { stage: "s2", expand: "1" });
  assert.deepEqual(spatialStateFromQuery("s2", null), focus);
  assert.deepEqual(spatialStateFromQuery("s2", "1"), exploded);
  assert.deepEqual(spatialStateFromQuery(null, "1"), overview);
});

test("exploded 布局：选中 Stage 的任务抬升、有锚点，其他 Stage 幽灵化", () => {
  const fixture = anatomyFixtures.mixed;
  const vm = selectAnatomyViewModel({
    identifier: fixture.identifier,
    stages: fixture.stages,
    tasks: fixture.tasks,
    plan: fixture.plan,
    nowTaskId: fixture.nowTaskId,
    projectProgress: fixture.projectProgress,
    progressSource: fixture.progressSource,
  });
  const stageId = vm.stages[1]!.id;
  const layout = computeAnatomyLayout(vm, { mode: "exploded", stageId });
  const selected = layout.stages.find((stage) => stage.stageId === stageId)!;
  assert.equal(selected.exploded, true);
  assert.ok(selected.tasks.length > 0);
  for (const cell of selected.tasks) {
    assert.equal(cell.exploded, true);
    assert.notEqual(cell.anchor, null);
    assert.equal(isInside(cell.bounds, layout.viewBox), true);
  }
  for (const stage of layout.stages.filter((item) => item.stageId !== stageId)) {
    assert.equal(stage.thin, true);
    assert.equal(stage.exploded, false);
    assert.equal(stage.tasks.length, 0);
  }
});
