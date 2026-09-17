/**
 * Unit tests — realtime 连接策略 (features/realtime/policy.ts), Sprint 7。
 *
 * 覆盖三件在 socket 回调里最容易写错、且错了最久才被发现的事：
 * 关闭码该不该重连、退避序列、以及"事件来了到底该刷新什么"。
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  BACKOFF_MAX_MS,
  buildProjectSocketUrl,
  classifyClose,
  HEARTBEAT_INTERVAL_MS,
  IDLE_TIMEOUT_MS,
  isConnectionDead,
  nextBackoffDelay,
  parseFrame,
  pingFrame,
  planRealtimeEffect,
  shouldSendHeartbeat,
  WS_CLOSE_FORBIDDEN,
  WS_CLOSE_UNAUTHORIZED,
} from "@/features/realtime/policy.ts";

/* ---------------- 关闭码 ---------------- */

describe("classifyClose：关闭码 → 动作", () => {
  test("4401 → 重新登录（会话没了，重试不可能成功）", () => {
    assert.equal(classifyClose(WS_CLOSE_UNAUTHORIZED), "relogin");
    assert.equal(classifyClose(4401), "relogin");
  });

  test("4404 → 放弃（项目不可见，重试是骚扰）", () => {
    assert.equal(classifyClose(WS_CLOSE_FORBIDDEN), "give-up");
    assert.equal(classifyClose(4404), "give-up");
  });

  test("标准关闭码 → 照常重连", () => {
    assert.equal(classifyClose(1000), "reconnect"); // 正常关闭
    assert.equal(classifyClose(1006), "reconnect"); // 连接断开（最常见）
    assert.equal(classifyClose(1011), "reconnect"); // 服务端错误
  });

  test("未知的应用关闭码也走重连（宁可重试，不要静默停住）", () => {
    assert.equal(classifyClose(4500), "reconnect");
    assert.equal(classifyClose(0), "reconnect");
  });

  test("4401 / 4404 是自定义码，不是标准码——不能和 401/404 混用", () => {
    // 回归点：曾经想过直接判 401/404，但 WebSocket 关闭码是另一个命名空间
    assert.notEqual(classifyClose(401), "relogin");
    assert.notEqual(classifyClose(404), "give-up");
  });
});

/* ---------------- 退避 ---------------- */

describe("nextBackoffDelay：指数退避 + 等值抖动", () => {
  test("第 0 次约 1s，之后翻倍（取 random 上界看基值）", () => {
    const upper = () => 1; // delay = base/2 + 1*base/2 = base
    assert.equal(nextBackoffDelay(0, upper), 1000);
    assert.equal(nextBackoffDelay(1, upper), 2000);
    assert.equal(nextBackoffDelay(2, upper), 4000);
    assert.equal(nextBackoffDelay(3, upper), 8000);
  });

  test("下界是基值的一半——抖动不会退化成 0ms（那会变成紧密重试循环）", () => {
    const lower = () => 0;
    assert.equal(nextBackoffDelay(0, lower), 500);
    assert.equal(nextBackoffDelay(3, lower), 4000);
    // 关键回归点：full jitter 会返回 ~0，这里必须恒 > 0
    for (let attempt = 0; attempt < 10; attempt += 1) {
      assert.ok(nextBackoffDelay(attempt, lower) > 0, `attempt ${attempt} 退避为 0`);
    }
  });

  test("封顶 30s，不会无限翻倍", () => {
    const upper = () => 1;
    assert.equal(nextBackoffDelay(9, upper), BACKOFF_MAX_MS);
    assert.equal(nextBackoffDelay(20, upper), BACKOFF_MAX_MS);
    assert.equal(nextBackoffDelay(999, upper), BACKOFF_MAX_MS);
  });

  test("同一 attempt 的取值落在 [base/2, base] 区间内", () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const base = Math.min(BACKOFF_MAX_MS, 1000 * 2 ** attempt);
      for (const r of [0, 0.25, 0.5, 0.75, 1]) {
        const d = nextBackoffDelay(attempt, () => r);
        assert.ok(d >= base / 2 && d <= base, `attempt=${attempt} r=${r} d=${d}`);
      }
    }
  });
});

/* ---------------- 心跳与僵尸连接 ---------------- */

describe("心跳与僵尸连接判定", () => {
  test("刚连上就发第一个 ping", () => {
    assert.equal(shouldSendHeartbeat(null, Date.now()), true);
  });

  test("心跳间隔之内不重复发", () => {
    const now = 1_000_000;
    assert.equal(shouldSendHeartbeat(now - 1000, now), false);
    assert.equal(shouldSendHeartbeat(now - HEARTBEAT_INTERVAL_MS + 1, now), false);
  });

  test("到点就发", () => {
    const now = 1_000_000;
    assert.equal(shouldSendHeartbeat(now - HEARTBEAT_INTERVAL_MS, now), true);
    assert.equal(shouldSendHeartbeat(now - HEARTBEAT_INTERVAL_MS * 3, now), true);
  });

  test("刚打开、还没收到过任何帧 → 不算死（否则会自杀）", () => {
    assert.equal(isConnectionDead(null, Date.now()), false);
  });

  test("沉默超过 60s → 判死（约等于漏掉两个心跳）", () => {
    const now = 1_000_000;
    assert.equal(isConnectionDead(now - IDLE_TIMEOUT_MS + 1, now), false);
    assert.equal(isConnectionDead(now - IDLE_TIMEOUT_MS, now), true);
    assert.equal(isConnectionDead(now - IDLE_TIMEOUT_MS * 5, now), true);
  });

  test("空闲阈值必须大于心跳间隔，否则会周期性误判", () => {
    assert.ok(IDLE_TIMEOUT_MS > HEARTBEAT_INTERVAL_MS * 2);
  });
});

