/**
 * Anatomy V3 确定性布局。
 *
 * 两套布局共享同一 Stage/Task 身份与详情：
 * - growth：Stage 沿 z 轴累积（旧下新上），Task 画在前缘密度线上；
 * - structure：左侧 ghost 整体堆叠 + 右侧水平爆炸模块，虚线回连原位。
 *
 * 输入只包含视图模型、选中 Stage 与固定几何参数；不读 DOM、不改数据、
 * 不推断任务依赖。相同输入必然得到相同输出。
 */

import type { AnatomyStage, AnatomyTask, AnatomyViewModel } from "./model";
import { defaultStageId } from "./model";
import {
  boundsOf,
  boxFaces,
  clamp,
  estimateTextWidth,
  ISO_COS,
  ISO_SIN,
  project,
  truncateToWidth,
  unionBounds,
  type IsoOrigin,
  type Point,
  type Rect,
} from "./geometry";
import type { AnatomyViewState } from "./state";

export interface TaskCellLayout {
  taskId: string;
  sequenceId: number;
  title: string;
  tone: AnatomyTask["tone"];
  /** 局部坐标（相对 stage origin，盒子最小角）。 */
  x: number;
  y: number;
  z: number;
  size: number;
  /** 太小的时候用平面方块，避免 cube 面线糊成一团。 */
  flat: boolean;
  isNow: boolean;
  bounds: Rect;
}

export interface GrowthTaskMarkLayout {
  taskId: string;
  sequenceId: number;
  title: string;
  tone: AnatomyTask["tone"];
  isNow: boolean;
  from: Point;
  to: Point;
  bounds: Rect;
}

export interface StageLabelLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  progressText: string;
  anchor: "start" | "middle" | "end";
}

export interface GrowthStageLayout {
  stageId: string;
  stage: AnatomyStage;
  origin: IsoOrigin;
  z: number;
  w: number;
  d: number;
  h: number;
  selected: boolean;
  current: boolean;
  label: StageLabelLayout;
  taskMarks: GrowthTaskMarkLayout[];
  hiddenTaskCount: number;
  bounds: Rect;
}

export interface GrowthLayout {
  kind: "growth";
  viewBox: Rect;
  stages: GrowthStageLayout[];
  loose: LooseTrayLayout | null;
  emptyBase: EmptyBaseLayout | null;
}

export interface StructureGhostLayerLayout {
  stageId: string;
  order: number;
  origin: IsoOrigin;
  z: number;
  w: number;
  d: number;
  h: number;
  selected: boolean;
  current: boolean;
  bounds: Rect;
}

export interface StructureStageLayout {
  stageId: string;
  stage: AnatomyStage;
  origin: IsoOrigin;
  w: number;
  d: number;
  h: number;
  selected: boolean;
  current: boolean;
  label: StageLabelLayout;
  tasks: TaskCellLayout[];
  hiddenTaskCount: number;
  connector: { from: Point; to: Point };
  bounds: Rect;
}

export interface StructureLayout {
  kind: "structure";
  viewBox: Rect;
  ghost: {
    origin: IsoOrigin;
    w: number;
    d: number;
    h: number;
    step: number;
    layers: StructureGhostLayerLayout[];
  };
  stages: StructureStageLayout[];
  loose: LooseTrayLayout | null;
  emptyBase: EmptyBaseLayout | null;
}

export interface LooseTrayLayout {
  origin: IsoOrigin;
  w: number;
  d: number;
  h: number;
  label: string;
  tasks: TaskCellLayout[];
  bounds: Rect;
}

export interface EmptyBaseLayout {
  origin: IsoOrigin;
  w: number;
  d: number;
  h: number;
  bounds: Rect;
}

export type AnatomyLayout = GrowthLayout | StructureLayout;

/* ------------------------------ shared ------------------------------ */

const GROWTH_W = 1060;
const GROWTH_MARGIN_TOP = 80;
const GROWTH_W_SLAB = 380;
const GROWTH_D_SLAB = 220;
const GROWTH_H_SLAB = 30;
const GROWTH_MAX_MARKS = 14;

