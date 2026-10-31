import { test, expect } from "@playwright/test";
import { apiClient, expectWriteOk } from "./helpers";

/**
 * Anatomy V3 验收：
 * - ?view=plate 双视图（生长 / 结构）、固定索引与详情
 * - 视图切换保留选中 Stage；选中写进 URL；键盘可达
 * - 长文本/特殊字符由 React JSX 安全呈现（不注入 markup）
 *
 * 用独立私人项目造数，避免污染共享 E2E 工程；finally 删除。
 */

async function createProject(api: Awaited<ReturnType<typeof apiClient>>, suffix: string) {
  // 每轮唯一：私人工程的 identifier 只按 owner 唯一，固定值会在重复跑时撞 400。
  const token = Math.random().toString(36).slice(2, 5).toUpperCase().padEnd(3, "X");
  const response = await api.write("POST", "/api/v1/projects/", {
    name: `Anatomy V3 E2E ${suffix} ${token}`,
    identifier: `AN${token}`,
  });
  await expectWriteOk(response, "创建 Anatomy 测试工程");
  return response.json() as Promise<{ id: string; identifier: string }>;
}

async function createStage(
  api: Awaited<ReturnType<typeof apiClient>>,
  projectId: string,
  name: string,
  goal = "",
) {
  const response = await api.write("POST", `/api/v1/projects/${projectId}/plan/`, {
    name,
    goal,
    progress: 40,
    weight: 2,
    is_current: true,
  });
  await expectWriteOk(response, "创建 Stage");
  return response.json() as Promise<{ id: string; name: string }>;
}

async function createTask(
  api: Awaited<ReturnType<typeof apiClient>>,
  projectId: string,
  stageId: string | null,
  title: string,
) {
  const response = await api.write("POST", `/api/v1/projects/${projectId}/tasks/`, {
    title,
    ...(stageId ? { stage_id: stageId } : {}),
  });
  await expectWriteOk(response, "创建 Task");
  return response.json() as Promise<{ id: string; sequence_id: number; title: string }>;
}

