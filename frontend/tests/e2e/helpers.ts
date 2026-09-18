import { request } from "@playwright/test";

/**
 * E2E 辅助：用真实 HTTP（Session + CSRF）在后端造数据。
 *
 * 为什么造数据走 API 而不是 UI：UI 造数据慢且脆弱 —— 一旦某个表单改了，
 * 所有用例都红，而它们本来要验的是别的东西。**UI 只用来验交互本身。**
 *
 * 凭据不写死在源码里（与 backend/scripts/smoke_backend.py 同一套思路）：
 * 由固定常量派生，跨运行确定。
 */

export const API_BASE = process.env.E2E_API_BASE ?? "http://127.0.0.1:8000";

/** 与 backend .env 的 CORS/CSRF 白名单一致：必须是 localhost，不能是 127.0.0.1 */
export const APP_ORIGIN = process.env.E2E_BASE_URL ?? "http://localhost:3000";

const EPOCH = "e2e-2026-09";
/** E2E 自己的工作区 slug 前缀；setup 会先清掉所有同前缀的工作区。 */
export const E2E_SLUG_PREFIX = `e2e-workspace-${EPOCH}`;

export const DEMO = {
  username: `e2e_owner_${EPOCH}`,
  password: `Pw!e2e-owner-${EPOCH}`,
  workspaceName: "E2E Workspace",
  projectIdentifier: "E2E",
  projectName: "E2E Project",
};

export const DEFAULT_ISSUE_TITLES = ["E2E 任务 A", "E2E 任务 B", "E2E 任务 C"];

/** 后端预置五态（03 契约：项目创建即生成）。 */
export const STATES = ["Backlog", "Todo", "In Progress", "Done", "Cancelled"] as const;

export type Api = Awaited<ReturnType<typeof apiClient>>;

/** 一个带 CSRF 的 API 客户端，保持 cookie。 */
export async function apiClient(
  username = DEMO.username,
  password = DEMO.password,
  { authenticate = true } = {},
) {
  const ctx = await request.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { Accept: "application/json", Origin: APP_ORIGIN },
  });

  async function csrf(): Promise<string> {
    await ctx.get("/api/v1/auth/csrf/");
    const state = await ctx.storageState();
    return state.cookies.find((c) => c.name === "csrftoken")?.value ?? "";
  }

  async function write(method: string, path: string, data?: unknown) {
    const send = () =>
      ctx.fetch(path, {
        method,
        headers: { "X-CSRFToken": csrfToken, "Content-Type": "application/json" },
        data: data === undefined ? undefined : JSON.stringify(data),
      });

    let csrfToken = await csrf();
    let resp = await send();

    // 与前端 lib/api.ts 的 CSRF 自愈保持一致：403 → 重新取 cookie 里的 token → 重放一次。
    //
    // 不是"以防万一"的装饰：Django 在**登录时轮换 csrftoken**，而 /auth/csrf/ 只回一句
    // 提示、token 只能从 cookie 读。实测确实撞到过一次
    // `CSRF Failed: CSRF token from the 'X-Csrftoken' HTTP header incorrect`
    // （会话有效，只是 token 与当前 cookie 不匹配）。重取即修复。
    if (resp.status() === 403) {
      csrfToken = await csrf();
      resp = await send();
    }
    return resp;
  }

  const api = {
    ctx,
    write,
    raw: () => ctx,

    async get<T = unknown>(path: string): Promise<{ status: number; body: T | null }> {
      const resp = await ctx.get(path);
      const text = await resp.text();
      return { status: resp.status(), body: text ? (JSON.parse(text) as T) : null };
    },

    /** 注册（已存在则登录）。 */
    async ensureAccount() {
      let resp = await write("POST", "/api/v1/auth/register/", {
        username,
        email: `${username}@example.com`,
        password,
      });
      if (resp.status() !== 201) {
        resp = await write("POST", "/api/v1/auth/login/", { username, password });
      }
      return resp.status();
    },

    async me() {
      const { status, body } = await api.get<{ id: string; username: string }>(
        "/api/v1/auth/me/",
      );
      return status === 200 ? body : null;
    },

    async dispose() {
      await ctx.dispose();
    },
  };

  // 默认直接带上登录态：少了这一步，后面的写请求会 403，报错点离原因很远
  if (authenticate) await api.ensureAccount();
  return api;
}

export interface DemoFixture {
  workspaceSlug: string;
  projectId: string;
  issues: { id: string; sequenceId: number; title: string }[];
}

/** 清掉所有 E2E 工作区（级联删除项目/Issue/评论/活动）。 */
export async function purgeE2EWorkspaces(api: Api): Promise<number> {
  const { body } = await api.get<{ results: { slug: string }[] }>("/api/v1/workspaces/");
  const targets = (body?.results ?? []).filter((w) => w.slug.startsWith(E2E_SLUG_PREFIX));
  for (const w of targets) {
    await api.write("DELETE", `/api/v1/workspaces/${w.slug}/`);
  }
  return targets.length;
}

