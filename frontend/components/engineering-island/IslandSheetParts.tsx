/**
 * Island 的三个展示件（进度 / NOW+TODAY+NEXT / Agent 状态）。
 *
 * 合成一个文件而不是拆五个：它们共享同一套"图纸标注"排版规则（细线 / 小字大写 /
 * 虚线分隔），拆开反而会让这套规则散在五个文件里失守。
 * 纯展示，不取数、不管状态——数据在 IslandSheet 统一喂进来。
 */

import type { AgentSessionLive } from "@/stores/agentSession";
import { formatElapsed, orDash, progressPercent } from "@/features/engineering-island";

/** 6px 细进度条：与首页 EngineeringCard 同一视觉语言（0.5px 边框 + accent 填充）。 */
export function IslandProgress({ progress }: { progress: number }) {
  const pct = progressPercent(progress);
  return (
    <div className="flex items-end gap-3">
      <div
        className="h-[6px] flex-1 border border-[color:var(--color-rule)]"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="项目进度"
      >
        <div
          className="h-full bg-[color:var(--color-accent)] transition-[width] duration-[var(--duration-base)] ease-[var(--ease-out)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-[color:var(--color-ink-2)]">
        {pct}%
      </span>
    </div>
  );
}

/** 图纸上的一个字段块：小字大写标签 + 内容行。 */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="bp-uppercase mb-1">{label}</div>
      <div className="text-[13px] leading-[1.55] text-[color:var(--color-ink)]">
        {children}
      </div>
    </div>
  );
}

/** NOW / NEXT：左右两栏，中间一条竖细线（图纸分栏的克制表达）。 */
export function IslandNowNext({
  nowTask,
  nextTask,
}: {
  nowTask: string | null;
  nextTask: string | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="NOW">
        <span className="border-l-2 border-[color:var(--color-accent)] pl-2">
          {orDash(nowTask)}
        </span>
      </Field>
      <div className="border-l border-[color:var(--color-rule)] pl-3">
        <Field label="NEXT">
          <span className="text-[color:var(--color-ink-2)]">{orDash(nextTask)}</span>
        </Field>
      </div>
    </div>
  );
}

/**
 * TODAY：今日工程日志标题清单。
 *
 * 没有日志时显示计数为 0 的空态文案（而不是留白）——
 * 空白在图纸语汇里会被读成"这里漏印了"，文案才是诚实的。
 */
export function IslandToday({
  titles,
  count,
  loading,
}: {
  titles: readonly string[];
  count: number;
  loading: boolean;
}) {
  return (
    <Field label="TODAY">
      {loading ? (
        <div className="space-y-1.5" aria-hidden>
          <div className="h-[9px] w-3/4 bg-[color:var(--color-paper-2)]" />
          <div className="h-[9px] w-1/2 bg-[color:var(--color-paper-2)]" />
        </div>
      ) : titles.length > 0 ? (
        <ul className="space-y-1">
          {titles.map((title, i) => (
            <li key={`${title}-${i}`} className="flex gap-2">
              <span className="text-[color:var(--color-accent)]" aria-hidden>
                ✓
              </span>
              <span className="text-[color:var(--color-ink-2)]">{title}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-[color:var(--color-ink-3)]">
          {count > 0 ? `${count} 条（明细加载中）` : "今天还没有记录"}
        </span>
      )}
    </Field>
  );
}

/**
 * AGENT 状态行。
 *
 * `live` 来自 WebSocket 事件（Sprint 13 的 `agent.session`），
 * 没有 WS 事件时退回 `mine/` 聚合接口给的 `running` 布尔 —— 保证"至少不撒谎"：
 * 没有会话就是没有会话，不猜。
 */
export function IslandAgentStatus({
  running,
  live,
}: {
  running: boolean;
  live: AgentSessionLive | null | undefined;
}) {
  if (!running && !live) {
    return (
      <div className="flex items-center gap-2 bp-uppercase text-[color:var(--color-ink-3)]">
        <span className="inline-block h-[5px] w-[5px] border border-[color:var(--color-ink-3)]" aria-hidden />
        {/* 标签与状态拆成两个元素：既让读屏能分别听到「AGENT」和「IDLE」，
            也让测试能用精确文本定位（"AGENT · IDLE" 这种整行文本无法 exact 匹配） */}
        <span>AGENT</span>
        <span aria-hidden>·</span>
        <span>IDLE</span>
      </div>
    );
  }

  const status = (live?.status ?? "running").toUpperCase();
  const title = live?.title ? ` · ${live.title}` : "";

  return (
    <div className="flex items-center gap-2 bp-uppercase text-[color:var(--color-accent)]">
      <span
        className="inline-block h-[5px] w-[5px] bg-[color:var(--color-accent)] motion-safe:animate-pulse"
        aria-hidden
      />
      <span>AGENT</span>
      <span aria-hidden>·</span>
      <span>{status}</span>
      {title ? <span className="text-[color:var(--color-ink-2)] normal-case">{title}</span> : null}
      {live ? (
        <span className="font-mono text-[10px] tabular-nums text-[color:var(--color-ink-2)]">
          {formatElapsed(live.elapsedSeconds)}
        </span>
      ) : null}
    </div>
  );
}
