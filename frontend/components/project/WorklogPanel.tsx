"use client";

import { useState } from "react";
import { Button, MeasureLine } from "@/components/ui";
import { useAddWorklog, useDeleteWorklog, useWorklogs } from "@/features/project";

/**
 * Engineering Log 面板（Sprint 11，PRODUCT_REFACTOR_PLAN §10/§11）。
 *
 * Task 是计划、Worklog 是证据：这里按日期倒序展示"某天实际做了什么 / 结果 / 结论 /
 * 下一步 / 阻塞"。可写角色可记一条新日志、删除自己的日志条目。
 * 支持「仅今天」过滤（?date=today）。
 */
export function WorklogPanel({
  slug,
  projectId,
  canWrite,
}: {
  slug: string;
  projectId: string;
  canWrite: boolean;
}) {
  const [todayOnly, setTodayOnly] = useState(false);
  const { data, isLoading } = useWorklogs(slug, projectId, todayOnly ? "today" : undefined);
  const addWorklog = useAddWorklog(slug, projectId);
  const deleteWorklog = useDeleteWorklog(slug, projectId);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [nextStep, setNextStep] = useState("");

  const logs = data?.results ?? [];

  const handleAdd = async () => {
    if (!title.trim() || !summary.trim()) return;
    await addWorklog.mutateAsync({
      title: title.trim(),
      summary: summary.trim(),
      conclusion: conclusion.trim() || undefined,
      next_step: nextStep.trim() || undefined,
    });
    setTitle("");
    setSummary("");
    setConclusion("");
    setNextStep("");
  };

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between gap-3">
        <MeasureLine left="FIG · LOG" right={`ENGINEERING LOG · ${String(logs.length).padStart(2, "0")}`} />
      </div>

      <div className="flex gap-2 my-3">
        <Button
          variant={todayOnly ? "primary" : "secondary"}
          size="sm"
          aria-pressed={todayOnly}
          onClick={() => setTodayOnly((v) => !v)}
        >
          仅今天
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="h-16 border border-[color:var(--color-rule)]" />
          ))}
        </div>
      )}

      {!isLoading && logs.length === 0 && (
        <p className="py-4 text-[12px] text-[color:var(--color-ink-3)]">
          还没有工程日志。{canWrite ? "在下方记下今天实际做了什么。" : ""}
        </p>
      )}

      {!isLoading && logs.length > 0 && (
        <div className="border-t border-[color:var(--color-rule)]">
          {logs.map((w) => (
            <article
              key={w.id}
              className="py-3 px-2 border-b border-dashed border-[color:var(--color-rule)]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-3 min-w-0">
                  <span className="font-mono text-[10px] text-[color:var(--color-ink-3)] flex-shrink-0">
                    {w.date}
                  </span>
                  <h3 className="text-[13px] font-medium text-[color:var(--color-ink)] truncate">
                    {w.title}
                  </h3>
                  {w.stage_name && (
                    <span className="text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-accent)] font-sans font-medium flex-shrink-0">
                      {w.stage_name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)] font-sans font-medium">
                    {w.source}
                  </span>
                  {canWrite && (
                    <button
                      type="button"
                      aria-label={`删除日志 ${w.title}`}
                      onClick={() => void deleteWorklog.mutateAsync(w.id)}
                      className="text-[10px] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-urgent)]"
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>

              <p className="mt-1.5 text-[12px] leading-relaxed text-[color:var(--color-ink-2)] whitespace-pre-wrap">
                {w.summary}
              </p>
              {(w.conclusion || w.next_step || w.blocker) && (
                <dl className="mt-2 space-y-1 text-[11px]">
                  {w.conclusion && (
                    <div className="flex gap-2">
                      <dt className="w-12 flex-shrink-0 text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)] font-sans font-medium pt-0.5">
                        结论
                      </dt>
                      <dd className="text-[color:var(--color-ink-2)]">{w.conclusion}</dd>
                    </div>
                  )}
                  {w.next_step && (
                    <div className="flex gap-2">
                      <dt className="w-12 flex-shrink-0 text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)] font-sans font-medium pt-0.5">
                        下一步
                      </dt>
                      <dd className="text-[color:var(--color-ink-2)]">{w.next_step}</dd>
                    </div>
                  )}
                  {w.blocker && (
                    <div className="flex gap-2">
                      <dt className="w-12 flex-shrink-0 text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-urgent)] font-sans font-medium pt-0.5">
                        阻塞
                      </dt>
                      <dd className="text-[color:var(--color-urgent)]">{w.blocker}</dd>
                    </div>
                  )}
                </dl>
              )}
            </article>
          ))}
        </div>
      )}

      {canWrite && (
        <div className="mt-4 border border-[color:var(--color-rule)] p-3 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="日志标题（如：TTS 长文本实验）"
            aria-label="日志标题"
            className="w-full bg-transparent border border-[color:var(--color-rule)] px-2.5 py-1.5 text-[12px] text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-accent)]"
          />
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="完成内容（今天实际做了什么）"
            aria-label="完成内容"
            rows={2}
            className="w-full bg-transparent border border-[color:var(--color-rule)] px-2.5 py-1.5 text-[12px] text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-accent)] resize-y"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              value={conclusion}
              onChange={(e) => setConclusion(e.target.value)}
              placeholder="结论（可选）"
              aria-label="结论"
              className="bg-transparent border border-[color:var(--color-rule)] px-2.5 py-1.5 text-[12px] text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-accent)]"
            />
            <input
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              placeholder="下一步（可选）"
              aria-label="下一步"
              className="bg-transparent border border-[color:var(--color-rule)] px-2.5 py-1.5 text-[12px] text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-accent)]"
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={!title.trim() || !summary.trim() || addWorklog.isPending}
            onClick={() => void handleAdd()}
          >
            记一条日志
          </Button>
        </div>
      )}
    </section>
  );
}
