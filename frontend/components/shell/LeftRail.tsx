"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crosshair } from "@/components/ui";
import { routeToMode } from "@/stores/mode-logic";

/**
 * LeftRail — 左侧竖栏（见 SCREEN_BLUEPRINTS §1.2）。
 *
 * Sprint 17 之前这里渲染的是**硬编码的假数据**（Amiya / Kal'tsit / Rhodes），
 * 点进去一律 404，而个人页还会高亮其中一条不存在的"当前工作区"。
 * 现在接真实数据，并按当前所处的层显示不同内容。
 *
 * 两条设计约束（都是 Sprint 17 拍板后刻意保留的）：
 *
 * 1. **宽度恒定不变**（w-44），个人层与团队层都占同样的宽度。
 *    `<main>` 的宽度由本栏决定，若切换时改变宽度，主内容区会横向重排一下——
 *    而"切换"是这个版本唯一的新交互，让它伴随布局抖动是坏体验。
 * 2. **层由 URL 判定**（`routeToMode`），不读 chrome store。`/workspaces` 那一页
 *    不传 `railCurrent`，用它判层会把这个团队页判成个人层。
 */

export interface RailWorkspace {
  slug: string;
  initial: string;
  name: string;
  role?: number; // 20 / 15 / 5
}

export interface LeftRailProps {
  workspaces: RailWorkspace[];
  /** 当前工作区 slug（个人层为 undefined） */
  current?: string;
  loading?: boolean;
}

/** 个人层的固定入口。个人模式没有"工作区"概念，就给这几个真正会去的页面。 */
const PERSONAL_LINKS: { href: string; label: string; sub: string }[] = [
  { href: "/", label: "我的工程", sub: "总览" },
  { href: "/me/issues", label: "我的工作", sub: "跨项目任务" },
  { href: "/island", label: "Island", sub: "实时投影" },
  { href: "/me", label: "我的设置", sub: "账户与外观" },
];

function roleLabel(r: number | undefined): string {
  if (r == null) return "";
  if (r === 20) return "管理员";
  if (r === 15) return "成员";
  if (r === 5) return "只读";
  return "";
}

/** 列表项的公共外观：左侧 2px 竖条 + 高亮底色（沿用 Sprint 0 起的统一语言）。 */
const rowBase =
  "relative flex items-center gap-2 px-1.5 py-1.5 transition-colors duration-[var(--duration-fast)]";
const rowOn = "bg-[color:var(--color-accent-soft)]";
const rowOff = "hover:bg-[color:var(--color-paper-2)]";

function CurrentBar() {
  return (
    <span
      className="absolute left-0 top-1 bottom-1 w-[2px] bg-[color:var(--color-accent)]"
      aria-hidden
    />
  );
}

export function LeftRail({ workspaces, current, loading = false }: LeftRailProps) {
  const pathname = usePathname();
  const isTeam = routeToMode(pathname) === "team";

  return (
    <aside className="bp-border-r relative w-44 py-5 px-3 flex flex-col bg-[color:var(--color-paper)] flex-shrink-0">
      <div className="text-[9px] uppercase tracking-[0.26em] text-[color:var(--color-ink-3)] font-sans font-medium mb-3.5 px-1.5">
        {isTeam ? "工作区" : "个人"}
      </div>

      {isTeam ? (
        <nav aria-label="工作区" className="flex flex-col gap-1">
          {loading ? (
            // 骨架行（不用 spinner：DESIGN.md §10 红线）
            <>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  aria-hidden
                  className="flex items-center gap-2 px-1.5 py-1.5"
                >
                  <span className="w-5 h-5 border border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)]" />
                  <span className="h-[8px] w-20 bg-[color:var(--color-paper-2)]" />
                </div>
              ))}
            </>
          ) : workspaces.length === 0 ? (
            // 零工作区：给创建入口，而不是留一片空白（空白看着像加载失败）
            <div className="px-1.5 text-[11px] leading-[1.6] text-[color:var(--color-ink-3)]">
              还没有工作区
              <Link
                href="/workspaces"
                className="mt-1 block text-[color:var(--color-accent)] hover:underline"
              >
                去创建一个 →
              </Link>
            </div>
          ) : (
            workspaces.map((w) => {
              const on = w.slug === current;
              return (
                <Link
                  key={w.slug}
                  href={`/w/${w.slug}`}
                  aria-current={on ? "page" : undefined}
                  className={clsx(rowBase, on ? rowOn : rowOff)}
                >
                  {on && <CurrentBar />}
                  <span
                    className="w-5 h-5 inline-flex items-center justify-center border border-[color:var(--color-rule)] font-serif italic text-[12px] text-[color:var(--color-ink-2)] flex-shrink-0"
                    aria-hidden
                  >
                    {w.initial}
                  </span>
                  <span className="leading-tight overflow-hidden min-w-0">
                    <span className="block text-[10px] tracking-[0.1em] uppercase text-[color:var(--color-ink)] font-sans font-medium truncate whitespace-nowrap">
                      {w.name}
                    </span>
                    {w.role != null && (
                      <span className="block text-[8px] tracking-[0.16em] text-[color:var(--color-ink-3)] font-sans font-medium whitespace-nowrap">
                        {roleLabel(w.role)}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })
          )}
        </nav>
      ) : (
        <nav aria-label="个人" className="flex flex-col gap-1">
          {PERSONAL_LINKS.map((l) => {
            const on = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={on ? "page" : undefined}
                className={clsx(rowBase, on ? rowOn : rowOff)}
              >
                {on && <CurrentBar />}
                <span className="leading-tight overflow-hidden min-w-0">
                  <span className="block text-[10px] tracking-[0.1em] text-[color:var(--color-ink)] font-sans font-medium truncate whitespace-nowrap">
                    {l.label}
                  </span>
                  <span className="block text-[8px] tracking-[0.16em] text-[color:var(--color-ink-3)] font-sans whitespace-nowrap">
                    {l.sub}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>
      )}

      <div className="mt-auto pt-4">
        <Crosshair size={18} label="00° N · 00° E" />
      </div>
    </aside>
  );
}
