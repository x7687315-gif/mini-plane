/**
 * 给「导入真实进度后的效果」拍一组截图。
 *
 * 登录方式顺便验证了产品能力：用昵称免密登录（POST /auth/login 只带 username），
 * 拿到 session 后写进浏览器 context —— 这正是本地单机版的登录语义。
 */

import { chromium, request } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const API = process.env.E2E_API_BASE ?? "http://localhost:8000";
const OUT = path.resolve("docs/assets");
const USER = process.env.DEMO_USER ?? "amiya";

// 1) 免密登录，把 session cookie 交给浏览器
const api = await request.newContext({ baseURL: API });
const login = await api.post("/api/v1/auth/login/", {
  data: { username: USER },
  headers: { Origin: BASE },
});
if (!login.ok()) {
  console.error(`免密登录失败：HTTP ${login.status()} ${await login.text()}`);
  process.exit(1);
}
const me = await api.get("/api/v1/auth/me/");
const user = await me.json();
console.log(`已免密登录：${user.username}（has_password=${user.has_password}）`);

const cookies = (await api.storageState()).cookies;
await api.dispose();

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({
  storageState: { cookies, origins: [] },
  viewport: { width: 1440, height: 900 },
  locale: "zh-CN",
  timezoneId: "Asia/Shanghai",
});
const page = await ctx.newPage();
await page.addInitScript(() => {
  const s = document.createElement("style");
  s.textContent = "nextjs-portal{display:none !important}";
  if (document.head) document.head.appendChild(s);
  else document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
});

const shot = async (name) => {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, name) });
  console.log("  ✓", name);
};

// 1) 我的工程首页
await page.goto(`${BASE}/`);
await page.waitForSelector("text=My Engineering", { timeout: 30_000 });
await page.waitForSelector("text=Mini Plane", { timeout: 30_000 });
await shot("imported-my-engineering.png");

// 2) Engineering Island
await page.goto(`${BASE}/island`);
await page.waitForSelector("text=Engineering Island", { timeout: 30_000 });
const sheet = page.locator("article").filter({ hasText: "Mini Plane" }).first();
await sheet.waitFor({ state: "visible", timeout: 30_000 });
await page.waitForTimeout(2500);
await shot("imported-island.png");

// 3) 项目页（Global Plan + 任务 + 工程日志）
await page.goto(`${BASE}/workspaces`);
await page.waitForTimeout(1500);
const wsLink = page.getByRole("link", { name: /开发|Mini Plane/ }).first();
if (await wsLink.count()) {
  await wsLink.click();
  await page.waitForTimeout(1500);
}
const proj = page.getByRole("link", { name: /Mini Plane/ }).first();
if (await proj.count()) {
  await proj.click();
  await page.waitForTimeout(2000);
}
await shot("imported-project-plan.png");

// 4) 任务抽屉（动态审计）
const row = page.getByRole("link", { name: /Sprint 14/ }).first();
if (await row.count()) {
  await row.click();
  await page.waitForTimeout(1800);
  const activity = page.getByRole("tab", { name: /动态|Activity/ }).first();
  if (await activity.count()) await activity.click();
  await shot("imported-issue-activity.png");
}

await browser.close();
console.log(`\n完成 → ${OUT}`);
