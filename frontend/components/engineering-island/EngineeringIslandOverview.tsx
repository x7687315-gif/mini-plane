/**
 * 多项目总览（Island V2 · 规格 §1.4 项目范围 / §2 信息设计；
 * Island V3 追加收起态把手条，2026-10-21）。
 *
 * 与第一代（单项目轮播图纸）的根本区别：
 * - **所有项目同时可见**，不再 `?sheet=<id>` 翻页（规格：核心总览不依赖轮播）；
 * - 项目多时**面板内部纵向滚动**，窗口不无限增高、主窗口内容不跟着滚；
 * - 顺序沿用 `/projects/mine/` 的 `last_activity`（首版不做关注/排序/分组）。
 *
 * V3 的 `form` 两态（规格 §1）：
 * - `collapsed`：整个面板就是一根 360×44 的把手条（标题 + 项目数 + 图钉 + 展开），
 *   点它 / Alt+I 展开——触发把手窗口退役了，这就是入口本身；
 * - `expanded`：下面的总览（V2 的一号位，视觉重排见 V3 前端周期）。
 *
 * 滚动容器为什么用 `overscroll-contain`：桌面面板是置顶小窗，
 * 滚到底时若不收住，滚轮会继续把下层应用滚走（chained scrolling）——那是很吵的体验。
 */

import { useMemo } from "react";
import { isDesktop, trackWindowMove, trackWindowResize, type IslandForm } from "@/lib/desktopBridge";
import { useMyProjects } from "@/features/project";
import { useEngineeringOverview } from "@/features/realtime";
import { useAgentSessionStore } from "@/stores/agentSession";
import type { ProjectEngineering } from "@/types/project";
import { IslandHeader } from "./IslandHeader";
import { IslandPinButton } from "./IslandPinButton";
import { ProjectSummaryCard } from "./ProjectSummaryCard";

export function EngineeringIslandOverview({
  variant = "page",
  form = "expanded",
  pinned = false,
  onActivate,
  onTogglePin,
}: {
  variant?: "page" | "panel";
  /** V3 窗口形态：collapsed = 把手条，expanded = 完整总览 */
  form?: IslandForm;
  /** 图钉状态（EngineeringIsland 对账后下发） */
  pinned?: boolean;
  /** 点把手条 / Alt+I：切换形态（pinned 下的拒绝由 Python 状态机兜底） */
  onActivate?: () => void;
  onTogglePin?: () => void;
}) {
  const isPanel = variant === "panel";
  const { data, isLoading, isError } = useMyProjects();
  const projects = useMemo<ProjectEngineering[]>(() => data ?? [], [data]);

  // Agent 会话的实时状态来自项目级 WS（Sprint 13 的 agent.session 事件）。
  //
  // ⚠️ 阶段 1 的**临时**实时通路：只订阅**第一个**项目（最近有活动的那个）。
  // 规格 §7.2 说 Phase 4 会用一条 overview WS 覆盖全部项目；在那之前，
  // Island 页面**不能一条连接都没有** —— 2026-10-12 真机验证时抓到过这个回归：
  // 去掉项目级订阅后顶栏退回 `polling`、Agent 起会话 Island 不再自动变 RUNNING。
  // 所以这里先挂一条（与第一代默认显示第一张图纸的项目一致），Phase 4 换掉它。
  // Island V2 阶段 4：一条 overview 连接覆盖全部项目（替代阶段 1 的
  // '只订阅第一个项目'临时通路；也替代第一代的单项目通道）。
  const { live } = useEngineeringOverview(
    projects.map((p) => p.id),
    Boolean(projects[0]),
  );

  // Agent 会话的实时状态来自项目级 WS（Sprint 13 的 agent.session 事件）；
  // 阶段 4 会换成一条 overview WS 覆盖全部项目，这里的数据结构不变。
  const liveByProject = useAgentSessionStore((s) => s.byProject);

  // ── V3 收起态：整个面板就是把手条 ──────────────────────
  // 放在数据分支之前：把手条是"窗口chrome"，数据在不在它都在；
  // 计数按数据状态给诚实文案（载入中 / — / N 个项目），不留白也不虚报。
  if (form === "collapsed") {
    const countLabel = isLoading ? "载入中" : isError ? "—" : `${projects.length} 个项目`;
    return (
      <IslandDockBar
        countLabel={countLabel}
        live={live}
        isPanel={isPanel}
        pinned={pinned}
        onTogglePin={onTogglePin}
        onActivate={onActivate}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy>
        <div className="h-[28px] w-1/3 rounded-full bg-[color:var(--color-paper-2)]" />
        <div className="h-[180px] rounded-[14px] bg-[color:var(--color-paper-2)]" />
        <div className="h-[180px] rounded-[14px] bg-[color:var(--color-paper-2)]" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-[14px] border border-[color:var(--color-rule)] bg-[color:var(--color-panel)] p-4 text-[13px] text-[color:var(--color-ink-2)]">
        {/* 2026-10-17：原文案只提示"后端没运行"，但真实故障也可能是后端在跑、
            查询失败（本次事故：迁移没应用导致 mine/ 500）。文案不再替用户猜原因。 */}
        工程数据加载失败。可能是后端未启动，也可能是数据服务异常；
        可查看 runtime\launcher.log 与 backend.log 定位。
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-[14px] border border-dashed border-[color:var(--color-rule)] p-8 text-center">
        <div className="bp-uppercase text-[color:var(--color-ink-3)]">fig · empty</div>
        <p className="font-serif italic text-[22px] mt-2">还没有工程</p>
        <p className="text-[13px] text-[color:var(--color-ink-2)] mt-1">
          先创建一个项目，Island 会把它的阶段、进度、NOW / NEXT 投影在这里。
        </p>
      </div>
    );
  }

  return (
    <section
      aria-label="工程总览"
      data-testid="island-overview"
      className="rounded-[26px] border border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)] p-3 shadow-[0_1px_3px_rgba(27,26,23,0.07)]"
    >
      <div className="px-1 pb-2">
        <IslandHeader
          projectCount={projects.length}
          isPanel={isPanel}
          live={live}
          pinned={pinned}
          onTogglePin={onTogglePin}
        />
      </div>

      {/* 面板内滚动：高度由外层容器约束，这里只负责"多了就滚" */}
      <ul
        data-testid="island-project-list"
        className="max-h-[var(--island-list-max,420px)] space-y-3 overflow-y-auto overscroll-contain px-1 pb-1"
      >
        {projects.map((project, i) => (
          <li key={project.id}>
            <ProjectSummaryCard
              project={project}
              live={liveByProject[project.id] ?? null}
              index={i}
            />
          </li>
        ))}
      </ul>
      {isPanel && isDesktop() ? <ResizeHitboxes /> : null}
    </section>
  );
}

