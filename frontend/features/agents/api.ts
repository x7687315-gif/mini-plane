/** Agent Token 管理 API（Sprint 12，/api/v1/agent/tokens/，走用户会话）。 */

import { api } from "@/lib/api";
import type { AgentToken, AgentTokenCreated } from "@/types/agent";

export async function listAgentTokens(): Promise<AgentToken[]> {
  return api<AgentToken[]>("/agent/tokens");
}

export async function createAgentToken(payload: {
  name: string;
  scopes?: string[];
}): Promise<AgentTokenCreated> {
  return api<AgentTokenCreated>("/agent/tokens", { method: "POST", json: payload });
}

export async function revokeAgentToken(id: string): Promise<AgentToken> {
  return api<AgentToken>(`/agent/tokens/${id}/revoke`, { method: "POST" });
}
