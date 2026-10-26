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
  const response = await api.write("POST", "/api/v1/projects/", {
    name: `Anatomy V2 E2E ${suffix}`,
    identifier: `AN${suffix.slice(0, 3).toUpperCase()}`,
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

      await page.getByRole("button", { name: /^聚焦阶段 阶段聚焦验收/ }).click();
      await expect(page.getByText("Stage 01 构件", { exact: true })).toBeVisible();

      const aside = page.locator("aside");
      await aside.getByRole("button", { name: new RegExp(task.title) }).click();
      await expect(page).toHaveURL(/issue=/);
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
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
