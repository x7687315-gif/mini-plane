/**
 * Unit tests — 模式判定纯逻辑 (stores/mode-logic.ts)，Sprint 17。
 *
 * 这两条断言全落在"错了但界面看着还挺正常"的地方：
 * 在 /workspaces 上出现一个点了没反应的按钮、在 /widget 上把个人层当成团队层。
 * 用户不会归因到"模式切换有问题"，只会觉得"这软件有点怪"。
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { HOME, routeToMode, switchTarget } from "@/stores/mode-logic.ts";

describe("URL → 层", () => {
  test("个人层的路由", () => {
    for (const p of ["/", "/me", "/me/issues", "/island", "/island-panel"]) {
      assert.equal(routeToMode(p), "personal", `${p} 应判为个人层`);
    }
  });

  test("团队层的路由", () => {
    for (const p of [
      "/workspaces",
      "/w/amiya",
      "/w/amiya/projects",
      "/w/amiya/projects/p1",
      "/w/amiya/projects/new",
      "/w/amiya/members",
      "/w/amiya/settings",
    ]) {
      assert.equal(routeToMode(p), "team", `${p} 应判为团队层`);
    }
  });

  test("/workspaces 必须判为团队层：它不传 railCurrent，别被 store 判成个人", () => {
    // 这条是"死按钮"的根因：若这里返回 personal，按钮会显示「去团队」，
    // 点下去 URL 不变、界面毫无反应
    assert.equal(routeToMode("/workspaces"), "team");
  });

  test("不能用过宽的前缀匹配：/work、/widget 不是团队层", () => {
    assert.equal(routeToMode("/work"), "personal");
    assert.equal(routeToMode("/widget"), "personal");
    assert.equal(routeToMode("/w"), "personal", "没有斜杠的 /w 不算 /w/ 前缀");
  });

  test("精确相等而非前缀：/workspacesx 不是团队层", () => {
    assert.equal(routeToMode("/workspacesx"), "personal");
  });

  test("空字符串不崩", () => {
    assert.equal(routeToMode(""), "personal");
  });
});

describe("切换按钮的目标落点", () => {
  test("个人 → 团队：没有记忆就去工作区列表", () => {
    assert.equal(switchTarget("personal", null), "/workspaces");
  });

  test("个人 → 团队：优先回到上次停留的团队位置（含深路径）", () => {
    assert.equal(switchTarget("personal", "/w/amiya"), "/w/amiya");
    assert.equal(switchTarget("personal", "/w/amiya/projects/9"), "/w/amiya/projects/9");
  });

  test("脏记忆一律忽略（只认 /w/ 开头）", () => {
    assert.equal(switchTarget("personal", "/"), "/workspaces");
    assert.equal(switchTarget("personal", "/me/issues"), "/workspaces");
    assert.equal(switchTarget("personal", "/island"), "/workspaces");
    assert.equal(switchTarget("personal", ""), "/workspaces");
  });

  test("团队 → 个人：永远回首页，永不使用记忆", () => {
    assert.equal(switchTarget("team", null), "/");
    assert.equal(switchTarget("team", "/w/amiya"), "/");
  });

  test("两层的家与判层结果自洽（不会切到自己的层里）", () => {
    assert.equal(routeToMode(HOME.personal), "personal");
    assert.equal(routeToMode(HOME.team), "team");
  });
});