test.describe("Anatomy V3 · 双视图与安全文本", () => {
  test("plate 渲染 → 双视图切换 → 选中保留 → 任务抽屉", async ({ page }) => {
    test.setTimeout(60_000);
    const api = await apiClient();
    const project = await createProject(api, "focus");
    try {
      const stage1 = await createStage(api, project.id, "阶段聚焦验收");
      const stage2 = await createStage(api, project.id, "阶段二验收");
      await createTask(api, project.id, stage1.id, "构件抽屉验收");
      const task2 = await createTask(api, project.id, stage2.id, "阶段二任务验收");

      await page.goto(`/projects/${project.id}?view=plate`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("group", { name: /项目解剖图/ })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Stage Index", { exact: false })).toBeVisible();

      const detail = page.locator("aside[aria-label='当前构件详情']");
      // 默认选中当前 Stage（最后创建的 stage2）
      await expect(detail.locator("h2")).toHaveText("阶段二验收");

      // 索引选择 stage1，选中写入 URL
      await page.getByRole("button", { name: "选择阶段 阶段聚焦验收" }).click();
      await expect(detail.locator("h2")).toHaveText("阶段聚焦验收");
      await expect(page).toHaveURL(/stage=/);

      // 切到结构视图，选中不丢
      await page.getByRole("button", { name: "结构 / Structure" }).click();
      await expect(page).toHaveURL(/mode=structure/);
      await expect(detail.locator("h2")).toHaveText("阶段聚焦验收");

      // 键盘：聚焦 SVG Stage 2 并 Enter
      await page.getByRole("button", { name: /^阶段 2：阶段二验收/ }).focus();
      await page.keyboard.press("Enter");
      await expect(detail.locator("h2")).toHaveText("阶段二验收");

      // 详情任务列表 → 抽屉
      await detail.getByRole("button", { name: new RegExp(task2.title) }).click();
      await expect(page).toHaveURL(/issue=/);
      await expect(page.getByRole("dialog", { name: /任务详情/ })).toBeVisible({ timeout: 15_000 });

      // Tab / Shift+Tab 都留在对话框内（焦点陷阱）。
      await page.keyboard.press("Shift+Tab");
      await expect
        .poll(() =>
          page.evaluate(() =>
            Boolean(document.activeElement?.closest('[role="dialog"]')),
          ),
        )
        .toBe(true);
      await page.keyboard.press("Tab");
      await expect
        .poll(() =>
          page.evaluate(() =>
            Boolean(document.activeElement?.closest('[role="dialog"]')),
          ),
        )
        .toBe(true);

      // 关闭抽屉后，焦点回到触发它的任务行，而不是落到 BODY。
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const restoredFocus = await page.evaluate(() => document.activeElement?.textContent ?? "");
      expect(restoredFocus).toContain(task2.title);
    } finally {
      await api.write("DELETE", `/api/v1/projects/${project.id}/`);
      await api.dispose();
    }
  });

  test("空项目：图纸和详情给出空态，不报错", async ({ page }) => {
    test.setTimeout(60_000);
    const api = await apiClient();
    const project = await createProject(api, "empty");
    try {
      await page.goto(`/projects/${project.id}?view=plate`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByRole("group", { name: /项目解剖图/ })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("这张图纸还没有结构。").first()).toBeVisible();
      await expect(page.getByText("还没有阶段。", { exact: true })).toBeVisible();
      await expect(page.locator("svg b")).toHaveCount(0);
    } finally {
      await api.write("DELETE", `/api/v1/projects/${project.id}/`);
      await api.dispose();
    }
  });

  test("任务请求失败：显示 partial 错误，不伪装完整", async ({ page }) => {
    test.setTimeout(60_000);
    const api = await apiClient();
    const project = await createProject(api, "error");
    try {
      await page.route(/\/api\/v1\/projects\/[^/]+\/tasks\//, (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "forced failure" }),
        }),
      );
      await page.goto(`/projects/${project.id}?view=plate`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByRole("group", { name: /项目解剖图/ })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText(/完整任务加载失败/)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/图纸暂不完整/)).toBeVisible();
    } finally {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await api.write("DELETE", `/api/v1/projects/${project.id}/`);
      await api.dispose();
    }
  });

  test("Growth 滚动位置在切换 Structure 后恢复", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const api = await apiClient();
    const project = await createProject(api, "scroll");
    try {
      for (let i = 1; i <= 12; i += 1) {
        const stage = await createStage(api, project.id, `滚动阶段 ${String(i).padStart(2, "0")}`);
        await createTask(api, project.id, stage.id, `滚动任务 ${i}`);
      }
      await page.goto(`/projects/${project.id}?view=plate`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByRole("group", { name: /项目解剖图/ })).toBeVisible({
        timeout: 30_000,
      });
      const canvas = page.locator(".anatomy-canvas");
      await expect
        .poll(() => canvas.evaluate((el) => el.scrollHeight - el.clientHeight))
        .toBeGreaterThan(0);
      const before = await canvas.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
        return el.scrollTop;
      });
      await page.getByRole("button", { name: "结构 / Structure" }).click();
      await page.waitForTimeout(300);
      await page.getByRole("button", { name: "生长 / Growth" }).click();
      await expect
        .poll(() => canvas.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0);
      const after = await canvas.evaluate((el) => el.scrollTop);
      expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
    } finally {
      await api.write("DELETE", `/api/v1/projects/${project.id}/`);
      await api.dispose();
    }
  });

  test("减少动态效果：视图切换与选中仍完成，信息不丢失", async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const api = await apiClient();
    const project = await createProject(api, "reduce");
    try {
      const stage = await createStage(api, project.id, "减少动效阶段");
      await createTask(api, project.id, stage.id, "减少动效任务");
      await page.goto(`/projects/${project.id}?view=plate`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("group", { name: /项目解剖图/ })).toBeVisible({
        timeout: 30_000,
      });
      const detail = page.locator("aside[aria-label='当前构件详情']");
      await page.getByRole("button", { name: "选择阶段 减少动效阶段" }).click();
      await expect(detail.locator("h2")).toHaveText("减少动效阶段");
      await page.getByRole("button", { name: "结构 / Structure" }).click();
      await expect(page.getByRole("group", { name: /项目解剖图/ })).toBeVisible();
      await expect(detail.locator("h2")).toHaveText("减少动效阶段");
    } finally {
      await api.write("DELETE", `/api/v1/projects/${project.id}/`);
      await api.dispose();
    }
  });

  test("记录浏览：Worklog 与 Activity 分栏，来源/时间语义清楚，不假装历史回放", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const api = await apiClient();
    const project = await createProject(api, "records");
    try {
      const stage = await createStage(api, project.id, "记录阶段");
      const task = await createTask(api, project.id, stage.id, "记录任务");
      const log = await api.write("POST", `/api/v1/projects/${project.id}/worklogs/`, {
        title: "补记：实现记录浏览器",
        summary: "只读展示 Worklog 与 Activity，不重建历史。",
        date: "2026-10-01",
      });
      await expectWriteOk(log, "创建 Worklog");

      await page.goto(`/projects/${project.id}?view=plate`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("group", { name: /项目解剖图/ })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole("button", { name: /记录 ·/ }).click();
      const detail = page.locator("aside[aria-label='当前构件详情']");
      await expect(detail.getByText("Records · 只读", { exact: true })).toBeVisible();

      await expect(detail.getByText("补记：实现记录浏览器", { exact: true })).toBeVisible();
      await expect(detail.getByText("2026-10-01", { exact: true })).toBeVisible();
      await expect(detail.getByText("人工", { exact: true })).toBeVisible();
      await expect(detail.getByText(/日期是业务归属日/)).toBeVisible();

      await detail.getByRole("button", { name: /审计事件/ }).click();
      await expect(detail.getByText(/创建了任务/).first()).toBeVisible();
      await expect(detail.getByText(/不是完整历史/)).toBeVisible();
      await expect(detail.getByText(/不提供旧结构回放/)).toBeVisible();
      // task 变量用于确认造数成功，Activity 文案本身不重复标题
      expect(task.title).toBeTruthy();
    } finally {
      await api.write("DELETE", `/api/v1/projects/${project.id}/`);
      await api.dispose();
    }
  });

  test("真实 Activity：页面挂载后新建/推进 Task → 图纸出现 NEW/UPD 痕迹", async ({ page }) => {
    test.setTimeout(90_000);
    const api = await apiClient();
    const project = await createProject(api, "change");
    try {
      const stage = await createStage(api, project.id, "变化痕迹阶段");
      await page.goto(`/projects/${project.id}?view=plate`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("group", { name: /项目解剖图/ })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole("banner")).toContainText(/已连接/, { timeout: 20_000 });
      const detail = page.locator("aside[aria-label='当前构件详情']");
      await expect(detail.getByText("Recent · Activity", { exact: true })).toHaveCount(0);

      const title = `变化任务 ${Date.now().toString(36)}`;
      const created = await api.write("POST", `/api/v1/projects/${project.id}/tasks/`, {
        title,
        stage_id: stage.id,
      });
      await expectWriteOk(created, "创建变化任务");
      const task = (await created.json()) as { id: string };

      const states = await api.get<{ results: { id: string; group: string }[] }>(
        `/api/v1/projects/${project.id}/states/`,
      );
      const started = states.body!.results.find((state) => state.group === "started")!;
      const updated = await api.write("PATCH", `/api/v1/projects/${project.id}/tasks/${task.id}/`, {
        state_id: started.id,
      });
      await expectWriteOk(updated, "推进变化任务");

      await expect(detail.getByText("Recent · Activity", { exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect(detail.getByText("NEW", { exact: true }).first()).toBeVisible();
      await expect(detail.getByText(title, { exact: false }).first()).toBeVisible();
    } finally {
      await api.write("DELETE", `/api/v1/projects/${project.id}/`);
      await api.dispose();
    }
  });

  test("长文本与 <>&\"' 不被当作 SVG/HTML markup 注入", async ({ page }) => {
    test.setTimeout(60_000);
    const api = await apiClient();
    const project = await createProject(api, "text");
    const special = '阶段 <b>注入</b> & "引号" \'单引号\'';
    try {
      await createStage(api, project.id, special, "目标里也包含 <script>alert(1)</script>");
      await page.goto(`/projects/${project.id}?view=plate`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("group", { name: /项目解剖图/ })).toBeVisible({
        timeout: 30_000,
      });
      const detail = page.locator("aside[aria-label='当前构件详情']");
      await expect(detail.getByText(special, { exact: false })).toBeVisible();
      // 顶栏状态行本来就用 <b> 包阶段名；这里只证明 SVG/索引没有把文本
      // 当成 markup 解析（否则会出现 svg 内的 b 元素）。
      await expect(page.locator("svg b")).toHaveCount(0);
      await expect(detail.locator("b")).toHaveCount(0);
    } finally {
      await api.write("DELETE", `/api/v1/projects/${project.id}/`);
      await api.dispose();
    }
  });
});
