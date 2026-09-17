/**
 * Unit tests — Issue 列表查询的序列化与排序白名单 (docs/api/04-issues.md).
 *
 * 后端语义：同一字段多值用**逗号分隔**（字段内 OR，字段间 AND）；ordering 有白名单，
 * 非法值直接 400。这两条都是"错了就整页报错"的地方，所以钉死。
 *
 * 注：`lib/url.ts` 的解析侧（parseIssueQuery）依赖 `@/` 路径别名，零依赖的
 * node:test 跑不了别名解析，未覆盖 —— 见 devlog §3.2 的说明与后续计划。
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  formatIssueId,
  ISSUE_ORDERING_OPTIONS,
  PRIORITY_VALUES,
  serializeIssueQuery,
  type IssueListQuery,
  type IssueOrdering,
  type IssuePriority,
} from "../../types/issue.ts";

function parse(q: IssueListQuery): URLSearchParams {
  return new URLSearchParams(serializeIssueQuery(q));
}

describe("serializeIssueQuery", () => {
  test("多值字段用逗号连接（后端约定的多值形式）", () => {
    const p = parse({ state: ["s-1", "s-2"], priority: ["high", "urgent"] });
    assert.equal(p.get("state"), "s-1,s-2");
    assert.equal(p.get("priority"), "high,urgent");
  });

  test("空数组 / 空串 / 纯空白 → 参数完全不出现（不是空串参数）", () => {
    const p = parse({ state: [], priority: [], search: "   ", labels: [] });
    assert.equal(p.toString(), "");
    assert.equal(p.has("state"), false);
    assert.equal(p.has("search"), false);
  });

  test("page=1 不写进 URL；page>1 才写（保持地址栏干净）", () => {
    assert.equal(parse({ page: 1 }).has("page"), false);
    assert.equal(parse({ page: 2 }).get("page"), "2");
  });

  test('assignee 可以是用户 id 或字面量 "me"', () => {
    assert.equal(parse({ assignee: "me" }).get("assignee"), "me");
    assert.equal(parse({ assignee: "u-1" }).get("assignee"), "u-1");
  });

  test("search 两侧空白被裁掉", () => {
    assert.equal(parse({ search: "  login  " }).get("search"), "login");
  });

  test("ordering 原样透传（合法性由白名单常量保证）", () => {
    assert.equal(parse({ ordering: "-priority" }).get("ordering"), "-priority");
  });

  test("完整查询只产出后端认识的键", () => {
    const allowed = new Set([
      "state",
      "priority",
      "assignee",
      "labels",
      "search",
      "ordering",
      "page",
      "per_page",
    ]);
    const p = parse({
      state: ["s-1"],
      priority: ["high"],
      assignee: "me",
      labels: ["l-1"],
      search: "x",
      ordering: "-created_at",
      page: 3,
      per_page: 50,
    });
    for (const key of p.keys()) {
      assert.ok(allowed.has(key), `出现了后端不认识的参数：${key}`);
    }
    assert.equal(p.get("per_page"), "50");
  });
});

describe("ordering 白名单", () => {
  test("UI 可选项与后端白名单一一对应，不多不少", () => {
    const expected: IssueOrdering[] = [
      "-created_at",
      "created_at",
      "sequence_id",
      "-sequence_id",
      "priority",
      "-priority",
    ];
    assert.deepEqual(
      ISSUE_ORDERING_OPTIONS.map((o) => o.value).sort(),
      [...expected].sort(),
    );
  });

  test("每个选项都有中文可读标签（下拉里不能露出裸枚举）", () => {
    for (const o of ISSUE_ORDERING_OPTIONS) {
      assert.ok(o.label.trim().length > 0, `${o.value} 缺 label`);
    }
  });

  test("priority 枚举与 04 契约一致", () => {
    const expected: IssuePriority[] = ["none", "urgent", "high", "medium", "low"];
    assert.deepEqual(PRIORITY_VALUES, expected);
  });
});

describe("formatIssueId", () => {
  test("拼成 IDENTIFIER-N（补零由展示组件 IssueId 负责）", () => {
    assert.equal(formatIssueId("AMI", 7), "AMI-7");
    assert.equal(formatIssueId("AMI", 128), "AMI-128");
  });
});
