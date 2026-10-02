/**
 * Engineering Island 的纯逻辑（Sprint 14 · PRODUCT_REFACTOR_PLAN §16–§20）。
 *
 * 为什么把这几行"看起来只是算一下"的东西单独抽出来：
 * 翻页边界、进度换算、计时格式化，恰恰是**动画类 bug 最爱藏的地方**——
 * 翻过头（index 越界）、进度冒出 103%、计时在 59 秒进位错。
 * 做成无副作用纯函数，就能用 `node --test` 逐条钉死（tests/unit/island-logic.test.mts）。
 */

/** Island 一页 = 一个 Project（计划 §19：左右滑动是「翻工程图纸」，不是切任务）。 */
export const clampSheetIndex = (index: number, total: number): number => {
  if (total <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), total - 1);
};

/**
 * 下一张图纸。**不做循环**（计划未要求环回）。
 *
 * 决定性理由不是省事，而是**方位感**：环回时用户滑到边缘会以为"还有更多"，
 * 于是反复滑；停在边缘 + 视觉提示（按钮置灰）才是"这是边界"的诚实表达。
 */
export const nextSheetIndex = (index: number, total: number): number =>
  clampSheetIndex(index + 1, total);

/** 上一张图纸（同样不循环）。 */
export const prevSheetIndex = (index: number, total: number): number =>
  clampSheetIndex(index - 1, total);

export const hasPrevSheet = (index: number): boolean => index > 0;

export const hasNextSheet = (index: number, total: number): boolean =>
  total > 0 && index < total - 1;

/**
 * 进度：0~1 小数（`GET /projects/mine/` 的 `progress`）→ 0~100 整数。
 *
 * ⚠️ 后端**两个端点的量纲不同**，所以这里只认 0~1 这一种，不做"大于 1 就当百分数"
 * 的猜测——那个魔法阈值在 1 < x ≤ 100 区间天然歧义（1.03 到底是 1.03% 还是 103%？），
 * 而 progress 条的宽度宁可就高不就低地猜错。
 * 需要 0~100 量纲（plan 的 `ProjectStage.progress`）时用下面的 `percentValue`。
 */
export const progressPercent = (ratio: number | null | undefined): number => {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return 0;
  return Math.min(100, Math.max(0, Math.round(ratio * 100)));
};

/** 0~100 整数量纲直通（ProjectStage.progress），只做边界夹取。 */
export const percentValue = (value: number | null | undefined): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
};

/**
 * Agent 运行时长 → `MM:SS`（超过一小时用 `H:MM:SS`）。
 *
 * 后端的 `elapsed_seconds` 只在事件到达那一刻算一次，running 期间由前端每秒续秒，
 * 所以这里要能吃住"被连续调用、跨分钟边界"的情况（不能有跨小时的 60 进位错）。
 */
export const formatElapsed = (seconds: number | null | undefined): string => {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

/** 图纸页码 → `SHEET 03 / 08`（工程图纸的 REV/SHEET 标注语言）。 */
export const sheetPageLabel = (index: number, total: number): string => {
  const safeTotal = Math.max(0, Math.trunc(total));
  if (safeTotal === 0) return "SHEET 00 / 00";
  const page = clampSheetIndex(index, safeTotal) + 1;
  return `SHEET ${String(page).padStart(2, "0")} / ${String(safeTotal).padStart(2, "0")}`;
};

/**
 * 由 URL 里的 project id 反解页码。
 *
 * URL 是唯一事实来源（项目铁律），所以刷新/分享链接必须能回到同一张图纸：
 * id 找不到（项目被删/无权限）时回落到第 0 张，而不是报错或空白。
 */
export const resolveSheetIndex = <T extends { id: string }>(
  projects: readonly T[],
  projectId: string | null | undefined,
): number => {
  if (!projectId) return 0;
  const found = projects.findIndex((p) => p.id === projectId);
  return found >= 0 ? found : 0;
};

/** 空值统一显示 `—`（图纸上表示"没有"，不用空白，避免误读成排版漏了）。 */
export const orDash = (value: string | null | undefined): string => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : "—";
};
