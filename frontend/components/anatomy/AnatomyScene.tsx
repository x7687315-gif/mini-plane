"use client";

import type { KeyboardEvent, MouseEvent } from "react";

import {
  boxFaces,
  pointsAttr,
  project,
  type AnatomyChangeKind,
  type LooseTrayLayout,
  type StageLayout,
  type TaskCellLayout,
} from "@/features/anatomy";
import type { AnatomyLayout } from "@/features/anatomy";

interface AnatomySceneProps {
  layout: AnatomyLayout;
  identifier: string;
  focusedStageId: string | null;
  changeMarkers?: ReadonlyMap<string, AnatomyChangeKind>;
  onFocusStage: (stageId: string) => void;
  onFocusOverview: () => void;
  onOpenTask: (taskId: string) => void;
}

interface CellPalette {
  top: string;
  side: string;
  stroke: string;
  dashed: boolean;
}

function cellPalette(cell: TaskCellLayout): CellPalette {
  if (cell.tone === "done") {
    return { top: "var(--color-accent)", side: "var(--color-accent)", stroke: "var(--color-accent)", dashed: false };
  }
  if (cell.tone === "active") {
    return {
      top: "var(--color-accent-soft)",
      side: "var(--color-accent-soft)",
      stroke: "var(--color-accent)",
      dashed: false,
    };
  }
  if (cell.tone === "cancelled") {
    return {
      top: "var(--color-paper)",
      side: "var(--color-paper-2)",
      stroke: "var(--color-ink-3)",
      dashed: true,
    };
  }
  return {
    top: "var(--color-paper)",
    side: "var(--color-paper-2)",
    stroke: "var(--color-ink-2)",
    dashed: false,
  };
}

function TaskCell({
  cell,
  origin,
  identifier,
  changeKind,
  onOpenTask,
}: {
  cell: TaskCellLayout;
  origin: { x: number; y: number };
  identifier: string;
  changeKind?: AnatomyChangeKind;
  onOpenTask: (taskId: string) => void;
}) {
  const faces = boxFaces(origin, cell.x, cell.y, cell.z, cell.size, cell.size, cell.size * 0.72);
  const palette = cellPalette(cell);
  const dash = palette.dashed ? "3 2" : undefined;
  const anchor = cell.exploded && cell.anchor
    ? {
        from: project(origin, cell.anchor.x, cell.anchor.y, cell.anchor.z),
        to: project(origin, cell.x + cell.size / 2, cell.y + cell.size / 2, cell.z),
      }
    : null;
  const marker = changeKind
    ? project(origin, cell.x + cell.size / 2, cell.y + cell.size / 2, cell.z + cell.size * 0.72 + 7)
    : null;
  const open = (event: MouseEvent<SVGGElement>) => {
    event.stopPropagation();
    onOpenTask(cell.taskId);
  };
  const key = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onOpenTask(cell.taskId);
    }
  };

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`任务 ${identifier}-${cell.sequenceId}：${cell.title}`}
      className="an-cell cursor-pointer focus:outline-none"
      onClick={open}
      onKeyDown={key}
    >
      <title>{`${identifier}-${cell.sequenceId} · ${cell.title}`}</title>
      {anchor && (
        <line
          x1={anchor.from.x}
          y1={anchor.from.y}
          x2={anchor.to.x}
          y2={anchor.to.y}
          stroke="var(--color-rule)"
          strokeWidth={0.7}
          strokeDasharray="2 3"
          pointerEvents="none"
        />
      )}
      {cell.flat ? (
        <polygon
          points={pointsAttr(faces.top)}
          fill={palette.top}
          stroke={cell.isNow ? "var(--color-accent)" : palette.stroke}
          strokeWidth={cell.isNow ? 1.8 : 0.7}
          strokeDasharray={dash}
        />
      ) : (
        <>
          <polygon points={pointsAttr(faces.right)} fill={palette.side} stroke={palette.stroke} strokeWidth={cell.isNow ? 1.2 : 0.7} strokeDasharray={dash} />
          <polygon points={pointsAttr(faces.front)} fill={palette.side} stroke={palette.stroke} strokeWidth={cell.isNow ? 1.2 : 0.7} strokeDasharray={dash} />
          <polygon points={pointsAttr(faces.top)} fill={palette.top} stroke={cell.isNow ? "var(--color-accent)" : palette.stroke} strokeWidth={cell.isNow ? 1.8 : 0.8} strokeDasharray={dash} />
        </>
      )}
      {cell.isNow && (
        <polygon
          points={pointsAttr(faces.top)}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2.2}
          opacity={0.9}
          pointerEvents="none"
        />
      )}
      {marker && (
        <g className="an-change" pointerEvents="none">
          {changeKind === "created" ? (
            <circle cx={marker.x} cy={marker.y} r={3.2} fill="var(--color-accent)" />
          ) : (
            <polygon
              points={pointsAttr([
                { x: marker.x, y: marker.y - 3.5 },
                { x: marker.x + 3.5, y: marker.y },
                { x: marker.x, y: marker.y + 3.5 },
                { x: marker.x - 3.5, y: marker.y },
              ])}
              fill="var(--color-warning)"
            />
          )}
        </g>
      )}
    </g>
  );
}