const STRUCTURE_START_X = 455;
const STRUCTURE_STEP = 185;
const STRUCTURE_BASE_Y = 300;
const STRUCTURE_W_SLAB = 120;
const STRUCTURE_D_SLAB = 76;
const STRUCTURE_H_SLAB = 22;
const STRUCTURE_MAX_CELLS = 12;
const STRUCTURE_GHOST_X = 190;
const STRUCTURE_GHOST_Y = 540;
const STRUCTURE_GHOST_W = 240;
const STRUCTURE_GHOST_D = 130;
const STRUCTURE_GHOST_SPAN = 136;
const STRUCTURE_H = 760;

function rectOfLabel(label: StageLabelLayout): Rect {
  const x =
    label.anchor === "end"
      ? label.x - label.width
      : label.anchor === "middle"
        ? label.x - label.width / 2
        : label.x;
  return { x, y: label.y - label.height + 4, w: label.width, h: label.height };
}

function pointRect(from: Point, to: Point, pad = 1): Rect {
  const x = Math.min(from.x, to.x) - pad;
  const y = Math.min(from.y, to.y) - pad;
  return {
    x,
    y,
    w: Math.abs(from.x - to.x) + pad * 2,
    h: Math.abs(from.y - to.y) + pad * 2,
  };
}

function stageBoxBounds(
  origin: IsoOrigin,
  w: number,
  d: number,
  h: number,
): Rect {
  const p = (x: number, y: number, z: number) => project(origin, x, y, z);
  return boundsOf([
    p(-w / 2, -d / 2, 0),
    p(w / 2, -d / 2, 0),
    p(w / 2, d / 2, 0),
    p(-w / 2, d / 2, 0),
    p(-w / 2, -d / 2, h),
    p(w / 2, -d / 2, h),
    p(w / 2, d / 2, h),
    p(-w / 2, d / 2, h),
  ]);
}

function taskCells(
  origin: IsoOrigin,
  w: number,
  d: number,
  h: number,
  tasks: readonly AnatomyTask[],
  nowTaskId: string | null,
  scale = 1,
): TaskCellLayout[] {
  const n = tasks.length;
  if (!n) return [];
  const cols = Math.min(8, Math.max(1, Math.ceil(Math.sqrt(n * 1.4))));
  const rows = Math.ceil(n / cols);
  const stepU = (w * 0.78) / cols;
  const stepV = (d * 0.72) / rows;
  const size = Math.max(3, Math.min(14 * scale, stepU * 0.58, stepV * 0.64));

  return tasks.map((task, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const u = (col - (cols - 1) / 2) * stepU;
    const v = (row - (rows - 1) / 2) * stepV;
    const x = u - size / 2;
    const y = v - size / 2;
    const z = h;
    const faces = boxFaces(origin, x, y, z, size, size, size * 0.72);
    const bounds = boundsOf([...faces.top, ...faces.right, ...faces.front]);
    return {
      taskId: task.id,
      sequenceId: task.sequenceId,
      title: task.title,
      tone: task.tone,
      x,
      y,
      z,
      size,
      flat: size < 6,
      isNow: task.id === nowTaskId,
      bounds,
    };
  });
}

function looseTrayLayout(
  origin: IsoOrigin,
  w: number,
  d: number,
  h: number,
  tasks: readonly AnatomyTask[],
  nowTaskId: string | null,
  scale = 0.9,
): LooseTrayLayout {
  const cells = taskCells(origin, w, d, h, tasks, nowTaskId, scale);
  const hasNow = tasks.some((task) => task.id === nowTaskId);
  const label = `散件 · 未归属阶段 (${tasks.length})${hasNow ? " · NOW" : ""}`;
  const labelY = origin.y + d * ISO_SIN + h + 16;
  const labelWidth = estimateTextWidth(label, 12);
  const labelRect: Rect = {
    x: origin.x - labelWidth / 2,
    y: labelY - 10,
    w: labelWidth,
    h: 18,
  };
  const box = stageBoxBounds(origin, w, d, h);
  return {
    origin,
    w,
    d,
    h,
    label,
    tasks: cells,
    bounds: unionBounds([box, labelRect, ...cells.map((cell) => cell.bounds)]),
  };
}

