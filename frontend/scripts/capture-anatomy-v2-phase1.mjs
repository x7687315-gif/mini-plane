/**
 * Anatomy V2 · Phase 1 验收截图（临时演示项目，截图后删除）。
 *
 * 前置：后端 127.0.0.1:8000 + 前端 localhost:3000，`.auth/user.json` 有会话。
 * 用法：node scripts/capture-anatomy-v2-phase1.mjs
 * 产出：docs/refactor/ui-design/anatomy/v2/phase1/{overview,focus}-demo.png
 */

import { chromium, request } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const API = process.env.E2E_API_BASE ?? "http://localhost:8000";
const OUT = path.resolve(
  process.cwd(),
  "../docs/refactor/ui-design/anatomy/v2",
  process.env.CAPTURE_OUT ?? "phase1",
);
const STORAGE = ".auth/user.json";

async function makeApi() {
  const stored = JSON.parse(readFileSync(STORAGE, "utf-8"));
  const ctx = await request.newContext({
    baseURL: API,
    storageState: stored,
    extraHTTPHeaders: { Accept: "application/json", Origin: BASE },
  });
  const csrf = async () => {
    await ctx.get("/api/v1/auth/csrf/");
    const state = await ctx.storageState();
    return state.cookies.find((cookie) => cookie.name === "csrftoken")?.value ?? "";
  };
  const write = async (method, url, data) => {
    let token = await csrf();
    let response = await ctx.fetch(url, {
      method,
      headers: { "X-CSRFToken": token, "Content-Type": "application/json" },
      data: data === undefined ? undefined : JSON.stringify(data),
    });
    if (response.status() === 403) {
      token = await csrf();
      response = await ctx.fetch(url, {
        method,
        headers: { "X-CSRFToken": token, "Content-Type": "application/json" },
        data: data === undefined ? undefined : JSON.stringify(data),
      });
    }
    if (!response.ok()) {
      throw new Error(`${method} ${url} -> ${response.status()} ${await response.text()}`);
    }
    return response.json().catch(() => null);
  };
  return { ctx, write };
}

async function seed(api) {
  const project = await api.write("POST", "/api/v1/projects/", {
    name: "Anatomy V2 Demo",
    identifier: "AV2",
  });
  const states = (await api.write("GET", `/api/v1/projects/${project.id}/states/`)).results;
  const byGroup = Object.fromEntries(states.map((state) => [state.group, state.id]));

  const specs = [
    { name: "调研与定义", goal: "把问题、边界与成功标准写清楚", progress: 100, weight: 2 },
    { name: "构建与联调", goal: "让真实数据在统一对象中成立", progress: 46, weight: 3 },
    { name: "验收与收束", goal: "验证可访问性、边界与视觉一致性", progress: 8, weight: 1 },
  ];
  const stages = [];
  for (const spec of specs) {
    const stage = await api.write("POST", `/api/v1/projects/${project.id}/plan/`, spec);
    stages.push(stage);
  }
  await api.write("PATCH", `/api/v1/projects/${project.id}/plan/stages/${stages[1].id}/`, {
    is_current: true,
  });

  const groups = ["completed", "started", "unstarted", "backlog", "cancelled"];
  const stageForTask = [0, 0, 1, 1, 1, 2, 2, null, null];
  for (let index = 0; index < stageForTask.length; index += 1) {
    const stageIndex = stageForTask[index];
    await api.write("POST", `/api/v1/projects/${project.id}/tasks/`, {
      title: `构件 ${String(index + 1).padStart(2, "0")} · ${["定义成功标准", "拆出边界", "冻结视图模型", "实现静态对象", "真实数据联调", "键盘路径", "密度检查", "未归属检查", "散件计数"][index]}`,
      stage_id: stageIndex === null ? null : stages[stageIndex].id,
      state_id: byGroup[groups[index % groups.length]],
      priority: ["high", "medium", "low", "none"][index % 4],
    });
  }
  return { project, stages, states, byGroup };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const api = await makeApi();
  let project;
  const browser = await chromium.launch({ channel: "chrome" });
  const captureChange = process.env.CAPTURE_CHANGE === "1";
  try {
    const seeded = await seed(api);
    project = seeded.project;
    const context = await browser.newContext({
      storageState: STORAGE,
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
    });
    const page = await context.newPage();
    await page.addStyleTag({ content: "nextjs-portal{display:none !important}" }).catch(() => {});
    await page.goto(`${BASE}/projects/${project.id}?view=plate`, { waitUntil: "domcontentloaded" });
    await page.getByRole("group", { name: /项目解剖图/ }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "overview-demo.png"), fullPage: true });

    if (captureChange) {
      const title = "刚新增的真实构件";
      const task = await api.write("POST", `/api/v1/projects/${project.id}/tasks/`, {
        title,
        stage_id: seeded.stages[1].id,
      });
      await api.write("PATCH", `/api/v1/projects/${project.id}/tasks/${task.id}/`, {
        state_id: seeded.byGroup.started,
      });
      await page.getByText("Recent · Activity", { exact: true }).waitFor({ timeout: 20_000 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, "changes-demo.png"), fullPage: true });
    }

    await page.getByRole("button", { name: /^聚焦阶段 构建与联调/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, "focus-demo.png"), fullPage: true });

    await page.getByRole("button", { name: "展开", exact: true }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "exploded-demo.png"), fullPage: true });
    await context.close();
    console.log(`phase1 screenshots -> ${OUT}`);
  } finally {
    if (project) await api.write("DELETE", `/api/v1/projects/${project.id}/`).catch(() => {});
    await api.ctx.dispose();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
