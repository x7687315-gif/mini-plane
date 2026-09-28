"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Paginated } from "@/types/project";
import type {
  AddWorkspaceMemberPayload,
  CreateWorkspacePayload,
  UpdateMemberRolePayload,
  UpdateWorkspacePayload,
  WorkspaceMember,
} from "@/types/workspace";
import {
  addWorkspaceMember,
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  listWorkspaceMembers,
  listWorkspaces,
  removeWorkspaceMember,
  updateWorkspace,
  updateWorkspaceMemberRole,
} from "./api";

export const workspaceKeys = {
  all: ["workspaces"] as const,
  list: () => [...workspaceKeys.all, "list"] as const,
  detail: (slug: string) => [...workspaceKeys.all, "detail", slug] as const,
  members: (slug: string) => [...workspaceKeys.all, "members", slug] as const,
};

export function useWorkspaces() {
  return useQuery({
    queryKey: workspaceKeys.list(),
    queryFn: listWorkspaces,
  });
}

export function useWorkspace(slug: string | undefined) {
  return useQuery({
    queryKey: workspaceKeys.detail(slug ?? ""),
    queryFn: () => getWorkspace(slug!),
    enabled: Boolean(slug),
  });
}

export function useWorkspaceMembers(slug: string | undefined) {
  return useQuery({
    queryKey: workspaceKeys.members(slug ?? ""),
    queryFn: () => listWorkspaceMembers(slug!),
    enabled: Boolean(slug),
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateWorkspacePayload) => createWorkspace(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.all }),
  });
}

export function useUpdateWorkspace(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateWorkspacePayload) => updateWorkspace(slug, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.all }),
  });
}

export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => deleteWorkspace(slug),
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.all }),
  });
}

export function useAddWorkspaceMember(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddWorkspaceMemberPayload) => addWorkspaceMember(slug, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.members(slug) }),
  });
}

export function useUpdateWorkspaceMemberRole(slug: string) {
  const qc = useQueryClient();
  const key = workspaceKeys.members(slug);
  return useMutation({
    mutationFn: ({ memberId, payload }: { memberId: string; payload: UpdateMemberRolePayload }) =>
      updateWorkspaceMemberRole(slug, memberId, payload),
    // 乐观更新：改角色即时反映到列表，避免"受控 select 回弹 + 全表 disabled + 等一次往返"的卡顿。
    // 失败回滚快照；settled 再校准一次（防与服务端漂移）。
    onMutate: async ({ memberId, payload }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Paginated<WorkspaceMember>>(key);
      qc.setQueryData<Paginated<WorkspaceMember>>(key, (old) =>
        old
          ? {
              ...old,
              results: old.results.map((m) =>
                m.id === memberId ? { ...m, role: payload.role } : m,
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
}

export function useRemoveWorkspaceMember(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => removeWorkspaceMember(slug, memberId),
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.members(slug) }),
  });
}