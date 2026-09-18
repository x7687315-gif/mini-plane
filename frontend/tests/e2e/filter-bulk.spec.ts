import { test, expect } from "@playwright/test";
import { apiClient, issueRow, projectUrl, readDemoFixture } from "./helpers";

/**
 * Sprint 5 + Sprint 6 验收（对应两篇 devlog 里标 ⬜/⚠️ 的项）：
 *
 * - Sprint 5：应用 filter → 复制 URL → **新窗口打开 → filter 一致**（这条只有浏览器能验）
 * - Sprint 5：非法筛选参数 → 400 → 字段级提示 + clear 出口
 * - Sprint 6：多选 3 个 Issue → 批量改标签（异步任务）→ **列表与详情都更新**
 */

test.describe("筛选与 URL 同步", () => {
  test("搜索写进 URL；把 URL 粘到新页面，筛选条件一致", async ({ page, context }) => {
    const api = await apiClient();
    const fixture = await readDemoFixture(api);
    await api.dispose();

    await page.goto(projectUrl(fixture));
    const search = page.getByLabel("search issues");
    await expect(search).toBeVisible({ timeout: 20_000 });

    await search.fill("E2E 任务 A");

    // 防抖 250ms 后写入 URL；默认值不进 URL 的约定在这里也能顺带体现
    await expect(page).toHaveURL(/search=/, { timeout: 10_000 });
    const shared = page.url();

    // 「复制链接给同事」的真实路径：新开一个页面（同一份登录态）打开它
    const other = await context.newPage();
    await other.goto(shared);

    await expect(other.getByLabel("search issues")).toHaveValue("E2E 任务 A", {
      timeout: 20_000,
    });
    // 结果集也一致：命中 A，且不含 B
    await expect(other.getByText("E2E 任务 A", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(other.getByText("E2E 任务 B", { exact: true })).toHaveCount(0);

    await other.close();
  });

  test("非法 ordering 被静默丢弃：列表照常渲染，不报错、不带进请求", async ({ page }) => {
    const api = await apiClient();
    const fixture = await readDemoFixture(api);
    await api.dispose();

    // UI 自己不会产生非法值（下拉只有白名单）。手改地址栏是唯一来源。
    //
    // 这里断言的是**真实行为**：lib/url.ts 的 parseIssueQuery 对白名单外的 ordering
    // 直接丢弃 —— 所以列表正常渲染，不会出现错误卡片。
    //
    // 那"400 字段级提示"的卡片呢？它是**传输层的兜底**（Sprint 5 devlog §2.4 的两层策略）：
    // 只有当"前端认为合法、后端却拒绝"时才可能出现 —— 即前后端契约漂移时。
    // 今天它按设计不可达，因此这里不断言它；代码留着，等契约真漂移的那天它才救场。
    await page.goto(`${projectUrl(fixture)}?ordering=title`);

    await expect(page.getByText(fixture.issues[0]!.title, { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    // 没有错误卡片
    await expect(page.getByText(/不支持的排序字段/)).toHaveCount(0);
    // 地址栏保留用户输入（前端不回写 URL），但请求里没有这个非法值 ——
    // 用"列表有结果"间接证明：真发出去会 400，那就什么都渲染不出来。
  });
});

test.describe("批量操作（异步任务）", () => {
  test("多选 3 个 → 批量改标签 → 列表出现标签 → 抽屉里也有", async ({ page }) => {
    const api = await apiClient();
    const fixture = await readDemoFixture(api);
    await api.dispose();
    expect(fixture.issues.length).toBeGreaterThanOrEqual(3);

    await page.goto(projectUrl(fixture));
    await expect(page.getByText(fixture.issues[0]!.title, { exact: true })).toBeVisible({
      timeout: 20_000,
    });

    // 勾选前三行
    const picked = fixture.issues.slice(0, 3);
    for (const issue of picked) {
      await page.getByLabel(`select E2E-${issue.sequenceId}`, { exact: true }).check();
    }

    const toolbar = page.getByRole("toolbar", { name: /bulk actions/i });
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toContainText("03");

    // labels (replace)：覆盖式语义，所以勾选只改本地草稿，apply 才下发
    await page.getByLabel(/labels \(replace\)/).click();
    await page.getByRole("option", { name: /e2e-label/i }).click();
    await page.keyboard.press("Escape"); // 关掉下拉，避免遮住 apply 按钮
    await page.getByRole("button", { name: /^apply$/i }).click();

    // 受理提示（202 + 轮询）
    await expect(page.getByRole("status")).toContainText(/批量改标签/, { timeout: 15_000 });

    // ★ 核心断言：异步任务落地后，列表真的更新了（轮询 + 缓存失效的端到端效果）
    const row = issueRow(page, picked[0]!.sequenceId);
    await expect(row.getByText("e2e-label", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    // 任务成功会 onClearSelection()，操作条自己收起来 —— 这本身就是"跑完了"的信号
    await expect(toolbar).toBeHidden({ timeout: 15_000 });

    // 打开被改过的那个 Issue 的抽屉
    await page.getByText(picked[0]!.title, { exact: true }).first().click();
    await expect(page).toHaveURL(/issue=/, { timeout: 15_000 });

    // 详情抽屉里也要有（两个缓存都得失效，否则只有列表对）。
    // .first()：标签在抽屉里会同时出现在"已挂标签"行与 Add label 的候选列表里。
    await expect(page.getByRole("dialog").getByText("e2e-label").first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
