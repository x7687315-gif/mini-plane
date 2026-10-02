/**
 * Engineering Island 端到端（Sprint 14）。
 *
 * 按 helpers.ts 的原则：**造数走 API，UI 只验交互**。
 * 切页要验的是"翻到第二张图纸"这件事，所以这里额外用 API 造第二个项目——
 * 演示项目只有一个，测不出轮播。
 */

import { test, expect } from "@playwright/test";
import { apiClient, expectWriteOk, readDemoFixture } from "./helpers";

test.describe("Engineering Island", () => {
  test("图纸页显示：阶段 / 进度 / NOW / TODAY / NEXT / AGENT", async ({ page }) => {
    await page.goto("/island");

    // 标题与图纸页容器
    await expect(page.getByRole("heading", { name: "Engineering Island" })).toBeVisible();
    const sheet = page.getByRole("article", { name: /工程图纸$/ }).first();
    await expect(sheet).toBeVisible({ timeout: 20_000 });

    // 六个信息块都在（缺一个都不该算通过——它们是 Island 的全部意义）
    for (const label of ["NOW", "NEXT", "TODAY", "AGENT"]) {
      await expect(sheet.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(sheet.getByRole("progressbar", { name: "项目进度" })).toBeVisible();

    // 演示项目有 3 个 Issue 且未全部完成，进度条不能是 0%（0% 说明数据没接上）
    const bar = sheet.getByRole("progressbar", { name: "项目进度" });
    await expect(bar).toHaveAttribute("aria-valuenow", /\d+/);
  });

  test("切到第二张图纸：URL 记住 sheet，卡片内容随之改变，末页按钮置灰", async ({ page }) => {
    const api = await apiClient();
    const fixture = await readDemoFixture(api);

    // 造第二个项目（演示项目只有一个，测不出轮播）
    const created = await api.write(
      "POST",
      `/api/v1/workspaces/${fixture.workspaceSlug}/projects/`,
      { name: "Island Second Sheet", identifier: "ISL" },
    );
    expectWriteOk(created, "创建第二个项目");

    // 以 /projects/mine/ 的返回顺序为准（按 last_activity 排序，序号会漂移）
    const mine = await api.get<{ id: string; identifier: string }[]>("/api/v1/projects/mine/");
    const [first, second] = mine.body!;
    expect(mine.body!.length, "演示数据里至少要有两个项目").toBeGreaterThanOrEqual(2);
    await api.dispose();

    await page.goto("/island");

    // 首屏是第一张图纸，且 URL 还没写 sheet（默认首页）
    const firstSheet = page.getByRole("article", { name: new RegExp(`${first!.identifier}`) });
    await expect(firstSheet.first()).toBeVisible({ timeout: 20_000 });

    // 点"下一页" → URL 变成第二张图纸的 id，卡片跟着换
    await page.getByRole("button", { name: "下一张图纸" }).click();
    await expect(page).toHaveURL(new RegExp(`sheet=${second!.id}`), { timeout: 20_000 });
    const secondSheet = page.getByRole("article", { name: new RegExp(`${second!.identifier}`) });
    await expect(secondSheet.first()).toBeVisible({ timeout: 20_000 });
    await expect(firstSheet).toBeHidden();

    // 末页：下一页按钮置灰（不循环，边界必须诚实）
    await expect(page.getByRole("button", { name: "下一张图纸" })).toBeDisabled();
    await expect(page.getByText(/已到末页/)).toBeVisible();

    // 刷新后仍停在第二张图纸（URL 是唯一事实来源）
    await page.reload();
    await expect(secondSheet.first()).toBeVisible({ timeout: 20_000 });
  });

  test("收起为最小态：只剩一行，再点回来展开", async ({ page }) => {
    await page.goto("/island");
    await expect(page.getByRole("article").first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "收起为最小态" }).click();
    await expect(page.getByRole("article").first()).toBeHidden();
    await expect(page.getByRole("button", { name: /展开 .* 工程图纸/ })).toBeVisible();

    await page.getByRole("button", { name: /展开 .* 工程图纸/ }).click();
    await expect(page.getByRole("article").first()).toBeVisible();
  });
});

test.describe("Island 独立窗口面板（Sprint 15）", () => {
  test("面板不套 AppShell：没有侧栏/页脚，也不出现桌面专属控件", async ({ page }) => {
    await page.goto("/island-panel");

    // 图纸本身要正常渲染
    await expect(page.getByRole("article").first()).toBeVisible({ timeout: 20_000 });

    // 面板路由刻意不放进 (protected) 组：没有 AppShell 的侧栏与页栏
    await expect(page.locator("footer")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Plane/ })).toHaveCount(0);

    // 浏览器里没有 pywebview 桥 → 桌面专属的「独立窗口」按钮不该出现
    await expect(page.getByRole("button", { name: /独立 Island 窗口/ })).toHaveCount(0);
    // 面板里也不该有「收起为最小态」（隐藏整个窗口才是这里的对应动作）
    await expect(page.getByRole("button", { name: "收起为最小态" })).toHaveCount(0);
  });
});
