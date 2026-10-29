"use client";

import type { KeyboardEvent, MouseEvent } from "react";

import {
  boxFaces,
  ISO_SIN,
  pointsAttr,
  project,
  type AnatomyChangeKind,
  type AnatomyLayout,
  type EmptyBaseLayout,
  type GrowthStageLayout,
  type GrowthTaskMarkLayout,
  type LooseTrayLayout,
  type StageLabelLayout,
  type StructureStageLayout,
  type TaskCellLayout,
} from "@/features/anatomy";

interface AnatomySceneProps {
  layout: AnatomyLayout;
  identifier: string;
  changeMarkers?: ReadonlyMap<string, AnatomyChangeKind>;
  onSelectStage: (stageId: string) => void;
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
    return {
      top: "var(--color-accent)",
      side: "var(--color-accent)",
      stroke: "var(--color-accent)",
      dashed: false,
    };
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

function markStroke(tone: GrowthTaskMarkLayout["tone"]): string {
  if (tone === "done") return "var(--color-accent)";
  if (tone === "active") return "var(--color-accent-2)";
  if (tone === "cancelled") return "var(--color-ink-3)";
  return "var(--color-ink-2)";
}

function TaskCube({
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
      className="an-task cursor-pointer focus:outline-none"
      onClick={open}
      onKeyDown={key}
    >
      <title>{`${identifier}-${cell.sequenceId} · ${cell.title}`}</title>
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
          <polygon
            points={pointsAttr(faces.right)}
            fill={palette.side}
            stroke={palette.stroke}
            strokeWidth={cell.isNow ? 1.2 : 0.7}
            strokeDasharray={dash}
          />
          <polygon
            points={pointsAttr(faces.front)}
            fill={palette.side}
            stroke={palette.stroke}
            strokeWidth={cell.isNow ? 1.2 : 0.7}
            strokeDasharray={dash}
          />
          <polygon
            points={pointsAttr(faces.top)}
            fill={palette.top}
            stroke={cell.isNow ? "var(--color-accent)" : palette.stroke}
            strokeWidth={cell.isNow ? 1.8 : 0.8}
            strokeDasharray={dash}
          />
        </>
      )}
      <polygon
        className="an-cube-focus"
        points={pointsAttr(faces.top)}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={1.6}
        pointerEvents="none"
      />
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

function GrowthTaskMark({
  mark,
  identifier,
  changeKind,
  onOpenTask,
}: {
  mark: GrowthTaskMarkLayout;
  identifier: string;
  changeKind?: AnatomyChangeKind;
  onOpenTask: (taskId: string) => void;
}) {
  const open = (event: MouseEvent<SVGGElement>) => {
    event.stopPropagation();
    onOpenTask(mark.taskId);
  };
  const key = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onOpenTask(mark.taskId);
    }
  };
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`任务 ${identifier}-${mark.sequenceId}：${mark.title}`}
      className="an-task cursor-pointer focus:outline-none"
      onClick={open}
      onKeyDown={key}
    >
      <title>{`${identifier}-${mark.sequenceId} · ${mark.title}`}</title>
      <line
        x1={mark.from.x}
        y1={mark.from.y}
        x2={mark.to.x}
        y2={mark.to.y}
        stroke="transparent"
        strokeWidth={12}
        pointerEvents="stroke"
      />
      <line
        x1={mark.from.x}
        y1={mark.from.y}
        x2={mark.to.x}
        y2={mark.to.y}
        stroke={markStroke(mark.tone)}
        strokeWidth={mark.tone === "active" ? 3.4 : 2.1}
        strokeDasharray={mark.tone === "cancelled" ? "2 2" : undefined}
        strokeLinecap="butt"
        pointerEvents="none"
      />
      {mark.isNow && (
        <circle
          cx={mark.from.x}
          cy={mark.from.y}
          r={2.2}
          fill="var(--color-accent)"
          pointerEvents="none"
        />
      )}
      {changeKind && (
        <circle
          cx={mark.to.x}
          cy={mark.to.y - 5}
          r={2}
          fill={changeKind === "created" ? "var(--color-accent)" : "var(--color-warning)"}
          pointerEvents="none"
        />
      )}
    </g>
  );
}

