import assert from "node:assert/strict";
import test from "node:test";

import {
  anatomyViewStateFromQuery,
  anatomyViewStateToQuery,
  normalizeViewState,
  transitionViewState,
  type AnatomyViewState,
} from "@/features/anatomy";

const ids = ["s1", "s2", "s3"];
const growth: AnatomyViewState = { mode: "growth", selectedStageId: "s2" };

test("选择 Stage 与切换视图互不丢失", () => {
  const selected = transitionViewState(growth, { type: "SELECT_STAGE", stageId: "s3" }, ids, "s1");
  assert.deepEqual(selected, { mode: "growth", selectedStageId: "s3" });

  const structure = transitionViewState(selected, { type: "SET_VIEW", mode: "structure" }, ids, "s1");
  assert.deepEqual(structure, { mode: "structure", selectedStageId: "s3" });

  const back = transitionViewState(structure, { type: "SET_VIEW", mode: "growth" }, ids, "s1");
  assert.deepEqual(back, { mode: "growth", selectedStageId: "s3" });
});

test("未知 Stage 退化为当前/第一个；空项目为 null", () => {
  const fallback = transitionViewState(
    { mode: "structure", selectedStageId: "missing" },
    { type: "SELECT_STAGE", stageId: "also-missing" },
    ids,
    "s2",
  );
  assert.deepEqual(fallback, { mode: "structure", selectedStageId: "s2" });

  const first = normalizeViewState({ mode: "growth", selectedStageId: null }, ids, null);
  assert.deepEqual(first, { mode: "growth", selectedStageId: "s1" });

  const empty = normalizeViewState({ mode: "structure", selectedStageId: "s1" }, [], null);
  assert.deepEqual(empty, { mode: "structure", selectedStageId: null });
});

test("URL 只保存视图与选中 Stage；growth 不写默认 mode", () => {
  assert.deepEqual(anatomyViewStateToQuery({ mode: "growth", selectedStageId: null }), {});
  assert.deepEqual(anatomyViewStateToQuery(growth), { stage: "s2" });
  assert.deepEqual(anatomyViewStateToQuery({ mode: "structure", selectedStageId: "s2" }), {
    mode: "structure",
    stage: "s2",
  });

  assert.deepEqual(anatomyViewStateFromQuery(null, null), {
    mode: "growth",
    selectedStageId: null,
  });
  assert.deepEqual(anatomyViewStateFromQuery("structure", "s2"), {
    mode: "structure",
    selectedStageId: "s2",
  });
});

test("V2 的 expand=1 兼容读作结构视图", () => {
  assert.deepEqual(anatomyViewStateFromQuery(null, "s2", "1"), {
    mode: "structure",
    selectedStageId: "s2",
  });
  assert.deepEqual(anatomyViewStateFromQuery(null, "s2", null), {
    mode: "growth",
    selectedStageId: "s2",
  });
});
