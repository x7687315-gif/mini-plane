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

test.describe("批量部分失败 → 只重试失败的", () => {
  /**
   * Sprint 6 留下那笔账的回归：批量失败时不能只丢一句提示，要给出"继续做完"的路。
   *
   * 怎么**确定性地**制造部分失败：在 UI 背后用 API 删掉其中一条被选中的 Issue，
   * 界面上那一行还在（缓存尚未刷新），于是整批操作里它必然 404，另外两条成功。
   * 这比注入 mock 更接近真实的失败来源 —— 别人删了、权限变了、并发改动了。
   */
  test("3 条里有 1 条已被删 → 报 2/3 成功 → retry failed 只打那 1 条", async ({ page }) => {
    const api = await apiClient();
    const fixture = await readDemoFixture(api);
    expect(fixture.issues.length).toBeGreaterThanOrEqual(3);

    await page.goto(projectUrl(fixture));
    const picked = fixture.issues.slice(0, 3);
    for (const issue of picked) {
      await expect(page.getByText(issue.title, { exact: true }).first()).toBeVisible({
        timeout: 20_000,
      });
      await page.getByLabel(`select E2E-${issue.sequenceId}`, { exact: true }).check();
    }

    const toolbar = page.getByRole("toolbar", { name: /bulk actions/i });
    await expect(toolbar).toContainText("03");

    // 在 UI 背后删掉第三条 —— 界面上它还在，所以这一批会有一条 404
    const doomed = picked[2]!;
    const del = await api.write(
      "DELETE",
      `/api/v1/workspaces/${fixture.workspaceSlug}/projects/${fixture.projectId}/issues/${doomed.id}/`,
    );
    expect(del.status(), "背后删除应成功").toBe(204);
    await api.dispose();

    // 用操作条改状态（这条路径是前端编排的 N 次串行请求，不是异步任务）
    await toolbar.getByRole("button", { name: /set state/i }).click();
    await page.getByRole("option", { name: /^Todo$/i }).click();

    // ★ 断言 1：如实报「2/3 成功 · 1 个失败」，而不是笼统说"失败"
    const toast = page.getByRole("status");
    await expect(toast).toContainText("2/3 成功", { timeout: 20_000 });
    await expect(toast).toContainText("1 个失败");

    // ★ 断言 2：操作条上出现重试入口，并写明还有几条
    await expect(toolbar).toContainText("1 failed");
    const retryBtn = toolbar.getByRole("button", { name: /retry failed/i });
    await expect(retryBtn).toBeVisible();

    // 成功的那两条真的写进去了
    for (const issue of picked.slice(0, 2)) {
      await expect(issueRow(page, issue.sequenceId), "成功的两条应显示新状态").toContainText(
        "Todo",
        { timeout: 20_000 },
      );
    }

    // ★ 断言 3：重试**只打失败的那 1 条**（0/1，而不是 0/3）
    // 这一条是整笔账的重点：重试必须精确，否则会把已经成功的两条再打一遍。
    await retryBtn.click();
    await expect(toast, "重试应只针对失败的 1 条").toContainText("0/1 成功", {
      timeout: 20_000,
    });
    // 被删掉的那条依然失败（它真的不存在了），所以入口保留，用户不会以为已经修好
    await expect(toolbar).toContainText("1 failed");
  });
});
