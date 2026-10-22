/**
 * 真实截图采集（真实用户 · 真实数据）。
 *
 * 与 `capture-screenshots.mjs` 的区别：那个脚本依赖 E2E 测试生成的数据
 * （用户名 E2E_OWNER、工作区 e2e-workspace、项目 E2E），**不是真实用户数据**；
 * 本脚本用本机真实账户登录，采集开发者真实工程里的内容，用于 README 配图。
 *
 * 数据来源（诚实声明）：
 *   - 账户：本机真实免密账户「北归」（username=北归，无密码）
 *   - 工程：真实项目「Mini Plane」（identifier=MP），开发者日常使用的项目
 *   - 这些截图是真实运行态，但属于开发者本机数据，不保证长期不变
 *
 * 前置：
 *   1. 后端在 127.0.0.1:8000，前端在 localhost:3000（`scripts/dev.cmd` 起栈）
 *   2. 本机存在「北归」账户（免密）；若没有，先在 /register 或 /login 建一个
 *
 * 用法：
 *   NODE_PATH=../node_modules node scripts/capture-real.mjs
 *
 * 产出（frontend/docs/assets/，覆盖原 real-*.png，使 README 的「真实数据」表述成真）：
 *   real-login-quick.png           登录页 · 「直接进入」快捷入口（显示北归）
 *   real-my-engineering.png        首页 · My Engineering
 *   real-issue-list.png            项目页 · 任务列表
 *   real-issue-drawer-activity.png 抽屉 · Activity 审计时间线
 *   real-issue-drawer-comments.png 抽屉 · Comments 对话
 *   real-bulk-actions.png          多选后的批量操作条
 *   real-workspace-rail.png        团队层 · 工作区首页
 *   real-island-expanded.png       Island 展开态（桌面窗口 520×420）
 *   real-island-dock.png           Island 收起态把手条（桌面窗口 360×44）
 */

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// ⚠️ 页面与 API 必须同 host：cookie 属于 localhost 域，打到 127.0.0.1 不会带。

// 真实账户 & 真实项目（本机开发者数据；改账户/项目时在这里覆盖）。
const REAL_USER = process.env.CAPTURE_USER ?? "北归";
const REAL_PROJECT_ID = process.env.CAPTURE_PROJECT_ID ?? "07b27d17-cea2-48f6-8ce8-1fffcc854647";

const OUT = path.resolve("docs/assets");
const shot = async (page, name) => {
  const file = path.join(OUT, name);
  // dev 模式的编译浮层（<nextjs-portal>）只在 next dev 出现，正式构建没有；
  // 截图是仓库资产，不该把开发工具痕迹带进去。
  await page.addStyleTag({ content: "nextjs-portal{display:none !important}" }).catch(() => {});
  await page.waitForTimeout(250);
  await page.screenshot({ path: file });
  console.log(`  ✓ ${name}`);
};

