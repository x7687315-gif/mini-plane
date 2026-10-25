"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { BulkActionBar } from "@/components/issue/BulkActionBar";
import { IssueDrawer, type IssueDrawerTab } from "@/components/issue/IssueDrawer";
import { DimProgress, SectionHead } from "@/components/ui/v2";
import { AnatomyPlate } from "@/components/anatomy/AnatomyPlate";
import {
  useAddStage,
  useDeleteProject,
  useMyProjects,
  usePlan,
  useProject,
  useProjectMembers,
  useProjectStates,
  useUpdateProject,
  useUpdateStage,
  useWorklogs,
} from "@/features/project";
import { useCreateIssue, useIssues, useLabels } from "@/features/task";
import { useChrome } from "@/stores/chrome";
import { useQuickLogStore } from "@/stores/quicklog";
import type { IssueState, ProjectMember, Worklog } from "@/types/project";
import type { Issue, Label } from "@/types/issue";

/**
 * 工程台 —— 个人/团队工程统一工作页（Phase 5，/projects/{pid} 规范路由）。
 *
 * 结构即模板（docs/refactor/ui-design/UI_TEMPLATE_V2_NOTES.md）：
 * 状态行（阶段·尺寸标注进度·NEXT·Agent，全内联无卡片）
 *   → 任务主区（文字过滤 + 搜索 + 就地新建 + 悬浮多选）
 *   → 路线（只读，点「调整」才出现编辑控件）
 *   → 日志（页缘笔记）。
 * 设置与删除收在页尾折叠；任务抽屉走 URL 语义（?issue= / ?tab=，可分享）。
 */

type StateFilter = "all" | "backlog" | "unstarted" | "started" | "completed" | "cancelled";

const GROUP_LABEL: Record<StateFilter, string> = {
  all: "全部",
  backlog: "待规划",
  unstarted: "待办",
  started: "进行中",
  completed: "已完成",
  cancelled: "已取消",
};

export default function ProjectWorkbenchPage() {
  return (
    <Suspense fallback={<div aria-hidden className="max-w-4xl px-9 py-7">
      <div className="h-8 w-56 bg-[color:var(--color-paper-2)]" />
      <div className="mt-6 h-10 border-y border-[color:var(--color-rule)]" />
      <div className="mt-4 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 border-b border-[color:var(--color-rule)]" />
        ))}
      </div>
    </div>}>
      <WorkbenchRoute />
    </Suspense>
  );
}

