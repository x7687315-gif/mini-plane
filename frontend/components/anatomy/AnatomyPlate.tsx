"use client";

import { useMemo, useState, type MouseEvent } from "react";
import type { IssueState, ProjectMember, ProjectStage, Worklog } from "@/types/project";
import type { Issue, Label } from "@/types/issue";

/**
 * AnatomyPlate —— 项目解剖图（Phase 5 可视化，ANATOMY_REVIEW 采纳的复合方案）。
 *
 * 构成：A 爆炸轴测主体（每阶段一种建筑原型，任务=内部等距立方体）
 *     + B 剖切聚焦（点击阶段：该阶段展开为可读构件阵列，其余幽灵化）
 *     + C 编辑式面板（阶段索引 / 图例 / 摘要 / 图签）。
 *
 * 数据语义（ANATOMY_PROPOSAL §1，硬约束）：
 * - 任务构件只按真实 `stage` 分组；stage 为空 → 散件托盘（中性可见，不隐藏）；
 * - 绝不画 Task↔Task 依赖线（模型中不存在该实体）；
 * - 阶段进度 / 任务状态统计 / 工程总进度三者分列，不混算；
 * - NOW / NEXT STAGE / Agent 只显示真实数据，缺数据不伪造。
 *
 * 投影：等距（30°）SVG，viewBox 响应式缩放；布局为确定性计算（spec §6.5，
 * 数据变化后构件不随机换位）。只读视图：不新增任何写操作。
 */
const INK_FALLBACK = "var(--color-ink)";
const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;
const VB = { w: 1160, h: 620 };


export interface AnatomyPlateProps {
  identifier: string;
  stages: ProjectStage[];
  tasks: Issue[];
  logs: Worklog[];
  states: IssueState[];
  labels?: Label[];
  members?: ProjectMember[];
  agentRunning: boolean;
  nextStageName: string | null;
  onOpenTask: (issueId: string) => void;
}

/** 任务构件的状态→视觉映射（色 + 形，非单一颜色编码）。 */
function cellVisual(state: string, isNow: boolean) {
  if (state === "done")
    return { top: "var(--color-accent)", xf: "var(--color-accent)", yf: "var(--color-accent)", st: "var(--color-accent)", sw: 0.7, dash: false, o: 0.85 };
  if (state === "started" || isNow)
    return { top: "var(--color-accent-soft)", xf: "var(--color-accent-soft)", yf: "var(--color-accent-soft)", st: "var(--color-accent)", sw: 1.5, dash: false, o: 1 };
  return { top: "var(--color-paper)", xf: "var(--color-paper-2)", yf: "var(--color-paper-2)", st: "var(--color-ink-2)", sw: 0.7, dash: false, o: 1 };
}

function iso(ox: number, oy: number, s: number) {
  return (x: number, y: number, z: number): [number, number] => [
    ox + (x - y) * C30 * s,
    oy + (x + y) * S30 * s - z * s,
  ];
}

const f = (a: [number, number][]) => a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

/** 用户可控文本进入 SVG 字符串前必须转义（阶段名/目标来自接口，不是常量）。 */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function box(
  P: (x: number, y: number, z: number) => [number, number],
  x: number, y: number, z: number, a: number, b: number, h: number,
  c: { top?: string; xf?: string; yf?: string; st?: string; sw?: number; dash?: boolean; o?: number },
) {
  const top = f([P(x, y, z + h), P(x + a, y, z + h), P(x + a, y + b, z + h), P(x, y + b, z + h)]);
  const xf = f([P(x + a, y, z + h), P(x + a, y + b, z + h), P(x + a, y + b, z), P(x + a, y, z)]);
  const yf = f([P(x, y + b, z + h), P(x + a, y + b, z + h), P(x + a, y + b, z), P(x, y + b, z)]);
  const st = c.st ?? "var(--color-ink)";
  const sw = (c.sw ?? 0.9).toFixed(2);
  const o = c.o != null ? ` opacity="${c.o}"` : "";
  const d = c.dash ? ' stroke-dasharray="3 3"' : "";
  return `<polygon points="${yf}" fill="${c.yf ?? "none"}" stroke="${st}" stroke-width="${(Number(sw) * 0.8).toFixed(2)}"${d}${o}/>`
    + `<polygon points="${xf}" fill="${c.xf ?? "none"}" stroke="${st}" stroke-width="${(Number(sw) * 0.8).toFixed(2)}"${d}${o}/>`
    + `<polygon points="${top}" fill="${c.top ?? "none"}" stroke="${st}" stroke-width="${sw}"${d}${o}/>`;
}

