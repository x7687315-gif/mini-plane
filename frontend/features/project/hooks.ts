"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddProjectMemberPayload,
  CreateProjectPayload,
  UpdateProjectPayload,
} from "@/types/project";
import type { UpdateMemberRolePayload } from "@/types/workspace";
import {
  addProjectMember,
  createProject,
  deleteProject,
  getProject,
  listProjectMembers,
  listProjects,
  listStates,
  removeProjectMember,
  updateProject,
  updateProjectMemberRole,
} from "./api";

export const projectKeys = {
  all: ["projects"] as const,
  list: (slug: string) => [...projectKeys.all, "list", slug] as const,
  detail: (slug: string, pid: string) => [...projectKeys.all, "detail", slug, pid] as const,
  members: (slug: string, pid: string) =>
    [...projectKeys.all, "members", slug, pid] as const,
  states: (slug: string, pid: string) => [...projectKeys.all, "states", slug, pid] as const,
};

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