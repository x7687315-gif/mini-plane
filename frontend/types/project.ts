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
  /** 今日工程日志条数（Sprint 11）。 */
  today_logs: number;
  /** 是否有运行中的 Agent 会话（Sprint 13）。 */
  agent_running: boolean;
  last_activity: string | null;
}

/** Global Plan 的单个阶段（Sprint 10）。 */
export interface ProjectStage {
  id: string;
  order: number;
  name: string;
  goal: string;
  weight: number;
  /** 0~100。 */
  progress: number;
  is_current: boolean;
  created_at: string;
}

/** 项目全局计划（Sprint 10）：stages 有序 + 加权总进度 + 当前/下一阶段。 */
export interface ProjectPlan {
  id: string;
  title: string;
  stages: ProjectStage[];
  /** 0~100，Σ(weight×progress)/Σweight。 */
  progress: number;
  current_stage: ProjectStage | null;
  next_stage: ProjectStage | null;
}

/** 新增 / 修改 Stage 的请求体。 */
export interface StagePayload {
  name: string;
  order?: number;
  weight?: number;
  progress?: number;
  goal?: string;
  is_current?: boolean;
}

/** 工程日志（Sprint 11）：Task 是计划，Worklog 是证据。 */
export interface Worklog {
  id: string;
  project: string;
  stage: string | null;
  stage_name: string | null;
  author: MemberSummary;
  date: string;
  title: string;
  summary: string;
  details: string;
  conclusion: string;
  next_step: string;
  blocker: string;
  source: "manual" | "agent" | "imported";
  created_at: string;
  updated_at: string;
}

/** 新建 / 修改 Worklog 的请求体。 */
export interface WorklogPayload {
  title: string;
  summary: string;
  date?: string;
  details?: string;
  conclusion?: string;
  next_step?: string;
  blocker?: string;
  stage_id?: string | null;
  source?: "manual" | "agent" | "imported";
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
