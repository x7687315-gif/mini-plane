/**
 * Workspace API — docs/api/02-workspaces.md.
 *
 * All paths go through lib/api.ts (credentials + CSRF self-heal).
 * Note the backend uses trailing slashes; lib/api.ts normalises them.
 */

import { api } from "@/lib/api";
import type { Paginated } from "@/types/project";
import type {
  AddWorkspaceMemberPayload,
  CreateWorkspacePayload,
  UpdateMemberRolePayload,
  UpdateWorkspacePayload,
  Workspace,
  WorkspaceMember,
} from "@/types/workspace";

export async function listWorkspaces(): Promise<Paginated<Workspace>> {
  return api<Paginated<Workspace>>("/workspaces");
}

export async function getWorkspace(slug: string): Promise<Workspace> {
  return api<Workspace>(`/workspaces/${slug}`);
}

export async function createWorkspace(payload: CreateWorkspacePayload): Promise<Workspace> {
  return api<Workspace>("/workspaces", { method: "POST", json: payload });
}

export async function updateWorkspace(
  slug: string,
  payload: UpdateWorkspacePayload,
): Promise<Workspace> {
  return api<Workspace>(`/workspaces/${slug}`, { method: "PATCH", json: payload });
}

export async function deleteWorkspace(slug: string): Promise<void> {
  return api<void>(`/workspaces/${slug}`, { method: "DELETE" });
}

/* ---- members ---- */

export async function listWorkspaceMembers(
  slug: string,
): Promise<Paginated<WorkspaceMember>> {
  return api<Paginated<WorkspaceMember>>(`/workspaces/${slug}/members`);
}

export async function addWorkspaceMember(
  slug: string,
  payload: AddWorkspaceMemberPayload,
): Promise<WorkspaceMember> {
  return api<WorkspaceMember>(`/workspaces/${slug}/members`, {
    method: "POST",
    json: payload,
  });
}

export async function updateWorkspaceMemberRole(
  slug: string,
  memberId: string,
  payload: UpdateMemberRolePayload,
): Promise<WorkspaceMember> {
  return api<WorkspaceMember>(`/workspaces/${slug}/members/${memberId}`, {
    method: "PATCH",
    json: payload,
  });
}

export async function removeWorkspaceMember(slug: string, memberId: string): Promise<void> {
  return api<void>(`/workspaces/${slug}/members/${memberId}`, { method: "DELETE" });
}