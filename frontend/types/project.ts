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

/** 「我的工程」首页的项目工程摘要（GET /api/v1/projects/mine/，Sprint 09）。 */
export interface ProjectEngineering {
  id: string;
  name: string;
  identifier: string;
  workspace_slug: string;
  workspace_name: string;
  total_tasks: number;
  open_tasks: number;
  done_tasks: number;
  started_tasks: number;
  /** 0~1，已完成/总数。 */
  progress: number;
  current_stage: string | null;
  now_task: string | null;
  next_task: string | null;
  last_activity: string | null;
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
