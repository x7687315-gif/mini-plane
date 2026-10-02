"use client";

/**
 * Island 独立窗口页面（Sprint 15 · Desktop Island）
 *
 * 桌面 App 用第二个 WebView2 窗口打开这个路由（`desktop/island.py`）：
 * 无 AppShell 装饰、选中项目与主窗口共享、可用 Alt+I 或按钮收起/展开。
 */

import { EngineeringIsland } from "@/components/engineering-island";

export default function IslandPanelPage() {
  return <EngineeringIsland variant="panel" />;
}
