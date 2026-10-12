/**
 * Island V2 摘要逻辑的单测（`node --test` + 原生 TS 擦除，零依赖）。
 *
 * 覆盖的是规格 §2 的**诚实性规则**：
 *   - 缺数据显示约定文案，不许出现空字符串或 undefined；
 *   - DONE 有标题清单 > 有计数 > 空，三级优先，且**不许**用计数冒充标题；
 *   - 截断稳定（同一输入永远同一输出），空值安全。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_DONE,
  EMPTY_HOW,
  EMPTY_NEXT,
  EMPTY_STAGE,
  EMPTY_STEP,
  doneSummary,
  truncate,
} from "../../features/engineering-island/logic.ts";

describe("truncate", () => {
  it("短于上限时原样返回", () => {
    assert.equal(truncate("先读规格", 10), "先读规格");
  });

  it("超过上限时截断并加省略号，且长度不超过上限", () => {
    const out = truncate("一二三四五六七八九十", 6);
    assert.equal(out, "一二三四五…");
    assert.ok(out.length <= 6);
  });

  it("空值与 null 安全", () => {
    assert.equal(truncate(null, 10), "");
    assert.equal(truncate(undefined, 10), "");
    assert.equal(truncate("   ", 10), "");
  });

  it("同样输入永远同样输出（渲染稳定性）", () => {
    const text = "这是一段很长很长很长很长很长的执行方法说明";
    assert.equal(truncate(text, 12), truncate(text, 12));
  });
});

describe("doneSummary（DONE 的三级诚实优先）", () => {
  it("有最近完成标题 → 用标题清单", () => {
    const r = doneSummary(12, ["修好关窗退出", "清出 7.8 GB"]);
    assert.equal(r.kind, "list");
    if (r.kind === "list") assert.deepEqual(r.titles, ["修好关窗退出", "清出 7.8 GB"]);
  });

  it("没有标题但有已完成计数 → 用计数（真实统计，不是推测）", () => {
    const r = doneSummary(12, []);
    assert.deepEqual(r, { kind: "count", count: 12 });
  });

  it("两者都没有 → 空", () => {
    assert.deepEqual(doneSummary(0, null), { kind: "empty" });
    assert.deepEqual(doneSummary(null, undefined), { kind: "empty" });
  });

  it("标题里的空白项被剔除，不拿来充数", () => {
    const r = doneSummary(3, ["  ", "真标题"]);
    assert.equal(r.kind, "list");
    if (r.kind === "list") assert.deepEqual(r.titles, ["真标题"]);
  });

  it("计数是非有限值时不编造", () => {
    assert.deepEqual(doneSummary(Number.NaN, []), { kind: "empty" });
  });
});

describe("缺失字段文案（规格 §2 表格右列）", () => {
  it("文案是约定常量，E2E 用同一份断言", () => {
    assert.equal(EMPTY_STEP, "Agent 尚未报告步骤");
    assert.equal(EMPTY_HOW, "尚未记录执行方法");
    assert.equal(EMPTY_NEXT, "尚未安排下一步");
    assert.equal(EMPTY_STAGE, "未设置阶段");
    assert.equal(EMPTY_DONE, "暂无完成记录");
  });
});