function cellCube(
  P: (x: number, y: number, z: number) => [number, number],
  x: number, y: number, z: number, state: string, isNow: boolean, s = 8,
) {
  const v = cellVisual(state, isNow);
  return box(P, x, y, z, s, s, s, { ...v, sw: isNow ? 1.5 : v.sw });
}

/** 确定性散布：任务构件在楼板内的位置（stable，不随重渲染换位）。 */
function scatter(n: number, w: number, d: number): [number, number][] {
  const out: [number, number][] = [];
  const perRow = Math.max(2, Math.min(5, Math.ceil(Math.sqrt(n * 1.6))));
  for (let k = 0; k < n; k += 1) {
    const col = k % perRow;
    const row = Math.floor(k / perRow);
    const jx = ((k * 37) % 7) - 3; // 确定性微移，避免呆板对齐
    const jy = ((k * 23) % 5) - 2;
    out.push([
      6 + col * ((w - 14) / Math.max(1, perRow - 1) || 0) + jx,
      5 + row * ((d - 12) / Math.max(1, Math.ceil(n / perRow) - 1) || 0) + jy,
    ]);
  }
  return out;
}

/** 建筑原型由任务密度决定（几何服务真实组织，规格 §4.2）。 */
function archetype(taskCount: number): "foundation" | "openbox" | "portal" | "campus" {
  if (taskCount === 0) return "foundation";
  if (taskCount <= 3) return "openbox";
  if (taskCount <= 6) return "portal";
  return "campus";
}

