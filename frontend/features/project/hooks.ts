"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { projectKeys } from "@/lib/queryKeys";
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
  createPersonalProject,
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

/** 创建个人工程（Phase 5 冷启动：只填名称，identifier 自动生成）。 */
export function useCreatePersonalProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createPersonalProject,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.mine() });
      qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

/** 查询键统一来自 lib/queryKeys 工厂（Phase 4 收敛；slug 退出缓存轴）。 */

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
    queryKey: projectKeys.plan(projectId ?? ""),
    queryFn: () => getPlan(slug!, projectId!),
    enabled: Boolean(slug && projectId),
  });
}

export function useAddStage(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: StagePayload) => addStage(slug, projectId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.plan(projectId) });
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
      qc.invalidateQueries({ queryKey: projectKeys.plan(projectId) });
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
    queryKey: projectKeys.worklogs(projectId ?? "", date),
    queryFn: () => listWorklogs(slug!, projectId!, date ? { date } : {}),
    enabled: Boolean(slug && projectId),
  });
}

export function useAddWorklog(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: WorklogPayload) => createWorklog(slug, projectId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.worklogs(projectId) });
      qc.invalidateQueries({ queryKey: projectKeys.mine() });
    },
  });
}

export function useDeleteWorklog(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (worklogId: string) => deleteWorklog(slug, projectId, worklogId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.worklogs(projectId) });
      qc.invalidateQueries({ queryKey: projectKeys.mine() });
    },
  });
}

export function useProjects(slug: string | undefined) {
  return useQuery({
    queryKey: projectKeys.wsList(slug ?? ""),
    queryFn: () => listProjects(slug!),
    enabled: Boolean(slug),
  });
}

export function useProject(slug: string | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(projectId ?? ""),
    queryFn: () => getProject(slug!, projectId!),
    enabled: Boolean(slug && projectId),
  });
}

export function useProjectMembers(slug: string | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.members(projectId ?? ""),
    queryFn: () => listProjectMembers(slug!, projectId!),
    enabled: Boolean(slug && projectId),
  });
}

export function useProjectStates(slug: string | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.states(projectId ?? ""),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.wsList(slug) });
      qc.invalidateQueries({ queryKey: projectKeys.mine() });
    },
  });
}

export function useUpdateProject(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateProjectPayload) => updateProject(slug, projectId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
      qc.invalidateQueries({ queryKey: projectKeys.wsList(slug) });
    },
  });
}

export function useDeleteProject(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => deleteProject(slug, projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.wsList(slug) }),
  });
}

export function useAddProjectMember(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddProjectMemberPayload) =>
      addProjectMember(slug, projectId, payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: projectKeys.members(projectId) }),
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
      qc.invalidateQueries({ queryKey: projectKeys.members(projectId) }),
  });
}

export function useRemoveProjectMember(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => removeProjectMember(slug, projectId, memberId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: projectKeys.members(projectId) }),
  });
}