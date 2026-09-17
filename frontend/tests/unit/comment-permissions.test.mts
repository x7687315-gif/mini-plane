/**
 * Unit tests — 评论「谁可以改/删」的判定 (docs/api/05-comments.md).
 *
 * 这条规则有两个来源，必须一致：
 * - 契约表：作者本人 ✅ / 生效角色 = Admin ✅ / 其他 Member ❌ / Viewer ❌
 * - 后端真码 `apps/issues/views.py::comment_detail`：
 *     if comment.author_id != request.user.id:
 *         _require_role(role, ProjectRoles.ADMIN)
 *   即「是作者就完全不看角色」，不是作者才要求 Admin。
 *
 * 契约表把「作者」与「Viewer」并列，容易被读成「Viewer 连自己的评论都不能删」。
 * 这里把真码的语义钉下来；Sprint 4 已据此在 05 契约里补了澄清行。
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { canManageComment } from "../../types/comment.ts";

const ME = "u-me";
const OTHER = "u-other";
const ADMIN = 20;
const MEMBER = 15;
const VIEWER = 5;

const mine = { author: { id: ME, username: "me", avatar: null } };
const theirs = { author: { id: OTHER, username: "other", avatar: null } };

describe("canManageComment", () => {
  test("作者本人：无论什么角色都能改删（含 Viewer）", () => {
    assert.equal(canManageComment(mine, ME, ADMIN), true);
    assert.equal(canManageComment(mine, ME, MEMBER), true);
    // 后端对作者不做角色判定 —— 这条是契约澄清的关键
    assert.equal(canManageComment(mine, ME, VIEWER), true);
    assert.equal(canManageComment(mine, ME, null), true);
  });

  test("非作者：只有 Admin 可以（管理他人评论）", () => {
    assert.equal(canManageComment(theirs, ME, ADMIN), true);
    assert.equal(canManageComment(theirs, ME, MEMBER), false);
    assert.equal(canManageComment(theirs, ME, VIEWER), false);
  });

  test("非作者且角色未知 / 未加载 → 不显示按钮（宁可少显示，不要 403）", () => {
    assert.equal(canManageComment(theirs, ME, null), false);
    assert.equal(canManageComment(theirs, ME, undefined), false);
  });

  test("自己是谁还没加载出来 → 只认 Admin", () => {
    assert.equal(canManageComment(mine, undefined, null), false);
    assert.equal(canManageComment(theirs, undefined, ADMIN), true);
  });

  test("作者 id 与当前用户一致但角色是 Member：命中作者分支，不是「其他 Member」", () => {
    // 回归点：早期实现若先判角色再判作者，这里会错误地返回 false
    assert.equal(canManageComment(mine, ME, MEMBER), true);
  });
});
