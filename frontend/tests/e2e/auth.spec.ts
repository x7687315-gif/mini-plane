import { test, expect } from "@playwright/test";
import { DEMO } from "./helpers";

/**
 * Sprint 1 验收（`sprint-1-frontend.md` 里标 ⬜ 的那条）：
 *   注册 → 自动登录 → 显示用户名 → 登出 → 重定向。
 *
 * 这个文件**故意退出全局登录态**（`storageState` 清空）：它验的正是登录本身，
 * 带着一份已登录的 cookie 跑会让用例变成假绿。
 */

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("认证闭环", () => {
  test("未登录访问受保护页 → 跳登录", async ({ page }) => {
    await page.goto("/w/does-not-exist/projects/nope");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("注册 → 自动登录 → 显示用户名 → 登出 → 回登录页", async ({ page }) => {
    // 每次跑用新账号，避免与上一次的残留冲突（后端 username 唯一）
    const stamp = Date.now().toString(36);
    const username = `e2e_signup_${stamp}`;
    const password = `Pw!${stamp}aaaa`;

    await page.goto("/register");
    await page.getByLabel(/用户名/).fill(username);
    await page.getByLabel(/邮箱/).fill(`${username}@example.com`);
    await page.getByLabel(/密码/).fill(password);
    await page.locator('form button[type="submit"]').click();

    // 注册即自动登录：应离开 /register
    await expect(page, "注册后应自动登录并离开注册页").not.toHaveURL(
      /\/(register|login)/,
      { timeout: 20_000 },
    );

    // 顶栏的账号菜单应显示这个新用户名
    const menuTrigger = page.locator('header button[aria-haspopup="menu"]');
    await expect(menuTrigger).toContainText(username, { timeout: 15_000 });

    // 个人设置页也应认得它（/me 读的是 /auth/me/）
    await page.goto("/me");
    await expect(page.getByText(username, { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });

    // 登出：账号菜单 → 最后一项（"sign out"，见 AvatarMenu）
    await page.locator('header button[aria-haspopup="menu"]').click();
    await page.getByRole("menuitem").filter({ hasText: /out|登出/i }).click();

    await expect(page, "登出后应回到 /login").toHaveURL(/\/login/, { timeout: 15_000 });

    // 登出是**真的**失效：再访问受保护页还是会被弹回登录页
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("/login?redirect= 登录后回到目标页", async ({ page }) => {
    await page.goto("/login?redirect=%2Fme");
    await page.getByLabel(/用户名/).fill(DEMO.username);
    await page.getByLabel(/密码/).fill(DEMO.password);
    await page.locator('form button[type="submit"]').click();

    // useRedirectTarget 只在同源相对路径上生效（开放重定向防护）
    await expect(page).toHaveURL(/\/me$/, { timeout: 20_000 });
  });
});