/**
 * V3 收起态把手条（360×44 窗口里的全部内容）。
 *
 * 交互契约（与 V2 的把手页对齐，只是从独立窗口变成同窗的一种形态）：
 * - 按住空白处拖动整个窗口（M3 的 pointer capture 桥接；按钮不参与，防误拖）；
 * - 点空白处 / 「展开」→ `onActivate`（切到 expanded）；
 * - 图钉只在桌面面板渲染（浏览器里没有桥，点了没反应比没有更糟）；
 * - 拖动与点击共存：pointer capture 下未拖动即普通点击（V2 把手页同款模式）。
 */
function IslandDockBar({
  countLabel,
  live,
  isPanel,
  pinned,
  onTogglePin,
  onActivate,
}: {
  countLabel: string;
  live: boolean;
  isPanel: boolean;
  pinned: boolean;
  onTogglePin?: () => void;
  onActivate?: () => void;
}) {
  const onDesktop = isPanel && isDesktop();

  const onPointerDown = (e: React.PointerEvent) => {
    if (!onDesktop || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault(); // 防止拖动时选中文本（text_select=True）
    trackWindowMove(e);
  };

  const onBarClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return; // 按钮自己管自己
    onActivate?.();
  };

  return (
    <div
      data-testid="island-dock"
      className="flex h-full select-none items-center justify-between gap-3 overflow-hidden px-3"
      onPointerDown={onPointerDown}
      onClick={onBarClick}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="font-serif italic text-[15px] leading-none whitespace-nowrap">
          Engineering Island
        </span>
        <span className="bp-uppercase whitespace-nowrap text-[color:var(--color-ink-3)]">
          {countLabel}
        </span>
        <span
          aria-hidden
          title={live ? "实时同步中" : "未连接实时通道，显示的是最近一次加载的数据"}
          className={`inline-block h-[5px] w-[5px] shrink-0 rounded-full ${
            live
              ? "bg-[color:var(--color-accent)] motion-safe:animate-pulse"
              : "border border-[color:var(--color-ink-3)]"
          }`}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {onDesktop && onTogglePin ? (
          <IslandPinButton pinned={pinned} onToggle={onTogglePin} />
        ) : null}
        <button
          type="button"
          onClick={onActivate}
          data-testid="island-expand"
          className="rounded border border-[color:var(--color-rule)] px-2.5 py-1 text-[12px] text-[color:var(--color-ink-2)] transition-colors duration-[var(--duration-fast)] hover:border-[color:var(--color-ink-2)]"
        >
          展开
        </button>
      </div>
    </div>
  );
}

/**
 * M3：面板边缘缩放热区（fixed 贴窗口四边 + 四角，6px/12px）。
 * 按下即进入 pointer capture，事件始终回到热区；桥接发位移增量，Python 侧自算边界。
 * 浏览器里不渲染（无桥，点了没反应比没有更糟）。收起态不渲染——把手条不接受缩放。
 */
const EDGES: { edge: string; className: string; cursor: string }[] = [
  { edge: "top", className: "top-0 left-2 right-2 h-[6px]", cursor: "ns-resize" },
  { edge: "bottom", className: "bottom-0 left-2 right-2 h-[6px]", cursor: "ns-resize" },
  { edge: "left", className: "left-0 top-2 bottom-2 w-[6px]", cursor: "ew-resize" },
  { edge: "right", className: "right-0 top-2 bottom-2 w-[6px]", cursor: "ew-resize" },
  { edge: "topleft", className: "top-0 left-0 h-[12px] w-[12px]", cursor: "nwse-resize" },
  { edge: "topright", className: "top-0 right-0 h-[12px] w-[12px]", cursor: "nesw-resize" },
  { edge: "bottomleft", className: "bottom-0 left-0 h-[12px] w-[12px]", cursor: "nesw-resize" },
  { edge: "bottomright", className: "bottom-0 right-0 h-[12px] w-[12px]", cursor: "nwse-resize" },
];

function ResizeHitboxes() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50" aria-hidden>
      {EDGES.map(({ edge, className, cursor }) => (
        <div
          key={edge}
          className={`pointer-events-auto absolute ${className}`}
          style={{ cursor }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            trackWindowResize(edge, e);
          }}
        />
      ))}
    </div>
  );
}
