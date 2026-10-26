/**
 * Anatomy V2 空间状态机（Phase 2）。
 *
 * 空间状态与时间状态分开；Phase 2 只有 current 时间态。
 * 非法 stage id 一律退化到 overview，避免渲染一个不存在的选择。
 */

export type SpatialState =
  | { mode: "overview" }
  | { mode: "focus"; stageId: string }
  | { mode: "exploded"; stageId: string };

export type TemporalState = { mode: "current" };

export type SpatialAction =
  | { type: "TOGGLE_STAGE"; stageId: string }
  | { type: "FOCUS_STAGE"; stageId: string }
  | { type: "EXPLODE_STAGE"; stageId: string }
  | { type: "COLLAPSE_STAGE" }
  | { type: "RESTORE_OVERVIEW" }
  | { type: "SYNC"; state: SpatialState };

export function transitionSpatialState(
  state: SpatialState,
  action: SpatialAction,
  stageIds?: readonly string[],
): SpatialState {
  const valid = (stageId: string) => !stageIds || stageIds.includes(stageId);
  switch (action.type) {
    case "TOGGLE_STAGE": {
      if (!valid(action.stageId)) return { mode: "overview" };
      const current = state.mode !== "overview" && state.stageId === action.stageId;
      return current ? { mode: "overview" } : { mode: "focus", stageId: action.stageId };
    }
    case "FOCUS_STAGE": {
      if (!valid(action.stageId)) return { mode: "overview" };
      return { mode: "focus", stageId: action.stageId };
    }
    case "EXPLODE_STAGE": {
      if (!valid(action.stageId)) return { mode: "overview" };
      return { mode: "exploded", stageId: action.stageId };
    }
    case "COLLAPSE_STAGE":
      return state.mode === "exploded" ? { mode: "focus", stageId: state.stageId } : state;
    case "RESTORE_OVERVIEW":
      return { mode: "overview" };
    case "SYNC":
      return normalizeSpatialState(action.state, stageIds ?? []);
  }
}

export function normalizeSpatialState(
  state: SpatialState,
  stageIds: readonly string[],
): SpatialState {
  if (state.mode === "overview") return state;
  return stageIds.includes(state.stageId) ? state : { mode: "overview" };
}

export function focusedStageId(state: SpatialState): string | null {
  return state.mode === "overview" ? null : state.stageId;
}

export function isExploded(state: SpatialState): boolean {
  return state.mode === "exploded";
}

/** URL 只保存空间焦点；时间历史不混入查询串。 */
export function spatialStateToQuery(state: SpatialState): { stage?: string; expand?: string } {
  if (state.mode === "overview") return {};
  return state.mode === "exploded"
    ? { stage: state.stageId, expand: "1" }
    : { stage: state.stageId };
}

export function spatialStateFromQuery(rawStage: string | null, rawExpand: string | null): SpatialState {
  if (!rawStage) return { mode: "overview" };
  return rawExpand === "1"
    ? { mode: "exploded", stageId: rawStage }
    : { mode: "focus", stageId: rawStage };
}
