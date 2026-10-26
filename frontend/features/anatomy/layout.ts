/**
 * Anatomy V2 确定性布局（Phase 1）。
 *
 * 输入只包含视图模型、空间状态与逻辑画布宽度；输出稳定坐标/包围盒。
 * 不读 DOM、不改数据、不推断依赖；相同输入必然得到相同输出。
 */

import type { AnatomyStage, AnatomyTask, AnatomyViewModel } from "./model";
import {
  boundsOf,
  boxFaces,
  clamp,
  estimateTextWidth,
  ISO_SIN,
  project,
  truncateToWidth,
  unionBounds,
  type IsoOrigin,
  type Rect,
} from "./geometry";

export type SpatialState =
  | { mode: "overview" }
  | { mode: "focus"; stageId: string };

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

export interface StageLabelLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  text: string;
  progressText: string;
}

export interface StageLayout {
  stageId: string;
  stage: AnatomyStage;
  origin: IsoOrigin;
  w: number;
  d: number;
  h: number;
  opacity: number;
  thin: boolean;
  label: StageLabelLayout;
  tasks: TaskCellLayout[];
  bounds: Rect;
}

export interface LooseTrayLayout {
  origin: IsoOrigin;
  w: number;
  d: number;
  h: number;
  label: string;
  opacity: number;
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

export interface AnatomyLayout {
  viewBox: Rect;
  stages: StageLayout[];
  loose: LooseTrayLayout | null;
  emptyBase: EmptyBaseLayout | null;
}

const CANVAS_W_MAX = 1200;
const TOP = 80;
const BOTTOM = 20;
const LOOSE_AREA_H = 170;

interface GridSpec {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  w: number;
  d: number;
}

function gridSpec(count: number, canvasW: number, marginX: number): GridSpec {
  const cols = count <= 1 ? 1 : count === 2 ? 2 : count === 3 ? 3 : count === 4 ? 2 : 4;
  const rows = Math.max(1, Math.ceil(count / cols));
  const cellW = (canvasW - marginX * 2) / cols;
  // 4 行以上给标签与上一行留出垂直间距，避免包围盒相撞。
  const cellH = count <= 1 ? 320 : count <= 3 ? 340 : rows === 2 ? 260 : 224;
  const w = count <= 1 ? 360 : Math.min(240, cellW * 0.66);
  const d = count <= 1 ? 200 : Math.min(160, cellH * 0.42);
  return { cols, rows, cellW, cellH, w, d };
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
    const faces = boxFaces(origin, x, y, h, size, size, size * 0.72);
    const bounds = boundsOf([...faces.top, ...faces.right, ...faces.front]);
    return {
      taskId: task.id,
      sequenceId: task.sequenceId,
      title: task.title,
      tone: task.tone,
      x,
      y,
      z: h,
      size,
      flat: size < 6,
      isNow: task.id === nowTaskId,
      bounds,
    };
  });
}

function labelFor(
  stage: AnatomyStage,
  origin: IsoOrigin,
  d: number,
  h: number,
  opacity: number,
  maxWidth: number,
  hasNow: boolean,
): StageLabelLayout {
  const nameFont = 20;
  const order = `${String(stage.order).padStart(2, "0")} `;
  const name = truncateToWidth(stage.name, Math.max(40, maxWidth - 30), nameFont);
  const text = `${order}${name}`;
  const progressText = `${stage.recordedProgress}% · w${stage.weight}${hasNow ? " · NOW" : ""}`;
  const width = Math.min(
    maxWidth,
    Math.max(estimateTextWidth(text, nameFont), estimateTextWidth(progressText, 11)),
  );
  return {
    x: origin.x,
    y: origin.y + d * ISO_SIN + h + 26,
    width,
    height: 30,
    opacity,
    text,
    progressText,
  };
}

function stageBounds(
  origin: IsoOrigin,
  w: number,
  d: number,
  h: number,
  label: StageLabelLayout,
  tasks: readonly TaskCellLayout[],
): Rect {
  const p = (x: number, y: number, z: number) => project(origin, x, y, z);
  const box = boundsOf([
    p(-w / 2, -d / 2, 0),
    p(w / 2, -d / 2, 0),
    p(w / 2, d / 2, 0),
    p(-w / 2, d / 2, 0),
    p(-w / 2, -d / 2, h),
    p(w / 2, -d / 2, h),
    p(w / 2, d / 2, h),
    p(-w / 2, d / 2, h),
  ]);
  const labelRect = {
    x: label.x - label.width / 2,
    y: label.y - label.height + 4,
    w: label.width,
    h: label.height,
  };
  return unionBounds([box, labelRect, ...tasks.map((task) => task.bounds)]);
}

