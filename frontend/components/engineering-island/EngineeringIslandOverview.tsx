/**
 * 多项目总览（Island V2 · 规格 §1.4 项目范围 / §2 信息设计）。
 *
 * 与第一代（单项目轮播图纸）的根本区别：
 * - **所有项目同时可见**，不再 `?sheet=<id>` 翻页（规格：核心总览不依赖轮播）；
 * - 项目多时**面板内部纵向滚动**，窗口不无限增高、主窗口内容不跟着滚；
 * - 顺序沿用 `/projects/mine/` 的 `last_activity`（首版不做关注/排序/分组）。
 *
 * 滚动容器为什么用 `overscroll-contain`：桌面面板是置顶小窗，
 * 滚到底时若不收住，滚轮会继续把下层应用滚走（chained scrolling）——那是很吵的体验。
 */

import { useMemo } from "react";
import { useMyProjects } from "@/features/project";
import { useProjectRealtime } from "@/features/realtime";
import { useAgentSessionStore } from "@/stores/agentSession";
import type { ProjectEngineering } from "@/types/project";
import { IslandHeader } from "./IslandHeader";
import { ProjectSummaryCard } from "./ProjectSummaryCard";

export function EngineeringIslandOverview({
  variant = "page",
}: {
  variant?: "page" | "panel";
}) {
  const isPanel = variant === "panel";
  const { data, isLoading, isError } = useMyProjects();
  const projects = useMemo<ProjectEngineering[]>(() => data ?? [], [data]);

  // Agent 会话的实时状态来自项目级 WS（Sprint 13 的 agent.session 事件）。
  //
  // ⚠️ 阶段 1 的**临时**实时通路：只订阅**第一个**项目（最近有活动的那个）。
  // 规格 §7.2 说 Phase 4 会用一条 overview WS 覆盖全部项目；在那之前，
  // Island 页面**不能一条连接都没有** —— 2026-10-12 真机验证时抓到过这个回归：
  // 去掉项目级订阅后顶栏退回 `polling`、Agent 起会话 Island 不再自动变 RUNNING。
  // 所以这里先挂一条（与第一代默认显示第一张图纸的项目一致），Phase 4 换掉它。
  useProjectRealtime(
    projects[0]?.workspace_slug,
    projects[0]?.id,
    Boolean(projects[0]),
  );

  // Agent 会话的实时状态来自项目级 WS（Sprint 13 的 agent.session 事件）；
  // 阶段 4 会换成一条 overview WS 覆盖全部项目，这里的数据结构不变。
  const liveByProject = useAgentSessionStore((s) => s.byProject);

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy>
        <div className="h-[28px] w-1/3 rounded-full bg-[color:var(--color-paper-2)]" />
        <div className="h-[180px] rounded-[14px] bg-[color:var(--color-paper-2)]" />
        <div className="h-[180px] rounded-[14px] bg-[color:var(--color-paper-2)]" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-[14px] border border-[color:var(--color-rule)] bg-[color:var(--color-panel)] p-4 text-[13px] text-[color:var(--color-ink-2)]">
        工程数据加载失败。检查后端是否在运行（scripts\dev.cmd status）。
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-[14px] border border-dashed border-[color:var(--color-rule)] p-8 text-center">
        <div className="bp-uppercase text-[color:var(--color-ink-3)]">fig · empty</div>
        <p className="font-serif italic text-[22px] mt-2">还没有工程</p>
        <p className="text-[13px] text-[color:var(--color-ink-2)] mt-1">
          先创建一个项目，Island 会把它的阶段、进度、NOW / NEXT 投影在这里。
        </p>
      </div>
    );
  }

  return (
    <section
      aria-label="工程总览"
      data-testid="island-overview"
      className="rounded-[26px] border border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)] p-3 shadow-[0_1px_3px_rgba(27,26,23,0.07)]"
    >
      <div className="px-1 pb-2">
        <IslandHeader projectCount={projects.length} isPanel={isPanel} pinned={false} />
      </div>

      {/* 面板内滚动：高度由外层容器约束，这里只负责"多了就滚" */}
      <ul
        data-testid="island-project-list"
        className="max-h-[var(--island-list-max,420px)] space-y-3 overflow-y-auto overscroll-contain px-1 pb-1"
      >
        {projects.map((project) => (
          <li key={project.id}>
            <ProjectSummaryCard project={project} live={liveByProject[project.id] ?? null} />
          </li>
        ))}
      </ul>
    </section>
  );
}