function emptyBaseLayout(origin: IsoOrigin): EmptyBaseLayout {
  const w = 360;
  const d = 180;
  const h = 8;
  const faces = boxFaces(origin, -w / 2, -d / 2, 0, w, d, h);
  return {
    origin,
    w,
    d,
    h,
    bounds: boundsOf([...faces.top, ...faces.right, ...faces.front]),
  };
}

function findSelectedId(
  viewModel: AnatomyViewModel,
  selected: string | null,
): string | null {
  if (selected && viewModel.stages.some((stage) => stage.id === selected)) {
    return selected;
  }
  return defaultStageId(viewModel);
}

/* ------------------------------ growth ------------------------------ */

function growthStep(count: number): number {
  if (count <= 8) return 112;
  if (count <= 16) return 96;
  if (count <= 30) return 80;
  return 64;
}

export function computeGrowthLayout(
  viewModel: AnatomyViewModel,
  selectedStageId: string | null = null,
): GrowthLayout {
  const stages = viewModel.stages;
  const count = stages.length;
  const selectedId = findSelectedId(viewModel, selectedStageId);
  const hasLoose = viewModel.looseTasks.length > 0;
  const step = growthStep(count);
  const w = GROWTH_W_SLAB;
  const d = GROWTH_D_SLAB;
  const h = GROWTH_H_SLAB;
  // 画布略偏右，给左侧 Stage 注记留出稳定空间（与原型一致）。
  const centerX = 560;
  const footprint = (w / 2 + d / 2) * ISO_SIN;

  if (count === 0) {
    const emptyBase = emptyBaseLayout({ x: 380, y: 180 });
    const loose = hasLoose
      ? looseTrayLayout(
          { x: 380, y: 400 },
          220,
          90,
          8,
          viewModel.looseTasks,
          viewModel.nowTaskId,
        )
      : null;
    return {
      kind: "growth",
      viewBox: { x: 0, y: 0, w: 760, h: loose ? 620 : 460 },
      stages: [],
      loose,
      emptyBase,
    };
  }

  const baseY = GROWTH_MARGIN_TOP + (count - 1) * step + footprint + h;
  const bottomY = baseY + footprint;
  const looseY = bottomY + 70;
  const loose = hasLoose
    ? looseTrayLayout(
        { x: GROWTH_W - 170, y: looseY },
        200,
        88,
        8,
        viewModel.looseTasks,
        viewModel.nowTaskId,
      )
    : null;

  const growthStages: GrowthStageLayout[] = stages.map((stage, index) => {
    const z = index * step;
    const origin = { x: centerX, y: baseY };
    const selected = stage.id === selectedId;
    const current = stage.isCurrent;
    const topCenterY = project(origin, 0, 0, z + h).y;
    const labelX = centerX - (w / 2 + d / 2) * ISO_COS - 26;
    const labelMaxWidth = 250;
    const labelText = `${String(stage.order).padStart(2, "0")} ${truncateToWidth(
      stage.name,
      labelMaxWidth - 34,
      19,
    )}`;
    const progressText = `${stage.recordedProgress}% · w${stage.weight} · ${stage.tasks.length} TASK${
      current ? " · CURRENT" : ""
    }`;
    const label: StageLabelLayout = {
      x: labelX,
      y: topCenterY + 4,
      width: Math.min(
        labelMaxWidth,
        Math.max(estimateTextWidth(labelText, 19), estimateTextWidth(progressText, 9)),
      ),
      height: 32,
      text: labelText,
      progressText,
      anchor: "end",
    };

    const shown = stage.tasks.slice(0, GROWTH_MAX_MARKS);
    const startX = -w / 2 + 24;
    const endX = w / 2 - 24;
    const taskMarks = shown.map((task, taskIndex) => {
      const x =
        shown.length === 1
          ? 0
          : startX + (taskIndex / (shown.length - 1)) * (endX - startX);
      const from = project(origin, x, d / 2, z + 3);
      const to = project(origin, x, d / 2, z + h - 3);
      return {
        taskId: task.id,
        sequenceId: task.sequenceId,
        title: task.title,
        tone: task.tone,
        isNow: task.id === viewModel.nowTaskId,
        from,
        to,
        bounds: pointRect(from, to),
      };
    });

    const box = stageBoxBounds(origin, w, d, h);
    return {
      stageId: stage.id,
      stage,
      origin,
      z,
      w,
      d,
      h,
      selected,
      current,
      label,
      taskMarks,
      hiddenTaskCount: Math.max(0, stage.tasks.length - shown.length),
      bounds: unionBounds([
        { ...box, y: box.y - z, h: box.h },
        rectOfLabel(label),
        ...taskMarks.map((mark) => mark.bounds),
      ]),
    };
  });

  const viewBox: Rect = {
    x: 0,
    y: 0,
    w: GROWTH_W,
    h: Math.max(bottomY + 50, loose ? loose.bounds.y + loose.bounds.h + 30 : 0),
  };

  return {
    kind: "growth",
    viewBox,
    stages: growthStages,
    loose,
    emptyBase: null,
  };
}

