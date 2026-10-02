/**
 * Engineering mode switch — Sprint 17 端到端。
 *
 * 四条用例各守一件"错了但界面看着还挺正常"的事：
 *   1. 切换往返与 URL 变化（按钮点了没反应 / 跳错层）
 *   2. 刷新后位置记忆仍在（只存在组件 state 里的假记忆）
 *   3. /island-panel 不受 TopBar 改造影响（桌面 Island 窗口不能长出主窗口的 chrome）
 *   4. 侧栏接上真实数据（假数据 "Amiya/Kal'tsit/Rhodes" 已删的回归锁）
 *
 * 造数走 API、UI 只验交互（沿用 helpers.ts 的原则）；模式判断只依赖 URL，
 * 所以不需要为"当前层"准备任何前置数据。
 */

import { test, expect } from "@playwright/test";
import { readDemoFixture, apiClient } from "./helpers";

test.describe("模式切换（个人 ⇄ 团队）", () => {
  /**
   * ⚠️ 这里**故意不做**「用 page.addInitScript 清 localStorage」这种重置。
   *
   * 两个原因：
   * 1. `.auth/user.json` 里只有 cookie、**没有 localStorage**（已核实），
   *    Playwright 每个 test 新建 context，所以「上次团队位置」天然是空的，不需要重置。
   * 2. 更要紧的：`addInitScript` 会在**每次导航时重跑**（包括 `page.reload()`），
   *    等于测试自己把刚写进 localStorage 的记忆又抹掉——
   *    那条「刷新后记忆仍在」的用例就是这么被自己搞红的（第一次跑时确实红了）。
   *
   * 所以这里老老实实让记忆按产品的真实行为落盘，断言也一步不让。
   */
  test("往返切换：URL 跟着变，按钮文案随之翻转", async ({ page }) => {
    await page.goto("/");

    const toTeam = page.getByRole("button", { name: "切换到团队协作" });
    await expect(toTeam).toBeVisible({ timeout: 20_000 });

    // 无记忆时落到工作区列表
    await toTeam.click();
    await expect(page).toHaveURL(/\/workspaces$/, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "切换到个人工程" })).toBeVisible();

    // 再切回来
    await page.getByRole("button", { name: "切换到个人工程" }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "切换到团队协作" })).toBeVisible();
  });

  test("刷新后仍记得上次停留的团队位置（记忆真的落盘了）", async ({ page }) => {
    const api = await apiClient();
    const fixture = await readDemoFixture(api);
    const wsPath = `/w/${fixture.workspaceSlug}/`;
    await api.dispose();

    await page.goto(wsPath);
    await page.getByRole("button", { name: "切换到个人工程" }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });

    // ★ 这条的核心：刷新后仍落在个人首页（说明模式由 URL 判定，不是组件 state）
    await page.reload();
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });

    // ★ 关键断言：切回团队时**直接回到上次那个工作区**，而不是退回 /workspaces。
    // 若这里失败，先怀疑记忆没写进 localStorage，不要放宽断言。
    //
    // 注意 URL 形状：应用路由规范化后**不带尾斜杠**（`/w/<slug>`），
    // 记忆里存的也是这个形状，所以期望值同样不带斜杠。
    // （曾经在这里写成带斜杠的版本，断言形态写错导致假红——已实测确认应用侧行为正确。）
    await page.getByRole("button", { name: "切换到团队协作" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/w/${fixture.workspaceSlug}$`),
      { timeout: 20_000 },
    );
  });

  test("/island-panel 不受 TopBar 改造影响（桌面 Island 窗口没有主窗口的 chrome）", async ({
    page,
  }) => {
    await page.goto("/island-panel");

    // 它在 (panel) 路由组里、不套 AppShell —— 这是"物理隔离"，比加开关更可靠
    await expect(page.getByRole("button", { name: /切换到/ })).toHaveCount(0);
    await expect(page.locator("aside")).toHaveCount(0);
    await expect(page.locator("footer")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Plane/ })).toHaveCount(0);
  });

  test("侧栏接上真实数据：假数据已删、个人层有入口、当前项可读", async ({ page }) => {
    const api = await apiClient();
    const fixture = await readDemoFixture(api);
    await api.dispose();

    await page.goto("/");

    // 个人层：侧栏是个人入口，且**不再出现 Sprint 0 的假数据**
    const personalNav = page.getByRole("navigation", { name: "个人" });
    await expect(personalNav).toBeVisible({ timeout: 20_000 });
    await expect(personalNav.getByText("我的工程")).toBeVisible();
    for (const fake of ["Amiya", "Kal'tsit", "Rhodes"]) {
      await expect(personalNav.getByText(fake)).toHaveCount(0);
    }

    // 首页的「进入团队」入口
    await page.getByRole("link", { name: "进入团队" }).click();
    await expect(page).toHaveURL(/\/workspaces$/, { timeout: 20_000 });

    // 团队层：侧栏换成真实工作区列表，且当前项带 aria-current（无障碍 + E2E 抓手）
    const wsNav = page.getByRole("navigation", { name: "工作区" });
    await expect(wsNav).toBeVisible();
    await page.goto(`/w/${fixture.workspaceSlug}/`);
    const current = wsNav.getByRole("link", { name: new RegExp(fixture.workspaceName) });
    await expect(current).toBeVisible({ timeout: 20_000 });
    await expect(current).toHaveAttribute("aria-current", "page");
  });
});
