import { test, expect } from "@playwright/test";

/**
 * 特色功能 A（命令面板）+ B（我的工作）的浏览器级验收。
 * 走默认 chromium project（已带 DEMO 登录态 storageState）。
 */

test.describe("命令面板（A）", () => {
  test("打开面板 → 搜索 → 回车导航到「我的工作」", async ({ page }) => {
    await page.goto("/");
    // 用按钮唤起（Playwright 跑在真实 Chrome 里，Ctrl+K 会被浏览器自身的搜索快捷键拦截；
    // 桌面 WebView2 无浏览器外壳，Ctrl+K 能直达页面——按钮与快捷键走同一 open 逻辑）
    await page.getByRole("button", { name: "打开命令面板" }).click();

    const dialog = page.getByRole("dialog", { name: "命令面板" });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await dialog.getByRole("combobox").fill("我的工作");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/me\/issues/, { timeout: 15_000 });
  });

  test("TopBar「搜索」按钮可唤起面板，Esc 关闭", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "打开命令面板" }).click();
    await expect(page.getByRole("dialog", { name: "命令面板" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "命令面板" })).toHaveCount(0);
  });
});

test.describe("我的工作（B）", () => {
  test("页面渲染 + 切换筛选范围不报错", async ({ page }) => {
    await page.goto("/me/issues");
    await expect(page.getByRole("heading", { name: "My work" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "指派给我" }).click();
    await expect(page.getByRole("group", { name: "筛选范围" })).toBeVisible();
  });
});

test.describe("我的工程首页（Sprint 09）", () => {
  test("首页默认是 My Engineering，展示项目工程卡片与进度", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "My Engineering" })).toBeVisible({
      timeout: 15_000,
    });
    // 演示项目（global.setup 建的 E2E Project）应出现在工程卡片里
    await expect(page.getByText("E2E Project").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/progress/i).first()).toBeVisible();
  });

  test("Workspace 降级到 /workspaces 仍可访问", async ({ page }) => {
    await page.goto("/workspaces");
    await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible({
      timeout: 15_000,
    });
  });
});