/* ---------------------------- structure ---------------------------- */

export function computeStructureLayout(
  viewModel: AnatomyViewModel,
  selectedStageId: string | null = null,
): StructureLayout {
  const stages = viewModel.stages;
  const count = stages.length;
  const selectedId = findSelectedId(viewModel, selectedStageId);
  const hasLoose = viewModel.looseTasks.length > 0;

  if (count === 0) {
    const emptyBase = emptyBaseLayout({ x: 380, y: 200 });
    const loose = hasLoose
      ? looseTrayLayout(
          { x: 380, y: 400 },
          220,
          90,
          8,
          viewModel.looseTasks,
          viewModel.nowTaskId,
        )
      : null;
    return {
      kind: "structure",
      viewBox: { x: 0, y: 0, w: 760, h: loose ? 620 : 460 },
      ghost: {
        origin: { x: STRUCTURE_GHOST_X, y: STRUCTURE_GHOST_Y },
        w: 0,
        d: 0,
        h: 0,
        step: 0,
        layers: [],
      },
      stages: [],
      loose,
      emptyBase,
    };
  }

  const lastX = STRUCTURE_START_X + (count - 1) * STRUCTURE_STEP;
  const viewW = Math.max(
    1280,
    lastX + STRUCTURE_W_SLAB / 2 + 60,
  );
  const ghostStep = count <= 1 ? 0 : STRUCTURE_GHOST_SPAN / (count - 1);
  const ghostH = Math.max(4, Math.min(10, ghostStep * 0.6));

  const ghostLayers: StructureGhostLayerLayout[] = stages.map((stage, index) => {
    const z = index * ghostStep;
    const origin = { x: STRUCTURE_GHOST_X, y: STRUCTURE_GHOST_Y };
    const box = stageBoxBounds(origin, STRUCTURE_GHOST_W, STRUCTURE_GHOST_D, ghostH);
    return {
      stageId: stage.id,
      order: stage.order,
      origin,
      z,
      w: STRUCTURE_GHOST_W,
      d: STRUCTURE_GHOST_D,
      h: ghostH,
      selected: stage.id === selectedId,
      current: stage.isCurrent,
      bounds: { ...box, y: box.y - z },
    };
  });

  const structureStages: StructureStageLayout[] = stages.map((stage, index) => {
    const selected = stage.id === selectedId;
    const current = stage.isCurrent;
    const lift = selected ? 22 : 0;
    const origin = {
      x: STRUCTURE_START_X + index * STRUCTURE_STEP,
      y: STRUCTURE_BASE_Y + (index % 2 === 0 ? -8 : 34) - lift,
    };
    const w = STRUCTURE_W_SLAB;
    const d = STRUCTURE_D_SLAB;
    const h = STRUCTURE_H_SLAB;
    const ghostLayer = ghostLayers[index]!;
    // 从 ghost 层的右缘连到模块左前侧，避开模块下方居中的标签。
    const from = project(
      ghostLayer.origin,
      STRUCTURE_GHOST_W / 2,
      0,
      ghostLayer.z + ghostH,
    );
    const to = project(origin, -w / 2, d / 2, h / 2);
    const labelY = origin.y + d * ISO_SIN + 50;
    const labelMaxWidth = STRUCTURE_STEP - 20;
    const labelText = `${String(stage.order).padStart(2, "0")} ${truncateToWidth(
      stage.name,
      labelMaxWidth - 24,
      16,
    )}`;
    const progressText = `${stage.recordedProgress}% · w${stage.weight} · ${stage.tasks.length} TASK`;
    const label: StageLabelLayout = {
      x: origin.x,
      y: labelY,
      width: Math.min(
        labelMaxWidth,
        Math.max(estimateTextWidth(labelText, 16), estimateTextWidth(progressText, 8)),
      ),
      height: 30,
      text: labelText,
      progressText,
      anchor: "middle",
    };

    const shown = stage.tasks.slice(0, STRUCTURE_MAX_CELLS);
    const cells = taskCells(
      origin,
      w,
      d,
      h,
      shown,
      viewModel.nowTaskId,
      selected ? 1.15 : 1,
    );
    const box = stageBoxBounds(origin, w, d, h);

    return {
      stageId: stage.id,
      stage,
      origin,
      w,
      d,
      h,
      selected,
      current,
      label,
      tasks: cells,
      hiddenTaskCount: Math.max(0, stage.tasks.length - shown.length),
      connector: { from, to },
      bounds: unionBounds([box, rectOfLabel(label), ...cells.map((cell) => cell.bounds)]),
    };
  });

  const ghostBottom =
    STRUCTURE_GHOST_Y + (STRUCTURE_GHOST_W / 2 + STRUCTURE_GHOST_D / 2) * ISO_SIN;
  const viewH = Math.max(STRUCTURE_H, ghostBottom + 80);
  const loose = hasLoose
    ? looseTrayLayout(
        { x: viewW - 190, y: viewH - 95 },
        180,
        56,
        8,
        viewModel.looseTasks,
        viewModel.nowTaskId,
      )
    : null;

  return {
    kind: "structure",
    viewBox: { x: 0, y: 0, w: viewW, h: viewH },
    ghost: {
      origin: { x: STRUCTURE_GHOST_X, y: STRUCTURE_GHOST_Y },
      w: STRUCTURE_GHOST_W,
      d: STRUCTURE_GHOST_D,
      h: ghostH,
      step: ghostStep,
      layers: ghostLayers,
    },
    stages: structureStages,
    loose,
    emptyBase: null,
  };
}

