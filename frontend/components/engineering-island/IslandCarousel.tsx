/**
 * 图纸轮播：左右滑动 = 翻工程图纸（计划 §19 的核心交互）。
 *
 * ## 为什么用原生 CSS scroll-snap，而不是引入轮播库
 *
 * 开工前查过（github-preflight 检索台账见 devlog）：同样场景社区的共识是
 * "不需要循环/自动播放/虚拟化时，用原生 scroll-snap 就够，库是为了这三样才存在的"。
 * 恰好本 Sprint 三样都不需要（计划 §14 明确"先不追求复杂动画"，且图纸到边缘应当停住）。
 * 原生方案还白送四样东西：键盘滚动、触控板惯性、触屏惯性、屏幕阅读器支持。
 *
 * ## 一个必须做对的方向性
 *
 * 滚动事件只**读**不**写**：我们观察用户滑到哪一页（→ 同步 URL），
 * 而不是用 JS 去驱动滚动位置。手写 transform 轨道 + 拖拽物理最容易出的 bug
 * （快滑连跳、拖完回弹打架）都源于**双向都写**。只有键盘/按钮切页时才程序化滚动，
 * 并且用 ref 记住"这次程序化滚动"，避免和刚发生的用户滑动互相触发。
 */

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  hasNextSheet,
  hasPrevSheet,
  nextSheetIndex,
  prevSheetIndex,
} from "@/features/engineering-island";

export function IslandCarousel({
  total,
  activeIndex,
  onSelect,
  children,
}: {
  total: number;
  activeIndex: number;
  onSelect: (index: number) => void;
  children: ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  /** 最近一次由「键盘/按钮」触发的程序化滚动目标，用来避免和用户滑动互相触发 */
  const programmaticRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  // 只有键盘/按钮切页才程序化滚动到目标页
  useEffect(() => {
    if (programmaticRef.current === activeIndex) {
      programmaticRef.current = null;
      return;
    }
    const viewport = viewportRef.current;
    const target = viewport?.children[activeIndex] as HTMLElement | undefined;
    if (!viewport || !target) return;
    programmaticRef.current = activeIndex;
    target.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeIndex]);

  // 用户滑动后同步页码（rAF 节流，避免 scroll 事件风暴）
  const handleScroll = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const viewport = viewportRef.current;
      if (!viewport) return;
      const width = viewport.clientWidth || 1;
      const index = Math.round(viewport.scrollLeft / width);
      if (index !== activeIndex) onSelect(index);
    });
  }, [activeIndex, onSelect]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const step = (delta: 1 | -1) => {
    const next = delta === 1 ? nextSheetIndex(activeIndex, total) : prevSheetIndex(activeIndex, total);
    if (next !== activeIndex) onSelect(next);
  };

  return (
    <div className="space-y-3">
      <div
        ref={viewportRef}
        onScroll={handleScroll}
        // 键盘可达 + 原生惯性/吸附
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label="工程图纸轮播，左右方向键翻页"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            step(1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            step(-1);
          }
        }}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-1"
        style={{ scrollPaddingInline: "0" }}
      >
        {children}
      </div>

      <div className="flex items-center justify-between bp-uppercase text-[color:var(--color-ink-3)]">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={!hasPrevSheet(activeIndex)}
          aria-label="上一张图纸"
          className="border border-[color:var(--color-rule)] px-2 py-1 transition-colors duration-[var(--duration-fast)] hover:border-[color:var(--color-ink-2)] disabled:opacity-40 disabled:hover:border-[color:var(--color-rule)]"
        >
          ← 上一页
        </button>
        <span aria-live="polite">
          {String(Math.min(activeIndex + 1, total)).padStart(2, "0")} / {String(total).padStart(2, "0")}
          {!hasPrevSheet(activeIndex) ? " · 已到首页" : ""}
          {!hasNextSheet(activeIndex, total) ? " · 已到末页" : ""}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={!hasNextSheet(activeIndex, total)}
          aria-label="下一张图纸"
          className="border border-[color:var(--color-rule)] px-2 py-1 transition-colors duration-[var(--duration-fast)] hover:border-[color:var(--color-ink-2)] disabled:opacity-40 disabled:hover:border-[color:var(--color-rule)]"
        >
          下一页 →
        </button>
      </div>
    </div>
  );
}
