/**
 * Engineering Island（Sprint 14 · PRODUCT_REFACTOR_PLAN §16–§20）
 *
 * 定位：**当前工程状态的实时投影**。不是通知、不是看板，是一个"随手瞄一眼就知道
 * 此刻工程在哪"的表面。所以信息密度高、噪音低、默认不打扰。
 *
 * 三个关键决策（都写了理由，改动前请先读）：
 *
 * 1. **只对当前选中的项目挂 WebSocket**（`useProjectRealtime`），不是全部项目。
 *    理由有二：① 全挂 = N 条常驻连接，与项目"轻量高效"的硬约束冲突；
 *    ② Sprint 15 的桌面 Island 窗口本来就是"主窗口 + 当前岛"两条连接，
 *    这里先把它走通，避免二期再返工。滑动切页会重建这条连接，这是既有设计的预期行为。
 *
 * 2. **TODAY 只取当前项目的今日日志**。`/projects/mine/` 只给 `today_logs` 计数，
 *    而图纸上要的是 `✓ 标题` 清单——所以对当前项目单发一次 `?date=today`，
 *    其余项目的日志**不预取**（切到时再取，用户不会为看不见的页面付请求）。
 *
 * 3. **当前图纸进 URL**（`?sheet=<project_id>`）。项目铁律是"URL 是唯一事实来源"：
 * 刷新、分享链接、浏览器前进后退都必须回到同一张图纸。用 id 而不是序号，
 * 是因为项目列表会变（排序按 last_activity），序号会漂移。
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMyProjects, useWorklogs } from "@/features/project";
import { useProjectRealtime } from "@/features/realtime";
import {
  clampSheetIndex,
  progressPercent,
  resolveSheetIndex,
} from "@/features/engineering-island";
import {
  ISLAND_SHEET_KEY,
  desktopBridge,
  isDesktop,
  readIslandSheet,
  writeIslandSheet,
} from "@/lib/desktopBridge";
import { useAgentSessionStore } from "@/stores/agentSession";
import type { ProjectEngineering } from "@/types/project";
import { IslandCarousel } from "./IslandCarousel";
import { IslandResting, IslandSheet, type IslandTodayData } from "./IslandSheet";

/** 只为当前项目取今日日志（决策 2）——单独一个组件，hook 才能无条件调用。 */
function ActiveSheet({
  project,
  index,
  total,
}: {
  project: ProjectEngineering;
  index: number;
  total: number;
}) {
  const { data, isLoading } = useWorklogs(project.workspace_slug, project.id, "today");
  const live = useAgentSessionStore((s) => s.byProject[project.id]);

  const today = useMemo<IslandTodayData>(
    () => ({
      // worklog 按 -date 倒序返回；图纸上 TODAY 是"今天的流水"，正序更符合阅读顺序
      titles: (data?.results ?? []).map((w) => w.title.trim()).filter(Boolean).reverse(),
      count: project.today_logs,
      loading: isLoading,
    }),
    [data, isLoading, project.today_logs],
  );

  return <IslandSheet project={project} index={index} total={total} today={today} live={live ?? null} />;
}

