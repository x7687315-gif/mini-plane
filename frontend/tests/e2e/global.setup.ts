import { test as setup, expect } from "@playwright/test";
import { apiClient, createDemoProject, DEMO, purgeE2EWorkspaces } from "./helpers";

/**
 * E2E 全局准备（跑一次，其余 project 依赖它）。
 *
 * 1. **先清掉上一轮的 E2E 工作区**，再重建。理由：02 契约规定工作区 slug 重名时
 *    后端会自动加 `-2` 后缀，靠"存在就复用"迟早会拿到一个不认识的 slug，
 *    失败点离原因很远（404 出现在别的用例里）。每次重建换来完全确定性，
 *    代价是几秒 —— 这笔交易划算。
 * 2. 账号走 API 建（快、稳），**登录走 UI**：顺带把登录表单也验一次。
 * 3. 把会话存成 storageState，其余用例直接进已登录态，不必各跑一遍登录
 *    （官方推荐的 auth 复用模式；实测每条用例省 2–5 秒，且登录页坏掉时
 *    不会伪装成"所有用例都坏"）。
 *
 * 产物 `.auth/user.json` 含**真实会话 cookie**，已在 .gitignore 里排除。
 */

setup("重置 E2E 数据、建账号与演示项目、保存登录态", async ({ page }) => {
  const api = await apiClient();
  try {
    const purged = await purgeE2EWorkspaces(api);
    console.log(`[setup] 清掉上一轮 E2E 工作区：${purged} 个`);

    const fixture = await createDemoProject(api);
    console.log(
      `[setup] 演示项目就绪：workspace=${fixture.workspaceSlug} project=${fixture.projectId} issues=${fixture.issues.length}`,
    );
    expect(fixture.issues.length).toBeGreaterThanOrEqual(3);

    // 供批量改标签那条用例使用（它需要一个"目标标签"）
    const labelResp = await api.write(
      "POST",
      `/api/v1/workspaces/${fixture.workspaceSlug}/projects/${fixture.projectId}/labels/`,
      { name: "e2e-label", color: "#dc2626" },
    );
    expect([201], "创建 E2E 标签").toContain(labelResp.status());
  } finally {
    await api.dispose();
  }

  // 走 UI 登录：同时验证登录闭环本身
  await page.goto("/login");
  await page.getByLabel(/Username/i).fill(DEMO.username);
  await page.getByLabel(/Password/i).fill(DEMO.password);
  // 用「表单的提交按钮」而不是按钮文案：文案会改，语义不会
  await page.locator('form button[type="submit"]').click();

  // ⚠️ 这里断言"账号菜单显示用户名"，而不是"URL 不再是 /login"。
  // 早期版本用后者，结果**假绿**了：登录其实失败，但 URL 会先短暂变成 "/"
  // 再被 AuthGuard 弹回 /login，自动重试的断言正好抓到那个中间态。
  // 只有真正拿到会话，顶栏才会渲染出用户名。
  await expect(
    page.locator('header button[aria-haspopup="menu"]'),
    "登录后顶栏应显示用户名（用它代替 URL 判断，避免抓到中间态）",
  ).toContainText(DEMO.username, { timeout: 20_000 });

  await page.context().storageState({ path: ".auth/user.json" });
});
