/**
 * Anatomy V2 · Phase 0 基线截图（E2E 演示数据，不是真实用户数据）。
 *
 * 前置：
 *   1. backend 127.0.0.1:8000 + frontend localhost:3000 已启动；
 *   2. 已跑过一次 E2E（生成 .auth/user.json 与 E2E 演示项目）。
 *
 * 用法：node scripts/capture-anatomy-v2-baseline.mjs
 * 产出：docs/refactor/ui-design/anatomy/v2/baseline/{overview,focus}.png
 */

import { chromium, request } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const API = process.env.E2E_API_BASE ?? "http://localhost:8000";
const OUT = path.resolve(process.cwd(), "../docs/refactor/ui-design/anatomy/v2/baseline");
const STORAGE = ".auth/user.json";

async function resolveProject() {
  const stored = JSON.parse(readFileSync(STORAGE, "utf-8"));
  const ctx = await request.newContext({
    baseURL: API,
    storageState: stored,
    extraHTTPHeaders: { Accept: "application/json", Origin: BASE },
  });
  try {
    const ws = await (await ctx.get("/api/v1/workspaces/")).json();
    const slug = ws.results.map((w) => w.slug).find((s) => s.startsWith("e2e-workspace"));
    if (!slug) throw new Error("找不到 E2E 工作区 —— 先跑一次 pnpm test:e2e");
    const projects = await (await ctx.get(`/api/v1/workspaces/${slug}/projects/`)).json();
    const project = projects.results.find((p) => p.identifier === "E2E");
    if (!project) throw new Error("找不到 E2E 项目");
    return project;
  } finally {
    await ctx.dispose();
  }
}

const main = async () => {
  mkdirSync(OUT, { recursive: true });
  const project = await resolveProject();
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    storageState: STORAGE,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  });
  const page = await context.newPage();

  // next dev 的编译浮层不属于产品截图
  await page.addStyleTag({ content: "nextjs-portal{display:none !important}" }).catch(() => {});

  await page.goto(`${BASE}/projects/${project.id}?view=plate`, { waitUntil: "domcontentloaded" });
  if (/\/login/.test(page.url())) throw new Error(`会话失效，被重定向到 ${page.url()}`);
  await page.getByRole("img", { name: /项目解剖图/ }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "overview.png"), fullPage: true });

  // 通过 Stage Index 聚焦（当前唯一稳定、键盘可达的 Stage 入口）
  await page.getByRole("button", { name: /^聚焦阶段/ }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "focus.png"), fullPage: true });

  console.log(`baseline screenshots -> ${OUT}`);
  await context.close();
  await browser.close();
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
