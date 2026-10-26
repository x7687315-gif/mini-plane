/**
 * Project API — docs/api/10-canonical-projects.md（Phase 4 切规范路由）。
 *
 * 详情/Plan/Stage/Worklog/工程 CRUD/States 走 /api/v1/projects/{pid}/…（slug 参数
 * 仅保留签名兼容）；**成员管理**保留兼容路由（团队协作概念，属 Workspace namespace）；
 * 工作区内工程列表（团队页数据源）亦保留兼容路由。
 */

import { api } from "@/lib/api";
import type {
  AddProjectMemberPayload,
  CreateProjectPayload,
  IssueState,
  Paginated,
  Project,
  ProjectEngineering,
  ProjectMember,
  ProjectPlan,
  ProjectStage,
  StagePayload,
  UpdateProjectPayload,
  Worklog,
  WorklogPayload,
} from "@/types/project";
import type { UpdateMemberRolePayload } from "@/types/workspace";

/** GET /api/v1/projects/mine/ —— 我的工程首页聚合摘要（Sprint 09）。 */
export async function listMyProjects(): Promise<ProjectEngineering[]> {
  return api<ProjectEngineering[]>("/projects/mine");
}

/** POST /api/v1/projects/ —— 创建个人工程（Phase 5 冷启动：只填名称，identifier 自动生成）。 */
export async function createPersonalProject(name: string): Promise<Project> {
  return api<Project>("/projects", { method: "POST", json: { name } });
}

/* ---------------- Global Plan / Stage（Sprint 10） ---------------- */

export async function getPlan(slug: string, projectId: string): Promise<ProjectPlan> {
  return api<ProjectPlan>(`/projects/${projectId}/plan`);
}

export async function addStage(
  slug: string,
  projectId: string,
  payload: StagePayload,
): Promise<ProjectStage> {
  return api<ProjectStage>(`/projects/${projectId}/plan`, {
    method: "POST",
    json: payload,
  });
}

export async function updateStage(
  slug: string,
  projectId: string,
  stageId: string,
  payload: Partial<StagePayload>,
): Promise<ProjectStage> {
  return api<ProjectStage>(`/projects/${projectId}/plan/stages/${stageId}`, {
    method: "PATCH",
    json: payload,
  });
}

/* ---------------- Worklog（Sprint 11） ---------------- */

export async function listWorklogs(
  slug: string,
  projectId: string,
  query: { date?: string } = {},
): Promise<Paginated<Worklog>> {
  const qs = query.date ? `?date=${query.date}` : "";
  return api<Paginated<Worklog>>(`/projects/${projectId}/worklogs${qs}`);
}

export async function createWorklog(
  slug: string,
  projectId: string,
  payload: WorklogPayload,
): Promise<Worklog> {
  return api<Worklog>(`/projects/${projectId}/worklogs`, {
    method: "POST",
    json: payload,
  });
}

export async function deleteWorklog(
  slug: string,
  projectId: string,
  worklogId: string,
): Promise<void> {
  return api<void>(`/projects/${projectId}/worklogs/${worklogId}`, {
    method: "DELETE",
  });
}

export async function listProjects(slug: string): Promise<Paginated<Project>> {
  return api<Paginated<Project>>(`/workspaces/${slug}/projects`);
}

export async function getProject(slug: string, projectId: string): Promise<Project> {
  return api<Project>(`/projects/${projectId}`);
}

export async function createProject(
  slug: string,
  payload: CreateProjectPayload,
): Promise<Project> {
  return api<Project>(`/workspaces/${slug}/projects`, { method: "POST", json: payload });
}

export async function updateProject(
  slug: string,
  projectId: string,
  payload: UpdateProjectPayload,
): Promise<Project> {
  return api<Project>(`/projects/${projectId}`, {
    method: "PATCH",
    json: payload,
  });
}

export async function deleteProject(slug: string, projectId: string): Promise<void> {
  return api<void>(`/projects/${projectId}`, { method: "DELETE" });
}

/* ---- members ---- */

export async function listProjectMembers(
  _slug: string,
  projectId: string,
): Promise<Paginated<ProjectMember>> {
  return api<Paginated<ProjectMember>>(`/projects/${projectId}/members`);
}

export async function addProjectMember(
  _slug: string,
  projectId: string,
  payload: AddProjectMemberPayload,
): Promise<ProjectMember> {
  return api<ProjectMember>(`/projects/${projectId}/members`, {
    method: "POST",
    json: payload,
  });
}

export async function updateProjectMemberRole(
  _slug: string,
  projectId: string,
  memberId: string,
  payload: UpdateMemberRolePayload,
): Promise<ProjectMember> {
  return api<ProjectMember>(`/projects/${projectId}/members/${memberId}`, {
    method: "PATCH",
    json: payload,
  });
}

export async function removeProjectMember(
  _slug: string,
  projectId: string,
  memberId: string,
): Promise<void> {
  return api<void>(`/projects/${projectId}/members/${memberId}`, {
    method: "DELETE",
  });
}

/* ---- states (read-only, 5 predefined) ---- */

export async function listStates(
  slug: string,
  projectId: string,
): Promise<Paginated<IssueState>> {
  return api<Paginated<IssueState>>(
    `/projects/${projectId}/states`,
  );
}