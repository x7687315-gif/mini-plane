/**
 * Unit tests — Activity 文案映射表 (docs/api/06-activities.md §文案映射表).
 *
 * Sprint 4 的验收项："unit: 文案映射表覆盖所有 entity_type × action".
 * 那张表是前后端唯一的事实来源，所以这里逐行钉住它：表变了 → 测试红 → 有人被迫
 * 回去改契约，而不是让线上悄悄显示一句错话。
 *
 * 用 Node 内置的 `node:test`（`node --test`）+ 原生类型擦除运行，零依赖 —— 见
 * frontend/docs/devlog/sprint-4-frontend.md §3.2 说明为什么没用 Vitest。
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  activityDiffs,
  activityHeadline,
  activityKind,
  describeActivity,
  FIELD_LABELS,
  PRIORITY_ZH,
  type Activity,
  type ActivityAction,
  type ActivityEntityType,
} from "../../types/activity.ts";

/* ---------------- helpers ---------------- */

const AMIYA = { id: "u-1", username: "amiya", avatar: null };

function make(
  entity_type: ActivityEntityType,
  action: ActivityAction,
  extra: Partial<Activity> = {},
): Activity {
  return {
    id: "a-1",
    actor: AMIYA,
    entity_type,
    entity_id: "x-1",
    issue: "i-1",
    action,
    old_value: null,
    new_value: null,
    created_at: "2026-09-17T04:30:00Z",
    ...extra,
  };
}

/* ---------------- 文案映射表：逐行 ---------------- */

describe("文案映射表 (06 契约)", () => {
  test("issue / created → {actor} 创建了任务", () => {
    assert.equal(describeActivity(make("issue", "created")), "amiya 创建了任务");
  });

  test("issue / deleted → {actor} 删除了任务", () => {
    assert.equal(describeActivity(make("issue", "deleted")), "amiya 删除了任务");
  });

  test("issue / updated → {actor} 将 X 从 A 改为 B", () => {
    const a = make("issue", "updated", {
      old_value: { state: "Todo" },
      new_value: { state: "Done" },
    });
    assert.equal(describeActivity(a), "amiya 将 状态 从 Todo 改为 Done");
  });

  test("comment / created → {actor} 评论了任务", () => {
    assert.equal(describeActivity(make("comment", "created")), "amiya 评论了任务");
  });

  test("comment / deleted → {actor} 删除了评论", () => {
    assert.equal(describeActivity(make("comment", "deleted")), "amiya 删除了评论");
  });

  test("project / created → {actor} 创建了项目「{name}」", () => {
    const a = make("project", "created", { new_value: { name: "Amiya Project" } });
    assert.equal(describeActivity(a), "amiya 创建了项目「Amiya Project」");
  });

  test("project / updated 用 name / identifier 两个键", () => {
    const a = make("project", "updated", {
      old_value: { name: "Old" },
      new_value: { name: "New" },
    });
    assert.equal(describeActivity(a), "amiya 将 项目名称 从 Old 改为 New");

    const b = make("project", "updated", {
      old_value: { identifier: "OLD" },
      new_value: { identifier: "NEW" },
    });
    assert.equal(describeActivity(b), "amiya 将 项目标识 从 OLD 改为 NEW");
  });

  test("枚举里预留但 MVP 未接线的类型：仍然出句子，不吞行", () => {
    // 一行不显示比一句话不精确更糟 —— 见 types/activity.ts 的注释。
    for (const t of ["state", "label", "workspace", "member"] as ActivityEntityType[]) {
      assert.equal(describeActivity(make(t, "created")), `amiya 创建了${t}`);
      assert.equal(describeActivity(make(t, "updated")), `amiya 更新了${t}`);
      assert.equal(describeActivity(make(t, "deleted")), `amiya 删除了${t}`);
    }
  });

  test("矩阵完整：每个 entity_type × action 都能渲染出非空句子", () => {
    const types: ActivityEntityType[] = [
      "issue",
      "comment",
      "project",
      "state",
      "label",
      "workspace",
      "member",
    ];
    const actions: ActivityAction[] = ["created", "updated", "deleted"];

    for (const t of types) {
      for (const action of actions) {
        const sentence = describeActivity(make(t, action));
        assert.ok(sentence.length > 0, `${t}/${action} 渲染为空`);
        assert.ok(sentence.startsWith("amiya"), `${t}/${action} 丢了 actor`);
      }
    }
  });
});

