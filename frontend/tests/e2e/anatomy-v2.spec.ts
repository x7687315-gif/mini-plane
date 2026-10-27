import { test, expect } from "@playwright/test";
import { apiClient, expectWriteOk } from "./helpers";

/**
 * Anatomy V2 Phase 1 验收：
 * - ?view=plate 静态对象、Stage Index、聚焦、任务抽屉
 * - 长文本/特殊字符由 React JSX 安全呈现（不注入 markup）
 *
 * 用独立私人项目造数，避免污染共享 E2E 工程；finally 删除。
 */

async function createProject(api: Awaited<ReturnType<typeof apiClient>>, suffix: string) {
  // 每轮唯一：私人工程的 identifier 只按 owner 唯一，固定值会在重复跑时撞 400。
  const token = Math.random().toString(36).slice(2, 5).toUpperCase().padEnd(3, "X");
  const response = await api.write("POST", "/api/v1/projects/", {
    name: `Anatomy V2 E2E ${suffix} ${token}`,
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
  stageId: string,
  title: string,
) {
  const response = await api.write("POST", `/api/v1/projects/${projectId}/tasks/`, {
    title,
    stage_id: stageId,
  });
  await expectWriteOk(response, "创建 Task");
  return response.json() as Promise<{ id: string; sequence_id: number; title: string }>;
}

test.describe("Anatomy V2 · 静态对象与安全文本", () => {
  test("plate 渲染 → 索引聚焦 → 任务抽屉", async ({ page }) => {
    test.setTimeout(60_000);
    const api = await apiClient();
    const project = await createProject(api, "focus");
    try {
      const stage = await createStage(api, project.id, "阶段聚焦验收");
      const task = await createTask(api, project.id, stage.id, "构件抽屉验收");

      await page.goto(`/projects/${project.id}?view=plate`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("group", { name: /项目解剖图/ })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Stage Index", { exact: false })).toBeVisible();

      // 视觉 Stage 本身可点击（不是只有索引表可点）
      await page.getByRole("button", { name: /^阶段 1：阶段聚焦验收/ }).click();
      await expect(page.getByText("Stage 01 构件", { exact: true })).toBeVisible();

      // focus → exploded → focus → overview；空间状态写进 URL
      await page.getByRole("button", { name: "展开", exact: true }).click();
      await expect(page).toHaveURL(/expand=1/);
      await expect(page.getByRole("button", { name: "收拢", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "收拢", exact: true }).click();
      await expect(page).not.toHaveURL(/expand=1/);
      await expect(page).toHaveURL(/stage=/);

      await page.keyboard.press("Escape");
      await expect(page).not.toHaveURL(/stage=/);
      await expect(page.getByText("Stage 01 构件", { exact: true })).toHaveCount(0);

      // 重新聚焦并打开任务抽屉（URL ?issue=，既有组件）
      await page.getByRole("button", { name: /^聚焦阶段 阶段聚焦验收/ }).click();
      const aside = page.locator("aside");
      await aside.getByRole("button", { name: new RegExp(task.title) }).click();
      await expect(page).toHaveURL(/issue=/);
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
    } finally {
      await api.write("DELETE", `/api/v1/projects/${project.id}/`);
      await api.dispose();
    }
  });

  test("减少动态效果：聚焦/展开仍完成，信息不丢失", async ({ page }) => {
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
      await page.getByRole("button", { name: /^聚焦阶段 减少动效阶段/ }).click();
      await expect(page.getByText("Stage 01 构件", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "展开", exact: true }).click();
      await expect(page.getByRole("button", { name: "收拢", exact: true })).toBeVisible();
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
      const aside = page.locator("aside");
      await expect(aside.getByText("Records · 只读", { exact: true })).toBeVisible();

      await expect(aside.getByText("补记：实现记录浏览器", { exact: true })).toBeVisible();
      await expect(aside.getByText("2026-10-01", { exact: true })).toBeVisible();
      await expect(aside.getByText("人工", { exact: true })).toBeVisible();
      await expect(aside.getByText(/日期是业务归属日/)).toBeVisible();

      await page.getByRole("button", { name: /审计事件/ }).click();
      await expect(aside.getByText(/创建了任务/).first()).toBeVisible();
      await expect(aside.getByText(/不是完整历史/)).toBeVisible();
      await expect(aside.getByText(/不提供旧结构回放/)).toBeVisible();
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
      await expect(page.getByText("Recent · Activity", { exact: true })).toHaveCount(0);

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

      const aside = page.locator("aside");
      await expect(aside.getByText("Recent · Activity", { exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect(aside.getByText("NEW", { exact: true }).first()).toBeVisible();
      await expect(aside.getByText(title, { exact: false }).first()).toBeVisible();
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
      await expect(page.locator("aside").getByText(special, { exact: false })).toBeVisible();
      // 顶栏状态行本来就用 <b> 包阶段名；这里只证明 SVG/索引没有把文本
      // 当成 markup 解析（否则会出现 svg 内的 b 元素）。
      await expect(page.locator("svg b")).toHaveCount(0);
      await expect(page.locator("aside b")).toHaveCount(0);
    } finally {
      await api.write("DELETE", `/api/v1/projects/${project.id}/`);
      await api.dispose();
    }
  });
});
