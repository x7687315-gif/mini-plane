import { test, expect } from "@playwright/test";
import { apiClient, issueRow, projectUrl, readDemoFixture, STATES } from "./helpers";

/**
 * Sprint 3 + Sprint 4 验收（对应 `sprint-3-frontend.md` / `sprint-4-frontend.md` 里标 ⬜ 的项）：
 *
 * - Sprint 3：创建 Issue → 列表出现 → 改状态 → 刷新保持
 * - Sprint 4：创建评论 → 时间线出现 → **编辑评论 → 时间线不增加条目**
 *
 * 最后那条是契约（06 §有意不记录的事件）里最容易悄悄写坏的一条：
 * 评论编辑如果产生活动记录，时间线会被编辑噪声淹没。它只能靠"改完看条目数变没变"来验。
 */

test.describe("Issue 列表与详情", () => {
  test("新建 Issue → 出现在列表 → 改状态 → 刷新后保持", async ({ page }) => {
    const api = await apiClient();
    const fixture = await readDemoFixture(api);
    await api.dispose();

    const title = `UI 新建 ${Date.now().toString(36)}`;

    await page.goto(projectUrl(fixture));

    // 打开新建弹窗（按钮文案 /new issue/）
    await page.getByRole("button", { name: /新建任务/ }).first().click();

    // 弹窗里的标题输入（CreateIssueModal: Field label="Title" 对应 #i-title）
    await page.getByLabel("标题").fill(title);
    await page.getByRole("button", { name: /^创建/ }).click();

    // 创建成功后会直接打开该 Issue 的抽屉；先关掉，回到列表核对
    await expect(page).toHaveURL(/issue=/, { timeout: 20_000 });
    await page.keyboard.press("Escape");
    // .first()：抽屉关闭有动画，短时间内标题可能同时存在于列表行与抽屉 DOM 里
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });

    // 从列表点开它（用列表行里的那个，不是抽屉残留）
    await page.getByText(title, { exact: true }).first().click();
    await expect(page).toHaveURL(/issue=/, { timeout: 15_000 });

    // ⚠️ 抽屉一旦打开，它的遮罩会盖住整页 —— 所以抽屉内的交互**必须**限定在
    // getByRole("dialog") 里。早期版本用 page 级选择器找 "Backlog"，命中的是筛选栏的
    // chip（在遮罩后面），于是 click 一直等"元素可点"，空转到超时。
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 15_000 });

    // 改状态：抽屉里的 State 就地编辑
    await drawer.getByRole("button", { name: new RegExp(STATES[0], "i") }).click();
    await drawer
      .getByRole("option", { name: new RegExp(`^${STATES[3]}`, "i") })
      .click();

    // 关抽屉 → 列表那一行应显示新状态
    await expect(drawer).toBeHidden({ timeout: 15_000 }).catch(async () => {
      await page.keyboard.press("Escape");
    });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });

    // 用"同时包含标题与状态名的最内层容器"来断言这一行 —— 不依赖样式类名
    const changedRow = page
      .locator("div")
      .filter({ hasText: title })
      .filter({ hasText: STATES[3] })
      .last();
    await expect(changedRow, "列表行应反映新的状态名").toBeVisible({ timeout: 15_000 });

    // 刷新保持（后端才是事实来源）
    await page.reload();
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.locator("div").filter({ hasText: title }).filter({ hasText: STATES[3] }).last(),
      "刷新后状态仍是写入值",
    ).toBeVisible({ timeout: 15_000 });
  });

  test("评论 → 时间线出现；编辑评论 → 时间线条目数不变", async ({ page }) => {
    const api = await apiClient();
    const fixture = await readDemoFixture(api);
    await api.dispose();

    const first = fixture.issues[0]!;
    await page.goto(`${projectUrl(fixture)}?issue=${first.id}`);

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 20_000 });

    // 抽屉里首先看到的是 Activity tab
    const activityTab = drawer.getByRole("button", { name: /^动态/ });
    await expect(activityTab).toBeVisible({ timeout: 20_000 });

    /**
     * 读活动条目数。
     *
     * ⚠️ 这里必须**轮询**而不是"读一次再比"：活动计数来自分页信封的 count，
     * 在 React Query 失效重取的窗口里 data 会短暂为 undefined → count 读到 0。
     * 早期版本用一次性 innerText 比较，被这个瞬时 0 骗过（断言在错误的时机通过），
     * 于是"编辑评论不增条目"这条用例假红 —— 报 Expected 1 / Received 2。
     */
    const readCount = async (): Promise<number> => {
      const digits = (await activityTab.innerText()).replace(/\D/g, "");
      return digits ? Number(digits) : -1;
    };

    // 先等到计数稳定可读（>0），避免把瞬时 0 当作基线
    await expect.poll(readCount, { timeout: 20_000 }).toBeGreaterThan(0);
    const before = await readCount();

    // 切到 Comments 发一条评论
    await drawer.getByRole("button", { name: /^评论/ }).click();
    const body = `E2E 评论 ${Date.now().toString(36)}`;
    const composer = drawer.getByLabel("写评论");
    await composer.fill(body);
    await drawer.getByRole("button", { name: /^发布$/ }).click();

    // 断言 1：评论出现在列表里。
    // ⚠️ 必须限定到 `li`（评论行）—— 直接 getByRole("dialog").getByText(body) 会同时命中
    // 还在清空过程中的 <textarea>（Playwright 的文本匹配把表单控件的 value 也算作内容），
    // 于是 strict mode 报"匹配到 2 个元素"，看起来像功能坏了，其实是选择器不够精确。
    await expect(drawer.locator("li").filter({ hasText: body })).toBeVisible({
      timeout: 20_000,
    });

    // 断言 2：发送成功后输入框应清空（这是 CommentComposer 的真实行为，值得钉住）
    await expect(composer, "发送成功后输入框应清空").toHaveValue("", { timeout: 20_000 });

    // 发评论**会**写一条 comment.created 活动 → 计数应增加。
    //
    // 用 toBeGreaterThan 而不是 toBe(before + 1)：同一份数据会被别的 spec 改（例如
    // filter-bulk 给这些 Issue 打了标签，也会各写一条活动），精确等于会因此假红。
    // 这条用例要证明的是"创建评论让条目变多"，不是"恰好只多一条"。
    await expect
      .poll(readCount, {
        timeout: 20_000,
        message: "创建评论应让时间线多一条（06 契约：comment.created 记录）",
      })
      .toBeGreaterThan(before);
    const afterComment = await readCount();

    // 现在编辑这条评论
    const edited = `${body}（已编辑）`;
    await drawer.getByRole("button", { name: /^编辑$/ }).first().click();
    await drawer.getByLabel("edit comment").fill(edited);
    await drawer.getByRole("button", { name: /^保存$/ }).click();
    await expect(drawer.locator("li").filter({ hasText: edited })).toBeVisible({
      timeout: 20_000,
    });

    // ★ 核心断言：编辑**不**产生活动记录 → 计数保持不变。
    // 给一个观察窗口再断言"仍然相等"：写操作有网络延迟，立刻比会对"还没写"的
    // 情况假绿（那正是这条用例要防的反面）。
    await page.waitForTimeout(1500);
    expect(
      await readCount(),
      "编辑评论不应追加活动条目（06 契约 §有意不记录的事件）",
    ).toBe(afterComment);
  });

  test("抽屉关闭后 URL 里不留 issue/tab 参数", async ({ page }) => {
    const api = await apiClient();
    const fixture = await readDemoFixture(api);
    await api.dispose();

    await page.goto(`${projectUrl(fixture)}?issue=${fixture.issues[0]!.id}&tab=comments`);
    await expect(page.getByRole("button", { name: /^评论/ })).toBeVisible({
      timeout: 20_000,
    });

    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/issue=/);
    await expect(page).not.toHaveURL(/tab=/);
  });
});

test.describe("列表行的选择框", () => {
  test("勾选后行高亮，且批量操作条出现", async ({ page }) => {
    const api = await apiClient();
    const fixture = await readDemoFixture(api);
    await api.dispose();

    await page.goto(projectUrl(fixture));
    const row = issueRow(page, fixture.issues[0]!.sequenceId);
    await expect(row).toBeVisible({ timeout: 20_000 });

    await page.getByLabel(`select E2E-${fixture.issues[0]!.sequenceId}`, { exact: true }).check();
    await expect(page.getByRole("toolbar", { name: /批量操作/ })).toBeVisible();
    await expect(page.getByRole("toolbar", { name: /批量操作/ })).toContainText(
      /01|selected/i,
    );
  });
});
