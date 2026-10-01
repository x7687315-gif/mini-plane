/** Agent Token 类型（Sprint 12，/api/v1/agent/tokens/）。 */
export interface AgentToken {
  id: string;
  name: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

/** 创建 Token 的响应：明文仅此一次返回。 */
export interface AgentTokenCreated {
  token: string;
  detail: AgentToken;
}

export const AGENT_SCOPE_LABELS: Record<string, string> = {
  read_project: "读项目",
  read_task: "读任务",
  write_task: "写任务",
  write_worklog: "写日志",
  update_progress: "更新进度",
};