function StageModule({
  layout,
  identifier,
  focused,
  changeMarkers,
  onFocus,
  onOpenTask,
}: {
  layout: StageLayout;
  identifier: string;
  focused: boolean;
  changeMarkers?: ReadonlyMap<string, AnatomyChangeKind>;
  onFocus: (stageId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const { stage, origin, w, d, h, opacity, thin } = layout;
  // 渲染使用局部坐标 + CSS transform，这样形态切换时位置可以由 CSS 过渡；
  // layout 返回的绝对坐标只用于包围盒/测试。
  const local = { x: 0, y: 0 };
  const faces = boxFaces(local, -w / 2, -d / 2, 0, w, d, h);
  const stroke = thin ? "var(--color-rule)" : stage.isCurrent ? "var(--color-accent)" : "var(--color-ink-2)";
  const strokeWidth = thin ? 0.6 : stage.isCurrent || focused ? 1.35 : 0.85;
  const emptyOutline = boxFaces(local, -w * 0.34, -d * 0.34, h, w * 0.68, d * 0.68, 0.1);
  const focus = (event: MouseEvent<SVGGElement> | KeyboardEvent<SVGGElement>) => {
    event.stopPropagation();
    onFocus(stage.id);
  };
  const key = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      focus(event);
    }
  };

  return (
    <g
      role={thin ? undefined : "button"}
      tabIndex={thin ? undefined : 0}
      aria-label={thin ? undefined : `阶段 ${stage.order}：${stage.name}`}
      aria-pressed={thin ? undefined : focused}
      pointerEvents={thin ? "none" : undefined}
      className={thin ? undefined : "an-stage cursor-pointer focus:outline-none"}
      style={{
        opacity,
        transform: `translate(${origin.x}px, ${origin.y}px)`,
        transition: "transform 250ms cubic-bezier(0.2,0.8,0.2,1), opacity 200ms cubic-bezier(0.2,0.8,0.2,1)",
      }}
      onClick={thin ? undefined : focus}
      onKeyDown={thin ? undefined : key}
    >
      <title>{`阶段 ${stage.order} · ${stage.name}`}</title>
      <polygon points={pointsAttr(faces.right)} fill="var(--color-paper-2)" stroke={stroke} strokeWidth={strokeWidth} />
      <polygon points={pointsAttr(faces.front)} fill="var(--color-paper-2)" stroke={stroke} strokeWidth={strokeWidth} />
      <polygon points={pointsAttr(faces.top)} fill="var(--color-paper)" stroke={stroke} strokeWidth={strokeWidth} />
      {stage.tasks.length === 0 && !thin && (
        <polygon
          points={pointsAttr(emptyOutline.top)}
          fill="none"
          stroke="var(--color-ink-3)"
          strokeWidth={0.7}
          strokeDasharray="4 4"
          pointerEvents="none"
        />
      )}
      {layout.tasks.map((cell) => (
        <TaskCell
          key={cell.taskId}
          cell={cell}
          origin={local}
          identifier={identifier}
          changeKind={changeMarkers?.get(cell.taskId)}
          onOpenTask={onOpenTask}
        />
      ))}
      {!thin && (
        <g pointerEvents="none">
          <text
            x={layout.label.x - origin.x}
            y={layout.label.y - origin.y}
            textAnchor="middle"
            fontFamily="Cormorant Garamond, Georgia, serif"
            fontStyle="italic"
            fontSize={focused ? 22 : 20}
            fill={stage.isCurrent ? "var(--color-accent)" : "var(--color-ink)"}
          >
            {layout.label.text}
          </text>
          <text
            x={layout.label.x - origin.x}
            y={layout.label.y - origin.y + 15}
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontSize={11}
            fill={stage.isCurrent ? "var(--color-accent)" : "var(--color-ink-3)"}
          >
            {layout.label.progressText}
            {stage.isCurrent ? " · 当前" : ""}
          </text>
        </g>
      )}
    </g>
  );
}

