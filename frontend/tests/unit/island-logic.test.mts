/**
 * Unit tests — Engineering Island 纯逻辑 (features/engineering-island/logic.ts)，Sprint 14。
 *
 * 这几条断言全部落在"算错了但看不出来"的地方：翻过头、进度冒出 103%、
 * 计时在 59 秒进位、URL 指向已删除的项目。
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  clampSheetIndex,
  formatElapsed,
  hasNextSheet,
  hasPrevSheet,
  nextSheetIndex,
  orDash,
  prevSheetIndex,
  percentValue,
  progressPercent,
  resolveSheetIndex,
  sheetPageLabel,
} from "@/features/engineering-island/logic.ts";

describe("图纸翻页边界", () => {
  test("不循环：末页往后翻停在末页，首页往前翻停在首页", () => {
    assert.equal(nextSheetIndex(0, 3), 1);
    assert.equal(nextSheetIndex(2, 3), 2, "末页不能再往前，否则用户会以为还有更多图纸");
    assert.equal(prevSheetIndex(0, 3), 0, "首页不能再往后");
    assert.equal(prevSheetIndex(2, 3), 1);
  });

  test("clamp 把越界与非法输入都收进合法区间", () => {
    assert.equal(clampSheetIndex(9, 3), 2);
    assert.equal(clampSheetIndex(-4, 3), 0);
    assert.equal(clampSheetIndex(1.7, 3), 1, "小数索引要截断，不能出现第 1.7 页");
    assert.equal(clampSheetIndex(Number.NaN, 3), 0);
    assert.equal(clampSheetIndex(1, 0), 0, "没有图纸时不要崩");
  });

  test("边界提示只在真的到边时出现", () => {
    assert.equal(hasPrevSheet(0), false);
    assert.equal(hasPrevSheet(1), true);
    assert.equal(hasNextSheet(1, 3), true);
    assert.equal(hasNextSheet(2, 3), false);
    assert.equal(hasNextSheet(0, 0), false, "没有图纸时不应提示还有下一页");
  });
});

describe("进度换算：两套量纲分别显式处理，不靠猜", () => {
  test("progressPercent 只认 0~1（/projects/mine/ 的比例）", () => {
    assert.equal(progressPercent(0.72), 72);
    assert.equal(progressPercent(0), 0);
    assert.equal(progressPercent(1), 100, "0~1 量纲里 1 就是 100%");
    assert.equal(progressPercent(0.005), 1, "0.5% 向上取整到 1%，不显示成 0%");
  });

  test("percentValue 处理 0~100 整数量纲（plan 的 stage.progress）", () => {
    assert.equal(percentValue(72), 72);
    assert.equal(percentValue(1), 1, "0~100 量纲里 1 就是 1%——这正是不该用魔法阈值猜的区间");
    assert.equal(percentValue(100), 100);
  });

  test("越界与非法值被夹住，UI 宽度不接受 103%", () => {
    assert.equal(progressPercent(1.03), 100);
    assert.equal(progressPercent(-0.2), 0);
    assert.equal(progressPercent(Number.NaN), 0);
    assert.equal(progressPercent(null), 0);
    assert.equal(progressPercent(undefined), 0);
    assert.equal(percentValue(103), 100);
    assert.equal(percentValue(-1), 0);
  });
});
describe("Agent 计时格式化", () => {
  test("秒 → MM:SS，跨分钟正确进位", () => {
    assert.equal(formatElapsed(0), "00:00");
    assert.equal(formatElapsed(9), "00:09");
    assert.equal(formatElapsed(59), "00:59");
    assert.equal(formatElapsed(60), "01:00", "59 秒之后必须进位到 1 分整");
    assert.equal(formatElapsed(3661), "1:01:01", "超过一小时用 H:MM:SS");
  });

  test("负数与非法值回落到 00:00，不显示成负计时", () => {
    assert.equal(formatElapsed(-5), "00:00");
    assert.equal(formatElapsed(Number.NaN), "00:00");
    assert.equal(formatElapsed(null), "00:00");
  });
});

describe("URL → 页码（URL 是唯一事实来源）", () => {
  const projects = [{ id: "a" }, { id: "b" }, { id: "c" }];

  test("按 id 命中对应页", () => {
    assert.equal(resolveSheetIndex(projects, "b"), 1);
    assert.equal(resolveSheetIndex(projects, "a"), 0);
  });

  test("id 找不到（项目被删/无权限）时回落到首页，而不是空白或报错", () => {
    assert.equal(resolveSheetIndex(projects, "gone"), 0);
    assert.equal(resolveSheetIndex(projects, null), 0);
    assert.equal(resolveSheetIndex(projects, ""), 0);
  });
});

describe("图纸页码标注与空值显示", () => {
  test("页码补零，空列表显示 00 / 00", () => {
    assert.equal(sheetPageLabel(0, 8), "SHEET 01 / 08");
    assert.equal(sheetPageLabel(7, 8), "SHEET 08 / 08");
    assert.equal(sheetPageLabel(0, 0), "SHEET 00 / 00");
  });

  test("空值显示为破折号，不用空白冒充", () => {
    assert.equal(orDash(null), "—");
    assert.equal(orDash(""), "—");
    assert.equal(orDash("   "), "—", "只有空白的字符串也要算空");
    assert.equal(orDash("验证长文本"), "验证长文本");
  });
});
