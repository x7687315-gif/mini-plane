/**
 * Anatomy V3 视图状态。
 *
 * 两种视图共享同一个选中 Stage：切换生长/结构不丢选择。
 * 非法 stage id 退化为当前 Stage（或第一个 Stage），不渲染不存在的选择。
 */

export type AnatomyViewMode = "growth" | "structure";

export interface AnatomyViewState {
  mode: AnatomyViewMode;
  selectedStageId: string | null;
}

export type AnatomyViewAction =
  | { type: "SET_VIEW"; mode: AnatomyViewMode }
  | { type: "SELECT_STAGE"; stageId: string }
  | { type: "SYNC"; state: AnatomyViewState };

/** 选中 Stage 必须存在；否则退回调用方给的当前 Stage / 第一个 Stage。 */
export function normalizeViewState(
  state: AnatomyViewState,
  stageIds: readonly string[],
  fallbackStageId: string | null = null,
): AnatomyViewState {
  const fallback =
    (fallbackStageId && stageIds.includes(fallbackStageId)
      ? fallbackStageId
      : stageIds[0]) ?? null;
  const selected =
    state.selectedStageId && stageIds.includes(state.selectedStageId)
      ? state.selectedStageId
      : fallback;
  if (selected === state.selectedStageId) return state;
  return { mode: state.mode, selectedStageId: selected };
}

export function transitionViewState(
  state: AnatomyViewState,
  action: AnatomyViewAction,
  stageIds: readonly string[],
  fallbackStageId: string | null = null,
): AnatomyViewState {
  switch (action.type) {
    case "SET_VIEW":
      return normalizeViewState(
        { ...state, mode: action.mode },
        stageIds,
        fallbackStageId,
      );
    case "SELECT_STAGE": {
      if (!stageIds.includes(action.stageId)) {
        return normalizeViewState(state, stageIds, fallbackStageId);
      }
      return { ...state, selectedStageId: action.stageId };
    }
    case "SYNC":
      return normalizeViewState(action.state, stageIds, fallbackStageId);
  }
}

export function selectedStageId(state: AnatomyViewState): string | null {
  return state.selectedStageId;
}

/** URL 只保存视图与选中 Stage；growth 是默认值，不写进查询串。 */
export function anatomyViewStateToQuery(
  state: AnatomyViewState,
): { mode?: "structure"; stage?: string } {
  const query: { mode?: "structure"; stage?: string } = {};
  if (state.mode === "structure") query.mode = "structure";
  if (state.selectedStageId) query.stage = state.selectedStageId;
  return query;
}

export function anatomyViewStateFromQuery(
  rawMode: string | null,
  rawStage: string | null,
  rawExpand: string | null = null,
): AnatomyViewState {
  // 兼容 V2 分享链接：?stage=…&expand=1 读作结构视图。
  return {
    mode: rawMode === "structure" || rawExpand === "1" ? "structure" : "growth",
    selectedStageId: rawStage || null,
  };
}