export function computeAnatomyLayout(
  viewModel: AnatomyViewModel,
  spatial: SpatialState = { mode: "overview" },
): AnatomyLayout {
  const count = viewModel.stages.length;
  const hasLoose = viewModel.looseTasks.length > 0;
  const focusId =
    spatial.mode === "focus" &&
    viewModel.stages.some((stage) => stage.id === spatial.stageId)
      ? spatial.stageId
      : null;
  const canvasW = count <= 1 ? 760 : count === 2 ? 900 : count === 3 ? 1000 : count <= 8 ? 1050 : CANVAS_W_MAX;
  const marginX = count <= 3 ? 40 : 70;
  const spec = gridSpec(count, canvasW, marginX);
  const stageAreaH = count === 0 ? 320 : TOP + BOTTOM + spec.rows * spec.cellH;
  const focusAreaH = 560;
  const canvasH = (focusId ? focusAreaH : stageAreaH) + (hasLoose ? LOOSE_AREA_H : 20);
  const viewBox = { x: 0, y: 0, w: canvasW, h: canvasH };

  const stages: StageLayout[] = viewModel.stages.map((stage, index) => {
    const col = index % spec.cols;
    const row = Math.floor(index / spec.cols);
    const baseX = marginX + spec.cellW * (col + 0.5);
    const baseY = TOP + spec.cellH * (row + 0.5) + (row % 2 === 1 ? 10 : 0);
    const focused = focusId === stage.id;
    const ghost = focusId !== null && !focused;
    const w = focused ? 360 : ghost ? Math.min(150, spec.w) : spec.w;
    const d = focused ? 200 : ghost ? Math.min(90, spec.d) : spec.d;
    const h = focused ? 42 : ghost ? 18 : 34;
    const origin: IsoOrigin = {
      x: focused ? canvasW / 2 : baseX,
      y: (focused ? 300 : baseY) + h / 2,
    };
    const opacity = ghost ? 0.12 : 1;
    const maxLabelWidth = focused ? 360 : Math.min(320, spec.cellW - 18);
    const hasNow = stage.tasks.some((task) => task.id === viewModel.nowTaskId);
    const label = labelFor(stage, origin, d, h, ghost ? 0.16 : 1, maxLabelWidth, hasNow);
    const tasks = ghost
      ? []
      : taskCells(origin, w, d, h, stage.tasks, viewModel.nowTaskId, focused ? 1.25 : 1);
    return {
      stageId: stage.id,
      stage,
      origin,
      w,
      d,
      h,
      opacity,
      thin: ghost,
      label,
      tasks,
      bounds: stageBounds(origin, w, d, h, label, tasks),
    };
  });

  let loose: LooseTrayLayout | null = null;
  if (hasLoose) {
    const w = Math.min(420, canvasW * 0.45);
    const d = 90;
    const h = 10;
    const origin: IsoOrigin = {
      x: canvasW / 2,
      y: (focusId ? focusAreaH : stageAreaH) + 55 + h / 2,
    };
    const tasks = taskCells(
      origin,
      w,
      d,
      h,
      viewModel.looseTasks,
      viewModel.nowTaskId,
      0.9,
    );
    const labelY = origin.y + d * ISO_SIN + h + 14;
    const hasLooseNow = viewModel.looseTasks.some((task) => task.id === viewModel.nowTaskId);
    const label = `散件 · 未归属阶段 (${viewModel.looseTasks.length})${hasLooseNow ? " · NOW" : ""}`;
    const labelRect = {
      x: origin.x - estimateTextWidth(label, 12) / 2,
      y: labelY - 10,
      w: estimateTextWidth(label, 12),
      h: 18,
    };
    const p = (x: number, y: number, z: number) => project(origin, x, y, z);
    const box = boundsOf([
      p(-w / 2, -d / 2, 0),
      p(w / 2, -d / 2, 0),
      p(w / 2, d / 2, 0),
      p(-w / 2, d / 2, 0),
      p(-w / 2, -d / 2, h),
      p(w / 2, -d / 2, h),
      p(w / 2, d / 2, h),
      p(-w / 2, d / 2, h),
    ]);
    loose = {
      origin,
      w,
      d,
      h,
      label,
      opacity: focusId ? 0.55 : 1,
      tasks,
      bounds: unionBounds([box, labelRect, ...tasks.map((task) => task.bounds)]),
    };
  }

  const emptyBase =
    count === 0
      ? (() => {
          const origin = { x: canvasW / 2, y: 170 };
          const faces = boxFaces(origin, -180, -90, 0, 360, 180, 8);
          return {
            origin,
            w: 360,
            d: 180,
            h: 8,
            bounds: boundsOf([...faces.top, ...faces.right, ...faces.front]),
          };
        })()
      : null;

  return { viewBox, stages, loose, emptyBase };
}

/** 测试/调试用：判断一个矩形是否完全落在 viewBox 内。 */
export function isInside(rect: Rect, viewBox: Rect, margin = 0): boolean {
  return (
    rect.x >= viewBox.x + margin &&
    rect.y >= viewBox.y + margin &&
    rect.x + rect.w <= viewBox.x + viewBox.w - margin &&
    rect.y + rect.h <= viewBox.y + viewBox.h - margin
  );
}

/** 测试/调试用：两个矩形的重叠面积（用于“不要互相遮挡”的断言）。 */
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

/** 画布宽度常量导出给截图/测试使用。 */
export const ANATOMY_CANVAS_WIDTH = CANVAS_W_MAX;