export function EngineeringIsland({ variant = "page" }: { variant?: "page" | "panel" }) {
  const isPanel = variant === "panel";
  const { data, isLoading, isError } = useMyProjects();
  const projects = useMemo(() => data ?? [], [data]);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeIndex = resolveSheetIndex(projects, searchParams.get("sheet"));
  const activeProject = projects[activeIndex];

  const [resting, setResting] = useState(false);

  // 是否运行在桌面 App 里。用 useSyncExternalStore 而不是 useState+useEffect：
  //   ① 桥接是 React 挂载**之后**才注入的（pywebview 广播 pywebviewready），
  //      useSyncExternalStore 的 subscribe 正好就是"去订阅那个外部对象的出现"；
  //   ② 它天然处理 SSR（第三个参数给服务端快照），也绕开了 react-hooks/set-state-in-effect
  //      ——那个规则的存在是有道理的：在 effect 里 setState 会多渲染一轮并可能闪烁。
  const desktop = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined" || isDesktop()) return () => {};
      window.addEventListener("pywebviewready", onStoreChange);
      return () => window.removeEventListener("pywebviewready", onStoreChange);
    },
    () => isDesktop(),
    () => false,
  );

  // 决策 1：只为当前项目建立 WS 连接
  useProjectRealtime(
    activeProject?.workspace_slug,
    activeProject?.id,
    Boolean(activeProject),
  );

  const select = useCallback(
    (index: number) => {
      const next = clampSheetIndex(index, projects.length);
      const project = projects[next];
      if (!project) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("sheet", project.id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      // 跨窗口同步（Sprint 15）：桌面版的 Island 是独立窗口，两个 WebView2 窗口同源同
      // profile，localStorage 的 storage 事件会跨窗口触发——比绕一圈后端轻得多。
      writeIslandSheet(project.id);
    },
    [pathname, projects, router, searchParams],
  );

  // 面板模式：首进来先听另一个窗口的当前图纸，别一打开就跳回第一张
  useEffect(() => {
    if (!isPanel || projects.length === 0) return;
    const shared = readIslandSheet();
    if (shared && shared !== activeProject?.id) {
      select(resolveSheetIndex(projects, shared));
    }
    // 只在挂载与项目集合变化时对齐一次；之后由 URL 主导
  }, [activeProject?.id, isPanel, projects, select]);

  // 另一个窗口翻页 → 本窗口跟着翻（storage 事件不会在写入方自身触发，天然无回环）
  useEffect(() => {
    if (!isPanel) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== ISLAND_SHEET_KEY || !e.newValue) return;
      if (e.newValue === activeProject?.id) return;
      select(resolveSheetIndex(projects, e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [activeProject?.id, isPanel, projects, select]);

  // 桌面版快捷键：Alt+I 显隐 Island 窗口（主窗口与面板窗口都监听）
  useEffect(() => {
    if (!isDesktop()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        desktopBridge.toggleIsland();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy>
        <div className="h-[44px] border border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)]" />
        <div className="h-[280px] border border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)]" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border border-[color:var(--color-rule)] bg-[color:var(--color-panel)] p-4 text-[13px] text-[color:var(--color-ink-2)]">
        工程数据加载失败。检查后端是否在运行（scripts\dev.cmd status）。
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="border border-dashed border-[color:var(--color-rule)] p-8 text-center">
        <div className="bp-uppercase text-[color:var(--color-ink-3)]">fig · empty</div>
        <p className="font-serif italic text-[22px] mt-2">还没有工程</p>
        <p className="text-[13px] text-[color:var(--color-ink-2)] mt-1">
          先创建一个项目，Island 会把它的阶段、进度、NOW / TODAY / NEXT 投影在这里。
        </p>
      </div>
    );
  }

  const active = projects[activeIndex]!;

  if (resting) {
    return (
      <div className="space-y-3">
        <IslandResting
          project={active}
          percent={progressPercent(active.progress)}
          onExpand={() => setResting(false)}
        />
        {projects.length > 1 ? (
          <p className="bp-hint text-center">共 {projects.length} 张图纸 · 展开后可用左右键翻页</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between bp-uppercase text-[color:var(--color-ink-3)]">
        <span>engineering island · 实时投影</span>
        <span className="flex items-center gap-2">
          {desktop ? (
            <button
              type="button"
              onClick={() => desktopBridge.toggleIsland()}
              aria-label="显示或隐藏独立 Island 窗口"
              className="border border-[color:var(--color-rule)] px-2 py-1 transition-colors duration-[var(--duration-fast)] hover:border-[color:var(--color-ink-2)]"
            >
              独立窗口
            </button>
          ) : null}
          {/* 面板窗口本身就小，"收起为最小态"在这里没有意义（隐藏窗口才是对应的动作） */}
          {!isPanel ? (
            <button
              type="button"
              onClick={() => setResting(true)}
              className="border border-[color:var(--color-rule)] px-2 py-1 transition-colors duration-[var(--duration-fast)] hover:border-[color:var(--color-ink-2)]"
            >
              收起为最小态
            </button>
          ) : null}
        </span>
      </div>

      <IslandCarousel total={projects.length} activeIndex={activeIndex} onSelect={select}>
        {projects.map((project, index) => (
          <div
            key={project.id}
            className="snap-center shrink-0 w-full"
            // 屏幕外的图纸对读屏软件隐藏：否则 Tab 会跳进看不见的卡片
            aria-hidden={index === activeIndex ? undefined : true}
          >
            {index === activeIndex ? (
              <ActiveSheet project={project} index={index} total={projects.length} />
            ) : (
              // 非当前图纸只渲染外壳（保持滚动高度稳定），数据等切到再取
              <div className="h-[320px] border border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)]" />
            )}
          </div>
        ))}
      </IslandCarousel>
    </div>
  );
}