/**
 * 建一个干净的演示项目。
 *
 * **必须使用接口返回的 slug**：02 契约规定工作区 slug 重名时后端会自动加后缀
 * （`-2`、`-3`…）。早期版本假设"我请求什么就得到什么"，于是第二次运行时
 * 所有请求都打在一个不存在的 slug 上 —— 报错是 404，但根因是这里。
 */
export async function createDemoProject(
  api: Api,
  issueTitles: string[] = DEFAULT_ISSUE_TITLES,
): Promise<DemoFixture> {
  const created = await api.write("POST", "/api/v1/workspaces/", {
    name: DEMO.workspaceName,
    slug: E2E_SLUG_PREFIX,
  });
  if (created.status() !== 201) {
    throw new Error(`创建工作区失败：${created.status()} ${await created.text()}`);
  }
  const workspaceSlug = (await created.json()).slug as string;

  const projectsBase = `/api/v1/workspaces/${workspaceSlug}/projects`;
  const projectResp = await api.write("POST", `${projectsBase}/`, {
    name: DEMO.projectName,
    identifier: DEMO.projectIdentifier,
  });
  if (projectResp.status() !== 201) {
    throw new Error(`创建项目失败：${projectResp.status()} ${await projectResp.text()}`);
  }
  const projectId = (await projectResp.json()).id as string;

  const issues: DemoFixture["issues"] = [];
  for (const title of issueTitles) {
    const resp = await api.write("POST", `${projectsBase}/${projectId}/issues/`, { title });
    if (resp.status() !== 201) throw new Error(`创建 Issue 失败：${resp.status()}`);
    const issue = await resp.json();
    issues.push({ id: issue.id, sequenceId: issue.sequence_id, title });
  }

  return { workspaceSlug, projectId, issues };
}

/** 读回当前数据（spec 里需要最新状态时用）。 */
export async function readDemoFixture(api: Api): Promise<DemoFixture> {
  const { body: wsBody } = await api.get<{ results: { slug: string }[] }>(
    "/api/v1/workspaces/",
  );
  const slug = (wsBody?.results ?? [])
    .map((w) => w.slug)
    .find((s) => s.startsWith(E2E_SLUG_PREFIX));
  if (!slug) throw new Error("找不到 E2E 工作区 —— global.setup 没跑或失败了");

  const { body: projects } = await api.get<{
    results: { id: string; identifier: string }[];
  }>(`/api/v1/workspaces/${slug}/projects/`);
  const project = (projects?.results ?? []).find(
    (p) => p.identifier === DEMO.projectIdentifier,
  );
  if (!project) throw new Error("找不到 E2E 项目");

  const { body: issues } = await api.get<{
    results: { id: string; sequence_id: number; title: string }[];
  }>(`/api/v1/workspaces/${slug}/projects/${project.id}/issues/?per_page=100`);

  return {
    workspaceSlug: slug,
    projectId: project.id,
    issues: (issues?.results ?? []).map((i) => ({
      id: i.id,
      sequenceId: i.sequence_id,
      title: i.title,
    })),
  };
}

/** 前端项目页路由。 */
export function projectUrl(fixture: Pick<DemoFixture, "workspaceSlug" | "projectId">): string {
  return `/w/${fixture.workspaceSlug}/projects/${fixture.projectId}`;
}

/**
 * 断言写请求成功，失败时**把响应体贴进错误信息**。
 *
 * 加这个是因为真实踩过一次：`expect(resp.status()).toBe(200)` 只告诉我 403，
 * 而 403 的三种可能（CSRF / 权限 / 会话）在响应体里区分得很清楚 ——
 * 没有 body 就得靠猜，一次调试多花十几分钟。
 */
export async function expectWriteOk(
  resp: import("@playwright/test").APIResponse,
  what: string,
): Promise<void> {
  if (resp.ok()) return;
  let detail = "";
  try {
    detail = (await resp.text()).slice(0, 400);
  } catch {
    detail = "(响应体读不出来)";
  }
  throw new Error(`${what} 失败：HTTP ${resp.status()} · body=${detail}`);
}

/** 某个 Issue 在表格里的行 —— 用选择框的无障碍名定位（不依赖样式类名）。 */
export function issueRow(page: import("@playwright/test").Page, sequenceId: number) {
  // exact: 不加的话 "select E2E-1" 会同时命中 "select E2E-10"（getByLabel 默认子串匹配）
  return page
    .getByLabel(`select E2E-${sequenceId}`, { exact: true })
    .locator("xpath=../..");
}