const main = async () => {
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ channel: "chrome" });

  // ── 登录页（真实账户的「直接进入」快捷入口）─────────────────
  // 用空登录态 + 预置 mp-last-user，让登录页显示北归的一键进入卡片。
  const anon = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  });
  await anon.addInitScript((u) => {
    window.localStorage.setItem("mp-last-user", JSON.stringify({ username: u, avatar: null }));
  }, REAL_USER);
  const anonPage = await anon.newPage();
  await anonPage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await anonPage.waitForSelector("text=直接进入", { timeout: 30_000 });
  await anonPage.waitForTimeout(900); // 等字体加载，避免截到 fallback 字体
  await shot(anonPage, "real-login-quick.png");
  await anon.close();

  // ── 真实登录（免密）──────────────────────────────────────
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForSelector("#nickname", { timeout: 30_000 });
  await page.fill("#nickname", REAL_USER);
  await page.getByRole("button", { name: "进入", exact: true }).click();
  // 免密账户：直接进，落到 My Engineering
  await page.waitForSelector("text=My Engineering", { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1400); // 等字体与骨架屏切换
  await shot(page, "real-my-engineering.png");

  // ── 进入真实项目 MP（点 My Engineering 上的项目卡）──────────
  const card = page.locator(`a[href*="${REAL_PROJECT_ID}"]`).first();
  await card.waitFor({ timeout: 20_000 });
  await card.click();
  await page.waitForURL((u) => u.pathname.includes("/projects/"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1600); // 等任务列表取数
  const projectUrl = page.url();
  const wsUrl = projectUrl.split("/projects/")[0]; // http://localhost:3000/w/<slug>
  console.log(`项目页：${projectUrl}`);
  console.log(`团队层：${wsUrl}`);
  await shot(page, "real-issue-list.png");

  // ── 抽屉 · Activity（默认 tab）────────────────────────────
  // 点第一行的 issue 按钮（IssueRow 的可点击按钮含「MP-<n>」）
  const firstIssue = page.locator('button:has-text("MP-")').first();
  await firstIssue.waitFor({ timeout: 20_000 });
  await firstIssue.click();
  await page.waitForURL((u) => u.search.includes("issue="), { timeout: 20_000 });
  await page.waitForSelector('[role="dialog"]', { timeout: 20_000 });
  await page.waitForTimeout(1600); // 等动态时间线取数
  await shot(page, "real-issue-drawer-activity.png");

  // ── 抽屉 · Comments ───────────────────────────────────────
  // 抽屉 tab 是中文：动态 / 评论 / 关联（不是英文标签）
  await page.getByRole("button", { name: /评论/ }).first().click();
  await page.waitForTimeout(900);
  await shot(page, "real-issue-drawer-comments.png");

  // ── 批量操作条（勾 3 个）──────────────────────────────────
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const boxes = page.locator('input[aria-label^="select MP-"]');
  const n = Math.min(3, await boxes.count());
  for (let i = 0; i < n; i += 1) await boxes.nth(i).check();
  await page.waitForTimeout(700);
  await shot(page, "real-bulk-actions.png");

  // ── 团队层 · 工作区首页 ───────────────────────────────────
  await page.goto(wsUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shot(page, "real-workspace-rail.png");

  // ── Island 展开态（桌面窗口 520×420）──────────────────────
  // 复用登录态：Island 拉的是 /projects/mine/，未登录会 401 → 只剩错误块
  const auth = await context.storageState();
  const islandExpanded = await browser.newContext({
    storageState: auth,
    viewport: { width: 520, height: 420 },
    deviceScaleFactor: 2,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  });
  const ep = await islandExpanded.newPage();
  await ep.goto(`${BASE}/island-panel?form=expanded`, { waitUntil: "networkidle" });
  await ep.addStyleTag({ content: "html,body{margin:0 !important} nextjs-portal{display:none !important}" }).catch(() => {});
  await ep.waitForSelector('[data-testid="island-overview"]', { timeout: 30_000 });
  await ep.waitForTimeout(1600);
  await shot(ep, "real-island-expanded.png");
  await islandExpanded.close();

  // ── Island 收起态把手条（桌面窗口 360×44）─────────────────
  const islandDock = await browser.newContext({
    storageState: auth,
    viewport: { width: 360, height: 44 },
    deviceScaleFactor: 2,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  });
  const dp = await islandDock.newPage();
  await dp.goto(`${BASE}/island-panel?form=collapsed`, { waitUntil: "networkidle" });
  await dp.addStyleTag({
    content:
      "html,body{margin:0 !important;height:100% !important} nextjs-portal{display:none !important} [data-testid='island-dock']{height:44px !important}",
  }).catch(() => {});
  await dp.waitForSelector('[data-testid="island-dock"]', { timeout: 30_000 });
  await dp.waitForTimeout(1200);
  await shot(dp, "real-island-dock.png");
  await islandDock.close();

  await browser.close();
  console.log(`\n完成 → ${OUT}`);
};

main().catch((e) => {
  console.error("截图失败：", e.message);
  process.exit(1);
});
