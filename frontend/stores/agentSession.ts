"use client";

import { create } from "zustand";

/** 由 WebSocket `agent.session` 事件驱动的"当前项目 Agent 会话"实时快照（Sprint 13）。 */
export interface AgentSessionLive {
  sessionId: string;
  title: string;
  status: "running" | "done" | "failed" | "stopped" | string;
  elapsedSeconds: number;
  agent: string;
}

interface AgentSessionState {
  byProject: Record<string, AgentSessionLive | null>;
  set: (projectId: string, session: AgentSessionLive | null) => void;
}

export const useAgentSessionStore = create<AgentSessionState>((set) => ({
  byProject: {},
  set: (projectId, session) =>
    set((st) => ({ byProject: { ...st.byProject, [projectId]: session } })),
}));