function StageLabel({
  label,
  serifSize,
  monoSize,
  accent,
}: {
  label: StageLabelLayout;
  serifSize: number;
  monoSize: number;
  accent: boolean;
}) {
  return (
    <g pointerEvents="none">
      <text
        x={label.x}
        y={label.y}
        textAnchor={label.anchor}
        fontFamily="Cormorant Garamond, Georgia, serif"
        fontStyle="italic"
        fontSize={serifSize}
        fill={accent ? "var(--color-accent)" : "var(--color-ink)"}
      >
        {label.text}
      </text>
      <text
        x={label.x}
        y={label.y + 15}
        textAnchor={label.anchor}
        fontFamily="JetBrains Mono, monospace"
        fontSize={monoSize}
        letterSpacing={0.4}
        fill={accent ? "var(--color-accent)" : "var(--color-ink-3)"}
      >
        {label.progressText}
      </text>
    </g>
  );
}

function stageInteraction(
  stageId: string,
  onSelectStage: (stageId: string) => void,
) {
  const select = (
    event: MouseEvent<SVGGElement> | KeyboardEvent<SVGGElement>,
  ) => {
    event.stopPropagation();
    onSelectStage(stageId);
  };
  const key = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(event);
    }
  };
  return { select, key };
}

function GrowthScene({
  layout,
  identifier,
  changeMarkers,
  onSelectStage,
  onOpenTask,
}: {
  layout: Extract<AnatomyLayout, { kind: "growth" }>;
  identifier: string;
  changeMarkers?: ReadonlyMap<string, AnatomyChangeKind>;
  onSelectStage: (stageId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const stageCount = layout.stages.length;
  const topStage = layout.stages[stageCount - 1];
  const bottomStage = layout.stages[0];
  const axisTop = topStage
    ? topStage.origin.y - topStage.z - topStage.h - 40
    : 120;
  const axisBottom = bottomStage ? bottomStage.origin.y + 24 : 0;

  return (
    <>
      <line
        x1={560}
        y1={axisTop}
        x2={560}
        y2={axisBottom}
        stroke="var(--color-rule)"
        strokeWidth={0.6}
        strokeDasharray="2 7"
        opacity={0.55}
        pointerEvents="none"
      />
      {layout.stages.map((stage) => (
        <GrowthStage
          key={stage.stageId}
          stage={stage}
          identifier={identifier}
          changeMarkers={changeMarkers}
          onSelectStage={onSelectStage}
          onOpenTask={onOpenTask}
        />
      ))}
      {stageCount > 1 && (
        <g pointerEvents="none">
          <line
            x1={1000}
            y1={axisBottom - 2}
            x2={1000}
            y2={axisTop + 18}
            stroke="var(--color-ink-3)"
            strokeWidth={0.8}
            strokeDasharray="3 4"
          />
          <polygon
            points={`996,${axisBottom - 9} 1004,${axisBottom - 9} 1000,${axisBottom - 2}`}
            fill="var(--color-ink-3)"
          />
          <polygon
            points={`996,${axisTop + 25} 1004,${axisTop + 25} 1000,${axisTop + 18}`}
            fill="var(--color-ink-3)"
          />
          <text
            x={988}
            y={(axisTop + axisBottom) / 2}
            textAnchor="end"
            fontFamily="JetBrains Mono, monospace"
            fontSize={8.5}
            letterSpacing={1.2}
            fill="var(--color-ink-3)"
            transform={`rotate(-90 988 ${(axisTop + axisBottom) / 2})`}
          >
            {`STAGE 01 → ${String(stageCount).padStart(2, "0")} · GROWTH`}
          </text>
        </g>
      )}
      {layout.loose && (
        <LooseTray
          layout={layout.loose}
          identifier={identifier}
          changeMarkers={changeMarkers}
          onOpenTask={onOpenTask}
        />
      )}
    </>
  );
}

function GrowthStage({
  stage,
  identifier,
  changeMarkers,
  onSelectStage,
  onOpenTask,
}: {
  stage: GrowthStageLayout;
  identifier: string;
  changeMarkers?: ReadonlyMap<string, AnatomyChangeKind>;
  onSelectStage: (stageId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const { origin, w, d, h, z } = stage;
  const faces = boxFaces(origin, -w / 2, -d / 2, z, w, d, h);
  const topFace = boxFaces(origin, -w / 2, -d / 2, z + h, w, d, 0).top;
  const accent = stage.selected || stage.current;
  const stroke = accent ? "var(--color-accent)" : "var(--color-ink-2)";
  const strokeWidth = accent ? 1.5 : 0.85;
  const topFill = accent ? "var(--color-accent-soft)" : "var(--color-paper)";
  const { select, key } = stageInteraction(stage.stageId, onSelectStage);
  const leftX = project(origin, -w / 2, 0, z + h).x;
  const currentTag = project(origin, w / 2 + 16, -d / 2, z + h);
  const overflow = project(origin, w / 2 + 4, d / 2, z + h / 2);

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`阶段 ${stage.stage.order}：${stage.stage.name}，记录进度 ${stage.stage.recordedProgress}%，${stage.stage.tasks.length} 个任务`}
      aria-pressed={stage.selected}
      className="an-stage cursor-pointer focus:outline-none"
      onClick={select}
      onKeyDown={key}
    >
      <title>{`阶段 ${stage.stage.order} · ${stage.stage.name} · ${stage.stage.recordedProgress}% · ${stage.stage.tasks.length} 任务`}</title>
      <polygon points={pointsAttr(faces.right)} fill="var(--color-paper-2)" stroke={stroke} strokeWidth={strokeWidth} />
      <polygon points={pointsAttr(faces.front)} fill="var(--color-paper-2)" stroke={stroke} strokeWidth={strokeWidth} />
      <polygon points={pointsAttr(faces.top)} fill={topFill} stroke={stroke} strokeWidth={strokeWidth} />
      <polygon
        className="an-focus-ring"
        points={pointsAttr(topFace)}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={2.2}
        pointerEvents="none"
      />
      <line
        x1={stage.label.x + 6}
        y1={stage.label.y - 6}
        x2={leftX - 8}
        y2={stage.label.y - 6}
        stroke={accent ? "var(--color-accent)" : "var(--color-rule)"}
        strokeWidth={accent ? 1 : 0.7}
        strokeDasharray="2 3"
        pointerEvents="none"
      />
      <circle
        cx={stage.label.x + 6}
        cy={stage.label.y - 6}
        r={accent ? 3 : 2}
        fill={accent ? "var(--color-accent)" : "var(--color-ink-3)"}
        pointerEvents="none"
      />
      <StageLabel
        label={stage.label}
        serifSize={stage.selected ? 21 : 19}
        monoSize={9}
        accent={stage.current}
      />
      {stage.current && (
        <text
          x={currentTag.x}
          y={currentTag.y}
          fontFamily="JetBrains Mono, monospace"
          fontSize={8}
          letterSpacing={1.4}
          fill="var(--color-accent)"
          pointerEvents="none"
        >
          CURRENT
        </text>
      )}
      {stage.hiddenTaskCount > 0 && (
        <text
          x={overflow.x}
          y={overflow.y}
          fontFamily="JetBrains Mono, monospace"
          fontSize={8}
          fill="var(--color-ink-3)"
          pointerEvents="none"
        >
          {`+${stage.hiddenTaskCount}`}
        </text>
      )}
      {stage.taskMarks.map((mark) => (
        <GrowthTaskMark
          key={mark.taskId}
          mark={mark}
          identifier={identifier}
          changeKind={changeMarkers?.get(mark.taskId)}
          onOpenTask={onOpenTask}
        />
      ))}
    </g>
  );
}

function StructureScene({
  layout,
  identifier,
  changeMarkers,
  onSelectStage,
  onOpenTask,
}: {
  layout: Extract<AnatomyLayout, { kind: "structure" }>;
  identifier: string;
  changeMarkers?: ReadonlyMap<string, AnatomyChangeKind>;
  onSelectStage: (stageId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const count = layout.stages.length;
  const axisEnd = layout.viewBox.w - 50;
  const axisTextX = (420 + axisEnd) / 2;

  return (
    <>
      <g opacity={0.58} pointerEvents="none">
        {layout.ghost.layers.map((layer) => {
          const faces = boxFaces(
            layer.origin,
            -layer.w / 2,
            -layer.d / 2,
            layer.z,
            layer.w,
            layer.d,
            layer.h,
          );
          const accent = layer.selected || layer.current;
          return (
            <g key={layer.stageId}>
              <polygon
                points={pointsAttr(faces.right)}
                fill="var(--color-paper-2)"
                stroke={accent ? "var(--color-accent)" : "var(--color-ink-3)"}
                strokeWidth={accent ? 0.9 : 0.7}
              />
              <polygon
                points={pointsAttr(faces.front)}
                fill="var(--color-paper-2)"
                stroke={accent ? "var(--color-accent)" : "var(--color-ink-3)"}
                strokeWidth={accent ? 0.9 : 0.7}
              />
              <polygon
                points={pointsAttr(faces.top)}
                fill={accent ? "var(--color-accent-soft)" : "var(--color-paper-2)"}
                stroke={accent ? "var(--color-accent)" : "var(--color-ink-3)"}
                strokeWidth={accent ? 0.9 : 0.7}
              />
              <text
                x={layout.ghost.origin.x + layout.ghost.w * 0.62 + 8}
                y={project(layer.origin, 0, 0, layer.z + layer.h).y + 3}
                fontFamily="JetBrains Mono, monospace"
                fontSize={8}
                letterSpacing={1}
                fill={layer.current ? "var(--color-accent)" : "var(--color-ink-3)"}
              >
                {String(layer.order).padStart(2, "0")}
              </text>
            </g>
          );
        })}
      </g>
      <g pointerEvents="none">
        <text
          x={62}
          y={380}
          fontFamily="Cormorant Garamond, Georgia, serif"
          fontStyle="italic"
          fontSize={19}
          fill="var(--color-ink-2)"
        >
          Project whole
        </text>
        <text
          x={62}
          y={395}
          fontFamily="JetBrains Mono, monospace"
          fontSize={8}
          letterSpacing={1.2}
          fill="var(--color-ink-3)"
        >
          {`${String(count).padStart(2, "0")} STAGE LAYERS`}
        </text>
        <text
          x={455}
          y={226}
          fontFamily="JetBrains Mono, monospace"
          fontSize={8}
          letterSpacing={1.2}
          fill="var(--color-ink-3)"
        >
          EXPLODED STAGE MODULES / HORIZONTAL
        </text>
        <line
          x1={420}
          y1={600}
          x2={axisEnd}
          y2={600}
          stroke="var(--color-ink-3)"
          strokeWidth={0.8}
          strokeDasharray="3 5"
        />
        <polygon
          points={`${axisEnd - 7},596 ${axisEnd - 7},604 ${axisEnd},600`}
          fill="var(--color-ink-3)"
        />
        <text
          x={axisTextX}
          y={618}
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace"
          fontSize={8.5}
          letterSpacing={1.2}
          fill="var(--color-ink-3)"
        >
          STAGE ORDER · NOT TASK DEPENDENCIES
        </text>
        <text
          x={62}
          y={625}
          fontFamily="JetBrains Mono, monospace"
          fontSize={8}
          letterSpacing={1}
          fill="var(--color-ink-3)"
        >
          DASHED · ORIGINAL POSITION
        </text>
      </g>
      {layout.stages.map((stage) => (
        <g key={stage.stageId}>
          <line
            x1={stage.connector.from.x}
            y1={stage.connector.from.y}
            x2={stage.connector.to.x}
            y2={stage.connector.to.y}
            stroke={stage.selected ? "var(--color-accent)" : "var(--color-rule)"}
            strokeWidth={stage.selected ? 0.9 : 0.65}
            strokeDasharray="2 5"
            pointerEvents="none"
          />
          <StructureStage
            stage={stage}
            identifier={identifier}
            changeMarkers={changeMarkers}
            onSelectStage={onSelectStage}
            onOpenTask={onOpenTask}
          />
        </g>
      ))}
      {layout.loose && (
        <LooseTray
          layout={layout.loose}
          identifier={identifier}
          changeMarkers={changeMarkers}
          onOpenTask={onOpenTask}
        />
      )}
    </>
  );
}

function StructureStage({
  stage,
  identifier,
  changeMarkers,
  onSelectStage,
  onOpenTask,
}: {
  stage: StructureStageLayout;
  identifier: string;
  changeMarkers?: ReadonlyMap<string, AnatomyChangeKind>;
  onSelectStage: (stageId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const { origin, w, d, h } = stage;
  const faces = boxFaces(origin, -w / 2, -d / 2, 0, w, d, h);
  const topFace = boxFaces(origin, -w / 2, -d / 2, h, w, d, 0).top;
  const accent = stage.selected || stage.current;
  const stroke = accent ? "var(--color-accent)" : "var(--color-ink-2)";
  const strokeWidth = accent ? 1.5 : 0.85;
  const topFill = accent ? "var(--color-accent-soft)" : "var(--color-paper)";
  const { select, key } = stageInteraction(stage.stageId, onSelectStage);

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`阶段 ${stage.stage.order}：${stage.stage.name}，记录进度 ${stage.stage.recordedProgress}%，${stage.stage.tasks.length} 个任务`}
      aria-pressed={stage.selected}
      className="an-stage cursor-pointer focus:outline-none"
      onClick={select}
      onKeyDown={key}
    >
      <title>{`阶段 ${stage.stage.order} · ${stage.stage.name} · ${stage.stage.recordedProgress}% · ${stage.stage.tasks.length} 任务`}</title>
      <polygon points={pointsAttr(faces.right)} fill="var(--color-paper-2)" stroke={stroke} strokeWidth={strokeWidth} />
      <polygon points={pointsAttr(faces.front)} fill="var(--color-paper-2)" stroke={stroke} strokeWidth={strokeWidth} />
      <polygon points={pointsAttr(faces.top)} fill={topFill} stroke={stroke} strokeWidth={strokeWidth} />
      <polygon
        className="an-focus-ring"
        points={pointsAttr(topFace)}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={2.2}
        pointerEvents="none"
      />
      {stage.tasks.map((cell) => (
        <TaskCube
          key={cell.taskId}
          cell={cell}
          origin={origin}
          identifier={identifier}
          changeKind={changeMarkers?.get(cell.taskId)}
          onOpenTask={onOpenTask}
        />
      ))}
      {stage.hiddenTaskCount > 0 && (
        <text
          x={origin.x + w * 0.31 + 10}
          y={origin.y + d * ISO_SIN + h + 7}
          fontFamily="JetBrains Mono, monospace"
          fontSize={7.5}
          fill="var(--color-ink-3)"
          pointerEvents="none"
        >
          {`+${stage.hiddenTaskCount}`}
        </text>
      )}
      {stage.current && (
        <text
          x={origin.x}
          y={origin.y - d * ISO_SIN - 16}
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace"
          fontSize={8}
          letterSpacing={1.2}
          fill="var(--color-accent)"
          pointerEvents="none"
        >
          CURRENT
        </text>
      )}
      <StageLabel
        label={stage.label}
        serifSize={stage.selected ? 17 : 16}
        monoSize={8}
        accent={stage.current}
      />
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
    <g>
      <polygon
        points={pointsAttr(faces.top)}
        fill="none"
        stroke="var(--color-ink-3)"
        strokeWidth={0.8}
        strokeDasharray="4 4"
      />
      {layout.tasks.map((cell) => (
        <TaskCube
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
        y={layout.origin.y + layout.d * ISO_SIN + layout.h + 16}
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={11}
        fill="var(--color-ink-2)"
        pointerEvents="none"
      >
        {layout.label}
      </text>
    </g>
  );
}

function EmptyBase({ empty }: { empty: EmptyBaseLayout }) {
  const top = boxFaces(empty.origin, -empty.w / 2, -empty.d / 2, 0, empty.w, empty.d, empty.h).top;
  return (
    <g pointerEvents="none">
      <polygon
        points={pointsAttr(top)}
        fill="none"
        stroke="var(--color-ink-3)"
        strokeWidth={0.9}
        strokeDasharray="5 5"
      />
      <text
        x={empty.origin.x}
        y={empty.origin.y + empty.d * ISO_SIN + 26}
        textAnchor="middle"
        fontFamily="Cormorant Garamond, Georgia, serif"
        fontStyle="italic"
        fontSize={22}
        fill="var(--color-ink-2)"
      >
        这张图纸还没有结构。
      </text>
    </g>
  );
}

export function AnatomyScene({
  layout,
  identifier,
  changeMarkers,
  onSelectStage,
  onOpenTask,
}: AnatomySceneProps) {
  const titleId = "anatomy-title";
  const descId = "anatomy-desc";
  const isStructure = layout.kind === "structure";
  // 5 阶段的常规结构图缩放到容器宽度即可；只有模块特别多时才启用横向滚动，
  // 避免为了“全放得下”把每个模块压到不可读。
  const minWidth =
    isStructure && layout.viewBox.w > 1600
      ? Math.min(2400, Math.max(900, Math.round(layout.viewBox.w * 0.6)))
      : undefined;

  return (
    <svg
      viewBox={`${layout.viewBox.x} ${layout.viewBox.y} ${layout.viewBox.w} ${layout.viewBox.h}`}
      role="group"
      aria-labelledby={`${titleId} ${descId}`}
      style={{
        width: "100%",
        height: "auto",
        display: "block",
        minWidth,
        minHeight: 280,
      }}
    >
      <title id={titleId}>项目解剖图</title>
      <desc id={descId}>
        {isStructure
          ? "结构视图：左侧为整体层叠，右侧为水平拆开的阶段构件，虚线表示原始位置；只读。"
          : "生长视图：阶段自下而上累积，任务以真实状态画在前缘；只读。"}
      </desc>
      {layout.emptyBase && <EmptyBase empty={layout.emptyBase} />}
      {layout.kind === "growth" ? (
        <GrowthScene
          layout={layout}
          identifier={identifier}
          changeMarkers={changeMarkers}
          onSelectStage={onSelectStage}
          onOpenTask={onOpenTask}
        />
      ) : (
        <StructureScene
          layout={layout}
          identifier={identifier}
          changeMarkers={changeMarkers}
          onSelectStage={onSelectStage}
          onOpenTask={onOpenTask}
        />
      )}
    </svg>
  );
}
