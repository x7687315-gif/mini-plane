/**
 * Project domain types — mirrors docs/api/03-projects.md.
 */

import type { MemberSummary } from "./workspace";

export interface Project {
  id: string;
  workspace: string;
  name: string;
  identifier: string;
  description: string;
  created_by: string;
  current_user_role: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  id: string;
  user: MemberSummary;
  role: number;
  created_at: string;
}

/** Predefined state — created automatically (5 per project), read-only in MVP. */
export interface IssueState {
  id: string;
  name: string;
  /** backlog | unstarted | started | completed | cancelled */
  group: string;
  color: string;
  sort_order: number;
}

export interface CreateProjectPayload {
  name: string;
  /** 2–5 uppercase alphanumerics, unique within the workspace. */
  identifier: string;
  description?: string;
}

export interface UpdateProjectPayload {
  name?: string;
  identifier?: string;
  description?: string;
}

export interface AddProjectMemberPayload {
  user_id: string;
  role: number;
}

/** Paginated list envelope (docs/api/00-conventions.md §3). */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
