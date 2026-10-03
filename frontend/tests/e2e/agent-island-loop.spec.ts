/**
 * 闭环测试：Agent API → 数据库 → WebSocket → Engineering Island（计划 §29）。
 *
 * 计划里把这条链路称为"非常漂亮的一条 E2E"，一直没做。今天补上。
 *
 * ## 为什么这条测试有资格证明"实时"
 *
 * Island 的 Agent 状态来自 `/projects/mine/` 的 `agent_running` 聚合字段，
 * 而这个接口**没有轮询**。所以如果 Island 在**不刷新页面**的情况下从 IDLE 变成 RUNNING，
 * 只可能是一件事：Agent 端点写库 → 事务内广播 `agent.session` → 前端 WS 收到 →
 * policy effect 失效 `mine` 查询 → 重渲染。
 * 任何一环断了，这条用例都会红。
 */

import { test, expect, request as playwrightRequest } from "@playwright/test";
import { API_BASE, apiClient, readDemoFixture } from "./helpers";

test.describe("Agent → Island 实时闭环", () => {
  test("Agent 起会话后，Island 不刷新就变成 RUNNING", async ({ page }) => {
    // ── 1. 用用户会话建一个 Agent Token（明文只返回这一次）
    const api = await apiClient();
    const fixture = await readDemoFixture(api);
    const created = await api.write("POST", "/api/v1/agent/tokens/", {
      name: "e2e-island-loop",
      scopes: ["read_project", "write_task"],
    });
    if (!created.ok()) {
      throw new Error(`建 Agent Token 失败：HTTP ${created.status()} ${await created.text()}`);
    }
    const { token: agentToken } = (await created.json()) as { token: string };
    expect(agentToken, "Token 明文应形如 mpa_…").toMatch(/^mpa_/);
    await api.dispose();

    // ── 2. 打开 Island（演示项目就是当前图纸），此时应当是 IDLE
    await page.goto("/island");
    const sheet = page.getByRole("article").first();
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    await expect(sheet.getByText("IDLE")).toBeVisible();

    // 先确认 WebSocket 真的连上了：否则后面"不刷新就变"根本不可能发生，
    // 红了也分不清是 WS 断了还是别的问题。
    await expect(page.locator("header")).toContainText(/已连接|已就绪|已连接/, {
      timeout: 20_000,
    });

    // ── 3. 换一个身份：Agent Token（不是用户会话）起一个会话
    const agentCtx = await playwrightRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: {
        Authorization: `Bearer ${agentToken}`,
        "Idempotency-Key": "e2e-island-loop-session-1",
        "Content-Type": "application/json",
      },
    });
    const started = await agentCtx.post("/api/v1/agent/sessions/", {
      data: {
        workspace_slug: fixture.workspaceSlug,
        project_id: fixture.projectId,
        title: "验证长文本漏字",
      },
    });
    expect(
      started.ok(),
      `起会话失败：HTTP ${started.status()} ${await started.text()}`,
    ).toBeTruthy();
    const session = (await started.json()) as { id: string; status: string };
    expect(session.status).toBe("running");

    // ── 4. 核心断言：**不刷新页面**，Island 自己变成 RUNNING（只可能来自 WS 推送）
    await expect(sheet.getByText("RUNNING")).toBeVisible({ timeout: 20_000 });
    await expect(sheet.getByText("IDLE")).toHaveCount(0);

    // ── 5. 收尾：结束会话（保持测试数据干净，也验证 end 端点可用）
    const ended = await agentCtx.post(`/api/v1/agent/sessions/${session.id}/end/`, {
      data: { status: "done" },
    });
    expect(ended.ok(), "结束会话失败").toBeTruthy();
    await agentCtx.dispose();
  });

  test("幂等：同一个 Idempotency-Key 重复起会话不会产生第二条记录", async () => {
    const api = await apiClient();
    const fixture = await readDemoFixture(api);
    const created = await api.write("POST", "/api/v1/agent/tokens/", {
      name: "e2e-island-idem",
      scopes: ["read_project", "write_task"],
    });
    const { token } = (await created.json()) as { token: string };
    await api.dispose();

    const agentCtx = await playwrightRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": "e2e-island-idem-1",
        "Content-Type": "application/json",
      },
    });
    const payload = {
      workspace_slug: fixture.workspaceSlug,
      project_id: fixture.projectId,
      title: "幂等验证",
    };
    const first = await agentCtx.post("/api/v1/agent/sessions/", { data: payload });
    const second = await agentCtx.post("/api/v1/agent/sessions/", { data: payload });
    expect(first.ok()).toBeTruthy();
    expect(second.ok()).toBeTruthy();
    // 重放应返回**同一个**会话（同一个 id），而不是新建一条
    const a = (await first.json()) as { id: string };
    const b = (await second.json()) as { id: string };
    expect(b.id, "相同 Idempotency-Key 必须复用同一条会话").toBe(a.id);

    await agentCtx.post(`/api/v1/agent/sessions/${a.id}/end/`, { data: { status: "done" } });
    await agentCtx.dispose();
  });
});
