import { test, expect } from "@playwright/test";
import { apiClient, projectUrl, readDemoFixture } from "./helpers";

/**
 * 特色功能 A（命令面板）+ B（我的工作）+ Sprint 09/10（我的工程 / Global Plan）的浏览器级验收。
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

test.describe("Global Plan（Sprint 10）", () => {
  test("项目页显示 Global Plan 并可添加阶段", async ({ page }) => {
    const api = await apiClient();
    const fixture = await readDemoFixture(api);
    await api.dispose();

    await page.goto(projectUrl(fixture));
    await expect(page.getByText(/GLOBAL PLAN/).first()).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("新阶段名称").fill("Sprint 验收");
    await page.getByRole("button", { name: "添加阶段" }).click();
    await expect(page.getByText("Sprint 验收").first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("工程日志（Sprint 11）", () => {
  test("记一条日志并出现在 Engineering Log", async ({ page }) => {
    const api = await apiClient();
    const fixture = await readDemoFixture(api);
    await api.dispose();

    await page.goto(projectUrl(fixture));
    await page.getByLabel("日志标题").fill("E2E 工程日志");
    await page.getByLabel("完成内容").fill("跑通 Sprint 11 验收链路");
    await page.getByRole("button", { name: "记一条日志" }).click();
    await expect(page.getByText("E2E 工程日志").first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Agent Token（Sprint 12）", () => {
  test("设置页可创建 Token 并一次性展示明文", async ({ page }) => {
    await page.goto("/me");
    await expect(page.getByText("Agent Token", { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.getByLabel("Token 名称").fill("e2e-agent");
    await page.getByRole("button", { name: "创建 Token" }).click();
    // 明文只展示一次
    await expect(page.getByText(/明文仅显示这一次/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/^mpa_/).first()).toBeVisible({ timeout: 10_000 });
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
