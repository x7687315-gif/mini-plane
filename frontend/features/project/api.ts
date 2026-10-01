/**
 * Project API — docs/api/03-projects.md.
 *
 * All project routes are workspace-scoped: /workspaces/{slug}/projects/{pid}/…
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

/* ---------------- Global Plan / Stage（Sprint 10） ---------------- */

export async function getPlan(slug: string, projectId: string): Promise<ProjectPlan> {
  return api<ProjectPlan>(`/workspaces/${slug}/projects/${projectId}/plan`);
}

export async function addStage(
  slug: string,
  projectId: string,
  payload: StagePayload,
): Promise<ProjectStage> {
  return api<ProjectStage>(`/workspaces/${slug}/projects/${projectId}/plan`, {
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
  return api<ProjectStage>(`/workspaces/${slug}/projects/${projectId}/plan/stages/${stageId}`, {
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
  return api<Paginated<Worklog>>(`/workspaces/${slug}/projects/${projectId}/worklogs${qs}`);
}

export async function createWorklog(
  slug: string,
  projectId: string,
  payload: WorklogPayload,
): Promise<Worklog> {
  return api<Worklog>(`/workspaces/${slug}/projects/${projectId}/worklogs`, {
    method: "POST",
    json: payload,
  });
}

export async function deleteWorklog(
  slug: string,
  projectId: string,
  worklogId: string,
): Promise<void> {
  return api<void>(`/workspaces/${slug}/projects/${projectId}/worklogs/${worklogId}`, {
    method: "DELETE",
  });
}

export async function listProjects(slug: string): Promise<Paginated<Project>> {
  return api<Paginated<Project>>(`/workspaces/${slug}/projects`);
}

export async function getProject(slug: string, projectId: string): Promise<Project> {
  return api<Project>(`/workspaces/${slug}/projects/${projectId}`);
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
  return api<Project>(`/workspaces/${slug}/projects/${projectId}`, {
    method: "PATCH",
    json: payload,
  });
}

export async function deleteProject(slug: string, projectId: string): Promise<void> {
  return api<void>(`/workspaces/${slug}/projects/${projectId}`, { method: "DELETE" });
}

/* ---- members ---- */

export async function listProjectMembers(
  slug: string,
  projectId: string,
): Promise<Paginated<ProjectMember>> {
  return api<Paginated<ProjectMember>>(
    `/workspaces/${slug}/projects/${projectId}/members`,
  );
}

export async function addProjectMember(
  slug: string,
  projectId: string,
  payload: AddProjectMemberPayload,
): Promise<ProjectMember> {
  return api<ProjectMember>(`/workspaces/${slug}/projects/${projectId}/members`, {
    method: "POST",
    json: payload,
  });
}

export async function updateProjectMemberRole(
  slug: string,
  projectId: string,
  memberId: string,
  payload: UpdateMemberRolePayload,
): Promise<ProjectMember> {
  return api<ProjectMember>(
    `/workspaces/${slug}/projects/${projectId}/members/${memberId}`,
    { method: "PATCH", json: payload },
  );
}

export async function removeProjectMember(
  slug: string,
  projectId: string,
  memberId: string,
): Promise<void> {
  return api<void>(`/workspaces/${slug}/projects/${projectId}/members/${memberId}`, {
    method: "DELETE",
  });
}

/* ---- states (read-only, 5 predefined) ---- */

export async function listStates(
  slug: string,
  projectId: string,
): Promise<Paginated<IssueState>> {
  return api<Paginated<IssueState>>(
    `/workspaces/${slug}/projects/${projectId}/states`,
  );
}