function LooseTray({
  layout,
  identifier,
  changeMarkers,
  onOpenTask,
}: {
  layout: LooseTrayLayout;
  identifier: string;
  changeMarkers?: ReadonlyMap<string, AnatomyChangeKind>;
  onOpenTask: (taskId: string) => void;
}) {
  const faces = boxFaces(layout.origin, -layout.w / 2, -layout.d / 2, 0, layout.w, layout.d, layout.h);
  return (
    <g opacity={layout.opacity}>
      <polygon
        points={pointsAttr(faces.top)}
        fill="none"
        stroke="var(--color-ink-3)"
        strokeWidth={0.8}
        strokeDasharray="4 4"
      />
      {layout.tasks.map((cell) => (
        <TaskCell
          key={cell.taskId}
          cell={cell}
          origin={layout.origin}
          identifier={identifier}
          changeKind={changeMarkers?.get(cell.taskId)}
          onOpenTask={onOpenTask}
        />
      ))}
      <text
        x={layout.origin.x}
        y={layout.origin.y + layout.d * 0.5 + layout.h + 14}
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={12}
        fill="var(--color-ink-2)"
      >
        {layout.label}
      </text>
    </g>
  );
}

export function AnatomyScene({
  layout,
  identifier,
  focusedStageId,
  changeMarkers,
  onFocusStage,
  onFocusOverview,
  onOpenTask,
}: AnatomySceneProps) {
  const titleId = "anatomy-title";
  const descId = "anatomy-desc";

  return (
    <svg
      viewBox={`${layout.viewBox.x} ${layout.viewBox.y} ${layout.viewBox.w} ${layout.viewBox.h}`}
      role="group"
      aria-labelledby={`${titleId} ${descId}`}
      style={{ width: "100%", height: "auto", display: "block", minHeight: 280 }}
      onClick={onFocusOverview}
    >
      <title id={titleId}>项目解剖图</title>
      <desc id={descId}>项目阶段、任务状态、当前工作与未归属任务的结构视图；只读。</desc>
      {layout.emptyBase && (
        <g>
          <polygon
            points={pointsAttr(boxFaces(layout.emptyBase.origin, -layout.emptyBase.w / 2, -layout.emptyBase.d / 2, 0, layout.emptyBase.w, layout.emptyBase.d, layout.emptyBase.h).top)}
            fill="none"
            stroke="var(--color-ink-3)"
            strokeWidth={0.9}
            strokeDasharray="5 5"
          />
          <text
            x={layout.emptyBase.origin.x}
            y={layout.emptyBase.origin.y + layout.emptyBase.d * 0.5 + 26}
            textAnchor="middle"
            fontFamily="Cormorant Garamond, Georgia, serif"
            fontStyle="italic"
            fontSize={22}
            fill="var(--color-ink-2)"
          >
            这张图纸还没有结构。
          </text>
        </g>
      )}
      {layout.stages.map((stage) => (
        <StageModule
          key={stage.stageId}
          layout={stage}
          identifier={identifier}
          focused={focusedStageId === stage.stageId}
          changeMarkers={changeMarkers}
          onFocus={(id) => (focusedStageId === id ? onFocusOverview() : onFocusStage(id))}
          onOpenTask={onOpenTask}
        />
      ))}
      {layout.loose && (
        <LooseTray
          layout={layout.loose}
          identifier={identifier}
          changeMarkers={changeMarkers}
          onOpenTask={onOpenTask}
        />
      )}
    </svg>
  );
}
