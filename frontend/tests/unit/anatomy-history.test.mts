import assert from "node:assert/strict";
import test from "node:test";

import { selectAnatomyHistory, utcMinute } from "@/features/anatomy";
import type { Activity } from "@/types/activity";
import type { Worklog } from "@/types/project";

const user = { id: "u1", username: "北归", avatar: null };

function log(overrides: Partial<Worklog>): Worklog {
  return {
    id: "log-1",
    project: "p1",
    stage: null,
    stage_name: null,
    author: user,
    date: "2026-10-26",
    title: "今天做了什么",
    summary: "完成静态对象",
    details: "",
    conclusion: "",
    next_step: "",
    blocker: "",
    source: "manual",
    created_at: "2026-10-26T10:00:00Z",
    updated_at: "2026-10-26T10:00:00Z",
    ...overrides,
  };
}

function activity(overrides: Partial<Activity>): Activity {
  return {
    id: "a1",
    actor: user,
    entity_type: "issue",
    entity_id: "t1",
    issue: "t1",
    action: "created",
    old_value: null,
    new_value: { title: "任务" },
    created_at: "2026-10-26T10:00:00Z",
    ...overrides,
  };
}

test("Worklog 保留业务日期（可补记），Activity 保留写入时间", () => {
  const history = selectAnatomyHistory(
    [log({ date: "2026-10-01" })],
    [activity({ created_at: "2026-10-26T10:11:22Z" })],
  );
  assert.equal(history.worklogs[0]!.date, "2026-10-01");
  assert.equal(history.activities[0]!.recordedAt, "2026-10-26T10:11:22Z");
  assert.equal(utcMinute("2026-10-26T10:11:22Z"), "2026-10-26 10:11 UTC");
});

test("来源分别标明：人工 / AGENT / 导入；Activity 保留审计语义词", () => {
  const history = selectAnatomyHistory(
    [log({ source: "manual" }), log({ id: "l2", source: "agent" }), log({ id: "l3", source: "imported" })],
    [activity({ action: "updated", old_value: { state: "Todo" }, new_value: { state: "Done" } })],
  );
  assert.deepEqual(
    history.worklogs.map((item) => item.source),
    ["人工", "AGENT", "导入"],
  );
  assert.match(history.activities[0]!.text, /状态/);
  assert.match(history.activities[0]!.text, /Todo/);
});

test("Activity 保持服务端顺序，不对同时间戳重新排序", () => {
  const history = selectAnatomyHistory(
    [],
    [
      activity({ id: "a1", created_at: "2026-10-26T10:00:00Z" }),
      activity({ id: "a2", created_at: "2026-10-26T10:00:00Z" }),
      activity({ id: "a3", created_at: "2026-10-26T10:00:01Z" }),
    ],
  );
  assert.deepEqual(
    history.activities.map((item) => item.id),
    ["a1", "a2", "a3"],
  );
});

test("已删除实体仍可作为审计记录浏览；不推断旧结构", () => {
  const history = selectAnatomyHistory(
    [],
    [activity({ action: "deleted", entity_id: "task-gone", issue: null })],
  );
  assert.equal(history.activities.length, 1);
  assert.equal(history.activities[0]!.entityType, "issue");
  assert.match(history.activities[0]!.text, /删除/);
});

test("limit 只截断展示，总数如实报告", () => {
  const logs = Array.from({ length: 5 }, (_, index) => log({ id: `l${index}` }));
  const activities = Array.from({ length: 6 }, (_, index) => activity({ id: `a${index}` }));
  const history = selectAnatomyHistory(logs, activities, 3);
  assert.equal(history.worklogs.length, 3);
  assert.equal(history.activities.length, 3);
  assert.equal(history.worklogTotal, 5);
  assert.equal(history.activityTotal, 6);
});
