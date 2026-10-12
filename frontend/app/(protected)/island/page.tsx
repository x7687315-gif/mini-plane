"use client";

/**
 * Engineering Island 路由页（Island V2 · `docs/ISLAND_V2_SPEC.md`）
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
      <MeasureLine left="FIG · ISLAND" right="V2 · 多项目总览" />
      <header className="mb-5">
        <h1 className="font-serif italic text-[30px] leading-tight">Engineering Island</h1>
        <p className="text-[13px] text-[color:var(--color-ink-2)] mt-1">
          当前工程状态的实时投影：所有项目同时可见，进度 / 阶段 / NOW / NEXT / AGENT 一屏扫读。
        </p>
      </header>

      <Suspense
        fallback={
          <div className="space-y-3" aria-busy>
            <div className="h-[44px] rounded-[14px] bg-[color:var(--color-paper-2)]" />
            <div className="h-[280px] rounded-[14px] bg-[color:var(--color-paper-2)]" />
          </div>
        }
      >
        <EngineeringIsland />
      </Suspense>
    </div>
  );
}
