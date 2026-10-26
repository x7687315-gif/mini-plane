"use client";

import { useState } from "react";

import type { Activity } from "@/types/activity";
import type { Worklog } from "@/types/project";
import { selectAnatomyHistory, utcMinute } from "@/features/anatomy";

/**
 * 记录浏览：Worklog 与 Activity 分栏，不合并成一条“历史时间线”。
 * 只展示真实记录；没有快照，因此不提供旧结构回放。
 */
export function AnatomyHistory({
  worklogs,
  activities,
}: {
  worklogs: Worklog[];
  activities: Activity[];
}) {
  const history = selectAnatomyHistory(worklogs, activities);
  const [tab, setTab] = useState<"logs" | "audit">(
    history.worklogs.length ? "logs" : "audit",
  );

  return (
    <div className="mt-3 border-t border-dashed border-[color:var(--color-rule)] pt-2">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-ink-3)]">
          Records · 只读
        </span>
        <span className="font-mono text-[9px] text-[color:var(--color-ink-3)]">
          {history.worklogTotal + history.activityTotal}
        </span>
      </div>

      <div className="mt-1.5 flex gap-3 font-mono text-[9.5px]">
        <button
          type="button"
          aria-pressed={tab === "logs"}
          className={tab === "logs" ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-ink-3)]"}
          onClick={() => setTab("logs")}
        >
          工程日志 {history.worklogTotal}
        </button>
        <button
          type="button"
          aria-pressed={tab === "audit"}
          className={tab === "audit" ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-ink-3)]"}
          onClick={() => setTab("audit")}
        >
          审计事件 {history.activityTotal}
        </button>
      </div>

      {tab === "logs" ? (
        <div className="mt-1 max-h-52 overflow-auto">
          {history.worklogs.length === 0 && (
            <p className="py-2 text-[10.5px] text-[color:var(--color-ink-3)]">还没有工程日志。</p>
          )}
          {history.worklogs.map((log) => (
            <div key={log.id} className="border-b border-dashed border-[color:var(--color-rule)] py-1.5">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[9px] text-[color:var(--color-ink-3)]">{log.date}</span>
                <span className="min-w-0 flex-1 truncate text-[11px]">{log.title}</span>
                <span className="font-mono text-[8.5px] uppercase text-[color:var(--color-ink-3)]">
                  {log.source}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[10px] text-[color:var(--color-ink-2)]">
                {log.summary}
              </p>
              {log.stageName && (
                <p className="font-mono text-[8.5px] text-[color:var(--color-ink-3)]">阶段 · {log.stageName}</p>
              )}
            </div>
          ))}
          <p className="pt-1.5 text-[9px] leading-[1.5] text-[color:var(--color-ink-3)]">
            日期是业务归属日，可补记；不是精确时间。
          </p>
        </div>
      ) : (
        <div className="mt-1 max-h-52 overflow-auto">
          {history.activities.length === 0 && (
            <p className="py-2 text-[10.5px] text-[color:var(--color-ink-3)]">还没有审计事件。</p>
          )}
          {history.activities.map((activity) => (
            <div key={activity.id} className="border-b border-dashed border-[color:var(--color-rule)] py-1.5">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[8.5px] text-[color:var(--color-ink-3)]">
                  {utcMinute(activity.recordedAt)}
                </span>
                <span className="font-mono text-[8px] uppercase text-[color:var(--color-ink-3)]">AUDIT</span>
              </div>
              <p className="text-[10px] text-[color:var(--color-ink-2)]">{activity.text}</p>
            </div>
          ))}
          <p className="pt-1.5 text-[9px] leading-[1.5] text-[color:var(--color-ink-3)]">
            系统审计（有限字段，不是完整历史）；同一时间戳不保证先后。没有快照，不提供旧结构回放。
          </p>
        </div>
      )}
    </div>
  );
}
