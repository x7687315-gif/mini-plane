"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddProjectMemberPayload,
  CreateProjectPayload,
  StagePayload,
  UpdateProjectPayload,
  WorklogPayload,
} from "@/types/project";
import type { UpdateMemberRolePayload } from "@/types/workspace";
import {
  addProjectMember,
  addStage,
  createProject,
  createWorklog,
  deleteProject,
  deleteWorklog,
  getPlan,
  getProject,
  listProjectMembers,
  listProjects,
  listMyProjects,
  listStates,
  listWorklogs,
  removeProjectMember,
  updateProject,
  updateProjectMemberRole,
  updateStage,
} from "./api";

export const projectKeys = {
  all: ["projects"] as const,
  list: (slug: string) => [...projectKeys.all, "list", slug] as const,
  detail: (slug: string, pid: string) => [...projectKeys.all, "detail", slug, pid] as const,
  members: (slug: string, pid: string) =>
    [...projectKeys.all, "members", slug, pid] as const,
  states: (slug: string, pid: string) => [...projectKeys.all, "states", slug, pid] as const,
  mine: () => [...projectKeys.all, "mine"] as const,
};

/** 「我的工程」首页聚合摘要（Sprint 09）。 */
export function useMyProjects() {
  return useQuery({
    queryKey: projectKeys.mine(),
    queryFn: listMyProjects,
  });
}

/** Global Plan / Stage（Sprint 10）。 */
export function usePlan(slug: string | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: [...projectKeys.all, "plan", slug ?? "", projectId ?? ""] as const,
    queryFn: () => getPlan(slug!, projectId!),
    enabled: Boolean(slug && projectId),
  });
}

export function useAddStage(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: StagePayload) => addStage(slug, projectId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...projectKeys.all, "plan", slug, projectId] });
      qc.invalidateQueries({ queryKey: projectKeys.mine() });
    },
  });
}

export function useUpdateStage(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, payload }: { stageId: string; payload: Partial<StagePayload> }) =>
      updateStage(slug, projectId, stageId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...projectKeys.all, "plan", slug, projectId] });
      qc.invalidateQueries({ queryKey: projectKeys.mine() });
    },
  });
}

/* ---------------- Worklog（Sprint 11） ---------------- */

export function useWorklogs(
  slug: string | undefined,
  projectId: string | undefined,
  date?: string,
) {
  return useQuery({
    queryKey: [...projectKeys.all, "worklogs", slug ?? "", projectId ?? "", date ?? ""] as const,
    queryFn: () => listWorklogs(slug!, projectId!, date ? { date } : {}),
    enabled: Boolean(slug && projectId),
  });
}

export function useAddWorklog(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: WorklogPayload) => createWorklog(slug, projectId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...projectKeys.all, "worklogs", slug, projectId] });
      qc.invalidateQueries({ queryKey: projectKeys.mine() });
    },
  });
}

export function useDeleteWorklog(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (worklogId: string) => deleteWorklog(slug, projectId, worklogId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...projectKeys.all, "worklogs", slug, projectId] });
      qc.invalidateQueries({ queryKey: projectKeys.mine() });
    },
  });
}

export function useProjects(slug: string | undefined) {
  return useQuery({
    queryKey: projectKeys.list(slug ?? ""),
    queryFn: () => listProjects(slug!),
    enabled: Boolean(slug),
  });
}

export function useProject(slug: string | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(slug ?? "", projectId ?? ""),
    queryFn: () => getProject(slug!, projectId!),
    enabled: Boolean(slug && projectId),
  });
}

export function useProjectMembers(slug: string | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.members(slug ?? "", projectId ?? ""),
    queryFn: () => listProjectMembers(slug!, projectId!),
    enabled: Boolean(slug && projectId),
  });
}

export function useProjectStates(slug: string | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.states(slug ?? "", projectId ?? ""),
    queryFn: () => listStates(slug!, projectId!),
    enabled: Boolean(slug && projectId),
    // States are created once with the project and never change in MVP.
    staleTime: 10 * 60_000,
  });
}

export function useCreateProject(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateProjectPayload) => createProject(slug, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.list(slug) }),
  });
}

export function useUpdateProject(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateProjectPayload) => updateProject(slug, projectId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(slug, projectId) });
      qc.invalidateQueries({ queryKey: projectKeys.list(slug) });
    },
  });
}

export function useDeleteProject(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => deleteProject(slug, projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.list(slug) }),
  });
}

export function useAddProjectMember(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddProjectMemberPayload) =>
      addProjectMember(slug, projectId, payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: projectKeys.members(slug, projectId) }),
  });
}

export function useUpdateProjectMemberRole(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      memberId,
      payload,
    }: {
      memberId: string;
      payload: UpdateMemberRolePayload;
    }) => updateProjectMemberRole(slug, projectId, memberId, payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: projectKeys.members(slug, projectId) }),
  });
}

export function useRemoveProjectMember(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => removeProjectMember(slug, projectId, memberId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: projectKeys.members(slug, projectId) }),
  });
}