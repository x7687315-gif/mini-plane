"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createWorklog } from "@/features/project/api";
import { useMyProjects } from "@/features/project/hooks";
import { useQuickLogStore } from "@/stores/quicklog";
import { toast } from "@/stores/toast";
import { RuledField } from "@/components/ui/v2";

/**
 * QuickLogModal — 全局「记一笔」（Phase 5，Worklog 快速记录的唯一入口）。
 *
 * 设计（docs/refactor/ui-design/UI_TEMPLATE_V2_NOTES.md §3）：
 * - 默认只露两个字段：标题 + 完成了什么（Worklog 的最小诚实记录）；
 * - 结论 / 下一步 / 阻塞收进「补全」展开——同一 Worklog 实体、同一端点，
 *   快速与完整不产生两套数据流；
 * - 任意页面可呼出（顶栏 ✎ 或 ⌘/Ctrl+Shift+L）；工程台打开时预选当前工程。
 *
 * 实现说明：open 时才挂载内层表单组件——字段状态随挂载自然初始化，
 * 不需要「打开时重置」的 effect（react-hooks/set-state-in-effect）。
 */

export function QuickLogModal() {
  const open = useQuickLogStore((s) => s.open);
  const presetPid = useQuickLogStore((s) => s.projectId);
  const close = useQuickLogStore((s) => s.close);

  // ⌘/Ctrl+Shift+L 全局呼出（Cmd+L 是浏览器地址栏，刻意避开）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        useQuickLogStore.getState().openWith(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  return <QuickLogForm presetPid={presetPid} onClose={close} />;
}

function QuickLogForm({
  presetPid,
  onClose,
}: {
  presetPid: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: projects } = useMyProjects();
  const list = projects ?? [];

  const [pidChoice, setPidChoice] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [more, setMore] = useState(false);
  const [conclusion, setConclusion] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [blocker, setBlocker] = useState("");

  // 默认工程：预选 > 第一个（选择权在用户，绝不猜）
  const pid =
    pidChoice ??
    (presetPid && list.some((p) => p.id === presetPid)
      ? presetPid
      : (list[0]?.id ?? ""));
  const stage = list.find((p) => p.id === pid)?.current_stage ?? null;

  const m = useMutation({
    mutationFn: () =>
      createWorklog("", pid, {
        title: title.trim(),
        summary: summary.trim(),
        conclusion: conclusion.trim() || undefined,
        next_step: nextStep.trim() || undefined,
        blocker: blocker.trim() || undefined,
        source: "manual",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] }); // worklogs / mine 前缀一并失效
      toast.success("已记录今天的进展");
      onClose();
    },
    onError: () => {
      toast.error("记录失败，请重试");
    },
  });

  // 弹层内：⌘/Ctrl+Enter 提交，Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        document.querySelector<HTMLButtonElement>("[data-ql-submit]")?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => {
    if (!pid || !title.trim() || !summary.trim() || m.isPending) return;
    m.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      role="dialog"
      aria-modal="true"
      aria-label="记一笔"
    >
      <div className="absolute inset-0 bg-[rgba(27,26,23,0.34)]" onClick={onClose} aria-hidden />
      <div className="relative w-[470px] max-w-[92vw] border border-[color:var(--color-ink)] bg-[color:var(--color-paper)] shadow-[4px_4px_0_rgba(27,26,23,0.08)]">
        <div className="flex items-baseline gap-3 border-b border-[color:var(--color-rule)] px-4 pb-2.5 pt-3">
          <span className="font-serif italic text-[17px] text-[color:var(--color-ink)]">记一笔</span>
          <span className="ml-auto font-mono text-[9.5px] tracking-[0.1em] text-[color:var(--color-ink-3)]">
            {list.find((p) => p.id === pid)?.identifier ?? "—"} ·{" "}
            {stage ? `${stage} · ` : ""}今天
          </span>
        </div>
        <div className="px-4 pb-1 pt-3">
          {list.length > 1 && (
            <div className="mb-3 flex items-center gap-2 text-[11px] text-[color:var(--color-ink-3)]">
              <span className="font-medium uppercase tracking-[0.16em]">工程</span>
              <select
                value={pid}
                onChange={(e) => setPidChoice(e.target.value)}
                className="border-0 border-b border-[color:var(--color-rule)] bg-transparent py-0.5 text-[12px] text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-accent)]"
                aria-label="选择工程"
              >
                {list.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.identifier} {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <RuledField label="标题" htmlFor="ql-title">
            <input
              id="ql-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Lighthouse 90 首跑达标"
              autoFocus
            />
          </RuledField>
          <RuledField label="完成了什么" htmlFor="ql-sum">
            <textarea
              id="ql-sum"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="今天实际做了什么——一句话也行"
            />
          </RuledField>
          <button
            type="button"
            className="mb-2.5 flex items-center gap-1.5 text-[11.5px] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-accent)]"
            onClick={() => setMore((v) => !v)}
            aria-expanded={more}
          >
            <span className="text-[10px]" aria-hidden>
              {more ? "▾" : "▸"}
            </span>
            补全 · 结论 / 下一步 / 阻塞
          </button>
          {more && (
            <>
              <RuledField label="结论" htmlFor="ql-c">
                <input id="ql-c" value={conclusion} onChange={(e) => setConclusion(e.target.value)} />
              </RuledField>
              <RuledField label="下一步" htmlFor="ql-n">
                <input id="ql-n" value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
              </RuledField>
              <RuledField label="阻塞" htmlFor="ql-b">
                <input id="ql-b" value={blocker} onChange={(e) => setBlocker(e.target.value)} />
              </RuledField>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-[color:var(--color-rule)] px-4 py-2.5">
          <span className="font-mono text-[10px] tracking-[0.08em] text-[color:var(--color-ink-3)]">
            ⌘⏎ 记录 · ESC 取消 · 未提交内容不丢失
          </span>
          <button
            type="button"
            data-ql-submit
            className="v2-ia ml-auto disabled:opacity-40"
            onClick={submit}
            disabled={!pid || !title.trim() || !summary.trim() || m.isPending}
          >
            <span className="mk" aria-hidden>▸</span>记录
          </button>
        </div>
      </div>
    </div>
  );
}
