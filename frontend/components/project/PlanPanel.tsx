"use client";

import { useState } from "react";
import { Button, MeasureLine } from "@/components/ui";
import { useAddStage, usePlan, useUpdateStage } from "@/features/project";

/**
 * Global Plan 面板（Sprint 10，PRODUCT_REFACTOR_PLAN §5/§6）。
 *
 * 展示项目的工程路线：有序 Stage 列表 + 加权总进度 + 当前/下一阶段。
 * 可写角色（Member+）可：添加阶段、把某阶段设为当前、调整阶段进度。
 * 进度主信息是"阶段 + 当前任务"，百分比只是辅助（§6）。
 */
export function PlanPanel({
  slug,
  projectId,
  canWrite,
}: {
  slug: string;
  projectId: string;
  canWrite: boolean;
}) {
  const { data: plan, isLoading } = usePlan(slug, projectId);
  const addStage = useAddStage(slug, projectId);
  const updateStage = useUpdateStage(slug, projectId);
  const [newName, setNewName] = useState("");

  const stages = plan?.stages ?? [];

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    await addStage.mutateAsync({ name });
    setNewName("");
  };

  return (
    <section className="mb-8">
      <MeasureLine
        left="FIG · PLAN"
        right={`GLOBAL PLAN · ${String(stages.length).padStart(2, "0")} STAGES`}
      />

      {isLoading && (
        <div className="space-y-2 mt-3" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="h-9 border border-[color:var(--color-rule)]" />
          ))}
        </div>
      )}

      {!isLoading && plan && (
        <>
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="text-[11px] uppercase tracking-[0.18em] font-sans font-medium text-[color:var(--color-ink-2)]">
              当前：{plan.current_stage?.name ?? "—"}
              <span className="text-[color:var(--color-ink-3)] ml-3">
                下一步：{plan.next_stage?.name ?? "—"}
              </span>
            </div>
            <div className="text-[11px] font-mono text-[color:var(--color-accent)]">
              {plan.progress}%
            </div>
          </div>

          <div className="border-t border-[color:var(--color-rule)]">
            {stages.map((s) => (
              <div
                key={s.id}
                className={
                  "flex items-center gap-3 py-2 px-2 border-b border-dashed border-[color:var(--color-rule)] " +
                  (s.is_current ? "bg-[color:var(--color-accent-soft)]" : "")
                }
              >
                <span className="font-mono text-[10px] text-[color:var(--color-ink-3)] w-7 flex-shrink-0">
                  {String(s.order).padStart(2, "0")}
                </span>
                <span className="text-[13px] text-[color:var(--color-ink)] truncate min-w-0 flex-1">
                  {s.name}
                  {s.is_current && (
                    <span className="ml-2 text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-accent)] font-sans font-medium">
                      current
                    </span>
                  )}
                </span>

                {/* 阶段进度细条 */}
                <span className="w-24 h-[5px] border border-[color:var(--color-rule)] flex-shrink-0 hidden sm:block" aria-hidden>
                  <span
                    className="block h-full bg-[color:var(--color-accent)]"
                    style={{ width: `${Math.min(100, Math.max(0, s.progress))}%` }}
                  />
                </span>
                <span className="font-mono text-[10px] text-[color:var(--color-ink-2)] w-10 text-right flex-shrink-0">
                  {s.progress}%
                </span>

                {canWrite && (
                  <>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={s.progress}
                      aria-label={`${s.name} 进度`}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v !== s.progress) {
                          void updateStage.mutateAsync({
                            stageId: s.id,
                            payload: { progress: Math.min(100, Math.max(0, v)) },
                          });
                        }
                      }}
                      className="w-14 bg-transparent border border-[color:var(--color-rule)] px-1 py-0.5 text-[11px] font-mono text-[color:var(--color-ink-2)] outline-none focus:border-[color:var(--color-accent)] flex-shrink-0"
                    />
                    {!s.is_current && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={updateStage.isPending}
                        onClick={() =>
                          void updateStage.mutateAsync({
                            stageId: s.id,
                            payload: { is_current: true },
                          })
                        }
                      >
                        设为当前
                      </Button>
                    )}
                  </>
                )}
              </div>
            ))}
            {stages.length === 0 && (
              <p className="py-4 text-[12px] text-[color:var(--color-ink-3)]">
                还没有规划阶段。{canWrite ? "在下方添加第一个阶段。" : ""}
              </p>
            )}
          </div>

          {canWrite && (
            <div className="flex gap-2 mt-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="新阶段名称（如：TTS 稳定性）"
                aria-label="新阶段名称"
                className="flex-1 min-w-0 bg-transparent border border-[color:var(--color-rule)] px-2.5 py-1.5 text-[12px] text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-accent)]"
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={!newName.trim() || addStage.isPending}
                onClick={() => void handleAdd()}
              >
                添加阶段
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
