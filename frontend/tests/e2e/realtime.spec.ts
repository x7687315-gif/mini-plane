import { test, expect } from "@playwright/test";
import { apiClient, issueRow, projectUrl, readDemoFixture } from "./helpers";

/**
 * Sprint 7 验收（`sprint-7-frontend.md` 里标 ⚠️ 的三条里的第一条）：
 *   A 改 issue → B **自动**收到（不需要刷新）。
 *
 * 为什么必须两个浏览器 context：一个 context 就是一份独立 cookie 罐，等价于两个窗口。
 * B 停在列表页**完全不动**；A 在另一个窗口里把状态改掉。如果前端没有 WebSocket，
 * B 的界面永远不会变 —— 所以这条用例能真实区分"推送生效"和"恰好也刷新了"。
 *
 * 为什么 A 也走 UI（而不是用 HTTP 直接打 API）：早期版本用 Playwright 的
 * APIRequestContext 发 PATCH，一直拿到
 * `CSRF Failed: CSRF token from the 'X-Csrftoken' HTTP header incorrect`。
 * 根因是那条链路里的 CSRF 需要自己维护（Django 在登录时轮换 csrftoken，
 * 且 /auth/csrf/ 只回提示、token 只能从 cookie 读），而**浏览器里的前端本来就做对了**
 * （lib/api.ts 的 401/403 自愈）。改用 UI 后既绕开了这个坑，也更接近真实：
 * "A 改状态"本来就意味着 A 在界面上点了。
 */

test.describe("实时推送", () => {
  test("B 停在列表：A 在另一个窗口改状态 → B 无需刷新即更新", async ({ page, browser }) => {
    const api = await apiClient();
    const fixture = await readDemoFixture(api);
    // ⚠️ 这里**不能**马上 dispose：下面还要用它读"当前状态"来决定目标状态
    const target = fixture.issues[1]!;

    // ── B：停在项目页，之后**不再有任何交互** ──────────────
    await page.goto(projectUrl(fixture));
    await expect(page.getByText(target.title, { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    // 握手成功 → 顶栏指示器变 live（08 契约的 connected 帧）
    await expect(page.locator("header")).toContainText(/已连接/, { timeout: 20_000 });

    const rowB = issueRow(page, target.sequenceId);

    /**
     * 目标状态必须**与当前状态不同**，而且不能假定当前是什么。
     *
     * 早期版本硬编码"先断言是 Backlog，再改成 Cancelled"。这在单独跑时没问题，
     * 但它悄悄依赖了"没有别的 spec 动过这条 Issue" —— 一旦新加的用例
     * （批量改状态那条）先把它改成 Todo，这条就假红。
     * **共享可变数据的用例不能假定初值**，只能断言"变化前后不同"。
     */
    const { body: states } = await api.get<{ results: { id: string; name: string }[] }>(
      `/api/v1/workspaces/${fixture.workspaceSlug}/projects/${fixture.projectId}/states/`,
    );
    const current = await api.get<{ state: { name: string } }>(
      `/api/v1/workspaces/${fixture.workspaceSlug}/projects/${fixture.projectId}/issues/${target.id}/`,
    );
    const currentName = current.body?.state.name ?? "";
    const targetState = states!.results.find((s) => s.name !== currentName)!;
    expect(targetState, "要有一个与当前不同的状态可用").toBeTruthy();

    // 改之前：B 的行里**没有**目标状态 —— 这样后面的断言才能证明"是推送带来的变化"
    await expect(rowB).not.toContainText(targetState.name);
    await api.dispose();

    // ── A：另一个浏览器上下文（独立 cookie 罐），通过 UI 改状态 ──
    const ctxA = await browser.newContext({ storageState: ".auth/user.json" });
    const pageA = await ctxA.newPage();
    await pageA.goto(`${projectUrl(fixture)}?issue=${target.id}`);

    const drawerA = pageA.getByRole("dialog");
    await expect(drawerA).toBeVisible({ timeout: 20_000 });
    await drawerA.getByRole("button", { name: new RegExp(currentName, "i") }).click();
    await drawerA.getByRole("option", { name: new RegExp(`^${targetState.name}`, "i") }).click();
    // A 侧确认写入成功
    await expect(
      pageA
        .locator("div")
        .filter({ hasText: target.title })
        .filter({ hasText: targetState.name })
        .last(),
      "A 应看到自己的改动生效",
    ).toBeVisible({ timeout: 15_000 });
    await ctxA.close();

    // ★ 核心断言：B 全程零交互，行内容自己变成新状态
    await expect(rowB, "B 应在几秒内自动看到 A 的改动").toContainText(targetState.name, {
      timeout: 20_000,
    });
  });

  test("4404 路径：非成员看不到项目（HTTP 与 WS 语义一致）", async ({ playwright }) => {
    // 这条不需要浏览器：它验的是"不可见即 404/4404"这条防枚举约定在两个协议上一致。
    // WS 侧的关闭码由 backend/scripts/smoke_realtime.py 逐帧验证，这里只钉 HTTP 侧。
    const api = await apiClient();
    const fixture = await readDemoFixture(api);

    const outsider = await playwright.request.newContext({
      baseURL: process.env.E2E_API_BASE ?? "http://127.0.0.1:8000",
      extraHTTPHeaders: { Accept: "application/json", Origin: "http://localhost:3000" },
    });
    await outsider.get("/api/v1/auth/csrf/");
    const state = await outsider.storageState();
    const token = state.cookies.find((c) => c.name === "csrftoken")?.value ?? "";
    const stamp = Date.now().toString(36);
    const username = `e2e_outsider_${stamp}`;
    const password = `Pw!${stamp}bbbb`;

    const resp = await outsider.post("/api/v1/auth/register/", {
      headers: { "X-CSRFToken": token, "Content-Type": "application/json" },
      data: JSON.stringify({
        username,
        email: `${username}@example.com`,
        password,
      }),
    });
    expect([201]).toContain(resp.status());

    // 非成员读项目详情 → 404（不是 403：防枚举）
    const detail = await outsider.get(
      `/api/v1/workspaces/${fixture.workspaceSlug}/projects/${fixture.projectId}/`,
    );
    expect(detail.status(), "非成员应得到 404 而不是 403").toBe(404);

    await outsider.dispose();
    await api.dispose();
  });
});
