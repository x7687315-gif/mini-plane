/**
 * Unit tests — URL ↔ filter 解析 (lib/url.ts), Sprint 5 验收项之一：
 * "unit: URL → filter 解析（含 `me` 关键字、多值逗号）" 与
 * "unit: filter → URL 序列化（移除空值、保留合法值）".
 *
 * 这一组以前跑不了：`lib/url.ts` 运行时从 `@/types/issue` 取 PRIORITY_VALUES，
 * 而零依赖的 `node --test` 解析不了 `@/` 别名。现在靠 tests/alias-loader.mjs 解决
 * （见 sprint-5-frontend.md §3.1）。
 *
 * 测的是"地址栏里的字符串"到"请求参数"再到"地址栏"的闭环 —— 手改 URL、点后退、
 * 粘贴分享链接都走这条路，所以任何一处放宽都会让 UI 显示 A 而请求 B。
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  countActiveFilters,
  hasActiveFilters,
  parseIssueQuery,
} from "@/lib/url.ts";
import { serializeIssueQuery } from "@/types/issue.ts";

function parse(qs: string) {
  return parseIssueQuery(new URLSearchParams(qs));
}

function roundTrip(qs: string): string {
  // URL → query → URL：再序列化必须与原串一致（顺序由 serialize 决定）
  return serializeIssueQuery(parse(qs));
}

/* ---------------- URL → filter ---------------- */

describe("parseIssueQuery：URL → 筛选对象", () => {
  test("空 URL → 只有默认 page，没有任何筛选", () => {
    const q = parse("");
    assert.equal(q.page, 1);
    assert.equal(q.state, undefined);
    assert.equal(q.priority, undefined);
    assert.equal(q.assignee, undefined);
    assert.equal(q.labels, undefined);
    assert.equal(q.search, undefined);
    assert.equal(q.ordering, undefined);
    assert.equal(hasActiveFilters(q), false);
  });

  test("多值用逗号分隔（后端约定：字段内 OR）", () => {
    const q = parse("state=s-1,s-2,s-3&priority=high,urgent");
    assert.deepEqual(q.state, ["s-1", "s-2", "s-3"]);
    assert.deepEqual(q.priority, ["high", "urgent"]);
  });

  test("逗号两侧空白被裁掉，空段被丢弃", () => {
    const q = parse("state=s-1, ,s-2,&priority=,,high,,");
    assert.deepEqual(q.state, ["s-1", "s-2"]);
    assert.deepEqual(q.priority, ["high"]);
  });

  test('assignee 接受字面量 "me"', () => {
    // 04 契约：`me` = 当前登录用户。前端把它原样透传，不做本地解析。
    assert.equal(parse("assignee=me").assignee, "me");
  });

  test("assignee 接受用户 id", () => {
    assert.equal(parse("assignee=3f1a-…").assignee, "3f1a-…");
  });

  test("priority 枚举之外的值被丢弃（否则后端 400）", () => {
    // 唯一能产生这种 URL 的是手改/过期链接；静默丢弃好过整页报错。
    const q = parse("priority=urgentt,high,HIGH");
    assert.deepEqual(q.priority, ["high"]);
    assert.equal(parse("priority=urgentt").priority, undefined);
  });

  test("ordering 白名单之外的值被丢弃", () => {
    assert.equal(parse("ordering=title").ordering, undefined);
    assert.equal(parse("ordering=-priority").ordering, "-priority");
    assert.equal(parse("ordering=-priority,sequence_id").ordering, undefined); // 多字段不在白名单里
  });

  test("search 两侧空白被裁掉；纯空白视为未传", () => {
    assert.equal(parse("search=%20%20login%20%20").search, "login");
    assert.equal(parse("search=%20%20%20").search, undefined);
  });

  test("page：非整数 / 0 / 负数 / 小数 → 一律回到 1", () => {
    assert.equal(parse("page=abc").page, 1);
    assert.equal(parse("page=0").page, 1);
    assert.equal(parse("page=-3").page, 1);
    assert.equal(parse("page=2.7").page, 2);
    assert.equal(parse("page=4").page, 4);
  });

  test("labels 多值（04 契约：OR / 并集）", () => {
    assert.deepEqual(parse("labels=l-1,l-2").labels, ["l-1", "l-2"]);
  });

  test("全部参数一起给：字段之间互不干扰", () => {
    const q = parse(
      "state=s-1&priority=urgent,high&assignee=me&labels=l-1,l-2&search=login&ordering=-priority&page=3",
    );
    assert.deepEqual(q.state, ["s-1"]);
    assert.deepEqual(q.priority, ["urgent", "high"]);
    assert.equal(q.assignee, "me");
    assert.deepEqual(q.labels, ["l-1", "l-2"]);
    assert.equal(q.search, "login");
    assert.equal(q.ordering, "-priority");
    assert.equal(q.page, 3);
  });
});

/* ---------------- filter → URL ---------------- */

describe("URL 往返：URL → 筛选 → URL", () => {
  test("合法 URL 往返后参数不变", () => {
    const qs = "state=s-1,s-2&priority=high,urgent&assignee=me&labels=l-1&search=login&ordering=-priority&page=3";
    assert.equal(roundTrip(qs), qs);
  });

  test("非法值在往返中被剔除，不会带到下一个请求", () => {
    // 这条是"默默忽略非法值"的回归点：不能保留也不能报错
    assert.equal(roundTrip("priority=bogus&ordering=title&page=abc"), "");
  });

  test("page=1 往返后从 URL 消失（默认值不写进地址栏）", () => {
    assert.equal(roundTrip("page=1"), "");
    assert.equal(roundTrip("state=s-1&page=1"), "state=s-1");
  });
});

/* ---------------- 活跃筛选计数 / 判定 ---------------- */

describe("hasActiveFilters / countActiveFilters", () => {
  test("ordering 与 page 不算筛选（它们不改变结果集的身份）", () => {
    const q = parse("ordering=-priority&page=5");
    assert.equal(hasActiveFilters(q), false);
    assert.equal(countActiveFilters(q), 0);
  });

  test("每个 facet 计 1，值个数不影响计数", () => {
    const q = parse("state=s-1,s-2,s-3&priority=high,urgent&assignee=me&labels=l-1&search=x");
    assert.equal(countActiveFilters(q), 5);
    assert.equal(hasActiveFilters(q), true);
  });

  test("只给 state 一个值也算活跃", () => {
    const q = parse("state=s-1");
    assert.equal(countActiveFilters(q), 1);
    assert.equal(hasActiveFilters(q), true);
  });
});