/* ---------------- 帧解析 ---------------- */

describe("parseFrame", () => {
  test("正常帧：取出 event 与 payload", () => {
    const f = parseFrame('{"event":"issue.updated","payload":{"issue_id":"i-1"}}');
    assert.equal(f?.event, "issue.updated");
    assert.deepEqual(f?.payload, { issue_id: "i-1" });
  });

  test("非 JSON / 非对象 / 缺 event / event 为空 → null（跳过这一帧，不拆连接）", () => {
    assert.equal(parseFrame("not json"), null);
    assert.equal(parseFrame("[]"), null);
    assert.equal(parseFrame("42"), null);
    assert.equal(parseFrame("null"), null);
    assert.equal(parseFrame('{"payload":{}}'), null);
    assert.equal(parseFrame('{"event":""}'), null);
    assert.equal(parseFrame('{"event":123}'), null);
  });

  test("payload 缺失是合法的（pong 帧就是空 payload）", () => {
    const f = parseFrame('{"event":"pong"}');
    assert.equal(f?.event, "pong");
    assert.equal(f?.payload, undefined);
  });

  test("ping 帧形状固定：客户端只允许发这一个消息", () => {
    assert.equal(pingFrame(), '{"type":"ping"}');
  });
});

/* ---------------- URL 拼接 ---------------- */

describe("buildProjectSocketUrl", () => {
  test("拼出契约里的路径", () => {
    assert.equal(
      buildProjectSocketUrl("ws://127.0.0.1:8000", "amiya-ws", "p-1"),
      "ws://127.0.0.1:8000/ws/workspaces/amiya-ws/projects/p-1/",
    );
  });

  test("base 结尾的斜杠被吃掉——否则会出现 // 被 Django 路由 404", () => {
    assert.equal(
      buildProjectSocketUrl("ws://127.0.0.1:8000/", "ws", "p"),
      "ws://127.0.0.1:8000/ws/workspaces/ws/projects/p/",
    );
    assert.equal(
      buildProjectSocketUrl("wss://example.com///", "ws", "p"),
      "wss://example.com/ws/workspaces/ws/projects/p/",
    );
  });
});

/* ---------------- 事件 → 缓存动作 ---------------- */

describe("planRealtimeEffect", () => {
  test("issue.updated → 刷新该 issue（payload 是展示用 diff，不能拿来重建 Issue）", () => {
    const e = planRealtimeEffect(
      "issue.updated",
      { issue_id: "i-1", sequence_id: 7, old_value: { state: "Todo" }, new_value: { state: "Done" } },
      "u-me",
    );
    assert.equal(e.kind, "issue-updated");
    assert.equal(e.kind === "issue-updated" && e.issueId, "i-1");
    assert.equal(e.kind === "issue-updated" && e.sequenceId, 7);
  });

  test("issue.updated 缺 issue_id 也认得出类型（调用方退化为「刷新整个项目」）", () => {
    const e = planRealtimeEffect("issue.updated", { new_value: { state: "Done" } });
    assert.equal(e.kind, "issue-updated");
    assert.equal(e.kind === "issue-updated" && e.issueId, null);
  });

  test("comment.created：别人的评论 → 需要刷新", () => {
    const e = planRealtimeEffect(
      "comment.created",
      { issue_id: "i-1", comment_id: "c-1", author: { id: "u-other" }, content: "看到推送了吗" },
      "u-me",
    );
    assert.equal(e.kind, "comment-created");
    assert.equal(e.kind === "comment-created" && e.ownComment, false);
  });

  test("comment.created：自己的评论 → 标记为自己发的（前端已乐观插入，不能再刷，否则闪一下两条）", () => {
    const e = planRealtimeEffect(
      "comment.created",
      { issue_id: "i-1", comment_id: "c-1", author: { id: "u-me" }, content: "x" },
      "u-me",
    );
    assert.equal(e.kind === "comment-created" && e.ownComment, true);
  });

  test("当前用户还没加载出来时，自己的评论也会被当成别人的（宁可多取一次）", () => {
    const e = planRealtimeEffect(
      "comment.created",
      { issue_id: "i-1", author: { id: "u-me" } },
      undefined,
    );
    assert.equal(e.kind === "comment-created" && e.ownComment, false);
  });

  test("未知事件 → none（不猜、不崩）", () => {
    const e = planRealtimeEffect("issue.created", { issue_id: "i-1" });
    assert.equal(e.kind, "none");
    assert.equal(e.kind === "none" && e.reason, "unknown-event");
  });

  test("payload 不是对象 → none/malformed", () => {
    const e = planRealtimeEffect("issue.updated", "oops");
    assert.equal(e.kind, "none");
    assert.equal(e.kind === "none" && e.reason, "malformed");
  });
});
