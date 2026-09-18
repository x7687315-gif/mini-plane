import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright 配置 — Sprint 8 之后补的 E2E（在 `docs/releases/v0.2.0.md` 的"已知边界"里挂着）。
 *
 * 三个刻意的选择：
 *
 * 1. **`channel: "chrome"` 而不是下载 Chromium。**
 *    本机已装 Google Chrome，用 `channel` 直接复用它 —— 省掉 ~150MB 下载，
 *    也避免在受限网络里卡住。CI 里如果没有 Chrome，把这一行去掉即可让
 *    `npx playwright install --with-deps chromium` 接管（见 ci.yml 的注释）。
 *
 * 2. **`storageState` 做登录态复用**（tests/e2e/global-setup.ts）。
 *    每个用例都走一遍登录 UI 会白白多出 2–5 秒/条，并且把"登录页没坏"变成
 *    所有用例的前置依赖 —— 登录一坏，全套红，看不出真正坏的是哪。官方推荐的
 *    做法是登录一次、把 cookie 存成 state 复用。
 *    ⚠️ `.auth/*.json` 里是**真实会话凭据**，必须进 .gitignore，且在 CI 里每次现生成。
 *
 * 3. **不 mock 后端。** 这套 E2E 的价值就在于"前端 ↔ 真后端"这层契约，
 *    mock 掉之后它退化成组件测试。所以它需要后端+前端都在跑（见 README 的说明）。
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  // 失败重试：本地 0 次（要立刻看到红），CI 1 次（挡掉偶发抖动）
  retries: process.env.CI ? 1 : 0,
  // 这套用例写/删同一条数据，并发会互相踩；串行换来确定性
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: BASE_URL,
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    // 前端默认用 localhost:3000（CORS/CSRF 白名单里 localhost 与 127.0.0.1 是两个来源）
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  },

  projects: [
    // 先跑一次登录，把会话存成 storageState；其余用例依赖它
    { name: "setup", testMatch: /global\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: ".auth/user.json" },
      dependencies: ["setup"],
    },
  ],
});
