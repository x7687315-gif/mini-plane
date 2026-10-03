/**
 * Unit tests — 「上次是谁」的解析 (lib/lastUser.ts)。
 *
 * 这里的每一条都是"登录页会白屏或行为诡异"的场景：localStorage 是浏览器共享的，
 * 同一份 origin 下任何代码都可能写坏它，所以**脏数据必须被当作"没有"**，
 * 而不是抛异常让整页崩掉。
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseLastUser } from "@/lib/lastUser.ts";

describe("上次是谁：脏数据一律当作没有", () => {
  test("正常结构", () => {
    assert.deepEqual(parseLastUser('{"username":"Amiya","avatar":"A"}'), {
      username: "Amiya",
      avatar: "A",
    });
  });

  test("空与 null", () => {
    assert.equal(parseLastUser(null), null);
    assert.equal(parseLastUser(""), null);
  });

  test("不是合法 JSON（存了半截）", () => {
    assert.equal(parseLastUser('{"username":"Amiya"'), null);
    assert.equal(parseLastUser("undefined"), null);
    assert.equal(parseLastUser("<html>"), null);
  });

  test("JSON 但结构不对", () => {
    assert.equal(parseLastUser("[]"), null, "数组不是对象");
    assert.equal(parseLastUser('"Amiya"'), null, "字符串不是对象");
    assert.equal(parseLastUser("null"), null);
    assert.equal(parseLastUser("123"), null);
  });

  test("缺 username 或 username 不合法 → 视为没有", () => {
    assert.equal(parseLastUser('{"avatar":"A"}'), null);
    assert.equal(parseLastUser('{"username":""}'), null);
    assert.equal(parseLastUser('{"username":"   "}'), null, "只有空白也算没有");
    assert.equal(parseLastUser('{"username":123}'), null, "数字不是合法用户名");
  });

  test("avatar 缺失或类型不对 → 归一为 null（不影响快捷入口）", () => {
    assert.deepEqual(parseLastUser('{"username":"Amiya"}'), {
      username: "Amiya",
      avatar: null,
    });
    assert.deepEqual(parseLastUser('{"username":"Amiya","avatar":""}'), {
      username: "Amiya",
      avatar: null,
    });
    assert.deepEqual(parseLastUser('{"username":"Amiya","avatar":42}'), {
      username: "Amiya",
      avatar: null,
    });
  });

  test("username 两端空白被裁掉（登录时不能带空格）", () => {
    assert.equal(parseLastUser('{"username":"  Amiya  "}')?.username, "Amiya");
  });
});
