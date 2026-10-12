/**
 * Engineering Island 总入口（Island V2 · `docs/ISLAND_V2_SPEC.md`）。
 *
 * 定位：**当前工程状态的实时投影**。信息密度高、噪音低、默认不打扰。
 *
 * ## V2 与第一代的区别（2026-10-12，规格 §1.4）
 *
 * 第一代是「一个项目一张图纸、左右滑动翻页」，现在改为**多项目总览**：
 * 所有项目同时可见，项目多时在面板内部滚动。因此：
 * - `?sheet=<project_id>` 这个 URL 参数**已废弃**（翻页语义不存在了）；
 * - `IslandCarousel` / `IslandSheet` 随之退出一号位，只被 `IslandSheetParts`
 *   继续复用（进度条 / Agent 状态两件）。
 *
 * ## 保留的两条既有决策
 *
 * 1. **Alt+I 显隐 Island 窗口**：主窗口与面板窗口都监听，走 `desktopBridge.toggleIsland()`。
 *    隐藏式触发把手与图钉固定在阶段 2 落地（规格 §1.1–§1.3）。
 * 2. **`variant`**：`page`（网页 /island，套在 AppShell 里）与 `panel`（桌面独立窗口，
 *    无 AppShell）。两者共用同一套总览组件——网页版不渲染把手与图钉窗口控制。
 */

import { useEffect } from "react";
import { desktopBridge, isDesktop } from "@/lib/desktopBridge";
import { EngineeringIslandOverview } from "./EngineeringIslandOverview";

export function EngineeringIsland({ variant = "page" }: { variant?: "page" | "panel" }) {
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

  return <EngineeringIslandOverview variant={variant} />;
}
