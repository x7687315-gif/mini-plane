"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { DimProgress, SectionHead, localDate } from "@/components/ui/v2";
import { useMyProjects, useCreatePersonalProject } from "@/features/project";
import { useChrome } from "@/stores/chrome";
import { formatDate } from "@/lib/time";
import type { ProjectEngineering } from "@/types/project";

/**
 * My Engineering —— 个人版首页（Phase 5，docs/refactor/ui-design/UI_TEMPLATE_V2_NOTES.md）。
 *
 * 首页回答「现在做什么」：
 * - 继续：各工程正在做的 NOW 任务，整行可点（直达任务抽屉）；
 * - 工程：行式索引（尺寸标注线进度 + NOW + Agent），整行可点进入工程台；
 * - 新的工程：列表末尾的空白横线即创建入口（只填名称，identifier 自动生成）。
 * 空态 = 「初见」上手屏：一句话 + 一条手写横线，全程不出现协作概念。
 */

export default function MyEngineeringPage() {
  const { data, isLoading } = useMyProjects();
  const projects = data ?? [];

  useChrome({ topbar: {}, hideAside: true });

  const router = useRouter();
  const create = useCreatePersonalProject();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const submitCreate = () => {
    const n = name.trim();
    if (!n || create.isPending) return;
    create.mutate(n, { onSuccess: (p) => router.push(`/projects/${p.id}`) });
  };

  const goOn = projects.filter((p) => p.now_task != null);

  return (
    <AppShell>
      {projects.length === 0 ? (
        isLoading ? (
          <HomeSkeleton />
        ) : (
          /* ── 初见：上手屏（唯一动作 = 建第一个工程）── */
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="w-[430px] text-center">
              <p className="font-mono text-[9px] tracking-[0.2em] text-[color:var(--color-ink-3)]" suppressHydrationWarning>
                PLANE MINI · {localDate()}
              </p>
              <h1 className="mt-6 font-serif italic text-[30px] text-[color:var(--color-ink)]">
                从一个工程开始。
              </h1>
              <p className="mt-1.5 text-[12.5px] text-[color:var(--color-ink-2)]">
                写下名称，回车即建——不需要工作区，不需要角色。
              </p>
              <div className="v2-wline mt-8 text-left">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitCreate();
                  }}
                  placeholder="工程名称，如：毕业设计"
                  aria-label="工程名称"
                  className="text-center"
                />
              </div>
              <div className="mt-2 flex justify-center gap-5 font-mono text-[9.5px] tracking-[0.1em] text-[color:var(--color-ink-3)]">
                <span>⏎ 创建并进入</span>
                <span>数据只留在本机</span>
                <span>之后随时可加入协作</span>
              </div>
              {create.isError && (
                <p className="mt-3 text-[11.5px] text-[color:var(--color-urgent)]" role="alert">
                  创建失败，请重试
                </p>
              )}
            </div>
          </div>
        )
      ) : (
        <>
          <div className="flex items-baseline">
            <h1 className="h-serif font-serif italic text-[28px] text-[color:var(--color-ink)]">
              My Engineering
            </h1>
            <span
              className="ml-auto font-mono text-[10px] tracking-[0.14em] text-[color:var(--color-ink-3)]"
              suppressHydrationWarning
            >
              {localDate()}
            </span>
          </div>

          {goOn.length > 0 && (
            <>
              <SectionHead t="继续" n={goOn.length} />
              <div>
                {goOn.map((p) => (
                  <ProjectRow key={p.id} p={p} href={`/projects/${p.id}?issue=${p.now_task_id ?? ""}`} />
                ))}
              </div>
            </>
          )}

          <SectionHead t="工程" n={projects.length} />
          <div>
            {projects.map((p) => (
              <ProjectRow key={p.id} p={p} href={`/projects/${p.id}`} />
            ))}
          </div>

          {creating ? (
            <div className="v2-inline-form mt-1.5">
              <span className="font-mono text-[12px] text-[color:var(--color-ink-3)]" aria-hidden>
                ＋
              </span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitCreate();
                  if (e.key === "Escape") {
                    setName("");
                    setCreating(false);
                  }
                }}
                placeholder="工程名称，如：毕业设计"
                aria-label="新工程名称"
              />
              <span className="font-mono text-[9.5px] tracking-[0.1em] text-[color:var(--color-ink-3)]">
                ⏎ 创建
              </span>
            </div>
          ) : (
            <button type="button" className="v2-newline mt-1.5" onClick={() => setCreating(true)}>
              <span className="font-mono text-[13px]" aria-hidden>
                ＋
              </span>
              新的工程
            </button>
          )}
          {create.isError && (
            <p className="mt-2 text-[11.5px] text-[color:var(--color-urgent)]" role="alert">
              创建失败，请重试
            </p>
          )}
        </>
      )}
    </AppShell>
  );
}

/** 继续行 / 工程索引行共用：整行即按钮，hover 浮现 ▸。 */
function ProjectRow({ p, href }: { p: ProjectEngineering; href: string }) {
  const pct = Math.min(100, Math.max(0, Math.round(p.progress ?? 0)));
  const personal = p.workspace_slug == null;
  return (
    <Link href={href} className="v2-row group block">
      <div className="flex w-full items-baseline gap-3">
        <span className="font-mono text-[10.5px] text-[color:var(--color-ink-3)]">
          {p.identifier}
          {personal ? " · 个人" : ` · /${p.workspace_slug}`}
        </span>
        <span className="font-serif italic text-[17px] text-[color:var(--color-ink)]">{p.name}</span>
        <span className="ml-auto text-[11.5px] text-[color:var(--color-ink-2)]">
          {p.current_stage ?? "尚未规划"}
        </span>
        <span className="arr" aria-hidden>
          ▸
        </span>
      </div>
      <div className="mt-1.5 flex w-full items-center gap-3.5">
        <DimProgress value={pct} className="max-w-[210px]" />
        <span className="font-mono text-[11px] text-[color:var(--color-ink)]">{pct}%</span>
        {p.now_task != null ? (
          <span className="text-[11.5px] text-[color:var(--color-ink-2)]">
            <b className="mr-1.5 font-medium text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-accent)]">
              now
            </b>
            {p.now_task}
          </span>
        ) : (
          <span className="text-[11.5px] text-[color:var(--color-ink-3)]">还没有进行中的任务</span>
        )}
        {p.agent_running && (
          <span className="agent-run inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.1em] text-[color:var(--color-success)]">
            <i className="inline-block h-[5px] w-[5px] rounded-full bg-[color:var(--color-success)]" aria-hidden />
            AGENT·RUNNING
          </span>
        )}
        <span className="ml-auto flex items-center gap-3.5 text-[11px] text-[color:var(--color-ink-3)]">
          <span>
            {p.open_tasks} 待办 · {p.done_tasks} 完成
          </span>
          <span>最近 {p.last_activity ? formatDate(p.last_activity) : "—"}</span>
        </span>
      </div>
    </Link>
  );
}

function HomeSkeleton() {
  return (
    <div aria-hidden>
      <div className="h-8 w-64 bg-[color:var(--color-paper-2)]" />
      <div className="mt-8 space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-12 border-b border-[color:var(--color-rule)]" />
        ))}
      </div>
    </div>
  );
}
