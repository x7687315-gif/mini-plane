/**
 * Workspace domain types — mirrors docs/api/02-workspaces.md.
 */

/** Role values are shared by Workspace and Project memberships. */
export const ROLE = {
  ADMIN: 20,
  MEMBER: 15,
  VIEWER: 5,
} as const;

export type RoleValue = (typeof ROLE)[keyof typeof ROLE];

export function roleLabel(role: number | null | undefined): string {
  if (role === ROLE.ADMIN) return "Admin";
  if (role === ROLE.MEMBER) return "Member";
  if (role === ROLE.VIEWER) return "Viewer";
  return "—";
}

export function isAdmin(role: number | null | undefined): boolean {
  return role === ROLE.ADMIN;
}

/** Viewer is read-only; Member and Admin can write. */
export function canWrite(role: number | null | undefined): boolean {
  return role === ROLE.ADMIN || role === ROLE.MEMBER;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner: string;
  current_role: number;
  created_at: string;
  updated_at: string;
}

/** Member summary shared by workspace and project members (no email). */
export interface MemberSummary {
  id: string;
  username: string;
  avatar: string | null;
}

export interface WorkspaceMember {
  id: string;
  user: MemberSummary;
  role: number;
  created_at: string;
}

export interface CreateWorkspacePayload {
  name: string;
  slug?: string;
}

export interface UpdateWorkspacePayload {
  name?: string;
  slug?: string;
}

export interface AddWorkspaceMemberPayload {
  email: string;
  role: number;
}

export interface UpdateMemberRolePayload {
  role: number;
}