function WorkbenchRoute() {
  const { pid } = useParams<{ pid: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const issueId = searchParams.get("issue");
  const tab = (searchParams.get("tab") ?? "activity") as IssueDrawerTab;
  const view = searchParams.get("view") === "plate" ? "plate" : "bench";

  /** URL 即状态：抽屉与 tab 参数写回地址栏（可分享、可后退）。 */
  function handleParam(key: string, value: string | null) {
    const sp = new URLSearchParams(searchParams.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    const qs = sp.toString();
    router.replace(`/projects/${pid}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  const { data: project, isError: projectError } = useProject("", pid);
  const { data: states } = useProjectStates("", pid);
  const { data: members } = useProjectMembers("", pid);
  const { data: labels } = useLabels("", pid);
  const { data: taskPage } = useIssues("", pid, {});
  const { data: mine } = useMyProjects();

  useChrome({
    topbar: {
      project: project ? `${project.name} · ${project.identifier}` : undefined,
      role: project?.current_user_role,
    },
    hideAside: true,
  });

  if (projectError) {
    return (
      <div className="py-20 text-center text-[13px] text-[color:var(--color-ink-3)]">
        工程不存在或不可见。
      </div>
    );
  }

  return (
    <>
      <Workbench
        pid={pid}
        identifier={project?.identifier ?? ""}
        projectName={project?.name ?? ""}
        role={project?.current_user_role ?? null}
        states={states?.results ?? []}
        labels={labels?.results ?? []}
        members={members?.results ?? []}
        tasks={taskPage?.results ?? []}
        agentRunning={mine?.find((p) => p.id === pid)?.agent_running ?? false}
        view={view}
        onView={(v) => handleParam("view", v === "bench" ? null : v)}
        drawerIssueId={issueId}
        drawerTab={tab}
        onParam={handleParam}
      />
    </>
  );
}

function Workbench({
  pid,
  identifier,
  projectName,
  role,
  states,
  labels,
  members,
  tasks,
  agentRunning,
  view,
  onView,
  drawerIssueId,
  drawerTab,
  onParam,
}: {
  pid: string;
  identifier: string;
  projectName: string;
  role: number | null | undefined;
  states: IssueState[];
  labels: Label[];
  members: ProjectMember[];
  tasks: Issue[];
  agentRunning: boolean;
  view: "bench" | "plate";
  onView: (v: "bench" | "plate") => void;
  drawerIssueId: string | null;
  drawerTab: IssueDrawerTab;
  onParam: (key: string, value: string | null) => void;
}) {
  const router = useRouter();
  const openQuickLog = useQuickLogStore((s) => s.openWith);

  const { data: plan } = usePlan("", pid);
  const { data: logPage } = useWorklogs("", pid);
  const createIssue = useCreateIssue("", pid);
  const updateProject = useUpdateProject("", pid);
  const deleteProject = useDeleteProject("");
  const addStage = useAddStage("", pid);
  const updateStage = useUpdateStage("", pid);

  const logs: Worklog[] = logPage?.results ?? [];

  const [filter, setFilter] = useState<StateFilter>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [planEditing, setPlanEditing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nm, setNm] = useState<string | null>(null);
  const [ident, setIdent] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [newStage, setNewStage] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of tasks) c[t.state.group] = (c[t.state.group] ?? 0) + 1;
    return c;
  }, [tasks]);

  const visible = tasks.filter((t) => {
    if (filter !== "all" && t.state.group !== filter) return false;
    if (q && !t.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const stageName = plan?.current_stage?.name ?? null;
  const pct = plan?.progress ?? 0;

  const toggleSel = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="max-w-4xl">
      {/* 头：serif 名 + 安静链接 */}
      <div className="flex items-baseline">
        <h1 className="font-serif italic text-[28px] text-[color:var(--color-ink)]">
          {projectName || "…"}
        </h1>
        <span className="ml-3 font-mono text-[11px] text-[color:var(--color-ink-3)]">
          {identifier} · {tasks.length} 任务
        </span>
        <span className="ml-auto flex gap-4">
          <button
            type="button"
            onClick={() => onView("bench")}
            className={view === "bench" ? "text-[11.5px] text-[color:var(--color-accent)]" : "text-[11.5px] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-accent)]"}
          >
            工作台
          </button>
          <button
            type="button"
            onClick={() => onView("plate")}
            className={view === "plate" ? "text-[11.5px] text-[color:var(--color-accent)]" : "text-[11.5px] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-accent)]"}
          >
            图纸
          </button>
          {view === "bench" && (
            <a href="#wb-logs" className="text-[11.5px] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-accent)]">
              日志
            </a>
          )}
          {view === "bench" && (
            <button
              type="button"
              className="text-[11.5px] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-accent)]"
              onClick={() => setSettingsOpen((v) => !v)}
            >
              设置
            </button>
          )}
        </span>
      </div>

      {/* 状态行：全内联，无卡片 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-y border-[color:var(--color-rule)] py-2.5 text-[12px]">
        <span className="text-[color:var(--color-ink-2)]">
          阶段 <b className="font-medium text-[color:var(--color-ink)]">{stageName ?? "未设"}</b>
        </span>
        <DimProgress value={pct} className="w-[150px]" />
        <span className="font-mono text-[11px]">{pct}%</span>
        <span className="text-[color:var(--color-ink-2)]">
          <b className="mr-1.5 font-medium text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
            next
          </b>
          {plan?.next_stage?.name ?? "—"}
        </span>
        {agentRunning && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.1em] text-[color:var(--color-success)]">
            <i
              className="inline-block h-[5px] w-[5px] rounded-full bg-[color:var(--color-success)]"
              aria-hidden
            />
            AGENT·RUNNING
          </span>
        )}
        <span className="ml-auto">
          <button type="button" className="v2-ia" onClick={() => openQuickLog(pid)}>
            <span className="mk" aria-hidden>✎</span>记一笔
          </button>
        </span>
      </div>

      {view === "plate" ? (
        <div className="mt-4">
          <AnatomyPlate
            identifier={identifier}
            stages={plan?.stages ?? []}
            tasks={tasks}
            logs={logPage?.results ?? []}
            states={states}
            agentRunning={agentRunning}
            nextStageName={plan?.next_stage?.name ?? null}
            onOpenTask={(id) => onParam("issue", id)}
          />
        </div>
      ) : (
      <>
      {/* 任务 */}
      <SectionHead t="任务" n={tasks.length} />
      <div className="flex flex-wrap items-baseline gap-4">
        {(["all", "backlog", "unstarted", "started", "completed", "cancelled"] as StateFilter[]).map(
          (f) => (
            <button
              key={f}
              type="button"
              className="v2-fchip"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {GROUP_LABEL[f]}
              <b>{f === "all" ? tasks.length : (counts[f] ?? 0)}</b>
            </button>
          ),
        )}
        <span className="ml-auto flex items-center gap-3 text-[color:var(--color-ink-3)]">
          <button
            type="button"
            className="v2-ia"
            onClick={() => {
              setNewTaskOpen(true);
              requestAnimationFrame(() =>
                document
                  .getElementById("wb-newtask-input")
                  ?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
              );
            }}
          >
            <span className="mk" aria-hidden>＋</span>新任务
          </button>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索任务"
            aria-label="搜索任务"
            className="w-32 border-0 border-b border-[color:var(--color-rule)] bg-transparent py-0.5 text-[12px] outline-none focus:border-[color:var(--color-accent)]"
          />
        </span>
      </div>

      <div className="mt-1">
        {visible.length > 0 && !visible.some((t) => t.state.group === "started") && (
          <p className="px-2.5 py-2 text-[11.5px] text-[color:var(--color-ink-3)]">
            没有进行中的任务——把一条推进「进行中」，它会出现在首页的「继续」里。
          </p>
        )}
        {visible.map((t) => (
          <div
            key={t.id}
            role="button"
            tabIndex={0}
            onClick={() => onParam("issue", t.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onParam("issue", t.id);
            }}
            className={`v2-row group ${
              t.state.group === "started"
                ? "border-l-2 border-l-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)]"
                : ""
            }`}
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5 flex-none opacity-0 accent-[color:var(--color-accent)] group-hover:opacity-100 checked:opacity-100"
              checked={selected.has(t.id)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggleSel(t.id)}
              aria-label={`选择 ${t.title}`}
            />
            <span className="id">
              {identifier}-{t.sequence_id}
            </span>
            <span className="text-[13px]">{t.title}</span>
            {t.stage && (
              <span className="hidden text-[10px] text-[color:var(--color-ink-3)] sm:inline">
                · {t.stage.name}
              </span>
            )}
            <span className="ml-auto font-medium text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-ink-3)]">
              {t.priority === "none" ? "" : t.priority}
            </span>
            <span className="arr" aria-hidden>
              ▸
            </span>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="px-2.5 py-3 text-[12px] text-[color:var(--color-ink-3)]">
            没有符合条件的任务。
          </p>
        )}
      </div>

      {newTaskOpen ? (
        <div className="v2-inline-form mt-1">
          <span className="font-mono text-[12px] text-[color:var(--color-ink-3)]" aria-hidden>
            ＋
          </span>
          <input
            autoFocus
            id="wb-newtask-input"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTask.trim()) {
                createIssue.mutate(
                  { title: newTask.trim() },
                  { onSuccess: () => setNewTaskOpen(false) },
                );
              }
              if (e.key === "Escape") setNewTaskOpen(false);
            }}
            placeholder="任务标题，⏎ 完成"
            aria-label="新任务标题"
          />
          <span className="font-mono text-[9.5px] tracking-[0.1em] text-[color:var(--color-ink-3)]">
            ⏎ 创建
          </span>
        </div>
      ) : (
        <button type="button" className="v2-newline mt-1" onClick={() => setNewTaskOpen(true)}>
          <span className="font-mono text-[13px]" aria-hidden>
            ＋
          </span>
          新任务
        </button>
      )}

      {selected.size > 0 && (
        <BulkActionBar
          slug=""
          projectId={pid}
          identifier={identifier}
          selectedIds={[...selected]}
          states={states}
          labels={labels}
          members={members}
          onClearSelection={() => setSelected(new Set())}
        />
      )}

      {/* 路线：只读；调整才出现编辑控件 */}
      <SectionHead t="路线" />
      <div className="relative ml-2 border-l border-[color:var(--color-rule)] pl-6">
        {(plan?.stages ?? []).length === 0 && (
          <p className="py-2 text-[12px] text-[color:var(--color-ink-3)]">
            还没有阶段——点「调整」添加第一个阶段。
          </p>
        )}
        {(plan?.stages ?? []).map((s) => (
          <div key={s.id} className="relative flex items-baseline gap-3 py-2 text-[12.5px]">
            <span
              className={`absolute -left-[27px] top-[15px] h-[9px] w-[9px] rounded-full border ${
                s.is_current
                  ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)] shadow-[0_0_0_3px_var(--color-accent-soft)]"
                  : "border-[color:var(--color-ink-3)] bg-[color:var(--color-paper)]"
              }`}
              aria-hidden
            />
            <span className="w-6 font-mono text-[10px] text-[color:var(--color-ink-3)]">
              {String(s.order).padStart(2, "0")}
            </span>
            <span
              className={`w-40 ${s.is_current ? "font-medium text-[color:var(--color-accent)]" : ""}`}
            >
              {s.name}
              {s.is_current && <span className="ml-1.5 text-[10px]">· 当前</span>}
            </span>
            {planEditing ? (
              <input
                defaultValue={s.progress}
                key={`${s.id}-${s.progress}`}
                onBlur={(e) => {
                  const v = Math.min(100, Math.max(0, Number(e.target.value)));
                  if (!Number.isNaN(v) && v !== s.progress)
                    updateStage.mutate({ stageId: s.id, payload: { progress: v } });
                }}
                aria-label={`${s.name} 进度`}
                className="w-12 border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] px-1.5 py-0.5 font-mono text-[11px]"
              />
            ) : (
              <>
                <DimProgress value={s.progress} className="max-w-[190px]" />
                <span className="font-mono text-[10.5px] text-[color:var(--color-ink-2)]">
                  {s.progress}%
                </span>
              </>
            )}
          </div>
        ))}
        {planEditing && (
          <div className="relative flex items-baseline gap-3 py-2 text-[12.5px]">
            <span
              className="absolute -left-[27px] top-[15px] h-[9px] w-[9px] rounded-full border border-dashed border-[color:var(--color-ink-3)]"
              aria-hidden
            />
            <span className="w-6 font-mono text-[10px] text-[color:var(--color-ink-3)]">＋</span>
            <input
              value={newStage}
              onChange={(e) => setNewStage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newStage.trim()) {
                  addStage.mutate({ name: newStage.trim() }, { onSuccess: () => setNewStage("") });
                }
              }}
              placeholder="添加阶段…"
              aria-label="新阶段名称"
              className="w-40 border-0 border-b border-[color:var(--color-rule)] bg-transparent outline-none focus:border-[color:var(--color-accent)]"
            />
            <span className="text-[11px] text-[color:var(--color-ink-3)]">⏎ 添加</span>
          </div>
        )}
      </div>
      <div className="mt-1">
        <button type="button" className="v2-ia" onClick={() => setPlanEditing((v) => !v)}>
          <span className="mk" aria-hidden>▸</span>
          {planEditing ? "完成调整" : "调整"}
        </button>
      </div>

      </>
      )}

      {/* 日志：页缘笔记（两视图共用） */}
      <div id="wb-logs">
        <SectionHead t="日志" n={logs.length} />
        {logs.length === 0 && (
          <p className="py-2 text-[12px] text-[color:var(--color-ink-3)]">
            还没有日志——顶栏「✎ 记一笔」随时记下今天做了什么。
          </p>
        )}
        {logs.map((w) => (
          <div key={w.id} className="flex gap-4 border-b border-[color:var(--color-rule)] py-2.5">
            <span className="w-11 flex-none pt-0.5 font-mono text-[10px] text-[color:var(--color-ink-3)]">
              {w.date}
            </span>
            <div className="min-w-0">
              <b className="text-[12.5px] font-medium">{w.title}</b>
              <p className="mt-0.5 line-clamp-2 text-[11.5px] text-[color:var(--color-ink-2)]">
                {w.summary}
              </p>
            </div>
            <span
              className={`ml-auto flex-none pt-0.5 font-mono text-[8.5px] tracking-[0.14em] ${
                w.source === "agent"
                  ? "text-[color:var(--color-accent)]"
                  : "text-[color:var(--color-ink-3)]"
              }`}
            >
              {w.source.toUpperCase()}
            </span>
          </div>
        ))}
      </div>

      {/* 设置：页尾折叠（含危险操作） */}
      {settingsOpen && (
        <div className="mt-6 border border-dashed border-[color:var(--color-rule)] p-4">
          <p className="mb-3 font-medium text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-ink-3)]">
            工程设置
          </p>
          <div className="mb-2.5 flex items-center gap-3">
            <span className="w-14 flex-none font-medium text-[9px] uppercase tracking-[0.18em] text-[color:var(--color-ink-3)]">
              名称
            </span>
            <input
              value={nm ?? projectName}
              onChange={(e) => setNm(e.target.value)}
              className="w-64 border-0 border-b border-[color:var(--color-rule)] bg-transparent py-0.5 text-[13px] outline-none focus:border-[color:var(--color-accent)]"
              aria-label="工程名称"
            />
          </div>
          <div className="mb-3 flex items-center gap-3">
            <span className="w-14 flex-none font-medium text-[9px] uppercase tracking-[0.18em] text-[color:var(--color-ink-3)]">
              标识符
            </span>
            <input
              value={ident ?? identifier}
              onChange={(e) => setIdent(e.target.value)}
              className="w-24 border-0 border-b border-[color:var(--color-rule)] bg-transparent py-0.5 font-mono text-[12px] outline-none focus:border-[color:var(--color-accent)]"
              aria-label="标识符"
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="v2-ia disabled:opacity-40"
              disabled={updateProject.isPending}
              onClick={() => {
                const payload: Record<string, string> = {};
                if (nm != null && nm.trim() && nm !== projectName) payload.name = nm.trim();
                if (ident != null && ident.trim() && ident !== identifier)
                  payload.identifier = ident.trim();
                if (Object.keys(payload).length) updateProject.mutate(payload);
              }}
            >
              <span className="mk" aria-hidden>▸</span>保存
            </button>
            <button
              type="button"
              className="text-[11.5px] text-[color:var(--color-urgent)] hover:underline"
              onClick={() => {
                if (confirm(`删除工程「${projectName}」？其任务、日志与计划将一并删除。`)) {
                  deleteProject.mutate(pid, { onSuccess: () => router.push("/") });
                }
              }}
            >
              删除工程
            </button>
          </div>
        </div>
      )}

      {/* 任务抽屉（URL 语义 ?issue= / ?tab=） */}
      <IssueDrawer
        open={Boolean(drawerIssueId)}
        onClose={() => onParam("issue", null)}
        slug=""
        projectId={pid}
        identifier={identifier}
        issueId={drawerIssueId}
        states={states}
        role={role}
        tab={drawerTab}
        onTabChange={(t) => onParam("tab", t)}
      />
    </div>
  );
}