/* ---------------- 值格式（§字段 diff 白名单） ---------------- */

describe("字段 diff 值格式", () => {
  test("三条产品决策之 priority：数据里存枚举，中文由前端映射", () => {
    const a = make("issue", "updated", {
      old_value: { priority: "low" },
      new_value: { priority: "urgent" },
    });
    // 后端故意不写中文进数据（否则展示语言被写死在库里）
    assert.equal(a.new_value?.priority, "urgent");
    assert.equal(describeActivity(a), "amiya 将 优先级 从 低 改为 紧急");
  });

  test("PRIORITY_ZH 覆盖 04 契约的 5 个枚举值", () => {
    assert.deepEqual(PRIORITY_ZH, {
      none: "无",
      urgent: "紧急",
      high: "高",
      medium: "中",
      low: "低",
    });
  });

  test("assignee 为 null → 未指派", () => {
    const a = make("issue", "updated", {
      old_value: { assignee: "amiya" },
      new_value: { assignee: null },
    });
    assert.equal(describeActivity(a), "amiya 将 指派人 从 amiya 改为 未指派");
  });

  test("labels 是数组 → 顿号连接", () => {
    const a = make("issue", "updated", {
      old_value: { labels: ["bug"] },
      new_value: { labels: ["bug", "p1"] },
    });
    assert.equal(describeActivity(a), "amiya 将 标签 从 bug 改为 bug、p1");
  });

  test("labels 被清空 → 「空」，不是空字符串", () => {
    const a = make("issue", "updated", {
      old_value: { labels: ["bug"] },
      new_value: { labels: [] },
    });
    assert.equal(describeActivity(a), "amiya 将 标签 从 bug 改为 空");
  });

  test("description 只存字数摘要，直接拼进句子", () => {
    const a = make("issue", "updated", {
      old_value: { description: "12 字" },
      new_value: { description: "128 字" },
    });
    assert.equal(describeActivity(a), "amiya 将 描述 从 12 字 改为 128 字");
  });

  test("多字段同时被改 → 同一个活动里多个子句", () => {
    const a = make("issue", "updated", {
      old_value: { state: "Todo", priority: "low" },
      new_value: { state: "Done", priority: "high" },
    });
    const sentence = describeActivity(a);
    assert.ok(sentence.includes("将 状态 从 Todo 改为 Done"));
    assert.ok(sentence.includes("将 优先级 从 低 改为 高"));
  });

  test("created / deleted 不展开快照（只出动词短语）", () => {
    const created = make("issue", "created", {
      new_value: { state: "Backlog", priority: "none", labels: [] },
    });
    assert.deepEqual(activityDiffs(created), []);
    assert.equal(activityHeadline(created), "创建了任务");

    const deleted = make("issue", "deleted", { old_value: { state: "Done" } });
    assert.deepEqual(activityDiffs(deleted), []);
  });

  test("FIELD_LABELS 覆盖契约里列出的全部 8 个键", () => {
    for (const key of [
      "title",
      "description",
      "state",
      "priority",
      "assignee",
      "labels",
      "name",
      "identifier",
    ]) {
      assert.ok(FIELD_LABELS[key], `FIELD_LABELS 缺 ${key}`);
    }
  });
});

/* ---------------- 边界 ---------------- */

describe("边界与降级", () => {
  test("actor 缺失 → 某人，不抛异常", () => {
    const a = make("issue", "created");
    // @ts-expect-error 故意模拟异常载荷（后端理论上不会发）
    a.actor = undefined;
    assert.equal(describeActivity(a), "某人 创建了任务");
  });

  test("updated 但没有任何 diff → 退回「更新了任务」", () => {
    assert.equal(describeActivity(make("issue", "updated")), "amiya 更新了任务");
  });

  test("activityKind 给时间线圆点分类", () => {
    assert.equal(activityKind(make("issue", "created")), "created");
    assert.equal(activityKind(make("issue", "deleted")), "deleted");
    assert.equal(activityKind(make("issue", "updated")), "updated");
    // 评论事件优先按 comment 归类，方便 UI 给「→ Comments」入口
    assert.equal(activityKind(make("comment", "created")), "comment");
    assert.equal(activityKind(make("comment", "deleted")), "comment");
  });
});
