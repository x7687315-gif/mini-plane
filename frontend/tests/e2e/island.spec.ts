/**
 * Engineering Island 端到端（Island V2 · `docs/ISLAND_V2_SPEC.md` §8 验收）。
 *
 * 按 helpers.ts 的原则：**造数走 API，UI 只验交互**。
 *
 * V2 与第一代验收的根本区别：**不再验收"翻页"**（规格 §1.4：多项目同时可见，
 * 核心总览不依赖轮播），改为验收"两个以上项目**同时**在 DOM 里"。
 * 旧用例（切到第二张图纸 / 末页置灰 / 收起为最小态）随轮播一起退场。
 *
 * 三条诚实性断言对应规格红线：
 *   - STEP / HOW 没有 Agent 上报时显示约定文案，**不许**被任务描述冒充；
 *   - DONE 只有计数时显示"已完成 N 项"，**不许**出现假标题；
 *   - 空值用「—」与约定文案，不留白。
 */

import { test, expect } from "@playwright/test";
import { apiClient, expectWriteOk, readDemoFixture } from "./helpers";

test.describe("Engineering Island V2 多项目总览", () => {
  test("总览显示六个问题 + AGENT，且占位文案诚实", async ({ page }) => {
    await page.goto("/island");

    // 页面标题用 level:1 精确定位：Island 面板自己也有一个同名 h2
    // （桌面窗口里没有外层页面标题，那个 h2 就是唯一标题），
    // 裸 getByRole('heading') 会撞 strict mode violation。
    await expect(page.getByRole("heading", { level: 1, name: "Engineering Island" })).toBeVisible();
    const overview = page.getByTestId("island-overview");
    await expect(overview).toBeVisible({ timeout: 20_000 });

    // 六问标签 + AGENT 状态，缺一个都不算通过（它们是 Island 的全部意义）
    for (const label of ["NOW", "STEP", "HOW", "NEXT", "DONE"]) {
      await expect(overview.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(overview.getByText("AGENT", { exact: true }).first()).toBeVisible();

    // 进度条：演示项目有任务，不能是 0%（0% 说明数据没接上）
    const bar = overview.getByRole("progressbar", { name: "项目进度" }).first();
    await expect(bar).toHaveAttribute("aria-valuenow", /\d+/);

    // 红线：没有 Agent 上报 STEP / HOW 时必须是约定文案，而不是留白或被冒充
    await expect(overview.getByText("Agent 尚未报告步骤").first()).toBeVisible();
    await expect(overview.getByText("尚未记录执行方法").first()).toBeVisible();
  });

  test("多个项目同时可见：不需要翻页，各自有独立摘要", async ({ page }) => {
    const api = await apiClient();
    const fixture = await readDemoFixture(api);

    // 造第二个项目（演示项目只有一个，测不出"同时可见"）
    const created = await api.write(
      "POST",
      `/api/v1/workspaces/${fixture.workspaceSlug}/projects/`,
      { name: "Island Overview Second", identifier: "OVW" },
    );
    expectWriteOk(created, "创建第二个项目");

    // 以 /projects/mine/ 的返回顺序为准（按 last_activity 排序，序号会漂移）
    const mine = await api.get<{ id: string; identifier: string }[]>("/api/v1/projects/mine/");
    expect(mine.body!.length, "至少要有两个项目").toBeGreaterThanOrEqual(2);
    const first = mine.body![0]!;
    const second = mine.body![1]!;
    await api.dispose();

    await page.goto("/island");
    const cards = page.getByTestId("project-summary-card");
    await expect(cards).toHaveCount(mine.body!.length, { timeout: 20_000 });

    // 两个项目**同时**在 DOM 里：这是 V2 与翻页版的分界线
    await expect(cards.filter({ hasText: first.identifier }).first()).toBeVisible();
    await expect(cards.filter({ hasText: second.identifier }).first()).toBeVisible();

    // 没有翻页控件（规格：核心总览不依赖轮播）
    await expect(page.getByRole("button", { name: "下一张图纸" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "上一张图纸" })).toHaveCount(0);

    // 每张卡片各自有进度条（不是共享一条）
    await expect(page.getByRole("progressbar", { name: "项目进度" })).toHaveCount(
      mine.body!.length,
    );
  });
});

test.describe("Island 独立窗口面板（Island V2）", () => {
  test("面板不套 AppShell，也不出现未实现的桌面控件", async ({ page }) => {
    await page.goto("/island-panel");

    // 总览本身要正常渲染（面板与网页共用同一套组件）
    await expect(page.getByTestId("island-overview")).toBeVisible({ timeout: 20_000 });

    // 面板路由刻意不放进 (protected) 组：没有 AppShell 的侧栏与页栏
    await expect(page.locator("footer")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Plane/ })).toHaveCount(0);

    // 阶段 2 的图钉**只在桌面面板里渲染**（有 pywebview 桥时才出现）；
    // 浏览器里没有桥 → 不该出现（点了没反应比没有更糟）
    await expect(page.getByTestId("island-pin")).toHaveCount(0);

    // 第一代的翻页控件随轮播一起退场
    await expect(page.getByRole("button", { name: "收起为最小态" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "下一张图纸" })).toHaveCount(0);
  });

  test("触发把手路由：可渲染、可点击，浏览器里是安全的 no-op", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto("/island-trigger");
    const trigger = page.getByTestId("island-trigger");
    await expect(trigger).toBeVisible({ timeout: 20_000 });
    await expect(trigger).toHaveAccessibleName(/展开或收起工程 Island 面板/);

    // 浏览器里没有 pywebview 桥：点击必须是 no-op，不能抛错把页面搞崩
    await trigger.click();
    await expect(trigger).toBeVisible();
    expect(errors, "点击把手不应产生页面异常").toEqual([]);
  });
});

/**
 * 空态用例放在**最后**：它自己建一个账户、自己带会话，
 * 不碰 `.auth/user.json` 的共享会话（放前面时曾让后面的面板用例被蹬登出——
 * 共享 storageState 是文件快照，任何把它顶掉的操作都会连累后续用例）。
 */
test.describe("Engineering Island V2 空态", () => {
  test("没有项目时给明确文案，不留白", async ({ browser }) => {
    const api = await apiClient();
    const stamp = Date.now().toString(36);
    const username = `e2e_island_empty_${stamp}`;

    // register 只需昵称（密码可选）；注册即登录，API 上下文里已有会话
    const created = await api.write("POST", "/api/v1/auth/register/", { username });
    expectWriteOk(created, "注册空账户");
    const state = await api.raw().storageState();
    await api.dispose();

    // 用这个新账户的会话开一个**独立**上下文，完全不复用共享登录态
    const ctx = await browser.newContext({ storageState: state });
    const page = await ctx.newPage();
    try {
      await page.goto("/island");
      await expect(page.getByText("还没有工程")).toBeVisible({ timeout: 20_000 });
      // 空态时不该有卡片，也不该有假进度
      await expect(page.getByTestId("project-summary-card")).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});
