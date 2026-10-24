"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crosshair } from "@/components/ui";

/**
 * LeftRail — Phase 5 个人版（docs/refactor/ui-design/UI_TEMPLATE_V2_NOTES.md §3）。
 *
 * 减法：不再按「个人 ⇄ 团队」切换两套内容——个人四项常驻，团队收进底部的
 * 「协作」虚线区（有工作区数据才渲染，无团队数据时整块消失）。
 * 宽度仍恒定（w-44），主内容区零抖动。
 */

export interface RailWorkspace {
  slug: string;
  initial: string;
  name: string;
  role?: number; // 20 / 15 / 5
}

export interface LeftRailProps {
  workspaces: RailWorkspace[];
  /** 当前工作区 slug（个人页为 undefined） */
  current?: string;
  loading?: boolean;
}

/** 个人层的固定入口——个人路径上不出现任何协作概念。 */
const PERSONAL_LINKS: { href: string; label: string; sub: string }[] = [
  { href: "/", label: "我的工程", sub: "总览" },
  { href: "/me/issues", label: "我的工作", sub: "跨工程任务" },
  { href: "/island", label: "Island", sub: "实时投影" },
  { href: "/me", label: "设置", sub: "账户与外观" },
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

  return (
    <aside className="bp-border-r relative w-44 py-5 px-3 flex flex-col bg-[color:var(--color-paper)] flex-shrink-0">
      <div className="text-[9px] uppercase tracking-[0.26em] text-[color:var(--color-ink-3)] font-sans font-medium mb-3.5 px-1.5">
        个人
      </div>

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

      {/* 协作区：按需浮现。无工作区数据（loading/空）时整块隐藏——个人路径零团队噪音。 */}
      {workspaces.length > 0 && (
        <div className="mt-auto pt-4">
          <div className="border-t border-dashed border-[color:var(--color-rule)] pt-3 mx-0.5">
            <div className="text-[8px] uppercase tracking-[0.26em] text-[color:var(--color-ink-3)] font-sans font-medium mb-1.5 px-0.5">
              协作
            </div>
            <nav aria-label="协作工作区" className="flex flex-col gap-0.5">
              {loading
                ? [0, 1].map((i) => (
                    <div key={i} aria-hidden className="flex items-center gap-2 px-1.5 py-1">
                      <span className="w-4 h-4 border border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)]" />
                      <span className="h-[7px] w-16 bg-[color:var(--color-paper-2)]" />
                    </div>
                  ))
                : workspaces.map((w) => {
                    const on = w.slug === current;
                    return (
                      <Link
                        key={w.slug}
                        href={`/w/${w.slug}`}
                        aria-current={on ? "page" : undefined}
                        className={clsx(rowBase, on ? rowOn : rowOff)}
                      >
                        {on && <CurrentBar />}
                        <span className="leading-tight overflow-hidden min-w-0">
                          <span className="block text-[9.5px] tracking-[0.08em] text-[color:var(--color-ink-2)] font-sans font-medium truncate whitespace-nowrap">
                            {w.name}
                            {w.role != null && (
                              <span className="ml-1 text-[8px] tracking-[0.14em] text-[color:var(--color-ink-3)]">
                                {roleLabel(w.role)}
                              </span>
                            )}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
            </nav>
          </div>
        </div>
      )}

      <div className={clsx("pt-4", workspaces.length > 0 && "!pt-3")}>
        <Crosshair size={18} label="00° N · 00° E" />
      </div>
    </aside>
  );
}