export function AnatomyPlate({
  identifier, stages, tasks,
  agentRunning, nextStageName, onOpenTask,
}: AnatomyPlateProps) {
  const [focus, setFocus] = useState(-1);
  // 阶段数量会变化（删除阶段）；越界的 focus 必须退化为全景，否则
  // layout[i] / stages[focus] 会读到 undefined。
  const focusIndex = focus >= 0 && focus < stages.length ? focus : -1;
  const focusedStage = focusIndex >= 0 ? stages[focusIndex] : null;

  // ── View model（数据适配层）──
  const groups = useMemo(
    () =>
      stages.map((s) => ({
        stage: s,
        tasks: tasks.filter((t) => t.stage?.id === s.id),
      })),
    [stages, tasks],
  );
  const loose = useMemo(() => tasks.filter((t) => !t.stage), [tasks]);
  const nowTask = useMemo(
    () => tasks.find((t) => t.state.group === "started") ?? null,
    [tasks],
  );

  // ── 布局模型（展示计算，不写入数据库）──
  const layout = useMemo(() => {
    return stages.map((_, i) => {
      if (focusIndex >= 0) {
        if (i === focusIndex) return { ox: 430, oy: 330, s: 1.35, thin: false };
        return { ox: 60, oy: 150 + i * 34, s: 0.75, thin: true };
      }
      return {
        ox: Math.min(70 + (i % 4) * 262, VB.w - 210),
        oy: 478 - Math.floor(i / 4) * 158,
        s: 1.28,
        thin: false,
      };
    });
  }, [stages, focusIndex]);

  // ── SVG 渲染层 ──
  const svg = useMemo(() => {
    const parts: string[] = [];

    stages.forEach((s, i) => {
      const { ox, oy, s: scale, thin } = layout[i];
      const P = iso(ox, oy, scale);
      const group = groups[i];
      const cur = s.is_current;
      const h = 16 + s.weight * 7; // 层高=权重（真实字段编码）
      const kind = archetype(group.tasks.length);
      const gOpen = `<g class="an-stage" style="cursor:pointer" data-i="${i}">`;
      let g = gOpen;

      if (thin) {
        g += `<line x1="${P(0, 0, 0)[0]}" y1="${P(0, 0, 0)[1]}" x2="${P(70, 40, 0)[0]}" y2="${P(70, 40, 0)[1]}" stroke="var(--color-ink-3)" stroke-width=".8"/>`;
        g += `<text x="${P(0, 0, 0)[0] + 4}" y="${P(0, 0, 0)[1] - 4}" font-family="JetBrains Mono" font-size="10" fill="var(--color-ink-3)">${String(s.order).padStart(2, "0")} ${esc(s.name)} · ${s.progress}%</text>`;
        g += "</g>";
        parts.push(g);
        return;
      }

      // 建筑原型（foundation/openbox/portal/campus）
      if (kind === "foundation") {
        g += box(P, 0, 0, 0, 64, 40, 3, { top: "var(--color-paper)", xf: "var(--color-paper-2)", yf: "var(--color-paper-2)", st: "var(--color-ink-3)", sw: 0.8, dash: true });
      } else if (kind === "openbox") {
        g += box(P, 0, 0, 0, 64, 40, h, { top: "var(--color-paper)", xf: "var(--color-paper-2)", yf: "var(--color-paper-2)", st: cur ? "var(--color-accent)" : INK_FALLBACK, sw: cur ? 1.4 : 0.9 });
      } else if (kind === "portal") {
        g += box(P, 0, 0, 0, 6, 40, h + 14, { top: "var(--color-paper)", xf: "var(--color-paper-2)", yf: "var(--color-paper-2)", st: INK_FALLBACK, sw: 0.9 });
        g += box(P, 58, 0, 0, 6, 40, h + 14, { top: "var(--color-paper)", xf: "var(--color-paper-2)", yf: "var(--color-paper-2)", st: INK_FALLBACK, sw: 0.9 });
        g += box(P, 0, 0, h + 14, 64, 40, 5, { top: "var(--color-paper)", xf: "var(--color-paper-2)", yf: "var(--color-paper-2)", st: INK_FALLBACK, sw: 0.9 });
      } else {
        g += box(P, 0, 0, 0, 38, 40, h, { top: "var(--color-paper)", xf: "var(--color-paper-2)", yf: "var(--color-paper-2)", st: INK_FALLBACK, sw: 0.9 });
        g += box(P, 40, 0, 0, 26, 28, h + 8, { top: "var(--color-paper)", xf: "var(--color-paper-2)", yf: "var(--color-paper-2)", st: INK_FALLBACK, sw: 0.9 });
      }

      // 任务构件（散布于体量内部/顶面）
      const zTop = kind === "portal" ? h + 14 : h;
      scatter(group.tasks.length, 56, 32).forEach(([cx, cy], k) => {
        const t = group.tasks[k];
        if (!t) return;
        const isNow = nowTask?.id === t.id;
        const cxx = kind === "campus" && k % 2 === 1 ? 42 + (cx % 16) : cx;
        g += cellCube(P, 4 + (cxx % 52), 4 + (cy % 32), zTop, t.state.group, isNow);
      });

      // 标注：编号 + 名称 + 进度（聚焦态加 goal）
      const nameY = P(0, 0, 0)[1] + 14;
      g += `<text x="${P(0, 0, 0)[0]}" y="${nameY}" font-family="JetBrains Mono" font-size="10.5" fill="var(--color-ink-3)">${String(s.order).padStart(2, "0")}</text>`;
      g += `<text x="${P(0, 0, 0)[0] + 22}" y="${nameY}" font-family="Cormorant Garamond, Georgia, serif" font-style="italic" font-size="15" fill="${cur ? "var(--color-accent)" : "var(--color-ink)"}">${esc(s.name)}${cur ? " · 当前" : ""}</text>`;
      g += `<text x="${P(64, 40, 0)[0]}" y="${nameY}" text-anchor="end" font-family="JetBrains Mono" font-size="10.5" fill="${s.progress === 100 ? "var(--color-success)" : "var(--color-ink-2)"}">${s.progress}% · w${s.weight}</text>`;
      if (focusIndex === i) {
        g += `<text x="${P(0, 0, 0)[0]}" y="${nameY + 15}" font-family="Inter" font-size="10.5" fill="var(--color-ink-2)">目标：${esc(s.goal || "（未填写阶段目标）")}</text>`;
        g += `<text x="${P(0, 0, 0)[0]}" y="${nameY + 30}" font-family="JetBrains Mono" font-size="9.5" fill="var(--color-ink-3)">构件 ${group.tasks.length} · 已完成 ${group.tasks.filter((t) => t.state.group === "done").length} · 进行中 ${group.tasks.filter((t) => t.state.group === "started").length}</text>`;
      }
      g += "</g>";
      parts.push(g);
    });

    // NOW 引线（指向真实 started 任务的构件）
    if (nowTask && nowTask.stage) {
      const gi = stages.findIndex((s) => s.id === nowTask.stage?.id);
      if (gi >= 0 && focusIndex !== gi) {
        const { ox, oy, s: scale } = layout[gi];
        const P = iso(ox, oy, scale);
        const anchor = P(60, 40, 30);
        parts.push(`<line x1="${anchor[0].toFixed(1)}" y1="${anchor[1].toFixed(1)}" x2="${anchor[0] + 56}" y2="${anchor[1] - 30}" stroke="var(--color-ink-3)" stroke-width=".7"/><text x="${anchor[0] + 60}" y="${anchor[1] - 32}" font-family="Inter" font-size="10.5" fill="var(--color-accent)">NOW · ${esc(identifier)}-${nowTask.sequence_id}</text>`);
      }
    }

    // 散件托盘（stage=null 的任务，中性可见）
    if (loose.length > 0) {
      const P = iso(focusIndex >= 0 ? 760 : 880, focusIndex >= 0 ? 500 : 530, focusIndex >= 0 ? 1 : 1.1);
      let tray = `<g>`;
      tray += box(P, 0, 0, 0, 96, 40, 2, { top: "none", xf: "none", yf: "none", st: "var(--color-ink-3)", sw: 0.8, dash: true });
      loose.slice(0, 12).forEach((t, k) => {
        const col = k % 6, row = Math.floor(k / 6);
        const isNow = nowTask?.id === t.id;
        tray += `<g class="an-task" style="cursor:pointer" data-id="${t.id}">`;
        tray += cellCube(P, 6 + col * 15, 8 + row * 13, 2, t.state.group, isNow, 6);
        tray += "</g>";
      });
      if (loose.length > 12) tray += `<text x="${P(84, 20, 0)[0]}" y="${P(84, 20, 0)[1] + 6}" font-family="JetBrains Mono" font-size="9" fill="var(--color-ink-3)">＋${loose.length - 12}</text>`;
      tray += `<text x="${P(0, 0, 0)[0]}" y="${P(0, 0, 0)[1] + 56}" font-family="Inter" font-size="10" fill="var(--color-ink-3)">散件 · 未归属阶段（${loose.length}）——在任务抽屉中可归属</text></g>`;
      parts.push(tray);
    }

    // 投影辅助线（对齐用，非依赖——低对比点线）
    if (focusIndex < 0 && stages.length > 1) {
      const first = layout[0], last = layout[stages.length - 1];
      const P1 = iso(first.ox, first.oy, first.s), P2 = iso(last.ox, last.oy, last.s);
      parts.push(`<line x1="${P1(0, 0, 0)[0].toFixed(1)}" y1="${(P1(0, 0, 0)[1] + 40).toFixed(1)}" x2="${P2(0, 0, 0)[0].toFixed(1)}" y2="${(P2(0, 0, 0)[1] + 40).toFixed(1)}" stroke="var(--color-rule)" stroke-width=".6" stroke-dasharray="2 5" opacity=".8"/>`);
    }

    // 图例
    parts.push(`<g transform="translate(24,${VB.h - 30})" font-family="Inter" font-size="10" fill="var(--color-ink-2)">
      <rect x="0" y="-9" width="11" height="11" fill="var(--color-paper)" stroke="var(--color-ink-2)"/><text x="17" y="0">Stage 构件</text>
      <rect x="86" y="-9" width="11" height="11" fill="var(--color-accent)"/><text x="103" y="0">已完成</text>
      <rect x="158" y="-9" width="11" height="11" fill="var(--color-accent-soft)" stroke="var(--color-accent)"/><text x="175" y="0">进行中/NOW</text>
      <rect x="256" y="-9" width="11" height="11" fill="var(--color-paper-2)" stroke="var(--color-ink-2)"/><text x="273" y="0">待办</text>
      <rect x="314" y="-9" width="11" height="11" fill="none" stroke="var(--color-ink-3)" stroke-dasharray="3 3"/><text x="331" y="0">散件·未归属</text>
      <line x1="408" y1="-3.5" x2="434" y2="-3.5" stroke="var(--color-rule)" stroke-dasharray="2 4"/><text x="440" y="0">投影辅助线（非依赖）</text>
    </g>`);

    return parts.join("");
  }, [stages, groups, loose, nowTask, layout, focusIndex, identifier]);

  // 聚焦阶段的任务行（HTML 层，聚焦时叠加在 SVG 右侧）
  const focusRows = focusedStage
    ? tasks.filter((t) => t.stage?.id === focusedStage.id)
    : [];
  const looseCount = tasks.filter((t) => !t.stage).length;

  function handleSvgClick(event: MouseEvent<SVGSVGElement>) {
    const target = event.target as Element;
    const task = target.closest("[data-id]");
    if (task) {
      const id = task.getAttribute("data-id");
      if (id) onOpenTask(id);
      return;
    }
    const stage = target.closest("[data-i]");
    if (stage) {
      const index = Number(stage.getAttribute("data-i"));
      if (Number.isInteger(index) && index >= 0 && index < stages.length) {
        setFocus(focusIndex === index ? -1 : index);
      }
    }
  }

  return (
    <div className="relative">
      <div className="relative border border-[color:var(--color-rule)] bg-[color:var(--color-paper)]" style={{ minHeight: 560 }}>
        <svg
          viewBox={`0 0 ${VB.w} ${VB.h}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          role="img"
          aria-label="项目解剖图：阶段构件与任务的空间构成"
          onClick={handleSvgClick}
        >
          {svg ? <g dangerouslySetInnerHTML={{ __html: svg }} /> : null}
        </svg>

        {/* C 层：阶段索引面板（右上） */}
        <div className="absolute right-3 top-3 w-[264px] border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] p-3 max-lg:relative max-lg:top-0 max-lg:right-0 max-lg:mt-3 max-lg:w-full">
          <div className="fig-note font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">Stage Index · 01—{String(stages.length).padStart(2, "0")}</div>
          <table className="mt-2 w-full">
            <tbody>
              {stages.map((s, i) => {
                const n = tasks.filter((t) => t.stage?.id === s.id).length;
                return (
                  <tr
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`聚焦阶段 ${s.name}`}
                    className="cursor-pointer border-b border-dashed border-[color:var(--color-rule)]"
                    onClick={() => setFocus(focusIndex === i ? -1 : i)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setFocus(focusIndex === i ? -1 : i);
                      }
                    }}
                  >
                    <td className="py-1 font-mono text-[10px] text-[color:var(--color-ink-3)]">{String(s.order).padStart(2, "0")}</td>
                    <td className="py-1 text-[11.5px] text-[color:var(--color-ink)]">{s.name}{s.is_current ? " ·" : ""}</td>
                    <td className="py-1 text-right font-mono text-[10px] text-[color:var(--color-ink-2)]">{n}</td>
                    <td className="py-1 text-right font-mono text-[10px] text-[color:var(--color-ink-2)]">{s.progress}%</td>
                  </tr>
                );
              })}
              {looseCount > 0 && (
                <tr
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer"
                  onClick={() => setFocus(-1)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setFocus(-1);
                    }
                  }}
                >
                  <td className="py-1 font-mono text-[10px] text-[color:var(--color-ink-3)]">——</td>
                  <td className="py-1 text-[11.5px] text-[color:var(--color-ink-2)]">散件（未归属）</td>
                  <td className="py-1 text-right font-mono text-[10px]">{looseCount}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
          <div className="mt-2 font-mono text-[9.5px] text-[color:var(--color-ink-3)]">
            {agentRunning && <span style={{ color: "var(--color-success)" }}>● AGENT · RUNNING　</span>}
            {nextStageName ? `NEXT STAGE · ${nextStageName}` : "NEXT STAGE · —"}
          </div>
        </div>

        {/* B 层：聚焦任务清单（右下面板，点击任务开抽屉） */}
        {focusedStage && (
          <div className="absolute bottom-3 right-3 w-[264px] border border-[color:var(--color-accent)] bg-[color:var(--color-paper)] p-3 max-lg:relative max-lg:bottom-0 max-lg:right-0 max-lg:mt-3 max-lg:w-full">
            <div className="flex items-baseline justify-between">
              <span className="font-medium text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
                Stage {String(focusedStage.order).padStart(2, "0")} 构件
              </span>
              <button type="button" className="text-[10.5px] text-[color:var(--color-accent)]" onClick={() => setFocus(-1)}>
                ◂ 整体
              </button>
            </div>
            <div className="mt-2 max-h-44 overflow-auto">
              {focusRows.length === 0 && <p className="text-[11px] text-[color:var(--color-ink-3)]">该阶段还没有任务构件。</p>}
              {focusRows.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onOpenTask(t.id)}
                  className="flex w-full items-baseline gap-2 border-b border-dashed border-[color:var(--color-rule)] py-1.5 text-left hover:bg-[color:var(--color-accent-soft)]"
                >
                  <span className="font-mono text-[9.5px] text-[color:var(--color-ink-3)]">{identifier}-{t.sequence_id}</span>
                  <span className="min-w-0 flex-1 truncate text-[11.5px]">{t.title}</span>
                  <span className="font-medium text-[8.5px] uppercase tracking-[0.12em] text-[color:var(--color-ink-3)]">{t.priority === "none" ? "" : t.priority}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 空态（无阶段） */}
        {stages.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="font-serif italic text-[16px] text-[color:var(--color-ink-2)]">这张图纸还没有结构。</p>
              <p className="mt-1 text-[11.5px] text-[color:var(--color-ink-3)]">在工程台「调整」中添加第一个阶段，构件会在这里生长。</p>
            </div>
          </div>
        )}
      </div>
      {/* 图签 */}
      <div className="flex justify-between border-x border-b border-[color:var(--color-rule)] px-4 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[color:var(--color-ink-3)]">
        <span>{identifier} / project anatomy / {new Date().getFullYear()}</span>
        <span>plate 01 · read-only · 数据为真实投影</span>
      </div>
    </div>
  );
}