export function computeAnatomyLayout(
  viewModel: AnatomyViewModel,
  viewState: AnatomyViewState = { mode: "growth", selectedStageId: null },
): AnatomyLayout {
  return viewState.mode === "structure"
    ? computeStructureLayout(viewModel, viewState.selectedStageId)
    : computeGrowthLayout(viewModel, viewState.selectedStageId);
}

/* ------------------------------ tests ------------------------------ */

/** 测试/调试用：判断一个矩形是否完全落在 viewBox 内。 */
export function isInside(rect: Rect, viewBox: Rect, margin = 0): boolean {
  return (
    rect.x >= viewBox.x + margin &&
    rect.y >= viewBox.y + margin &&
    rect.x + rect.w <= viewBox.x + viewBox.w - margin &&
    rect.y + rect.h <= viewBox.y + viewBox.h - margin
  );
}

/** 测试/调试用：两个矩形的重叠面积。 */
export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** 视图模型 → 唯一派生的展示计数（不参与业务计算）。 */
export function anatomyCounts(viewModel: AnatomyViewModel) {
  const total = viewModel.stages.reduce((sum, stage) => sum + stage.tasks.length, 0);
  return {
    stages: viewModel.stages.length,
    tasks: total + viewModel.looseTasks.length,
    loose: viewModel.looseTasks.length,
  };
}

/** 给 SVG 渲染层使用的安全 clamp（不改变模型值）。 */
export function labelProgress(stage: AnatomyStage): number {
  return clamp(stage.recordedProgress, 0, 100);
}

export const ANATOMY_CANVAS_WIDTH = GROWTH_W;
