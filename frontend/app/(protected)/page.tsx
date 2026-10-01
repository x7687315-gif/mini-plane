"use client";

import Link from "next/link";
import { Button, Card, MeasureLine } from "@/components/ui";
import { ArrowRightIcon } from "@/components/icons";
import { useMyProjects } from "@/features/project";
import { useChrome } from "@/stores/chrome";
import type { ProjectEngineering } from "@/types/project";

/**
 * My Engineering —— 个人模式默认首页（Sprint 09，PRODUCT_REFACTOR_PLAN §7）。
 *
 * 产品中心从"任务"移到"工程"：打开第一眼是**我的所有工程**（跨工作区聚合），
 * 而不是 Workspace 列表；Workspace 降级为协作基础设施，入口移到 /workspaces。
 * 数据来自单条聚合查询 GET /api/v1/projects/mine/（无 N+1）。
 */
export default function MyEngineeringPage() {
  const { data, isLoading, isError } = useMyProjects();
  const projects = data ?? [];

  useChrome({ topbar: {}, hideAside: true });

  const active = projects.length;
  const openTasks = projects.reduce((n, p) => n + p.open_tasks, 0);
  const inFlight = projects.reduce((n, p) => n + p.started_tasks, 0);
  const todayLogs = projects.reduce((n, p) => n + (p.today_logs ?? 0), 0);

  return (
    <>
      <div className="flex items-end justify-between mb-2">
        <div>
          <h1 className="bp-display text-4xl text-[color:var(--color-ink)]">My Engineering</h1>
          <p className="font-serif italic text-[14px] text-[color:var(--color-ink-3)] mt-1 tracking-[0.04em]">
            我的工程总览 · 阶段 / 进度 / 现在与下一步
          </p>
        </div>
        <Link href="/workspaces">
          <Button variant="secondary" size="sm">管理工作区</Button>
        </Link>
      </div>

      <MeasureLine
        left="FIG · 00"
        right={`${String(active).padStart(2, "0")} PROJECTS · ${String(openTasks).padStart(2, "0")} OPEN`}
      />

      <div className="flex gap-6 mb-6 text-[11px] uppercase tracking-[0.18em] font-sans font-medium text-[color:var(--color-ink-2)]">
        <span>
          <b className="text-[color:var(--color-ink)] text-[16px] mr-1">{active}</b> 活跃工程
        </span>
        <span>
          <b className="text-[color:var(--color-ink)] text-[16px] mr-1">{openTasks}</b> 待办任务
        </span>
        <span>
          <b className="text-[color:var(--color-ink)] text-[16px] mr-1">{inFlight}</b> 进行中
        </span>
        <span>
          <b className="text-[color:var(--color-ink)] text-[16px] mr-1">{todayLogs}</b> 今日日志
        </span>
      </div>

      {isLoading && <EngineeringSkeleton />}

      {isError && (
        <Card>
          <p className="text-[13px] text-[color:var(--color-ink-2)] p-4">
            无法加载我的工程。请确认后端已启动后重试。
          </p>
        </Card>
      )}

      {!isLoading && !isError && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px w-12 bg-[color:var(--color-rule)]" />
            <span className="bp-hint">fig · empty</span>
            <div className="h-px w-12 bg-[color:var(--color-rule)]" />
          </div>
          <h2 className="font-serif italic text-[28px] text-[color:var(--color-ink)]">
            No engineering yet
          </h2>
          <p className="mt-2 text-[13px] text-[color:var(--color-ink-2)] max-w-md">
            还没有任何工程。先去创建一个工作区与项目，你的工程会汇总到这里。
          </p>
          <div className="mt-8">
            <Link href="/workspaces">
              <Button variant="primary">去创建工作区</Button>
            </Link>
          </div>
        </div>
      )}

      {projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p) => (
            <EngineeringCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </>
  );
}

/** 单张"工程图纸"卡片：阶段 / 进度条 / NOW / NEXT。 */
function EngineeringCard({ project: p }: { project: ProjectEngineering }) {
  const pct = Math.round((p.progress ?? 0) * 100);
  return (
    <Link href={`/w/${p.workspace_slug}/projects/${p.id}`} className="block group">
      <div className="relative border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] p-5 h-full transition-colors duration-[var(--duration-fast)] group-hover:border-[color:var(--color-ink-2)]">
        <span
          className="absolute left-0 top-0 bottom-0 w-[2px] bg-transparent group-hover:bg-[color:var(--color-accent)] transition-colors"
          aria-hidden
        />
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="font-mono text-[10px] text-[color:var(--color-ink-3)]">
              {p.identifier} · /{p.workspace_slug}
            </div>
            <div className="font-serif italic text-[22px] leading-tight text-[color:var(--color-ink)] truncate">
              {p.name}
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-[0.16em] font-sans font-medium text-[color:var(--color-ink-2)] flex-shrink-0">
            {p.current_stage ?? "—"}
          </span>
        </div>

        {/* 进度：细蓝图条，百分比只是辅助信息 */}
        <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-[0.18em] font-sans font-medium text-[color:var(--color-ink-3)]">
          <span>progress</span>
          <span>{pct}%</span>
        </div>
        <div className="h-[6px] border border-[color:var(--color-rule)] mb-4" aria-hidden>
          <div
            className="h-full bg-[color:var(--color-accent)]"
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>

        <dl className="space-y-2 text-[12px]">
          <div className="flex gap-2">
            <dt className="w-12 flex-shrink-0 text-[9px] uppercase tracking-[0.18em] font-sans font-medium text-[color:var(--color-accent)] pt-0.5">
              now
            </dt>
            <dd className="text-[color:var(--color-ink)] truncate">{p.now_task ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-12 flex-shrink-0 text-[9px] uppercase tracking-[0.18em] font-sans font-medium text-[color:var(--color-ink-3)] pt-0.5">
              next
            </dt>
            <dd className="text-[color:var(--color-ink-2)] truncate">{p.next_task ?? "—"}</dd>
          </div>
        </dl>

        <div className="mt-4 pt-3 border-t border-dashed border-[color:var(--color-rule)] flex items-center justify-between text-[9px] uppercase tracking-[0.2em] font-sans font-medium text-[color:var(--color-ink-3)]">
          <span>
            {p.open_tasks} open · {p.done_tasks} done
          </span>
          <span className="text-[color:var(--color-accent)] opacity-0 group-hover:opacity-100 transition-opacity">
            <ArrowRightIcon size={14} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function EngineeringSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="border border-[color:var(--color-rule)] p-5 h-[210px]">
          <div className="h-3 w-20 bg-[color:var(--color-paper-2)] mb-3" />
          <div className="h-6 w-40 bg-[color:var(--color-paper-2)] mb-5" />
          <div className="h-[6px] w-full bg-[color:var(--color-paper-2)] mb-5" />
          <div className="h-3 w-full bg-[color:var(--color-paper-2)] mb-2" />
          <div className="h-3 w-3/4 bg-[color:var(--color-paper-2)]" />
        </div>
      ))}
    </div>
  );
}
