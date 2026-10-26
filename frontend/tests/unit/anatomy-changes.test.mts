import assert from "node:assert/strict";
import test from "node:test";

import { anatomyFixtures } from "../fixtures/anatomy-fixtures.mts";
import { changeMarkerMap, deriveAnatomyChanges } from "@/features/anatomy";
import type { Activity } from "@/types/activity";

const actor = { id: "u1", username: "fixture", avatar: null };
const tasks = anatomyFixtures.mixed.tasks;
const since = Date.parse("2026-10-26T10:00:00Z");

function activity(overrides: Partial<Activity>): Activity {
  return {
    id: "a1",
    actor,
    entity_type: "issue",
    entity_id: tasks[0]!.id,
    issue: tasks[0]!.id,
    action: "created",
    old_value: null,
    new_value: { title: tasks[0]!.title },
    created_at: "2026-10-26T10:00:01Z",
    ...overrides,
  };
}

test("冷启动前的事件不进入最近变化", () => {
  const old = activity({ created_at: "2026-10-26T09:59:59Z" });
  assert.deepEqual(deriveAnatomyChanges([old], since, tasks), []);
});

test("新增任务 → created 标记；状态更新 → updated 标记", () => {
  const created = activity({});
  const updated = activity({
    id: "a2",
    action: "updated",
    new_value: { state: "In Progress" },
    created_at: "2026-10-26T10:00:02Z",
  });
  const changes = deriveAnatomyChanges([created, updated], since, tasks);
  assert.equal(changes.length, 2);
  assert.equal(changes.find((c) => c.id === "a1")!.kind, "created");
  assert.equal(changes.find((c) => c.id === "a2")!.summary, "状态 → In Progress");
  assert.deepEqual(
    changeMarkerMap(changes).get(tasks[0]!.id) ?? null,
    "created",
  );
});

test("非 issue / 已删除任务 / 无 Task 上下文不伪造标记", () => {
  const nonIssue = activity({ id: "a3", entity_type: "project" });
  const missing = activity({ id: "a4", entity_id: "task-deleted" });
  const changes = deriveAnatomyChanges([nonIssue, missing], since, tasks);
  assert.deepEqual(changes, []);
});

test("同一 Activity id 不重复；最近变化最多 5 条并按记录时间倒序", () => {
  const list = Array.from({ length: 7 }, (_, index) =>
    activity({
      id: `a${index}`,
      entity_id: tasks[index % tasks.length]!.id,
      created_at: `2026-10-26T10:00:0${index}Z`,
    }),
  );
  const changes = deriveAnatomyChanges([...list, list[0]!], since, tasks);
  assert.equal(changes.length, 5);
  assert.deepEqual(
    changes.map((change) => change.id),
    ["a6", "a5", "a4", "a3", "a2"],
  );
});
