"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, MeasureLine } from "@/components/ui";
import { useMyIssues } from "@/features/issue";
import { useChrome } from "@/stores/chrome";
import { priorityLabel, type MyIssuesScope } from "@/types/issue";

/**
 * /me/issues — 「我的工作」（特色 B）：跨项目聚合指派给我 / 我创建的 Issue。
 * 外壳由 (protected)/layout 常驻提供，这里只声明本屏 chrome + 内容。
 */
const TABS: { value: MyIssuesScope; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "assigned", label: "指派给我" },
  { value: "created", label: "我创建的" },
];

export default function MyIssuesPage() {
  const [scope, setScope] = useState<MyIssuesScope>("all");
  const { data, isLoading, isError } = useMyIssues(scope);

  useChrome({ topbar: {}, hideAside: true });

  const issues = data?.results ?? [];

  return (
    <>
      <div className="mb-2">
        <h1 className="bp-display text-4xl text-[color:var(--color-ink)]">My work</h1>
        <p className="font-serif italic text-[14px] text-[color:var(--color-ink-3)] mt-1 tracking-[0.04em]">
          跨所有项目，属于你的任务
        </p>
      </div>

      <MeasureLine left="FIG · 01" right={`MY WORK · ${String(issues.length).padStart(2, "0")}`} />

      <div className="flex gap-2 mb-4" role="group" aria-label="筛选范围">
        {TABS.map((t) => (
          <Button
            key={t.value}
            variant={scope === t.value ? "primary" : "secondary"}
            size="sm"
            aria-pressed={scope === t.value}
            onClick={() => setScope(t.value)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 border border-[color:var(--color-rule)]" />
          ))}
        </div>
      )}

      {isError && (
        <Card className="max-w-3xl">
          <p className="text-[13px] text-[color:var(--color-ink-2)] p-4">
            无法加载「我的工作」。请稍后重试。
          </p>
        </Card>
      )}

      {!isLoading && !isError && issues.length === 0 && (
        <Card className="max-w-3xl">
          <p className="text-[13px] text-[color:var(--color-ink-2)] p-6 text-center">
            这里还空着。当有任务指派给你、或你创建了任务时，会汇总到这一页。
          </p>
        </Card>
      )}

      {!isLoading && issues.length > 0 && (
        <div className="border-t border-[color:var(--color-rule)] max-w-3xl">
          {issues.map((it) => (
            <div
              key={it.id}
              className="flex items-center gap-3 py-2.5 px-1 border-b border-dashed border-[color:var(--color-rule)]"
            >
              <span
                className="w-2 h-2 flex-shrink-0 rounded-full"
                style={{ background: it.state?.color ?? "var(--color-none)" }}
                aria-hidden
              />
              <span className="text-[11px] font-mono text-[color:var(--color-ink-3)] w-14 flex-shrink-0">
                #{it.sequence_id}
              </span>
              <Link
                href={`/w/${it.workspace_slug}/projects/${it.project}`}
                className="text-[13px] text-[color:var(--color-ink)] hover:text-[color:var(--color-accent)] truncate min-w-0 flex-1"
              >
                {it.title}
              </Link>
              <span className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-ink-3)] font-sans font-medium flex-shrink-0 hidden sm:inline">
                {it.project_name}
              </span>
              <span className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-ink-2)] font-sans font-medium flex-shrink-0 w-16 text-right">
                {priorityLabel(it.priority)}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
