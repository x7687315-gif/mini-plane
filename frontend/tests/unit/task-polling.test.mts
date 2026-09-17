/**
 * Unit tests — TaskRun 轮询策略 (features/task/polling.ts), Sprint 6 验收项：
 * "unit: TaskRun 轮询直到 success/failure，30 次后超时".
 *
 * 这些断言全部落在"什么时候**停**"上，因为不停下来的轮询是那种最安静的 bug：
 * 功能看起来完全正常，只是有一个用户永远在打请求。
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  describeTaskStatus,
  isTaskTimedOut,
  nextTaskPollDelay,
  TASK_POLL_INTERVAL_MS,
  TASK_POLL_MAX_ATTEMPTS,
} from "@/features/task/polling.ts";
import type { TaskRun, TaskRunStatus } from "@/types/task.ts";

function run(status: TaskRunStatus, extra: Partial<TaskRun> = {}): TaskRun {
  return {
    id: "t-1",
    kind: "bulk_assign_labels",
    status,
    params: {},
    result:
      status === "success"
        ? { issues: 5, changed: 3, labels: 2, label_ids: ["l-1", "l-2"] }
        : null,
    error: status === "failure" ? "标签数量超过上限。" : "",
    actor: { id: "u-1", username: "amiya", avatar: null },
    created_at: "2026-09-17T05:00:00Z",
    updated_at: "2026-09-17T05:00:01Z",
    ...extra,
  };
}

describe("nextTaskPollDelay：什么时候继续、什么时候停", () => {
  test("还没拿到第一帧 → 继续轮询（任务刚受理）", () => {
    assert.equal(nextTaskPollDelay(undefined, 0), TASK_POLL_INTERVAL_MS);
  });

  test("pending / running → 继续轮询", () => {
    assert.equal(nextTaskPollDelay(run("pending"), 1), TASK_POLL_INTERVAL_MS);
    assert.equal(nextTaskPollDelay(run("running"), 7), TASK_POLL_INTERVAL_MS);
  });

  test("success → 停（再查也不会变）", () => {
    assert.equal(nextTaskPollDelay(run("success"), 2), false);
  });

  test("failure → 停（失败是终态，重试不是查询的责任）", () => {
    assert.equal(nextTaskPollDelay(run("failure"), 2), false);
  });

  test("还在跑但用光预算 → 停（第 30 次观察仍然允许，第 31 次不允许）", () => {
    assert.equal(
      nextTaskPollDelay(run("running"), TASK_POLL_MAX_ATTEMPTS - 1),
      TASK_POLL_INTERVAL_MS,
    );
    assert.equal(nextTaskPollDelay(run("running"), TASK_POLL_MAX_ATTEMPTS), false);
    assert.equal(nextTaskPollDelay(run("running"), TASK_POLL_MAX_ATTEMPTS + 5), false);
  });

  test("预算耗尽后即使拿到终态也不再轮询（终态优先，不返回数字）", () => {
    assert.equal(nextTaskPollDelay(run("success"), TASK_POLL_MAX_ATTEMPTS + 99), false);
  });

  test("轮询间隔与上限是计划里写死的值", () => {
    // 这两个数字出现在 doD 里，改动必须是有意识的
    assert.equal(TASK_POLL_INTERVAL_MS, 1000);
    assert.equal(TASK_POLL_MAX_ATTEMPTS, 30);
  });
});

describe("isTaskTimedOut", () => {
  test("非终态 + 预算耗尽 → 超时（UI 要提示「还在跑」，而不是假装成功）", () => {
    assert.equal(isTaskTimedOut(run("running"), TASK_POLL_MAX_ATTEMPTS), true);
    assert.equal(isTaskTimedOut(run("pending"), TASK_POLL_MAX_ATTEMPTS), true);
  });

  test("终态永远不算超时", () => {
    assert.equal(isTaskTimedOut(run("success"), TASK_POLL_MAX_ATTEMPTS + 1), false);
    assert.equal(isTaskTimedOut(run("failure"), TASK_POLL_MAX_ATTEMPTS + 1), false);
  });

  test("还没到预算不算超时；还没数据也不算", () => {
    assert.equal(isTaskTimedOut(run("running"), 3), false);
    assert.equal(isTaskTimedOut(undefined, 999), false);
  });
});

describe("describeTaskStatus", () => {
  test("无运行时不给句子（UI 不应该凭空编状态）", () => {
    assert.equal(describeTaskStatus(undefined), null);
  });

  test("pending / running 各自有可读文案", () => {
    assert.equal(describeTaskStatus(run("pending")), "queued…");
    assert.equal(describeTaskStatus(run("running")), "running…");
  });

  test("success 用 changed 而非 issues —— 必须区分「发了几个」和「真的变了几个」", () => {
    // 07 契约：标签没变的 Issue 不产生任何噪声，所以 5 个里只变了 3 个是正常的
    assert.equal(describeTaskStatus(run("success")), "3 of 5 changed");
  });

  test("success 但缺 result → 退回 done，不渲染 undefined", () => {
    assert.equal(describeTaskStatus(run("success", { result: null })), "done");
  });

  test("failure 直接把后端的人类可读原因透出来", () => {
    assert.equal(describeTaskStatus(run("failure")), "标签数量超过上限。");
  });

  test("failure 但 error 为空 → 退回 failed", () => {
    assert.equal(describeTaskStatus(run("failure", { error: "" })), "failed");
  });
});
