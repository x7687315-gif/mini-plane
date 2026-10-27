/**
 * Engineering Overview 通道（Island V2 阶段 4 · 规格 §7.2 · C-lite）。
 *
 * **一条** WebSocket 覆盖 Island 全部项目（不按卡片建连接）；事件只是通知，
 * 事实数据以 REST 为准 —— 收到事件 → 失效对应 React Query 缓存 → 自动重取。
 *
 * 协议（与 backend/apps/realtime/consumers.OverviewConsumer 对齐）：
 * - 客户端发：`subscribe`（带 project_ids）/ `unsubscribe` / `ping`
 * - 服务端发：`connected` / `subscriptions`（逐项回执）/ `ping`（30s 心跳）/
 *   `membership.changed`（订阅收敛）/ 业务事件（issue.updated / comment.created /
 *   agent.session，payload 已注入 project_id）
 *
 * 断线语义（规格：不虚报 LIVE）：
 * - 服务端 30s 一次 `ping`；前端超过 90s 没收到**任何帧** → 视为死连接，主动 close
 *   重连（浏览器静默断线不抛 close，channels#1244 —— 这 90s 超时是唯一可靠的探活手段）
 * - 重连成功 → 重新 subscribe + **全量失效**（断线窗口内的事件可能丢，REST 补齐）
 */

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { nextBackoffDelay } from "@/features/realtime/policy";
import { projectKeys, taskKeys } from "@/lib/queryKeys";
import { wsBaseUrl } from "@/lib/api";

function overviewUrl(): string {
  return `${wsBaseUrl()}/ws/engineering/overview/`;
}

export interface OverviewState {
  /** WS 已连接且订阅成功（能收到事件）。断线即 false，不虚报。 */
  live: boolean;
}

/**
 * @param projectIds 要订阅的项目（来自 useMyProjects）
 * @param enabled 挂载条件（Island 面板/页面挂载时 true）
 */
export function useEngineeringOverview(
  projectIds: readonly string[],
  enabled: boolean,
): OverviewState {
  const qc = useQueryClient();
  const [live, setLive] = useState(false);
  // projectIds 序列化成稳定字符串，避免数组引用变化导致重连
  const idsKey = [...projectIds].sort().join(",");

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let lastFrame = 0;
    let watchdog: ReturnType<typeof setInterval> | null = null;

    const invalidateAll = () => {
      // 断线窗口内的事件可能丢 → 全量失效（REST 补齐）。
      // projectKeys.all 前缀覆盖 mine + 各项目子树（tasks/comments/worklogs/activities），
      // 键来自统一工厂——R-03（手写 ["worklogs"] 前缀永不命中）的根治。
      void qc.invalidateQueries({ queryKey: projectKeys.all });
    };

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(overviewUrl());

      ws.onopen = () => {
        lastFrame = Date.now();
        // 会话 cookie 与 HTTP 同源（AuthMiddlewareStack），握手即带身份
        ws?.send(
          JSON.stringify({
            type: "subscribe",
            project_ids: idsKey ? idsKey.split(",").filter(Boolean) : [],
          }),
        );
      };

      ws.onmessage = (ev) => {
        lastFrame = Date.now();
        let frame: { event?: string; payload?: Record<string, unknown> };
        try {
          frame = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        const event = frame.event ?? "";
        if (event === "ping" || event === "pong") return;
        if (event === "connected") {
          attempt = 0;
          // 注意：connected 只表示握手成功，此时 subscribe 可能还没被服务端处理。
          // LIVE 必须等 subscriptions 回执——否则 UI 会先显示"实时"，紧接着
          // 启动 Agent 时事件落在订阅生效前，界面永远不更新（E2E 实测）。
          return;
        }
        if (event === "subscriptions") {
          setLive(true);
          return;
        }
        if (event === "membership.changed") {
          // 订阅被收敛（被移出项目）→ 总览数据变了，失效重取
          void qc.invalidateQueries({ queryKey: projectKeys.mine() });
          return;
        }
        // 业务事件：payload.project_id 由 overview consumer 注入。
        const pid =
          typeof frame.payload?.project_id === "string" ? frame.payload.project_id : null;
        void qc.invalidateQueries({ queryKey: projectKeys.mine() });
        if (!pid) return;
        if (
          event === "worklog.created" ||
          event === "worklog.updated" ||
          event === "worklog.deleted"
        ) {
          void qc.invalidateQueries({ queryKey: projectKeys.worklogs(pid) });
          return;
        }
        if (event === "stage.updated") {
          void qc.invalidateQueries({ queryKey: projectKeys.plan(pid) });
          return;
        }
        if (event === "project.updated") {
          void qc.invalidateQueries({ queryKey: projectKeys.detail(pid) });
          return;
        }
        if (event === "issue.updated" || event === "comment.created") {
          void qc.invalidateQueries({ queryKey: taskKeys.list(pid) });
        }
      };

      ws.onclose = () => {
        setLive(false);
        if (closed) return;
        // 等值抖动退避（与项目通道同一策略），重连后全量失效
        const delay = nextBackoffDelay(attempt++);
        setTimeout(connect, delay);
        invalidateAll();
      };

      ws.onerror = () => ws?.close();
    };

    // 90s 无任何帧 → 视为死连接（服务端 30s 一 ping；两次不到就该警觉）
    watchdog = setInterval(() => {
      if (lastFrame > 0 && Date.now() - lastFrame > 90_000) {
        ws?.close(); // onclose 走重连 + 全量失效
      }
      if (lastFrame === 0) lastFrame = Date.now(); // 连接建立前的宽限
    }, 5_000);

    connect();

    return () => {
      closed = true;
      if (watchdog) clearInterval(watchdog);
      ws?.close();
    };
  }, [enabled, idsKey, qc]);

  return { live };
}
