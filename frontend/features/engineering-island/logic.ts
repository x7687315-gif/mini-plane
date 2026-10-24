/**
 * Engineering Island 的纯逻辑（Sprint 14 · PRODUCT_REFACTOR_PLAN §16–§20；
 * Island V3 起追加窗口形态解析，2026-10-21）。
 *
 * 为什么把这几行"看起来只是算一下"的东西单独抽出来：
 * 翻页边界、进度换算、计时格式化、URL 形态解析，恰恰是**动画类 bug 最爱藏的地方**——
 * 翻过头（index 越界）、进度冒出 103%、计时在 59 秒进位错、?form= 收到垃圾值白屏。
 * 做成无副作用纯函数，就能用 `node --test` 逐条钉死（tests/unit/island-logic.test.mts）。
 */

import type { IslandForm } from "@/lib/desktopBridge";

/** Island V3 的两种窗口形态（与 desktop/config.py 的 FORMS 一一对应）。 */
export const ISLAND_FORMS: readonly IslandForm[] = ["collapsed", "expanded"];

/** M1 默认首展：解析不到合法值就展开（与 Python restore_preferences 同规则）。 */
export const DEFAULT_ISLAND_FORM: IslandForm = "expanded";

/**
 * 从 URL 查询串解析初始形态（Python 建窗时经 `?form=` 下发，见 desktop/island.py）。
 *
 * 只认枚举内的**小写**原值：大小写混写（`Collapsed`）、空串、数组式重复参数
 * （`?form=a&form=b`）一律落回默认——URL 是用户可见可篡改的，宁可退回默认
 * 也不渲染一个四不像。
 */
export const resolveIslandForm = (search: string): IslandForm => {
  let value: string | null = null;
  try {
    value = new URLSearchParams(search).get("form");
  } catch {
    return DEFAULT_ISLAND_FORM; // 畸形查询串不该让页面白屏
  }
  return value === "collapsed" || value === "expanded" ? value : DEFAULT_ISLAND_FORM;
};

/**
 * 乐观切换的预期形态（点把手条 / Alt+I 后本地先翻，Python 返回值到了再对账）。
 *
 * pinned 护栏在 Python 侧（collapse 被挡下并返回原形态），前端只管预期；
 * `pinnedRef` 为真时调用方应跳过乐观翻转，避免"闪一下又弹回"。
 */
export const optimisticForm = (form: IslandForm): IslandForm =>
  form === "expanded" ? "collapsed" : "expanded";

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
 * 进度 → 0~100 整数（DOMAIN_MODEL §3：Phase 2 起全 API 统一 0-100 量纲）。
 *
 * `progress`（mine 聚合、ProjectStage.progress）已是 0~100，这里只做边界夹取；
 * 量纲来源由响应的 `progress_source: "plan" | "tasks"` 显式标注，前端不再换算。
 */
export const progressPercent = (value: number | null | undefined): number =>
  percentValue(value);

/** 0~100 整数量纲直通，只做边界夹取。 */
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

/**
 * 长文本截断（Island V2 摘要卡片用，规格 §2 的 HOW「过长时截断，展开后可读全文」）。
 *
 * 截断是按**字符数**而不是按视觉宽度：卡片宽度由 CSS 决定，而截断只需要保证
 * "同一项目两次渲染结果一致"（否则 React 会抖动）。全角/半角混排时略保守，
 * 但不会把一行撑破 —— 真正的兜底是 CSS 的 `line-clamp`。
 */
export const truncate = (text: string | null | undefined, max: number): string => {
  const value = typeof text === "string" ? text.trim() : "";
  if (value.length === 0) return "";
  if (!Number.isFinite(max) || max <= 0) return value;
  return value.length <= max ? value : `${value.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
};

/**
 * DONE（最近完成）的三种诚实状态 —— Island V2 规格 §2「缺失时展示」。
 *
 * 数据来源优先级：最近完成任务标题（阶段 3 的 `recent_done`）> 已完成计数（现有
 * `done_tasks`，是真实统计不是推测）> 「暂无完成记录」。
 *
 * **不允许**第三种以上的"美化"：没有标题清单时不许用 Worklog 结论冒充已完成任务
 * （规格红线：Task 与 Worklog 语义不合并）。
 */
export type DoneSummary =
  | { kind: "list"; titles: readonly string[] }
  | { kind: "count"; count: number }
  | { kind: "empty" };

export const doneSummary = (
  doneCount: number | null | undefined,
  recentTitles?: readonly string[] | null,
): DoneSummary => {
  const titles = (recentTitles ?? []).map((t) => t.trim()).filter(Boolean);
  if (titles.length > 0) return { kind: "list", titles };
  const count = typeof doneCount === "number" && Number.isFinite(doneCount) ? Math.max(0, Math.trunc(doneCount)) : 0;
  return count > 0 ? { kind: "count", count } : { kind: "empty" };
};

/**
 * 缺失字段的统一文案（规格 §2 表格右列）。
 *
 * 集中成一函数而不是散在各组件里：文案是**契约**，改一处即可全局一致，
 * 也方便 E2E 用同一常量断言。
 */
export const EMPTY_STEP = "Agent 尚未报告步骤";
export const EMPTY_HOW = "尚未记录执行方法";
export const EMPTY_NEXT = "尚未安排下一步";
export const EMPTY_STAGE = "未设置阶段";
export const EMPTY_DONE = "暂无完成记录";
export const EMPTY_NOW = "当前没有进行中的任务";
