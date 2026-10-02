"use client";

/**
 * Engineering Island 路由页（Sprint 14 · PRODUCT_REFACTOR_PLAN §16–§19）
 *
 * 放在 `(protected)` 组里，自动继承 AuthGuard + AppShell + CommandPalette，
 * 本页只负责两件事：声明本屏外壳配置（无 Aside，Island 自己就是全宽表面），
 * 以及给 `useSearchParams` 包 Suspense（本仓库的硬约定，见 w/[slug]/projects/[pid]/page.tsx）。
 */

import { Suspense } from "react";
import { EngineeringIsland } from "@/components/engineering-island";
import { MeasureLine } from "@/components/ui";
import { useChrome } from "@/stores/chrome";

export default function IslandPage() {
  useChrome({ topbar: {}, hideAside: true });

  return (
    <div className="max-w-[880px]">
      <MeasureLine left="FIG · ISLAND" right="SPRINT 14 · MVP" />
      <header className="mb-5">
        <h1 className="font-serif italic text-[30px] leading-tight">Engineering Island</h1>
        <p className="text-[13px] text-[color:var(--color-ink-2)] mt-1">
          当前工程状态的实时投影：一张图纸一个项目，左右滑动翻页。
        </p>
      </header>

      <Suspense
        fallback={
          <div className="space-y-3" aria-busy>
            <div className="h-[44px] border border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)]" />
            <div className="h-[280px] border border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)]" />
          </div>
        }
      >
        <EngineeringIsland />
      </Suspense>
    </div>
  );
}
