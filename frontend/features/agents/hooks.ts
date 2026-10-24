"use client";

/**
 * Agent Token 查询 hooks（Phase 4 三层化：此前 AgentTokenCard 内联 useQuery，
 * queryKey 字面量散落在组件里——与其它 feature 的 api→hooks→组件约定对齐）。
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentKeys } from "@/lib/queryKeys";
import { createAgentToken, listAgentTokens, revokeAgentToken } from "./api";
import type { AgentToken } from "@/types/agent";

export function useAgentTokens() {
  return useQuery<AgentToken[]>({ queryKey: agentKeys.tokens(), queryFn: listAgentTokens });
}

export function useCreateAgentToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createAgentToken({ name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.tokens() }),
  });
}

export function useRevokeAgentToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeAgentToken(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.tokens() }),
  });
}
