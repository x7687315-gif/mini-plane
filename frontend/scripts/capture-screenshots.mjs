/**
 * 真实截图采集 —— 用真实登录态打开真实页面，截成 docs/assets/ 里的图。
 *
 * 为什么是独立脚本而不是一条 E2E 用例：它不是断言，是**资产生产**。
 * 混进 `pnpm test:e2e` 会让每次跑测试都重写仓库里的图片（diff 噪声），
 * 而且它依赖"当前库里有好看的数据"这种非确定性前提 —— 不是测试该有的性质。
 *
 * 前置：
 *   1. 后端在 127.0.0.1:8000，前端在 localhost:3000（生产构建更接近真实）
 *   2. 先跑过一次 E2E（`pnpm test:e2e`），它会重置数据并生成 .auth/user.json
 *
 * 用法：
 *   node scripts/capture-screenshots.mjs
 *
 * 产出（frontend/docs/assets/）：
 *   real-issue-list.png            列表页（含真实数据：状态/优先级/标签/指派人）
 *   real-issue-drawer-activity.png 抽屉 · Activity 审计时间线
 *   real-issue-drawer-comments.png 抽屉 · Comments 对话
 *   real-bulk-actions.png          多选后的批量操作条
 */

import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// ⚠️ 必须与页面同 host：storageState 里的 cookie 属于 localhost 域，
//    请求打到 127.0.0.1 时不会带上（同一个坑在集成验收时已经踩过一次）
const API = process.env.E2E_API_BASE ?? "http://localhost:8000";
const OUT = path.resolve("docs/assets");
const STORAGE = ".auth/user.json";

/** 用 API 找出演示项目（与 tests/e2e/helpers.ts 同一套前缀约定）。 */
async function resolveProject() {
  const { request } = await import("@playwright/test");
  const stored = JSON.parse(readFileSync(STORAGE, "utf-8"));
  const ctx = await request.newContext({
    baseURL: API,
    storageState: stored,
    extraHTTPHeaders: { Accept: "application/json", Origin: BASE },
  });
  try {
    const ws = await (await ctx.get("/api/v1/workspaces/")).json();
    const slug = ws.results
      .map((w) => w.slug)
      .find((s) => s.startsWith("e2e-workspace"));
    if (!slug) throw new Error("找不到 E2E 工作区 —— 先跑一次 pnpm test:e2e");

    const projects = await (await ctx.get(`/api/v1/workspaces/${slug}/projects/`)).json();
    const project = projects.results.find((p) => p.identifier === "E2E");
    if (!project) throw new Error("找不到 E2E 项目");

    const issues = await (
      await ctx.get(`/api/v1/workspaces/${slug}/projects/${project.id}/issues/?per_page=100`)
    ).json();

    return { slug, project, issues: issues.results };
  } finally {
    await ctx.dispose();
  }
}

const main = async () => {
  mkdirSync(OUT, { recursive: true });
  const { slug, project, issues } = await resolveProject();
  console.log(`演示项目：${slug} / ${project.identifier}（${issues.length} 个 Issue）`);

  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    storageState: STORAGE,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  });
  const page = await context.newPage();

  const projectUrl = `${BASE}/w/${slug}/projects/${project.id}`;
  const shot = async (name) => {
    const file = path.join(OUT, name);
    await page.screenshot({ path: file });
    console.log(`  ✓ ${name}`);
  };

  // 1) 列表页
  await page.goto(projectUrl);
  await page.waitForSelector("text=E2E", { timeout: 30_000 });
  await page.waitForTimeout(1200); // 等字体与骨架屏切换完成，避免截到 loading
  await shot("real-issue-list.png");

  // 2) 抽屉 · Activity（默认 tab）
  await page.getByText(issues[0].title, { exact: true }).first().click();
  await page.waitForURL(/issue=/, { timeout: 20_000 });
  await page.waitForTimeout(1500); // 等时间线取数
  await shot("real-issue-drawer-activity.png");

  // 3) 抽屉 · Comments（发一条评论让画面有内容）
  // .first()：Activity 的某条记录里也有一个跳转到评论区的 "comments" 按钮，
  // 不加会撞上 strict mode（tab 条在 DOM 里更靠前）
  await page.getByRole("button", { name: /^comments/i }).first().click();
  const composer = page.getByLabel("new comment");
  if (await composer.isVisible().catch(() => false)) {
    const existing = await page.locator("li").count();
    if (existing === 0) {
      await composer.fill("时间线里也能看到这条 —— 它就是「活动留痕」与「对话」分开的意义。");
      await page.getByRole("button", { name: /^post$/i }).click();
      await page.waitForTimeout(1200);
    }
  }
  await shot("real-issue-drawer-comments.png");

  // 4) 批量操作条（勾 3 个）
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const boxes = page.locator('input[type="checkbox"]');
  const n = Math.min(3, await boxes.count());
  for (let i = 0; i < n; i += 1) await boxes.nth(i).check();
  await page.waitForTimeout(600);
  await shot("real-bulk-actions.png");

  await browser.close();
  console.log(`\n完成 → ${OUT}`);
};

main().catch((e) => {
  console.error("截图失败：", e.message);
  process.exit(1);
});
